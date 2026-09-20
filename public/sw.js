/* 信息汇总 Service Worker：只缓存静态资源（css/js/图标），页面与接口永远走网络，保证数据实时 */
const CACHE = 'infohub-static-v20';
const STATIC_RE = /\.(css|js|svg|png|jpg|jpeg|webp|webmanifest|woff2|ico)$/i;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;        // 接口永远直连
  if (!STATIC_RE.test(url.pathname)) return;           // html 页面永远直连（避免登录页/新版本被缓存）
  // js / css 走 network-first：部署新版本后第一次刷新拿到的就是新脚本，
  // 避免「新 HTML + 旧 app.js」的一次性错配；断网时回落缓存，离线仍可用
  const networkFirst = /\.(css|js)$/i.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (networkFirst) {
      const cached = await cache.match(e.request);
      try {
        const fresh = await fetch(e.request);
        if (fresh && fresh.ok) {
          cache.put(e.request, fresh.clone());
          return fresh;
        }
        // 网络通但拿到 404/5xx（如部署窗口），缓存里有好的就用好的
        return cached || fresh;
      } catch (err) {
        return cached || Response.error();
      }
    }
    // 图标等基本不变的资源：先用缓存，后台静默更新（stale-while-revalidate）
    const cached = await cache.match(e.request);
    const refresh = fetch(e.request).then((r) => {
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    }).catch(() => null);
    return cached || (await refresh) || Response.error();
  })());
});
