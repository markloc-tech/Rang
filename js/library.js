/* ============================================================
   Rang library
   The user's own colors: projects (a named set of saved
   swatches) and custom categories (which the app browses as
   real collections alongside the built-in palettes).

   Everything lives in localStorage, and the whole thing can be
   written out to - or read back from - a portable ".rang" file
   so palettes can be handed around.

   No DOM here: this is the model, the persistence and the file
   format, nothing else.
   ============================================================ */

(function (global) {
  'use strict';

  var KEY = 'rang.library.v1';
  var FORMAT = 'rang';
  var VERSION = 1;
  var EXT = '.rang';

  /* Bounds. Imported files are untrusted input, so every one of these is
     enforced on the way in as well as on the way through the UI. */
  var MAX_ITEMS = 200;              // projects, and separately categories
  var MAX_COLORS = 2000;            // per project / category
  var MAX_NAME = 60;
  var MAX_DESC = 240;

  var Color = global.RangColor ||
    (typeof require !== 'undefined' ? require('./color.js') : null);

  /* ---------------- helpers ---------------- */

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function cleanText(v, max) {
    if (typeof v !== 'string') return '';
    // collapse whitespace and strip control characters; imported names end up
    // in the DOM and in PDF strings, so they must stay boring text
    return v.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function cleanHex(v) {
    return Color.parse(typeof v === 'string' ? v : '');
  }

  function isKind(kind) {
    return kind === 'projects' || kind === 'categories';
  }

  /* ---------------- state ---------------- */

  var data = { projects: [], categories: [] };
  var listeners = [];
  var lastError = null;

  function emit(detail) {
    listeners.slice().forEach(function (fn) {
      try { fn(detail || {}); } catch (e) { /* a bad listener must not stop the rest */ }
    });
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify({
        format: FORMAT, formatVersion: VERSION,
        projects: data.projects, categories: data.categories
      }));
      lastError = null;
      return true;
    } catch (e) {
      // private mode, or the quota is full - the in-memory copy stays usable
      lastError = e && e.name === 'QuotaExceededError'
        ? 'Browser storage is full - remove some colors or export to a .rang file.'
        : 'This browser will not let Rang save locally (private browsing?).';
      return false;
    }
  }

  function commit(detail) {
    var ok = save();
    emit(detail);
    return ok;
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    var doc = readDoc(parsed);
    if (doc.ok) {
      data.projects = doc.projects;
      data.categories = doc.categories;
    }
  }

  /* ---------------- reading a document ---------------- */

  /* Shared by localStorage load and .rang import: the stored blob and the
     file are the same shape, and both are treated as untrusted. */
  function readItem(raw, kind) {
    if (!raw || typeof raw !== 'object') return null;
    var name = cleanText(raw.name, MAX_NAME);
    if (!name) name = kind === 'projects' ? 'Untitled project' : 'Untitled category';

    var colors = [];
    var seenIds = {};
    var incoming = Array.isArray(raw.colors) ? raw.colors.slice(0, MAX_COLORS) : [];
    incoming.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var hex = cleanHex(c.hex);
      if (!hex) return;
      var id = cleanText(c.id, 40);
      if (!id || seenIds[id]) id = uid('c');
      seenIds[id] = 1;
      colors.push({
        id: id,
        name: cleanText(c.name, MAX_NAME) || hex,
        hex: hex,
        note: cleanText(c.note, MAX_DESC),
        sourceUid: cleanText(c.sourceUid, 160),
        addedAt: cleanText(c.addedAt, 40) || nowISO()
      });
    });

    return {
      id: cleanText(raw.id, 40) || uid(kind === 'projects' ? 'p' : 'g'),
      name: name,
      description: cleanText(raw.description, MAX_DESC),
      colors: colors,
      createdAt: cleanText(raw.createdAt, 40) || nowISO(),
      updatedAt: cleanText(raw.updatedAt, 40) || nowISO()
    };
  }

  function readList(raw, kind) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    raw.slice(0, MAX_ITEMS).forEach(function (r) {
      var item = readItem(r, kind);
      if (!item) return;
      if (seen[item.id]) item.id = uid(kind === 'projects' ? 'p' : 'g');
      seen[item.id] = 1;
      out.push(item);
    });
    return out;
  }

  /** Validate a parsed object as a Rang document. Never throws. */
  function readDoc(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'That file is not a Rang library.' };
    }
    if (raw.format !== FORMAT) {
      return { ok: false, error: 'That file is not a Rang library (no "rang" marker).' };
    }
    var v = raw.formatVersion;
    if (typeof v !== 'number' || v < 1) {
      return { ok: false, error: 'That file has no readable version number.' };
    }
    if (v > VERSION) {
      return {
        ok: false,
        error: 'That file was written by a newer version of Rang (format ' + v + ').'
      };
    }
    var projects = readList(raw.projects, 'projects');
    var categories = readList(raw.categories, 'categories');
    if (!projects.length && !categories.length) {
      return { ok: false, error: 'That file has no projects or categories in it.' };
    }
    return { ok: true, projects: projects, categories: categories };
  }

  /* ---------------- queries ---------------- */

  function list(kind) {
    return isKind(kind) ? data[kind] : [];
  }

  function get(kind, id) {
    if (!isKind(kind)) return null;
    for (var i = 0; i < data[kind].length; i++) {
      if (data[kind][i].id === id) return data[kind][i];
    }
    return null;
  }

  function totals() {
    function n(kind) {
      return data[kind].reduce(function (a, it) { return a + it.colors.length; }, 0);
    }
    return {
      projects: data.projects.length,
      categories: data.categories.length,
      projectColors: n('projects'),
      categoryColors: n('categories')
    };
  }

  /** A name that does not collide with anything already in `kind`. */
  function uniqueName(kind, name, ignoreId) {
    var base = cleanText(name, MAX_NAME) || 'Untitled';
    var taken = {};
    list(kind).forEach(function (it) {
      if (it.id !== ignoreId) taken[it.name.toLowerCase()] = 1;
    });
    if (!taken[base.toLowerCase()]) return base;
    for (var n = 2; n < 1000; n++) {
      var candidate = (base + ' ' + n).slice(0, MAX_NAME);
      if (!taken[candidate.toLowerCase()]) return candidate;
    }
    return base + ' ' + Date.now().toString(36);
  }

  /* ---------------- mutations ---------------- */

  function create(kind, name, description) {
    if (!isKind(kind)) return null;
    if (data[kind].length >= MAX_ITEMS) {
      lastError = 'You have reached the limit of ' + MAX_ITEMS + ' ' + kind + '.';
      return null;
    }
    var item = {
      id: uid(kind === 'projects' ? 'p' : 'g'),
      name: uniqueName(kind, name),
      description: cleanText(description, MAX_DESC),
      colors: [],
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    data[kind].push(item);
    commit({ kind: kind, id: item.id, action: 'create' });
    return item;
  }

  function update(kind, id, patch) {
    var item = get(kind, id);
    if (!item) return null;
    if (typeof patch.name === 'string') {
      item.name = uniqueName(kind, patch.name, id);
    }
    if (typeof patch.description === 'string') {
      item.description = cleanText(patch.description, MAX_DESC);
    }
    item.updatedAt = nowISO();
    commit({ kind: kind, id: id, action: 'update' });
    return item;
  }

  function remove(kind, id) {
    if (!isKind(kind)) return false;
    var before = data[kind].length;
    data[kind] = data[kind].filter(function (it) { return it.id !== id; });
    if (data[kind].length === before) return false;
    commit({ kind: kind, id: id, action: 'remove' });
    return true;
  }

  function duplicate(kind, id) {
    var item = get(kind, id);
    if (!item || data[kind].length >= MAX_ITEMS) return null;
    var copy = {
      id: uid(kind === 'projects' ? 'p' : 'g'),
      name: uniqueName(kind, item.name),
      description: item.description,
      colors: item.colors.map(function (c) {
        return {
          id: uid('c'), name: c.name, hex: c.hex,
          note: c.note, sourceUid: c.sourceUid, addedAt: nowISO()
        };
      }),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    data[kind].push(copy);
    commit({ kind: kind, id: copy.id, action: 'create' });
    return copy;
  }

  /**
   * colors: [{ name, hex, note, sourceUid }]. Returns
   * { added, skipped, duplicates } - `duplicates` counts colors already in
   * the set by hex, which are skipped rather than piling up.
   */
  function addColors(kind, id, colors, opts) {
    var item = get(kind, id);
    if (!item) return { added: 0, skipped: 0, duplicates: 0 };
    opts = opts || {};
    var have = {};
    item.colors.forEach(function (c) { have[c.hex] = 1; });

    var added = 0, skipped = 0, duplicates = 0;
    (colors || []).forEach(function (c) {
      var hex = cleanHex(c && c.hex);
      if (!hex) { skipped++; return; }
      if (have[hex] && !opts.allowDuplicates) { duplicates++; return; }
      if (item.colors.length >= MAX_COLORS) { skipped++; return; }
      have[hex] = 1;
      item.colors.push({
        id: uid('c'),
        name: cleanText(c.name, MAX_NAME) || hex,
        hex: hex,
        note: cleanText(c.note, MAX_DESC),
        sourceUid: cleanText(c.sourceUid, 160),
        addedAt: nowISO()
      });
      added++;
    });

    if (added) {
      item.updatedAt = nowISO();
      commit({ kind: kind, id: id, action: 'colors' });
    }
    return { added: added, skipped: skipped, duplicates: duplicates };
  }

  function updateColor(kind, id, colorId, patch) {
    var item = get(kind, id);
    if (!item) return false;
    var color = null;
    item.colors.forEach(function (c) { if (c.id === colorId) color = c; });
    if (!color) return false;
    if (typeof patch.name === 'string') color.name = cleanText(patch.name, MAX_NAME) || color.hex;
    if (typeof patch.note === 'string') color.note = cleanText(patch.note, MAX_DESC);
    if (typeof patch.hex === 'string') {
      var hex = cleanHex(patch.hex);
      if (hex) color.hex = hex;
    }
    item.updatedAt = nowISO();
    commit({ kind: kind, id: id, action: 'colors' });
    return true;
  }

  function removeColors(kind, id, colorIds) {
    var item = get(kind, id);
    if (!item) return 0;
    var kill = {};
    (colorIds || []).forEach(function (cid) { kill[cid] = 1; });
    var before = item.colors.length;
    item.colors = item.colors.filter(function (c) { return !kill[c.id]; });
    var gone = before - item.colors.length;
    if (gone) {
      item.updatedAt = nowISO();
      commit({ kind: kind, id: id, action: 'colors' });
    }
    return gone;
  }

  /** Reorder to exactly `orderedIds`; anything missing keeps its relative place. */
  function reorderColors(kind, id, orderedIds) {
    var item = get(kind, id);
    if (!item) return false;
    var index = {};
    orderedIds.forEach(function (cid, i) { index[cid] = i; });
    var tail = item.colors.length;
    item.colors.sort(function (a, b) {
      var ai = index[a.id] === undefined ? tail : index[a.id];
      var bi = index[b.id] === undefined ? tail : index[b.id];
      return ai - bi;
    });
    item.updatedAt = nowISO();
    commit({ kind: kind, id: id, action: 'colors' });
    return true;
  }

  /** mode: 'hue' | 'light' | 'dark' | 'name' | 'added' */
  function sortColors(kind, id, mode) {
    var item = get(kind, id);
    if (!item) return false;
    var keyed = item.colors.map(function (c, i) {
      var rgb = Color.hexToRgb(c.hex);
      var hsl = Color.rgbToHsl(rgb[0], rgb[1], rgb[2]);
      return { c: c, i: i, h: hsl[0], s: hsl[1], l: hsl[2] };
    });
    keyed.sort(function (a, b) {
      if (mode === 'name') return a.c.name.localeCompare(b.c.name) || a.i - b.i;
      if (mode === 'light') return b.l - a.l || a.i - b.i;
      if (mode === 'dark') return a.l - b.l || a.i - b.i;
      if (mode === 'added') return a.i - b.i;
      // hue: grays first so the wheel that follows reads clean
      var ag = a.s < 0.09 ? 0 : 1, bg = b.s < 0.09 ? 0 : 1;
      if (ag !== bg) return ag - bg;
      if (!ag) return b.l - a.l;
      return a.h - b.h || b.s - a.s || b.l - a.l;
    });
    item.colors = keyed.map(function (k) { return k.c; });
    item.updatedAt = nowISO();
    commit({ kind: kind, id: id, action: 'colors' });
    return true;
  }

  /* ---------------- .rang files ---------------- */

  /**
   * sel: omitted for the whole library, or { kind, ids: [] } for a subset.
   * The result is a plain object ready for JSON.stringify.
   */
  function serialize(sel) {
    var pick = function (kind) {
      if (!sel || !sel.kind) return data[kind];
      if (sel.kind !== kind) return [];
      return data[kind].filter(function (it) { return sel.ids.indexOf(it.id) !== -1; });
    };
    var projects = pick('projects');
    var categories = pick('categories');
    return {
      format: FORMAT,
      formatVersion: VERSION,
      app: 'Rang',
      kind: !sel || !sel.kind ? 'library' : (sel.kind === 'projects' ? 'project' : 'category'),
      exportedAt: nowISO(),
      projects: projects,
      categories: categories
    };
  }

  function parseFile(text) {
    var raw;
    try {
      raw = JSON.parse(String(text));
    } catch (e) {
      return { ok: false, error: 'That file is not readable JSON.' };
    }
    return readDoc(raw);
  }

  /**
   * mode:
   *   'copy'    add everything alongside what is already here (default)
   *   'merge'   fold colors into the same-named project/category
   *   'replace' same-named items are overwritten wholesale
   * Returns a summary of what actually happened.
   */
  function importDoc(doc, mode) {
    if (!doc || !doc.ok) return null;
    mode = mode === 'merge' || mode === 'replace' ? mode : 'copy';
    var summary = {
      projects: 0, categories: 0, colors: 0,
      mergedInto: 0, replaced: 0, skipped: 0
    };

    ['projects', 'categories'].forEach(function (kind) {
      doc[kind].forEach(function (incoming) {
        var existing = null;
        if (mode !== 'copy') {
          list(kind).forEach(function (it) {
            if (it.name.toLowerCase() === incoming.name.toLowerCase()) existing = it;
          });
        }

        if (existing && mode === 'merge') {
          var have = {};
          existing.colors.forEach(function (c) { have[c.hex] = 1; });
          incoming.colors.forEach(function (c) {
            if (have[c.hex] || existing.colors.length >= MAX_COLORS) { summary.skipped++; return; }
            have[c.hex] = 1;
            existing.colors.push({
              id: uid('c'), name: c.name, hex: c.hex,
              note: c.note, sourceUid: '', addedAt: nowISO()
            });
            summary.colors++;
          });
          existing.updatedAt = nowISO();
          summary.mergedInto++;
          return;
        }

        if (existing && mode === 'replace') {
          existing.description = incoming.description;
          existing.colors = incoming.colors.map(function (c) {
            return {
              id: uid('c'), name: c.name, hex: c.hex,
              note: c.note, sourceUid: '', addedAt: nowISO()
            };
          });
          existing.updatedAt = nowISO();
          summary.colors += existing.colors.length;
          summary.replaced++;
          return;
        }

        if (data[kind].length >= MAX_ITEMS) { summary.skipped++; return; }
        var item = {
          id: uid(kind === 'projects' ? 'p' : 'g'),
          name: uniqueName(kind, incoming.name),
          description: incoming.description,
          colors: incoming.colors.map(function (c) {
            return {
              id: uid('c'), name: c.name, hex: c.hex,
              note: c.note, sourceUid: '', addedAt: nowISO()
            };
          }),
          createdAt: nowISO(),
          updatedAt: nowISO()
        };
        data[kind].push(item);
        summary[kind]++;
        summary.colors += item.colors.length;
      });
    });

    commit({ action: 'import' });
    return summary;
  }

  function clearAll() {
    data.projects = [];
    data.categories = [];
    commit({ action: 'clear' });
  }

  /** A safe file name stem for an item, e.g. "Brand palette" -> "brand-palette". */
  function slug(name) {
    var s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 48);
    return s || 'rang';
  }

  load();

  var api = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    EXT: EXT,
    MAX_ITEMS: MAX_ITEMS,
    MAX_COLORS: MAX_COLORS,
    MAX_NAME: MAX_NAME,
    MAX_DESC: MAX_DESC,

    list: list,
    get: get,
    totals: totals,
    uniqueName: uniqueName,

    create: create,
    update: update,
    remove: remove,
    duplicate: duplicate,
    addColors: addColors,
    updateColor: updateColor,
    removeColors: removeColors,
    reorderColors: reorderColors,
    sortColors: sortColors,
    clearAll: clearAll,

    serialize: serialize,
    parseFile: parseFile,
    importDoc: importDoc,
    slug: slug,

    lastError: function () { return lastError; },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (f) { return f !== fn; });
      };
    },
    /* test seam: reload from storage (used by the .rang round-trip check) */
    reload: function () { data = { projects: [], categories: [] }; load(); }
  };

  global.RangLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
