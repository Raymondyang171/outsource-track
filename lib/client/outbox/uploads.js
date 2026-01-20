import Dexie from "dexie";
import { useEffect, useSyncExternalStore } from "react";

const MAX_BACKOFF_SECONDS = 300;
const RETRY_INTERVAL_MS = 30000;

let dbInstance = null;
const EMPTY_SNAPSHOT = [];
let cachedSnapshot = EMPTY_SNAPSHOT;
let snapshotInFlight = false;
let reauthRequired = false;
const listeners = new Set();

function getDb() {
  if (typeof window === "undefined") return null;
  if (dbInstance) return dbInstance;
  const db = new Dexie("client_outbox");
  db.version(1).stores({
    uploads: "++id, status, retryCount, lastAttemptedAt, createdAt, taskId, device_id, idempotency_key",
  });
  dbInstance = db;
  return dbInstance;
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

async function refreshSnapshot() {
  const db = getDb();
  if (!db || snapshotInFlight) return;
  snapshotInFlight = true;
  try {
    const items = await db.table("uploads").toArray();
    cachedSnapshot = items && items.length ? items : EMPTY_SNAPSHOT;
  } finally {
    snapshotInFlight = false;
    notifyListeners();
  }
}

function subscribe(callback) {
  listeners.add(callback);
  const db = getDb();
  if (!db || typeof db.on !== "function" || typeof db.off !== "function") {
    return () => {
      listeners.delete(callback);
    };
  }
  const handler = () => {
    void refreshSnapshot();
  };
  db.on("changes", handler);
  void refreshSnapshot();
  return () => {
    listeners.delete(callback);
    db.off("changes", handler);
  };
}

const getSnapshot = () => cachedSnapshot;
const getServerSnapshot = () => EMPTY_SNAPSHOT;

function secondsSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = typeof value === "string" ? Date.parse(value) : value instanceof Date ? value.getTime() : NaN;
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - time) / 1000);
}

function computeBackoffSeconds(retryCount) {
  const base = Math.pow(2, Math.min(Math.max(retryCount || 0, 0), 8));
  return Math.min(base, MAX_BACKOFF_SECONDS);
}

async function processUpload(item) {
  if (!item) return;
  const db = getDb();
  if (!db) return;
  if (reauthRequired) {
    await db.table("uploads").update(item.id, {
      status: "needs_reauth",
      lastAttemptedAt: new Date().toISOString(),
    });
    return;
  }

  const formData = new FormData();
  formData.append("task_id", item.taskId);
  if (item.displayName) {
    formData.append("display_name", item.displayName);
  }
  formData.append("file", item.file);
  formData.append("device_id", item.device_id);
  formData.append("idempotency_key", item.idempotency_key);

  try {
    const res = await fetch("/api/drive/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await db.table("uploads").delete(item.id);
      return;
    }

    const rawText = await res.text();
    let payload = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }
    if (payload?.code === "NEED_REAUTH") {
      reauthRequired = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("drive-reauth-required", { detail: payload }));
      }
      await db.table("uploads").update(item.id, {
        status: "needs_reauth",
        lastAttemptedAt: new Date().toISOString(),
      });
      return;
    }

    await db.table("uploads").update(item.id, {
      status: "failed",
      retryCount: (item.retryCount || 0) + 1,
      lastAttemptedAt: new Date().toISOString(),
    });
  } catch (error) {
    await db.table("uploads").update(item.id, {
      status: "failed",
      retryCount: (item.retryCount || 0) + 1,
      lastAttemptedAt: new Date().toISOString(),
    });
  }
}

async function shouldRetry(item) {
  if (!item) return false;
  if (item.status === "pending") return true;
  if (item.status === "needs_reauth") return false;
  if (item.status !== "failed") return false;

  const backoffSeconds = computeBackoffSeconds(item.retryCount || 0);
  return secondsSince(item.lastAttemptedAt) >= backoffSeconds;
}

async function retryPendingUploads() {
  const db = getDb();
  if (!db) return;
  if (reauthRequired) return;
  const items = await db.table("uploads").toArray();
  for (const item of items) {
    if (await shouldRetry(item)) {
      await processUpload(item);
    }
  }
}

async function resetReauthRequired() {
  reauthRequired = false;
  const db = getDb();
  if (!db) return;
  const blocked = await db.table("uploads").where("status").equals("needs_reauth").toArray();
  for (const item of blocked) {
    await db.table("uploads").update(item.id, {
      status: "pending",
      lastAttemptedAt: null,
    });
  }
}

let started = false;

function startProcessor() {
  if (started || typeof window === "undefined") return;
  started = true;

  const trigger = () => {
    if (!navigator.onLine) return;
    void retryPendingUploads();
  };

  window.addEventListener("online", trigger);
  window.setInterval(trigger, RETRY_INTERVAL_MS);
  trigger();
}

export function useUploadOutbox() {
  const outbox = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    startProcessor();
    void refreshSnapshot();
  }, []);

  const addToOutbox = async (item) => {
    const db = getDb();
    if (!db) return;
    const id = await db.table("uploads").add({
      ...item,
      status: "pending",
      retryCount: 0,
      lastAttemptedAt: null,
      createdAt: new Date().toISOString(),
    });

    await processUpload({ ...item, id });
  };

  return {
    outbox,
    addToOutbox,
    retryPendingUploads,
    resetReauthRequired,
  };
}
