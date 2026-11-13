/**
 * 近視管理系統 - IndexedDB 本機資料庫服務模組
 */

const DB_NAME = "MyopiaCareDB";
const DB_VERSION = 1;

let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        console.log(`儲存空間持久化狀態: ${persistent ? "已鎖定" : "預設"}`);
      });
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("customers")) {
        const customerStore = db.createObjectStore("customers", { keyPath: "識別碼" });
        customerStore.createIndex("idx_name", "姓名", { unique: false });
        customerStore.createIndex("idx_lens", "片種", { unique: false });
        customerStore.createIndex("idx_doctor", "醫師", { unique: false });
      }

      if (!db.objectStoreNames.contains("visits")) {
        const visitStore = db.createObjectStore("visits", { keyPath: "id", autoIncrement: true });
        visitStore.createIndex("idx_customer_id", "識別碼", { unique: false });
        visitStore.createIndex("idx_visit_date", "回診日期", { unique: false });
      }

      if (!db.objectStoreNames.contains("refractions")) {
        const refractionStore = db.createObjectStore("refractions", { keyPath: "id", autoIncrement: true });
        refractionStore.createIndex("idx_customer_id", "識別碼", { unique: false });
      }

      if (!db.objectStoreNames.contains("images")) {
        const imageStore = db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
        imageStore.createIndex("idx_customer_id", "識別碼", { unique: false });
      }

      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "mutationId" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(`IndexedDB 開啟失敗: ${event.target.error}`);
    };
  });
}

function bulkPutItems(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return reject("資料庫未初始化");
    const transaction = dbInstance.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    items.forEach((item) => {
      store.put(item);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

function getVisitsByCustomerId(customerId) {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("visits", "readonly");
    const store = transaction.objectStore("visits");
    const index = store.index("idx_customer_id");
    const request = index.getAll(IDBKeyRange.only(customerId));

    request.onsuccess = () => {
      const sorted = (request.result || []).sort((a, b) => new Date(a["回診日期"]) - new Date(b["回診日期"]));
      resolve(sorted);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function getRefractionsByCustomerId(customerId) {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("refractions", "readonly");
    const store = transaction.objectStore("refractions");
    const index = store.index("idx_customer_id");
    const request = index.getAll(IDBKeyRange.only(customerId));

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllCustomers() {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("customers", "readonly");
    const store = transaction.objectStore("customers");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function insertLocalVisit(visitData) {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("visits", "readwrite");
    const store = transaction.objectStore("visits");
    const request = store.add(visitData);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function enqueueOutbox(mutation) {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    store.put(mutation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

function getPendingOutbox() {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("outbox", "readonly");
    const store = transaction.objectStore("outbox");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function removeOutboxItem(mutationId) {
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    store.delete(mutationId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}
