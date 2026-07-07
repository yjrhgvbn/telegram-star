/// <reference lib="webworker" />

export {};

declare const __APP_BUILD_ID__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
// 构建时间戳用于区分不同版本缓存，避免旧 app shell 长期占用。
const APP_CACHE_NAME = `telegram-star-app-${__APP_BUILD_ID__}`;
const STATIC_CACHE_NAME = `telegram-star-static-${__APP_BUILD_ID__}`;
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
  "/icons/maskable-icon-512.png",
  "/icons/maskable-icon.svg",
];
const ASSET_URL_PATTERN = /(?:href|src)="([^"]*\/assets\/[^"]+)"/g;

function extractAssetUrls(html: string): string[] {
  // Vite 静态资源带 hash，安装阶段从 index.html 提取真实文件名再预缓存。
  return Array.from(html.matchAll(ASSET_URL_PATTERN), (match) => match[1]).filter(
    Boolean,
  );
}

async function cacheAppShell() {
  const cache = await caches.open(APP_CACHE_NAME);
  const indexResponse = await fetch("/", { cache: "no-store" });

  if (!indexResponse.ok) return;

  const indexForRoot = indexResponse.clone();
  const indexForAlias = indexResponse.clone();
  const html = await indexResponse.text();
  await cache.put("/", indexForRoot);
  await cache.put("/index.html", indexForAlias);
  await cache.addAll([...PRECACHE_URLS, ...extractAssetUrls(html)]);
}

async function deleteOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("telegram-star-"))
      .filter((key) => key !== APP_CACHE_NAME && key !== STATIC_CACHE_NAME)
      .map((key) => caches.delete(key)),
  );
}

async function networkFirstNavigation(request: Request): Promise<Response> {
  const cache = await caches.open(APP_CACHE_NAME);

  try {
    // 页面导航优先走网络，离线或弱网时再回落到已缓存的 app shell。
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ??
      (await cache.match("/")) ??
      Response.error()
    );
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

function isCacheableStaticAsset(url: URL): boolean {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

sw.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(deleteOldCaches().then(() => sw.clients.claim()));
});

sw.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void sw.skipWaiting();
  }
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // API、SSE 与 Telegram 媒体都在 /api 下，涉及实时状态或敏感内容，必须始终走网络。
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
