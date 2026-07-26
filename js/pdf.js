/* ============================================================
   Swatchbook PDF engine
   Generates the swatch sheets as a real PDF file with zero
   dependencies. Uses PDF base-14 fonts (Helvetica for labels,
   Courier-Bold for hex codes) and plain filled rectangles for
   the chips, mirroring the print stylesheet layout.

   Page size, margins and the swatch grid all come from
   js/paper.js — the same numbers the stylesheet lays the
   preview out with, so the two renderers cannot drift.
   ============================================================ */

(function (global) {
  'use strict';

  var MM = 72 / 25.4;               // points per millimetre

  var Paper = global.RangPaper ||
    (typeof require !== 'undefined' ? require('./paper.js') : null);

  // Markloc wordmark as raw PDF path ops (converted from assets/markloc-logo.svg,
  // y-up, box 487.5 x 97.5; glyph baseline at y=1.2, cap height 90).
  // LOGO_CAP is the M cap height (top 91.2 - baseline 1.2); scale the wordmark
  // by CAP HEIGHT, not by its ascender — it sits in a line of all-caps text.
  var LOGO_W = 487.5, LOGO_CAP = 90, LOGO_BASE = 1.2;
  var HELV_CAP = 0.717;             // Helvetica cap height, em fraction
  // Cap-height parity alone reads too quiet for a brand mark, so the wordmark is
  // set 22% above it. Mirrors the 1.322em on .foot-logo in css/styles.css
  // (= 1.084 cap parity x 1.22) — change the two together.
  var LOGO_BOOST = 1.22;
  var LOGO_OPS = '102.79 91.2 m 102.79 1.2 l 81.2 1.2 l 81.2 51.6 l 54.48 34.57 l 28.57 51.46 l 28.57 1.2 l 6.98 1.2 l 6.98 91.2 l 54.75 60.32 l h 162.35 72.79 m 181.72 72.79 l 181.72 1.2 l 162.35 1.2 l 162.35 9.23 l 158.38 4.06 152.38 1.48 144.35 1.48 c 134.55 1.38 126.15 4.8 119.14 11.73 c 112.12 18.64 108.57 27.04 108.47 36.92 c 108.39 46.7 111.8 55.11 118.72 62.12 c 125.65 69.14 134.05 72.7 143.92 72.79 c 152.05 72.79 158.19 70.16 162.35 64.9 c h 156.53 24.74 m 159.94 28.15 161.64 32.3 161.64 37.2 c 161.64 42.18 159.89 46.34 156.39 49.67 c 152.88 53.17 148.77 54.83 144.07 54.65 c 139.17 54.65 135.01 52.94 131.6 49.52 c 128.19 46.11 126.49 41.95 126.49 37.06 c 126.49 32.25 128.24 28.1 131.74 24.6 c 135.15 21.18 139.31 19.48 144.21 19.48 c 149.18 19.67 153.29 21.42 156.53 24.74 c h 209.43 61.85 m 211 66.28 213.62 69.37 217.32 71.12 c 220.92 72.88 226.32 73.76 233.53 73.76 c 233.53 53.95 l 226.5 53.95 220.64 51.55 215.93 46.76 c 211.6 42.51 209.43 37.85 209.43 32.77 c 209.43 1.2 l 190.04 1.2 l 190.04 72.51 l 209.43 72.51 l h 288.91 1.2 m 265.79 28.88 l 259.14 22.38 l 259.14 1.2 l 239.75 1.2 l 239.75 97.43 l 259.14 97.43 l 259.14 49.81 l 281.85 72.51 l 309.27 72.37 l 279.35 42.6 l 314.66 1.2 l h 342.37 97.43 m 342.37 1.2 l 322.98 1.2 l 322.98 97.43 l h 383.48 72.51 m 393.36 72.6 401.76 69.18 408.69 62.26 c 415.71 55.25 419.22 46.85 419.22 37.06 c 419.3 27.18 415.88 18.78 408.97 11.85 c 402.04 4.84 393.69 1.29 383.91 1.2 c 374.03 1.1 365.58 4.52 358.56 11.45 c 351.54 18.36 348.03 26.76 348.03 36.65 c 347.94 46.52 351.36 54.92 358.28 61.85 c 365.21 68.86 373.61 72.42 383.48 72.51 c h 396.09 24.46 m 399.5 27.88 401.2 32.03 401.2 36.92 c 401.2 41.72 399.45 45.87 395.95 49.38 c 392.44 52.7 388.28 54.37 383.48 54.37 c 378.68 54.37 374.57 52.66 371.16 49.24 c 367.75 45.64 366.05 41.49 366.05 36.79 c 366.05 31.99 367.8 27.83 371.3 24.32 c 374.71 20.9 378.87 19.2 383.77 19.2 c 388.74 19.38 392.85 21.14 396.09 24.46 c h 481.94 9.77 m 475.2 4.06 467.35 1.2 458.39 1.2 c 448.52 1.29 440.12 4.84 433.21 11.85 c 426.28 18.87 422.86 27.27 422.96 37.06 c 423.05 46.93 426.6 55.33 433.61 62.26 c 440.63 69.18 449.03 72.6 458.81 72.51 c 467.68 72.42 475.43 69.46 482.08 63.65 c 469.21 50.9 l 466.06 53.21 462.55 54.37 458.67 54.37 c 453.87 54.37 449.72 52.7 446.22 49.38 c 442.8 45.97 441.1 41.81 441.1 36.92 c 440.91 32.12 442.57 27.97 446.08 24.46 c 449.4 21.14 453.55 19.38 458.53 19.2 c 462.42 19.2 465.93 20.35 469.06 22.67 c h';

  // Exact equivalents of the sheet stylesheet's text colors:
  // .pname #555555, .phex / .sheet-title / .foot-logo #111111, .sheet-sub /
  // .sheet-foot #999999.
  var GRAY_TEXT = '0.333 0.333 0.333';
  var DARK_TEXT = '0.067 0.067 0.067';
  var FAINT_TEXT = '0.6 0.6 0.6';
  var CHIP_STROKE = '0.85 0.85 0.85';

  /* PDF literal strings here are WinAnsi. Keep to ASCII plus the three
     punctuation marks the sheet markup actually uses — em dash, middle dot and
     multiplication sign all have WinAnsi slots, so map them through rather than
     dropping them: the printed sheet and the PDF must read the same. */
  function ascii(s) {
    return String(s)
      .replace(/—/g, '\x97').replace(/·/g, '\xB7').replace(/×/g, '\xD7')
      .replace(/[^\x20-\x7E\x97\xB7\xD7]/g, '');
  }

  function esc(s) {
    return ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function num(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    return num(r) + ' ' + num(g) + ' ' + num(b);
  }

  /* The sheet stylesheet letter-spaces most of its label text. PDF expresses the
     same thing with the Tc operator, and like CSS it adds the extra space after
     every glyph including the last — so widths are just n * tracking wider.
     Tracking values below mirror the letter-spacing in css/styles.css. */
  var TRACK_TITLE = 0.02, TRACK_SUB = 0.08, TRACK_FOOT = 0.06, TRACK_NAME = 0.05;

  /* Real Helvetica advance widths, per mille of an em (from the base-14 metrics).
     Right-aligned runs and the wordmark's x both depend on knowing exactly where
     a string ends, so an average-per-character estimate is not good enough — it
     leaves the page label visibly short of the margin, by a different amount on
     every sheet. */
  var HELV_W = {
    ' ': 278, '!': 333, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667,
    "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333,
    '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584,
    '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556,
    '`': 333, '{': 334, '|': 260, '}': 334, '~': 584,
    '\x97': 1000, '\xB7': 278, '\xD7': 584,
    0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
    J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
    S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
    j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
    s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500
  };
  function textWidth(text, size, track) {
    text = ascii(text);
    var w = 0;
    for (var i = 0; i < text.length; i++) w += HELV_W[text[i]] || 556;
    return w * size / 1000 + text.length * size * (track || 0);
  }

  function truncate(text, maxWidth, size, track) {
    text = ascii(text);
    if (textWidth(text, size, track) <= maxWidth) return text;
    var t = text;
    while (t.length > 1 && textWidth(t + '..', size, track) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '..';
  }

  function textOp(font, size, color, x, y, str, track) {
    return 'BT /' + font + ' ' + num(size) + ' Tf ' +
      num((track || 0) * size) + ' Tc ' + color + ' rg ' +
      num(x) + ' ' + num(y) + ' Td (' + esc(str) + ') Tj ET\n';
  }

  /**
   * pages: [{ no, title, swatches: [{name, hex, value}] }]
   * opts:  { geom, showNames, showHeaders, totalSheets, appName, brandLine }
   *        `geom` is a js/paper.js geometry record; it decides the page size,
   *        margins and grid. Omitted, it falls back to A4 standard.
   * Returns a Uint8Array with the complete PDF file.
   */
  function buildPDF(pages, opts) {
    var geom = opts.geom || (Paper && Paper.geometry('a4', false, 'standard'));
    var showNames = opts.showNames !== false;
    var showHeaders = opts.showHeaders !== false;
    var totalSheets = opts.totalSheets || pages.length;
    var appName = opts.appName || 'Rang';

    var d = {
      cols: geom.cols,
      rows: geom.rows,
      gap: geom.gap * MM,
      nameSize: geom.nameSize,
      hexSize: geom.hexSize
    };
    // Lay out against the same rounded point size the MediaBox declares, so
    // a right-aligned run ends exactly on the margin the page claims to have.
    var PAGE_W = geom.pageWPt;
    var PAGE_H = geom.pageHPt;

    // The bottom margin keeps the footer and last row clear of the printer's
    // gripper band (paper.js SAFE_BOTTOM; must match .sheet padding in styles.css)
    var mL = geom.margins.left * MM, mR = geom.margins.right * MM;
    var mT = geom.margins.top * MM, mB = geom.margins.bottom * MM;
    /* Chrome geometry measured off the rendered HTML sheet, so the swatch grid
       lands in the same place in both renderers: .sheet-head is 8.38mm + 4mm
       margin-bottom, .sheet-foot is 8.07mm, the title baseline sits 3.835mm
       below the top of the header block and the footer baseline 1.761mm above
       the bottom of the content box.
       Re-measure if the header/footer type sizes change. */
    var headH = showHeaders ? geom.headH * MM : 2 * MM;
    var footH = showHeaders ? geom.footH * MM : 0;
    var titleUp = headH - 3.835 * MM;           // title baseline above gridTop
    var ruleUp = 4 * MM;                        // .sheet-head margin-bottom

    var gridTop = PAGE_H - mT - headH;
    var gridBottom = mB + footH;
    var gridW = PAGE_W - mL - mR;
    var gridH = gridTop - gridBottom;

    var cellW = (gridW - d.gap * (d.cols - 1)) / d.cols;
    var cellH = (gridH - d.gap * (d.rows - 1)) / d.rows;

    /* Label block height, taken from what the stylesheet actually lays out:
       .plabel's 1.5mm padding-top, the .pname line box, then .phex's 0.4mm
       margin-top and its own line box, both at the body line-height. The old
       estimate (nameSize + 2 + hexSize, in points) ran ~2mm short, which made
       every chip in the PDF 2mm taller than the same chip on the printed
       sheet. Measured against the rendered sheet: 9.317mm at 24-up. */
    var LINE_H = 1.45;
    var padTop = 1.5 * MM;
    var labelH = padTop + 0.4 * MM + d.hexSize * LINE_H +
      (showNames ? d.nameSize * LINE_H : 0);
    var chipH = cellH - labelH;

    var streams = pages.map(function (page) {
      var c = '';

      if (showHeaders) {
        // Title, spec note, hairline rule, footer.
        c += textOp('F2', 10, DARK_TEXT, mL, gridTop + titleUp, page.title, TRACK_TITLE);
        var sub = ascii(geom.subLabel.toUpperCase());
        c += textOp('F1', 6.5, FAINT_TEXT,
          PAGE_W - mR - textWidth(sub, 6.5, TRACK_SUB), gridTop + titleUp, sub, TRACK_SUB);
        c += '0.886 0.886 0.886 RG 0.6 w ' +
          num(mL) + ' ' + num(gridTop + ruleUp) + ' m ' +
          num(PAGE_W - mR) + ' ' + num(gridTop + ruleUp) + ' l S\n';

        var footY = mB + 1.761 * MM;    // .sheet-foot baseline, measured (see above)
        var footSize = 7.5;
        // app.js passes its BRAND_LINE so the sheet and the PDF cannot drift apart
        var brand = opts.brandLine || (appName.toUpperCase() + ' — AN OPEN SOURCE PROJECT BY');
        c += textOp('F1', footSize, FAINT_TEXT, mL, footY, brand, TRACK_FOOT);
        // Markloc wordmark, scaled so its cap height equals the caps beside it.
        // Placed at the advance position after the trailing space, exactly as a
        // text engine would — its own left side bearing supplies the rest of the
        // gap, which is what the browser does for the HTML sheet. The wordmark
        // itself is never tracked (.wordmark resets letter-spacing).
        var lgS = (footSize * HELV_CAP * LOGO_BOOST) / LOGO_CAP;
        var lgX = mL + textWidth(brand + ' ', footSize, TRACK_FOOT);
        c += 'q ' + DARK_TEXT + ' rg ' + lgS.toFixed(5) + ' 0 0 ' + lgS.toFixed(5) + ' ' +
          num(lgX) + ' ' + num(footY - LOGO_BASE * lgS) + ' cm /XLogo Do Q\n';
        var pageLabel = 'Sheet ' + page.no + ' of ' + totalSheets;
        c += textOp('F1', footSize, FAINT_TEXT,
          PAGE_W - mR - textWidth(pageLabel, footSize, TRACK_FOOT),
          footY, pageLabel, TRACK_FOOT);
      }

      page.swatches.forEach(function (sw, i) {
        var col = i % d.cols;
        var row = Math.floor(i / d.cols);
        var x = mL + col * (cellW + d.gap);
        var cellTop = gridTop - row * (cellH + d.gap);
        var chipY = cellTop - chipH;

        // chip: fill + hairline stroke
        c += hexToRgb(sw.hex) + ' rg ' + CHIP_STROKE + ' RG 0.6 w ' +
          num(x) + ' ' + num(chipY) + ' ' + num(cellW) + ' ' + num(chipH) + ' re B\n';

        // label block, color value pinned to the bottom corner of the cell
        var hexBaseline = cellTop - cellH + d.hexSize * 0.16;
        if (showNames) {
          var nameBaseline = hexBaseline + d.hexSize + 1.6;
          var name = truncate(sw.name.toUpperCase(), cellW, d.nameSize, TRACK_NAME);
          c += textOp('F1', d.nameSize, GRAY_TEXT, x, nameBaseline, name, TRACK_NAME);
        }
        // Courier is fixed-pitch (0.6 em), so truncation is exact
        var value = ascii(sw.value || sw.hex.toUpperCase());
        var maxChars = Math.floor(cellW / (d.hexSize * 0.6));
        if (value.length > maxChars) value = value.slice(0, maxChars);
        c += textOp('F3', d.hexSize, DARK_TEXT, x, hexBaseline, value);
      });

      return c;
    });

    /* ---------------- assemble PDF objects ---------------- */

    var objects = [];   // 1-indexed bodies, objects[i] = full "N 0 obj ... endobj"

    function add(body) {
      objects.push(body);
      return objects.length;         // object number
    }

    var catalogNum = add(null);      // placeholder, filled after pages tree known
    var pagesNum = add(null);
    var f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');

    var logoStream = LOGO_OPS + ' f';
    var logoNum = add('<< /Type /XObject /Subtype /Form /BBox [0 0 ' + num(LOGO_W) + ' 97.5] /Length ' +
      logoStream.length + ' >>\nstream\n' + logoStream + '\nendstream');

    var resources = '<< /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R /F3 ' + f3 + ' 0 R >>' +
      ' /XObject << /XLogo ' + logoNum + ' 0 R >> >>';

    var pageNums = [];
    streams.forEach(function (stream) {
      var contentNum = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
      var pageNum = add('<< /Type /Page /Parent ' + pagesNum + ' 0 R /MediaBox [0 0 ' +
        num(PAGE_W) + ' ' + num(PAGE_H) + '] /Resources ' + resources +
        ' /Contents ' + contentNum + ' 0 R >>');
      pageNums.push(pageNum);
    });

    objects[catalogNum - 1] = '<< /Type /Catalog /Pages ' + pagesNum + ' 0 R >>';
    objects[pagesNum - 1] = '<< /Type /Pages /Count ' + pageNums.length + ' /Kids [' +
      pageNums.map(function (n) { return n + ' 0 R'; }).join(' ') + '] >>';

    var out = '%PDF-1.4\n%\xB5\xB5\xB5\xB5\n';
    var offsets = [];
    objects.forEach(function (body, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });

    var xrefStart = out.length;
    out += 'xref\n0 ' + (objects.length + 1) + '\n';
    out += '0000000000 65535 f \n';
    offsets.forEach(function (off) {
      out += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    });
    out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogNum + ' 0 R >>\n';
    out += 'startxref\n' + xrefStart + '\n%%EOF';

    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  function downloadPDF(pages, opts, filename) {
    var bytes = buildPDF(pages, opts);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'rang.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return bytes.length;
  }

  var api = { buildPDF: buildPDF, downloadPDF: downloadPDF };
  global.SwatchPDF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
