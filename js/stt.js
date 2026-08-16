/* ==========================================================================
   Sedona AI — speech to text
   Real, in-browser transcription. Nothing leaves the device.

   Pipeline:
     1. Decode — the MediaRecorder blob is whatever the browser felt like
        encoding; Whisper wants 16 kHz mono PCM, so we resample it ourselves.
     2. Whisper (ONNX, via Transformers.js) — loaded from a CDN on first use
        and cached by the browser after that.
     3. Extraction — known people and companies are matched against the CRM,
        dates and commitments come out of the sentence shapes around them.

   Attaches to window.STT.
   ========================================================================== */
(function () {
  'use strict';

  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  const MODEL = 'onnx-community/whisper-base.en';

  /* WASM, not WebGPU, and it is not a close call. The quantised weights we
     download return a repeating hallucination loop on the WebGPU backend — and
     run slower while doing it. Fixing the arithmetic means fp32 weights, which
     are several hundred megabytes; that is not a trade this demo should make.
     On WASM the same model transcribes at roughly four times realtime. */
  const DEVICE = 'wasm';
  const DTYPE = 'q8';
  const SAMPLE_RATE = 16000;

  /* Under this many characters there is nothing worth calling a memo, and
     Whisper on near-silence emits confident nonsense rather than nothing. */
  const MIN_CHARS = 12;

  /* ============================================================== transcribe */

  let pipePromise = null;

  function getPipeline(onStage) {
    if (pipePromise) return pipePromise;
    pipePromise = import(/* webpackIgnore: true */ LIB)
      .then(function (mod) {
        mod.env.allowLocalModels = false;
        if (onStage) onStage('engine', 0);
        return mod.pipeline('automatic-speech-recognition', MODEL, {
          device: DEVICE,
          dtype: DTYPE,
          progress_callback: function (p) {
            if (onStage && p && p.status === 'progress' && p.total) {
              onStage('engine', (p.loaded || 0) / p.total);
            }
          }
        });
      })
      .catch(function (err) {
        pipePromise = null;                       // let a later attempt retry
        throw err;
      });
    return pipePromise;
  }

  /**
   * Any recorded blob to the mono Float32 at SAMPLE_RATE that Whisper expects.
   * MediaRecorder hands back webm/opus on Chrome and mp4/aac on Safari, both at
   * the device's own rate, so this conversion is not optional.
   */
  async function toPcm(blob) {
    const buf = await blob.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let decoded;
    try {
      decoded = await ctx.decodeAudioData(buf);
    } finally {
      ctx.close();
    }
    if (decoded.sampleRate === SAMPLE_RATE && decoded.numberOfChannels === 1) {
      return decoded.getChannelData(0);
    }
    const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const off = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  /**
   * Transcribe a recording. Resolves to
   *   { ok, text, seconds, ms, reason? }
   * `ok: false` means there is nothing worth showing as a memo.
   */
  async function transcribe(blob, onStage) {
    const stage = onStage || function () {};
    const t0 = (window.performance || Date).now();

    stage('decode', 0);
    let audio;
    try {
      audio = await toPcm(blob);
    } catch (err) {
      return { ok: false, reason: 'decode', text: '', seconds: 0, ms: 0 };
    }
    const seconds = audio.length / SAMPLE_RATE;

    const pipe = await getPipeline(stage);
    stage('read', 0);
    const out = await pipe(audio, { chunk_length_s: 30, stride_length_s: 5 });
    const text = String((out && out.text) || '').trim();
    const ms = Math.round((window.performance || Date).now() - t0);

    if (text.length < MIN_CHARS) {
      return { ok: false, reason: 'too-short', text: text, seconds: seconds, ms: ms };
    }
    return { ok: true, text: text, seconds: seconds, ms: ms };
  }

  /* ============================================================== extraction */

  const collapse = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Levenshtein, abandoned as soon as it exceeds `cap`. */
  function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /* Speech recognition mangles exactly the words that matter most here: every
     error in testing was a proper noun ("Novar Labs", "Mara Sol"). Since the
     CRM already knows the names worth spotting, a near-match against that list
     recovers them — which is why this is fuzzy rather than a plain indexOf. */
  /** Is `needle` present in `hay` allowing a few characters of slop? */
  function fuzzyIn(needle, hay) {
    if (needle.length < 5) return false;
    if (hay.indexOf(needle) !== -1) return true;
    const cap = Math.max(1, Math.floor(needle.length * 0.2));
    for (let i = 0; i + needle.length - cap <= hay.length; i++) {
      for (let len = needle.length - cap; len <= needle.length + cap; len++) {
        if (i + len > hay.length) break;
        if (editDistance(needle, hay.substr(i, len), cap) <= cap) return true;
      }
    }
    return false;
  }

  function mentions(name, hay) {
    const needle = collapse(name);
    if (!needle) return false;
    if (hay.indexOf(needle) !== -1 || fuzzyIn(needle, hay)) return true;

    /* Surnames often go unsaid, so a given name on its own has to count. Six
       characters is the floor: at five, "Amara" is one edit from "Mara" in
       "Marisol" and the wrong contact gets pulled into the memo. Matching runs
       against the collapsed transcript rather than its word list because the
       recogniser splits names it does not know ("Marisol" → "Mara Sol"). */
    return String(name).split(/\s+/).some(function (tok) {
      const t = collapse(tok);
      return t.length >= 6 && fuzzyIn(t, hay);
    });
  }

  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const DATE_RX = new RegExp(
    '\\b(today|tonight|tomorrow|this (?:morning|afternoon|evening|week|month|quarter)|' +
    'next (?:week|month|quarter|year|' + DAYS.join('|') + ')|' +
    '(?:the )?end of (?:the )?(?:week|month|quarter|year)|' +
    '(?:by |on |before )?(?:' + DAYS.join('|') + ')|' +
    'in (?:a|an|\\d+) (?:day|days|week|weeks|month|months)|' +
    'january|february|march|april|may|june|july|august|september|october|november|december)\\b',
    'gi');

  /** Turn a spoken date into an offset in days from today. */
  function dueFrom(phrase) {
    const p = String(phrase).toLowerCase();
    if (/today|tonight|this (morning|afternoon|evening)/.test(p)) return 0;
    if (/tomorrow/.test(p)) return 1;
    if (/this week/.test(p)) return 3;
    if (/next week/.test(p)) return 7;
    if (/end of (the )?week/.test(p)) return 5;
    if (/next month|end of (the )?month/.test(p)) return 21;
    if (/quarter|next year|end of (the )?year/.test(p)) return 30;
    const rel = p.match(/in (a|an|\d+) (day|week|month)/);
    if (rel) {
      const n = rel[1] === 'a' || rel[1] === 'an' ? 1 : parseInt(rel[1], 10);
      return n * (rel[2] === 'week' ? 7 : rel[2] === 'month' ? 30 : 1);
    }
    for (let i = 0; i < DAYS.length; i++) {
      if (p.indexOf(DAYS[i]) !== -1) {
        const delta = (i - new Date().getDay() + 7) % 7;
        return delta === 0 ? 7 : delta;         // "Friday" said on a Friday means next one
      }
    }
    return 3;
  }

  /* A commitment is first-person and forward-looking. Anything else in a memo
     is context, and promoting context to a task is how these agents lose
     trust — so this list stays deliberately narrow. */
  const COMMIT_RX = new RegExp(
    "\\b(i(?:'| wi)?ll|i will|i can|i need to|i have to|i must|i should|" +
    "i'm going to|i am going to|i told (?:her|him|them) (?:i|that i) would|" +
    "i said i would|we should|we need to|we'll|we will|let's|" +
    "(?:need|needs|wants|asked) (?:me )?(?:to|for))\\b", 'i');

  /* Strip the promise off the front so the item reads like a task. */
  const LEAD_RX = new RegExp(
    "^(?:so |and |then |also |ok(?:ay)? |but )*" +
    "(?:i told (?:her|him|them) (?:that )?i would|i said i would|" +
    "i(?:'| wi)?ll|i will|i can|i need to|i have to|i must|i should|" +
    "i'm going to|i am going to|we should|we need to|we(?:'| wi)?ll|we will|let's)\\s+", 'i');

  /* Whisper punctuates by ear. It drops stray quote marks in, and it will run
     two spoken sentences together with a comma — which is why commitments are
     mined from clauses rather than sentences. */
  const CLAUSE_SPLIT_RX = /,\s+(?=(?:and\s+|so\s+|then\s+)?(?:i|we|let)\b)/i;

  function clean(text) {
    return String(text).replace(/[“”"„]/g, '').replace(/\s+/g, ' ').trim();
  }

  function sentences(text) {
    return clean(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }

  function clauses(text) {
    const out = [];
    sentences(text).forEach(function (s) {
      s.split(CLAUSE_SPLIT_RX).forEach(function (c) {
        const t = c.trim();
        if (t) out.push(t);
      });
    });
    return out;
  }

  const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * Pull people, companies, dates and commitments out of a transcript.
   * Returns the memo shape js/voice.js already renders.
   */
  function extract(text) {
    const S = window.SEDONA;
    const hay = collapse(text);

    const people = [];
    const contactIds = [];
    const companies = [];
    let companyId = null;

    if (S && Array.isArray(S.contacts)) {
      S.contacts.forEach(function (p) {
        if (mentions(p.name, hay)) { people.push(p.name); contactIds.push(p.id); }
      });
    }
    if (S && Array.isArray(S.companies)) {
      S.companies.forEach(function (c) {
        if (mentions(c.name, hay)) {
          companies.push(c.name);
          if (!companyId) companyId = c.id;
        }
      });
    }
    // A person we know implies their company even when it is never said aloud.
    if (!companyId && contactIds.length && S) {
      const first = S.contacts.find((p) => p.id === contactIds[0]);
      if (first && first.companyId) {
        companyId = first.companyId;
        const co = S.company ? S.company(first.companyId) : null;
        if (co && companies.indexOf(co.name) === -1) companies.push(co.name);
      }
    }

    const dates = [];
    let m;
    DATE_RX.lastIndex = 0;
    while ((m = DATE_RX.exec(text)) !== null) {
      const phrase = titleCase(m[0].trim().replace(/^(by|on|before)\s+/i, ''));
      if (dates.indexOf(phrase) === -1) dates.push(phrase);
    }

    const actions = [];
    clauses(text).forEach(function (s) {
      if (!COMMIT_RX.test(s)) return;
      const when = s.match(DATE_RX);
      const body = s.replace(/^(?:and|so|then)\s+/i, '')
        .replace(LEAD_RX, '').replace(/[.!?,]+$/, '').trim();
      if (body.length < 8) return;
      actions.push({
        text: titleCase(body),
        due: when ? dueFrom(when[0]) : 3,
        done: false
      });
    });

    return {
      transcript: sentences(text).map((s) => ['You', s]),
      entities: { people: people, companies: companies, dates: dates },
      contactIds: contactIds,
      companyId: companyId,
      actions: actions.slice(0, 5)
    };
  }

  /* ==================================================================== api */

  /** Warm the model while the user is still talking. */
  function preload() {
    getPipeline(null).catch(function () { /* surfaced later, on real use */ });
  }

  window.STT = {
    transcribe: transcribe,
    extract: extract,
    preload: preload,
    available: () => typeof window.OfflineAudioContext !== 'undefined'
  };
}());
