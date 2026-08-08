import type { OrderItem } from '../types';

// Durable local queue for POS actions that couldn't reach the server —
// survives a page reload, unlike an in-memory queue, since the whole point
// is riding out a connectivity gap that might outlast the current tab.
const DB_NAME = 'rms-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'actions';

export type QueuedAction =
  | {
      id: string;
      type: 'saveOrder';
      tableId: string;
      tableNumber: number;
      items: OrderItem[];
      timestamp: number;
    }
  | {
      id: string;
      type: 'payOrder';
      tableId: string;
      tableNumber: number;
      paymentMethod: string;
      timestamp: number;
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueAction(action: QueuedAction): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Oldest first — replaying in the order actions actually happened is what
// makes "most recent edit wins" fall naturally out of the existing
// upsert-based saveOrder endpoint, with no extra merge logic needed here.
export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as QueuedAction[]).sort((a, b) => a.timestamp - b.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function removeAction(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
