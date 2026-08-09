/* ==========================================================================
   Sedona AI — CRM / company database
   Companies: pipeline bar + sortable table (desktop) / card list (mobile).
   Contacts: filterable card grid.
   Both open the same profile drawer, which other modules also call into.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, avatar, meter, stageBadge, fmtDate, relDays, Drawer } = U;
  const S = window.SEDONA;

  const state = {
    category: null,
    stage: null,
    sort: { key: 'strength', dir: -1 },
    contactFilter: null,
    contactSource: null
  };

  /* ---------------------------------------------------------------- utils */
  function filteredCompanies() {
    return S.companies
      .filter((c) => !state.category || c.category === state.category)
      .filter((c) => !state.stage || c.stage === state.stage)
      .slice()
      .sort(function (a, b) {
        const k = state.sort.key;
        let va = a[k], vb = b[k];
        if (k === 'lastTouch') { va = +a.lastTouch; vb = +b.lastTouch; }
        if (typeof va === 'string') return va.localeCompare(vb) * state.sort.dir;
        return (va - vb) * state.sort.dir;
      });
  }

  function chip(label, active, onclick) {
    return el('button', {
      class: 'chip', type: 'button',
      'aria-pressed': active ? 'true' : 'false',
      onclick: onclick
    }, label);
  }

  /* ------------------------------------------------------- profile drawer */
  function openCompany(id) {
    const co = S.company(id);
    if (!co) return;
    const people = S.contactsOf(id);
    const evts = S.eventsOf(id).slice().sort((a, b) => b.start - a.start);
    const memos = S.memosOf(id);

    // Merge every interaction into one reverse-chronological stream.
    const stream = []
      .concat(evts.map((e) => ({
        at: e.start, kind: S.eventTypes[e.type].label, text: e.title
      })))
      .concat(memos.map((m) => ({
        at: m.recordedAt, kind: 'Voice memo', text: m.title
      })))
      .concat(people.filter((p) => p.source === 'scan').map((p) => ({
        at: p.metOn, kind: 'Card scan', text: `Scanned ${p.name} at ${p.metAt}`
      })))
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);

    const suggestions = [
      co.stage === 'Signed'
        ? 'Open the expansion conversation before renewal paperwork starts.'
        : 'Confirm a decision date with the champion.',
      people.some((p) => p.tags.indexOf('economic-buyer') > -1)
        ? 'Loop the economic buyer into the next working session.'
        : 'Identify who signs — no economic buyer is mapped yet.',
      (Date.now() - co.lastTouch) / 86400000 > 21
        ? 'Warmth is decaying — no contact in over three weeks.'
        : 'Momentum is good. Ask for a reference or a joint story.'
    ];

    Drawer.open(co.name, `${co.category} · ${co.hq}`, [
      el('div', { class: 'row wrap', style: 'gap:var(--s-2);margin-bottom:var(--s-4)' }, [
        stageBadge(co.stage),
        el('span', { class: 'badge' }, co.size + ' people'),
        el('span', { class: 'badge' }, 'ARR ' + co.arr)
      ]),

      el('p', { style: 'font-size:var(--t-sm);color:var(--fg-muted);margin-bottom:var(--s-5)' }, co.note),

      el('div', { class: 'kv', style: 'margin-bottom:var(--s-5)' }, [
        kv('Owner', co.owner),
        kv('Partner since', co.since),
        kv('Last touch', relDays(co.lastTouch)),
        kvNode('Relationship', meter(co.strength))
      ]),

      section('Agent suggestions', el('ul', { class: 'stack' },
        suggestions.map((s) => el('li', {
          style: 'font-size:var(--t-sm);display:flex;gap:var(--s-2);align-items:flex-start'
        }, [el('span', { style: 'color:var(--accent)' }, '→'), el('span', {}, s)])))),

      section(`People (${people.length})`, el('div', { class: 'stack' },
        people.map((p) => el('button', {
          class: 'row', type: 'button',
          style: 'width:100%;text-align:left;padding:var(--s-2) 0',
          onclick: () => openContact(p.id)
        }, [
          avatar(p.name),
          el('div', { class: 'grow' }, [
            el('div', { style: 'font-size:var(--t-sm);font-weight:550' }, p.name),
            el('div', { class: 'muted', style: 'font-size:var(--t-xs)' }, p.title)
          ]),
          meter(p.warmth)
        ])))),

      section('Interaction timeline', el('div', { class: 'timeline' },
        stream.length ? stream.map((s) => el('div', { class: 'timeline-item' }, [
          el('div', { class: 'mono faint' }, `${s.kind} · ${fmtDate(s.at)}`),
          el('div', { style: 'font-size:var(--t-sm);margin-top:2px' }, s.text)
        ])) : [el('p', { class: 'muted', style: 'font-size:var(--t-sm)' }, 'No interactions logged yet.')]))
    ]);
  }

  function openContact(id) {
    const p = S.contact(id);
    if (!p) return;
    const co = S.company(p.companyId);
    const memos = S.memos.filter((m) => (m.contactIds || []).indexOf(id) > -1);
    const evts = S.events.filter((e) => (e.attendeeIds || []).indexOf(id) > -1)
      .sort((a, b) => b.start - a.start);

    Drawer.open(p.name, p.title + (co ? ' · ' + co.name : ''), [
      el('div', { class: 'row', style: 'margin-bottom:var(--s-5)' }, [
        avatar(p.name, 'lg'),
        el('div', { class: 'grow' }, [
          el('div', { style: 'font-size:var(--t-sm)' }, p.email),
          el('div', { class: 'muted', style: 'font-size:var(--t-sm)' }, p.phone)
        ])
      ]),

      el('div', { class: 'kv', style: 'margin-bottom:var(--s-5)' }, [
        kv('Met at', p.metAt),
        kv('First met', fmtDate(p.metOn, 'long')),
        kv('Last touch', relDays(p.lastTouch)),
        kvNode('Warmth', meter(p.warmth))
      ]),

      p.tags.length ? el('div', { class: 'row wrap', style: 'gap:var(--s-2);margin-bottom:var(--s-5)' },
        p.tags.map((t) => el('span', { class: 'badge' }, t))) : null,

      p.nextAction ? el('div', { class: 'notice is-info' }, [
        el('span', { style: 'color:var(--sage-vortex)' }, '→'),
        el('div', {}, [
          el('strong', {}, 'Next action · '),
          p.nextAction
        ])
      ]) : null,

      evts.length ? section('Meetings', el('div', { class: 'stack' },
        evts.slice(0, 5).map((e) => el('div', { style: 'font-size:var(--t-sm)' }, [
          el('span', { class: 'mono faint' }, fmtDate(e.start) + ' · '),
          e.title
        ])))) : null,

      memos.length ? section('Voice memos', el('div', { class: 'stack' },
        memos.map((m) => el('button', {
          class: 'record', type: 'button',
          onclick: () => { Drawer.close(); location.hash = '#/voice'; setTimeout(() => window.Views.voiceOpen(m.id), 60); }
        }, [
          el('div', { class: 'record-title', style: 'font-size:var(--t-sm)' }, m.title),
          el('div', { class: 'mono faint', style: 'margin-top:4px' },
            U.fmtDuration(m.seconds) + ' · ' + fmtDate(m.recordedAt))
        ])))) : null
    ]);
  }

  function kv(k, v) {
    return el('div', { class: 'kv-item' }, [
      el('div', { class: 'k' }, k), el('div', { class: 'v' }, String(v))
    ]);
  }
  function kvNode(k, node) {
    return el('div', { class: 'kv-item' }, [
      el('div', { class: 'k' }, k), el('div', { class: 'v', style: 'margin-top:6px' }, node)
    ]);
  }
  function section(title, body) {
    return el('div', { style: 'margin-bottom:var(--s-6)' }, [
      el('h4', { style: 'margin-bottom:var(--s-3)' }, title), body
    ]);
  }

  /* ------------------------------------------------------------ companies */
  function companyTable(rows) {
    const cols = [
      ['name', 'Company'], ['category', 'Category'], ['stage', 'Stage'],
      ['owner', 'Owner'], ['strength', 'Strength'], ['lastTouch', 'Last touch']
    ];
    const thead = el('tr', {}, cols.map(([k, label]) =>
      el('th', {}, el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort.key === k) state.sort.dir *= -1;
          else state.sort = { key: k, dir: k === 'name' ? 1 : -1 };
          mountCrm(document.getElementById('view-crm'), true);
        }
      }, [label, state.sort.key === k ? (state.sort.dir === 1 ? ' ↑' : ' ↓') : '']))));

    const tbody = el('tbody', {}, rows.map((co) =>
      el('tr', { onclick: () => openCompany(co.id), tabindex: '0',
        onkeydown: (e) => { if (e.key === 'Enter') openCompany(co.id); } }, [
        el('td', {}, el('div', { style: 'font-weight:600' }, co.name)),
        el('td', { class: 'muted' }, co.category),
        el('td', {}, stageBadge(co.stage)),
        el('td', { class: 'muted' }, co.owner),
        el('td', {}, meter(co.strength)),
        el('td', { class: 'muted mono' }, relDays(co.lastTouch))
      ])));

    return el('div', { class: 'card table-wrap scroll-x' },
      el('table', { class: 'table' }, [el('thead', {}, thead), tbody]));
  }

  function mountCrm(host, force) {
    if (!host || (!force && host.dataset.built)) return;
    host.dataset.built = '1';
    const rows = filteredCompanies();

    const counts = S.stages.map((st) => ({
      stage: st, n: S.companies.filter((c) => c.stage === st).length
    }));

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Companies'),
        el('p', {}, 'Every partnership, with the agent’s read on where it actually stands.')
      ]),

      el('div', { class: 'pipeline' }, counts.map((c) =>
        el('button', {
          class: 'pipe-stage', type: 'button',
          'aria-pressed': state.stage === c.stage ? 'true' : 'false',
          onclick: function () {
            state.stage = state.stage === c.stage ? null : c.stage;
            mountCrm(host, true);
          }
        }, [
          el('span', { class: 'n' }, String(c.n)),
          el('span', { class: 'l' }, c.stage),
          el('span', { class: 'bar' })
        ]))),

      el('div', { class: 'chip-rail', style: 'margin-bottom:var(--s-4)' }, [
        chip('All categories', !state.category, function () {
          state.category = null; mountCrm(host, true);
        })
      ].concat(S.categories.map((cat) =>
        chip(cat, state.category === cat, function () {
          state.category = state.category === cat ? null : cat;
          mountCrm(host, true);
        })))),

      // The count labels the table, so it rides with it on desktop only.
      el('p', { class: 'mono faint only-desk', style: 'margin-bottom:var(--s-3)' },
        rows.length + (rows.length === 1 ? ' company' : ' companies')),

      // Table from 1024px up. Mobile stops at the stat tiles and category
      // chips; companies are reached through Search there.
      el('div', { class: 'only-desk' }, companyTable(rows))
    );
  }

  /* ------------------------------------------------------------- contacts */
  function mountContacts(host, force) {
    if (!host || (!force && host.dataset.built)) return;
    host.dataset.built = '1';

    const allTags = Array.from(new Set(S.contacts.reduce((a, p) => a.concat(p.tags), []))).sort();
    const rows = S.contacts
      .filter((p) => !state.contactFilter || p.tags.indexOf(state.contactFilter) > -1)
      .filter((p) => !state.contactSource || p.source === state.contactSource)
      .slice()
      .sort((a, b) => b.warmth - a.warmth);

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Contacts'),
        el('p', {}, 'Everyone you have met, sorted by how warm the relationship is right now.')
      ]),

      el('div', { class: 'chip-rail', style: 'margin-bottom:var(--s-3)' }, [
        chip('Everyone', !state.contactSource, function () {
          state.contactSource = null; mountContacts(host, true);
        })
      ].concat(['scan', 'voice', 'manual', 'import'].map((src) =>
        chip('From ' + src, state.contactSource === src, function () {
          state.contactSource = state.contactSource === src ? null : src;
          mountContacts(host, true);
        })))),

      el('div', { class: 'chip-rail', style: 'margin-bottom:var(--s-4)' }, [
        chip('All tags', !state.contactFilter, function () {
          state.contactFilter = null; mountContacts(host, true);
        })
      ].concat(allTags.map((t) =>
        chip(t, state.contactFilter === t, function () {
          state.contactFilter = state.contactFilter === t ? null : t;
          mountContacts(host, true);
        })))),

      el('p', { class: 'mono faint', style: 'margin-bottom:var(--s-3)' }, rows.length + ' people'),

      rows.length ? el('div', { class: 'record-list' }, rows.map((p) =>
        el('button', { class: 'record', type: 'button', onclick: () => openContact(p.id) }, [
          el('div', { class: 'row' }, [
            avatar(p.name),
            el('div', { class: 'grow' }, [
              el('div', { class: 'record-title', style: 'font-size:var(--t-sm)' }, p.name),
              el('div', { class: 'record-sub', style: 'font-size:var(--t-xs)' }, p.title)
            ])
          ]),
          el('div', { class: 'record-meta' }, [
            el('span', { class: 'badge' }, p.company),
            meter(p.warmth),
            el('span', { class: 'mono faint' }, relDays(p.lastTouch))
          ])
        ])))
        : el('div', { class: 'empty' }, [
            el('h4', {}, 'No one matches those filters'),
            el('p', {}, 'Clear a filter to see more people.')
          ])
    );
  }

  window.Views = window.Views || {};
  window.Views.crm = mountCrm;
  window.Views.contacts = mountContacts;
  window.Views.openCompany = openCompany;
  window.Views.openContact = openContact;
}());
