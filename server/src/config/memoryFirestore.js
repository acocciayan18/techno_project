// Minimal in-memory implementation of the subset of the Firestore API this project uses.
// It lets the whole system run and be tested with zero external setup (DB_MODE=memory).
// It is NOT a full Firestore — only the methods the services below call are supported:
//   collection(name).doc(id?) , .get() , .where(field,op,value) (op '==' only)
//   doc.get()/.set(data,{merge})/.update(data)/.delete() , doc.id
//   db.runTransaction(fn) with tx.get/set/update/delete
//   FieldValue.increment(n) / FieldValue.serverTimestamp()
// Data lives only in process memory and is cleared on restart.

const INCREMENT = Symbol('increment');
const SERVER_TS = Symbol('serverTimestamp');

export const FieldValue = {
  increment: (n) => ({ __sentinel: INCREMENT, n }),
  serverTimestamp: () => ({ __sentinel: SERVER_TS }),
};

function genId() {
  return 'id_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function deepClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function resolveSentinels(data, existing = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__sentinel === INCREMENT) {
      out[k] = (typeof existing[k] === 'number' ? existing[k] : 0) + v.n;
    } else if (v && v.__sentinel === SERVER_TS) {
      out[k] = new Date().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

class DocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() {
    return deepClone(this._data);
  }
}

class DocRef {
  constructor(store, collection, id) {
    this._store = store;
    this._collection = collection;
    this.id = id;
  }
  _bucket() {
    if (!this._store[this._collection]) this._store[this._collection] = {};
    return this._store[this._collection];
  }
  async get() {
    const raw = this._bucket()[this.id];
    return new DocSnapshot(this.id, raw === undefined ? undefined : deepClone(raw));
  }
  async set(data, opts = {}) {
    const bucket = this._bucket();
    const existing = opts.merge ? bucket[this.id] || {} : {};
    const resolved = resolveSentinels(data, existing);
    bucket[this.id] = opts.merge ? { ...existing, ...resolved } : resolved;
    return this;
  }
  async update(data) {
    const bucket = this._bucket();
    if (bucket[this.id] === undefined) {
      const err = new Error('No document to update: ' + this.id);
      err.code = 5;
      throw err;
    }
    bucket[this.id] = { ...bucket[this.id], ...resolveSentinels(data, bucket[this.id]) };
    return this;
  }
  async delete() {
    delete this._bucket()[this.id];
    return this;
  }
}

class Query {
  constructor(store, collection, filters = []) {
    this._store = store;
    this._collection = collection;
    this._filters = filters;
  }
  where(field, op, value) {
    if (op !== '==') throw new Error('memoryFirestore only supports "==" in where()');
    return new Query(this._store, this._collection, [...this._filters, { field, value }]);
  }
  async get() {
    const bucket = this._store[this._collection] || {};
    const docs = Object.entries(bucket)
      .filter(([, data]) => this._filters.every((f) => data[f.field] === f.value))
      .map(([id, data]) => new DocSnapshot(id, deepClone(data)));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb) => docs.forEach(cb) };
  }
}

class CollectionRef extends Query {
  doc(id) {
    return new DocRef(this._store, this._collection, id || genId());
  }
}

class MemoryFirestore {
  constructor() {
    this._store = {};
  }
  collection(name) {
    return new CollectionRef(this._store, name);
  }
  async runTransaction(fn) {
    // Single-threaded process: sequential execution is effectively atomic for our use.
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, data, opts) => {
        ref.set(data, opts);
        return tx;
      },
      update: (ref, data) => {
        ref.update(data);
        return tx;
      },
      delete: (ref) => {
        ref.delete();
        return tx;
      },
    };
    return fn(tx);
  }
}

export function createMemoryFirestore() {
  return new MemoryFirestore();
}
