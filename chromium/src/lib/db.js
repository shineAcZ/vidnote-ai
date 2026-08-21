const DB_NAME = "vidnote-ai";
const DB_VERSION = 1;
const STORES = ["videos", "notes", "jobs", "prompts"];

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function transact(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = callback(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("本地数据操作已中止"));
  });
}

export function put(storeName, value) {
  return transact(storeName, "readwrite", (store) => store.put(value));
}

export function get(storeName, id) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDatabase();
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export function getAll(storeName) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDatabase();
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export function remove(storeName, id) {
  return transact(storeName, "readwrite", (store) => store.delete(id));
}

export async function latestForVideo(storeName, videoKey) {
  const items = await getAll(storeName);
  return items
    .filter((item) => item.videoKey === videoKey)
    .sort((a, b) => Number(b.updatedAt || b.createdAt) - Number(a.updatedAt || a.createdAt))[0] || null;
}
