/* ==========================================================================
   Sedona AI — calendar
   Agenda is the default on mobile, month grid on desktop. Week view scrolls
   horizontally rather than squashing seven columns onto a phone.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, avatar, fmtDate, fmtTime, relDays, isoDay, addDays, startOfDay, sameDay, Drawer } = U;
  const S = window.SEDONA;

  const state = {
    mode: null,               // set on first mount from viewport width
    anchor: new Date(S.today) // the month/week currently in view
  };

  const typeColor = (t) => S.eventTypes[t].color;

  function eventsOnDay(d) {
    return S.events.filter((e) => sameDay(e.start, d)).sort((a, b) => a.start - b.start);
  }

  /* -------------------------------------------------------- event drawer */
  function openEvent(id) {
    const ev = S.events.find((e) => e.id === id);
    if (!ev) return;
    const people = (ev.attendeeIds || []).map((i) => S.contact(i)).filter(Boolean);
    const co = ev.companyId ? S.company(ev.companyId) : null;
    const memos = co ? S.memosOf(co.id) : [];
    const lastTouch = co ? relDays(co.lastTouch) : 'a while ago';

    Drawer.open(ev.title, `${fmtDate(ev.start, 'day')} · ${fmtTime(ev.start)}–${fmtTime(ev.end)}`, [
      el('div', { class: 'row wrap', style: 'gap:var(--s-2);margin-bottom:var(--s-4)' }, [
        el('span', {
          class: 'badge',
          style: `background:color-mix(in srgb, ${typeColor(ev.type)} 16%, transparent);color:${typeColor(ev.type)}`
        }, S.eventTypes[ev.type].label),
        el('span', { class: 'badge' }, ev.location),
        el('span', { class: 'badge' }, ev.minutes + ' min')
      ]),

      el('div', { class: 'notice is-info', style: 'margin-bottom:var(--s-5)' }, [
        el('span', { style: 'color:var(--sage-vortex);flex-shrink:0' }, '✦'),
        el('div', {}, [
          el('strong', {}, 'Agent brief — '),
          ev.brief.replace('{rel}', lastTouch)
        ])
      ]),

      people.length ? el('div', { style: 'margin-bottom:var(--s-6)' }, [
        el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Attendees'),
        el('div', { class: 'stack' }, people.map((p) =>
          el('button', {
            class: 'row', type: 'button',
            style: 'width:100%;text-align:left;padding:var(--s-2) 0',
            onclick: () => window.Views.openContact(p.id)
          }, [
            avatar(p.name),
            el('div', { class: 'grow' }, [
              el('div', { style: 'font-size:var(--t-sm);font-weight:550' }, p.name),
              el('div', { class: 'muted', style: 'font-size:var(--t-xs)' }, p.title)
            ]),
            U.meter(p.warmth)
          ])))
      ]) : null,

      co ? el('div', { style: 'margin-bottom:var(--s-6)' }, [
        el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Company'),
        el('button', { class: 'record', type: 'button', onclick: () => window.Views.openCompany(co.id) }, [
          el('div', { class: 'row-between' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'record-title' }, co.name),
              el('div', { class: 'record-sub' }, co.category + ' · ' + co.owner)
            ]),
            U.stageBadge(co.stage)
          ])
        ])
      ]) : null,

      memos.length ? el('div', {}, [
        el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Related voice memos'),
        el('div', { class: 'stack' }, memos.map((m) =>
          el('button', {
            class: 'record', type: 'button',
            onclick: function () {
              Drawer.close();
              location.hash = '#/voice';
              setTimeout(() => window.Views.voiceOpen(m.id), 60);
            }
          }, [
            el('div', { class: 'record-title', style: 'font-size:var(--t-sm)' }, m.title),
            el('div', { class: 'mono faint', style: 'margin-top:4px' },
              U.fmtDuration(m.seconds) + ' · ' + fmtDate(m.recordedAt))
          ])))
      ]) : null
    ]);
  }

  /* ----------------------------------------------------------- this week */
  function weekRail() {
    const now = new Date();
    const soon = S.events
      .filter((e) => e.start >= startOfDay(now) && e.start <= addDays(now, 7))
      .sort((a, b) => a.start - b.start)
      .slice(0, 6);

    if (!soon.length) return null;

    return el('div', {}, [
      el('h4', { style: 'margin-bottom:var(--s-3)' }, 'This week — the agent’s priorities'),
      el('div', { class: 'rail' }, soon.map(function (e) {
        const co = e.companyId ? S.company(e.companyId) : null;
        const cold = co && (Date.now() - co.lastTouch) / 86400000 > 21;
        return el('button', {
          class: 'rail-card', type: 'button', onclick: () => openEvent(e.id)
        }, [
          el('div', { class: 'mono', style: `color:${typeColor(e.type)}` },
            fmtDate(e.start, 'day') + ' · ' + fmtTime(e.start)),
          el('div', { style: 'font-weight:600;font-size:var(--t-sm);margin:6px 0' }, e.title),
          co ? el('div', { class: 'muted', style: 'font-size:var(--t-xs)' }, co.name) : null,
          cold ? el('div', { class: 'badge badge-amber', style: 'margin-top:var(--s-2)' }, 'Warmth decaying')
               : el('div', { class: 'badge badge-sage', style: 'margin-top:var(--s-2)' }, 'Brief ready')
        ]);
      }))
    ]);
  }

  /* --------------------------------------------------------------- views */
  function monthGrid() {
    const a = state.anchor;
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    const cells = [];

    U.DAYS.forEach((d) => cells.push(el('div', { class: 'cal-dow' }, d.slice(0, 3))));

    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const outside = d.getMonth() !== a.getMonth();
      const evs = eventsOnDay(d);
      const isToday = sameDay(d, new Date());

      const cell = el('button', {
        class: 'cal-day' + (outside ? ' is-outside' : '') + (isToday ? ' is-today' : ''),
        type: 'button',
        'aria-label': `${fmtDate(d, 'long')}, ${evs.length} events`,
        onclick: function () {
          if (!evs.length) return;
          if (evs.length === 1) return openEvent(evs[0].id);
          state.mode = 'agenda';
          state.anchor = d;
          mount(document.getElementById('view-calendar'), true);
          const target = document.getElementById('agenda-' + isoDay(d));
          if (target) target.scrollIntoView({ block: 'start' });
        }
      }, [el('span', { class: 'dnum' }, String(d.getDate()))]);

      // Mobile: dots. Desktop: up to three chips plus an overflow count.
      if (evs.length) {
        cell.appendChild(el('span', { class: 'cal-dots' },
          evs.slice(0, 5).map((e) => el('i', { style: `background:${typeColor(e.type)}` }))));
        evs.slice(0, 3).forEach(function (e) {
          cell.appendChild(el('span', {
            class: 'cal-chip',
            style: `border-left-color:${typeColor(e.type)}`,
            onclick: function (ev) { ev.stopPropagation(); openEvent(e.id); }
          }, fmtTime(e.start) + ' ' + e.title));
        });
        if (evs.length > 3) {
          cell.appendChild(el('span', { class: 'cal-more' }, '+' + (evs.length - 3) + ' more'));
        }
      }
      cells.push(cell);
    }
    return el('div', { class: 'cal-grid' }, cells);
  }

  function weekView() {
    const a = state.anchor;
    const start = addDays(a, -a.getDay());
    return el('div', { class: 'week-wrap' },
      el('div', { class: 'week-grid' }, U.DAYS.map(function (_, i) {
        const d = addDays(start, i);
        const evs = eventsOnDay(d);
        return el('div', { class: 'week-col' + (sameDay(d, new Date()) ? ' is-today' : '') }, [
          el('div', { class: 'week-col-head' }, fmtDate(d, 'day')),
          evs.length ? el('div', {}, evs.map((e) =>
            el('button', {
              class: 'event-row', type: 'button',
              style: `border-left-color:${typeColor(e.type)};flex-direction:column;gap:2px`,
              onclick: () => openEvent(e.id)
            }, [
              el('span', { class: 'mono faint' }, fmtTime(e.start)),
              el('span', { style: 'font-size:var(--t-xs);font-weight:550' }, e.title)
            ])))
            : el('p', { class: 'faint', style: 'font-size:var(--t-xs);padding:var(--s-2)' }, '—')
        ]);
      })));
  }

  function agendaView() {
    const from = addDays(new Date(), -3);
    const upcoming = S.events
      .filter((e) => e.start >= startOfDay(from))
      .sort((a, b) => a.start - b.start);

    if (!upcoming.length) {
      return el('div', { class: 'empty' }, [el('h4', {}, 'Nothing scheduled')]);
    }

    const byDay = {};
    upcoming.forEach((e) => { (byDay[isoDay(e.start)] = byDay[isoDay(e.start)] || []).push(e); });

    return el('div', {}, Object.keys(byDay).map(function (k) {
      const d = byDay[k][0].start;
      const isToday = sameDay(d, new Date());
      return el('div', { class: 'agenda-day', id: 'agenda-' + k }, [
        el('div', { class: 'agenda-date' + (isToday ? ' is-today' : '') }, [
          el('span', { class: 'd' }, fmtDate(d, 'day')),
          el('span', { class: 'mono faint' }, relDays(d))
        ]),
        el('div', {}, byDay[k].map((e) =>
          el('button', {
            class: 'event-row', type: 'button',
            style: `border-left-color:${typeColor(e.type)}`,
            onclick: () => openEvent(e.id)
          }, [
            el('span', { class: 'when' }, fmtTime(e.start)),
            el('span', { class: 'grow' }, [
              el('div', { style: 'font-weight:600;font-size:var(--t-sm)' }, e.title),
              el('div', { class: 'muted', style: 'font-size:var(--t-xs)' },
                (e.company ? e.company + ' · ' : '') + e.minutes + ' min · ' + e.location)
            ]),
            el('span', { class: 'avatar-stack' },
              (e.attendeeIds || []).slice(0, 3).map((i) => {
                const p = S.contact(i);
                return p ? avatar(p.name, 'sm') : null;
              }).filter(Boolean))
          ])))
      ]);
    }));
  }

  /* --------------------------------------------------------------- mount */
  function mount(host, force) {
    if (!host) return;
    if (state.mode === null) state.mode = U.isMobile() ? 'agenda' : 'month';
    if (!force && host.dataset.built) return;
    host.dataset.built = '1';

    const a = state.anchor;
    const modeBtn = (id, label) => el('button', {
      type: 'button', 'aria-pressed': state.mode === id ? 'true' : 'false',
      onclick: function () { state.mode = id; mount(host, true); }
    }, label);

    const shiftBy = state.mode === 'week' ? 7 : 30;

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Calendar'),
        el('p', {}, 'Every partnership conversation, with a brief waiting before you walk in.')
      ]),

      weekRail(),

      el('div', { class: 'toolbar' }, [
        el('div', { class: 'seg' }, [
          modeBtn('agenda', 'Agenda'), modeBtn('week', 'Week'), modeBtn('month', 'Month')
        ]),
        state.mode !== 'agenda' ? el('div', { class: 'row', style: 'gap:var(--s-1)' }, [
          el('button', {
            class: 'btn-icon', 'aria-label': 'Previous',
            onclick: function () { state.anchor = addDays(state.anchor, -shiftBy); mount(host, true); },
            html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 5-7 7 7 7"/></svg>'
          }),
          el('button', {
            class: 'btn-icon', 'aria-label': 'Next',
            onclick: function () { state.anchor = addDays(state.anchor, shiftBy); mount(host, true); },
            html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg>'
          })
        ]) : null,
        state.mode !== 'agenda'
          ? el('strong', { style: 'font-size:var(--t-base)' }, U.MONTHS[a.getMonth()] + ' ' + a.getFullYear())
          : null,
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { state.anchor = new Date(S.today); mount(host, true); }
        }, 'Today')
      ]),

      el('div', { class: 'row wrap', style: 'gap:var(--s-3);margin-bottom:var(--s-4)' },
        Object.keys(S.eventTypes).map((k) =>
          el('span', { class: 'row', style: 'gap:6px;font-size:var(--t-xs);color:var(--fg-muted)' }, [
            el('i', { style: `width:10px;height:3px;border-radius:2px;background:${typeColor(k)};display:block` }),
            S.eventTypes[k].label
          ]))),

      state.mode === 'month' ? monthGrid()
        : state.mode === 'week' ? weekView()
        : agendaView()
    );
  }

  window.Views = window.Views || {};
  window.Views.calendar = mount;
  window.Views.calendarOpen = openEvent;
}());
