// =============================================
// 프로젝트 대디 — 서비스 워커 v3
// 오프라인에서도 앱이 작동하도록 파일을 캐싱합니다
// =============================================

const CACHE_NAME = 'project-dad-v3';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/app.js',
  './js/storage.js',
  './js/map.js',
  './js/camera.js',
  './data/dataset.json',
  './data/korea-map.svg',
  './icons/placeholder.svg',
  './icons/icon.svg'
];

// 설치: 모든 파일을 캐시에 저장
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 파일 캐싱 시작');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 활성화: 구버전 캐시 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] 구버전 캐시 삭제:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// 네트워크 요청: 캐시 우선 → 없으면 네트워크
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});