/* ==========================================================================
   Sedona AI — demo dataset
   Entirely fictional. Every company, person, email, and event below is
   invented for demonstration. Dates are generated relative to "today" so the
   calendar is never stale.

   Exposes window.SEDONA — the single source of truth for all four features.
   Mutations (a scanned card, a checked action item) write back here so the
   whole app stays in sync within a session.
   ========================================================================== */
(function () {
  'use strict';

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  /** Days offset from today → Date, with an optional time of day. */
  function day(offset, hour, min) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + offset);
    if (hour != null) d.setHours(hour, min || 0, 0, 0);
    return d;
  }

  /* ======================================================================
     Companies
     ====================================================================== */
  const companies = [
    { id: 'c1',  name: 'Novara Labs',        category: 'Fintech',   size: '120–250', hq: 'Austin, TX',      arr: '$14M',  stage: 'Pilot',      owner: 'Elena Ruiz',    strength: 82, since: 'Mar 2025', note: 'Embedded payments platform. Pilot on co-branded onboarding runs through Q4.' },
    { id: 'c2',  name: 'Terrafirma Energy',  category: 'Climate',   size: '500–1000',hq: 'Denver, CO',      arr: '$62M',  stage: 'Signed',     owner: 'Elena Ruiz',    strength: 91, since: 'Aug 2024', note: 'Grid analytics. Signed a two-year reseller agreement; expansion conversation open.' },
    { id: 'c3',  name: 'Kestrel Freight',    category: 'Logistics', size: '1000+',   hq: 'Memphis, TN',     arr: '$210M', stage: 'Evaluating', owner: 'Marcus Dane',   strength: 54, since: 'Jan 2026', note: 'Legacy TMS, actively re-platforming. Procurement is the bottleneck, not product.' },
    { id: 'c4',  name: 'Halcyon Health',     category: 'Health',    size: '250–500', hq: 'Boston, MA',      arr: '$38M',  stage: 'Intro',      owner: 'Priya Raman',   strength: 38, since: 'Jun 2026', note: 'Care-coordination software. Warm intro via the Halcyon CTO at HealthNorth.' },
    { id: 'c5',  name: 'Bramble & Co.',      category: 'DevTools',  size: '20–50',   hq: 'Portland, OR',    arr: '$3M',   stage: 'Pilot',      owner: 'Marcus Dane',   strength: 74, since: 'Apr 2026', note: 'Open-source CI tooling. Small but their community reach is outsized.' },
    { id: 'c6',  name: 'Solstice Capital',   category: 'Fintech',   size: '50–120',  hq: 'New York, NY',    arr: '$21M',  stage: 'Evaluating', owner: 'Elena Ruiz',    strength: 61, since: 'Feb 2026', note: 'Growth fund. Interested in a portfolio-wide deployment, not a single deal.' },
    { id: 'c7',  name: 'Junipero Systems',   category: 'DevTools',  size: '120–250', hq: 'San Jose, CA',    arr: '$29M',  stage: 'Signed',     owner: 'Priya Raman',   strength: 88, since: 'Nov 2025', note: 'Observability. Joint customer story published; co-marketing renews in January.' },
    { id: 'c8',  name: 'Wren & Sparrow',     category: 'Health',    size: '20–50',   hq: 'Nashville, TN',   arr: '$4M',   stage: 'Prospect',   owner: 'Priya Raman',   strength: 22, since: 'Jul 2026', note: 'Behavioral health network. Early — met once at a conference, no champion yet.' },
    { id: 'c9',  name: 'Ridgeline Robotics', category: 'Logistics', size: '250–500', hq: 'Pittsburgh, PA',  arr: '$47M',  stage: 'Intro',      owner: 'Marcus Dane',   strength: 44, since: 'May 2026', note: 'Warehouse automation. Technical fit is strong; commercial model still unclear.' },
    { id: 'c10', name: 'Calderon Grid',      category: 'Climate',   size: '120–250', hq: 'Phoenix, AZ',     arr: '$18M',  stage: 'Evaluating', owner: 'Elena Ruiz',    strength: 66, since: 'Mar 2026', note: 'Utility-scale storage. Security review is the last open item before pilot.' },
    { id: 'c11', name: 'Aperture Studio',    category: 'DevTools',  size: '<20',     hq: 'Remote',          arr: '$1.2M', stage: 'Prospect',   owner: 'Marcus Dane',   strength: 17, since: 'Jul 2026', note: 'Design-systems consultancy. Possible implementation partner rather than a customer.' },
    { id: 'c12', name: 'Meridian Payments',  category: 'Fintech',   size: '500–1000',hq: 'Chicago, IL',     arr: '$140M', stage: 'Signed',     owner: 'Elena Ruiz',    strength: 79, since: 'Sep 2025', note: 'Acquiring bank partner. Quiet for six weeks — worth a check-in before renewal.' },
    { id: 'c13', name: 'Cobalt Harbor',      category: 'Logistics', size: '50–120',  hq: 'Seattle, WA',     arr: '$11M',  stage: 'Prospect',   owner: 'Priya Raman',   strength: 29, since: 'Jun 2026', note: 'Port logistics data. Inbound from a webinar; qualification call not yet booked.' },
    { id: 'c14', name: 'Verdance Bio',       category: 'Health',    size: '120–250', hq: 'San Diego, CA',   arr: '$26M',  stage: 'Pilot',      owner: 'Priya Raman',   strength: 71, since: 'Feb 2026', note: 'Clinical trial logistics. Pilot going well; champion just got promoted.' }
  ];

  /* ======================================================================
     Contacts — 40 people across those companies
     ====================================================================== */
  const RAW_CONTACTS = [
    ['Marisol Okonjo',   'VP Partnerships',        'c1',  'scan',   ['champion', 'fintech'],      88, -3,   'SaaStr Annual'],
    ['Dev Raghunathan',  'Head of Platform',       'c1',  'voice',  ['technical'],                71, -9,   'SaaStr Annual'],
    ['Ana Sørensen',     'CFO',                    'c1',  'manual', ['economic-buyer'],           52, -21,  'Intro from Elena'],
    ['Tobias Lindqvist', 'Chief Commercial Officer','c2', 'manual', ['champion', 'climate'],      93, -5,   'Grid Forum'],
    ['Yara Haddad',      'Director, Grid Ops',     'c2',  'voice',  ['technical', 'climate'],     77, -12,  'Grid Forum'],
    ['Nathan Ojo',       'Procurement Lead',       'c2',  'import', ['procurement'],              41, -34,  'Vendor portal'],
    ['Camille Boucher',  'SVP Network Strategy',   'c3',  'scan',   ['logistics'],                58, -8,   'FreightTech Summit'],
    ['Idris Fawaz',      'Director of Engineering','c3',  'voice',  ['technical', 'blocker'],     46, -16,  'FreightTech Summit'],
    ['Rosalind Achebe',  'General Counsel',        'c3',  'manual', ['legal', 'procurement'],     28, -41,  'Procurement thread'],
    ['Dr. Wen Jiang',    'Chief Medical Officer',  'c4',  'manual', ['clinical'],                 44, -11,  'HealthNorth'],
    ['Benicio Alvarez',  'CTO',                    'c4',  'scan',   ['technical', 'champion'],    62, -6,   'HealthNorth'],
    ['Freya Lindholm',   'Head of Partnerships',   'c4',  'voice',  ['partnerships'],             39, -19,  'HealthNorth'],
    ['Oscar Delacroix',  'Founder',                'c5',  'voice',  ['founder', 'devtools'],      81, -2,   'OSS Summit'],
    ['Nadia Petrov',     'Community Lead',         'c5',  'scan',   ['community'],                69, -7,   'OSS Summit'],
    ['Hugo Ferreira',    'Partner',                'c6',  'manual', ['investor'],                 64, -14,  'Solstice AGM'],
    ['Amara Blackwood',  'Principal',              'c6',  'voice',  ['investor'],                 57, -18,  'Solstice AGM'],
    ['Tomás Aguilar',    'Platform Ops Manager',   'c6',  'import', [],                           31, -47,  'Newsletter'],
    ['Sunil Mehra',      'VP Product',             'c7',  'manual', ['champion', 'devtools'],     90, -4,   'Junipero HQ'],
    ['Greta Halvorsen',  'Director, Alliances',    'c7',  'scan',   ['partnerships'],             84, -10,  'ObservabilityCon'],
    ['Ruth Kimani',      'Staff Engineer',         'c7',  'voice',  ['technical'],                67, -23,  'ObservabilityCon'],
    ['Malik Osei',       'Co-founder',             'c8',  'scan',   ['founder'],                  33, -27,  'HealthNorth'],
    ['Sylvia Trent',     'Clinical Director',      'c8',  'manual', ['clinical'],                 24, -52,  'Inbound'],
    ['Jonas Weber',      'VP Operations',          'c9',  'voice',  ['logistics', 'champion'],    59, -13,  'AutomateX'],
    ['Priyanka Sethi',   'Robotics Lead',          'c9',  'scan',   ['technical'],                48, -15,  'AutomateX'],
    ['Colette Marchand', 'Head of Finance',        'c9',  'manual', ['economic-buyer'],           35, -38,  'Follow-up thread'],
    ['Rafael Nunes',     'Director of Storage',    'c10', 'voice',  ['climate', 'technical'],     73, -6,   'Grid Forum'],
    ['Ingrid Nyström',   'CISO',                   'c10', 'manual', ['security', 'blocker'],      51, -9,   'Security review'],
    ['Beatriz Salgado',  'VP Strategy',            'c10', 'scan',   ['champion'],                 68, -17,  'Grid Forum'],
    ['June Park',        'Creative Director',      'c11', 'scan',   ['design'],                   26, -29,  'Design Week'],
    ['Elliot Ashcombe',  'Managing Partner',       'c11', 'manual', ['founder'],                  19, -44,  'Design Week'],
    ['Solomon Reyes',    'SVP Business Dev',       'c12', 'manual', ['champion', 'fintech'],      76, -43,  'Money20/20'],
    ['Hana Kobayashi',   'Director, Risk',         'c12', 'voice',  ['risk'],                     62, -31,  'Money20/20'],
    ['Wesley Turnbull',  'Renewals Manager',       'c12', 'import', ['renewal'],                  49, -25,  'CRM import'],
    ['Adaeze Nwosu',     'Head of Data',           'c13', 'scan',   ['technical'],                34, -20,  'Webinar'],
    ['Lars Fredriksen',  'COO',                    'c13', 'manual', ['economic-buyer'],           27, -36,  'Webinar'],
    ['Dr. Imani Cole',   'VP Clinical Ops',        'c14', 'voice',  ['clinical', 'champion'],     78, -5,   'BioLogistics Forum'],
    ['Gustavo Pinto',    'Trial Logistics Lead',   'c14', 'scan',   ['technical'],                65, -11,  'BioLogistics Forum'],
    ['Neve Ballantyne',  'Program Manager',        'c14', 'manual', [],                            53, -22,  'Pilot kickoff'],
    ['Theo Vasquez',     'Head of Growth',         'c5',  'manual', ['growth'],                   56, -26,  'OSS Summit'],
    ['Karin Bauer',      'Regional Director',      'c2',  'scan',   ['climate'],                  70, -15,  'Grid Forum']
  ];

  const NEXT_ACTIONS = [
    'Send the pilot scope doc', 'Book a technical deep-dive', 'Share the SOC 2 report',
    'Draft the co-marketing brief', 'Introduce to Elena', 'Confirm Q4 timeline',
    'Follow up on pricing questions', 'Send the joint customer story', null, null
  ];

  const contacts = RAW_CONTACTS.map(function (r, i) {
    const co = companies.find((c) => c.id === r[2]);
    return {
      id: 'p' + (i + 1),
      name: r[0],
      title: r[1],
      companyId: r[2],
      company: co.name,
      email: r[0].toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
        .replace(/^(dr|mr|ms)\.?\s+/, '')
        .replace(/[^a-z\s]/g, '').trim().split(/\s+/).join('.')
        + '@' + co.name.toLowerCase().replace(/[^a-z]/g, '') + '.com',
      phone: '+1 (' + (201 + (i * 7) % 700) + ') ' + (200 + (i * 13) % 700) + '-' + String(1000 + (i * 137) % 9000),
      source: r[3],
      tags: r[4],
      warmth: r[5],
      lastTouch: day(r[6]),
      metAt: r[7],
      metOn: day(r[6] - 20 - (i % 40)),
      nextAction: NEXT_ACTIONS[i % NEXT_ACTIONS.length],
      notes: ''
    };
  });

  // Link contacts back onto their companies.
  companies.forEach((co) => {
    co.contactIds = contacts.filter((p) => p.companyId === co.id).map((p) => p.id);
    const touches = co.contactIds.map((id) => contacts.find((p) => p.id === id).lastTouch);
    co.lastTouch = new Date(Math.max.apply(null, touches));
  });

  /* ======================================================================
     Calendar events — spread across today ±6 weeks
     ====================================================================== */
  const EVENT_TYPES = {
    intro:      { label: 'Intro',      color: 'var(--canyon-rust)' },
    followup:   { label: 'Follow-up',  color: 'var(--sage-vortex)' },
    conference: { label: 'Conference', color: 'var(--desert-bloom)' },
    dinner:     { label: 'Dinner',     color: 'var(--amber-signal)' }
  };

  const RAW_EVENTS = [
    [-38, 9,  60,  'conference', 'Grid Forum — day one',            'c2',  ['p4', 'p5', 'p26']],
    [-34, 15, 45,  'followup',   'Terrafirma quarterly review',      'c2',  ['p4', 'p6']],
    [-27, 11, 30,  'intro',      'Intro: Wren & Sparrow',            'c8',  ['p21']],
    [-23, 14, 60,  'followup',   'Junipero engineering sync',        'c7',  ['p20', 'p18']],
    [-19, 10, 30,  'followup',   'Halcyon partnerships check-in',    'c4',  ['p12']],
    [-16, 16, 45,  'followup',   'Kestrel technical objections',     'c3',  ['p8']],
    [-12, 13, 60,  'followup',   'Terrafirma grid ops walkthrough',  'c2',  ['p5']],
    [-9,  9,  30,  'followup',   'Calderon security review',         'c10', ['p27']],
    [-6,  18, 120, 'dinner',     'Dinner with Novara team',          'c1',  ['p1', 'p2']],
    [-5,  10, 45,  'followup',   'Verdance pilot readout',           'c14', ['p36', 'p38']],
    [-3,  11, 30,  'followup',   'Marisol — pilot scope',            'c1',  ['p1']],
    [-2,  15, 30,  'intro',      'Intro: Bramble & Co.',             'c5',  ['p13']],
    [-1,  14, 60,  'followup',   'Ridgeline commercial model',       'c9',  ['p23', 'p25']],
    [0,   9,  30,  'followup',   'Novara pilot standup',             'c1',  ['p1', 'p2']],
    [0,   13, 45,  'intro',      'Intro: Cobalt Harbor',             'c13', ['p34']],
    [0,   16, 30,  'followup',   'Junipero co-marketing renewal',    'c7',  ['p19']],
    [1,   10, 60,  'followup',   'Calderon storage architecture',    'c10', ['p26', 'p28']],
    [1,   15, 30,  'followup',   'Solstice portfolio deployment',    'c6',  ['p15']],
    [2,   11, 45,  'intro',      'Intro: Aperture Studio',           'c11', ['p29']],
    [2,   18, 90,  'dinner',     'Dinner — Meridian renewal',        'c12', ['p31', 'p33']],
    [3,   9,  30,  'followup',   'Halcyon CTO deep-dive',            'c4',  ['p11', 'p10']],
    [4,   14, 60,  'followup',   'Kestrel procurement review',       'c3',  ['p7', 'p9']],
    [5,   10, 30,  'followup',   'Bramble community launch',         'c5',  ['p14', 'p39']],
    [8,   9,  480, 'conference', 'FreightTech Summit',               'c3',  ['p7', 'p8']],
    [9,   9,  480, 'conference', 'FreightTech Summit — day two',     'c9',  ['p23', 'p24']],
    [11,  11, 45,  'followup',   'Verdance champion transition',     'c14', ['p36']],
    [14,  10, 60,  'followup',   'Novara pilot mid-point',           'c1',  ['p1', 'p2', 'p3']],
    [17,  15, 30,  'intro',      'Intro: Solstice portfolio co.',    'c6',  ['p16']],
    [21,  13, 60,  'followup',   'Terrafirma expansion proposal',    'c2',  ['p4', 'p40']],
    [26,  18, 120, 'dinner',     'Partner dinner — Q4 kickoff',      'c7',  ['p18', 'p19', 'p20']],
    [30,  10, 45,  'followup',   'Meridian renewal decision',        'c12', ['p31']],
    [35,  9,  480, 'conference', 'HealthNorth Summit',               'c4',  ['p10', 'p11', 'p12']]
  ];

  const BRIEFS = [
    'Last spoke {rel}. They asked about SOC 2 — we shipped it in June, so lead with that.',
    'Quiet for {rel}. Warmth is decaying; open with the joint customer story rather than the roadmap.',
    'They raised pricing concerns {rel}. Come with the tiered model, not the list price.',
    'Champion changed roles since you last met {rel}. Confirm who owns the budget now.',
    'You committed to send the pilot scope {rel} and it has not gone out yet.',
    'Strong momentum — three touches in the last month. Push for a decision date.'
  ];

  const events = RAW_EVENTS.map(function (e, i) {
    const start = day(e[0], e[1]);
    const end = new Date(start.getTime() + e[2] * 60000);
    return {
      id: 'e' + (i + 1),
      start: start,
      end: end,
      minutes: e[2],
      type: e[3],
      title: e[4],
      companyId: e[5],
      company: (companies.find((c) => c.id === e[5]) || {}).name,
      attendeeIds: e[6],
      location: e[3] === 'conference' ? 'Convention center'
        : e[3] === 'dinner' ? 'Restaurant' : 'Video call',
      brief: BRIEFS[i % BRIEFS.length]
    };
  });

  /* ======================================================================
     Voice memos
     ====================================================================== */
  const memos = [
    {
      id: 'm1', title: 'Booth conversation — Marisol Okonjo', recordedAt: day(-3, 11, 20),
      seconds: 94, companyId: 'c1', contactIds: ['p1'],
      transcript: [
        ['You', 'Great to finally put a face to the name. How is the onboarding pilot landing internally?'],
        ['Marisol', 'Honestly better than I expected. The team that pushed back hardest in March is now the one asking when we can widen it.'],
        ['You', 'That is good to hear. What would it take to widen it?'],
        ['Marisol', 'Two things. Ana needs to see the cost model against our current vendor, and legal wants the SOC 2 report before we touch production data.'],
        ['You', 'I can get both to you this week. Is Ana the final sign-off?'],
        ['Marisol', 'She is. And I would move before the end of the quarter — budgets reset in October and this gets harder after that.']
      ],
      entities: { people: ['Marisol Okonjo', 'Ana Sørensen'], companies: ['Novara Labs'], dates: ['End of quarter', 'October'] },
      actions: [
        { text: 'Send the SOC 2 report to Novara legal', due: 3, done: false },
        { text: 'Build the cost comparison for Ana Sørensen', due: 5, done: false },
        { text: 'Schedule pilot expansion review before quarter end', due: 12, done: false }
      ]
    },
    {
      id: 'm2', title: 'Hallway debrief — Oscar Delacroix', recordedAt: day(-2, 16, 5),
      seconds: 62, companyId: 'c5', contactIds: ['p13'],
      transcript: [
        ['You', 'You mentioned the community launch is moving up?'],
        ['Oscar', 'Yeah, we pulled it forward two weeks. Nadia wants a co-authored post to go out the same morning.'],
        ['You', 'We can do that. Who writes the first draft?'],
        ['Oscar', 'Give us the technical section and we will wrap the narrative around it.']
      ],
      entities: { people: ['Oscar Delacroix', 'Nadia Petrov'], companies: ['Bramble & Co.'], dates: ['Two weeks earlier'] },
      actions: [
        { text: 'Draft technical section for the Bramble launch post', due: 4, done: false },
        { text: 'Confirm the new launch date with Nadia Petrov', due: 2, done: false }
      ]
    },
    {
      id: 'm3', title: 'Post-call notes — Calderon security', recordedAt: day(-9, 10, 0),
      seconds: 78, companyId: 'c10', contactIds: ['p27', 'p26'],
      transcript: [
        ['You', 'Ingrid walked through the remaining findings on the security review.'],
        ['Ingrid', 'Two mediums, no criticals. I can sign off once the key rotation policy is documented.'],
        ['You', 'That exists — I just have not sent it. I will get it over today.']
      ],
      entities: { people: ['Ingrid Nyström', 'Rafael Nunes'], companies: ['Calderon Grid'], dates: ['Today'] },
      actions: [{ text: 'Send key rotation policy to Ingrid Nyström', due: 1, done: false }]
    },
    {
      id: 'm4', title: 'Dinner recap — Novara team', recordedAt: day(-6, 21, 40),
      seconds: 118, companyId: 'c1', contactIds: ['p1', 'p2'],
      transcript: [
        ['You', 'Dev spent most of dinner on the migration path rather than the commercial side.'],
        ['Dev', 'Because that is what will kill it. If we cannot dual-run for a month, operations will veto it.'],
        ['You', 'Dual-run is supported. I will send the runbook.']
      ],
      entities: { people: ['Dev Raghunathan', 'Marisol Okonjo'], companies: ['Novara Labs'], dates: ['One month dual-run'] },
      actions: [{ text: 'Send dual-run migration runbook to Dev Raghunathan', due: 2, done: false }]
    },
    {
      id: 'm5', title: 'Grid Forum — Yara Haddad', recordedAt: day(-12, 14, 15),
      seconds: 87, companyId: 'c2', contactIds: ['p5'],
      transcript: [
        ['Yara', 'The expansion depends on whether you can handle our western region volume.'],
        ['You', 'What does that look like in numbers?'],
        ['Yara', 'Roughly four times what we run today, and the peaks are ugly.']
      ],
      entities: { people: ['Yara Haddad'], companies: ['Terrafirma Energy'], dates: [] },
      actions: [{ text: 'Model 4x western region volume for Terrafirma', due: 6, done: false }]
    },
    {
      id: 'm6', title: 'Quick note — Ridgeline pricing', recordedAt: day(-13, 15, 30),
      seconds: 41, companyId: 'c9', contactIds: ['p23'],
      transcript: [
        ['You', 'Jonas is sold on the product but the per-robot pricing does not work at their scale. He suggested a platform fee with volume tiers.']
      ],
      entities: { people: ['Jonas Weber'], companies: ['Ridgeline Robotics'], dates: [] },
      actions: [{ text: 'Draft platform-fee pricing option for Ridgeline', due: 7, done: false }]
    },
    {
      id: 'm7', title: 'Verdance pilot readout', recordedAt: day(-5, 11, 10),
      seconds: 103, companyId: 'c14', contactIds: ['p36', 'p38'],
      transcript: [
        ['Imani', 'The pilot numbers are good enough that I am taking this to the board in November.'],
        ['You', 'What do you need from us for that?'],
        ['Imani', 'A one-page summary with the trial turnaround improvement, and a reference we can call.']
      ],
      entities: { people: ['Dr. Imani Cole', 'Neve Ballantyne'], companies: ['Verdance Bio'], dates: ['November board meeting'] },
      actions: [
        { text: 'Write one-page pilot summary for Verdance board', due: 9, done: false },
        { text: 'Line up a reference customer call', due: 14, done: false }
      ]
    },
    {
      id: 'm8', title: 'Meridian — renewal temperature', recordedAt: day(-25, 9, 45),
      seconds: 56, companyId: 'c12', contactIds: ['p33'],
      transcript: [
        ['Wesley', 'Renewal is on autopilot unless someone senior asks a question. Solomon has not been in a room with us since spring.'],
        ['You', 'Then we should get in a room before the paperwork does.']
      ],
      entities: { people: ['Wesley Turnbull', 'Solomon Reyes'], companies: ['Meridian Payments'], dates: ['Spring'] },
      actions: [{ text: 'Book an executive touchpoint with Solomon Reyes', due: 10, done: false }]
    }
  ];

  /* ======================================================================
     Business-card fixtures for the scan demo
     Card art is inline SVG so there are no binary assets to load.
     ====================================================================== */
  function cardArt(opts) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${opts.bg1}"/><stop offset="1" stop-color="${opts.bg2}"/>
      </linearGradient></defs>
      <rect width="340" height="200" rx="10" fill="url(#g)"/>
      <circle cx="300" cy="34" r="14" fill="${opts.mark}" opacity=".9"/>
      <rect x="24" y="46" width="150" height="13" rx="3" fill="${opts.ink}" opacity=".92"/>
      <rect x="24" y="68" width="112" height="8"  rx="3" fill="${opts.ink}" opacity=".55"/>
      <rect x="24" y="104" width="96"  height="7" rx="3" fill="${opts.ink}" opacity=".38"/>
      <rect x="24" y="120" width="132" height="7" rx="3" fill="${opts.ink}" opacity=".38"/>
      <rect x="24" y="136" width="84"  height="7" rx="3" fill="${opts.ink}" opacity=".38"/>
      <rect x="24" y="164" width="60"  height="6" rx="3" fill="${opts.mark}" opacity=".7"/>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  const cardFixtures = [
    {
      id: 'card1',
      art: cardArt({ bg1: '#FFFFFF', bg2: '#F1E8DD', ink: '#1C1917', mark: '#B8472E' }),
      fields: [
        { key: 'name',    label: 'Full name', value: 'Priyanka Sethi',              conf: 98 },
        { key: 'title',   label: 'Title',     value: 'Robotics Lead',               conf: 96 },
        { key: 'company', label: 'Company',   value: 'Ridgeline Robotics',          conf: 99 },
        { key: 'email',   label: 'Email',     value: 'p.sethi@ridgelinerobotics.com', conf: 94 },
        { key: 'phone',   label: 'Phone',     value: '+1 (412) 555-0148',           conf: 88 },
        { key: 'website', label: 'Website',   value: 'ridgelinerobotics.com',       conf: 97 }
      ],
      companyId: 'c9'
    },
    {
      id: 'card2',
      art: cardArt({ bg1: '#1C1917', bg2: '#33291F', ink: '#FAF6F1', mark: '#E8A87C' }),
      fields: [
        { key: 'name',    label: 'Full name', value: 'Hollis Marchetti',        conf: 97 },
        { key: 'title',   label: 'Title',     value: 'Director of Alliances',   conf: 91 },
        { key: 'company', label: 'Company',   value: 'Anvil Freightworks',      conf: 95 },
        { key: 'email',   label: 'Email',     value: 'hollis@anvilfreight.co',  conf: 93 },
        { key: 'phone',   label: 'Phone',     value: '+1 (206) 555-0192',       conf: 79 },
        { key: 'website', label: 'Website',   value: 'anvilfreight.co',         conf: 96 }
      ],
      companyId: null
    },
    {
      id: 'card3',
      art: cardArt({ bg1: '#F7F3EE', bg2: '#E4EFEA', ink: '#1C1917', mark: '#2E7D6B' }),
      fields: [
        { key: 'name',    label: 'Full name', value: 'Beatriz Salgado',          conf: 99 },
        { key: 'title',   label: 'Title',     value: 'VP Strategy',              conf: 98 },
        { key: 'company', label: 'Company',   value: 'Calderon Grid',            conf: 99 },
        { key: 'email',   label: 'Email',     value: 'b.salgado@caldergrid.com', conf: 85 },
        { key: 'phone',   label: 'Phone',     value: '+1 (602) 555-0117',        conf: 90 },
        { key: 'website', label: 'Website',   value: 'caldergrid.com',           conf: 94 }
      ],
      companyId: 'c10'
    }
  ];

  /* ======================================================================
     Agent activity feed
     ====================================================================== */
  const activity = [
    { at: day(0, 8, 12),   kind: 'draft',  text: 'Drafted a follow-up to Marisol Okonjo about the SOC 2 report.' },
    { at: day(0, 7, 45),   kind: 'flag',   text: 'Flagged 3 dormant partnerships — Meridian, Wren & Sparrow, Aperture.' },
    { at: day(-1, 17, 30), kind: 'brief',  text: 'Prepared pre-meeting briefs for tomorrow’s 3 calls.' },
    { at: day(-1, 11, 2),  kind: 'scan',   text: 'Added Adaeze Nwosu from a scanned card at the Cobalt Harbor webinar.' },
    { at: day(-2, 16, 20), kind: 'voice',  text: 'Extracted 2 action items from “Hallway debrief — Oscar Delacroix”.' },
    { at: day(-2, 9, 5),   kind: 'link',   text: 'Linked Beatriz Salgado to Calderon Grid — matched on domain.' },
    { at: day(-3, 11, 40), kind: 'voice',  text: 'Extracted 3 action items from the Marisol Okonjo booth conversation.' },
    { at: day(-4, 14, 55), kind: 'flag',   text: 'Terrafirma expansion has no next step scheduled.' },
    { at: day(-5, 12, 10), kind: 'brief',  text: 'Summarised the Verdance pilot readout for the partnership log.' },
    { at: day(-6, 22, 15), kind: 'voice',  text: 'Captured a dinner recap with the Novara team.' },
    { at: day(-7, 10, 30), kind: 'scan',   text: 'Merged a duplicate record for Greta Halvorsen.' },
    { at: day(-9, 10, 20), kind: 'draft',  text: 'Drafted the key rotation policy email to Ingrid Nyström.' }
  ];

  /* ======================================================================
     Mutation helpers — features write through these so listeners stay synced
     ====================================================================== */
  const listeners = [];

  const api = {
    today: TODAY,
    day: day,
    companies: companies,
    contacts: contacts,
    events: events,
    memos: memos,
    cardFixtures: cardFixtures,
    activity: activity,
    eventTypes: EVENT_TYPES,
    owners: ['Elena Ruiz', 'Marcus Dane', 'Priya Raman'],
    categories: ['Fintech', 'Climate', 'DevTools', 'Health', 'Logistics'],
    stages: ['Prospect', 'Intro', 'Evaluating', 'Pilot', 'Signed'],

    company: (id) => companies.find((c) => c.id === id),
    contact: (id) => contacts.find((p) => p.id === id),

    contactsOf: (companyId) => contacts.filter((p) => p.companyId === companyId),
    eventsOf: (companyId) => events.filter((e) => e.companyId === companyId),
    memosOf: (companyId) => memos.filter((m) => m.companyId === companyId),

    on: (fn) => listeners.push(fn),
    emit: function (type, payload) {
      listeners.forEach((fn) => fn(type, payload));
    },

    /** Add a contact captured by the scan feature. */
    addContact: function (c) {
      const id = 'p' + (contacts.length + 1);
      let companyId = c.companyId;
      if (!companyId) {
        const match = companies.find(
          (co) => co.name.toLowerCase() === String(c.company).toLowerCase());
        companyId = match ? match.id : null;
      }
      const rec = Object.assign({
        id: id, source: 'scan', tags: ['new'], warmth: 30,
        lastTouch: new Date(), metOn: new Date(), metAt: 'Scanned card',
        nextAction: 'Send a follow-up note', notes: '', companyId: companyId
      }, c, { id: id, companyId: companyId });
      contacts.unshift(rec);
      if (companyId) {
        const co = api.company(companyId);
        if (co && co.contactIds.indexOf(id) === -1) co.contactIds.push(id);
      }
      activity.unshift({
        at: new Date(), kind: 'scan',
        text: `Added ${rec.name} from a scanned business card.`
      });
      api.emit('contact:add', rec);
      return rec;
    },

    /** Turn a voice action item into a calendar event. */
    addEvent: function (ev) {
      const rec = Object.assign({
        id: 'e' + (events.length + 1),
        type: 'followup', minutes: 30, location: 'Video call',
        attendeeIds: [], brief: 'Created from a voice memo action item.'
      }, ev);
      if (!rec.end) rec.end = new Date(rec.start.getTime() + rec.minutes * 60000);
      if (rec.companyId) rec.company = (api.company(rec.companyId) || {}).name;
      events.push(rec);
      activity.unshift({
        at: new Date(), kind: 'draft',
        text: `Scheduled “${rec.title}” from a voice memo action item.`
      });
      api.emit('event:add', rec);
      return rec;
    }
  };

  window.SEDONA = api;
}());
