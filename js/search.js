/* ==========================================================================
   Sedona AI — global search
   One flat index across contacts, companies, meetings, and memos.
   Desktop: ⌘K centered palette. Mobile: full-screen sheet from the tab bar.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, $, highlight, fmtDate, relDays } = U;
  const S = window.SEDONA;

  let scrim, panel, input, results, cursor = -1, hits = [];

  /* ------------------------------------------------------------- indexing */
  function buildIndex() {
    const idx = [];
    S.contacts.forEach((p) => idx.push({
      type: 'Person', id: p.id, title: p.name,
      sub: p.title + ' · ' + p.company,
      hay: [p.name, p.title, p.company, p.email, p.metAt].concat(p.tags).join(' ').toLowerCase(),
      go: () => window.Views.openContact(p.id)
    }));
    S.companies.forEach((c) => idx.push({
      type: 'Company', id: c.id, title: c.name,
      sub: c.category + ' · ' + c.stage + ' · ' + c.owner,
      hay: [c.name, c.category, c.stage, c.owner, c.hq, c.note].join(' ').toLowerCase(),
      go: () => window.Views.openCompany(c.id)
    }));
    S.events.forEach((e) => idx.push({
      type: 'Meeting', id: e.id, title: e.title,
      sub: fmtDate(e.start, 'day') + ' · ' + relDays(e.start),
      hay: [e.title, e.company || '', S.eventTypes[e.type].label].join(' ').toLowerCase(),
      go: () => { location.hash = '#/calendar'; setTimeout(() => window.Views.calendarOpen(e.id), 60); }
    }));
    S.memos.forEach((m) => idx.push({
      type: 'Voice memo', id: m.id, title: m.title,
      sub: U.fmtDuration(m.seconds) + ' · ' + fmtDate(m.recordedAt),
      hay: [m.title].concat(m.transcript.map((t) => t[1])).join(' ').toLowerCase(),
      go: () => { location.hash = '#/voice'; setTimeout(() => window.Views.voiceOpen(m.id), 60); }
    }));
    return idx;
  }

  /** Substring first, then a subsequence fallback so "novra" still finds Novara. */
  function subsequence(hay, q) {
    let i = 0;
    for (let j = 0; j < hay.length && i < q.length; j++) {
      if (hay[j] === q[i]) i++;
    }
    return i === q.length;
  }

  function search(q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const index = buildIndex();
    const scored = [];
    index.forEach(function (item) {
      const pos = item.hay.indexOf(query);
      let score = null;
      if (pos === 0) score = 0;
      else if (pos > 0) score = item.title.toLowerCase().indexOf(query) === 0 ? 1 : 2 + pos / 400;
      else if (query.length >= 3 && subsequence(item.hay, query)) score = 6;
      if (score != null) scored.push({ item: item, score: score });
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, 24).map((s) => s.item);
  }

  /* -------------------------------------------------------------- palette */
  const SUGGESTED = ['dormant', 'fintech', 'SaaStr', 'security review', 'pilot'];

  function ensure() {
    if (panel) return;
    scrim = el('div', { class: 'palette-scrim', onclick: close });

    input = el('input', {
      type: 'search', placeholder: 'Search people, companies, meetings…',
      'aria-label': 'Search everything', autocomplete: 'off'
    });
    input.addEventListener('input', () => run(input.value));
    input.addEventListener('keydown', onKey);

    results = el('div', { class: 'palette-results', role: 'listbox' });

    panel = el('div', {
      class: 'palette', role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Search', 'aria-hidden': 'true'
    }, [
      el('div', { class: 'palette-head' }, [
        el('span', {
          style: 'color:var(--fg-faint);display:flex',
          html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>'
        }),
        input,
        el('button', { class: 'btn-icon', 'aria-label': 'Close search', onclick: close,
          html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' })
      ]),
      results
    ]);
    document.body.append(scrim, panel);
  }

  function run(q) {
    hits = search(q);
    cursor = hits.length ? 0 : -1;
    if (!q.trim()) return renderEmpty();
    if (!hits.length) {
      results.replaceChildren(el('div', { class: 'empty' }, [
        el('h4', {}, 'Nothing matched'),
        el('p', {}, `No people, companies, meetings, or memos match “${q}”.`)
      ]));
      return;
    }
    const groups = {};
    hits.forEach((h) => { (groups[h.type] = groups[h.type] || []).push(h); });

    const nodes = [];
    ['Person', 'Company', 'Meeting', 'Voice memo'].forEach(function (type) {
      if (!groups[type]) return;
      nodes.push(el('div', { class: 'res-group' }, type === 'Person' ? 'People' : type + 's'));
      groups[type].forEach(function (h) {
        nodes.push(el('button', {
          class: 'res', type: 'button', role: 'option',
          'data-i': hits.indexOf(h),
          onclick: () => choose(hits.indexOf(h))
        }, [
          type === 'Person' ? U.avatar(h.title, 'sm')
            : el('span', { class: 'badge' }, type.slice(0, 3)),
          el('div', { class: 'grow' }, [
            el('div', { class: 'r-title', html: highlight(h.title, q) }),
            el('div', { class: 'r-sub', html: highlight(h.sub, q) })
          ]),
          el('span', { class: 'r-go' }, 'Open')
        ]));
      });
    });
    results.replaceChildren(...nodes);
    paintCursor();
  }

  function renderEmpty() {
    const recent = S.contacts.slice(0, 4);
    results.replaceChildren(
      el('div', { class: 'res-group' }, 'Try'),
      el('div', { class: 'row wrap', style: 'gap:var(--s-2);padding:0 var(--s-4) var(--s-3)' },
        SUGGESTED.map((s) => el('button', {
          class: 'chip', type: 'button',
          onclick: function () { input.value = s; run(s); input.focus(); }
        }, s))),
      el('div', { class: 'res-group' }, 'Recently added'),
      ...recent.map((p) => el('button', {
        class: 'res', type: 'button',
        onclick: function () { close(); window.Views.openContact(p.id); }
      }, [
        U.avatar(p.name, 'sm'),
        el('div', { class: 'grow' }, [
          el('div', { class: 'r-title' }, p.name),
          el('div', { class: 'r-sub' }, p.title + ' · ' + p.company)
        ])
      ]))
    );
  }

  function paintCursor() {
    U.$$('.res', results).forEach(function (n) {
      const on = Number(n.dataset.i) === cursor;
      n.classList.toggle('is-cursor', on);
      if (on) n.scrollIntoView({ block: 'nearest' });
    });
  }

  function move(step) {
    if (!hits.length) return;
    cursor = (cursor + step + hits.length) % hits.length;
    paintCursor();
  }

  function choose(i) {
    const h = hits[i];
    if (!h) return;
    close();
    setTimeout(h.go, 40);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function open(seed) {
    ensure();
    panel.setAttribute('aria-hidden', 'false');
    scrim.classList.add('is-open');
    panel.classList.add('is-open');
    input.value = seed || '';
    run(input.value);
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    if (!panel) return;
    scrim.classList.remove('is-open');
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  /* ----------------------------------------------------------- entry points */
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open();
    }
  });

  const headerField = $('#search-field');
  if (headerField) {
    // The header field is a doorway to the palette, not a second search UI.
    headerField.addEventListener('focus', function () { open(headerField.value); headerField.blur(); });
    headerField.addEventListener('input', function () { open(headerField.value); headerField.value = ''; headerField.blur(); });
  }
  const mobileBtn = $('#mobile-search-btn');
  if (mobileBtn) mobileBtn.addEventListener('click', () => open());
  const tabBtn = $('#tab-search');
  if (tabBtn) tabBtn.addEventListener('click', () => open());

  window.Views = window.Views || {};
  window.Views.openSearch = open;
}());
