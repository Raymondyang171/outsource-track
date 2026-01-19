import { useSyncExternalStore } from "react";
import { getDb, retry } from "./init-dexie";

function subscribe(callback) {
  const db = getDb();
  if (!db || typeof db.on !== "function") {
    return () => {};
  }
  db.on("changes", callback);
  return () => db.off("changes", callback);
}

const getSnapshot = () => {
  const db = getDb();
  if (!db) return [];
  return db.uploads.toArray();
};

export function useOutbox() {
  const outbox = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const addToOutbox = async (item) => {
    const db = getDb();
    if (!db) return;
    const id = await db.uploads.add({
      ...item,
      status: "pending",
      retryCount: 0,
      lastAttemptedAt: null,
    });
    await retry(id);
  };

  return { outbox, addToOutbox };
}
