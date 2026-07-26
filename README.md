<img src="assets/markloc-logo.svg" alt="Markloc" height="26">

# Rang

An open-source project by **Markloc**.

A print-ready digital color swatch book for designers. Browse **8,808 colors** — a
systematic atlas of the whole digital gamut plus the major curated palettes — pick exactly
what you need, and put them on paper the way Pantone does: Pantone-style chips on A4 sheets
with the **color value at the bottom corner of every swatch** (HEX, RGB or CMYK — your pick).

Digital (RGB/hex) colors only — this is a screen-color reference, not an ink-matching system.

**Zero dependencies, no build step.** Open `index.html` directly in any browser, or serve it:

```bash
node dev-server.mjs
```

> This hand-written vanilla version is the primary app — a React/shadcn port lives in
> [`shadcn-app/`](shadcn-app/) but was retired because direct DOM manipulation is
> substantially faster at this scale (8,808 live swatch cards). See "Why vanilla" below.

## Collections

**Systematic (generated, covers the full gamut):**

| Collection | Swatches | What it is |
|---|---|---|
| Spectrum | 2,856 | 24 named hues × 7 tone rows (vivid→faded) × 17 lightness steps |
| Tones | 480 | each hue desaturated to near-gray in 5% steps |
| Hue Wheel | 360 | the full wheel, one chip per degree, full saturation |
| Grays & Neutrals | 195 | neutral every 1% lightness + warm and cool gray ramps |
| RGB Cube | 4,096 | 16 levels per channel (00,11,…,FF) — includes the 216 web-safe colors |

**Curated (verified against official sources):**

| Collection | Swatches | Source |
|---|---|---|
| Tailwind CSS | 242 | canonical v3.4 hex palette |
| Material Design | 254 | classic 2014 palette incl. A-series accents |
| Open Color | 130 | v1.9.1 |
| Flat UI | 20 | original "v1" palette |
| Apple iOS System Colors | 36 | current Apple HIG specifications (light + dark) |
| CSS Named Colors | 139 | CSS Color 4 keywords, deduplicated |

## Using it

- **Arrange** — *Catalog* groups by collection and family; *Flow* dissolves the categories:
  one chip per unique color (cross-collection duplicates collapse), ordered as one continuous
  gradient (hue → tone → lightness).
- **Steps filter** — the *Steps* button filters any numbered ramp: drag the range slider
  (e.g. 100–1700) or type specifics like `700, 900, 1100`. Print it via **Current view**.
- **Full-screen color** — hover a swatch and hit the expand icon (or double-click, or press
  `F` on a focused card); select 2+ and *Compare* for side-by-side strips.
- **Jump to a match** — press Enter in the search box to scroll to and flash the first match.
- **Select** — click; shift-click for ranges; family/collection/sidebar checkboxes for groups.
  Selection survives reloads. Click any value label to copy it.
- **Print & Export** (`⌘P`) — scope (everything / selected / current view / collections),
  order (catalog or flow), density (12/24/40 per A4 sheet), sheet ranges like `1-4, 7`.
  Print and Export always show the live A4 preview first; the PDF is generated client-side.
- **Theme** — light is pure white, dark is pure black. Sheets always print on white.

## Why vanilla (and not the React port)

At 8,808 always-mounted cards, this app is the best case for direct DOM manipulation and
the worst case for a component framework: interactions here are tiny state deltas (toggle
a class, flip an attribute) across a huge, static tree. The vanilla version does exactly
one DOM write per change with nothing in between; a framework routes every change through
reconciliation, and its component tree, extra DOM weight, and larger generated stylesheet
make style/layout passes measurably slower at this node count. The React port ended up
re-implementing the vanilla architecture (imperative DOM registries, CSS-driven state)
just to approach parity — at which point the framework was pure overhead.

## Project layout

```
index.html        app shell
assets/           Markloc logo + Etna brand font
css/styles.css    design system, A4 sheet layout, @media print rules
js/data.js        the curated 821-swatch dataset (from official sources)
js/spectrum.js    generates Spectrum, Tones, Hue Wheel, Grays, RGB Cube (7,987 colors)
js/app.js         UI logic: selection, flow ordering, compare, value modes, preview
js/pdf.js         dependency-free PDF writer (A4, base-14 fonts)
dev-server.mjs    optional tiny static server
shadcn-app/       retired React 19 + Tailwind v4 + shadcn port (kept for reference)
```

## Credits

The Markloc wordmark is set in Etna Sans Serif. Webfont made from
[Web Fonts](http://www.onlinewebfonts.com), licensed CC BY 4.0.
