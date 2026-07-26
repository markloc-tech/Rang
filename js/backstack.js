/* ============================================================
   Rang back stack

   Every overlay in Rang - the full-screen swatch, compare, the
   library, the print dialog, the preview, the picker, the
   drawer - is a layer over the book rather than a page of its
   own, so none of them ever touched the session history. On a
   phone that left the system back gesture only one thing to
   do: leave the site, taking a selection or a half-built
   document with it.

   So each open layer holds one history entry. Back pops the
   top layer instead of the site, and closing a layer from the
   UI gives its entry back, so the back gesture and the
   on-screen close button stay in step with each other.

   The list of layers is the truth; the history is brought into
   line with it once the current burst of opening and closing
   has finished, never in the middle. That matters because
   handlers like the library's Export close one layer and open
   another in the same breath: reconciled eagerly that is a
   history.go(-1) still in flight while pushState runs, and a
   pending traversal resolves against the entry it was asked
   from, not the entry we end up on. Coalescing turns that whole
   case into what it actually is - one layer swapped for
   another, no history change at all.

   The URL never changes - pushState is called without one - so
   Rang stays a single page on http(s) and on file://, and the
   service worker still sees the same shell.
   ============================================================ */
(function (global) {
  'use strict';

  var history = global.history;

  /* Open layers, bottom first: { id, close }. */
  var layers = [];

  /* Set while tearing layers down, so the close() we are calling - which ends
     up back here in drop() - does not try to remove itself twice. */
  var unwinding = false;

  /* A traversal we asked for is in flight: reconciling again before it lands
     is exactly the race described above. */
  var settling = false;
  var settleTimer = null;

  var scheduled = false;

  /* pushState can be refused outright (older browsers, file:// in some of
     them). One failure is enough to know it is not there: from then on Rang
     behaves exactly as it did before, with Escape and the close buttons as
     the way out of a layer. */
  var ok = !!(history && history.pushState);

  function depth() {
    return (history.state && history.state.rangDepth) || 0;
  }

  function indexOf(id) {
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].id === id) return i;
    }
    return -1;
  }

  /* Close every layer above `keep`, topmost first. */
  function unwindTo(keep) {
    unwinding = true;
    try {
      while (layers.length > keep) {
        var layer = layers.pop();
        try { layer.close(); } catch (e) { /* keep unwinding regardless */ }
      }
    } finally {
      unwinding = false;
    }
  }

  /* Bring the history in line with the layers: one entry per open layer,
     each stamped with the depth it stands for so popstate can tell how far
     back a traversal actually went. */
  function sync() {
    if (!ok || settling) return;
    var want = layers.length;
    var have = depth();
    if (want === have) return;

    if (want > have) {
      while (have < want) {
        have++;
        try {
          history.pushState({ rangDepth: have }, '');
        } catch (e) {
          ok = false;
          return;
        }
      }
      return;
    }

    settling = true;
    history.go(want - have);
    /* Every traversal we ask for answers with a popstate. If one somehow does
       not, unblock rather than leave back stuck doing nothing forever. */
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      settleTimer = null;
      if (!settling) return;
      settling = false;
      sync();
    }, 600);
  }

  /* Layers move in bursts - one handler closing the library and opening the
     print dialog is two moves - so the history is reconciled once the burst
     is over instead of once per move. */
  function schedule() {
    if (scheduled || !ok) return;
    scheduled = true;
    Promise.resolve().then(function () {
      scheduled = false;
      sync();
    });
  }

  /** Call as a layer opens. `close` has to be safe to call at any time. */
  function push(id, close) {
    if (!ok || unwinding || indexOf(id) >= 0) return;
    layers.push({ id: id, close: close });
    schedule();
  }

  /** Call as a layer closes itself: close button, Escape, backdrop click. */
  function drop(id) {
    if (!ok || unwinding) return;
    var at = indexOf(id);
    if (at < 0) return;         // never pushed, or already on its way out
    unwindTo(at + 1);           // whatever sits on top of it goes too
    layers.pop();               // this one is closing under its own steam
    schedule();
  }

  /* One popstate arrives per traversal, whatever its size, so where the
     history landed is compared against how many layers are open rather than
     counted. A back press lands shallower than the layers, and the ones above
     it come down; anything else is drift and sync() straightens it out. */
  global.addEventListener('popstate', function () {
    if (!ok) return;
    settling = false;
    var have = depth();
    if (have < layers.length) unwindTo(have);
    sync();
  });

  /* A reload inside an overlay brings Rang back on the book with no layers
     open, but the entry it reloaded into still claims a depth. Clear it, or
     the first back press would unwind layers that are not there - the deeper
     entries left behind are collapsed by sync() when back reaches them.
     Anything else on the state belongs to somebody else and is left alone. */
  if (ok && depth()) {
    var kept = {};
    for (var key in history.state) {
      if (key !== 'rangDepth') kept[key] = history.state[key];
    }
    try { history.replaceState(kept, ''); } catch (e) { /* nothing to do */ }
  }

  global.RangBack = { push: push, drop: drop };
})(typeof window !== 'undefined' ? window : globalThis);
