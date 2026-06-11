// =============================================
// storage.js — 저장소 모듈
// LocalStorage: 방문 여부 (visited_{id}: "true")
// IndexedDB   : 사진 Blob (LocalStorage 5MB 초과 방지)
// =============================================

const Storage = (() => {

  // ── LocalStorage: 방문 여부 ──────────────────

  function setVisited(id) {
    localStorage.setItem(`visited_${id}`, 'true');
  }

  function isVisited(id) {
    return localStorage.getItem(`visited_${id}`) === 'true';
  }

  function countVisited(spots) {
    return spots.filter(s => isVisited(s.tourist_id)).length;
  }

  // ── IndexedDB: 사진 저장 ─────────────────────

  const DB_NAME = 'project-dad-photos';
  const DB_VERSION = 1;
  const STORE_NAME = 'photos';
  let _db = null;

  function initDB() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(_db); };

      req.onerror = e => {
        console.error('[Storage] IndexedDB 초기화 실패:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  async function savePhoto(id, blob) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, blob, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function getPhotoURL(id) {
    const db = await initDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE_NAME, 'readonly')
                    .objectStore(STORE_NAME).get(id);
      req.onsuccess = e => {
        const record = e.target.result;
        resolve(record?.blob ? URL.createObjectURL(record.blob) : null);
      };
      req.onerror = () => resolve(null);
    });
  }

  // 화면 전환 시 메모리 누수 방지 — app.js에서 호출
  function revokeURL(url) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  return {
    setVisited,
    isVisited,
    countVisited,
    initDB,
    savePhoto,
    getPhotoURL,
    revokeURL
  };
})();