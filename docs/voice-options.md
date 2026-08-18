# Speech-to-text options for the voice agent

> What was measured, chosen, and rejected while making `js/voice.js` transcribe
> real recordings instead of rendering an authored memo.

---

## Constraints from the current codebase

The same four that governed the OCR choice:

| Constraint | Where it comes from |
| --- | --- |
| **No build step** | `demo.html` loads plain `<script>` tags — no npm, no bundler |
| **Static hosting** | GitHub Pages — no server-side process available |
| **Client-side only** | The UI promises the recording stays on the device |
| **Existing memo shape** | Results must fit the memo object in `js/data.js:205` |

The capture half was **already built** — `js/voice.js` did `getUserMedia` →
`MediaRecorder` → live waveform, and kept the blob. `finish()` then threw it
away and rendered `S.memos[0]`. That was the whole gap.

---

## Chosen: Transformers.js + Whisper `base.en` on WASM

**License:** Apache-2.0 (library), MIT (model) · **Runs:** fully in-browser

ESM-only, which costs nothing here — a dynamic `import()` inside the existing
IIFE keeps the plain script-tag setup intact:

```js
const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
const pipe = await mod.pipeline('automatic-speech-recognition',
  'onnx-community/whisper-base.en', { device: 'wasm', dtype: 'q8' });
```

### Measured, not assumed

Against a 15.6-second sample with known ground truth:

| | |
| --- | --- |
| **Accuracy** | 92% word recall |
| **Speed** | 3.7 s — about 4× realtime |
| **First load** | ~77 MB (23 MB encoder + 54 MB decoder), 150 s on a slow link |
| **Cached load** | 1.5 s |

Every error was a proper noun: *Marisol* → "Mara Sol", *Novara Labs* →
"Novar Labs", *SOC 2* → "SOC to". That pattern is what makes the extraction
step below worth more than a bigger model would be.

---

## ⚠️ The trap: WebGPU

**Do not enable WebGPU with quantised weights.** Same model, same audio,
`device: 'webgpu'` with `dtype: 'q8'` returns a repeating hallucination loop —
0% recall — and runs *slower* than WASM doing it (0.6× realtime vs 4.2×).

Fixing the arithmetic means `fp32` weights, which are several hundred megabytes.
That is not a trade a demo should make, so `js/stt.js` pins `wasm` deliberately.
The constant has a comment on it; leave it alone without re-measuring.

---

## Considered and rejected

| Option | Why not |
| --- | --- |
| **Web Speech API** | Zero payload and live interim results, but Chrome and Safari route audio to a **cloud recogniser** by default, which breaks the privacy promise the UI makes. `processLocally` + `install()` gives on-device recognition in recent Chrome — worth revisiting as a fast path once `available()` reports local support widely. |
| **Moonshine** (MIT) | Smaller and faster than `whisper-tiny`, no fixed 30-second window, good for streaming. Less turnkey in Transformers.js. The upgrade path if load size becomes the complaint. |
| **whisper.cpp (WASM)** | Better *engine*, worse *delivery*. Needs an Emscripten build and a `ggml` binary committed to the repo, and browser threading wants `SharedArrayBuffer` → COOP/COEP headers, **which GitHub Pages cannot set**. Revisit the day a native app or a real host appears. |
| **faster-whisper / WhisperX** | Python, server-side. Impossible on static hosting. WhisperX diarization also leans on gated pyannote models. |
| **`whisper-tiny.en`** | Roughly a third of the download. A reasonable trade if 77 MB proves too slow on phones — accuracy cost not yet measured. |

---

## The harder half: transcript → memo

Speech-to-text is the easy part. Turning text into people, companies, dates and
commitments is where the agent lives, and it needs no model at all.

### Entity matching is fuzzy on purpose

The CRM already knows every name worth spotting, so `mentions()` in `js/stt.js`
runs a **capped Levenshtein** search against `S.contacts` and `S.companies`
rather than an `indexOf`. That is what recovers "Mara Sol" → Marisol Okonjo and
"Novar Labs" → Novara Labs.

Three bugs found while testing this, all fixed — and all worth not
reintroducing:

| Bug | Fix |
| --- | --- |
| A five-character token threshold matched the **wrong contact** — "Amara" is one edit from "Mara" | Floor raised to six characters |
| Whisper emits stray `"` marks, which blocked the action parser's leading-phrase strip | Quotes stripped before parsing |
| Two spoken sentences joined with a comma collapsed **two commitments into one** | Commitments mined from clauses, not sentences |

Matching also runs against the *collapsed* transcript rather than its word list,
because the recogniser splits names it does not know into two words.

### Commitments stay narrow

`COMMIT_RX` only fires on first-person forward-looking phrasing ("I'll", "I told
her I would", "we should"). Promoting ordinary context to a task is how an agent
like this loses trust, so the list is deliberately conservative.

---

## Not solved

- **Speaker labels.** Browser diarization is not practical. A post-meeting memo
  is one person talking, so every turn is labelled `You`.
- **Proper nouns outside the CRM.** Nothing recovers a name the app has never
  seen; it stays mangled in the transcript.
- **Mobile performance.** Measured on desktop only. WASM has no GPU fallback,
  so phones will be slower — by how much is unknown.
- **The MediaRecorder path.** Verified with a WAV file. Real recordings arrive
  as webm/opus (Chrome) or mp4/aac (Safari); `decodeAudioData` should handle
  both, but this has not been confirmed on a device.
