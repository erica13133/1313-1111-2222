# OCR options for business-card scanning

> Evaluation of free / open-source OCR that can actually ship in the Sedona demo,
> given the constraints the codebase already imposes.

---

## Constraints from the current codebase

Anything we pick has to survive these:

| Constraint | Where it comes from |
| --- | --- |
| **No build step** | `demo.html` loads 8 plain `<script>` tags — no npm, no bundler, no `package.json` |
| **Static hosting** | GitHub Pages serving root `index.html` — no server-side process available |
| **Client-side only** | `js/scan.js:229` promises *"Nothing is uploaded — capture stays in your browser"* |
| **Existing field shape** | Results must fit `{ key, label, value, conf }` as defined in `js/data.js:333` |

The capture pipeline is **already built** — `js/scan.js:61` does camera → `<canvas>` → dataURL.
It just hands off to `S.cardFixtures` instead of running real OCR. That's the only gap.

---

## Recommended: Tesseract.js

**License:** Apache-2.0 · **Runs:** fully in-browser (WASM)

The only mature OCR that drops straight into a no-build setup:

```html
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
```

### Why it fits

- **Zero backend** — preserves the privacy promise made in the UI copy.
- **Per-word confidence scores** — map directly onto the existing `conf` field and the
  `is-low` styling at `js/scan.js:126`. No invention required.
- **Cacheable payload** — ~2 MB wasm + ~12 MB `eng.traineddata` on first run.
  A `_fast` variant cuts the language data to ~2 MB.

### ⚠️ The honest catch

Tesseract is weakest at precisely what business cards are:

- Stylized / display fonts
- Low-contrast designs — the `card2` fixture is literally light-on-dark
- Rotated text and multi-column layouts

**Mitigation:** grayscale → upscale 2× → threshold on the canvas before feeding it.
Even then, expect mediocre results on heavily designed cards.

---

## Upgrade path: RapidOCR / PaddleOCR-ONNX

**License:** Apache-2.0 · **Runs:** in-browser via `onnxruntime-web`

PP-OCRv5 detection + recognition models exported to ONNX.

| | |
| --- | --- |
| **Accuracy** | Substantially better than Tesseract on cards |
| **Size** | ~10–15 MB of models |
| **Acceleration** | WebGPU where available |
| **Cost** | No drop-in script tag — you hand-wire pre/post-processing (det boxes → crop → rec) |

This is the move **if Tesseract disappoints**, not the place to start.

---

## Server-side, only if a backend appears

| Library | License | Notes |
| --- | --- | --- |
| **PaddleOCR** | Apache-2.0 | Best accuracy/perf class for this task |
| **docTR** (Mindee) | Apache-2.0 | Strong detection + recognition, good on cards |
| **EasyOCR** | Apache-2.0 | Easy to stand up, decent results |
| **Surya** | ⚠️ **Restricted** | Great benchmarks, but *not* freely licensed for commercial use above a revenue threshold — **skip for a product demo** |

All of these break static hosting. Only worth it if Sedona is getting a server anyway.

---

## Two things that help more than the engine choice

### 1. Try the QR / vCard path first

Most modern business cards carry a QR code. Decoding one is **~100% accurate** versus
OCR's guesswork.

- Native `BarcodeDetector` where available
- `jsQR` as the fallback

Cheap, high-leverage win. Run it *before* falling back to OCR.

### 2. Field extraction is a separate problem

Raw OCR text → six structured fields is its own step, and it's the harder half.

| Field | Approach | Difficulty |
| --- | --- | --- |
| `email` | Regex | 🟢 Solid |
| `phone` | Regex | 🟢 Solid |
| `website` | Regex | 🟢 Solid |
| `name` | Heuristics — position, font size from bounding boxes | 🟠 Hard |
| `title` | Heuristics — keyword lists, position relative to name | 🟠 Hard |
| `company` | Heuristics + matching against `S.companies` | 🟠 Hard |

---

## Recommendation

> **Tesseract.js + a QR fast-path**, keeping the existing fixture flow as the fallback
> when confidence comes back low.

It fits the no-build constraint, needs no backend, and lets us delete the
*"No real OCR runs in this demo"* notice at `js/scan.js:142`.

### Implementation sketch

1. Add the Tesseract.js CDN tag to `demo.html`
2. Try `BarcodeDetector` / `jsQR` on the captured canvas — if a vCard decodes, use it and skip OCR
3. Preprocess the canvas (grayscale, 2× upscale, threshold)
4. Run Tesseract, take real `conf` values from its word-level data
5. Parse fields with regex + heuristics into the existing `{ key, label, value, conf }` shape
6. Fall back to `S.cardFixtures` when overall confidence is too low to be useful
