<img src="assets/markloc-logo.svg" alt="Markloc" height="26">

# Rang

An open-source project by **Markloc**.

A print-ready digital color swatch book for designers. Browse **8,808 colors** — a
systematic atlas of the whole digital gamut plus the major curated palettes — pick exactly
what you need, and put them on paper the way Pantone does: Pantone-style chips on **A3, A4,
A5, Letter, Legal or Tabloid** sheets, portrait or landscape, with the **color value at the
bottom corner of every swatch** (HEX, RGB or CMYK — your pick).

Then make it yours: build **your own categories** of colors that browse alongside the
built-in palettes, save selections into **projects**, name every color, and hand any of it
to someone else as a portable **`.rang`** file.

Digital (RGB/hex) colors only — this is a screen-color reference, not an ink-matching system.

**Zero dependencies, no build step, and it works offline.** Open `index.html` directly in any
browser, or serve it:

```bash
node dev-server.mjs
```

> This hand-written vanilla version is the primary app. A React/shadcn port was tried and
> retired because direct DOM manipulation is substantially faster at this scale (8,808 live
> swatch cards) — see "Why vanilla" below.

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
- **Print & Export** (`⌘P`) — paper (A3 / A4 / A5 / Letter / Legal / Tabloid, portrait or
  landscape), scope (everything / selected / current view / collections / a saved project),
  order (catalog or flow), density (Large / Standard / Compact), sheet ranges like `1-4, 7`.
  Print and Export always show the live preview first; the PDF is generated client-side.
  The dialog opens on **Selected swatches** whenever a selection exists, and the sheet range
  starts empty every time so a range typed for one document never truncates the next.
- **Theme** — light is the default; light is pure white, dark is pure black. Sheets always
  print on white.

## Your library

Press `L` (or the book icon in the top bar) for **your library** — everything you make lives
there, in this browser, and nothing leaves the machine unless you export it.

**Projects** are saved sets of colors. Pick swatches anywhere in the book, hit **Save…** in
the selection bar, choose or create a project, and **name each color** on the way in
(defaults to its name in the book). A project can be compared full-screen, printed, or
exported to PDF on any paper size like anything else.

**Categories** are your own palettes, and they become *part of the book*: a category shows up
in the catalog, in the sidebar, in search, in Flow and in every print scope, right next to
Tailwind and the rest. Add colors by hex or with the picker, or save existing swatches into
one — the same Save… flow, with **A category** as the destination.

**The color picker** (used for both) is a full editor: saturation/brightness field with a hue
slider, live-linked **HEX / RGB / HSL / CMYK** fields, the system eyedropper where the browser
has one, WCAG contrast against white and black, recent colors, and **nearest match in the
book** — one click snaps your color to the closest of the 8,808. The **Paste a list** tab
takes anything with colors in it (a CSS file, a JSON palette, a column of hex codes), finds
every `#hex`, `rgb()`, `hsl()` and CSS keyword in order, drops duplicates, and adds them all
at once.

In the library panel you can rename anything inline, drag colors to reorder, sort by hue,
lightness or name, duplicate, and delete.

### The `.rang` file

**Export all** writes your whole library — projects, categories, color names, descriptions —
to a single `.rang` file. **Import .rang** (or drop the file onto the panel) reads one back,
so palettes can be published and passed around. Individual projects and categories can be
exported on their own from **More ▾ → Export as .rang**.

A `.rang` file is plain JSON with a format marker, so it stays readable and diffable:

```json
{
  "format": "rang",
  "formatVersion": 1,
  "kind": "category",
  "categories": [
    { "name": "Client greens", "colors": [{ "name": "Moss", "hex": "#4D7C0F" }] }
  ]
}
```

Imports are treated as untrusted input: every field is length-clamped, every color must parse
as a real color, and names are only ever inserted as text. When an incoming name already
exists you choose what happens — **keep both** (default, nothing of yours changes), **merge
into mine** (new colors appended, duplicate hexes skipped), or **replace mine** — after a
preview of exactly what the file contains.

## Offline

Rang never talks to the network. Every color, the PDF writer and your whole library are
local, so there is nothing to be offline *from* — the only thing the browser needs is the
files themselves, and `sw.js` keeps those in a cache. After one visit the app opens, prints,
exports PDFs and reads and writes `.rang` files with no connection at all, and **Add to home
screen / Install** gives you a standalone window.

