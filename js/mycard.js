/* ==========================================================================
   Sedona AI — My card
   The other half of the exchange.

   Scanning reads the card someone hands you. This builds the one you hand
   back: a photo taken at the event, the context of where you met, and a QR
   code carrying your vCard.

   Two things keep it honest rather than decorative:

     1. The card is drawn on a canvas at a fixed export size, and the preview
        is that same canvas scaled by CSS. What you see is the file you get —
        there is no second renderer to drift out of sync.
     2. The QR encodes a vCard in exactly the properties js/ocr.js:172 reads
        back, so a card made here goes through this app's own scanner on the
        QR fast path and lands in the CRM with 100% confidence. "Test in
        scanner" runs that round trip.

   Attaches to window.Views.mycard.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, $, toast } = U;
  const S = window.SEDONA;

  /* Export geometry. 2:3 so it sits well in a phone share sheet. */
  const W = 1080;
  const H = 1620;
  const PAD = 76;
  const INNER = W - PAD * 2;

  const UI_FONT = '"Inter", system-ui, -apple-system, sans-serif';
  const DISPLAY_FONT = '"Fraunces", Georgia, serif';
  const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

  /* Card palettes are literal hex, not CSS variables: the canvas is exported
     as a file and has to look the same wherever it is opened, independent of
     whatever theme the app happens to be in. */
  const PALETTES = {
    light: {
      bg: '#FFFFFF', bg2: '#F4ECE2', ink: '#1C1917', muted: '#6B625B',
      faint: '#9A9089', line: '#E7DDD1', accent: '#B8472E', onAccent: '#FFFFFF',
      well: '#F7F2EB'
    },
    dark: {
      bg: '#1C1917', bg2: '#342A22', ink: '#FAF6F1', muted: '#B3A89F',
      faint: '#8A7F77', line: '#3B332B', accent: '#E8A87C', onAccent: '#241C16',
      well: '#241E19'
    }
  };

  /* The demo account — the person whose card this is. */
  const ME = {
    name: 'Elena Ruiz',
    title: 'Head of Partnerships',
    company: 'Sedona AI',
    tag: 'Partnerships',
    email: 'elena@sedona.ai',
    phone: '+1 (928) 555-0146',
    website: 'sedona.ai',
    handle: '@elenaruiz',
    tagline: 'Every card you collect should already know who it belongs to.'
  };

  /* ============================================================== context */

  /* Where cards actually change hands. A video call is often the nearest thing
     on the calendar and is never the answer to "where did we meet". */
  const IN_PERSON = ['conference', 'dinner'];
  const NEARBY_DAYS = 21;

  /**
   * The event you are most plausibly standing at: the closest in-person one
   * within a few weeks, falling back to the closest event of any kind so the
   * field is never left empty.
   */
  function nearestEvent() {
    const now = Date.now();
    const nearest = function (list) {
      let best = null;
      let bestGap = Infinity;
      list.forEach(function (e) {
        const gap = Math.abs(e.start.getTime() - now);
        if (gap < bestGap) { bestGap = gap; best = e; }
      });
      return { event: best, gap: bestGap };
    };
    const all = S.events || [];
    const hit = nearest(all.filter((e) => IN_PERSON.indexOf(e.type) > -1));
    if (hit.event && hit.gap <= NEARBY_DAYS * 86400000) return hit.event;
    return nearest(all).event;
  }

  function contextLine(ev) {
    if (!ev) return '';
    return ev.title + ' · ' + ev.location + ' — ' + U.fmtDate(ev.start, 'long');
  }

  /* ============================================================== vCard */

  /** RFC-6350 escaping for the characters that carry structure. */
  function vEsc(v) {
    return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1');
  }

  /**
   * Only the properties js/ocr.js:172 parses back out. Emitting more would
   * inflate the QR — and therefore its module count — for data this app
   * would silently drop on the way back in.
   */
  function vcard(st) {
    const parts = String(st.name || '').trim().split(/\s+/);
    const family = parts.length > 1 ? parts[parts.length - 1] : '';
    const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
    const out = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (st.name) {
      out.push('N:' + vEsc(family) + ';' + vEsc(given) + ';;;');
      out.push('FN:' + vEsc(st.name));
    }
    if (st.title) out.push('TITLE:' + vEsc(st.title));
    if (st.company) out.push('ORG:' + vEsc(st.company));
    if (st.email) out.push('EMAIL;TYPE=WORK:' + vEsc(st.email));
    if (st.phone) out.push('TEL;TYPE=CELL:' + vEsc(st.phone));
    if (st.website) {
      const url = /^https?:\/\//i.test(st.website) ? st.website : 'https://' + st.website;
      out.push('URL:' + vEsc(url));
    }
    out.push('END:VCARD');
    return out.join('\r\n');
  }

  /* ======================================================= canvas helpers */

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    const k = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }

  /**
   * Letter-spaced text, drawn a glyph at a time. `ctx.letterSpacing` would be
   * tidier but is missing in older Safari, and the mono labels are the part of
   * the card most obviously wrong without tracking.
   */
  function tracked(ctx, text, x, y, font, color, spacing, align) {
    ctx.font = font;
    ctx.fillStyle = color;
    const chars = String(text).split('');
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.textAlign = 'left';
    chars.forEach(function (c, i) {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
    return total;
  }

  /** Greedy wrap, with an ellipsis if it runs past maxLines. */
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const next = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width <= maxW || !line) {
        line = next;
      } else {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines) {
      // Anything left over gets folded into an ellipsis on the last line.
      const used = lines.join(' ').split(/\s+/).length;
      if (used < words.length) {
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(last + '…').width > maxW) {
          last = last.replace(/\s*\S+$/, '');
        }
        lines[maxLines - 1] = (last || '') + '…';
      }
    }
    return lines;
  }

  /** Largest size at or below `size` that fits `maxW` on one line. */
  function fitted(ctx, text, weight, size, family, maxW, min) {
    let s = size;
    ctx.font = weight + ' ' + s + 'px ' + family;
    while (s > (min || 24) && ctx.measureText(text).width > maxW) {
      s -= 2;
      ctx.font = weight + ' ' + s + 'px ' + family;
    }
    return s;
  }

  /** Cover-fit, with `focus` (0–1) choosing which slice of a tall photo shows. */
  function drawCover(ctx, img, x, y, w, h, focus) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) * (focus == null ? 0.5 : focus);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /** The Sedona mesa mark, redrawn from assets/logo.svg's 48-unit viewBox. */
  function drawMark(ctx, x, y, size) {
    const k = size / 48;
    const arc = (cx, cy, r, fill) => {
      ctx.beginPath();
      ctx.arc(x + cx * k, y + cy * k, r * k, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    arc(24, 40, 20, '#E8A87C');
    arc(24, 40, 13, '#2E7D6B');
    arc(24, 40, 6, '#B8472E');
  }

  function drawQR(ctx, text, x, y, size, dark, light) {
    if (typeof window.qrcode !== 'function') return false;
    let qr;
    try {
      qr = window.qrcode(0, 'M');          // 0 = pick the smallest version that fits
      qr.addData(text);
      qr.make();
    } catch (err) {
      return false;                        // over capacity — caller draws a fallback
    }
    const n = qr.getModuleCount();
    const quiet = 4;                       // the spec's margin; readers rely on it
    const cell = size / (n + quiet * 2);
    ctx.fillStyle = light;
    rr(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.fillStyle = dark;
    for (let r = 0; r < n; r++) {
      const y0 = Math.round(y + (r + quiet) * cell);
      const y1 = Math.round(y + (r + quiet + 1) * cell);
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        // Snap both edges to the same rounded grid the next module starts on.
        // Padding the size instead (ceil + 1) bleeds dark modules over their
        // light neighbours, and at ~4px per module that is the whole symbol.
        const x0 = Math.round(x + (c + quiet) * cell);
        const x1 = Math.round(x + (c + quiet + 1) * cell);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    return true;
  }

  /* ================================================================ render */

  function drawCard(ctx, st) {
    const pal = PALETTES[st.theme] || PALETTES.light;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(1, pal.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* --- brand row --- */
    drawMark(ctx, PAD, 74, 46);
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.ink;
    ctx.font = '700 34px ' + UI_FONT;
    ctx.fillText(st.company || 'Sedona AI', PAD + 64, 108);
    if (st.tag) {
      tracked(ctx, st.tag.toUpperCase(), W - PAD, 106, '500 21px ' + MONO_FONT, pal.faint, 2.2, 'right');
    }

    /* --- photo --- */
    const photoY = 152;
    const photoH = 580;
    ctx.save();
    rr(ctx, PAD, photoY, INNER, photoH, 22);
    ctx.clip();
    if (st.photo) {
      drawCover(ctx, st.photo, PAD, photoY, INNER, photoH, st.focus);
    } else {
      ctx.fillStyle = pal.well;
      ctx.fillRect(PAD, photoY, INNER, photoH);
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.faint;
      ctx.font = '500 26px ' + UI_FONT;
      ctx.fillText('Add a photo from the event', W / 2, photoY + photoH / 2 + 9);
    }
    ctx.restore();
    ctx.save();
    rr(ctx, PAD + 0.5, photoY + 0.5, INNER - 1, photoH - 1, 22);
    ctx.strokeStyle = st.theme === 'dark' ? 'rgba(250,246,241,0.14)' : 'rgba(28,25,23,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    /* --- greeting + where we met --- */
    let y = photoY + photoH + 70;
    ctx.textAlign = 'left';
    if (st.greeting) {
      ctx.fillStyle = pal.ink;
      ctx.font = '500 46px ' + DISPLAY_FONT;
      ctx.fillText(st.greeting, PAD, y);
      y += 42;
    }
    if (st.context) {
      ctx.font = '500 21px ' + MONO_FONT;
      const ctxLines = wrap(ctx, st.context.toUpperCase(), INNER - 40, 1);
      tracked(ctx, ctxLines[0] || '', PAD, y, '500 21px ' + MONO_FONT, pal.muted, 1.6, 'left');
      y += 62;
    } else {
      y += 20;
    }

    /* --- name, then title · company beside it if there is room --- */
    const name = st.name || '';
    const meta = [st.title, st.company].filter(Boolean).join(' · ');
    const nameSize = fitted(ctx, name, '700', 62, UI_FONT, INNER, 34);
    ctx.font = '700 ' + nameSize + 'px ' + UI_FONT;
    ctx.fillStyle = pal.ink;
    ctx.fillText(name, PAD, y);
    const nameW = ctx.measureText(name).width;
    if (meta) {
      ctx.font = '500 27px ' + UI_FONT;
      ctx.fillStyle = pal.muted;
      if (nameW + 20 + ctx.measureText(meta).width <= INNER) {
        ctx.fillText(meta, PAD + nameW + 20, y);
      } else {
        y += 38;
        ctx.fillText(wrap(ctx, meta, INNER, 1)[0] || '', PAD, y);
      }
    }

    /* --- tagline --- */
    if (st.tagline) {
      y += 50;
      ctx.font = '600 30px ' + UI_FONT;
      ctx.fillStyle = pal.ink;
      wrap(ctx, st.tagline, INNER, 2).forEach(function (ln, i) {
        ctx.fillText(ln, PAD, y + i * 40);
        if (i) y += 40;
      });
    }

    /* --- offer block --- */
    if (st.showOffer && (st.offerHeadline || st.offerBody)) {
      const oy = y + 46;
      const oh = 210;
      ctx.fillStyle = pal.accent;
      rr(ctx, PAD, oy, INNER, oh, 20);
      ctx.fill();
      const ox = PAD + 40;
      if (st.offerLabel) {
        tracked(ctx, st.offerLabel.toUpperCase(), ox, oy + 48,
          '600 20px ' + MONO_FONT, pal.onAccent, 3, 'left');
      }
      if (st.offerHeadline) {
        const s = fitted(ctx, st.offerHeadline, '700', 42, UI_FONT, INNER - 80, 26);
        ctx.font = '700 ' + s + 'px ' + UI_FONT;
        ctx.fillStyle = pal.onAccent;
        ctx.fillText(st.offerHeadline, ox, oy + 104);
      }
      if (st.offerBody) {
        ctx.font = '400 24px ' + UI_FONT;
        ctx.fillStyle = pal.onAccent;
        ctx.globalAlpha = 0.88;
        wrap(ctx, st.offerBody, INNER - 80, 2).forEach(function (ln, i) {
          ctx.fillText(ln, ox, oy + 148 + i * 33);
        });
        ctx.globalAlpha = 1;
      }
    }

    /* --- footer: links left, QR right. Pinned to the bottom so the card has
           a stable silhouette whether or not the offer block is showing. --- */
    const footY = H - 306;
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, footY - 40.5);
    ctx.lineTo(W - PAD, footY - 40.5);
    ctx.stroke();

    // A vCard runs to ~200 bytes, which puts the symbol around version 10 —
    // 57 modules. This size keeps each one near 4px, the floor for a reliable
    // read off a screen.
    const qrSize = 246;
    const qrX = W - PAD - qrSize;
    const qrY = footY;
    const payload = vcard(st);
    const ok = drawQR(ctx, payload, qrX, qrY, qrSize,
      st.theme === 'dark' ? '#1C1917' : '#1C1917', '#FFFFFF');
    if (ok) {
      tracked(ctx, 'SCAN TO SAVE ME', qrX + qrSize / 2, qrY + qrSize + 30,
        '500 17px ' + MONO_FONT, pal.faint, 1.6, 'center');
    }

    ctx.textAlign = 'left';
    const linkW = (ok ? qrX - 40 : W - PAD) - PAD;
    let ly = footY + 34;
    if (st.website) {
      ctx.font = '700 ' + fitted(ctx, st.website, '700', 34, UI_FONT, linkW, 20) + 'px ' + UI_FONT;
      ctx.fillStyle = pal.accent;
      ctx.fillText(st.website, PAD, ly);
      ly += 46;
    }
    ctx.font = '500 25px ' + UI_FONT;
    ctx.fillStyle = pal.muted;
    [st.handle, st.email, st.phone].filter(Boolean).forEach(function (line) {
      ctx.fillText(wrap(ctx, line, linkW, 1)[0] || '', PAD, ly);
      ly += 38;
    });

    ctx.restore();
  }

  /* ================================================================= fonts */

  /* Canvas silently substitutes a fallback for a font that has not finished
     loading, so the first paint can look nothing like the second. Draw once
     immediately for responsiveness, then again once the faces are in. */
  function whenFontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 62px "Inter"'),
      document.fonts.load('600 30px "Inter"'),
      document.fonts.load('500 25px "Inter"'),
      document.fonts.load('400 24px "Inter"'),
      document.fonts.load('500 46px "Fraunces"'),
      document.fonts.load('500 21px "JetBrains Mono"')
    ]).catch(function () { /* fall back to system faces */ });
  }

  /* ================================================================ export */

  function download(href, filename) {
    const a = el('a', { href: href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function toBlob(canvas) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(resolve, 'image/png');
      else resolve(null);
    });
  }

  function fileName(st, ext) {
    const slug = String(st.name || 'my-card').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return (slug || 'my-card') + '-card.' + ext;
  }

  function logShared(st, how) {
    S.activity.unshift({
      at: new Date(),
      kind: 'scan',
      text: 'Made a meet-me card' + (st.context ? ' for ' + st.context.split(' · ')[0] : '') +
        ' — ' + how + '.'
    });
    S.emit('card:share', st);
  }

  /* ================================================================== view */

  function mount(host, force) {
    if (!host) return;
    if (!force && host.dataset.built) return;
    host.dataset.built = '1';

    const ev = nearestEvent();
    const st = {
      photo: null,
      focus: 0.5,
      theme: 'light',
      greeting: 'Nice to meet you!',
      context: contextLine(ev),
      name: ME.name,
      title: ME.title,
      company: ME.company,
      tag: ME.tag,
      tagline: ME.tagline,
      showOffer: true,
      offerLabel: 'This week',
      offerHeadline: 'A 20-minute partnership teardown',
      offerBody: 'Send me your partner page and I will come back with the three integrations worth building first.',
      website: ME.website,
      handle: ME.handle,
      email: ME.email,
      phone: ME.phone
    };

    const canvas = el('canvas', { class: 'card-canvas', role: 'img', width: W, height: H });
    canvas.setAttribute('aria-label', 'Preview of your business card');
    const ctx = canvas.getContext('2d');

    let frame = 0;
    function redraw() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () { drawCard(ctx, st); });
    }

    /* ---------------------------------------------------------- photo in */
    function setPhoto(img) {
      st.photo = img;
      st.focus = 0.5;
      focusRow.hidden = false;
      focusRange.value = '50';
      redraw();
    }

    function loadFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('That file is not an image.'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () { setPhoto(img); };
        img.onerror = function () { toast('That image could not be decoded.'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    let stream = null;
    function stopCamera() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (shootBtn.parentNode) shootBtn.remove();
    }

    const shootBtn = el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      style: 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:2'
    }, 'Take the photo');

    async function useCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Camera is not available here — upload a photo instead.');
        return;
      }
      try {
        // Front camera: the photo on this card is usually a selfie with the
        // person you just met, not a shot of an object.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 } },
          audio: false
        });
      } catch (err) {
        toast('Camera permission denied — upload a photo instead.');
        return;
      }
      const video = el('video', { playsinline: true, muted: true, autoplay: true });
      video.srcObject = stream;
      liveStage.replaceChildren(video, shootBtn);
      liveStage.hidden = false;
      shootBtn.onclick = function () {
        const shot = el('canvas');
        shot.width = video.videoWidth || 1280;
        shot.height = video.videoHeight || 960;
        shot.getContext('2d').drawImage(video, 0, 0, shot.width, shot.height);
        stopCamera();
        liveStage.hidden = true;
        liveStage.replaceChildren();
        setPhoto(shot);
      };
    }

    const liveStage = el('div', { class: 'capture-stage', hidden: true });

    const fileInput = el('input', {
      type: 'file', accept: 'image/*', class: 'sr-only', id: 'mycard-file',
      onchange: (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); }
    });

    /* ------------------------------------------------------------ controls */
    function text(label, key, opts) {
      const o = opts || {};
      const input = el(o.multiline ? 'textarea' : 'input', {
        class: 'input', value: st[key], rows: o.rows || null,
        placeholder: o.placeholder || null, 'aria-label': label,
        oninput: function (e) { st[key] = e.target.value; redraw(); }
      });
      if (o.multiline) input.value = st[key];
      return el('label', { class: 'field' + (o.wide ? ' is-wide' : '') }, [
        el('span', { class: 'field-label' }, label),
        input
      ]);
    }

    const focusRange = el('input', {
      type: 'range', min: '0', max: '100', value: '50', class: 'range',
      'aria-label': 'Vertical framing of the photo',
      oninput: function (e) { st.focus = Number(e.target.value) / 100; redraw(); }
    });
    const focusRow = el('label', { class: 'field is-wide', hidden: true }, [
      el('span', { class: 'field-label' }, 'Framing — slide to move the crop'),
      focusRange
    ]);

    function themeBtn(value, label) {
      return el('button', {
        class: 'seg-btn' + (st.theme === value ? ' is-on' : ''),
        type: 'button',
        onclick: function (e) {
          st.theme = value;
          e.target.parentNode.querySelectorAll('.seg-btn')
            .forEach((b) => b.classList.toggle('is-on', b === e.target));
          redraw();
        }
      }, label);
    }

    const offerToggle = el('label', { class: 'check' }, [
      el('input', {
        type: 'checkbox', checked: true,
        onchange: function (e) {
          st.showOffer = e.target.checked;
          offerFields.hidden = !e.target.checked;
          redraw();
        }
      }),
      el('span', {}, 'Include an offer')
    ]);

    const offerFields = el('div', { class: 'field-grid' }, [
      text('Offer label', 'offerLabel'),
      text('Offer headline', 'offerHeadline'),
      text('Offer detail', 'offerBody', { wide: true, multiline: true, rows: 2 })
    ]);

    /* -------------------------------------------------------------- actions */
    const actions = el('div', { class: 'row', style: 'gap:var(--s-2);flex-wrap:wrap' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: async function () {
          const blob = await toBlob(canvas);
          if (!blob) { toast('This browser cannot export the image.'); return; }
          const url = URL.createObjectURL(blob);
          download(url, fileName(st, 'png'));
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          logShared(st, 'downloaded as a PNG');
          toast('Card saved as a PNG.');
        }
      }, 'Download PNG'),
      el('button', {
        class: 'btn btn-secondary', type: 'button',
        onclick: async function () {
          const blob = await toBlob(canvas);
          if (!blob) { toast('This browser cannot export the image.'); return; }
          const file = new File([blob], fileName(st, 'png'), { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: st.name + ' — card' });
              logShared(st, 'shared from the share sheet');
            } catch (err) { /* dismissing the sheet is not an error */ }
            return;
          }
          if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
            try {
              await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
              logShared(st, 'copied to the clipboard');
              toast('Card copied — paste it into any chat.');
              return;
            } catch (err) { /* fall through */ }
          }
          toast('Sharing is not available here — use Download PNG.');
        }
      }, 'Share or copy'),
      el('button', {
        class: 'btn btn-secondary', type: 'button',
        onclick: function () {
          const blob = new Blob([vcard(st)], { type: 'text/vcard;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          download(url, fileName(st, 'vcf'));
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast('vCard saved.');
        }
      }, 'Save .vcf'),
      el('button', {
        class: 'btn btn-ghost', type: 'button',
        title: 'Send this card through the app’s own reader',
        onclick: function () {
          if (!window.Views || !window.Views.scanShot) {
            toast('The scanner is not available.');
            return;
          }
          stopCamera();
          window.Views.scanShot(canvas);
        }
      }, 'Test in scanner')
    ]);

    /* ---------------------------------------------------------------- mount */
    const preview = el('div', { class: 'card-preview' }, [
      canvas,
      liveStage
    ]);

    const capture = el('div', { class: 'capture-actions' }, [
      el('button', { class: 'btn btn-primary', type: 'button', onclick: useCamera }, 'Use camera'),
      el('label', { class: 'btn btn-secondary', for: 'mycard-file' }, 'Upload photo'),
      el('button', {
        class: 'btn btn-secondary', type: 'button',
        onclick: function () {
          stopCamera();
          st.photo = null;
          focusRow.hidden = true;
          liveStage.hidden = true;
          redraw();
        }
      }, 'Clear photo')
    ]);

    const dropZone = el('div', {
      class: 'card-drop',
      ondragover: function (e) { e.preventDefault(); preview.classList.add('is-over'); },
      ondragleave: function () { preview.classList.remove('is-over'); },
      ondrop: function (e) {
        e.preventDefault();
        preview.classList.remove('is-over');
        loadFile(e.dataTransfer.files[0]);
      }
    }, [
      preview,
      capture,
      fileInput,
      el('p', { class: 'faint', style: 'font-size:var(--t-xs);margin-top:var(--s-3)' },
        'The photo never leaves this device — the card is drawn in the browser and exported straight from the canvas.')
    ]);

    const form = el('div', { class: 'mycard-form' }, [
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'What it says'),
        el('div', { class: 'seg' }, [themeBtn('light', 'Light'), themeBtn('dark', 'Dark')])
      ]),
      focusRow,
      el('div', { class: 'field-grid' }, [
        text('Greeting', 'greeting'),
        text('Corner tag', 'tag'),
        text('Where you met', 'context', { wide: true }),
        text('Name', 'name'),
        text('Title', 'title'),
        text('Company', 'company'),
        text('Website', 'website'),
        text('Tagline', 'tagline', { wide: true }),
        text('Handle', 'handle'),
        text('Email', 'email'),
        text('Phone', 'phone')
      ]),
      el('div', { style: 'margin:var(--s-5) 0 var(--s-3)' }, offerToggle),
      offerFields,
      el('div', { class: 'notice is-info', style: 'margin-top:var(--s-5)' }, [
        el('span', { style: 'color:var(--sage-vortex);flex-shrink:0' }, '✓'),
        el('div', {}, [
          'The QR carries a vCard, so anyone scanning it saves you as a contact. ',
          el('strong', {}, 'Test in scanner'),
          ' runs this card through Sedona’s own reader — it takes the QR fast path and comes back at 100%.'
        ])
      ]),
      el('div', { style: 'margin-top:var(--s-5)' }, actions)
    ]);

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'My card'),
        el('p', {}, 'Turn a photo from the event into the card you hand back. The agent fills in where you met from your calendar, and the QR code carries your contact details.')
      ]),
      el('div', { class: 'mycard-layout' }, [dropZone, form])
    );

    redraw();
    whenFontsReady().then(redraw);

    window.addEventListener('hashchange', function () {
      if ((location.hash || '').indexOf('mycard') === -1) stopCamera();
    });
  }

  window.Views = window.Views || {};
  window.Views.mycard = mount;
}());
