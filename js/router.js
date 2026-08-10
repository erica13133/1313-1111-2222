/* ==========================================================================
   Sedona AI — hash router, theme toggle, agent feed
   Each feature module registers a mount() under window.Views.
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, el } = window.UI;
  const S = window.SEDONA;

  const DEFAULT_VIEW = 'calendar';
  const VIEWS = ['scan', 'mycard', 'voice', 'calendar', 'crm', 'contacts'];
  const mounted = {};

  /* Only for views whose route name does not capitalise into a readable title. */
  const TITLES = { mycard: 'My card' };

  function currentView() {
    const name = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    return VIEWS.indexOf(name) > -1 ? name : DEFAULT_VIEW;
  }

  function render() {
    const view = currentView();

    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== view; });

    // Contacts is a sub-view of the CRM tab, so that tab stays lit for both.
    $$('.nav-link, .tab').forEach((a) => {
      const t = a.dataset.view;
      const active = t === view || (t === 'crm' && view === 'contacts');
      a.classList.toggle('is-active', !!active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const host = $('#view-' + view);
    const mount = window.Views && window.Views[view];
    if (host && mount) {
      // Mount once; re-render on subsequent visits so data edits show up.
      mount(host, !mounted[view]);
      mounted[view] = true;
    }
    document.title = (TITLES[view] || view.charAt(0).toUpperCase() + view.slice(1)) + ' — Sedona AI';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* --- Agent activity feed (sidebar) ------------------------------------ */
  function renderFeed() {
    const host = $('#agent-feed');
    if (!host) return;
    host.replaceChildren(...S.activity.slice(0, 6).map((a) =>
      el('div', { class: 'agent-item' }, [
        el('span', { class: 'kind k-' + a.kind }),
        el('div', {}, [
          el('div', {}, a.text),
          el('div', { class: 'mono faint', style: 'margin-top:3px' }, window.UI.relDays(a.at))
        ])
      ])
    ));
  }

  /* --- Theme toggle ------------------------------------------------------ */
  function initTheme() {
    const btn = $('#theme-btn');
    if (!btn) return;
    const saved = localStorage.getItem('sedona-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    btn.addEventListener('click', function () {
      const root = document.documentElement;
      const isDark = root.getAttribute('data-theme') === 'dark' ||
        (!root.getAttribute('data-theme') &&
          matchMedia('(prefers-color-scheme: dark)').matches);
      const next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('sedona-theme', next);
    });
  }

  /* --- Boot -------------------------------------------------------------- */
  window.addEventListener('hashchange', render);

  S.on(function (type) {
    renderFeed();
    // A new contact or event invalidates whatever is on screen.
    if (type === 'contact:add' || type === 'event:add') {
      mounted.crm = mounted.contacts = mounted.calendar = false;
      const view = currentView();
      const mount = window.Views && window.Views[view];
      if (mount) { mount($('#view-' + view), true); mounted[view] = true; }
    }
  });

  initTheme();
  renderFeed();
  if (!location.hash) location.replace('#/' + DEFAULT_VIEW);
  render();
}());
