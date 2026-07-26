/* ============================================================
   Swatchbook app
   Browse digital color collections, select swatches, compare
   them full screen, and print or export them as Pantone-style
   A4 sheets. Values can be shown as HEX, RGB or CMYK.
   ============================================================ */

(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------------- data ---------------- */

  var RAW = window.SWATCH_DATA || [];
  var COLLECTIONS = [];
  var ALL = [];                     // flat swatch records in catalog (book) order
  var BY_UID = new Map();

  RAW.forEach(function (c) {
    var col = { id: c.id, name: c.collection, description: c.description || '', families: [], count: 0 };
    c.families.forEach(function (f) {
      var fam = { name: f.name, colId: c.id, swatches: [] };
      f.swatches.forEach(function (s) {
        var stepMatch = s.name.match(/(\d+)\s*$/);
        var rec = {
          uid: c.id + '|' + f.name + '|' + s.name,
          name: s.name,
          hex: s.hex.toUpperCase(),
          famName: f.name,
          colId: c.id,
          colName: c.collection,
          step: stepMatch ? parseInt(stepMatch[1], 10) : null
        };
        fam.swatches.push(rec);
        ALL.push(rec);
        BY_UID.set(rec.uid, rec);
      });
      col.families.push(fam);
      col.count += fam.swatches.length;
    });
    COLLECTIONS.push(col);
  });

  /* ---------------- state ---------------- */

  var S = {
    selection: new Set(),           // insertion order = compare order
    anchor: null,
    anchorState: true,
    query: '',
    visible: new Set(ALL.map(function (r) { return r.uid; })),
    view: 'catalog',                // 'catalog' | 'flow'
    valueMode: 'hex',               // 'hex' | 'rgb' | 'cmyk'
    steps: { min: 0, max: 2000, list: null, invalid: false },
    zoom: 0.62,
    lastPages: null,
    lastOpts: null,
    lastTotal: 0
  };

  var cardEls = new Map();          // uid -> card element
  var famEls = [];                  // { fam, el, gridEl, check, countEl }
  var colEls = new Map();           // colId -> { col, section, check, countEl, sideCount, sideCheck }
  var flowOrder = null;             // cached: ALL sorted for flow view

  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }

  /* ---------------- color math ---------------- */

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, s, l];
  }

  function hexToCmyk(hex) {
    var rgb = hexToRgb(hex);
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var k = 1 - Math.max(r, g, b);
    if (k >= 0.9999) return [0, 0, 0, 100];
    var c = (1 - r - k) / (1 - k);
    var m = (1 - g - k) / (1 - k);
    var y = (1 - b - k) / (1 - k);
    return [Math.round(c * 100), Math.round(m * 100), Math.round(y * 100), Math.round(k * 100)];
  }

  // Chip label / on-screen display in the active value mode.
  function formatValue(hex) {
    if (S.valueMode === 'rgb') return hexToRgb(hex).join(' ');
    if (S.valueMode === 'cmyk') return hexToCmyk(hex).join(' ');
    return hex;
  }

  // What lands on the clipboard: a usable CSS-ish string.
  function copyValue(hex) {
    if (S.valueMode === 'rgb') {
      var rgb = hexToRgb(hex);
      return 'rgb(' + rgb.join(', ') + ')';
    }
    if (S.valueMode === 'cmyk') {
      var cm = hexToCmyk(hex);
      return 'cmyk(' + cm.map(function (v) { return v + '%'; }).join(', ') + ')';
    }
    return hex;
  }

  function luminance(hex) {
    var rgb = hexToRgb(hex);
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    store('sb.theme', theme);
  }
  (function initTheme() {
    var saved = load('sb.theme', null);
    if (saved === 'light' || saved === 'dark') { applyTheme(saved); return; }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  })();
  $('#theme-toggle').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  /* ---------------- helpers ---------------- */

  var toastTimer = null;
  function toast(msg, chipHex) {
    var el = $('#toast');
    el.innerHTML = '';
    if (chipHex) {
      var chip = document.createElement('span');
      chip.className = 'toast-chip';
      chip.style.background = chipHex;
      el.appendChild(chip);
    }
    el.appendChild(document.createTextNode(msg));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  function copyText(text, chipHex) {
    function done() { toast(text + ' copied', chipHex); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else {
      legacyCopy(text);
      done();
    }
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var TICK_SVG = '<svg class="tick" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5.5 4 8l4.5-6"/></svg>';
  var DASH_SVG = '<svg class="dash" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 5h6"/></svg>';
  var CHECK_SVG = '<svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5.5 4 8l4.5-6"/></svg>';

  function miniCheck(label) {
    var wrap = document.createElement('label');
    wrap.className = 'mini-check';
    wrap.innerHTML = '<input type="checkbox" aria-label="' + escapeHtml(label) + '"><span class="box">' + TICK_SVG + DASH_SVG + '</span>';
    return wrap;
  }

  function famAnchor(colId, famName) {
    return 'fam-' + (colId + '-' + famName).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /* ---------------- render: main grid ---------------- */

  function cardHtml(sw) {
    return '<div class="card" role="checkbox" aria-checked="false" tabindex="0" aria-keyshortcuts="F"' +
      ' aria-label="' + escapeHtml(sw.name + ', ' + sw.hex) + '. F opens full screen"' +
      ' title="' + escapeHtml(sw.name + ' - ' + sw.hex + ' - rgb(' + hexToRgb(sw.hex).join(', ') + ')') + '"' +
      ' data-uid="' + escapeHtml(sw.uid) + '">' +
      '<div class="chip" style="--c:' + sw.hex + '">' +
        '<button class="zoom" tabindex="-1" aria-label="View full screen" title="Full screen (or double-click)">' +
          '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/></svg>' +
        '</button>' +
        '<span class="check">' + CHECK_SVG + '</span>' +
      '</div>' +
      '<div class="meta">' +
        '<span class="name">' + escapeHtml(sw.name) + '</span>' +
        '<button class="hex" data-hex="' + sw.hex + '" aria-label="Copy color value" title="Copy value">' + sw.hex + '</button>' +
      '</div></div>';
  }

  function renderMain() {
    var root = $('#collections');
    var frag = document.createDocumentFragment();

    COLLECTIONS.forEach(function (col) {
      var section = document.createElement('section');
      section.className = 'collection';
      section.id = 'col-' + col.id;

      var head = document.createElement('div');
      head.className = 'col-head';
      head.innerHTML =
        '<div><h2>' + escapeHtml(col.name) + '</h2><p class="col-desc">' + escapeHtml(col.description) + '</p></div>';
      var actions = document.createElement('div');
      actions.className = 'col-actions';
      var countEl = document.createElement('span');
      countEl.className = 'col-count';
      var check = miniCheck('Select all in ' + col.name);
      actions.appendChild(countEl);
      actions.appendChild(check);
      head.appendChild(actions);
      section.appendChild(head);

      check.querySelector('input').addEventListener('change', function (e) {
        setSelection(visibleUidsOf(col), e.target.checked);
      });

      col.families.forEach(function (fam) {
        var famDiv = document.createElement('div');
        famDiv.className = 'family';
        famDiv.id = famAnchor(col.id, fam.name);

        var famHead = document.createElement('div');
        famHead.className = 'family-head';
        var famCheck = miniCheck('Select all in ' + fam.name);
        famHead.appendChild(famCheck);
        var h3 = document.createElement('h3');
        h3.textContent = fam.name;
        famHead.appendChild(h3);
        var famCount = document.createElement('span');
        famCount.className = 'count';
        famHead.appendChild(famCount);
        famDiv.appendChild(famHead);

        famCheck.querySelector('input').addEventListener('change', function (e) {
          var uids = fam.swatches
            .filter(function (s) { return S.visible.has(s.uid); })
            .map(function (s) { return s.uid; });
          setSelection(uids, e.target.checked);
        });

        var grid = document.createElement('div');
        grid.className = 'grid';
        grid.innerHTML = fam.swatches.map(cardHtml).join('');
        Array.prototype.forEach.call(grid.children, function (card) {
          cardEls.set(card.dataset.uid, card);
        });

        famDiv.appendChild(grid);
        section.appendChild(famDiv);
        famEls.push({ fam: fam, el: famDiv, gridEl: grid, check: famCheck.querySelector('input'), countEl: famCount });
      });

      frag.appendChild(section);
      colEls.set(col.id, {
        col: col,
        section: section,
        check: check.querySelector('input'),
        countEl: countEl
      });
    });

    root.appendChild(frag);
  }

  /* ---------------- render: sidebar ---------------- */

  function renderSidebar() {
    var nav = $('#side-nav');
    COLLECTIONS.forEach(function (col) {
      var group = document.createElement('div');
      group.className = 'side-group';

      var row = document.createElement('div');
      row.className = 'side-row';

      // one big button: the whole left side expands / collapses
      var expand = document.createElement('button');
      expand.className = 'side-expand';
      expand.setAttribute('aria-expanded', 'false');
      expand.setAttribute('aria-label', 'Expand ' + col.name);
      expand.innerHTML =
        '<span class="twisty"><svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 1.5 7 5l-3.5 3.5"/></svg></span>' +
        '<span class="side-name">' + escapeHtml(col.name) + '</span>';
      var count = document.createElement('span');
      count.className = 'side-count';
      count.textContent = col.count;
      expand.appendChild(count);
      expand.addEventListener('click', function () {
        var open = group.classList.toggle('open');
        expand.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      // dedicated jump-to-collection action
      var gotoBtn = document.createElement('button');
      gotoBtn.className = 'side-goto';
      gotoBtn.setAttribute('aria-label', 'Jump to ' + col.name);
      gotoBtn.title = 'Jump to ' + col.name;
      gotoBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h8v8M13 3 3 13"/></svg>';
      gotoBtn.addEventListener('click', function () {
        goTo('col-' + col.id);
      });

      var check = miniCheck('Select all in ' + col.name);
      check.querySelector('input').addEventListener('change', function (e) {
        setSelection(visibleUidsOf(col), e.target.checked);
      });

      row.appendChild(expand);
      row.appendChild(gotoBtn);
      row.appendChild(check);

      var fams = document.createElement('div');
      fams.className = 'side-fams';
      col.families.forEach(function (fam) {
        var f = document.createElement('button');
        f.className = 'side-fam';
        var mid = fam.swatches[Math.floor(fam.swatches.length / 2)];
        f.innerHTML = '<span class="dot" style="background:' + (mid ? mid.hex : '#888') + '"></span>' +
          '<span class="side-name">' + escapeHtml(fam.name) + '</span>' +
          '<span class="side-count">' + fam.swatches.length + '</span>';
        f.addEventListener('click', function () {
          goTo(famAnchor(col.id, fam.name));
        });
        fams.appendChild(f);
      });

      group.appendChild(row);
      group.appendChild(fams);
      nav.appendChild(group);

      var entry = colEls.get(col.id);
      entry.sideCheck = check.querySelector('input');
      entry.sideCount = count;
    });
  }

  // content-visibility lays out lazily, so a far target's position shifts
  // while content above it renders; jump instantly (CSS smooth scrolling
  // disabled for the duration) and re-aim each frame until stable.
  function scrollToTarget(el, center) {
    var html = document.documentElement;
    var prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    var tries = 32;
    function finish() { html.style.scrollBehavior = prevBehavior; }
    function step() {
      var offset = $('.topbar').offsetHeight + 16;
      var rect = el.getBoundingClientRect();
      var y = center
        ? rect.top + window.scrollY - (window.innerHeight - rect.height) / 2
        : rect.top + window.scrollY - offset;
      window.scrollTo(0, Math.max(0, y));
      if (--tries <= 0) { finish(); return; }
      requestAnimationFrame(function () {
        var top = el.getBoundingClientRect().top;
        var settled = center
          ? (top > window.innerHeight * 0.15 && top < window.innerHeight * 0.75)
          : Math.abs(top - offset) <= 6;
        if (settled) finish(); else step();
      });
    }
    step();
  }

  function goTo(id) {
    setDrawer(false);
    if (S.view === 'flow') setView('catalog');
    var el = document.getElementById(id);
    if (!el) return;
    requestAnimationFrame(function () { scrollToTarget(el, false); });
  }

  // Accurate lazy-render placeholders: estimate each family's height from
  // the live column count so far-away scroll targets are near-correct
  // before their content ever renders.
  function setIntrinsicSizes() {
    var probeGrid = $('.family .grid');
    if (!probeGrid) return;
    var cols = getComputedStyle(probeGrid).gridTemplateColumns.split(' ').length || 1;
    var probeCard = probeGrid.querySelector('.card');
    var rowPitch = (probeCard ? probeCard.offsetHeight : 142) + 12;
    famEls.forEach(function (fe) {
      var rows = Math.ceil(fe.fam.swatches.length / cols);
      fe.el.style.containIntrinsicSize = 'auto ' + (rows * rowPitch + 46) + 'px';
    });
    $$('#flow-grid .flow-chunk').forEach(function (chunk) {
      var rows = Math.ceil(chunk.children.length / cols);
      chunk.style.containIntrinsicSize = 'auto ' + (rows * rowPitch) + 'px';
    });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setIntrinsicSizes, 200);
  });

  // aria-expanded reflects whatever the button controls at this width:
  // the drawer on narrow screens, sidebar visibility on desktop.
  function syncMenuAria() {
    var expanded = narrowMQ.matches
      ? document.body.classList.contains('side-open')
      : !document.body.classList.contains('side-hidden');
    $('#menu-btn').setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function setDrawer(open) {
    document.body.classList.toggle('side-open', open);
    syncMenuAria();
    if (open) {
      var first = $('#side-nav button');
      if (first) first.focus();
    }
  }

  /* ---------------- view: catalog / flow ---------------- */

  // Sort for smooth transitions: grays last by lightness; colors by hue
  // bucket, then saturation band (vivid ramp, soft ramp, muted ramp),
  // then lightness tint -> shade. Bands keep each ramp reading as one
  // clean gradient instead of interleaving vivid and muted chips.
  function buildFlowOrder() {
    if (flowOrder) return flowOrder;
    flowOrder = ALL.map(function (r) {
      var rgb = hexToRgb(r.hex);
      var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      var isGray = hsl[1] < 0.09 || hsl[2] < 0.03 || hsl[2] > 0.98;
      return {
        rec: r,
        g: isGray ? 1 : 0,
        bucket: isGray ? 0 : Math.floor(hsl[0] / 15) % 24,
        band: hsl[1] > 0.75 ? 0 : hsl[1] > 0.45 ? 1 : hsl[1] > 0.22 ? 2 : 3,
        l: hsl[2],
        s: hsl[1]
      };
    }).sort(function (a, b) {
      if (a.g !== b.g) return a.g - b.g;
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.band !== b.band) return a.band - b.band;
      if (b.l !== a.l) return b.l - a.l;
      return b.s - a.s;
    }).map(function (x) { return x.rec; });
    return flowOrder;
  }

  var flowRendered = false;
  var flowKept = null;              // one record per unique hex, flow order
  var CHUNK = 240;

  // Flow shows each color once: duplicates across collections collapse
  // to the first record in flow order. flowKept is the canonical list —
  // selection ranges, jumps and rendering in flow all use it so hidden
  // duplicates can never be acted on invisibly.
  function buildFlowKept() {
    if (flowKept) return flowKept;
    var seen = new Set();
    flowKept = buildFlowOrder().filter(function (r) {
      if (seen.has(r.hex)) return false;
      seen.add(r.hex);
      return true;
    });
    return flowKept;
  }

  function renderFlow() {
    var grid = $('#flow-grid');
    grid.innerHTML = '';
    var kept = buildFlowKept();
    var chunk = null;
    kept.forEach(function (r, i) {
      if (i % CHUNK === 0) {
        chunk = document.createElement('div');
        chunk.className = 'flow-chunk';
        grid.appendChild(chunk);
      }
      chunk.appendChild(cardEls.get(r.uid));
    });
    $('#flow-count').textContent = kept.length.toLocaleString() + ' unique colors';
    flowRendered = true;
    setIntrinsicSizes();
  }

  function restoreCatalog() {
    famEls.forEach(function (fe) {
      fe.fam.swatches.forEach(function (s) {
        fe.gridEl.appendChild(cardEls.get(s.uid));
      });
    });
    flowRendered = false;
    $('#flow-grid').innerHTML = '';
  }

  function setView(view) {
    if (view === S.view) return;
    S.view = view;
    store('sb.view', view);
    document.body.classList.toggle('flow-mode', view === 'flow');
    $('#flow').hidden = view !== 'flow';
    $$('#view-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === view);
    });
    if (view === 'flow') renderFlow();
    else restoreCatalog();
    refilter();                     // display semantics differ per view
    window.scrollTo(0, 0);
  }

  $$('#view-seg button').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });

  // The uid order currently on screen (for shift-click ranges). In flow
  // this is the deduped list — ranges must never touch hidden duplicates.
  function currentOrder() {
    return S.view === 'flow' ? buildFlowKept() : ALL;
  }

  /* ---------------- value mode (hex / rgb / cmyk) ---------------- */

  function setValueMode(mode) {
    S.valueMode = mode;
    store('sb.mode', mode);
    $$('#mode-seg button, #print-mode-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
    // update every visible chip label
    cardEls.forEach(function (card) {
      var btn = card.querySelector('.hex');
      btn.textContent = formatValue(btn.dataset.hex);
    });
  }

  $$('#mode-seg button, #print-mode-seg button').forEach(function (b) {
    b.addEventListener('click', function () { setValueMode(b.dataset.mode); });
  });

  /* ---------------- selection ---------------- */

  function setSelection(uids, on) {
    uids.forEach(function (uid) {
      if (on) S.selection.add(uid); else S.selection.delete(uid);
      var card = cardEls.get(uid);
      if (card) {
        card.classList.toggle('selected', on);
        card.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });
    syncSelectionUI();
    store('sb.sel', Array.from(S.selection));
  }

  function clearSelection() {
    setSelection(Array.from(S.selection), false);
  }

  function visibleUidsOf(col) {
    var uids = [];
    col.families.forEach(function (fam) {
      fam.swatches.forEach(function (s) {
        if (S.visible.has(s.uid)) uids.push(s.uid);
      });
    });
    return uids;
  }

  function syncSelectionUI() {
    var n = S.selection.size;

    var bar = $('#sel-bar');
    bar.classList.toggle('show', n > 0);
    $('#sel-count').textContent = n + ' selected';

    COLLECTIONS.forEach(function (col) {
      var entry = colEls.get(col.id);
      var visible = 0, selected = 0;
      col.families.forEach(function (fam) {
        fam.swatches.forEach(function (s) {
          if (S.visible.has(s.uid)) {
            visible++;
            if (S.selection.has(s.uid)) selected++;
          }
        });
      });
      entry.countEl.textContent = selected > 0
        ? selected + ' / ' + visible + ' selected'
        : visible + ' colors';
      entry.check.checked = visible > 0 && selected === visible;
      entry.check.indeterminate = selected > 0 && selected < visible;
      if (entry.sideCheck) {
        entry.sideCheck.checked = entry.check.checked;
        entry.sideCheck.indeterminate = entry.check.indeterminate;
        entry.sideCount.textContent = selected > 0 ? selected + '/' + visible : String(visible);
        entry.sideCount.classList.toggle('has-sel', selected > 0);
        entry.sideCheck.closest('.side-row').classList.toggle('dimmed', visible === 0);
      }
    });

    famEls.forEach(function (fe) {
      var visible = 0, selected = 0;
      fe.fam.swatches.forEach(function (s) {
        if (S.visible.has(s.uid)) {
          visible++;
          if (S.selection.has(s.uid)) selected++;
        }
      });
      fe.countEl.textContent = selected > 0 ? selected + ' / ' + visible : String(visible);
      fe.check.checked = visible > 0 && selected === visible;
      fe.check.indeterminate = selected > 0 && selected < visible;
    });

    $('#sub-selected').textContent = n > 0
      ? n + ' swatch' + (n === 1 ? '' : 'es') + ' picked across the book'
      : 'Nothing selected yet - click swatches to pick them';
    $('#sub-visible').textContent = (S.query || stepsActive())
      ? S.visible.size + ' swatches match your search & step filters'
      : 'No filters active - same as Everything';
    $('#choice-selected').classList.toggle('disabled', n === 0);
    $('#choice-selected').querySelector('input').disabled = n === 0;
    if (n === 0 && getScope() === 'selected') {
      $('#scope-list input[value="all"]').checked = true;
    }
    refreshDocStats();
  }

  /* card interactions (event delegation over both views) */

  $('#main').addEventListener('click', function (e) {
    var zoomBtn = e.target.closest('.zoom');
    if (zoomBtn) {
      openSingle(zoomBtn.closest('.card').dataset.uid);
      return;
    }
    var hexBtn = e.target.closest('.hex');
    if (hexBtn) {
      e.stopPropagation();
      copyText(copyValue(hexBtn.dataset.hex), hexBtn.dataset.hex);
      return;
    }
    var card = e.target.closest('.card');
    if (card) handleCardActivate(card, e.shiftKey);
  });

  $('#main').addEventListener('dblclick', function (e) {
    if (e.target.closest('.hex') || e.target.closest('.zoom')) return;
    var card = e.target.closest('.card');
    if (card) openSingle(card.dataset.uid);
  });

  $('#main').addEventListener('keydown', function (e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    if (!card || e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardActivate(card, e.shiftKey);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      openSingle(card.dataset.uid);
    }
  });

  function handleCardActivate(card, shift) {
    var uid = card.dataset.uid;
    if (shift && S.anchor && S.anchor !== uid && S.visible.has(S.anchor)) {
      var order = currentOrder()
        .filter(function (r) { return S.visible.has(r.uid); })
        .map(function (r) { return r.uid; });
      var a = order.indexOf(S.anchor);
      var b = order.indexOf(uid);
      if (a !== -1 && b !== -1) {
        var range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelection(range, S.anchorState);
        return;
      }
    }
    var on = !S.selection.has(uid);
    setSelection([uid], on);
    S.anchor = uid;
    S.anchorState = on;
  }

  /* selection bar buttons */
  $('#sel-clear').addEventListener('click', clearSelection);
  $('#sel-print').addEventListener('click', function () { openPrintModal('selected'); });
  $('#sel-export').addEventListener('click', function () { openPrintModal('selected'); });
  $('#sel-compare').addEventListener('click', openCompare);

  /* ---------------- search ---------------- */

  var searchInput = $('#search');
  var searchTimer = null;

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { applyFilter(searchInput.value); }, 200);
    $('#search-wrap').classList.toggle('has-value', searchInput.value.length > 0);
  });
  $('#search-clear').addEventListener('click', function () {
    searchInput.value = '';
    $('#search-wrap').classList.remove('has-value');
    applyFilter('');
    searchInput.focus();
  });

  // Invalid "specific steps" text is cosmetic (red border) — the slider
  // range keeps filtering rather than silently switching everything off.
  function stepsActive() {
    if (S.steps.list) return S.steps.list.size > 0;
    return S.steps.min > 0 || S.steps.max < 2000;
  }

  function matchesSteps(r) {
    if (!stepsActive()) return true;
    if (r.step === null) return false;
    if (S.steps.list) return S.steps.list.has(r.step);
    return r.step >= S.steps.min && r.step <= S.steps.max;
  }

  function applyFilter(q) {
    S.query = q.trim().toLowerCase();
    var qHex = S.query.replace(/^#/, '');
    var isHexQuery = /^[0-9a-f]{1,6}$/.test(qHex) && S.query.charAt(0) === '#';
    var any = false;

    S.visible = new Set();
    ALL.forEach(function (r) {
      var match;
      if (!S.query) {
        match = true;
      } else if (isHexQuery) {
        match = r.hex.toLowerCase().indexOf(qHex) === 1;
      } else {
        match =
          r.name.toLowerCase().indexOf(S.query) !== -1 ||
          r.famName.toLowerCase().indexOf(S.query) !== -1 ||
          r.colName.toLowerCase().indexOf(S.query) !== -1 ||
          r.hex.toLowerCase().indexOf(qHex !== '' ? qHex : S.query) !== -1;
      }
      if (match) match = matchesSteps(r);
      if (match) { S.visible.add(r.uid); any = true; }
      var card = cardEls.get(r.uid);
      if (card) {
        var want = match ? '' : 'none';
        if (card.style.display !== want) card.style.display = want;
      }
    });

    // In flow, a chip represents every record sharing its hex: it stays
    // visible if ANY of them matched, so a search for a deduped-away
    // duplicate still finds its representative chip.
    S.matchedHex = null;
    if (S.view === 'flow') {
      S.matchedHex = new Set();
      ALL.forEach(function (r) {
        if (S.visible.has(r.uid)) S.matchedHex.add(r.hex);
      });
      any = S.matchedHex.size > 0;
      buildFlowKept().forEach(function (r) {
        var card = cardEls.get(r.uid);
        if (card) {
          var want = S.matchedHex.has(r.hex) ? '' : 'none';
          if (card.style.display !== want) card.style.display = want;
        }
      });
    }

    famEls.forEach(function (fe) {
      var vis = fe.fam.swatches.some(function (s) { return S.visible.has(s.uid); });
      fe.el.style.display = vis ? '' : 'none';
    });
    COLLECTIONS.forEach(function (col) {
      var entry = colEls.get(col.id);
      var vis = col.families.some(function (f) {
        return f.swatches.some(function (s) { return S.visible.has(s.uid); });
      });
      entry.section.style.display = vis ? '' : 'none';
    });

    $('#empty-note').style.display = any ? 'none' : 'block';
    $('#empty-q').textContent = q || (stepsActive() ? 'the step filter' : '');
    syncSelectionUI();
  }

  function refilter() {
    applyFilter(searchInput.value);
  }

  /* jump to the first match currently on screen */
  function jumpToFirstMatch() {
    var order = currentOrder();
    var inFlow = S.view === 'flow';
    for (var i = 0; i < order.length; i++) {
      var r = order[i];
      var matched = inFlow
        ? (S.matchedHex ? S.matchedHex.has(r.hex) : true)
        : S.visible.has(r.uid);
      if (!matched) continue;
      var card = cardEls.get(r.uid);
      if (!card || !card.isConnected || card.style.display === 'none') continue;
      scrollToTarget(card, true);
      card.classList.remove('flash');
      void card.offsetWidth;                  // restart the animation
      card.classList.add('flash');
      return;
    }
    toast('No match to jump to');
  }

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);              // flush the debounce first
      applyFilter(searchInput.value);
      $('#search-wrap').classList.toggle('has-value', searchInput.value.length > 0);
      jumpToFirstMatch();
    }
  });

  /* ---------------- steps filter ---------------- */

  var stepsPop = $('#steps-pop');
  var stepsBtn = $('#steps-btn');

  function openStepsPop(open) {
    stepsPop.hidden = !open;
    stepsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    // On small screens the button can sit anywhere in the wrapped bar, so
    // anchor the popover to the viewport edges instead of the button.
    if (window.matchMedia('(max-width: 860px)').matches) {
      var r = stepsBtn.getBoundingClientRect();
      stepsPop.style.position = 'fixed';
      stepsPop.style.top = Math.round(Math.min(r.bottom + 8, window.innerHeight - 340)) + 'px';
      stepsPop.style.left = '12px';
      stepsPop.style.right = '12px';
      stepsPop.style.width = 'auto';
    } else {
      stepsPop.style.position = '';
      stepsPop.style.top = '';
      stepsPop.style.left = '';
      stepsPop.style.right = '';
      stepsPop.style.width = '';
    }
    $('#step-min').focus();
  }

  stepsBtn.addEventListener('click', function () {
    openStepsPop(stepsPop.hidden);
  });
  document.addEventListener('mousedown', function (e) {
    if (!stepsPop.hidden && !$('#steps-wrap').contains(e.target)) openStepsPop(false);
  });

  function parseStepList(str) {
    // "700, 900, 1100" and "100-500" both work; returns Set or undefined on junk
    if (!/^[\d\s,\-]+$/.test(str)) return undefined;
    var set = new Set();
    var parts = str.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (b < a || b - a > 20000) return undefined;
        for (var k = a; k <= b; k++) set.add(k);
      } else if (/^\d+$/.test(p)) {
        set.add(parseInt(p, 10));
      } else {
        return undefined;
      }
    }
    return set.size ? set : undefined;
  }

  // Visual state (labels, track, thumb z-order) updates instantly while
  // dragging; the 8.8k-card re-filter is debounced separately.
  function syncStepsVisual() {
    var minEl = $('#step-min'), maxEl = $('#step-max');
    var lo = parseInt(minEl.value, 10), hi = parseInt(maxEl.value, 10);
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    S.steps.min = lo;
    S.steps.max = hi;

    var listStr = $('#steps-list').value.trim();
    if (listStr) {
      var set = parseStepList(listStr);
      S.steps.list = set || null;
      S.steps.invalid = !set;
    } else {
      S.steps.list = null;
      S.steps.invalid = false;
    }
    $('#steps-list').classList.toggle('invalid', S.steps.invalid);

    $('#ds-track').style.setProperty('--lo', (lo / 2000 * 100) + '%');
    $('#ds-track').style.setProperty('--hi', (hi / 2000 * 100) + '%');
    // when the thumbs meet, the one with room to move must sit on top
    var meeting = hi - lo <= 100;
    minEl.style.zIndex = meeting && (lo + hi) / 2 >= 1000 ? 4 : 1;
    maxEl.style.zIndex = 2;
    $('#steps-range-label').textContent =
      S.steps.list ? Array.from(S.steps.list).sort(function (a, b) { return a - b; }).slice(0, 8).join(', ') +
        (S.steps.list.size > 8 ? '…' : '') :
      (lo === 0 && hi === 2000 ? 'All steps' : lo + ' – ' + hi);

    var label = $('#steps-btn-label');
    if (S.steps.invalid) label.textContent = 'Steps · ?';
    else if (S.steps.list) label.textContent = 'Steps · ' + S.steps.list.size + ' picked';
    else if (stepsActive()) label.textContent = 'Steps · ' + lo + '–' + hi;
    else label.textContent = 'Steps';
    stepsBtn.classList.toggle('active', stepsActive());
  }

  function syncSteps() {
    syncStepsVisual();
    refilter();
  }

  var stepsTimer = null;
  function onSliderInput() {
    syncStepsVisual();
    clearTimeout(stepsTimer);
    stepsTimer = setTimeout(refilter, 180);
  }
  $('#step-min').addEventListener('input', onSliderInput);
  $('#step-max').addEventListener('input', onSliderInput);
  $('#steps-list').addEventListener('input', function () {
    syncStepsVisual();
    clearTimeout(stepsTimer);
    stepsTimer = setTimeout(refilter, 200);
  });
  $('#steps-clear').addEventListener('click', function () {
    $('#step-min').value = 0;
    $('#step-max').value = 2000;
    $('#steps-list').value = '';
    syncSteps();
  });

  /* ---------------- compare (full screen) ---------------- */

  var cmp = $('#cmp-overlay');
  var cmpLastFocus = null;

  function openCompare() {
    var uids = Array.from(S.selection);
    if (uids.length === 0) {
      toast('Select colors to compare');
      return;
    }
    if (uids.length === 1) {
      // keyboard-friendly path to the single-color full-screen view
      openSingle(uids[0]);
      return;
    }
    openCompareWith(uids, 'Compare');
  }

  // Also serves single-color full-screen view (uids.length === 1).
  function openCompareWith(uids, title) {
    var strips = $('#cmp-strips');
    strips.innerHTML = '';
    uids.forEach(function (uid) {
      var rec = BY_UID.get(uid);
      if (!rec) return;
      var strip = document.createElement('div');
      strip.className = 'cmp-strip';
      strip.style.background = rec.hex;
      strip.dataset.hex = rec.hex;
      strip.setAttribute('title', 'Click to copy ' + rec.hex);
      var textColor = luminance(rec.hex) > 0.55 ? '#0a0a0a' : '#ffffff';
      strip.innerHTML =
        '<span class="cmp-label" style="color:' + textColor + '">' +
          '<span class="cmp-name">' + escapeHtml(rec.name) + '</span>' +
          '<span class="cmp-value">' + escapeHtml(formatValue(rec.hex)) + '</span>' +
        '</span>' +
        '<button class="cmp-x" style="color:' + textColor + '" aria-label="Remove ' + escapeHtml(rec.name) + ' from comparison">' +
          '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>' +
        '</button>';
      strips.appendChild(strip);
    });
    $('#cmp-title').textContent = title || 'Compare';
    $('#cmp-meta').textContent = uids.length === 1 ? '' : uids.length + ' colors';
    cmp.classList.toggle('single', uids.length === 1);
    cmpLastFocus = document.activeElement;
    cmp.classList.add('show');
    $('#cmp-back').focus();
  }

  function openSingle(uid) {
    var rec = BY_UID.get(uid);
    if (rec) openCompareWith([uid], rec.name);
  }

  function closeCompare() {
    if (document.fullscreenElement === cmp && document.exitFullscreen) {
      document.exitFullscreen().catch(function () { /* ignore */ });
    }
    cmp.classList.remove('show');
    if (cmpLastFocus && document.contains(cmpLastFocus) && cmpLastFocus.getClientRects().length) {
      cmpLastFocus.focus();
    }
  }

  $('#cmp-back').addEventListener('click', closeCompare);

  $('#cmp-labels').addEventListener('click', function () {
    var off = cmp.classList.toggle('no-labels');
    this.setAttribute('aria-pressed', off ? 'false' : 'true');
  });

  $('#cmp-fullscreen').addEventListener('click', function () {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(function () { /* ignore */ });
    } else if (cmp.requestFullscreen) {
      cmp.requestFullscreen().catch(function () {
        toast('Full screen is not available here');
      });
    }
  });

  $('#cmp-strips').addEventListener('click', function (e) {
    var x = e.target.closest('.cmp-x');
    if (x) {
      var strip = x.closest('.cmp-strip');
      strip.remove();
      var left = $('#cmp-strips').children.length;
      $('#cmp-meta').textContent = left + ' colors';
      if (left < 2) closeCompare();
      return;
    }
    var s = e.target.closest('.cmp-strip');
    if (s) copyText(copyValue(s.dataset.hex), s.dataset.hex);
  });

  /* ---------------- print document builder ---------------- */

  function getScope() {
    var checked = $('#scope-list input[name="scope"]:checked');
    return checked ? checked.value : 'all';
  }

  function getOrder() {
    var on = $('#order-seg button.on');
    return on ? on.dataset.order : 'catalog';
  }

  $$('#order-seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#order-seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      refreshDocStats();
    });
  });

  function getOpts() {
    var pickedCols = $$('#col-picks input:checked').map(function (i) { return i.value; });
    return {
      scope: getScope(),
      order: getOrder(),
      pickedCols: pickedCols,
      perPage: parseInt(($('#density-seg input[name="density"]:checked') || {}).value || '24', 10),
      newPagePerCollection: $('#opt-newpage').checked,
      showHeaders: $('#opt-headers').checked,
      showNames: $('#opt-names').checked,
      range: $('#page-range').value.trim()
    };
  }

  function swatchesForScope(opts) {
    var out = [];
    COLLECTIONS.forEach(function (col) {
      if (opts.scope === 'collections' && opts.pickedCols.indexOf(col.id) === -1) return;
      var list = [];
      col.families.forEach(function (fam) {
        fam.swatches.forEach(function (s) {
          if (opts.scope === 'selected' && !S.selection.has(s.uid)) return;
          if (opts.scope === 'visible' && !S.visible.has(s.uid)) return;
          list.push(s);
        });
      });
      if (list.length) out.push({ colName: col.name, swatches: list });
    });
    return out;
  }

  function buildPages(opts) {
    var groups = swatchesForScope(opts);
    var pages = [];

    if (opts.order === 'flow') {
      // one continuous hue/shade gradient across everything in scope,
      // each unique color printed once (matches the Flow view)
      var inScope = new Set();
      groups.forEach(function (g) {
        g.swatches.forEach(function (s) { inScope.add(s.uid); });
      });
      var seenHex = new Set();
      var stream = buildFlowOrder().filter(function (r) {
        if (!inScope.has(r.uid) || seenHex.has(r.hex)) return false;
        seenHex.add(r.hex);
        return true;
      });
      for (var k = 0; k < stream.length; k += opts.perPage) {
        pages.push({ title: 'Color Flow', swatches: stream.slice(k, k + opts.perPage) });
      }
    } else if (opts.newPagePerCollection) {
      groups.forEach(function (g) {
        for (var i = 0; i < g.swatches.length; i += opts.perPage) {
          pages.push({
            title: g.colName + (i > 0 ? ' (cont.)' : ''),
            swatches: g.swatches.slice(i, i + opts.perPage)
          });
        }
      });
    } else {
      var flat = [];
      groups.forEach(function (g) {
        g.swatches.forEach(function (s) { flat.push({ s: s, colName: g.colName }); });
      });
      for (var j = 0; j < flat.length; j += opts.perPage) {
        var chunk = flat.slice(j, j + opts.perPage);
        var names = [];
        chunk.forEach(function (it) {
          if (names.indexOf(it.colName) === -1) names.push(it.colName);
        });
        pages.push({
          title: names.length === 1 ? names[0] : APP_NAME,
          swatches: chunk.map(function (it) { return it.s; })
        });
      }
    }

    pages.forEach(function (p, i) { p.no = i + 1; });
    return pages;
  }

  /* range parsing: "1-4, 7" -> [1,2,3,4,7]; '' -> null (= all); invalid -> undefined */
  function parseRange(str, max) {
    if (!str) return null;
    if (!/^[\d\s,\-]+$/.test(str)) return undefined;
    var picked = new Set();
    var parts = str.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a < 1 || b < a) return undefined;
        for (var k = a; k <= Math.min(b, max); k++) picked.add(k);
      } else if (/^\d+$/.test(p)) {
        var v = parseInt(p, 10);
        if (v < 1) return undefined;
        if (v <= max) picked.add(v);
      } else {
        return undefined;
      }
    }
    if (picked.size === 0) return undefined;
    return Array.from(picked).sort(function (x, y) { return x - y; });
  }

  function composeDocument() {
    var opts = getOpts();
    var pages = buildPages(opts);
    var total = pages.length;
    var range = parseRange(opts.range, total);
    var final = pages;
    if (range === undefined) return { opts: opts, pages: null, total: total, invalidRange: true };
    if (range !== null) {
      final = pages.filter(function (p) { return range.indexOf(p.no) !== -1; });
    }
    return { opts: opts, pages: final, total: total, invalidRange: false };
  }

  function refreshDocStats() {
    if (!$('#print-modal').classList.contains('show')) return;
    var doc = composeDocument();
    var rangeHint = $('#range-hint');
    var rangeInput = $('#page-range');

    if (doc.invalidRange) {
      rangeHint.textContent = 'Invalid range';
      rangeHint.classList.add('invalid');
      rangeInput.classList.add('invalid');
      $('#doc-stats').innerHTML = '&mdash;';
      setActionEnabled(false);
      return;
    }
    rangeHint.classList.remove('invalid');
    rangeInput.classList.remove('invalid');
    rangeHint.textContent = doc.pages.length === doc.total
      ? doc.total + ' sheet' + (doc.total === 1 ? '' : 's')
      : doc.pages.length + ' of ' + doc.total + ' sheets';

    var swatches = doc.pages.reduce(function (n, p) { return n + p.swatches.length; }, 0);
    if (swatches === 0) {
      $('#doc-stats').textContent = 'Nothing to print';
      setActionEnabled(false);
    } else {
      $('#doc-stats').innerHTML =
        '<strong>' + swatches + '</strong> swatches &middot; <strong>' +
        doc.pages.length + '</strong> A4 sheet' + (doc.pages.length === 1 ? '' : 's');
      setActionEnabled(true);
    }
  }

  function setActionEnabled(on) {
    ['#btn-preview', '#btn-export', '#btn-print'].forEach(function (sel) {
      $(sel).disabled = !on;
    });
  }

  /* ---------------- sheet DOM rendering ---------------- */

  var DENSITY_GRID = { 12: [3, 4], 24: [4, 6], 40: [5, 8] };

  /* Sheet footer credit. js/pdf.js builds the same line from its appName option,
     so keep the two in step — the printed sheet and the PDF must read alike. */
  var APP_NAME = 'Rang';
  var BRAND_LINE = APP_NAME.toUpperCase() + ' — AN OPEN SOURCE PROJECT BY';

  function renderSheets(doc) {
    var root = $('#print-root');
    root.innerHTML = '';
    var grid = DENSITY_GRID[doc.opts.perPage] || DENSITY_GRID[24];
    var frag = document.createDocumentFragment();

    doc.pages.forEach(function (page) {
      var wrap = document.createElement('div');
      wrap.className = 'sheet-wrap';

      var pn = document.createElement('span');
      pn.className = 'pv-pageno';
      pn.textContent = 'Sheet ' + page.no + ' / ' + doc.total;
      wrap.appendChild(pn);

      var sheet = document.createElement('section');
      sheet.className = 'sheet' + (doc.opts.showHeaders ? '' : ' no-chrome');
      sheet.dataset.density = String(doc.opts.perPage);
      sheet.style.setProperty('--cols', grid[0]);
      sheet.style.setProperty('--rows', grid[1]);

      var head = document.createElement('header');
      head.className = 'sheet-head';
      head.innerHTML = '<span class="sheet-title"></span><span class="sheet-sub">A4 &middot; 210 &times; 297 mm</span>';
      head.querySelector('.sheet-title').textContent = page.title;
      sheet.appendChild(head);

      var g = document.createElement('div');
      g.className = 'sheet-grid';
      g.innerHTML = page.swatches.map(function (sw) {
        return '<div class="pcell"><div class="pchip" style="background:' + sw.hex + '"></div>' +
          '<div class="plabel">' +
          (doc.opts.showNames ? '<span class="pname">' + escapeHtml(sw.name) + '</span>' : '') +
          '<span class="phex">' + escapeHtml(formatValue(sw.hex)) + '</span>' +
          '</div></div>';
      }).join('');
      sheet.appendChild(g);

      var foot = document.createElement('footer');
      foot.className = 'sheet-foot';
      foot.innerHTML = '<span class="foot-brand">' + escapeHtml(BRAND_LINE) +
        ' <span class="foot-logo wordmark">Markloc</span></span>' +
        '<span>Sheet ' + page.no + ' of ' + doc.total + '</span>';
      sheet.appendChild(foot);

      wrap.appendChild(sheet);
      frag.appendChild(wrap);
    });

    root.appendChild(frag);
    // pdf.js prints whatever `value` carries, so bake the active mode in
    S.lastPages = doc.pages.map(function (p) {
      return {
        no: p.no,
        title: p.title,
        swatches: p.swatches.map(function (sw) {
          return { name: sw.name, hex: sw.hex, value: formatValue(sw.hex) };
        })
      };
    });
    S.lastOpts = doc.opts;
    S.lastTotal = doc.total;
  }

  /* ---------------- modal ---------------- */

  var modal = $('#print-modal');
  var lastFocus = null;

  function openPrintModal(scope) {
    lastFocus = document.activeElement;
    if (scope === 'selected' && S.selection.size > 0) {
      modal.querySelector('input[value="selected"]').checked = true;
    }
    $('#sub-all').textContent = 'All ' + ALL.length + ' swatches in the book';
    // default print order follows the current browsing view
    $$('#order-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.order === S.view);
    });
    modal.classList.add('show');
    syncScopeUI();
    refreshDocStats();
    $('#modal-close').focus();
  }
  function closePrintModal() {
    modal.classList.remove('show');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $('#open-print').addEventListener('click', function () { openPrintModal(); });
  $('#modal-close').addEventListener('click', closePrintModal);
  modal.addEventListener('mousedown', function (e) {
    if (e.target === modal) closePrintModal();
  });

  (function initColPicks() {
    var wrap = $('#col-picks');
    COLLECTIONS.forEach(function (col) {
      var label = document.createElement('label');
      label.className = 'pick';
      label.innerHTML =
        '<input type="checkbox" value="' + col.id + '">' +
        '<span class="pick-face">' + escapeHtml(col.name) + ' <span class="pick-n">' + col.count + '</span></span>';
      label.querySelector('input').addEventListener('change', refreshDocStats);
      wrap.appendChild(label);
    });
  })();

  function syncScopeUI() {
    var scope = getScope();
    $('#col-picks').classList.toggle('show', scope === 'collections');
    $$('#scope-list .choice').forEach(function (c) {
      var input = c.querySelector('input');
      c.classList.toggle('checked', input.checked);
    });
  }

  modal.addEventListener('change', function (e) {
    if (e.target.name === 'scope') syncScopeUI();
    refreshDocStats();
  });
  $('#page-range').addEventListener('input', refreshDocStats);

  /* ---------------- preview / print / export ---------------- */

  var pv = $('#pv-overlay');
  var pvLastFocus = null;

  function fitZoom() {
    var scroll = $('#pv-scroll');
    var mmPx = 96 / 25.4;
    var avail = scroll.clientWidth - 56;
    var z = avail / (210 * mmPx);
    return Math.max(0.25, Math.min(1, Math.round(z * 100) / 100));
  }

  function setZoom(z) {
    S.zoom = Math.max(0.25, Math.min(1.5, z));
    $('#print-root').style.setProperty('--pz', S.zoom);
    $('#pv-zval').textContent = Math.round(S.zoom * 100) + '%';
  }

  function openPreview() {
    var doc = composeDocument();
    if (doc.invalidRange || !doc.pages.length) return false;
    renderSheets(doc);
    pvLastFocus = document.activeElement;
    pv.classList.add('show');
    setZoom(fitZoom());
    $('#pv-meta').textContent =
      doc.pages.length + ' sheet' + (doc.pages.length === 1 ? '' : 's') + ' - A4 portrait';
    $('#pv-scroll').scrollTop = 0;
    $('#pv-back').focus();
    return true;
  }
  function closePreview() {
    pv.classList.remove('show');
    if (pvLastFocus && document.contains(pvLastFocus) && pvLastFocus.getClientRects().length) {
      pvLastFocus.focus();
    } else if (modal.classList.contains('show')) {
      $('#modal-close').focus();
    }
  }

  $('#btn-preview').addEventListener('click', openPreview);
  $('#pv-back').addEventListener('click', closePreview);
  $('#pv-zoom-in').addEventListener('click', function () { setZoom(S.zoom + 0.1); });
  $('#pv-zoom-out').addEventListener('click', function () { setZoom(S.zoom - 0.1); });

  // Print and Export always go through the preview so you can see
  // exactly what is about to come out.
  function doPrint() {
    if (!openPreview()) return;
    setTimeout(function () { window.print(); }, 350);
  }

  function doExport() {
    if (!openPreview()) return;
    setTimeout(exportCurrent, 250);
  }

  function exportCurrent() {
    if (!S.lastPages || !S.lastPages.length) return;
    var kb = window.SwatchPDF.downloadPDF(S.lastPages, {
      perPage: S.lastOpts.perPage,
      showNames: S.lastOpts.showNames,
      showHeaders: S.lastOpts.showHeaders,
      totalSheets: S.lastTotal,
      appName: APP_NAME,
      brandLine: BRAND_LINE
    }, 'rang-a4.pdf');
    toast('PDF exported - ' + S.lastPages.length + ' sheet' + (S.lastPages.length === 1 ? '' : 's') +
      ' (' + Math.max(1, Math.round(kb / 1024)) + ' KB)');
  }

  $('#btn-print').addEventListener('click', doPrint);
  $('#btn-export').addEventListener('click', doExport);
  $('#pv-print').addEventListener('click', function () { window.print(); });
  $('#pv-export').addEventListener('click', exportCurrent);

  // If the user prints via the browser menu without composing a document,
  // fall back to "everything" so the paper never comes out blank.
  window.addEventListener('beforeprint', function () {
    if (!$('#print-root').children.length) {
      var opts = {
        scope: 'all', order: 'catalog', pickedCols: [], perPage: 24,
        newPagePerCollection: true, showHeaders: true, showNames: true, range: ''
      };
      var pages = buildPages(opts);
      renderSheets({ opts: opts, pages: pages, total: pages.length });
    }
  });

  /* ---------------- keyboard ---------------- */

  function focusablesIn(scope) {
    return Array.prototype.slice
      .call(scope.querySelectorAll('button, input, select, textarea, [href], [tabindex="0"]'))
      .filter(function (el) { return !el.disabled && el.getClientRects().length > 0; });
  }

  document.addEventListener('keydown', function (e) {
    // trap Tab inside whichever layer is on top (compare > preview > modal)
    if (e.key === 'Tab') {
      var scope = cmp.classList.contains('show') ? cmp
        : pv.classList.contains('show') ? pv
        : (modal.classList.contains('show') ? modal : null);
      if (scope) {
        var els = focusablesIn(scope);
        if (!els.length) return;
        var first = els[0], last = els[els.length - 1];
        var active = document.activeElement;
        if (!scope.contains(active)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key === 'Escape') {
      if (!stepsPop.hidden) { openStepsPop(false); stepsBtn.focus(); return; }
      if (cmp.classList.contains('show')) { closeCompare(); return; }
      if (pv.classList.contains('show')) { closePreview(); return; }
      if (modal.classList.contains('show')) { closePrintModal(); return; }
      if (document.body.classList.contains('side-open')) {
        setDrawer(false);
        $('#menu-btn').focus();
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (pv.classList.contains('show')) { window.print(); return; }
      openPrintModal();
      return;
    }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      if (cmp.classList.contains('show') || pv.classList.contains('show') || modal.classList.contains('show')) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInput.focus();
      }
    }
  });

  /* ---------------- sidebar toggle (drawer on mobile, hide/show on desktop) ---------------- */

  var narrowMQ = window.matchMedia('(max-width: 1000px)');

  $('#menu-btn').addEventListener('click', function () {
    if (narrowMQ.matches) {
      setDrawer(!document.body.classList.contains('side-open'));
    } else {
      var hidden = document.body.classList.toggle('side-hidden');
      store('sb.sidehidden', hidden);
      syncMenuAria();
    }
  });
  narrowMQ.addEventListener('change', syncMenuAria);
  $('#side-scrim').addEventListener('click', function () {
    setDrawer(false);
    $('#menu-btn').focus();
  });

  /* ---------------- boot ---------------- */

  function boot() {
    var note = $('#boot-note');
    if (!COLLECTIONS.length) {
      note.textContent = 'No swatch data found - js/data.js failed to load.';
      return;
    }
    note.style.display = 'none';
    renderMain();
    renderSidebar();

    var savedMode = load('sb.mode', 'hex');
    if (savedMode !== 'hex') setValueMode(savedMode);

    var savedSel = load('sb.sel', []);
    if (Array.isArray(savedSel) && savedSel.length) {
      var valid = savedSel.filter(function (uid) { return BY_UID.has(uid); });
      if (valid.length) setSelection(valid, true);
    }
    syncSelectionUI();

    var savedView = load('sb.view', 'catalog');
    if (savedView === 'flow') setView('flow');

    if (load('sb.sidehidden', false) && !narrowMQ.matches) {
      document.body.classList.add('side-hidden');
    }
    syncMenuAria();

    var firstGroup = $('#side-nav .side-group');
    if (firstGroup) {
      firstGroup.classList.add('open');
      firstGroup.querySelector('.side-expand').setAttribute('aria-expanded', 'true');
    }

    requestAnimationFrame(setIntrinsicSizes);
  }

  boot();
})();
