/* ============================================================
   Rang service worker
   Rang has no network features — every color, the PDF writer
   and your whole library are already local. The only thing
   standing between it and working offline is the browser
   needing the files themselves, so this caches them.

   Two strategies, on purpose:
   - Navigations go to the network first and fall back to the
     cache. index.html is what names the ?v= asset URLs, so
     keeping it fresh is how a new version gets picked up.
   - Assets are served from the cache immediately and then
     refreshed in the background (stale-while-revalidate), so
     loads are instant offline or on, and an edit that forgot
     its ?v= bump still turns up on the next reload instead of
     being cached forever.

   The precache list is read out of index.html at install time
   rather than duplicated here — one list to keep correct, not
   two. Bump VERSION to throw away every old cache.
   ============================================================ */

var VERSION = 'rang-v2';

/* Same-origin URLs referenced by index.html, i.e. exactly the files the app
   loads, complete with their cache-busting queries. */
function assetsFrom(html, base) {
  var urls = [];
  var re = /(?:src|href)="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    var raw = m[1];
    if (/^(data:|https?:|mailto:|#)/.test(raw)) continue;
    var url = new URL(raw, base);
    if (url.origin === self.location.origin) urls.push(url.href);
  }
  return urls;
}

function precache() {
  var shell = new URL('./index.html', self.location.href).href;
  return caches.open(VERSION).then(function (cache) {
    return fetch(shell, { cache: 'reload' })
      .then(function (res) {
        if (!res.ok) throw new Error('shell ' + res.status);
        // cache the directory URL too: that is what a visitor actually asks for
        return cache.put(new URL('./', self.location.href).href, res.clone())
          .then(function () { return cache.put(shell, res.clone()); })
          .then(function () { return res.text(); });
      })
      .then(function (html) {
        var urls = assetsFrom(html, shell);
        // one at a time would be tidier, but addAll fails the whole install if
        // any single file 404s — which is the behaviour we want here
        return cache.addAll(urls);
      });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* An explicit "cache what is open now" hook, used after the first load so a
   visitor who never reloads is still covered offline. */
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'cache-urls' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(VERSION).then(function (cache) {
    return Promise.all(e.data.urls.map(function (u) {
      return cache.match(u).then(function (hit) {
        return hit ? null : cache.add(u).catch(function () { /* skip failures */ });
      });
    }));
  }));
});

function fromNetwork(request, cache) {
  return fetch(request).then(function (res) {
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: fresh HTML when there is a network, the cached shell when not.
  // Revalidated with the server rather than taken from the HTTP cache — hosts
  // like GitHub Pages send a ten-minute max-age, and this page is the version
  // pointer for every ?v= asset, so it has to be current. Fetched by URL
  // because a request whose mode is "navigate" cannot be re-constructed.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(VERSION).then(function (cache) {
        return fetch(req.url, { cache: 'no-cache' }).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          // Offline: this exact URL, then the shell, then an honest message.
          // Each step has to be awaited — cache.match() resolves to undefined
          // on a miss, and a bare `||` chain would just return the promise.
          return cache.match(req).then(function (hit) {
            if (hit) return hit;
            return cache.match(new URL('./index.html', self.location.href).href);
          }).then(function (shell) {
            return shell || new Response(
              'Rang is offline and has not been cached yet. Open it once with a ' +
              'connection and it will work offline from then on.',
              { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
          });
        });
      })
    );
    return;
  }

  // Assets: cache first, then quietly refresh for next time.
  e.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) {
          e.waitUntil(fromNetwork(req, cache).catch(function () { /* offline */ }));
          return hit;
        }
        return fromNetwork(req, cache);
      });
    })
  );
});
