// Stockage local (IndexedDB). Tout reste dans le navigateur de l'appareil.
const DB = (() => {
  const NAME = "forme", VERSION = 1;
  const STORES = {
    foods: { keyPath: "id", autoIncrement: true, indexes: ["source", "barcode"] },
    recipes: { keyPath: "id", autoIncrement: true },
    entries: { keyPath: "id", autoIncrement: true, indexes: ["date"] },     // aliments consommés
    workouts: { keyPath: "id", autoIncrement: true, indexes: ["date", "type"] },
    body: { keyPath: "date" },                                              // poids, % graisse, mensurations
    settings: { keyPath: "key" },
  };
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: !!def.autoIncrement });
          (def.indexes || []).forEach((i) => store.createIndex(i, i));
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  }

  return {
    get: (store, key) => tx(store, "readonly", (s) => s.get(key)),
    all: (store) => tx(store, "readonly", (s) => s.getAll()),
    byIndex: (store, index, value) => tx(store, "readonly", (s) => s.index(index).getAll(value)),
    put: (store, value) => tx(store, "readwrite", (s) => s.put(value)),
    del: (store, key) => tx(store, "readwrite", (s) => s.delete(key)),
    clear: (store) => tx(store, "readwrite", (s) => s.clear()),
    bulkPut: (store, values) => tx(store, "readwrite", (s) => { values.forEach((v) => s.put(v)); }),
    count: (store) => tx(store, "readonly", (s) => s.count()),
    async setting(key, fallback) {
      const row = await this.get("settings", key);
      return row ? row.value : fallback;
    },
    saveSetting: (key, value) => tx("settings", "readwrite", (s) => s.put({ key, value })),
    async exportAll() {
      const out = { app: "forme", version: VERSION, exportedAt: new Date().toISOString() };
      for (const name of Object.keys(STORES)) out[name] = await this.all(name);
      return out;
    },
    async importAll(data) {
      for (const name of Object.keys(STORES)) {
        if (!Array.isArray(data[name])) continue;
        await this.clear(name);
        await this.bulkPut(name, data[name]);
      }
    },
  };
})();
