/* ==========================================================================
   Sedona AI — voice agent
   Records with MediaRecorder when the mic is granted, and falls back to a
   simulated recording when it is not. Both paths run the same extraction
   flow: transcript → entities → action items, with the results labelled
   DEMO DATA because no model actually runs here.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, $, fmtDate, fmtDuration, toast } = U;
  const S = window.SEDONA;

  let media = null, recorder = null, chunks = [];
  let audioCtx = null, analyser = null, rafId = null;
  let timerId = null, seconds = 0, isRecording = false;
  let simulated = false, blobUrl = null;

  /* ------------------------------------------------------------ waveform */
  function drawLive(canvas) {
    const ctx = canvas.getContext('2d');
    const data = new Uint8Array(analyser.frequencyBinCount);
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#B8472E';

    (function frame() {
      rafId = requestAnimationFrame(frame);
      analyser.getByteTimeDomainData(data);
      const w = canvas.width = canvas.offsetWidth * 2;
      const h = canvas.height = canvas.offsetHeight * 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = accent;
      const bars = 64;
      const step = Math.floor(data.length / bars);
      for (let i = 0; i < bars; i++) {
        const v = Math.abs(data[i * step] - 128) / 128;
        const bh = Math.max(4, v * h * 0.9);
        ctx.fillRect(i * (w / bars) + 2, (h - bh) / 2, (w / bars) - 4, bh);
      }
    }());
  }

  /** Deterministic pseudo-waveform, so the simulated path still looks alive. */
  function drawSimulated(canvas, t) {
    const ctx = canvas.getContext('2d');
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#B8472E';
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = accent;
    const bars = 64;
    for (let i = 0; i < bars; i++) {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + t * 2) * Math.cos(i * 0.23 + t));
      const bh = Math.max(4, v * h * 0.8);
      ctx.fillRect(i * (w / bars) + 2, (h - bh) / 2, (w / bars) - 4, bh);
    }
  }

  /* ------------------------------------------------------------ recording */
  async function start(ui) {
    seconds = 0;
    simulated = false;
    chunks = [];

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(media);
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.start();
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        audioCtx.createMediaStreamSource(media).connect(analyser);
        drawLive(ui.canvas);
      } catch (err) {
        simulated = true;
      }
    } else {
      simulated = true;
    }

    if (simulated) {
      toast('Microphone unavailable — running a simulated recording.');
      let t = 0;
      rafId = setInterval(function () { t += 0.08; drawSimulated(ui.canvas, t); }, 60);
    }

    isRecording = true;
    ui.btn.classList.add('is-recording');
    ui.btn.setAttribute('aria-label', 'Stop recording');
    ui.btn.replaceChildren(icon('stop'));
    ui.hint.textContent = simulated
      ? 'Simulated recording — tap to stop'
      : 'Recording — tap to stop';

    timerId = setInterval(function () {
      seconds++;
      ui.timer.textContent = fmtDuration(seconds);
    }, 1000);
  }

  function stop(ui) {
    isRecording = false;
    clearInterval(timerId);
    if (simulated) clearInterval(rafId);
    else cancelAnimationFrame(rafId);

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = function () {
        if (chunks.length) blobUrl = URL.createObjectURL(new Blob(chunks, { type: chunks[0].type }));
        finish(ui);
      };
      recorder.stop();
    } else {
      finish(ui);
    }
    if (media) { media.getTracks().forEach((t) => t.stop()); media = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }

    ui.btn.classList.remove('is-recording');
    ui.btn.setAttribute('aria-label', 'Start recording');
    ui.btn.replaceChildren(icon('mic'));
    ui.hint.textContent = 'Processing…';
  }

  function finish(ui) {
    // A live recording still resolves to an authored memo — no model runs here.
    const memo = S.memos[0];
    ui.hint.textContent = 'Tap to record';
    U.thinkSequence(ui.think,
      ['Transcribing audio', 'Extracting people and companies', 'Drafting action items'],
      function () { renderMemo(ui.out, memo, true); }, 780);
  }

  function icon(kind) {
    const wrap = document.createElement('span');
    wrap.innerHTML = kind === 'stop'
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="34" height="34"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="34" height="34"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
    return wrap.firstChild;
  }

  /* --------------------------------------------------------- memo render */
  const ENTITY_NAMES = () => S.contacts.map((p) => p.name)
    .concat(S.companies.map((c) => c.name));

  /** Underline any known person or company mentioned, and link it through. */
  function markEntities(text) {
    const node = el('span', { class: 'said' });
    const names = ENTITY_NAMES()
      .filter((n) => text.indexOf(n) > -1)
      .sort((a, b) => b.length - a.length);
    if (!names.length) { node.textContent = text; return node; }

    let rest = text;
    const parts = [];
    while (rest.length) {
      let best = null, bestAt = Infinity;
      names.forEach(function (n) {
        const at = rest.indexOf(n);
        if (at > -1 && at < bestAt) { bestAt = at; best = n; }
      });
      if (!best) { parts.push(rest); break; }
      if (bestAt > 0) parts.push(rest.slice(0, bestAt));
      const name = best;
      parts.push(el('span', {
        class: 'ent', role: 'button', tabindex: '0',
        onclick: () => openEntity(name),
        onkeydown: (e) => { if (e.key === 'Enter') openEntity(name); }
      }, name));
      rest = rest.slice(bestAt + best.length);
    }
    parts.forEach((p) => node.appendChild(typeof p === 'string' ? document.createTextNode(p) : p));
    return node;
  }

  function openEntity(name) {
    const p = S.contacts.find((c) => c.name === name);
    if (p) return window.Views.openContact(p.id);
    const co = S.companies.find((c) => c.name === name);
    if (co) return window.Views.openCompany(co.id);
  }

  function renderMemo(host, memo, isFresh) {
    const co = memo.companyId ? S.company(memo.companyId) : null;

    const actions = el('div', {}, memo.actions.map(function (a, i) {
      const item = el('button', {
        class: 'action-item' + (a.done ? ' is-done' : ''), type: 'button'
      }, [
        el('span', {
          class: 'box',
          html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>'
        }),
        el('span', { class: 'grow' }, [
          el('div', { class: 'txt', style: 'font-size:var(--t-sm);font-weight:500' }, a.text),
          el('div', { class: 'mono faint', style: 'margin-top:3px' },
            'Due ' + U.relDays(S.day(a.due)))
        ])
      ]);
      item.addEventListener('click', function () {
        if (a.done) return;
        a.done = true;
        item.classList.add('is-done');
        // Checking an item writes a real calendar event, so the calendar moves.
        S.addEvent({
          title: a.text,
          start: S.day(a.due, 10),
          companyId: memo.companyId,
          attendeeIds: memo.contactIds || []
        });
        toast('Added to your calendar — ' + U.relDays(S.day(a.due)) + '.');
      });
      return item;
    }));

    host.replaceChildren(
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-2)' }, [
        el('h3', { style: 'margin:0' }, isFresh ? 'Just recorded' : memo.title),
        el('span', { class: 'demo-tag' }, 'Demo data')
      ]),
      el('p', { class: 'mono faint', style: 'margin-bottom:var(--s-4)' },
        fmtDuration(memo.seconds) + ' · ' + fmtDate(memo.recordedAt, 'long') +
        (co ? ' · ' + co.name : '')),

      blobUrl && isFresh ? el('audio', {
        controls: true, src: blobUrl, style: 'width:100%;margin-bottom:var(--s-4)'
      }) : null,

      el('div', { class: 'card card-pad', style: 'margin-bottom:var(--s-5)' }, [
        el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Transcript'),
        el('div', {}, memo.transcript.map((t) =>
          el('div', { class: 'turn' }, [
            el('span', { class: 'who' }, t[0]),
            markEntities(t[1])
          ])))
      ]),

      el('div', { class: 'card card-pad', style: 'margin-bottom:var(--s-5)' }, [
        el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Extracted'),
        el('div', { class: 'kv' }, [
          entGroup('People', memo.entities.people),
          entGroup('Companies', memo.entities.companies),
          entGroup('Dates', memo.entities.dates)
        ])
      ]),

      el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Action items'),
      el('p', { class: 'muted', style: 'font-size:var(--t-xs);margin-bottom:var(--s-3)' },
        'Check one and the agent puts it on your calendar.'),
      actions
    );
  }

  function entGroup(label, items) {
    return el('div', { class: 'kv-item' }, [
      el('div', { class: 'k' }, label),
      items && items.length
        ? el('div', { class: 'row wrap', style: 'gap:4px;margin-top:6px' },
            items.map((i) => el('button', {
              class: 'badge badge-rust', type: 'button',
              style: 'cursor:pointer', onclick: () => openEntity(i)
            }, i)))
        : el('div', { class: 'faint', style: 'font-size:var(--t-xs);margin-top:6px' }, 'None')
    ]);
  }

  /* --------------------------------------------------------------- mount */
  function mount(host, force) {
    if (!host) return;
    if (!force && host.dataset.built) return;
    host.dataset.built = '1';

    const canvas = el('canvas', { class: 'wave', 'aria-hidden': 'true' });
    const timer = el('div', { class: 'rec-timer' }, '0:00');
    const hint = el('p', { class: 'muted', style: 'font-size:var(--t-sm)' }, 'Tap to record');
    const btn = el('button', { class: 'rec-btn', type: 'button', 'aria-label': 'Start recording' }, icon('mic'));
    const think = el('div', { style: 'margin-top:var(--s-4)' });
    const out = el('div', {});
    const ui = { canvas, timer, hint, btn, think, out };

    btn.addEventListener('click', function () {
      if (isRecording) stop(ui); else start(ui);
    });

    const library = el('div', {}, [
      el('h4', { style: 'margin:var(--s-6) 0 var(--s-3)' }, 'Memo library'),
      el('div', { class: 'stack' }, S.memos.map((m) =>
        el('button', {
          class: 'record', type: 'button',
          onclick: function () { blobUrl = null; renderMemo(out, m, false); window.scrollTo({ top: 0 }); }
        }, [
          el('div', { class: 'record-title', style: 'font-size:var(--t-sm)' }, m.title),
          el('div', { class: 'record-meta' }, [
            el('span', { class: 'mono faint' }, fmtDuration(m.seconds)),
            el('span', { class: 'mono faint' }, fmtDate(m.recordedAt)),
            el('span', { class: 'badge' }, m.actions.length + ' actions')
          ])
        ])))
    ]);

    out.replaceChildren(el('div', { class: 'empty' }, [
      el('h4', {}, 'No memo selected'),
      el('p', {}, 'Record a conversation, or open one from the library below.')
    ]));

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Voice agent'),
        el('p', {}, 'Talk after a meeting. The agent transcribes it, pulls out who and what, and turns commitments into calendar entries.')
      ]),
      el('div', { class: 'voice-layout' }, [
        el('div', {}, [
          el('div', { class: 'card recorder' }, [btn, timer, hint, canvas, think]),
          library
        ]),
        out
      ])
    );
  }

  /** Open a specific memo — used by search and by the CRM drawer. */
  function openMemo(id) {
    const host = document.getElementById('view-voice');
    mount(host, true);
    const m = S.memos.find((x) => x.id === id);
    if (m) {
      blobUrl = null;
      renderMemo(host.querySelector('.voice-layout').lastChild, m, false);
    }
  }

  window.addEventListener('hashchange', function () {
    if ((location.hash || '').indexOf('voice') === -1 && isRecording) {
      clearInterval(timerId);
      if (media) { media.getTracks().forEach((t) => t.stop()); media = null; }
      isRecording = false;
    }
  });

  window.Views = window.Views || {};
  window.Views.voice = mount;
  window.Views.voiceOpen = openMemo;
}());
