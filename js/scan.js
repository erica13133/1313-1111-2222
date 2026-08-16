/* ==========================================================================
   Sedona AI — business card scan
   Camera, upload, or a sample card.

   Camera and upload run REAL OCR in the browser via js/ocr.js — nothing is
   sent anywhere. The sample card stays authored demo data: cardArt() in
   js/data.js draws placeholder bars, not glyphs, so there is nothing on it
   to read. Each path labels itself accordingly rather than blurring the two.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, $, avatar, toast } = U;
  const S = window.SEDONA;

  let stream = null;
  let fixtureIndex = 0;

  /* An image handed in from another view (My card's "Test in scanner"),
     waiting for the next mount to pick it up. */
  let pendingShot = null;

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  /* ------------------------------------------------------------- capture */
  function setStage(stageEl, node) { stageEl.replaceChildren(node); }

  async function useCamera(stageEl, onShot) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Camera is not available here — using a sample card.');
      return sampleCard(stageEl, onShot);
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false
      });
    } catch (err) {
      toast('Camera permission denied — using a sample card instead.');
      return sampleCard(stageEl, onShot);
    }
    const video = el('video', { playsinline: true, muted: true, autoplay: true });
    video.srcObject = stream;
    setStage(stageEl, video);
    stageEl.appendChild(el('div', { class: 'scan-frame' },
      [el('span'), el('span'), el('span'), el('span')]));

    // Downloading the language data takes longer than framing the shot does.
    if (window.OCR) window.OCR.preload();

    // Capture button lives at the bottom of the stage — thumb-reachable.
    const shoot = el('button', {
      class: 'btn btn-primary',
      style: 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:2',
      type: 'button',
      onclick: function () {
        const canvas = el('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 800;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        stopCamera();
        const shot = el('img', { src: canvas.toDataURL('image/png'), alt: 'Captured business card' });
        setStage(stageEl, shot);
        onShot({ canvas: canvas });
      }
    }, 'Capture');
    stageEl.appendChild(shoot);
  }

  function nextFixture() {
    const f = S.cardFixtures[fixtureIndex % S.cardFixtures.length];
    fixtureIndex++;
    return f;
  }

  function sampleCard(stageEl, onShot) {
    stopCamera();
    const f = nextFixture();
    setStage(stageEl, el('img', { src: f.art, alt: 'Sample business card' }));
    onShot({ fixture: f });
  }

  function uploadCard(stageEl, onShot, file) {
    stopCamera();
    if (!/^image\//.test(file.type)) {
      toast('That file is not an image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const shot = el('img', { src: reader.result, alt: 'Uploaded business card' });
      setStage(stageEl, shot);
      const probe = new Image();
      probe.onload = function () { onShot({ canvas: probe }); };
      probe.onerror = function () { toast('That image could not be decoded.'); };
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ------------------------------------------------------------- progress */
  /* Steps are driven by real events from js/ocr.js, not a timer. */
  const STEPS = [
    { id: 'qr', label: 'Checking for a QR code' },
    { id: 'engine', label: 'Loading the OCR engine' },
    { id: 'read', label: 'Reading text regions' },
    { id: 'match', label: 'Matching against your CRM' }
  ];

  function progressPanel() {
    const nodes = STEPS.map((s) =>
      el('div', { class: 'think-step', 'data-step': s.id },
        [el('span', { class: 'spinner' }), el('span', {}, s.label)]));
    const host = el('div', {}, nodes);

    function update(stage, p) {
      if (stage === 'done') {
        nodes.forEach((n) => { n.classList.remove('is-active'); n.classList.add('is-done'); });
        return;
      }
      const i = STEPS.findIndex((s) => s.id === stage);
      if (i === -1) return;
      nodes.forEach((n, j) => {
        n.classList.toggle('is-done', j < i);
        n.classList.toggle('is-active', j === i);
      });
      const pct = Math.round((p || 0) * 100);
      const label = nodes[i].lastChild;
      label.textContent = pct > 0 && pct < 100
        ? STEPS[i].label + ' · ' + pct + '%'
        : STEPS[i].label;
    }

    return { node: host, update: update };
  }

  /* -------------------------------------------------------------- result */
  function renderResult(panel, input) {
    // Sample card: authored fixture, no OCR possible or attempted.
    if (input.fixture) {
      const f = input.fixture;
      panel.replaceChildren(el('div', { id: 'scan-think' }));
      U.thinkSequence($('#scan-think', panel),
        ['Detecting card edges', 'Reading text regions', 'Matching against your CRM'],
        function () {
          showFields(panel, {
            fields: f.fields.map((x) => Object.assign({}, x)),
            companyId: f.companyId,
            isDemo: true
          });
        }, 620);
      return;
    }

    if (!window.OCR || !window.OCR.available()) {
      return showFailure(panel, 'engine', null);
    }

    const prog = progressPanel();
    panel.replaceChildren(
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'Reading card'),
        el('span', { class: 'demo-tag is-live' }, 'On-device')
      ]),
      prog.node
    );

    window.OCR.scan(input.canvas, prog.update).then(function (res) {
      if (!res.ok) return showFailure(panel, res.reason, res);
      showFields(panel, {
        fields: res.fields,
        companyId: res.companyId,
        source: res.source,
        meanConf: res.meanConf
      });
    }).catch(function (err) {
      showFailure(panel, 'engine', null, err);
    });
  }

  function showFailure(panel, reason, res, err) {
    const message = {
      engine: 'The OCR engine could not load. Check the connection and try again — the language data is fetched once, then cached.',
      'no-text': 'No text was found on that image. Fill the frame with the card, hold it flat, and avoid glare.',
      'too-few-fields': 'Only a fragment came back legible. A straighter, closer shot in better light usually fixes it.',
      'partial-read': 'The big lines read cleanly but the contact details did not, so this is half a card. Fill the frame with it and shoot straight on.',
      'low-confidence': 'The read was too uncertain to show as fact. Try again with more light, or type the details in by hand.'
    }[reason] || 'That card could not be read.';

    if (err && window.console) window.console.warn('[scan] OCR failed:', err);

    const nodes = [
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'Could not read it'),
        res ? el('span', { class: 'demo-tag is-live' }, Math.round(res.meanConf) + '% conf') : null
      ].filter(Boolean)),
      el('div', { class: 'notice' }, [
        el('span', { style: 'flex-shrink:0' }, '⚠'),
        el('div', {}, message)
      ])
    ];

    // Anything partially legible is still worth offering as a starting point.
    if (res && res.fields.some((f) => f.value)) {
      nodes.push(el('p', { class: 'muted', style: 'font-size:var(--t-sm);margin-bottom:var(--s-3)' },
        'What did come through:'));
      nodes.push(el('div', { class: 'card card-pad', style: 'margin-bottom:var(--s-4)' },
        res.fields.filter((f) => f.value).map((f) =>
          el('div', { class: 'field-row' }, [
            el('div', { style: 'flex:1;min-width:0' }, [
              el('label', { class: 'field-label' }, f.label),
              el('div', { class: 'mono', style: 'font-size:var(--t-sm)' }, f.value)
            ]),
            el('span', { class: 'conf is-low' }, f.conf + '%')
          ]))));
      nodes.push(el('button', {
        class: 'btn btn-secondary', type: 'button', style: 'margin-right:var(--s-2)',
        onclick: function () {
          showFields(panel, { fields: res.fields, companyId: res.companyId, source: res.source, meanConf: res.meanConf, lowConf: true });
        }
      }, 'Edit these anyway'));
    }

    nodes.push(el('button', {
      class: 'btn btn-ghost', type: 'button',
      onclick: function () { panel.replaceChildren(idlePanel()); }
    }, 'Start over'));

    panel.replaceChildren(...nodes);
  }

  function showFields(panel, result) {
    const fields = result.fields;
    const values = {};
    fields.forEach((f) => { values[f.key] = f.value; });

    const existing = result.companyId ? S.company(result.companyId) : null;
    const owner = existing ? existing.owner : null;

    const rows = fields.map(function (f, i) {
      const input = el('input', {
        class: 'input', value: f.value, 'aria-label': f.label,
        placeholder: f.value ? null : 'Not found — add it',
        oninput: (e) => { values[f.key] = e.target.value; }
      });
      return el('div', {
        class: 'field-row',
        style: `animation-delay:${i * 70}ms`
      }, [
        el('div', { style: 'flex:1;min-width:0' }, [
          el('label', { class: 'field-label' }, f.label + (f.derived ? ' · inferred' : '')),
          input
        ]),
        el('span', {
          class: 'conf' + (f.conf && f.conf < 80 ? ' is-low' : (f.conf ? '' : ' is-low')),
          title: f.value ? `Confidence ${f.conf}%` : 'Nothing found for this field'
        }, f.value ? f.conf + '%' : '—')
      ]);
    });

    const tag = result.isDemo
      ? el('span', { class: 'demo-tag' }, 'Demo data')
      : el('span', { class: 'demo-tag is-live' },
        result.source === 'qr' ? 'QR / vCard' : 'On-device OCR');

    const nodes = [
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'Extracted'),
        tag
      ])
    ];

    if (result.isDemo) {
      nodes.push(el('div', { class: 'notice' }, [
        el('span', { style: 'flex-shrink:0' }, '⚠'),
        el('div', {}, 'The sample card is generated artwork with no real text on it, so these fields are authored demo data. Use the camera or an upload for a real read.')
      ]));
    } else if (result.lowConf) {
      nodes.push(el('div', { class: 'notice' }, [
        el('span', { style: 'flex-shrink:0' }, '⚠'),
        el('div', {}, 'Low-confidence read — check every field before saving.')
      ]));
    }

    if (existing) {
      nodes.push(el('div', { class: 'notice' }, [
        el('span', { style: 'flex-shrink:0' }, '⚠'),
        el('div', {}, [
          el('strong', {}, existing.name),
          ' is already a partner — ', el('strong', {}, owner), ' owns it. This person will be linked to the existing record.'
        ])
      ]));
    }

    nodes.push(el('div', { class: 'card card-pad', style: 'margin-bottom:var(--s-4)' }, rows));

    nodes.push(el('h4', { style: 'margin-bottom:var(--s-3)' }, 'Agent suggestions'));
    nodes.push(el('div', { class: 'stack', style: 'margin-bottom:var(--s-5)' },
      [
        'Draft an intro email referencing where you met',
        existing ? `Add to the ${existing.name} ${existing.stage.toLowerCase()} thread`
                 : 'Create a new company record',
        'Schedule a follow-up in 5 days'
      ].map((s) => el('div', {
        style: 'display:flex;gap:var(--s-2);font-size:var(--t-sm);align-items:flex-start'
      }, [el('span', { style: 'color:var(--accent)' }, '→'), el('span', {}, s)]))));

    nodes.push(el('div', { class: 'row', style: 'gap:var(--s-2);flex-wrap:wrap' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: function () {
          if (!String(values.name || '').trim()) {
            toast('A name is needed before this can be saved.');
            return;
          }
          const rec = S.addContact({
            name: values.name, title: values.title,
            company: values.company, companyId: result.companyId,
            email: values.email, phone: values.phone
          });
          toast(`${rec.name} saved to your CRM.`);
          panel.replaceChildren(savedCard(rec));
        }
      }, 'Save to CRM'),
      el('button', {
        class: 'btn btn-secondary', type: 'button',
        onclick: function () { panel.replaceChildren(idlePanel()); }
      }, 'Discard')
    ]));

    panel.replaceChildren(...nodes);
  }

  function savedCard(rec) {
    return el('div', { class: 'card card-pad' }, [
      el('div', { class: 'row', style: 'margin-bottom:var(--s-4)' }, [
        avatar(rec.name, 'lg'),
        el('div', { class: 'grow' }, [
          el('h3', { style: 'margin:0' }, rec.name),
          el('div', { class: 'muted', style: 'font-size:var(--t-sm)' }, rec.title + ' · ' + rec.company)
        ])
      ]),
      el('div', { class: 'notice is-info' }, [
        el('span', { style: 'color:var(--sage-vortex);flex-shrink:0' }, '✓'),
        el('div', {}, 'Added to Contacts, indexed for search, and logged in the agent feed.')
      ]),
      el('div', { class: 'row', style: 'gap:var(--s-2);flex-wrap:wrap' }, [
        el('a', { class: 'btn btn-secondary btn-sm', href: '#/contacts' }, 'View in contacts'),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => window.Views.openContact(rec.id)
        }, 'Open record')
      ])
    ]);
  }

  function idlePanel() {
    return el('div', { class: 'empty' }, [
      el('h4', {}, 'Nothing scanned yet'),
      el('p', {}, 'Point the camera at a card, drop an image, or try a sample — the agent reads it and checks it against your CRM.')
    ]);
  }

  /* --------------------------------------------------------------- mount */
  function mount(host, force) {
    if (!host) return;
    const incoming = pendingShot;
    pendingShot = null;
    // An incoming image needs a clean stage, so it forces a rebuild even when
    // the view is already mounted.
    if (incoming) force = true;
    if (!force && host.dataset.built) return;
    host.dataset.built = '1';
    stopCamera();

    const stage = el('div', { class: 'capture-stage' },
      el('p', { class: 'placeholder' }, 'Camera preview appears here. Nothing is uploaded — text is read on your device.'));

    const panel = el('div', {}, idlePanel());
    const onShot = (input) => renderResult(panel, input);

    const fileInput = el('input', {
      type: 'file', accept: 'image/*', class: 'sr-only', id: 'card-file',
      onchange: (e) => { if (e.target.files[0]) uploadCard(stage, onShot, e.target.files[0]); }
    });

    const dropZone = el('div', {
      ondragover: (e) => { e.preventDefault(); stage.style.outline = '2px dashed var(--accent)'; },
      ondragleave: () => { stage.style.outline = ''; },
      ondrop: function (e) {
        e.preventDefault();
        stage.style.outline = '';
        const f = e.dataTransfer.files[0];
        if (f) uploadCard(stage, onShot, f);
      }
    }, [
      stage,
      el('div', { class: 'capture-actions' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => useCamera(stage, onShot) }, 'Use camera'),
        el('label', { class: 'btn btn-secondary', for: 'card-file' }, 'Upload'),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => sampleCard(stage, onShot) }, 'Sample card')
      ]),
      fileInput,
      el('p', { class: 'faint', style: 'font-size:var(--t-xs);margin-top:var(--s-3)' },
        'On a phone this opens the rear camera. You can also drag an image onto the frame. The first read downloads ~14 MB of language data, then works offline.')
    ]);

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Scan a card'),
        el('p', {}, [
          'Capture a business card and the agent extracts the fields, checks them against your CRM, and proposes the follow-up. ',
          // The only route to My card on mobile, where the tab bar is full.
          el('a', { href: '#/mycard' }, 'Make your own card to hand back →')
        ])
      ]),
      el('div', { class: 'scan-layout' }, [dropZone, el('div', {}, panel)])
    );

    if (incoming) {
      setStage(stage, el('img', {
        src: incoming.toDataURL('image/png'),
        alt: 'Card handed to the reader from My card'
      }));
      onShot({ canvas: incoming });
    }
  }

  /**
   * Read an image produced elsewhere in the app. My card uses this to send a
   * card it just generated back through the real reader — the QR fast path
   * decodes the vCard it embedded, which is the honest end-to-end check.
   */
  function scanShot(canvas) {
    pendingShot = canvas;
    if ((location.hash || '').indexOf('scan') === -1) location.hash = '#/scan';
    else mount($('#view-scan'), true);
  }

  // Free the camera when the user navigates away.
  window.addEventListener('hashchange', function () {
    if ((location.hash || '').indexOf('scan') === -1) stopCamera();
  });

  window.Views = window.Views || {};
  window.Views.scan = mount;
  window.Views.scanShot = scanShot;
}());
