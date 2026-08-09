/* ==========================================================================
   Sedona AI — landing page
   Theme toggle, scroll reveals, and the waitlist form.

   The form has exactly one integration point: WAITLIST.endpoint below. Until
   that is filled in, submitting says so plainly rather than showing a fake
   success — an unconnected form that thanks you is how you lose signups you
   never knew you had.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------- config ---
     Point `endpoint` at whatever you pick — a Loops/ConvertKit form URL, a
     Formspree endpoint, or your own /api/waitlist function. It must accept a
     cross-origin POST and return 2xx on success.

     `mode` controls the body encoding:
       'json' — POST application/json  {"email": "..."}   (own API, Loops)
       'form' — POST form-encoded                          (Formspree, Tally)
     -------------------------------------------------------------------- */
  var WAITLIST = {
    endpoint: '',
    mode: 'json'
  };

  var $ = function (sel) { return document.querySelector(sel); };

  /* --- Theme -------------------------------------------------------------
     The pre-paint script in the <head> has already applied the saved value;
     this only wires the toggle. Same localStorage key as js/router.js, so a
     choice made here survives into the demo and back.
     -------------------------------------------------------------------- */
  function initTheme() {
    var btn = $('#theme-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var root = document.documentElement;
      var isDark = root.getAttribute('data-theme') === 'dark' ||
        (!root.getAttribute('data-theme') &&
          matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('sedona-theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* --- Scroll reveals ---------------------------------------------------- */
  function initReveals() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length || !('IntersectionObserver' in window)) return;

    // Only now do the cards start hidden, so a JS failure leaves them visible.
    document.documentElement.classList.add('js-reveal');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });

    items.forEach(function (item) { io.observe(item); });
  }

  /* --- Waitlist ----------------------------------------------------------- */
  function initWaitlist() {
    var form = $('#waitlist');
    if (!form) return;

    var field = $('#wl-email');
    var button = $('#wl-submit');
    var msg = $('#wl-msg');

    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'waitlist-msg is-shown ' + (kind === 'ok' ? 'is-ok' : 'is-error');
    }

    function busy(on) {
      button.disabled = on;
      button.textContent = on ? 'Joining…' : 'Join the waitlist';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var email = field.value.trim();

      // Deliberately loose. Real validation is the confirmation email; the
      // job here is only to catch obvious typos before a round trip.
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        field.classList.add('is-invalid');
        field.focus();
        say('That does not look like an email address.', 'error');
        return;
      }
      field.classList.remove('is-invalid');

      if (!WAITLIST.endpoint) {
        say('The waitlist is not connected to a backend yet.', 'error');
        console.warn(
          'Sedona: no waitlist endpoint configured. Set WAITLIST.endpoint in js/landing.js.'
        );
        return;
      }

      busy(true);

      var opts = { method: 'POST' };
      if (WAITLIST.mode === 'form') {
        var body = new FormData();
        body.append('email', email);
        opts.body = body;                    // browser sets the boundary itself
        opts.headers = { Accept: 'application/json' };
      } else {
        opts.headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        opts.body = JSON.stringify({ email: email });
      }

      fetch(WAITLIST.endpoint, opts)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          form.reset();
          say('You are on the list. We will email you when access opens.', 'ok');
        })
        .catch(function (err) {
          say('Something went wrong. Try again, or email hello@sedona.ai.', 'error');
          console.error('Sedona waitlist:', err);
        })
        .finally(function () { busy(false); });
    });

    // Clear the complaint as soon as they start fixing it.
    field.addEventListener('input', function () {
      field.classList.remove('is-invalid');
      msg.className = 'waitlist-msg';
    });
  }

  /* --- Boot --------------------------------------------------------------- */
  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  initTheme();
  initReveals();
  initWaitlist();
}());
