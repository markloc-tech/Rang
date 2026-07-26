/* ============================================================
   Rang paper geometry
   The single source of truth for sheet size, margins and the
   swatch grid. css/styles.css lays the sheets out from the
   variables computed here and js/pdf.js draws from the same
   numbers, so the preview, the printed page and the exported
   PDF are always the same document.

   Nothing here touches the DOM — it is pure geometry, shared
   with Node so the PDF writer can be tested headlessly.
   ============================================================ */

(function (global) {
  'use strict';

  var MM_PT = 72 / 25.4;            // points per millimetre

  /* Paper stock. `unit` picks how the sheet subtitle reads: ISO sizes are
     quoted in millimetres, US sizes in inches, the way each is normally
     specified. Dimensions are always the portrait ones, in mm. */
  var PAPERS = [
    { id: 'a3',      name: 'A3',      w: 297,   h: 420,   unit: 'mm', note: 'Twice A4' },
    { id: 'a4',      name: 'A4',      w: 210,   h: 297,   unit: 'mm', note: 'ISO default' },
    { id: 'a5',      name: 'A5',      w: 148,   h: 210,   unit: 'mm', note: 'Half A4' },
    { id: 'letter',  name: 'Letter',  w: 215.9, h: 279.4, unit: 'in', note: '8.5 × 11 in' },
    { id: 'legal',   name: 'Legal',   w: 215.9, h: 355.6, unit: 'in', note: '8.5 × 14 in' },
    { id: 'tabloid', name: 'Tabloid', w: 279.4, h: 431.8, unit: 'in', note: '11 × 17 in' }
  ];

  var BY_ID = {};
  PAPERS.forEach(function (p) { BY_ID[p.id] = p; });

  /* Sheet chrome, measured off the rendered A4 sheet and identical on every
     paper size because the type sizes never change:
     .sheet-head is 8.38mm tall + 4mm margin-bottom, .sheet-foot is 8.07mm. */
  var HEAD_H = 12.38;               // mm, header block incl. its margin
  var FOOT_H = 8.07;                // mm, footer block

  /* Density levels. targetW/targetH are the A4 cell dimensions at that level —
     bigger paper simply fits more of the same-sized cells, so a chip is
     physically the same size on A5 as on A3 and the book stays comparable
     sheet to sheet. Solving for these targets reproduces the original A4
     grids exactly: 3x4, 4x6 and 5x8. */
  var DENSITIES = [
    { id: 'large',    name: 'Large',    targetW: 59.33, targetH: 60.13, gap: 4, nameSize: 7, hexSize: 10 },
    { id: 'standard', name: 'Standard', targetW: 43.50, targetH: 38.75, gap: 4, nameSize: 6, hexSize: 8.5 },
    { id: 'compact',  name: 'Compact',  targetW: 34.80, targetH: 28.94, gap: 3, nameSize: 5, hexSize: 7 }
  ];

  var DENSITY_BY_ID = {};
  DENSITIES.forEach(function (d) { DENSITY_BY_ID[d.id] = d; });

  function round2(n) { return Math.round(n * 100) / 100; }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* The bottom edge is the one every printer eats into: the paper-feed grippers
     make the last stretch of the sheet unprintable, and on consumer inkjets that
     band runs to 15-17mm (a few older models to 23mm) against 3-5mm on the other
     three edges. At the old 14mm the footer line box ended exactly on that
     boundary and printers sliced the footer in half, so the floor is now 20mm —
     the deepest gripper band we can clear without costing the grid a row on any
     paper size. Everything else keeps A4's margins as its floor. */
  var SAFE_BOTTOM = 20;             // mm, printer gripper clearance

  /* Margins grow with the paper but never shrink below A4's. */
  function marginsFor(shortEdge) {
    var scale = clamp(shortEdge / 210, 1, 1.35);
    return {
      left: round2(Math.max(12, 12 * scale)),
      right: round2(Math.max(12, 12 * scale)),
      top: round2(Math.max(10, 10 * scale)),
      bottom: round2(Math.max(SAFE_BOTTOM, 14 * scale))
    };
  }

  function fitCount(available, target, gap) {
    return clamp(Math.round((available + gap) / (target + gap)), 1, 24);
  }

  function dimsLabel(paper, landscape) {
    var w = landscape ? paper.h : paper.w;
    var h = landscape ? paper.w : paper.h;
    if (paper.unit === 'in') {
      var inch = function (mm) {
        var v = Math.round(mm / 25.4 * 100) / 100;
        return String(v);
      };
      return inch(w) + ' × ' + inch(h) + ' in';
    }
    return Math.round(w) + ' × ' + Math.round(h) + ' mm';
  }

  /**
   * Everything both renderers need for one paper/orientation/density combo.
   * All lengths are millimetres unless the key ends in Pt.
   *
   * The grid is always solved against the header-and-footer geometry, even
   * when the chrome is switched off, so toggling headers never reshuffles
   * the grid — it only gives the same cells more room.
   */
  function geometry(paperId, landscape, densityId) {
    var paper = BY_ID[paperId] || BY_ID.a4;
    var den = DENSITY_BY_ID[densityId] || DENSITY_BY_ID.standard;

    var pageW = landscape ? paper.h : paper.w;
    var pageH = landscape ? paper.w : paper.h;
    var m = marginsFor(Math.min(pageW, pageH));

    var contentW = pageW - m.left - m.right;
    var contentH = pageH - m.top - m.bottom;
    var gridH = contentH - HEAD_H - FOOT_H;

    var cols = fitCount(contentW, den.targetW, den.gap);
    var rows = fitCount(gridH, den.targetH, den.gap);

    return {
      paperId: paper.id,
      paperName: paper.name,
      landscape: !!landscape,
      densityId: den.id,
      densityName: den.name,

      pageW: pageW,
      pageH: pageH,
      pageWPt: round2(pageW * MM_PT),
      pageHPt: round2(pageH * MM_PT),
      margins: m,

      cols: cols,
      rows: rows,
      perPage: cols * rows,
      gap: den.gap,
      nameSize: den.nameSize,
      hexSize: den.hexSize,

      headH: HEAD_H,
      footH: FOOT_H,

      /* Sheet subtitle, e.g. "A4 · 210 × 297 mm" — pdf.js upper-cases it. */
      subLabel: paper.name + (landscape ? ' landscape' : '') + ' · ' + dimsLabel(paper, landscape),
      /* Suffix for exported file names, e.g. "a4" or "a3-landscape". */
      slug: paper.id + (landscape ? '-landscape' : '')
    };
  }

  var api = {
    MM_PT: MM_PT,
    PAPERS: PAPERS,
    DENSITIES: DENSITIES,
    get: function (id) { return BY_ID[id] || null; },
    geometry: geometry
  };

  global.RangPaper = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