Two strategies, on purpose:

- **Navigations go to the network first**, cache second. `index.html` is what names the `?v=`
  asset URLs, so keeping it fresh is how a new version gets picked up.
- **Assets are served from the cache and refreshed in the background**
  (stale-while-revalidate), so loads are instant either way, and an edit that forgot its `?v=`
  bump still shows up on the next reload instead of being cached forever.

The precache list is read out of `index.html` at install time rather than duplicated in the
worker — one list to keep correct, not two. Bump `VERSION` in `sw.js` to discard every old
cache.

Service workers need a secure context, so opening `index.html` straight off the disk skips
registration entirely and works exactly as it always has — `file://` needs no cache, the files
are already there.

## Paper sizes

| Paper | Size | Large | Standard | Compact |
|---|---|---|---|---|
| A3 | 297 × 420 mm | 24 | 54 | 84 |
| A4 | 210 × 297 mm | 12 | 24 | 40 |
| A5 | 148 × 210 mm | 6 | 12 | 15 |
| Letter | 8.5 × 11 in | 12 | 20 | 35 |
| Legal | 8.5 × 14 in | 15 | 28 | 50 |
| Tabloid | 11 × 17 in | 24 | 45 | 84 |

Density is a **chip size**, not a chip count: a Standard chip is the same physical size on A5
as on A3, so bigger paper simply fits more of them and the book stays comparable sheet to
sheet. Counts above are portrait; landscape re-solves the grid (A4 landscape Standard is 6 × 4).
Margins grow with the paper but never shrink below A4's, and the bottom one never goes below
20mm: the paper-feed gripper band at the bottom edge is unprintable on most printers and runs
far deeper than the other three edges, so that is what keeps the footer from being sliced in
half by the printer.

## Publishing

There is nothing to build, so any static host will do — push the repo and point the host at
it. On **GitHub Pages**: Settings → Pages → *Deploy from a branch* → your default branch,
folder `/ (root)`.

Everything is already set up for it:

- Every path in `index.html`, `sw.js` and the manifest is **relative**, so the app works at a
  project-site subpath like `https://you.github.io/Colors/` as well as at a domain root. The
  service worker scopes itself to wherever it is served from — verified under a subpath.
- `.nojekyll` tells Pages to serve the files as they are instead of running them through Jekyll.
- Pages is HTTPS, which is what the service worker needs, so the published site is offline-capable
  and installable.

When you push a change, bump the `?v=` query on any `js/` or `css/` file you touched — the
service worker treats those URLs as immutable, and the bump is what tells returning visitors
to fetch the new copy. Changed `sw.js` itself? Bump `VERSION` inside it too.

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
index.html         app shell
sw.js              service worker: caches the app so it runs offline
manifest.webmanifest  installable-app metadata
assets/            Markloc logo, Etna brand font, app icons
css/styles.css     design system, sheet layout, @media print rules
js/data.js         the curated 821-swatch dataset (from official sources)
js/spectrum.js     generates Spectrum, Tones, Hue Wheel, Grays, RGB Cube (7,987 colors)
js/color.js        color math: conversions, contrast, distance, parsing pasted colors
js/paper.js        paper sizes, margins and the swatch grid — one source of truth
js/library.js      projects + categories: model, localStorage, .rang read/write
js/picker.js       the color picker dialog
js/app.js          UI logic: selection, flow ordering, compare, value modes, preview
js/library-ui.js   the library panel, save/import/export flows
js/pdf.js          dependency-free PDF writer (any paper size, base-14 fonts)
dev-server.mjs     optional tiny static server
```

`js/paper.js` is deliberately the only place page geometry is defined: `css/styles.css` lays
the preview and print sheets out from the custom properties it produces, and `js/pdf.js`
draws from the same numbers, so the on-screen sheet, the printed page and the exported PDF
cannot drift apart. Chip position and size agree between the two renderers to within
0.004 mm, measured.

## Credits

The Markloc wordmark is set in Etna Sans Serif. Webfont made from
[Web Fonts](http://www.onlinewebfonts.com), licensed CC BY 4.0.
