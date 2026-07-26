/* ============================================================
   Rang library UI
   The hub for the user's own colors: projects (a saved set of
   swatches) and categories (which the book browses as real
   collections). Create, name, reorder, print, and hand the
   whole thing to someone else as a .rang file.

   js/library.js owns the data; js/app.js owns the book. This
   file is only the surface between them, and it talks to the
   app through the small window.RangApp bridge.
   ============================================================ */

(function (global) {
  'use strict';

  var LIB = global.RangLibrary;
  var C = global.RangColor;

  function App() { return global.RangApp || {}; }
  function toast(msg, hex) { if (App().toast) App().toast(msg, hex); }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  var KIND_LABEL = { projects: 'project', categories: 'category' };

  /* ---------------- overlay ---------------- */

  var root = null;
  var state = { open: false, tab: 'projects', id: null, lastFocus: null };
  var menuCloser = null;
  /* Set while an inline name edit is being committed. The library fires a
     change event, and re-rendering mid-edit would tear the input the user is
     tabbing out of out from under them, so those commits patch the DOM in
     place instead. */
  var inlineEdit = false;

  var ICON = {
    back: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    plus: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 1.5v9M1.5 6h9"/></svg>',
    x: '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
    drag: '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/><circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/><circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></svg>'
  };

  function build() {
    root = $('#lib-overlay');
    root.innerHTML =
      '<div class="lib-bar">' +
        '<button class="icon-btn" id="lb-back" aria-label="Close library" title="Back">' + ICON.back + '</button>' +
        '<span class="pv-title">Your library</span>' +
        '<div class="mini-seg" id="lb-tabs" role="group" aria-label="Library section">' +
          '<button data-tab="projects" class="on">Projects</button>' +
          '<button data-tab="categories">Categories</button>' +
        '</div>' +
        '<div class="topbar-spacer"></div>' +
        '<button class="ghost-btn" id="lb-import">Import .rang</button>' +
        '<button class="ghost-btn" id="lb-export-all">Export all</button>' +
        '<button class="primary-btn" id="lb-new">' + ICON.plus + ' <span id="lb-new-label">New project</span></button>' +
      '</div>' +
      '<div class="lib-body">' +
        '<div class="lib-list" id="lb-list" aria-label="Saved items"></div>' +
        '<div class="lib-detail" id="lb-detail"></div>' +
      '</div>' +
      '<input type="file" id="lb-file" accept=".rang,application/json" hidden>';

    $('#lb-back').addEventListener('click', close);
    $('#lb-import').addEventListener('click', importFlow);
    $('#lb-export-all').addEventListener('click', exportAll);
    $('#lb-new').addEventListener('click', function () { createFlow(state.tab); });
    $$('#lb-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });
    $('#lb-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) readRangFile(file);
    });

    /* drop a .rang file anywhere on the panel */
    root.addEventListener('dragover', function (e) {
      if (!state.open) return;
      e.preventDefault();
      root.classList.add('drop-hot');
    });
    root.addEventListener('dragleave', function (e) {
      if (e.target === root) root.classList.remove('drop-hot');
    });
    root.addEventListener('drop', function (e) {
      e.preventDefault();
      root.classList.remove('drop-hot');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) readRangFile(file);
    });

    root.addEventListener('keydown', function (e) {
      if (dialogOpen() || (global.RangPicker && global.RangPicker.isOpen())) return;
      // Tab is trapped centrally in app.js, which knows the whole stack
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });

    LIB.subscribe(function () {
      if (state.open && !inlineEdit) render();
    });
  }

  function open(tab, id) {
    if (!root) build();
    state.lastFocus = document.activeElement;
    if (tab) state.tab = tab === 'categories' ? 'categories' : 'projects';
    if (id) state.id = id;
    state.open = true;
    root.classList.add('show');
    render();
    $('#lb-back').focus();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    root.classList.remove('show');
    if (state.lastFocus && document.contains(state.lastFocus) &&
        state.lastFocus.getClientRects().length) {
      state.lastFocus.focus();
    }
  }

  function setTab(tab) {
    state.tab = tab;
    state.id = null;
    render();
  }

  /* ---------------- rendering ---------------- */

  function currentItem() {
    var items = LIB.list(state.tab);
    if (!items.length) return null;
    var found = state.id ? LIB.get(state.tab, state.id) : null;
    if (!found) found = items[0];
    state.id = found.id;
    return found;
  }

  function render() {
    if (!state.open) return;
    $$('#lb-tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === state.tab);
    });
    $('#lb-new-label').textContent = 'New ' + KIND_LABEL[state.tab];
    renderList();
    renderDetail();
  }

  function renderList() {
    var wrap = $('#lb-list');
    var items = LIB.list(state.tab);
    var item = currentItem();
    wrap.innerHTML = '';

    if (!items.length) {
      wrap.innerHTML = '<p class="lib-list-empty">Nothing here yet.</p>';
      return;
    }

    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'lib-item' + (item && it.id === item.id ? ' on' : '');
      var strip = it.colors.slice(0, 8).map(function (c) {
        return '<i style="background:' + c.hex + '"></i>';
      }).join('');
      b.innerHTML =
        '<span class="lib-item-name"></span>' +
        '<span class="lib-item-strip">' + strip + '</span>' +
        '<span class="lib-item-n">' + it.colors.length + '</span>';
      b.querySelector('.lib-item-name').textContent = it.name;
      b.addEventListener('click', function () {
        state.id = it.id;
        render();
      });
      wrap.appendChild(b);
    });
  }

  function renderDetail() {
    var wrap = $('#lb-detail');
    var item = currentItem();
    var kind = state.tab;

    if (!item) {
      wrap.innerHTML =
        '<div class="lib-blank">' +
          '<h3>No ' + KIND_LABEL[kind] + 's yet</h3>' +
          '<p>' + (kind === 'projects'
            ? 'A project is a saved set of colors - pick swatches anywhere in the book and save them here, or build one from scratch.'
            : 'A category becomes part of the book: it appears in the catalog, in search, in Flow and in print, right alongside Tailwind and the rest.') +
          '</p>' +
          '<div class="lib-blank-actions">' +
            '<button class="primary-btn" id="lb-blank-new">' + ICON.plus + ' New ' + KIND_LABEL[kind] + '</button>' +
            '<button class="ghost-btn" id="lb-blank-import">Import a .rang file</button>' +
          '</div>' +
        '</div>';
      $('#lb-blank-new').addEventListener('click', function () { createFlow(kind); });
      $('#lb-blank-import').addEventListener('click', importFlow);
      return;
    }

    wrap.innerHTML =
      '<div class="lib-head">' +
        '<div class="lib-head-text">' +
          '<input class="lib-title" id="lb-name" maxlength="' + LIB.MAX_NAME + '" aria-label="Name">' +
          '<input class="lib-desc" id="lb-desc" maxlength="' + LIB.MAX_DESC + '" ' +
            'placeholder="Add a description…" aria-label="Description">' +
        '</div>' +
        '<div class="lib-head-meta">' +
          '<span>' + plural(item.colors.length, 'color') + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="lib-tools">' +
        '<button class="primary-btn" id="lb-add">' + ICON.plus + ' Add colors</button>' +
        '<button class="ghost-btn" id="lb-add-sel">From selection</button>' +
        '<span class="lib-tools-gap"></span>' +
        '<button class="ghost-btn" id="lb-compare">Compare</button>' +
        '<button class="ghost-btn" id="lb-print">Print &amp; export</button>' +
        (kind === 'categories' ? '<button class="ghost-btn" id="lb-goto">Show in book</button>' : '') +
        '<div class="lib-menu-wrap">' +
          '<button class="ghost-btn" id="lb-more" aria-haspopup="true" aria-expanded="false">More ▾</button>' +
          '<div class="lib-menu" id="lb-menu" hidden>' +
            '<button data-act="sort-hue">Sort by hue</button>' +
            '<button data-act="sort-light">Sort light → dark</button>' +
            '<button data-act="sort-name">Sort by name</button>' +
            '<hr>' +
            '<button data-act="export">Export as .rang</button>' +
            '<button data-act="duplicate">Duplicate</button>' +
            '<button data-act="delete" class="danger">Delete ' + KIND_LABEL[kind] + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="lib-colors" id="lb-colors"></div>';

    var nameInput = $('#lb-name');
    nameInput.value = item.name;
    nameInput.addEventListener('change', function () {
      inlineEdit = true;
      LIB.update(kind, item.id, { name: nameInput.value });
      inlineEdit = false;
      nameInput.value = item.name;      // the library de-duplicates names
      renderList();
    });
    var descInput = $('#lb-desc');
    descInput.value = item.description;
    descInput.addEventListener('change', function () {
      inlineEdit = true;
      LIB.update(kind, item.id, { description: descInput.value });
      inlineEdit = false;
      descInput.value = item.description;
    });
    [nameInput, descInput].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') i.blur(); });
    });

    $('#lb-add').addEventListener('click', function () { addColorsTo(kind, item.id); });
    $('#lb-add-sel').addEventListener('click', function () {
      var recs = App().selectedRecords ? App().selectedRecords() : [];
      if (!recs.length) { toast('Select swatches in the book first'); return; }
      openSaveDialog(recs, { kind: kind, id: item.id });
    });
    $('#lb-compare').addEventListener('click', function () {
      if (item.colors.length < 1) { toast('Nothing to compare yet'); return; }
      close();
      App().compare(item.colors.map(function (c) { return { name: c.name, hex: c.hex }; }), item.name);
    });
    $('#lb-print').addEventListener('click', function () {
      if (!item.colors.length) { toast('Nothing to print yet'); return; }
      close();
      if (kind === 'projects') App().openPrint('project', { projectId: item.id });
      else App().openPrint('collections', { collectionId: 'cat:' + item.id });
    });
    if (kind === 'categories') {
      $('#lb-goto').addEventListener('click', function () {
        close();
        App().goToCategory(item.id);
      });
    }

    var menu = $('#lb-menu');
    var moreBtn = $('#lb-more');
    moreBtn.addEventListener('click', function () {
      menu.hidden = !menu.hidden;
      moreBtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    // one document listener, replaced each render - the detail pane is rebuilt
    // on every library change, so adding one per render would pile up
    if (menuCloser) document.removeEventListener('mousedown', menuCloser);
    menuCloser = function (e) {
      var wrap = $('.lib-menu-wrap');
      if (!menu.hidden && !(wrap && wrap.contains(e.target))) {
        menu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('mousedown', menuCloser);
    $$('#lb-menu button').forEach(function (b) {
      b.addEventListener('click', function () {
        menu.hidden = true;
        itemAction(kind, item.id, b.dataset.act);
      });
    });

    renderColors(kind, item);
  }

  function renderColors(kind, item) {
    var wrap = $('#lb-colors');
    wrap.innerHTML = '';

    if (!item.colors.length) {
      var empty = document.createElement('button');
      empty.className = 'own-empty';
      empty.innerHTML = '<strong>No colors yet</strong>' +
        '<span>Add one by hex or with the picker, paste a whole palette at once, or save the swatches you have selected in the book.</span>';
      empty.addEventListener('click', function () { addColorsTo(kind, item.id); });
      wrap.appendChild(empty);
      return;
    }

    item.colors.forEach(function (c, i) {
      var tile = document.createElement('div');
      tile.className = 'lib-color';
      tile.draggable = true;
      tile.dataset.id = c.id;
      tile.dataset.index = i;
      tile.innerHTML =
        '<button class="lib-chip" style="background:' + c.hex + '" title="Edit this color" ' +
          'aria-label="Edit ' + esc(c.name) + '"><span class="lib-chip-grip">' + ICON.drag + '</span></button>' +
        '<div class="lib-color-meta">' +
          '<input class="lib-color-name" maxlength="' + LIB.MAX_NAME + '" aria-label="Name of ' + esc(c.hex) + '">' +
          '<button class="lib-color-hex" title="Copy value">' + esc(c.hex) + '</button>' +
        '</div>' +
        '<button class="lib-color-x" aria-label="Remove ' + esc(c.name) + '" title="Remove">' + ICON.x + '</button>';

      var nameEl = $('.lib-color-name', tile);
      nameEl.value = c.name;
      nameEl.addEventListener('change', function () {
        inlineEdit = true;
        LIB.updateColor(kind, item.id, c.id, { name: nameEl.value });
        inlineEdit = false;
        nameEl.value = c.name;          // show what was actually stored
        $('.lib-color-x', tile).setAttribute('aria-label', 'Remove ' + c.name);
      });
      nameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameEl.blur(); });

      $('.lib-chip', tile).addEventListener('click', function () {
        editColor(kind, item.id, c.id);
      });
      $('.lib-color-hex', tile).addEventListener('click', function () {
        if (App().copyValue) App().copyValue(c.hex);
      });
      $('.lib-color-x', tile).addEventListener('click', function () {
        LIB.removeColors(kind, item.id, [c.id]);
        toast('Removed ' + c.name);
      });

      wireDrag(tile, kind, item);
      wrap.appendChild(tile);
    });
  }

  /* drag to reorder */
  var dragId = null;
  function wireDrag(tile, kind, item) {
    tile.addEventListener('dragstart', function (e) {
      dragId = tile.dataset.id;
      tile.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      }
    });
    tile.addEventListener('dragend', function () {
      tile.classList.remove('dragging');
      $$('.lib-color').forEach(function (t) { t.classList.remove('drop-before'); });
      dragId = null;
    });
    tile.addEventListener('dragover', function (e) {
      if (!dragId || dragId === tile.dataset.id) return;
      e.preventDefault();
      tile.classList.add('drop-before');
    });
    tile.addEventListener('dragleave', function () { tile.classList.remove('drop-before'); });
    tile.addEventListener('drop', function (e) {
      e.preventDefault();
      tile.classList.remove('drop-before');
      if (!dragId || dragId === tile.dataset.id) return;
      var order = item.colors.map(function (c) { return c.id; });
      var from = order.indexOf(dragId);
      var to = order.indexOf(tile.dataset.id);
      if (from < 0 || to < 0) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      LIB.reorderColors(kind, item.id, order);
    });
  }

  function itemAction(kind, id, act) {
    var item = LIB.get(kind, id);
    if (!item) return;
    if (act === 'sort-hue') { LIB.sortColors(kind, id, 'hue'); toast('Sorted by hue'); }
    else if (act === 'sort-light') { LIB.sortColors(kind, id, 'light'); toast('Sorted light to dark'); }
    else if (act === 'sort-name') { LIB.sortColors(kind, id, 'name'); toast('Sorted by name'); }
    else if (act === 'export') exportItem(kind, id);
    else if (act === 'duplicate') {
      var copy = LIB.duplicate(kind, id);
      if (copy) { state.id = copy.id; toast('Duplicated as “' + copy.name + '”'); }
    } else if (act === 'delete') {
      confirmDialog({
        title: 'Delete “' + item.name + '”?',
        body: kind === 'categories'
          ? 'The category and its ' + plural(item.colors.length, 'color') +
            ' are removed from the book. Colors from the built-in palettes are untouched.'
          : 'The project and its ' + plural(item.colors.length, 'color') + ' are removed.',
        danger: 'Delete',
        onConfirm: function () {
          LIB.remove(kind, id);
          state.id = null;
          toast('Deleted “' + item.name + '”');
        }
      });
    }
  }

  /* ---------------- adding colors ---------------- */

  function addColorsTo(kind, id) {
    var item = LIB.get(kind, id);
    if (!item) return;
    global.RangPicker.open({
      title: 'Add to “' + item.name + '”',
      submitLabel: 'Add color',
      hex: '#3B82F6',
      allowBulk: true,
      nearest: App().nearest,
      onSubmit: function (res) {
        var r = LIB.addColors(kind, id, res.colors);
        reportAdd(r, item.name);
      }
    });
  }

  function editColor(kind, id, colorId) {
    var item = LIB.get(kind, id);
    if (!item) return;
    var color = null;
    item.colors.forEach(function (c) { if (c.id === colorId) color = c; });
    if (!color) return;
    global.RangPicker.open({
      title: 'Edit “' + color.name + '”',
      submitLabel: 'Save color',
      hex: color.hex,
      name: color.name,
      allowBulk: false,
      nearest: App().nearest,
      onSubmit: function (res) {
        var c = res.colors[0];
        LIB.updateColor(kind, id, colorId, { hex: c.hex, name: c.name });
        toast('Updated ' + c.name, c.hex);
      }
    });
  }

  function removeColor(kind, id, colorId) {
    var item = LIB.get(kind, id);
    if (!item) return;
    var color = null;
    item.colors.forEach(function (c) { if (c.id === colorId) color = c; });
    if (!color) return;
    LIB.removeColors(kind, id, [colorId]);
    toast('Removed ' + color.name + ' from ' + item.name);
  }

  function reportAdd(r, where) {
    if (r.added) {
      toast('Added ' + plural(r.added, 'color') + ' to ' + where +
        (r.duplicates ? ' · ' + r.duplicates + ' already there' : ''));
    } else if (r.duplicates) {
      toast('Already in ' + where);
    } else {
      toast('Nothing to add');
    }
  }

  /* ---------------- create / save flows ---------------- */

  function createFlow(kind, prefillName) {
    kind = kind === 'categories' ? 'categories' : (kind || state.tab);
    var body = document.createElement('div');
    body.innerHTML =
      '<label class="dlg-field"><span class="field-label">Name</span>' +
        '<input id="dlg-name" maxlength="' + LIB.MAX_NAME + '" placeholder="' +
        (kind === 'projects' ? 'Autumn campaign' : 'Client greens') + '"></label>' +
      '<label class="dlg-field"><span class="field-label">Description <em>optional</em></span>' +
        '<input id="dlg-desc" maxlength="' + LIB.MAX_DESC + '" placeholder="What is this for?"></label>' +
      '<p class="dlg-note">' + (kind === 'projects'
        ? 'Projects stay out of the way - they live here in your library.'
        : 'Categories join the book: catalog, search, Flow and print.') + '</p>';

    dialog({
      title: 'New ' + KIND_LABEL[kind],
      body: body,
      submit: 'Create',
      onOpen: function () {
        $('#dlg-name', body).value = prefillName || '';
        $('#dlg-name', body).focus();
      },
      onSubmit: function () {
        var name = $('#dlg-name', body).value.trim();
        if (!name) { $('#dlg-name', body).focus(); return false; }
        var item = LIB.create(kind, name, $('#dlg-desc', body).value);
        if (!item) { toast(LIB.lastError() || 'Could not create that'); return true; }
        state.tab = kind;
        state.id = item.id;
        if (state.open) render(); else open(kind, item.id);
        toast('Created “' + item.name + '”');
        return true;
      }
    });
  }

  /**
   * The save dialog: pick a destination, then name each color before it
   * lands. Names default to whatever the swatch is called in the book.
   */
  function openSaveDialog(sourceRecords, target) {
    if (!sourceRecords || !sourceRecords.length) { toast('Select some colors first'); return; }

    /* Work on copies: these come straight out of the book's own swatch
       records, and the per-color name field must not write back into them. */
    var records = sourceRecords.map(function (r) {
      return { name: r.name, hex: r.hex, uid: r.uid || '', saveName: r.name };
    });

    var kind = (target && target.kind) || 'projects';
    var chosen = (target && target.id) || null;
    var newName = '';

    var body = document.createElement('div');
    body.className = 'save-dlg';
    body.innerHTML =
      '<div class="field">' +
        '<span class="field-label">Save into</span>' +
        '<div class="mini-seg save-kind" role="group" aria-label="Destination type">' +
          '<button data-kind="projects">A project</button>' +
          '<button data-kind="categories">A category</button>' +
        '</div>' +
        '<div class="save-targets" id="save-targets"></div>' +
      '</div>' +
      '<div class="field">' +
        '<div class="save-names-head">' +
          '<span class="field-label" style="margin:0">Name these colors</span>' +
          '<button class="ghost-btn" id="save-reset">Reset to book names</button>' +
        '</div>' +
        '<div class="save-names" id="save-names"></div>' +
      '</div>';

    function renderTargets() {
      var wrap = $('#save-targets', body);
      var items = LIB.list(kind);
      if (chosen && !LIB.get(kind, chosen)) chosen = null;
      if (!chosen && items.length) chosen = items[0].id;
      wrap.innerHTML = '';

      items.forEach(function (it) {
        var label = document.createElement('label');
        label.className = 'pick';
        label.innerHTML =
          '<input type="radio" name="savetarget" value="' + esc(it.id) + '"' +
            (it.id === chosen ? ' checked' : '') + '>' +
          '<span class="pick-face">' + esc(it.name) +
          ' <span class="pick-n">' + it.colors.length + '</span></span>';
        label.querySelector('input').addEventListener('change', function () {
          chosen = it.id;
        });
        wrap.appendChild(label);
      });

      var newLabel = document.createElement('label');
      newLabel.className = 'pick pick-new';
      newLabel.innerHTML =
        '<input type="radio" name="savetarget" value="__new"' + (chosen ? '' : ' checked') + '>' +
        '<span class="pick-face">' + ICON.plus + ' New ' + KIND_LABEL[kind] + '</span>';
      newLabel.querySelector('input').addEventListener('change', function () {
        chosen = null;
        syncNew();
      });
      wrap.appendChild(newLabel);

      var nameRow = document.createElement('div');
      nameRow.className = 'save-newname';
      nameRow.innerHTML = '<input id="save-newname" maxlength="' + LIB.MAX_NAME +
        '" placeholder="Name the new ' + KIND_LABEL[kind] + '" aria-label="New ' + KIND_LABEL[kind] + ' name">';
      wrap.appendChild(nameRow);
      $('#save-newname', wrap).value = newName;
      $('#save-newname', wrap).addEventListener('input', function () {
        newName = this.value;
      });

      function syncNew() {
        nameRow.classList.toggle('show', !chosen);
        if (!chosen) $('#save-newname', wrap).focus();
      }
      syncNew();
    }

    function renderNames() {
      var wrap = $('#save-names', body);
      wrap.innerHTML = '';
      records.forEach(function (r, i) {
        var row = document.createElement('div');
        row.className = 'save-row';
        row.innerHTML =
          '<span class="save-chip" style="background:' + r.hex + '"></span>' +
          '<input class="save-name" maxlength="' + LIB.MAX_NAME + '" aria-label="Name for ' + esc(r.hex) + '">' +
          '<span class="save-hex">' + esc(r.hex) + '</span>';
        var input = $('.save-name', row);
        input.value = r.saveName;
        input.addEventListener('input', function () { r.saveName = input.value; });
        // Enter moves to the next row rather than submitting the dialog
        input.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          var next = $$('.save-name', wrap)[i + 1];
          if (next) next.focus(); else input.blur();
        });
        wrap.appendChild(row);
      });
    }

    $$('.save-kind button', body).forEach(function (b) {
      b.classList.toggle('on', b.dataset.kind === kind);
      b.addEventListener('click', function () {
        kind = b.dataset.kind;
        chosen = null;
        $$('.save-kind button', body).forEach(function (x) {
          x.classList.toggle('on', x.dataset.kind === kind);
        });
        renderTargets();
      });
    });
    $('#save-reset', body).addEventListener('click', function () {
      records.forEach(function (r) { r.saveName = r.name; });
      renderNames();
    });

    renderTargets();
    renderNames();

    dialog({
      title: 'Save ' + plural(records.length, 'color'),
      body: body,
      submit: 'Save',
      wide: true,
      onSubmit: function () {
        var id = chosen;
        if (!id) {
          var name = newName.trim();
          if (!name) { $('#save-newname', body).focus(); return false; }
          var made = LIB.create(kind, name);
          if (!made) { toast(LIB.lastError() || 'Could not create that'); return true; }
          id = made.id;
        }
        var item = LIB.get(kind, id);
        var r = LIB.addColors(kind, id, records.map(function (rec) {
          return { name: rec.saveName, hex: rec.hex, sourceUid: rec.uid };
        }));
        reportAdd(r, item ? item.name : 'your library');
        return true;
      }
    });
  }

  /* ---------------- .rang files ---------------- */

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportAll() {
    var t = LIB.totals();
    if (!t.projects && !t.categories) { toast('Nothing to export yet'); return; }
    download('rang-library' + LIB.EXT, JSON.stringify(LIB.serialize(), null, 2));
    toast('Exported ' + plural(t.projects, 'project') + ' and ' + plural(t.categories, 'category'));
  }

  function exportItem(kind, id) {
    var item = LIB.get(kind, id);
    if (!item) return;
    var doc = LIB.serialize({ kind: kind, ids: [id] });
    download(LIB.slug(item.name) + LIB.EXT, JSON.stringify(doc, null, 2));
    toast('Exported “' + item.name + '” · ' + plural(item.colors.length, 'color'));
  }

  function importFlow() {
    if (!root) build();
    $('#lb-file').click();
  }

  function readRangFile(file) {
    if (file.size > 8 * 1024 * 1024) {
      toast('That file is too big to be a Rang library');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { toast('Could not read that file'); };
    reader.onload = function () {
      var doc = LIB.parseFile(reader.result);
      if (!doc.ok) { toast(doc.error); return; }
      reviewImport(doc, file.name);
    };
    reader.readAsText(file);
  }

  /* Imported files come from other people, so nothing is written until the
     user has seen what is in the file and picked how it should land. */
  function reviewImport(doc, filename) {
    var colors = 0;
    ['projects', 'categories'].forEach(function (k) {
      doc[k].forEach(function (it) { colors += it.colors.length; });
    });

    var clash = [];
    ['projects', 'categories'].forEach(function (k) {
      doc[k].forEach(function (incoming) {
        LIB.list(k).forEach(function (mine) {
          if (mine.name.toLowerCase() === incoming.name.toLowerCase()) clash.push(mine.name);
        });
      });
    });

    var preview = [];
    ['projects', 'categories'].forEach(function (k) {
      doc[k].forEach(function (it) {
        preview.push(
          '<li><span class="imp-kind">' + KIND_LABEL[k] + '</span>' +
          '<span class="imp-name">' + esc(it.name) + '</span>' +
          '<span class="imp-strip">' + it.colors.slice(0, 14).map(function (c) {
            return '<i style="background:' + c.hex + '"></i>';
          }).join('') + '</span>' +
          '<span class="imp-n">' + it.colors.length + '</span></li>'
        );
      });
    });

    var body = document.createElement('div');
    body.innerHTML =
      '<p class="dlg-note imp-from">From <strong>' + esc(filename) + '</strong> - ' +
        plural(doc.projects.length, 'project') + ', ' + plural(doc.categories.length, 'category') +
        ', ' + plural(colors, 'color') + '.</p>' +
      '<ul class="imp-list">' + preview.join('') + '</ul>' +
      (clash.length
        ? '<div class="field imp-mode">' +
            '<span class="field-label">' + plural(clash.length, 'name') + ' already in your library</span>' +
            '<div class="choice-list">' +
              '<label class="choice"><input type="radio" name="impmode" value="copy" checked><span class="radio"></span>' +
                '<span class="choice-main"><span class="choice-title">Keep both</span> ' +
                '<span class="choice-sub">Imported ones are numbered, nothing of yours changes</span></span></label>' +
              '<label class="choice"><input type="radio" name="impmode" value="merge"><span class="radio"></span>' +
                '<span class="choice-main"><span class="choice-title">Merge into mine</span> ' +
                '<span class="choice-sub">New colors are appended; duplicates by hex are skipped</span></span></label>' +
              '<label class="choice"><input type="radio" name="impmode" value="replace"><span class="radio"></span>' +
                '<span class="choice-main"><span class="choice-title">Replace mine</span> ' +
                '<span class="choice-sub">Your version of those names is overwritten</span></span></label>' +
            '</div>' +
          '</div>'
        : '');

    if (clash.length) {
      body.addEventListener('change', function () {
        $$('.choice', body).forEach(function (c) {
          c.classList.toggle('checked', c.querySelector('input').checked);
        });
      });
      $$('.choice', body).forEach(function (c) {
        c.classList.toggle('checked', c.querySelector('input').checked);
      });
    }

    dialog({
      title: 'Import into your library',
      body: body,
      submit: 'Import',
      wide: true,
      onSubmit: function () {
        var mode = 'copy';
        var picked = $('input[name="impmode"]:checked', body);
        if (picked) mode = picked.value;
        var sum = LIB.importDoc(doc, mode);
        if (!sum) { toast('Nothing was imported'); return true; }
        var parts = [];
        if (sum.projects) parts.push(plural(sum.projects, 'project'));
        if (sum.categories) parts.push(plural(sum.categories, 'category'));
        if (sum.mergedInto) parts.push(sum.mergedInto + ' merged');
        if (sum.replaced) parts.push(sum.replaced + ' replaced');
        toast('Imported ' + (parts.join(', ') || 'nothing new') + ' · ' + plural(sum.colors, 'color'));
        if (!state.open) open();
        else render();
        return true;
      }
    });
  }

  /* ---------------- generic dialog ---------------- */

  var dlg = null;

  function dialogOpen() { return !!(dlg && dlg.classList.contains('show')); }

  function dialog(opts) {
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.className = 'modal-backdrop dlg-backdrop';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.innerHTML =
        '<div class="modal dlg-modal">' +
          '<div class="modal-head"><h2 id="dlg-title"></h2>' +
            '<button class="modal-close" id="dlg-x" aria-label="Close">' + ICON.x + '</button></div>' +
          '<div class="modal-body" id="dlg-body"></div>' +
          '<div class="modal-foot">' +
            '<span class="doc-stats"></span>' +
            '<button class="ghost-btn" id="dlg-cancel">Cancel</button>' +
            '<button class="primary-btn" id="dlg-submit">Save</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) closeDialog(); });
      dlg.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); return; }
        if (e.key === 'Tab') {
          e.stopPropagation();          // this dialog is the top layer
          var els = $$('button, input, textarea, select', dlg)
            .filter(function (n) { return !n.disabled && n.getClientRects().length; });
          if (!els.length) return;
          var first = els[0], last = els[els.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
    }

    $('#dlg-title', dlg).textContent = opts.title;
    var bodyWrap = $('#dlg-body', dlg);
    bodyWrap.innerHTML = '';
    bodyWrap.appendChild(opts.body);
    $('.dlg-modal', dlg).classList.toggle('wide', !!opts.wide);

    var submit = $('#dlg-submit', dlg);
    submit.textContent = opts.submit || 'Save';
    submit.classList.toggle('danger-btn', !!opts.danger);

    var lastFocus = document.activeElement;
    function done() {
      closeDialog();
      if (lastFocus && document.contains(lastFocus) && lastFocus.getClientRects().length) {
        lastFocus.focus();
      }
    }
    function onSubmit() {
      if (!opts.onSubmit || opts.onSubmit() !== false) done();
    }

    submit.onclick = onSubmit;
    $('#dlg-cancel', dlg).onclick = done;
    $('#dlg-x', dlg).onclick = done;

    dlg.classList.add('show');
    if (opts.onOpen) opts.onOpen();
    else {
      var firstInput = $('input, textarea', bodyWrap);
      (firstInput || submit).focus();
    }
  }

  function closeDialog() {
    if (dlg) dlg.classList.remove('show');
  }

  function confirmDialog(opts) {
    var body = document.createElement('div');
    body.innerHTML = '<p class="dlg-confirm"></p>';
    $('p', body).textContent = opts.body;
    dialog({
      title: opts.title,
      body: body,
      submit: opts.danger || 'Confirm',
      danger: !!opts.danger,
      onSubmit: function () { opts.onConfirm(); return true; }
    });
  }

  /* ---------------- public surface ---------------- */

  global.RangLibraryUI = {
    open: open,
    close: close,
    isOpen: function () { return state.open; },
    createFlow: createFlow,
    importFlow: importFlow,
    exportAll: exportAll,
    addColorsTo: addColorsTo,
    editColor: editColor,
    removeColor: removeColor,
    saveSelection: function (records) { openSaveDialog(records); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
