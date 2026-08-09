/* ==========================================================================
   Sedona AI — shared UI helpers
   Small, dependency-free render utilities used by every feature module.
   Attaches to window.UI.
   ========================================================================== */
(function () {
  'use strict';

  /* --- DOM ------------------------------------------------------------- */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Create an element from a tag, props, and children. */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else node.setAttribute(k, v === true ? '' : v);
      }
    }
    (Array.isArray(children) ? children : children ? [children] : [])
      .forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    return node;
  }

  /** Escape user/data text before it goes anywhere near innerHTML. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* --- Dates ------------------------------------------------------------ */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const isoDay = (d) => {
    const x = startOfDay(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')
      + '-' + String(x.getDate()).padStart(2, '0');
  };

  function fmtDate(d, style) {
    const x = new Date(d);
    if (style === 'long') return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
    if (style === 'day') return `${DAYS[x.getDay()].slice(0, 3)} ${MONTHS[x.getMonth()].slice(0, 3)} ${x.getDate()}`;
    return `${MONTHS[x.getMonth()].slice(0, 3)} ${x.getDate()}`;
  }

  function fmtTime(d) {
    const x = new Date(d);
    let h = x.getHours();
    const m = String(x.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return m === '00' ? `${h}${ap}` : `${h}:${m}${ap}`;
  }

  /** "12 days ago" / "in 3 days" / "today" — relative to now. */
  function relDays(d) {
    const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    if (days < 0) {
      const n = Math.abs(days);
      if (n < 30) return `${n} days ago`;
      const mo = Math.round(n / 30);
      return mo === 1 ? 'last month' : `${mo} months ago`;
    }
    if (days < 30) return `in ${days} days`;
    const mo = Math.round(days / 30);
    return mo === 1 ? 'in a month' : `in ${mo} months`;
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* --- People / data rendering ----------------------------------------- */
  function initials(name) {
    return String(name).trim().split(/\s+/).slice(0, 2)
      .map((w) => w[0]).join('').toUpperCase();
  }

  /** Stable tint from a name, so a person keeps the same color everywhere. */
  function tintFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return (h % 5) + 1;
  }

  function avatar(name, size) {
    return el('span', {
      class: `avatar avatar-t${tintFor(name)}${size ? ' avatar-' + size : ''}`,
      title: name,
      'aria-hidden': 'true'
    }, initials(name));
  }

  /** 0–100 score as a 5-segment meter. */
  function meter(score) {
    const filled = Math.max(1, Math.min(5, Math.ceil(score / 20)));
    const wrap = el('span', {
      class: 'meter', role: 'img',
      'aria-label': `Strength ${filled} of 5`
    });
    for (let i = 1; i <= 5; i++) {
      wrap.appendChild(el('i', { class: i <= filled ? `on-${filled}` : '' }));
    }
    return wrap;
  }

  const STAGE_TONE = {
    Prospect: '', Intro: 'badge-bloom', Evaluating: 'badge-amber',
    Pilot: 'badge-rust', Signed: 'badge-sage'
  };
  function stageBadge(stage) {
    return el('span', { class: `badge ${STAGE_TONE[stage] || ''}` }, stage);
  }

  /* --- Feedback --------------------------------------------------------- */
  let toastHost = null;
  function toast(message) {
    if (!toastHost) {
      toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
    }
    const t = el('div', { class: 'toast' }, [el('span', { class: 'dot' }), message]);
    toastHost.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 200);
    }, 3200);
  }

  /* --- Drawer (bottom sheet on mobile, side panel on desktop) ----------- */
  const Drawer = (function () {
    let scrim, panel, body, head, lastFocus;

    function ensure() {
      if (panel) return;
      scrim = el('div', { class: 'drawer-scrim', onclick: close });
      head = el('div', { class: 'drawer-head' });
      body = el('div', { class: 'drawer-body' });
      panel = el('div', {
        class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-hidden': 'true'
      }, [el('div', { class: 'drawer-grab' }), head, body]);
      document.body.append(scrim, panel);

      // Swipe-down to dismiss on touch devices.
      let startY = null;
      panel.addEventListener('touchstart', (e) => {
        if (body.scrollTop > 0) return;
        startY = e.touches[0].clientY;
      }, { passive: true });
      panel.addEventListener('touchmove', (e) => {
        if (startY == null) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
      }, { passive: true });
      panel.addEventListener('touchend', (e) => {
        if (startY == null) return;
        const dy = e.changedTouches[0].clientY - startY;
        panel.style.transform = '';
        if (dy > 110) close();
        startY = null;
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
      });
    }

    function open(title, subtitle, content) {
      ensure();
      lastFocus = document.activeElement;
      head.replaceChildren(
        el('div', { class: 'grow' }, [
          el('h3', { style: 'margin:0' }, title),
          subtitle ? el('div', { class: 'mono faint', style: 'margin-top:4px' }, subtitle) : null
        ]),
        el('button', {
          class: 'btn-icon', 'aria-label': 'Close panel', onclick: close,
          html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        })
      );
      body.replaceChildren(...(Array.isArray(content) ? content : [content]));
      body.scrollTop = 0;
      panel.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        scrim.classList.add('is-open');
        panel.classList.add('is-open');
        const btn = head.querySelector('button');
        if (btn) btn.focus();
      });
    }

    function close() {
      if (!panel) return;
      scrim.classList.remove('is-open');
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    return { open, close };
  }());

  /* --- Staged "agent thinking" sequence --------------------------------- */
  /** Renders labeled steps that resolve one after another, then calls done. */
  function thinkSequence(host, steps, done, perStep) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gap = reduced ? 120 : (perStep || 800);
    const nodes = steps.map((label) =>
      el('div', { class: 'think-step' }, [el('span', { class: 'spinner' }), label]));
    host.replaceChildren(...nodes);
    let i = 0;
    (function next() {
      if (i > 0) nodes[i - 1].classList.replace('is-active', 'is-done');
      if (i >= nodes.length) { if (done) done(); return; }
      nodes[i].classList.add('is-active');
      i++;
      setTimeout(next, gap);
    }());
  }

  /* --- Scroll reveals --------------------------------------------------- */
  function observeReveals(root) {
    const targets = $$('.reveal', root || document);
    if (!('IntersectionObserver' in window) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((t) => t.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach((t) => io.observe(t));
  }

  /* --- Misc ------------------------------------------------------------- */
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;

  /** Wrap matched query substrings in <mark>, on escaped text. */
  function highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const rx = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safe.replace(rx, '<mark>$1</mark>');
  }

  window.UI = {
    $, $$, el, esc, highlight,
    startOfDay, sameDay, addDays, isoDay, fmtDate, fmtTime, relDays, fmtDuration,
    MONTHS, DAYS,
    initials, tintFor, avatar, meter, stageBadge,
    toast, Drawer, thinkSequence, observeReveals, isMobile
  };
}());
