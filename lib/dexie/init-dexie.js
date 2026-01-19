import Dexie from "dexie";
import { getDeviceId } from "../device";

let dbInstance = null;

export function getDb() {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  if (dbInstance) return dbInstance;
  const db = new Dexie("outbox");
  db.version(2).stores({
    uploads: "++id, taskId, file, displayName, device_id, idempotency_key, status, retryCount, lastAttemptedAt",
    requests: "++id, url, method, headers, body, idempotency_key, device_id, status, retryCount, lastAttemptedAt",
  });
  dbInstance = db;
  return dbInstance;
}

export async function retryRequest(id) {
  const db = getDb();
  if (!db) return;
  const item = await db.requests.get(id);

  if (!item) {
    return;
  }

  try {
    const res = await fetch(item.url, {
      method: item.method,
      headers: item.headers,
      body: item.body,
    });

    if (res.ok) {
      await db.requests.delete(item.id);
    } else {
      await db.requests.update(item.id, {
        retryCount: (item.retryCount || 0) + 1,
        lastAttemptedAt: new Date(),
        status: 'failed',
      });
    }
  } catch (error) {
    await db.requests.update(item.id, {
      retryCount: (item.retryCount || 0) + 1,
      lastAttemptedAt: new Date(),
      status: 'failed',
    });
  }
}

// Keep the old retry logic for file uploads
export async function retry(id) {
  const db = getDb();
  if (!db) return;
  const item = await db.uploads.get(id);

  if (!item) {
    return;
  }

  const formData = new FormData();
  formData.append("task_id", item.taskId);
  formData.append("display_name", item.displayName);
  formData.append("file", item.file);
  formData.append("device_id", item.device_id);
  formData.append("idempotency_key", item.idempotency_key);

  try {
    const res = await fetch("/api/drive/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await db.uploads.delete(item.id);
    } else {
      await db.uploads.update(item.id, {
        retryCount: (item.retryCount || 0) + 1,
        lastAttemptedAt: new Date(),
      });
    }
  } catch (error) {
    await db.uploads.update(item.id, {
      retryCount: (item.retryCount || 0) + 1,
      lastAttemptedAt: new Date(),
    });
  }
}
