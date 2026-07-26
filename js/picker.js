/* ============================================================
   Rang color picker
   A full colour editor in a dialog: saturation/brightness
   field, hue slider, four live-linked value formats, the
   system eyedropper where the browser has one, recent colors,
   the nearest match in the book, and a bulk-paste mode that
   pulls every color out of whatever you drop in it.

   Usage:
     RangPicker.open({
       hex, name, title, submitLabel,
       showName: true,        // include the "Name" field
       allowBulk: true,       // offer the Paste-a-list tab
       nearest: fn(hex),      // -> { name, hex, colName } | null
       onSubmit: fn(result)   // { colors: [{ hex, name }] }
     });
   ============================================================ */

(function (global) {
  'use strict';

  var C = global.RangColor;
  var RECENT_KEY = 'rang.recent';
  var MAX_RECENT = 18;

  var el = null;                    // root, built once
  var refs = {};
  var state = {
    h: 0, s: 1, v: 1,               // HSV is what the field edits
    hex: '#FF0000',
    opts: null,
    open: false,
    tab: 'pick',
    lastFocus: null
  };

  /* ---------------- recents ---------------- */

  function recents() {
    try {
      var v = JSON.parse(global.localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (h) { return C.parse(h); }).slice(0, MAX_RECENT) : [];
    } catch (e) { return []; }
  }

  function remember(hex) {
    var list = recents().filter(function (h) { return h !== hex; });
    list.unshift(hex);
    try {
      global.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch (e) { /* private mode */ }
  }

  /* ---------------- DOM ---------------- */

  var SVG_DROPPER =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.5 2.5a2.1 2.1 0 0 1 3 3L7 12l-3.5.5L4 9z"/><path d="M9 4.5 11.5 7"/></svg>';

  function field(label, id, hint) {
    return '<label class="pk-field"><span>' + label + '</span>' +
      '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" ' +
      'spellcheck="false" aria-label="' + hint + '"></label>';
  }

  function build() {
    el = document.createElement('div');
    el.className = 'modal-backdrop pk-backdrop';
    el.id = 'pk-backdrop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'pk-title');
    el.innerHTML =
      '<div class="modal pk-modal">' +
        '<div class="modal-head">' +
          '<h2 id="pk-title">Add a color</h2>' +
          '<button class="modal-close" id="pk-close" aria-label="Close">' +
            '<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>' +
          '</button>' +
        '</div>' +

        '<div class="pk-tabs" id="pk-tabs" role="tablist">' +
          '<button role="tab" data-tab="pick" class="on" aria-selected="true">Pick a color</button>' +
          '<button role="tab" data-tab="bulk" aria-selected="false">Paste a list</button>' +
        '</div>' +

        '<div class="modal-body pk-body">' +
          '<div class="pk-pane" id="pk-pane-pick">' +
            '<div class="pk-cols">' +
            '<div class="pk-left">' +
            '<div class="pk-sv" id="pk-sv" tabindex="0" role="slider" ' +
                 'aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">' +
              '<div class="pk-sv-sat"></div><div class="pk-sv-val"></div>' +
              '<span class="pk-handle" id="pk-sv-handle"></span>' +
            '</div>' +
            '<input type="range" class="pk-hue" id="pk-hue" min="0" max="359" step="1" value="0" aria-label="Hue">' +
            '</div>' +

            '<div class="pk-right">' +
            '<div class="pk-main">' +
              '<span class="pk-preview" id="pk-preview"></span>' +
              '<label class="pk-field pk-hex"><span>HEX</span>' +
                '<input id="pk-in-hex" type="text" autocomplete="off" spellcheck="false" ' +
                'aria-label="Hex value - also accepts rgb(), hsl() and CSS color names"></label>' +
              '<button class="ghost-btn pk-dropper" id="pk-dropper" title="Pick a color from the screen" hidden>' +
                SVG_DROPPER + '</button>' +
            '</div>' +

            '<div class="pk-grid">' +
              '<div class="pk-trio" role="group" aria-label="RGB">' +
                field('R', 'pk-in-r', 'Red 0-255') + field('G', 'pk-in-g', 'Green 0-255') + field('B', 'pk-in-b', 'Blue 0-255') +
              '</div>' +
              '<div class="pk-trio" role="group" aria-label="HSL">' +
                field('H', 'pk-in-h', 'Hue 0-359') + field('S', 'pk-in-s', 'Saturation percent') + field('L', 'pk-in-l', 'Lightness percent') +
              '</div>' +
              '<div class="pk-trio pk-quad" role="group" aria-label="CMYK">' +
                field('C', 'pk-in-c', 'Cyan percent') + field('M', 'pk-in-m', 'Magenta percent') +
                field('Y', 'pk-in-y', 'Yellow percent') + field('K', 'pk-in-k', 'Key percent') +
              '</div>' +
            '</div>' +

            '<div class="pk-info">' +
              '<span class="pk-contrast" id="pk-contrast"></span>' +
              '<button class="pk-near" id="pk-near" hidden></button>' +
            '</div>' +
            '</div>' +

            '<div class="pk-recent-wrap" id="pk-recent-wrap" hidden>' +
              '<span class="field-label">Recent</span>' +
              '<div class="pk-recent" id="pk-recent"></div>' +
            '</div>' +
            '</div>' +

            '<label class="pk-name" id="pk-name-wrap">' +
              '<span class="field-label">Name</span>' +
              '<input id="pk-in-name" type="text" maxlength="60" autocomplete="off" ' +
              'placeholder="Optional - defaults to the hex" aria-label="Color name">' +
            '</label>' +
          '</div>' +

          '<div class="pk-pane" id="pk-pane-bulk" hidden>' +
            '<p class="pk-hint">Paste anything with colors in it – a CSS file, a JSON palette, a column of hex codes. ' +
            'Rang finds <code>#hex</code>, <code>rgb()</code>, <code>hsl()</code> and CSS color names, in order, without duplicates.</p>' +
            '<textarea id="pk-bulk" rows="7" spellcheck="false" aria-label="Paste colors" ' +
              'placeholder="#0A0A0A&#10;rgb(239, 68, 68)&#10;hsl(210 100% 50%)&#10;tomato"></textarea>' +
            '<div class="pk-found" id="pk-found"></div>' +
          '</div>' +
        '</div>' +

        '<div class="modal-foot">' +
          '<span class="doc-stats" id="pk-stats"></span>' +
          '<button class="ghost-btn" id="pk-cancel">Cancel</button>' +
          '<button class="primary-btn" id="pk-submit">Add color</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    [
      'sv', 'sv-handle', 'hue', 'preview', 'in-hex', 'dropper', 'in-r', 'in-g', 'in-b',
      'in-h', 'in-s', 'in-l', 'in-c', 'in-m', 'in-y', 'in-k', 'contrast', 'near',
      'recent', 'recent-wrap', 'in-name', 'name-wrap', 'bulk', 'found', 'stats',
      'submit', 'cancel', 'close', 'title', 'tabs', 'pane-pick', 'pane-bulk'
    ].forEach(function (k) {
      refs[k] = el.querySelector('#pk-' + k);
    });

    wire();
  }

  /* ---------------- value plumbing ---------------- */

  function setFromHex(hex, skipInput) {
    var rgb = C.hexToRgb(hex);
    var hsv = C.rgbToHsv(rgb[0], rgb[1], rgb[2]);
    // a gray has no meaningful hue: keep the slider where the user left it
    if (hsv[1] > 0.0001) state.h = hsv[0];
    state.s = hsv[1];
    state.v = hsv[2];
    state.hex = hex;
    render(skipInput);
  }

  function setFromHsv() {
    var rgb = C.hsvToRgb(state.h, state.s, state.v);
    state.hex = C.rgbToHex(rgb[0], rgb[1], rgb[2]);
    render();
  }

  function num(v, fallback) {
    var n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? fallback : n;
  }

  function render(skipHexInput) {
    var hex = state.hex;
    var rgb = C.hexToRgb(hex);
    var hsl = C.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var cmyk = C.hexToCmyk(hex);

    refs.sv.style.setProperty('--hue', 'hsl(' + Math.round(state.h) + ', 100%, 50%)');
    refs['sv-handle'].style.left = (state.s * 100) + '%';
    refs['sv-handle'].style.top = ((1 - state.v) * 100) + '%';
    refs['sv-handle'].style.background = hex;
    refs.sv.setAttribute('aria-valuenow', Math.round(state.v * 100));
    refs.sv.setAttribute('aria-valuetext',
      Math.round(state.s * 100) + '% saturation, ' + Math.round(state.v * 100) + '% brightness');
    refs.hue.value = Math.round(state.h);
    refs.preview.style.background = hex;

    if (!skipHexInput) refs['in-hex'].value = hex;
    refs['in-hex'].classList.remove('invalid');
    refs['in-r'].value = rgb[0];
    refs['in-g'].value = rgb[1];
    refs['in-b'].value = rgb[2];
    refs['in-h'].value = Math.round(hsl[0]);
    refs['in-s'].value = Math.round(hsl[1] * 100);
    refs['in-l'].value = Math.round(hsl[2] * 100);
    refs['in-c'].value = cmyk[0];
    refs['in-m'].value = cmyk[1];
    refs['in-y'].value = cmyk[2];
    refs['in-k'].value = cmyk[3];

    var onWhite = C.contrast(hex, '#FFFFFF');
    var onBlack = C.contrast(hex, '#000000');
    refs.contrast.textContent = 'Contrast ' + onWhite.toFixed(2) + ':1 on white · ' +
      onBlack.toFixed(2) + ':1 on black';

    var near = state.opts && state.opts.nearest ? state.opts.nearest(hex) : null;
    if (near) {
      refs.near.hidden = false;
      refs.near.innerHTML = '<span class="pk-near-chip" style="background:' + near.hex + '"></span>' +
        '<span class="pk-near-text">Nearest in book: <strong></strong></span>';
      refs.near.querySelector('strong').textContent =
        near.name + (near.hex === hex ? '' : ' · ' + near.hex);
      refs.near.title = near.hex === hex ? 'Exactly this color' : 'Snap to ' + near.hex;
      refs.near.dataset.hex = near.hex;
      refs.near.classList.toggle('exact', near.hex === hex);
    } else {
      refs.near.hidden = true;
    }
  }

  function renderRecents() {
    var list = recents();
    refs['recent-wrap'].hidden = list.length === 0;
    refs.recent.innerHTML = list.map(function (h) {
      return '<button class="pk-swatch" style="background:' + h + '" data-hex="' + h +
        '" title="' + h + '" aria-label="Use ' + h + '"></button>';
    }).join('');
  }

  function renderFound() {
    var found = C.parseList(refs.bulk.value);
    state.found = found;
    if (!found.length) {
      refs.found.innerHTML = '<span class="pk-found-none">No colors found yet.</span>';
    } else {
      refs.found.innerHTML = '<span class="pk-found-n">' + found.length + ' color' +
        (found.length === 1 ? '' : 's') + ' found</span>' +
        '<span class="pk-found-strip">' + found.slice(0, 120).map(function (h) {
          return '<i style="background:' + h + '" title="' + h + '"></i>';
        }).join('') + (found.length > 120 ? '<em>+' + (found.length - 120) + '</em>' : '') + '</span>';
    }
    syncFoot();
  }

  function syncFoot() {
    if (state.tab === 'bulk') {
      var n = (state.found || []).length;
      refs.submit.disabled = n === 0;
      refs.submit.textContent = n > 1 ? 'Add ' + n + ' colors' : 'Add color';
      refs.stats.textContent = '';
    } else {
      refs.submit.disabled = false;
      refs.submit.textContent = (state.opts && state.opts.submitLabel) || 'Add color';
      refs.stats.textContent = '';
    }
  }

  /* ---------------- interaction ---------------- */

  function pointFromEvent(e) {
    var r = refs.sv.getBoundingClientRect();
    state.s = C.clamp((e.clientX - r.left) / r.width, 0, 1);
    state.v = C.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    setFromHsv();
  }

  function wire() {
    /* saturation / brightness field */
    refs.sv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      refs.sv.focus();
      refs.sv.setPointerCapture(e.pointerId);
      pointFromEvent(e);
    });
    refs.sv.addEventListener('pointermove', function (e) {
      if (refs.sv.hasPointerCapture && refs.sv.hasPointerCapture(e.pointerId)) pointFromEvent(e);
    });
    refs.sv.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.1 : 0.01;
      var handled = true;
      if (e.key === 'ArrowLeft') state.s = C.clamp(state.s - step, 0, 1);
      else if (e.key === 'ArrowRight') state.s = C.clamp(state.s + step, 0, 1);
      else if (e.key === 'ArrowUp') state.v = C.clamp(state.v + step, 0, 1);
      else if (e.key === 'ArrowDown') state.v = C.clamp(state.v - step, 0, 1);
      else handled = false;
      if (handled) { e.preventDefault(); setFromHsv(); }
    });

    refs.hue.addEventListener('input', function () {
      state.h = parseInt(refs.hue.value, 10) || 0;
      setFromHsv();
    });

    /* hex accepts anything RangColor can parse */
    refs['in-hex'].addEventListener('input', function () {
      var hex = C.parse(refs['in-hex'].value);
      if (hex) setFromHex(hex, true);
      else refs['in-hex'].classList.toggle('invalid', refs['in-hex'].value.trim().length > 0);
    });
    refs['in-hex'].addEventListener('blur', function () { render(); });

    function trio(ids, toHex) {
      ids.forEach(function (id) {
        refs[id].addEventListener('input', function () {
          var hex = toHex();
          if (hex) setFromHex(hex, false);
        });
      });
    }
    trio(['in-r', 'in-g', 'in-b'], function () {
      return C.rgbToHex(
        C.clamp(num(refs['in-r'].value, 0), 0, 255),
        C.clamp(num(refs['in-g'].value, 0), 0, 255),
        C.clamp(num(refs['in-b'].value, 0), 0, 255)
      );
    });
    trio(['in-h', 'in-s', 'in-l'], function () {
      var rgb = C.hslToRgb(
        num(refs['in-h'].value, 0),
        C.clamp(num(refs['in-s'].value, 0) / 100, 0, 1),
        C.clamp(num(refs['in-l'].value, 0) / 100, 0, 1)
      );
      return C.rgbToHex(rgb[0], rgb[1], rgb[2]);
    });
    trio(['in-c', 'in-m', 'in-y', 'in-k'], function () {
      var rgb = C.cmykToRgb(
        C.clamp(num(refs['in-c'].value, 0), 0, 100),
        C.clamp(num(refs['in-m'].value, 0), 0, 100),
        C.clamp(num(refs['in-y'].value, 0), 0, 100),
        C.clamp(num(refs['in-k'].value, 0), 0, 100)
      );
      return C.rgbToHex(rgb[0], rgb[1], rgb[2]);
    });

    refs.dropper.addEventListener('click', function () {
      if (!global.EyeDropper) return;
      new global.EyeDropper().open().then(function (res) {
        var hex = C.parse(res.sRGBHex);
        if (hex) setFromHex(hex);
      }, function () { /* the user pressed Escape */ });
    });

    refs.near.addEventListener('click', function () {
      var hex = refs.near.dataset.hex;
      if (!hex) return;
      if (state.opts.showName !== false && !refs['in-name'].value.trim()) {
        var near = state.opts.nearest ? state.opts.nearest(hex) : null;
        if (near) refs['in-name'].value = near.name;
      }
      setFromHex(hex);
    });

    refs.recent.addEventListener('click', function (e) {
      var b = e.target.closest('.pk-swatch');
      if (b) setFromHex(b.dataset.hex);
    });

    refs.bulk.addEventListener('input', renderFound);

    el.querySelectorAll('#pk-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });

    refs.cancel.addEventListener('click', close);
    refs.close.addEventListener('click', close);
    el.addEventListener('mousedown', function (e) { if (e.target === el) close(); });
    refs.submit.addEventListener('click', submit);

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Enter' && state.tab === 'pick' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        submit();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if (e.key === 'Tab') {
        e.stopPropagation();            // the picker is always the top layer
        var els = Array.prototype.slice
          .call(el.querySelectorAll('button, input, textarea, [tabindex="0"]'))
          .filter(function (n) { return !n.disabled && n.getClientRects().length; });
        if (!els.length) return;
        var first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function setTab(tab) {
    state.tab = tab;
    refs['pane-pick'].hidden = tab !== 'pick';
    refs['pane-bulk'].hidden = tab !== 'bulk';
    el.querySelectorAll('#pk-tabs button').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (tab === 'bulk') { renderFound(); refs.bulk.focus(); }
    syncFoot();
  }

  function submit() {
    var out;
    if (state.tab === 'bulk') {
      var found = state.found || [];
      if (!found.length) return;
      out = found.map(function (hex) { return { hex: hex, name: hex }; });
    } else {
      remember(state.hex);
      out = [{
        hex: state.hex,
        name: (state.opts.showName === false ? '' : refs['in-name'].value.trim()) || state.hex
      }];
    }
    var fn = state.opts.onSubmit;
    close();
    if (fn) fn({ colors: out });
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    el.classList.remove('show');
    if (state.lastFocus && document.contains(state.lastFocus) && state.lastFocus.getClientRects().length) {
      state.lastFocus.focus();
    }
    if (state.opts && state.opts.onClose) state.opts.onClose();
  }

  function open(opts) {
    if (!el) build();
    state.opts = opts || {};
    state.lastFocus = document.activeElement;
    state.found = [];

    refs.title.textContent = opts.title || 'Add a color';
    refs['name-wrap'].hidden = opts.showName === false;
    refs['in-name'].value = opts.name || '';
    refs.bulk.value = '';
    refs.dropper.hidden = !global.EyeDropper;
    el.querySelector('#pk-tabs').hidden = opts.allowBulk === false;
    renderRecents();
    setTab('pick');
    setFromHex(C.parse(opts.hex || '') || '#3B82F6');

    state.open = true;
    el.classList.add('show');
    // the field is the point of the dialog - put the caret in the hex box,
    // which is the fastest way in for anyone who already knows the value
    setTimeout(function () { refs['in-hex'].select(); }, 0);
  }

  global.RangPicker = {
    open: open,
    close: close,
    isOpen: function () { return state.open; },
    recents: recents
  };
})(typeof window !== 'undefined' ? window : globalThis);
