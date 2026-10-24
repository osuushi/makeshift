export interface BrowserDrawing {
  id: string;
  name: string;
  modified: number;
  bytes: Uint8Array;
}

/** Resolve writes only after commit, including quota/transaction failures. */
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("makeshift-drawings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drawings", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Makeshift tabs and try again."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction("drawings", mode);
      const request = operation(tx.objectStore("drawings"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Browser save failed."));
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export const browserLibrary = {
  async list(): Promise<BrowserDrawing[]> {
    const entries = await transaction<BrowserDrawing[]>("readonly", (store) => store.getAll());
    return entries.sort((a, b) => b.modified - a.modified);
  },
  async save(drawing: BrowserDrawing): Promise<void> {
    await transaction("readwrite", (store) => store.put(drawing));
  },
};
