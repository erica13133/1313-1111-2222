/* ==========================================================================
   Sedona AI — business card scan
   Camera, upload, or a sample card. All three land on the same result flow.

   The OCR itself is SIMULATED and labelled as such: on a real upload we
   cannot know what the card says, so the demo resolves to a pre-authored
   fixture and marks the panel DEMO DATA rather than pretending.
   ========================================================================== */
(function () {
  'use strict';
  const U = window.UI;
  const { el, $, avatar, toast } = U;
  const S = window.SEDONA;

  let stream = null;
  let fixtureIndex = 0;

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
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
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
        onShot(nextFixture(), true);
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
    onShot(f, false);
  }

  function uploadCard(stageEl, onShot, file) {
    stopCamera();
    const reader = new FileReader();
    reader.onload = function () {
      setStage(stageEl, el('img', { src: reader.result, alt: 'Uploaded business card' }));
      onShot(nextFixture(), true);
    };
    reader.readAsDataURL(file);
  }

  /* -------------------------------------------------------------- result */
  function renderResult(panel, fixture, wasReal) {
    const values = {};
    fixture.fields.forEach((f) => { values[f.key] = f.value; });

    panel.replaceChildren(
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'Extracted'),
        el('span', { class: 'demo-tag' }, 'Demo data')
      ]),
      el('div', { id: 'scan-think' })
    );

    U.thinkSequence($('#scan-think', panel),
      ['Detecting card edges', 'Reading text regions', 'Matching against your CRM'],
      function () { showFields(panel, fixture, values, wasReal); }, 620);
  }

  function showFields(panel, fixture, values, wasReal) {
    const existing = fixture.companyId ? S.company(fixture.companyId) : null;
    const owner = existing ? existing.owner : null;

    const rows = fixture.fields.map(function (f, i) {
      const input = el('input', {
        class: 'input', value: f.value, 'aria-label': f.label,
        oninput: (e) => { values[f.key] = e.target.value; }
      });
      return el('div', {
        class: 'field-row',
        style: `animation-delay:${i * 70}ms`
      }, [
        el('div', { style: 'flex:1;min-width:0' }, [
          el('label', { class: 'field-label' }, f.label),
          input
        ]),
        el('span', {
          class: 'conf' + (f.conf < 95 ? ' is-low' : ''),
          title: `Confidence ${f.conf}%`
        }, f.conf + '%')
      ]);
    });

    const nodes = [
      el('div', { class: 'row-between', style: 'margin-bottom:var(--s-4)' }, [
        el('h3', { style: 'margin:0' }, 'Extracted'),
        el('span', { class: 'demo-tag' }, 'Demo data')
      ])
    ];

    if (wasReal) {
      nodes.push(el('div', { class: 'notice' }, [
        el('span', { style: 'flex-shrink:0' }, '⚠'),
        el('div', {}, 'No real OCR runs in this demo. Your capture is shown as-is; the fields below come from a sample card.')
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
          const rec = S.addContact({
            name: values.name, title: values.title,
            company: values.company, companyId: fixture.companyId,
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
    if (!force && host.dataset.built) return;
    host.dataset.built = '1';
    stopCamera();

    const stage = el('div', { class: 'capture-stage' },
      el('p', { class: 'placeholder' }, 'Camera preview appears here. Nothing is uploaded — capture stays in your browser.'));

    const panel = el('div', {}, idlePanel());
    const onShot = (fixture, wasReal) => renderResult(panel, fixture, wasReal);

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
        'On a phone this opens the rear camera. You can also drag an image onto the frame.')
    ]);

    host.replaceChildren(
      el('div', { class: 'view-head' }, [
        el('h1', {}, 'Scan a card'),
        el('p', {}, 'Capture a business card and the agent extracts the fields, checks them against your CRM, and proposes the follow-up.')
      ]),
      el('div', { class: 'scan-layout' }, [dropZone, el('div', {}, panel)])
    );
  }

  // Free the camera when the user navigates away.
  window.addEventListener('hashchange', function () {
    if ((location.hash || '').indexOf('scan') === -1) stopCamera();
  });

  window.Views = window.Views || {};
  window.Views.scan = mount;
}());
