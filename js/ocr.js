/* ==========================================================================
   Sedona AI — business card OCR
   Real, in-browser text extraction. Nothing leaves the device.

   Pipeline, cheapest step first:
     1. Card detection — find the card in the frame and crop to it, so every
        later step measures the card instead of the room around it.
     2. QR / vCard fast path — many modern cards carry one, and decoding it is
        exact rather than a guess. If it hits, we skip OCR entirely.
     3. Canvas preprocessing — grayscale, auto-invert for light-on-dark cards,
        percentile contrast stretch, upscale toward Tesseract's happy DPI.
     4. Tesseract.js recognition — word-level text with confidence + boxes.
     5. Field extraction — regex for the machine-readable fields, geometric
        and lexical heuristics for the human ones.

   Attaches to window.OCR.
   ========================================================================== */
(function () {
  'use strict';

  /* Tesseract works best around 300 DPI. A business card is ~3.5in wide, so
     ~1050px is the floor; past ~1800px we pay time for no accuracy. */
  const TARGET_W = 1500;
  const MIN_W = 1000;

  /* Below these, the read is not worth showing as fact. Confidence alone is not
     enough: Tesseract reports how sure it is about the words it found, not how
     much of the card it missed, so a clean read of the three biggest lines
     scores ~90 while every contact detail is still sitting unread. MIN_STRONG
     is the coverage check — email, phone and website are the fields a regex can
     actually validate, and a card that yields none of them was not read. */
  const MIN_MEAN_CONF = 55;
  const MIN_FIELDS = 2;
  const MIN_STRONG = 1;
  const STRONG_KEYS = ['email', 'phone', 'website'];

  const FIELD_ORDER = [
    { key: 'name', label: 'Full name' },
    { key: 'title', label: 'Title' },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'website', label: 'Website' }
  ];

  const TITLE_RX = new RegExp('\\b(ceo|cto|coo|cfo|cmo|cio|chief|founder|co-?founder|' +
    'president|vp|svp|evp|vice\\s+president|director|head|lead|manager|principal|' +
    'partner|associate|analyst|engineer|developer|designer|architect|consultant|' +
    'specialist|strategist|scientist|officer|coordinator|advisor|adviser|owner|' +
    'producer|editor|counsel|controller|supervisor|administrator|representative|' +
    'executive|evangelist|advocate|recruiter|alliances|operations|marketing|sales|' +
    'business\\s+development|product|program|project)\\b', 'i');

  /* Not every organisation is a company. Trade bodies, institutes and chambers
     print their full legal name on the card exactly where a company name goes,
     and if this list misses them the name heuristic happily takes the whole
     organisation as the person's name. */
  const ORG_RX = new RegExp('\\b(inc|llc|ltd|limited|corp|corporation|company|gmbh|' +
    'plc|group|holdings|partners|labs|laboratories|studio|studios|systems|solutions|' +
    'technologies|technology|software|works|industries|ventures|capital|consulting|' +
    'associates|agency|media|robotics|freightworks|association|associations|' +
    'foundation|society|societies|institute|institution|council|chamber|federation|' +
    'alliance|academy|university|college|bank|trust|cooperative|authority|' +
    'commission|organisation|organization|enterprise|enterprises)\\b\\.?', 'i');

  /* Enough TLDs to cover business cards without matching every "Ave." */
  const TLD = '(?:com|net|org|io|co|ai|dev|app|xyz|us|uk|de|fr|es|it|nl|se|no|ca|au|' +
    'jp|cn|in|br|mx|eu|tech|design|studio|agency|works|group|cloud|digital|ventures|' +
    'partners|so|sh|me|to|gg|id|is|la|ly|fm|tv|cc|biz|info|codes|systems|solutions)';

  const EMAIL_RX = new RegExp('[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.' + TLD + '\\b', 'i');
  const URL_RX = new RegExp('(?:https?://)?(?:www\\.)?[a-z0-9][a-z0-9\\-]*(?:\\.[a-z0-9\\-]+)*\\.' +
    TLD + '(?:/[^\\s]*)?', 'ig');
  const PHONE_RX = /(?:\+?\d[\d\s().\-]{6,}\d)/g;

  /* Phone labels are matched against the text immediately BEFORE a number, not
     against the whole line. A card that prints "Fax … Tel …" on one line has to
     score each number on its own label, and a fax is a wrong answer, not a hint. */
  const FAX_LABEL_RX = /\b(?:fax|f)\s*[.:]?\s*$/i;
  const MOBILE_LABEL_RX = /\b(?:mobile|cell|direct|m|c|d)\s*[.:]?\s*$/i;
  const PHONE_LABEL_RX = /\b(?:telephone|phone|tel|office|call|t|p|o)\s*[.:]?\s*$/i;

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* ============================================================ preprocess */

  /** Draw any source (image, video frame, canvas) into a fresh canvas. */
  function toCanvas(source) {
    if (source instanceof HTMLCanvasElement) return source;
    const w = source.naturalWidth || source.videoWidth || source.width;
    const h = source.naturalHeight || source.videoHeight || source.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(source, 0, 0, w, h);
    return c;
  }

  /**
   * Grayscale, auto-invert, contrast-stretch, and rescale toward TARGET_W.
   * Deliberately stops short of hard binarization: a fixed threshold eats the
   * thin, antialiased strokes that display fonts on business cards are made of.
   */
  function preprocess(source) {
    const src = toCanvas(source);
    const scale = clamp(TARGET_W / src.width, 1, 4);
    const w = Math.round(src.width * (src.width < MIN_W ? scale : Math.min(scale, 1.6)));
    const h = Math.round(src.height * (w / src.width));

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const hist = new Uint32Array(256);

    // Pass 1 — luminance in place, build a histogram.
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = px[i + 1] = px[i + 2] = g;
      hist[g]++;
    }

    // Percentile endpoints, ignoring the extreme 2% at each end so a glare
    // spot or a black border does not flatten the whole stretch.
    const total = w * h;
    const cut = total * 0.02;
    let lo = 0;
    let hi = 255;
    for (let acc = 0, g = 0; g < 256; g++) { acc += hist[g]; if (acc > cut) { lo = g; break; } }
    for (let acc = 0, g = 255; g >= 0; g--) { acc += hist[g]; if (acc > cut) { hi = g; break; } }
    if (hi - lo < 24) { lo = 0; hi = 255; }

    // Dark card with light type? Tesseract is trained on dark-on-light.
    let sum = 0;
    for (let g = 0; g < 256; g++) sum += g * hist[g];
    const invert = sum / total < 112;

    const span = hi - lo;
    const lut = new Uint8Array(256);
    for (let g = 0; g < 256; g++) {
      const v = clamp(Math.round(((g - lo) / span) * 255), 0, 255);
      lut[g] = invert ? 255 - v : v;
    }

    // Pass 2 — apply.
    for (let i = 0; i < px.length; i += 4) {
      const v = lut[px[i]];
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: out, inverted: invert };
  }

  /* ================================================================ QR path */

  async function readQR(canvas) {
    const text = await decodeQR(canvas);
    if (!text) return null;
    return parseVCard(text) || parseMeCard(text);
  }

  async function decodeQR(canvas) {
    if ('BarcodeDetector' in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const found = await det.detect(canvas);
        if (found && found.length) return found[0].rawValue;
      } catch (err) { /* fall through to jsQR */ }
    }
    if (typeof window.jsQR === 'function') {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const res = window.jsQR(img.data, img.width, img.height);
      if (res && res.data) return res.data;
    }
    return null;
  }

  /** Unfold RFC-6350 continuation lines, then read the properties we show. */
  function parseVCard(text) {
    if (!/BEGIN:VCARD/i.test(text)) return null;
    const lines = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '').split('\n');
    const get = (name) => {
      const rx = new RegExp('^' + name + '(?:;[^:]*)?:(.*)$', 'i');
      for (const ln of lines) {
        const m = ln.match(rx);
        if (m && m[1].trim()) return m[1].trim();
      }
      return '';
    };
    let name = get('FN');
    if (!name) {
      const n = get('N');                       // N is Family;Given;Middle;…
      if (n) {
        const p = n.split(';');
        name = [p[1], p[0]].filter(Boolean).join(' ').trim();
      }
    }
    return {
      name: name,
      title: get('TITLE') || get('ROLE'),
      company: get('ORG').split(';')[0].trim(),
      email: get('EMAIL'),
      phone: get('TEL'),
      website: get('URL')
    };
  }

  /** MECARD:N:Doe,John;TEL:…;EMAIL:…;; — common on Japanese and older cards. */
  function parseMeCard(text) {
    if (!/^MECARD:/i.test(text.trim())) return null;
    const body = text.trim().replace(/^MECARD:/i, '');
    const get = (k) => {
      const m = body.match(new RegExp('(?:^|;)' + k + ':([^;]*)', 'i'));
      return m ? m[1].trim() : '';
    };
    const raw = get('N');
    const parts = raw.split(',');
    return {
      name: parts.length > 1 ? (parts[1] + ' ' + parts[0]).trim() : raw,
      title: '',
      company: get('ORG'),
      email: get('EMAIL'),
      phone: get('TEL'),
      website: get('URL')
    };
  }

  /* ============================================================= tesseract */

  let workerPromise = null;

  function getWorker(onStage) {
    if (workerPromise) return workerPromise;
    if (typeof window.Tesseract === 'undefined') {
      return Promise.reject(new Error('Tesseract.js did not load.'));
    }
    if (onStage) onStage('engine', 0);
    workerPromise = window.Tesseract.createWorker('eng', 1, {
      logger: function (m) {
        if (!onStage) return;
        if (m.status === 'recognizing text') onStage('read', m.progress || 0);
        else onStage('engine', m.progress || 0);
      }
    }).then(async function (worker) {
      await worker.setParameters({
        // PSM 4: a single column of text at varying sizes — the closest match
        // to how a card stacks name / title / company / contact block.
        tessedit_pageseg_mode: '4',
        preserve_interword_spaces: '1'
      });
      return worker;
    }).catch(function (err) {
      workerPromise = null;                     // let a later attempt retry
      throw err;
    });
    return workerPromise;
  }

  /** Flatten Tesseract output to lines of words. Handles v4 and v5 shapes. */
  function collectLines(data) {
    const out = [];
    const push = (ln) => {
      const words = (ln.words || [])
        .map((w) => ({
          text: String(w.text == null ? '' : w.text).trim(),
          conf: typeof w.confidence === 'number' ? w.confidence : 0,
          bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }
        }))
        .filter((w) => w.text);
      if (!words.length) return;
      const bbox = ln.bbox || {
        x0: Math.min.apply(null, words.map((w) => w.bbox.x0)),
        y0: Math.min.apply(null, words.map((w) => w.bbox.y0)),
        x1: Math.max.apply(null, words.map((w) => w.bbox.x1)),
        y1: Math.max.apply(null, words.map((w) => w.bbox.y1))
      };
      out.push({
        text: words.map((w) => w.text).join(' '),
        words: words,
        conf: typeof ln.confidence === 'number' ? ln.confidence : mean(words.map((w) => w.conf)),
        top: bbox.y0,
        left: bbox.x0,
        height: Math.max(1, bbox.y1 - bbox.y0)
      });
    };

    if (Array.isArray(data.lines) && data.lines.length) {
      data.lines.forEach(push);
    } else if (Array.isArray(data.blocks)) {
      data.blocks.forEach((b) => (b.paragraphs || [])
        .forEach((p) => (p.lines || []).forEach(push)));
    }

    // Last resort: plain text with no geometry. Heuristics degrade but survive.
    if (!out.length && data.text) {
      String(data.text).split('\n').map((s) => s.trim()).filter(Boolean)
        .forEach((t, i) => out.push({
          text: t,
          words: t.split(/\s+/).map((w) => ({ text: w, conf: data.confidence || 0, bbox: null })),
          conf: data.confidence || 0,
          top: i * 10,
          left: 0,
          height: 10
        }));
    }
    return out;
  }

  /* ====================================================== field extraction */

  /* The dot before the TLD is the first thing to go in a hand-held shot: at
     small type it carries almost no ink, so it comes back as whitespace and
     EMAIL_RX — which needs a literal dot — drops the whole address. Whitespace
     is never legal inside an address, so restoring it there is safe. */
  const LOST_DOT_RX = new RegExp('(@[a-z0-9][a-z0-9.\\-]*)\\s+(' + TLD + ')\\b', 'gi');

  /** OCR mangles the parts of an address that carry meaning. Undo the common ones. */
  function repairEmailish(text) {
    return text
      .replace(/\s*\(\s*at\s*\)\s*|\s*\[\s*at\s*\]\s*/gi, '@')
      .replace(/\s*\(\s*dot\s*\)\s*|\s*\[\s*dot\s*\]\s*/gi, '.')
      .replace(/[©®]/g, '@')
      .replace(/\s*@\s*/g, '@')
      .replace(/\s+\.\s*|\s*\.\s+(?=[a-z]{2,})/g, '.')
      .replace(LOST_DOT_RX, '$1.$2');
  }

  function digitsOf(s) { return (s.match(/\d/g) || []).length; }

  /** Rank a number by whatever label was printed just ahead of it. */
  function labelScore(before) {
    if (FAX_LABEL_RX.test(before)) return -12;      // demote, never pick over a real line
    if (MOBILE_LABEL_RX.test(before)) return 8;     // the number they want to be reached on
    if (PHONE_LABEL_RX.test(before)) return 6;
    return 0;
  }

  function pickPhone(lines, fullText) {
    const candidates = [];
    lines.forEach((ln) => {
      let m;
      PHONE_RX.lastIndex = 0;
      while ((m = PHONE_RX.exec(ln.text)) !== null) {
        const raw = m[0].trim();
        const n = digitsOf(raw);
        if (n < 7 || n > 15) continue;
        candidates.push({
          value: raw,
          conf: ln.conf,
          score: n + labelScore(ln.text.slice(0, m.index))
        });
      }
    });
    if (!candidates.length) {
      let m;
      PHONE_RX.lastIndex = 0;
      while ((m = PHONE_RX.exec(fullText)) !== null) {
        const n = digitsOf(m[0]);
        // No line geometry here, so the label may sit on the line above.
        if (n >= 7 && n <= 15) {
          candidates.push({ value: m[0].trim(), conf: 60, score: n + labelScore(fullText.slice(0, m.index)) });
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  function pickWebsite(lines, fullText, email) {
    const emailDomain = email ? email.value.split('@')[1].toLowerCase() : '';
    // Blank the address out first. Otherwise the domain inside it matches as a
    // URL, and a site genuinely printed on the card gets thrown away as a
    // duplicate — the two legitimately share a domain on most cards.
    const hay = email ? fullText.split(email.value).join(' ') : fullText;
    const seen = [];
    let m;
    URL_RX.lastIndex = 0;
    while ((m = URL_RX.exec(hay)) !== null) {
      const raw = m[0].replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[.,;]$/, '');
      if (!raw || raw.indexOf('@') !== -1) continue;
      seen.push(raw);
    }
    if (!seen.length) {
      // A card with an email but no printed URL still tells us the domain.
      return emailDomain ? { value: emailDomain, conf: Math.max(40, email.conf - 12), derived: true } : null;
    }
    // Prefer a domain that agrees with the email — it is the company site.
    seen.sort((a, b) => (b.toLowerCase() === emailDomain ? 1 : 0) - (a.toLowerCase() === emailDomain ? 1 : 0));
    const best = seen[0];
    const host = lines.find((ln) => ln.text.toLowerCase().indexOf(best.toLowerCase()) !== -1);
    return { value: best, conf: host ? host.conf : 70 };
  }

  function scoreName(ln, maxHeight, pageHeight) {
    const t = ln.text.trim();
    if (!t || /\d/.test(t) || t.indexOf('@') !== -1) return -1;
    if (TITLE_RX.test(t) || ORG_RX.test(t)) return -1;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return -1;
    if (t.length < 5 || t.length > 42) return -1;
    if (/[^A-Za-z'’.\-\s]/.test(t)) return -1;

    const capish = words.filter((w) => /^[A-Z][a-zA-Z'’.\-]*$/.test(w) || /^[A-Z'’.\-]{2,}$/.test(w)).length;
    return (capish / words.length) * 40           // people's names are capitalised
      + (ln.height / maxHeight) * 35              // and set larger than anything else
      + (1 - clamp(ln.top / pageHeight, 0, 1)) * 15
      + clamp(ln.conf, 0, 100) * 0.10;
  }

  function pickTitle(lines, nameLine) {
    const tagged = lines.filter((ln) => ln !== nameLine && TITLE_RX.test(ln.text) &&
      ln.text.length < 60 && !/\d{3}/.test(ln.text) && ln.text.indexOf('@') === -1);
    if (tagged.length) {
      // Nearest one below the name reads as that person's title.
      if (nameLine) {
        tagged.sort((a, b) => {
          const da = a.top >= nameLine.top ? a.top - nameLine.top : 1e6;
          const db = b.top >= nameLine.top ? b.top - nameLine.top : 1e6;
          return da - db;
        });
      }
      return { value: tagged[0].text.replace(/\s+/g, ' ').trim(), conf: tagged[0].conf };
    }
    if (!nameLine) return null;
    const below = lines
      .filter((ln) => ln.top > nameLine.top && ln.text.indexOf('@') === -1 && !/\d{3}/.test(ln.text))
      .sort((a, b) => a.top - b.top)[0];
    return below ? { value: below.text.trim(), conf: Math.max(35, below.conf - 15) } : null;
  }

  const collapse = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  function pickCompany(lines, fullText, website, email, skip) {
    // 1. A name already in the CRM is the most valuable answer we can give.
    const S = window.SEDONA;
    if (S && Array.isArray(S.companies)) {
      const hay = collapse(fullText);
      let hit = null;
      S.companies.forEach((co) => {
        const needle = collapse(co.name);
        if (needle.length >= 5 && hay.indexOf(needle) !== -1) {
          if (!hit || needle.length > collapse(hit.name).length) hit = co;
        }
      });
      if (hit) {
        const host = lines.find((ln) => collapse(ln.text).indexOf(collapse(hit.name)) !== -1);
        return { value: hit.name, conf: host ? Math.max(host.conf, 80) : 82, companyId: hit.id };
      }
    }

    // 2. A line that names itself as an organisation.
    const org = lines.find((ln) => skip.indexOf(ln) === -1 && ORG_RX.test(ln.text) &&
      ln.text.indexOf('@') === -1 && ln.text.length < 50);
    if (org) return { value: org.text.replace(/\s+/g, ' ').trim(), conf: org.conf };

    // 3. Fall back to the domain, which is usually the company name.
    const domain = (website && website.value) || (email && email.value.split('@')[1]) || '';
    const stem = domain.split('/')[0].split('.')[0];
    if (stem && stem.length > 2) {
      const pretty = stem.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
      return { value: pretty, conf: 45, derived: true };
    }
    return null;
  }

  function extractFields(lines) {
    const rawText = lines.map((ln) => ln.text).join('\n');
    const fullText = repairEmailish(rawText);
    const maxHeight = Math.max.apply(null, lines.map((ln) => ln.height).concat([1]));
    const pageHeight = Math.max.apply(null, lines.map((ln) => ln.top).concat([1])) || 1;

    const emailMatch = fullText.match(EMAIL_RX);
    let email = null;
    if (emailMatch) {
      const host = lines.find((ln) => repairEmailish(ln.text).indexOf(emailMatch[0]) !== -1);
      email = { value: emailMatch[0], conf: host ? host.conf : 70 };
    }

    const website = pickWebsite(lines, fullText, email);
    const phone = pickPhone(lines, fullText);

    let nameLine = null;
    let bestScore = -1;
    lines.forEach((ln) => {
      const s = scoreName(ln, maxHeight, pageHeight);
      if (s > bestScore) { bestScore = s; nameLine = ln; }
    });
    if (bestScore < 0) nameLine = null;
    const name = nameLine ? { value: nameLine.text.replace(/\s+/g, ' ').trim(), conf: nameLine.conf } : null;

    const title = pickTitle(lines, nameLine);
    const titleLine = title ? lines.find((ln) => ln.text.trim() === title.value) : null;
    const company = pickCompany(lines, fullText, website, email, [nameLine, titleLine].filter(Boolean));

    return {
      values: { name, title, company, email, phone, website },
      companyId: company && company.companyId ? company.companyId : null,
      rawText: rawText
    };
  }

  /* =================================================================== api */

  /** Shape the result the way js/scan.js and js/data.js already expect. */
  function toFields(values) {
    return FIELD_ORDER.map(function (f) {
      const hit = values[f.key];
      return {
        key: f.key,
        label: f.label,
        value: hit ? String(hit.value).trim() : '',
        conf: hit ? Math.round(clamp(hit.conf, 0, 100)) : 0,
        derived: !!(hit && hit.derived)
      };
    });
  }

  /**
   * Read a card. Resolves to
   *   { ok, source, fields, companyId, meanConf, rawText, reason? }
   * `ok: false` means the caller should not present the values as fact.
   */
  async function scan(source, onStage) {
    const stage = onStage || function () {};
    const { canvas } = preprocess(source);

    stage('qr', 0);
    let qr = null;
    try {
      qr = await readQR(canvas) || await readQR(toCanvas(source));
    } catch (err) { /* QR is opportunistic — never fatal */ }

    if (qr && (qr.name || qr.email)) {
      const values = {};
      Object.keys(qr).forEach((k) => {
        if (qr[k]) values[k] = { value: qr[k], conf: 100 };
      });
      const fields = toFields(values);
      let companyId = null;
      const S = window.SEDONA;
      if (S && qr.company) {
        const match = S.companies.find((c) => collapse(c.name) === collapse(qr.company));
        if (match) companyId = match.id;
      }
      stage('done', 1);
      return {
        ok: true,
        source: 'qr',
        fields: fields,
        companyId: companyId,
        meanConf: 100,
        rawText: ''
      };
    }

    const worker = await getWorker(stage);
    stage('read', 0);
    const res = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const data = res.data || {};
    const lines = collectLines(data);

    if (!lines.length) {
      return { ok: false, source: 'ocr', reason: 'no-text', fields: toFields({}), meanConf: 0, rawText: '' };
    }

    stage('match', 0);
    const picked = extractFields(lines);
    const fields = toFields(picked.values);
    const found = fields.filter((f) => f.value).length;
    const strong = fields.filter((f) => f.value && STRONG_KEYS.indexOf(f.key) !== -1).length;
    const meanConf = Math.round(typeof data.confidence === 'number'
      ? data.confidence
      : mean(lines.map((ln) => ln.conf)));

    const reason = found < MIN_FIELDS ? 'too-few-fields'
      : strong < MIN_STRONG ? 'partial-read'
        : meanConf < MIN_MEAN_CONF ? 'low-confidence'
          : null;

    stage('done', 1);
    return {
      ok: !reason,
      source: 'ocr',
      reason: reason,
      fields: fields,
      companyId: picked.companyId,
      meanConf: meanConf,
      strong: strong,
      rawText: picked.rawText
    };
  }

  /** Warm the worker while the user is still framing the shot. */
  function preload() {
    if (typeof window.Tesseract === 'undefined') return;
    getWorker(null).catch(function () { /* surfaced later, on real use */ });
  }

  window.OCR = {
    scan: scan,
    preload: preload,
    preprocess: preprocess,
    available: () => typeof window.Tesseract !== 'undefined'
  };
}());
