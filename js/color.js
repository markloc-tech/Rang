/* ============================================================
   Rang color math
   One home for the conversions the app, the picker and the
   library all need. Everything is sRGB / 8-bit and hexes are
   always normalised to uppercase #RRGGBB - the whole book is
   opaque digital color, so alpha is parsed but dropped.
   ============================================================ */

(function (global) {
  'use strict';

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    function pair(v) {
      var s = clamp(Math.round(v), 0, 255).toString(16).toUpperCase();
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + pair(r) + pair(g) + pair(b);
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

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    }
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  /* HSV is what the picker's saturation/value field actually is. */
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max === 0 ? 0 : d / max, max];
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = v - c;
    var rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
  }

  function hexToCmyk(hex) {
    var rgb = hexToRgb(hex);
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var k = 1 - Math.max(r, g, b);
    if (k >= 0.9999) return [0, 0, 0, 100];
    return [
      Math.round((1 - r - k) / (1 - k) * 100),
      Math.round((1 - g - k) / (1 - k) * 100),
      Math.round((1 - b - k) / (1 - k) * 100),
      Math.round(k * 100)
    ];
  }

  function cmykToRgb(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
  }

  /* Perceived brightness - decides whether a label goes black or white. */
  function luminance(hex) {
    var rgb = hexToRgb(hex);
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }

  /* Proper WCAG relative luminance + contrast ratio, for the picker's
     legibility readout (the cheap luminance() above is not gamma-correct). */
  function relLuminance(hex) {
    var rgb = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrast(hexA, hexB) {
    var a = relLuminance(hexA), b = relLuminance(hexB);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }

  function textOn(hex) {
    return luminance(hex) > 0.55 ? '#0A0A0A' : '#FFFFFF';
  }

  /* Rough perceptual distance. Not a true Lab deltaE, but the weighting
     tracks human sensitivity well enough to rank "nearest swatch" sensibly,
     and it costs one square root over 8,800 candidates. */
  function distance(hexA, hexB) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    var rm = (a[0] + b[0]) / 2;
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(
      (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
    );
  }

  /* CSS keyword lookup, built lazily from the book's own CSS Named Colors
     collection so there is no second copy of that table to drift. */
  var nameMap = null;
  function cssNames() {
    if (nameMap) return nameMap;
    nameMap = {};
    var data = global.SWATCH_DATA || [];
    data.forEach(function (col) {
      if (col.id !== 'cssnamed') return;
      col.families.forEach(function (fam) {
        fam.swatches.forEach(function (s) {
          nameMap[s.name.toLowerCase().replace(/[^a-z]/g, '')] = s.hex.toUpperCase();
        });
      });
    });
    return nameMap;
  }

  /**
   * Accepts anything a designer is likely to paste: #abc, #aabbccdd, bare
   * hex, rgb()/rgba(), hsl()/hsla(), and CSS keywords. Returns an uppercase
   * #RRGGBB string, or null when it is not a color. Alpha is dropped.
   */
  function parse(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim().toLowerCase();
    if (!s) return null;

    var hex = s.replace(/^#/, '');
    if (/^[0-9a-f]+$/.test(hex)) {
      if (hex.length === 3 || hex.length === 4) {
        return ('#' + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]).toUpperCase();
      }
      if (hex.length === 6 || hex.length === 8) return ('#' + hex.slice(0, 6)).toUpperCase();
      return null;
    }

    var m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      var p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      if (p.length < 3 || p.some(isNaN)) return null;
      return rgbToHex(p[0], p[1], p[2]);
    }

    m = s.match(/^hsla?\(([^)]+)\)$/);
    if (m) {
      var q = m[1].split(/[\s,/]+/).filter(Boolean);
      if (q.length < 3) return null;
      var h = parseFloat(q[0]);
      var sat = parseFloat(q[1]) / 100;
      var li = parseFloat(q[2]) / 100;
      if (isNaN(h) || isNaN(sat) || isNaN(li)) return null;
      var rgb = hslToRgb(h, clamp(sat, 0, 1), clamp(li, 0, 1));
      return rgbToHex(rgb[0], rgb[1], rgb[2]);
    }

    var key = s.replace(/[^a-z]/g, '');
    var named = cssNames()[key];
    return named || null;
  }

  /**
   * Pull every color out of a blob of pasted text - a CSS file, a JSON
   * palette, a column from a spreadsheet. Order is preserved, exact
   * duplicates are dropped, and anything unparseable is ignored.
   */
  function parseList(text) {
    if (typeof text !== 'string') return [];
    var out = [];
    var seen = {};
    var tokens = text.match(
      /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|\b[0-9a-fA-F]{6}\b|[a-zA-Z]{3,}/g
    ) || [];
    tokens.forEach(function (t) {
      var hex = parse(t);
      if (hex && !seen[hex]) { seen[hex] = 1; out.push(hex); }
    });
    return out;
  }

  var api = {
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    hexToCmyk: hexToCmyk,
    cmykToRgb: cmykToRgb,
    luminance: luminance,
    relLuminance: relLuminance,
    contrast: contrast,
    textOn: textOn,
    distance: distance,
    parse: parse,
    parseList: parseList,
    clamp: clamp
  };

  global.RangColor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
