/* ============================================================
   Swatchbook generated collections
   Systematic coverage of the whole digital gamut, generated
   deterministically at load so the book is not limited to the
   curated brand palettes in data.js:

   - Spectrum:  24 named hues x 7 tone rows x 17 lightness steps = 2856
   - Tones:     24 hues desaturated in 5% steps at mid lightness =  480
   - Hue Wheel: all 360 degrees, one chip per degree             =  360
   - Grays:     neutral every 1% + warm/cool every 2% lightness  =  195
   - RGB Cube:  16 levels per channel (00,11,...,FF)             = 4096

   7,987 generated + 821 curated = 8,808 colors total.
   Every ramp is ordered as a smooth transition (tint -> shade,
   saturated -> muted) so pages read like gradients, not noise.
   ============================================================ */

(function () {
  'use strict';

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      var byte = Math.round(255 * v).toString(16).toUpperCase();
      return byte.length === 1 ? '0' + byte : byte;
    }
    return '#' + f(0) + f(8) + f(4);
  }

  function pad3(n) {
    return ('00' + n).slice(-3);
  }

  // The 24 named hues of the RGB color wheel, every 15 degrees.
  var HUES = [
    ['Red', 0], ['Vermilion', 15], ['Orange', 30], ['Amber', 45],
    ['Yellow', 60], ['Lime', 75], ['Chartreuse', 90], ['Harlequin', 105],
    ['Green', 120], ['Erin', 135], ['Spring Green', 150], ['Aquamarine', 165],
    ['Cyan', 180], ['Capri', 195], ['Azure', 210], ['Cerulean', 225],
    ['Blue', 240], ['Indigo', 255], ['Violet', 270], ['Purple', 285],
    ['Magenta', 300], ['Cerise', 315], ['Rose', 330], ['Crimson', 345]
  ];

  /* ---------------- Spectrum: 24 x 7 x 17 ---------------- */

  // Tone rows: saturation bands from vivid to faded.
  var TONES = [
    ['Vivid', 100], ['Bright', 88], ['Strong', 76], ['Soft', 64],
    ['Mid', 52], ['Muted', 40], ['Faded', 28]
  ];
  // 17 lightness steps, tint -> shade.
  var L_STEPS = [];
  for (var L = 94; L >= 14; L -= 5) L_STEPS.push(L);

  var spectrum = {
    id: 'spectrum',
    collection: 'Spectrum',
    description: 'A systematic atlas of the digital gamut: 24 named hues, each in 7 tone rows (vivid to faded) of 17 lightness steps (tint to shade) - 2,856 colors in smooth transitions.',
    families: HUES.map(function (hu) {
      var name = hu[0], deg = hu[1];
      var swatches = [];
      TONES.forEach(function (tone) {
        L_STEPS.forEach(function (l, i) {
          swatches.push({
            name: name + ' ' + tone[0] + ' ' + (i + 1) * 100,
            hex: hslToHex(deg, tone[1], l)
          });
        });
      });
      return { name: name + ' (' + deg + ' deg)', swatches: swatches };
    })
  };

  /* ---------------- Tones: desaturation ramps ---------------- */

  var tones = {
    id: 'tones',
    collection: 'Tones',
    description: 'Each of the 24 hues fading from full saturation to near-gray in 5% steps at mid lightness - the saturation axis of the gamut.',
    families: HUES.map(function (hu) {
      var name = hu[0], deg = hu[1];
      var swatches = [];
      var step = 0;
      for (var s = 100; s >= 5; s -= 5) {
        step++;
        swatches.push({ name: name + ' Tone ' + step * 100, hex: hslToHex(deg, s, 50) });
      }
      return { name: name + ' (' + deg + ' deg)', swatches: swatches };
    })
  };

  /* ---------------- Hue Wheel: every degree ---------------- */

  var wheelFamilies = [];
  for (var seg = 0; seg < 12; seg++) {
    var start = seg * 30;
    var swatches = [];
    for (var d = start; d < start + 30; d++) {
      swatches.push({ name: 'H ' + pad3(d), hex: hslToHex(d, 100, 50) });
    }
    wheelFamilies.push({ name: 'Hues ' + pad3(start) + ' - ' + pad3(start + 29), swatches: swatches });
  }

  var hueWheel = {
    id: 'huewheel',
    collection: 'Hue Wheel',
    description: 'The full color wheel, one chip per degree at full saturation - 360 pure hue reference chips.',
    families: wheelFamilies
  };

  /* ---------------- Grays & Neutrals ---------------- */

  function grayRamp(famName, hue, sat, from, to, step, label) {
    var swatches = [];
    for (var l = from; l >= to; l -= step) {
      swatches.push({ name: label + ' ' + l, hex: hslToHex(hue, sat, l) });
    }
    return { name: famName, swatches: swatches };
  }

  var grays = {
    id: 'grays',
    collection: 'Grays & Neutrals',
    description: 'Pure neutral in 1% lightness steps plus warm and cool tinted grays in 2% steps. Numbers are HSL lightness.',
    families: [
      grayRamp('Neutral', 0, 0, 99, 1, 1, 'Neutral'),
      grayRamp('Warm Gray', 30, 8, 96, 2, 2, 'Warm'),
      grayRamp('Cool Gray', 220, 8, 96, 2, 2, 'Cool')
    ]
  };

  /* ---------------- RGB Cube: 16 x 16 x 16 ---------------- */

  var LEVELS = [];
  for (var v = 0; v <= 255; v += 17) {
    var hx = v.toString(16).toUpperCase();
    LEVELS.push(hx.length === 1 ? '0' + hx : hx);
  }

  var cubeFamilies = [];
  var cubeIndex = 0;
  LEVELS.forEach(function (r) {
    var swatches = [];
    LEVELS.forEach(function (g) {
      LEVELS.forEach(function (b) {
        cubeIndex++;
        swatches.push({ name: 'C ' + ('000' + cubeIndex).slice(-4), hex: '#' + r + g + b });
      });
    });
    cubeFamilies.push({ name: 'Red ' + r, swatches: swatches });
  });

  var rgbCube = {
    id: 'rgbcube',
    collection: 'RGB Cube',
    description: 'The RGB space sampled at 16 levels per channel (00, 11, ... FF) - 4,096 colors covering every corner of the cube, in green/blue gradient order per red level. Includes the classic 216 web-safe colors.',
    families: cubeFamilies
  };

  /* ---------------- merge into the book ---------------- */

  var curated = window.SWATCH_DATA || [];
  window.SWATCH_DATA = [spectrum, tones, hueWheel, grays].concat(curated).concat([rgbCube]);
})();
