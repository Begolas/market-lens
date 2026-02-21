const DB_NAME = "marketlens-db";
const DB_VERSION = 1;
const STORES = { candles: "candles", symbols: "symbols", meta: "meta" };

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.candles)) db.createObjectStore(STORES.candles, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORES.symbols)) db.createObjectStore(STORES.symbols, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    Promise.resolve(fn(store))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      })
      .catch(reject);
  });
}

export const idb = {
  async get(store, key) {
    return withStore(store, "readonly", (s) => reqToPromise(s.get(key)));
  },
  async set(store, value) {
    return withStore(store, "readwrite", (s) => reqToPromise(s.put(value)));
  },
  async del(store, key) {
    return withStore(store, "readwrite", (s) => reqToPromise(s.delete(key)));
  },
  async clear(store) {
    return withStore(store, "readwrite", (s) => reqToPromise(s.clear()));
  },
  stores: STORES,
};
