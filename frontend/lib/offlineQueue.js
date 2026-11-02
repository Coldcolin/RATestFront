// IndexedDB store for offline onboarding drafts. Only draft step data and the last-known profile are
// kept on the device, and everything is wiped on logout or when a different user signs in.
const DB_NAME = 'executive-portal';
const DRAFTS = 'drafts'; // keyPath: step — the latest unsynced save per step
const CACHE = 'cache'; // last-known profile and user, so the wizard can open offline

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DRAFTS, { keyPath: 'step' });
      req.result.createObjectStore(CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result);
    t.onerror = () => reject(t.error);
  });
}

/** Queues a step save. A newer save of the same step replaces the older one. */
export function enqueueDraft(step, data) {
  const entry = { step, data, idempotencyKey: crypto.randomUUID(), clientSavedAt: new Date().toISOString() };
  return tx(DRAFTS, 'readwrite', (s) => s.put(entry)).then(() => entry);
}

export const pendingDrafts = () => tx(DRAFTS, 'readonly', (s) => s.getAll());

// Only remove the exact entry we sent, so a save queued during replay is not lost.
async function removeDraft(entry) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(DRAFTS, 'readwrite');
    const store = t.objectStore(DRAFTS);
    const get = store.get(entry.step);
    get.onsuccess = () => {
      if (get.result?.idempotencyKey === entry.idempotencyKey) store.delete(entry.step);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export const cacheGet = (key) => tx(CACHE, 'readonly', (s) => s.get(key));
export const cacheSet = (key, value) => tx(CACHE, 'readwrite', (s) => s.put(value, key));
export const clearLocalData = () => Promise.all([tx(DRAFTS, 'readwrite', (s) => s.clear()), tx(CACHE, 'readwrite', (s) => s.clear())]);

/**
 * Replays queued saves in step order. Network failure stops the replay (try again later); a 401
 * keeps the queue until the user signs in; a 4xx from the server (e.g. validation) drops that entry
 * and reports it, because retrying would fail the same way forever.
 */
export async function replayDrafts(send) {
  const entries = (await pendingDrafts()).sort((a, b) => a.step - b.step);
  const rejected = [];
  let last = null;
  for (const entry of entries) {
    try {
      last = await send(entry);
      await removeDraft(entry);
    } catch (err) {
      if (err.code === 'NETWORK' || err.status === 401 || err.status >= 500) return { done: false, rejected, last, error: err };
      rejected.push({ step: entry.step, message: err.message });
      await removeDraft(entry);
    }
  }
  return { done: true, rejected, last };
}
