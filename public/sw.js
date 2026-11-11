// 오프라인 실행용 서비스 워커. 빌드할 때 __BUILD__가 빌드 시각으로 바뀌어(vite.config.js) 배포마다 새로 설치된다.
// 설치할 때 precache.json(빌드가 만든 전체 파일 목록)을 모두 받아 두므로, 한 번 연 뒤에는 인터넷 없이도 열린다.
const CACHE = 'nutslide-__BUILD__';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let files = ['./'];
    try { files = files.concat(await (await fetch('precache.json', { cache: 'no-store' })).json()); } catch { /* 목록이 없으면 첫 화면만 */ }
    await Promise.all(files.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {}))); // 하나가 실패해도 나머지는 담는다
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key); // 예전 배포의 파일은 지운다
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      // 첫 화면은 인터넷이 되면 항상 새것을, 안 되면 담아 둔 것을 쓴다
      try { const fresh = await fetch(req); cache.put('./', fresh.clone()); return fresh; } catch { return (await cache.match('./')) || Response.error(); }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
