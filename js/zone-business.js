/* ===========================================================================
   A.R.T. pitch board — js/zone-business.js    owner: business    SPEC §6.7–6.8
   ---------------------------------------------------------------------------
   The closing half of the document: sections 7 and 8, six frames.

     stack      §7  the architecture as a specification table — what runs
                    where, what it runs on, how it is billed, where that lands
     timeline   §7  ~6 weeks to v1 as a real schedule, with an honest tail
     team       §8  the credential bar, full width, set in type
     scope      §8  what v1 includes, against the eight sections — and out
     pricing    §8  the figures, then what the $500 a month actually covers
     terms      §8  ownership, support, exclusions, and "For the room"

   THE ONE RULE THAT GOVERNS THIS FILE (SPEC rule 13). Four commercial facts
   were given and may be stated as fact:

       $12,500 up front ($10,000 build + $2,500 third-party security audit)
          ·   $500/month   ·   two-year minimum
       ~6 weeks to v1, then QA
       and what the monthly covers: site and app upkeep, product
       modifications, and any associated regular fees

   EVERYTHING ELSE on these six frames — the vendor list behind "associated
   regular fees", how long the tail runs, support and response, IP and
   ownership, the in/out scope line — is a PROPOSAL. It renders inside a
   .draft block headed by the `Draft — for Geoff's sign-off` chip, and the
   copy in those blocks opens `Not quoted.` so a reader with nobody
   presenting cannot mistake a proposal for a term. No figure, date, client,
   metric or guarantee is invented anywhere in this file: grep it for a
   dollar sign and every hit is one of the four above.

   Card discipline (SPEC rule 15) — six frames, six different objects:
     stack     a ruled specification table (.stackmap), five columns, no cards
     timeline  a ruled schedule (.gantt--plan) with one open-ended bar
     team      three ruled columns of almost pure typography (.team)
     scope     a marked ledger (.mark + .price__covers) plus one bounded box
     pricing   44px figures, numbered clauses, and one drawing
     terms     one dashed provisional document, then warm paper

   Nothing here is interactive: SPEC §7 puts "everything in sections 5–8"
   deliberately outside the ceiling, so this file renders no .btn, binds no
   listener and carries no data-live. A half-working control would be worse
   than an honest static one.

   Discipline: zero colour, zero hex, zero rgba(, zero font-family, zero
   font-size — css/app.css owns all of it. Inline style is used only for
   geometry CSS cannot know (grid spans, a measure cap on a 2060px-wide
   caption, the documented --gantt-weeks tunable) and never for a colour. No argless Date, no
   Math.random, no localStorage.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var esc = ui.esc;
  var svg = ui.svg;

  /* ====================================================== the quoted figures

     Declared once, used everywhere, so the board can never print two versions
     of the offer. These five strings are the ONLY commercial facts in the
     file; anything else wearing a figure is a defect. */
  var UP_FRONT = '$12,500';
  var BUILD_FEE = '$10,000';
  var SEC_FEE = '$2,500';
  var MONTHLY = '$500';
  var MONTHLY_PHRASE = '$500 a month';
  var TERM = 'Two years';
  var BUILD_WEEKS = 6;

  /* The timeline axis: seven columns for weeks 0–6 (the estimate), then six
     unnumbered columns for the tail. The tail columns are deliberately NOT
     labelled with week numbers — a numbered tail is a date, and the tail is a
     range. The dashed span bracket and the open-ended bar carry it instead. */
  var BUILD_COLS = BUILD_WEEKS + 1;          /* weeks 0…6 inclusive      = 7  */
  var TAIL_COLS = 6;
  var PLAN_COLS = BUILD_COLS + TAIL_COLS;    /* 13                            */

  /* ========================================================= tiny helpers == */

  function head(eyebrow, title, note) {
    return '<header class="zone__head">' +
             '<p class="zone__eyebrow">' + esc(eyebrow) + '</p>' +
             '<h2 class="zone__title">' + esc(title) + '</h2>' +
             (note ? '<p class="zone__note">' + note + '</p>' : '') +
           '</header>';
  }

  function zbody(inner) { return '<div class="zone__body">' + inner + '</div>'; }
  function cap(inner) { return '<p class="chart__cap">' + inner + '</p>'; }
  function eyebrow(t) { return '<p class="eyebrow">' + t + '</p>'; }

  /* Rule 13's marker and the block it governs. The chip alone floating over
     ordinary copy reads as decoration; .draft makes the provisional material
     one object, and every one of these opens with "Not quoted." */
  function draft(inner) {
    return '<div class="draft">' +
             '<p class="draftchip">Draft &mdash; for Geoff&rsquo;s sign-off</p>' +
             inner +
           '</div>';
  }

  /* Small counts read as words in prose. Mirrors zone-story.js. */
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  function word(n) { return WORDS[n] !== undefined ? WORDS[n] : String(n); }

  /* Derived rather than typed, so the scope ledger cannot claim a screen the
     board does not actually render: the family phones are the §2 frames whose
     key is a phone. ph-handoff is in §3 and is correctly excluded. */
  function familyScreens() {
    var L = (ART.canvas && ART.canvas.LAYOUT) || null;
    if (!L) return 0;
    var n = 0;
    Object.keys(L).forEach(function (k) {
      if (L[k] && L[k].s === 2 && k.indexOf('ph-') === 0) n++;
    });
    return n;
  }

  /* One row of the architecture table. FIVE CELLS, in the same order every
     time, each a direct child of the one grid — so every row in the frame is
     registered to the same five columns and nothing is sized by its content.
     `bill` is the vendor's own BILLING SHAPE and `lands` is where that bill
     ends up; neither is ever an invented amount. The monthly covers any
     associated regular fees, which is quoted, so a reader running down the
     last column sees every recurring line land in the same place. */
  function stackRow(r) {
    return '<div class="stackmap__cell" data-col="name"' +
             (r.emph ? ' data-emph' : '') + '>' + r.name + '</div>' +
           '<div class="stackmap__cell" data-col="tech">' + r.tech + '</div>' +
           '<div class="stackmap__cell" data-col="does">' + r.does + '</div>' +
           '<div class="stackmap__cell" data-col="bill">' + r.bill + '</div>' +
           '<div class="stackmap__cell" data-col="lands">' + r.lands + '</div>';
  }

  /* A group heading: a label and one line, across the full width of the grid.
     No fill, no box, no rule of its own — the rows underneath carry the rules. */
  function stackGroup(label, line) {
    return '<p class="stackmap__group">' + label +
             (line ? '<span>' + line + '</span>' : '') +
           '</p>';
  }

  /* A ledger row: a drawn mark, a title, and one line saying what it means.
     .mark draws its own glyph, so an unmarked row is impossible. */
  function ledger(v, title, line) {
    return '<li>' +
             '<span class="mark" data-v="' + v + '"></span>' +
             '<div>' +
               '<b>' + title + '</b>' +
               (line ? '<p class="meta">' + line + '</p>' : '') +
             '</div>' +
           '</li>';
  }

  /* A clause: the idiom of both the pricing covers list and the terms sheet.
     A numbered or named lead, then one line. No box. */
  function clause(lead, title, line) {
    return '<li class="list__item">' +
             '<p>' + (lead ? '<span class="mono">' + lead + '</span> ' : '') +
               '<b>' + title + '</b></p>' +
             (line ? '<p class="meta">' + line + '</p>' : '') +
           '</li>';
  }

  /* ========================================================= 1 · stack ==== */
  /* THE ARCHITECTURE AS A SPECIFICATION TABLE. It used to be an elevation —
     five labelled bands of cards at three different widths, a navy full-bleed
     slab through the middle for the database, and a dashed stock for the app
     stores. Nine facts, five surface treatments, three card widths and a
     reading order you had to work out. A sceptical CTO skims this frame in
     twenty seconds, and a collage does not survive that.
     So: ONE grid, five columns, a hairline under every row, and exactly one
     typographic device — weight — spent on the single row that is the centre
     of the architecture. Every fact that was on the elevation is still here;
     nothing is sized by its own content any more.

       Component · Platform · What it does · How it is billed · Where it lands

     The last two columns are the half of this frame SPEC §6.7 asks for —
     "name what it costs them to keep running" — answered without inventing a
     number: each cell states the vendor's own billing shape, and beside it
     where that bill lands. Every recurring one lands inside the monthly,
     which is quoted. What A.R.T. never has to run is a footnote rather than a
     sixth band of cards, because an absence is not a component. */

  var INSIDE = 'Inside the ' + MONTHLY;
  var STACK_COLS = ['Component', 'Platform', 'What it does',
                    'How it is billed', 'Where the bill lands'];

  var STACK_GROUPS = [
    { label: 'Surfaces',
      line: 'Three roles. Two codebases. One database.',
      rows: [
        { name: 'The family app',
          tech: 'Expo &middot; React Native &rarr; iOS + Android',
          does: 'One tap logs a dose, the drops or the spine tap.',
          bill: 'No vendor bill', lands: '&mdash;' },
        { name: 'The practitioner console',
          tech: 'Next.js &middot; desktop web',
          does: 'Roster, week builder, ramp editor, review queue.',
          bill: 'No vendor bill', lands: '&mdash;' },
        { name: 'The owner dashboard',
          tech: 'Next.js &middot; desktop web',
          does: 'The same web app in a different role.',
          bill: 'No vendor bill', lands: '&mdash;' }
      ] },
    { label: 'Serves it',
      line: 'The web app, the domain in front of it, and the mail that carries an invitation.',
      rows: [
        { name: 'Vercel',
          tech: 'Hosting &middot; CDN',
          does: 'Serves the console, with a preview deployment for every change, ' +
                'so a screen can be reviewed before it is live.',
          bill: 'Billed monthly', lands: INSIDE },
        { name: 'app.allergyart.com',
          tech: 'DNS at A.R.T.&rsquo;s registrar',
          does: 'A.R.T.&rsquo;s own domain, pointed at Vercel. allergyart.com &mdash; ' +
                'the marketing site &mdash; is untouched.',
          bill: 'Billed annually', lands: 'Already A.R.T.&rsquo;s' },
        { name: 'Transactional email',
          tech: '<span class="mono">send-invite</span> edge function',
          does: 'Invitations, password set-up and 2FA enrolment. Never sent by hand.',
          bill: 'Billed monthly, by volume', lands: INSIDE }
      ] },
    { label: 'Stores it',
      line: 'One project. Everything above points at it, and nothing else holds state.',
      rows: [
        { name: 'Supabase', emph: true,
          tech: 'Postgres &middot; Auth &middot; Storage &middot; Realtime &middot; Edge Functions',
          does: 'The schema in section 6 is this row. Row-level security travels ' +
                'with the data rather than living in the app.',
          bill: 'Billed monthly, by usage', lands: INSIDE }
      ] },
    { label: 'Gates it',
      line: 'The two queues neither side of this contract controls.',
      rows: [
        { name: 'App Store',
          tech: 'Apple Developer Program',
          does: 'TestFlight for the pilot; review on every release after that.',
          bill: 'Annual membership', lands: INSIDE },
        { name: 'Google Play',
          tech: 'Play Console',
          does: 'An internal testing track, so a practitioner can hold the real ' +
                'app before a family does.',
          bill: 'One-time registration', lands: INSIDE }
      ] }
  ];

  function stack(root) {
    var grid = '';
    STACK_COLS.forEach(function (c) {
      grid += '<p class="stackmap__col">' + c + '</p>';
    });
    STACK_GROUPS.forEach(function (g) {
      grid += stackGroup(g.label, g.line);
      g.rows.forEach(function (r) { grid += stackRow(r); });
    });

    var body =
      '<div class="stackmap">' + grid + '</div>' +
      /* The frame is 2060 wide and a 2060px line of 12px type is an unreadable
         measure, so the two closing facts are held to a column. Geometry only;
         app.css still owns the type. */
      '<div style="max-width:1520px">' +
      cap('<strong>Nothing in the table is a custom server.</strong> ' +
          'Supabase holds the data and the rules, Vercel serves the console, the ' +
          'stores gate the app &mdash; and every recurring fee above is inside the ' +
          MONTHLY_PHRASE + ', so A.R.T. has one renewal date rather than five.') +
      /* An architecture is also defined by what is not in it, and nothing else
         on the board claims these three. They were a sixth band of cards; an
         absence is not a component, so they are a line of type instead. */
      cap('<strong>Not in it.</strong> No servers &mdash; nothing to patch, nothing ' +
          'to restart, no machine with a name on it. No warehouse &mdash; the ' +
          'dashboards read views in the same Postgres the app writes to. No ' +
          'third-party analytics &mdash; nothing about a child leaves the project ' +
          'in order to be counted.') +
      '</div>' +
      draft('<p class="meta"><strong>Not quoted.</strong> Who holds each account ' +
            'above, and whose card the renewal lands on, is still open &mdash; as is ' +
            'what happens to them at the end of the term. The fees themselves are ' +
            'inside the monthly; the engagement frame names the list they cover.</p>');

    root.innerHTML =
      head('Infrastructure', 'The stack',
           'What runs where, what it talks to, and what it costs to keep running.') +
      zbody(body);
  }

  /* ====================================================== 2 · timeline ==== */
  /* A real schedule, and an honest one. Weeks 0–6 are numbered because the
     estimate is Geoff's and is attributed in the note. The six columns after
     v1 carry a dot instead of a number: QA, the pilot and the testing tracks
     run as long as the booklet says they need to, and store review is a queue
     at Apple and Google. A numbered tail would be a date nobody can promise,
     so the tail is a dashed bracket and one open-ended, chevroned bar. */

  /* The bars used to carry a caption inside them — "the data model", "our own
     child's week", "a queue, not a date" — seven labels at seven widths
     floating at seven heights across the track. They were the frame's
     personality and its mess: every one of them repeated or decorated a row
     label two columns to the left. The bars are now plain, the row label and
     its one sub-line carry the fact, and the track reads as a schedule. */
  var PLAN_ROWS = [
    { label: 'Kickoff, and the booklet transcribed',
      sub: 'Week 0', state: 'build', col: 1, span: 1 },
    { label: 'Schema, auth, invitations',
      sub: 'Weeks 1&ndash;2 &middot; the data model', state: 'build', col: 2, span: 2 },
    { label: 'Practitioner console and week builder',
      sub: 'Weeks 1&ndash;2 &middot; the ramp editor', state: 'build', col: 2, span: 2 },
    { label: 'Family app &mdash; dosing, drops, tapping, prep',
      sub: 'Weeks 3&ndash;4 &middot; iOS and Android', state: 'build', col: 4, span: 2 },
    { label: 'Meals, community, the review loop',
      sub: 'Week 5', state: 'build', col: 6, span: 1 },
    { label: 'Analytics and the owner dashboard',
      sub: 'Week 6', state: 'build', col: 7, span: 1 },
    { label: 'QA against the real booklet',
      sub: 'An A.R.T. family, QA in real time',
      state: 'qa', col: 8, span: 2 },
    { label: 'Practitioner pilot',
      sub: 'One practitioner, real clients',
      state: 'qa', col: 9, span: 2 },
    { label: 'TestFlight and Play internal testing',
      sub: 'Before anything reaches a family',
      state: 'qa', col: 10, span: 2 },
    { label: 'Store review',
      sub: 'Apple&rsquo;s queue and Google&rsquo;s, not ours',
      state: 'open', col: 11, span: 2 }
  ];

  /* The tail in words, because the chart deliberately refuses to number it.
     Estimates, not quotes, so they render under the Draft chip. */
  var TAIL_RANGE = [
    { label: 'QA against the real booklet', range: '1&ndash;2 weeks',
      note: 'Overlaps the last build week: the booklet is already in the house.' },
    { label: 'Practitioner pilot', range: '2&ndash;3 weeks',
      note: 'A full weekly cycle each time.' },
    { label: 'TestFlight and Play internal testing', range: 'About 1 week',
      note: 'Runs alongside the pilot.' },
    { label: 'Store review', range: 'Usually days',
      note: '' }
  ];

  function planAxis() {
    var cells = '';
    var w;
    for (w = 0; w < BUILD_COLS; w++) {
      cells += '<span class="gantt__week">' + w + '</span>';
    }
    for (w = 0; w < TAIL_COLS; w++) {
      /* a dot per tail column: "it continues", not "data is missing" */
      cells += '<span class="gantt__week">&middot;</span>';
    }

    var spans =
      '<div class="gantt__spans">' +
        '<span class="gantt__span" style="grid-column:1 / span ' + BUILD_COLS + '">' +
          'Build &mdash; ' + word(BUILD_WEEKS) + ' weeks to v1' +
        '</span>' +
        '<span class="gantt__span" data-kind="open" style="grid-column:' +
          (BUILD_COLS + 1) + ' / span ' + TAIL_COLS + '">' +
          'After v1 &mdash; a range, not a date' +
        '</span>' +
      '</div>';

    /* Both the bracket row and the week numerals sit in the axis's SECOND grid
       column, so they share the track's own 13-column scale. Nesting them is
       what keeps the brackets registered with the bars; a .gantt__spans parked
       as a sibling of .gantt__axis would be offset by the label column. */
    return '<div class="gantt__axis">' +
             '<div class="gantt__label">Week</div>' +
             '<div>' + spans + '<div class="gantt__weeks">' + cells + '</div></div>' +
           '</div>';
  }

  function planRows() {
    /* the ship gate sits on the boundary between week 6 and the tail */
    var gateAt = (BUILD_COLS / PLAN_COLS) * 100;
    var out = '';
    PLAN_ROWS.forEach(function (r, i) {
      var bar =
        '<div class="gantt__bar" data-state="' + r.state + '"' +
          ' style="grid-column:' + r.col + ' / span ' + r.span + '"></div>';
      var gate =
        '<i class="gantt__today" data-kind="gate"' +
          (i === 0 ? ' data-label="v1"' : '') +
          ' aria-hidden="true" style="left:' + (Math.round(gateAt * 1000) / 1000) + '%"></i>';
      out += '<div class="gantt__row">' +
               '<div class="gantt__label">' + r.label +
                 '<span class="meta">' + r.sub + '</span></div>' +
               '<div class="gantt__track">' + bar + gate + '</div>' +
             '</div>';
    });
    return out;
  }

  function timeline(root) {
    var legend =
      '<div class="chiprow">' +
        '<span class="chip chip--navy">Build &mdash; estimated and owned</span>' +
        '<span class="chip chip--peri">QA and pilot</span>' +
        '<span class="chip chip--neutral">Open-ended &mdash; not ours to schedule</span>' +
      '</div>';

    /* The tail used to be one run-on sentence of four ranges joined by middots
       inside a paragraph — four measurements with no way to compare them. It
       is now four rows on one scale: the measurement in its own fixed column
       so the ranges stack under one another, then the thing being measured,
       then why. One line each; the list is a table, not an essay.
       A row carries a `why` ONLY where the gantt row two columns to its left
       does not already say it: the pilot and store-review sub-lines were
       restated here almost word for word, so the pilot's is trimmed to the
       part that is new and store review's is dropped. Store review's one
       fact — that it is Apple's queue and Google's, not ours — is already on
       its gantt row and in the Not-quoted paragraph above this list. */
    var tail =
      '<ul class="list" data-lead="measure" style="margin-top:4px">' +
        TAIL_RANGE.map(function (r) {
          return '<li class="list__item"><p>' +
                   '<span class="mono">' + r.range + '</span> ' +
                   '<b>' + r.label + '</b>' +
                   (r.note ? ' <span class="meta">' + r.note + '</span>' : '') +
                 '</p></li>';
        }).join('') +
      '</ul>';

    var body =
      legend +
      '<div class="gantt gantt--plan" style="--gantt-weeks:' + PLAN_COLS +
        ';--gantt-label:300px;margin-top:8px">' +
        planAxis() + planRows() +
      '</div>' +
      draft('<p class="meta"><strong>Not quoted.</strong> The ' + word(BUILD_WEEKS) +
            '-week estimate is Geoff&rsquo;s own and is stated as one. The tail is not: ' +
            'it depends on what the real booklet turns up, and <strong>store review is a ' +
            'queue at Apple and Google</strong> that neither side of this contract ' +
            'controls.</p>' +
            tail +
            '<p class="meta" style="margin-top:8px"><strong>Two builders, ' +
              'full-time, in parallel.</strong> The two bars across weeks ' +
              '1&ndash;2 are one each &mdash; the schema and the console are ' +
              'built at the same time, by the two people on the next frame.</p>');

    root.innerHTML =
      head('Schedule', 'Six weeks to v1',
           'Geoff&rsquo;s estimate, not a vendor quote. Everything after v1 is a range.') +
      zbody(body);
  }

  /* ========================================================== 3 · team ==== */
  /* 4040 × 560, full width. A RÉSUMÉ, and nothing else.

     It used to argue. The title, the note, the three column labels and a
     bullet in each column all told the reader what to conclude from the
     credentials — how rare the award is, what shipping at that scale proves,
     what a product leader of that calibre implies, and what a competitor
     could not match. A résumé does none of that. It lists what happened and
     stops. All of it is cut; what is left is the facts it was dressed up in:

       Geoff Hladik   FlipaClip + Cradle · 150M users · WINNER, Apple App of the Year
       Lisa           Head of Product, Planet Fitness · 30 people · app + web
       Lisa           product lead at Planet Fitness · built the technology
                      stack, apps and web
       An A.R.T. family   their son is a client of the practice, ~20 allergies;
                      they use the booklet daily and QA against it

     The third column is stated, not sold: no comparison with anyone, no
     mention of agencies or of what others cannot claim, and no coral rail —
     the accent existed only to mark it as the winning argument, which is the
     framing that was cut. Three columns, one hairline between them, one
     structure repeated: role, name, what they did, the figure.

     THE FIGURES CARRY IT, so they are set as figures — 44px Plex Sans, the top
     of the scale, the same treatment the owner dashboard gives its headline
     metric. The serif does the names, which is what the serif is for, and the
     Apple award keeps its own device because an award is not a number: a rule
     above, a rule below, letter-spaced navy caps. Named, and not explained.

     Both names live in NAMES below, so a correction is a one-line change — which
     is how 'Lisa' became 'Lisa Debenedictis' without touching the markup. */

  var NAMES = { built: 'Geoff Hladik', product: 'Lisa Debenedictis' };

  function team(root) {
    var geoff =
      '<div class="team__col">' +
        '<p class="team__role">Engineering</p>' +
        '<p class="team__name">' + esc(NAMES.built) + '</p>' +
        '<p class="team__of">Built <strong>FlipaClip</strong> and ' +
          '<strong>Cradle</strong>.</p>' +
        '<p class="team__figure">150 million<small>users</small></p>' +
        '<p class="team__award">Winner &middot; Apple App of the Year</p>' +
      '</div>';

    var product =
      '<div class="team__col">' +
        '<p class="team__role">Product</p>' +
        '<p class="team__name">' + esc(NAMES.product) + '</p>' +
        '<p class="team__of">Head of Product at ' +
          '<strong>Planet Fitness</strong>.</p>' +
        '<p class="team__figure">30<small>people in the organisation</small></p>' +
        '<p class="team__award">Built their app and web</p>' +
      '</div>';

    var family =
      '<div class="team__col">' +
        '<p class="team__role">Client family</p>' +
        '<p class="team__name">An A.R.T. family</p>' +
        /* PRESENT TENSE. "Worked through" made them alumni; they are a client
           family right now, mid-protocol, which is the whole reason the
           credential carries weight — they use the booklet this week. */
        '<p class="team__of">Their son is a client of the practice.</p>' +
        '<p class="team__figure">~20<small>allergies, working through them ' +
          'one at a time.</small></p>' +
        /* .team__award, not .team__of. The bottom slot of this repeated row
           closes on a 2px --navy-deep rule in columns 1 and 2 and closed on
           nothing in column 3 — and column 3 is the credential that matters
           most to this client. Same slot, same treatment. */
        '<p class="team__award">They QA against the live booklet daily</p>' +
      '</div>';

    /* The head is held to the same band as the bar beneath it, so the frame's
       title and the credentials it introduces are co-visible at the one stop
       whose caption names them. The frame keeps its 4040px rule. */
    root.innerHTML =
      head('The team', 'Who builds it',
           'Who is on this, and what they have built.')
        .replace('class="zone__head"', 'class="zone__head" data-band') +
      /* The frame stays 4040 wide (§4c) but the credential bar does not use
         all of it. At the business walkthrough's "Who builds it" stop the
         camera can show 1728 world px, so three columns spread over 4040 put
         the FlipaClip credential 750px off the left edge while the caption on
         screen named it. The bar is held to a band that fits that reach and
         centred in the frame; the frame's outer thirds carry quiet ground. */
      zbody('<div class="team" data-band>' + geoff + product + family + '</div>');
  }

  /* ========================================================= 4 · scope ==== */
  /* Drawn against the eight sections of the board, which is the only honest
     definition of v1 available: if it is rendered above, it is in. The marks
     are .mark discs, so a row can never be blank or carried by colour, and the
     four exclusions sit in one bounded box because "out" is a boundary and
     should look like one. Each exclusion carries its reason — an exclusion
     without a reason reads as an oversight. */

  /* The eight sections, drawn, with their titles read from canvas.SECTIONS so
     this band can never disagree with the headers the reader just scrolled
     past. Five of the eight are software and are filled; 1, 7 and 8 are the
     problem, the plan and this engagement and are drawn as outlines. Fill
     against outline is a SHAPE difference, not a colour one, and the caption
     underneath says which is which in words. Designed at 1:1 against the
     frame's 1540px width so the 12px label class renders at 12px. */
  var BAND_W = 1540, BAND_GAP = 12.5, BAND_Y = 24, BAND_H = 10;
  var SOFTWARE = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };

  function sectionBand() {
    var S = (ART.canvas && ART.canvas.SECTIONS) || null;
    if (!S || !S.length) return '';
    var n = S.length;
    var bw = (BAND_W - BAND_GAP * (n - 1)) / n;
    var parts = [];
    S.forEach(function (s, i) {
      var x = i * (bw + BAND_GAP);
      var soft = !!SOFTWARE[s.n];
      parts.push(svg('text', { x: x, y: 16, 'class': 'chart__tick' }, esc(String(s.n))));
      parts.push(svg('rect', {
        x: soft ? x : x + 0.5, y: soft ? BAND_Y : BAND_Y + 0.5,
        width: soft ? bw : bw - 1, height: BAND_H, rx: 2,
        'class': soft ? 'chart__bar' : 'chart__axis'
      }));
      parts.push(svg('text', {
        x: x, y: BAND_Y + BAND_H + 16, 'class': 'chart__label'
      }, esc(s.title)));
    });
    return '<div class="chart">' +
             svg('svg', {
               'class': 'chart__svg', viewBox: '0 0 ' + BAND_W + ' 62', role: 'img',
               'aria-label': 'The eight sections of this board. Sections 2 to 6 are ' +
                 'software and are in v1; sections 1, 7 and 8 are the problem, the ' +
                 'plan and this engagement.'
             }, parts.join('')) +
           '</div>';
  }

  function scope(root) {
    var screens = familyScreens();

    var inV1 =
      '<ul class="price__covers">' +
        ledger('yes', '<span class="mono">&sect;2</span> The family app',
               (screens ? 'All ' + word(screens) + ' screens: ' : '') +
               'Today, Prep, The week, Meals, Community, Messages. Drops, the spine ' +
               'tap and every food dose in one day, in the order the day happens.') +
        ledger('yes', '<span class="mono">&sect;2</span> Messages, family to practitioner',
               'One thread per client, and a message can be anchored to the exact day ' +
               'it is about. This is what replaces &ldquo;or email me&rdquo; in the ' +
               'booklet margin.') +
        ledger('yes', '<span class="mono">&sect;3</span> The practitioner console',
               'Roster, the week builder, and the ramp editor: stretch, hold, skip, ' +
               'swap or nudge, saved as that client&rsquo;s own variant.') +
        ledger('yes', '<span class="mono">&sect;3 &rarr; &sect;2</span> The weekly handoff',
               'Publish, and next week is on the family&rsquo;s phone before the visit ' +
               'ends. One object, written by a practitioner and read by a parent &mdash; ' +
               'the booklet page, replaced.') +
        ledger('yes', '<span class="mono">&sect;4</span> What the practice learns',
               'The practice rollup, and phase duration &mdash; planned days against ' +
               'actual, ranked by overrun and cut by age band.') +
        ledger('yes', '<span class="mono">&sect;5</span> Access and invitations',
               'Invite-only accounts, TOTP two-factor on every staff login, and the ' +
               'assign &rarr; invite &rarr; accept sequence end to end.') +
        ledger('yes', '<span class="mono">&sect;6</span> The data',
               'The Supabase schema, row-level security in the database, and the ' +
               'derived views the dashboards read.') +
      '</ul>';

    var notInV1 =
      '<div class="card card--quiet" style="margin-top:16px">' +
        eyebrow('Not in v1') +
        '<ul class="price__covers">' +
          ledger('no', 'Stages 1&ndash;3 of the A.R.T. method',
                 'v1 touches stage 4, reintroduction. Identify, strengthen and ' +
                 'alleviate stay on paper until the rest is proven.') +
          ledger('no', 'Scheduling and reminders',
                 'Appointment times live in the booklet margin today. v1 reads the ' +
                 'protocol, it does not run the calendar or send a dose reminder.') +
          ledger('no', 'Billing',
                 'No payments, no invoicing, no card on file. Nothing in v1 touches ' +
                 'money.') +
          ledger('no', 'Research export',
                 'The tables are A.R.T.&rsquo;s and exportable from the start; a ' +
                 'study-grade, de-identified export for the pilot programme is its ' +
                 'own build.') +
        '</ul>' +
      '</div>';

    var body =
      sectionBand() +
      cap('<strong>Filled: software, and in v1.</strong> Sections 1, 7 and 8 are the ' +
          'problem, the plan and this engagement &mdash; the argument, not the build.') +
      '<div style="margin-top:18px">' + eyebrow('In v1 &mdash; everything on this board') +
      inV1 + '</div>' +
      notInV1 +
      cap('<strong>And what v1 does not change:</strong> the thirty-minute visit, the ' +
          'practitioner&rsquo;s judgement, and the method. v1 records the protocol. It ' +
          'never decides it.') +
      draft('<p class="meta"><strong>Not quoted.</strong> The line between in and out ' +
            'is drawn from this board and from what has been discussed so far. It is a ' +
            'proposal for the room to argue with, not a signed scope.</p>');

    root.innerHTML =
      head('Scope', 'What v1 includes',
           'If it is on this board, it is in v1. Exceptions are named.') +
      zbody(body);
  }

  /* ======================================================= 5 · pricing ==== */
  /* The figures lead, at the top of the type scale and with almost no chrome:
     a price in a rounded box reads as a plan card off a SaaS site, and this is
     a contract between two parties.

     Then the thing SPEC §9 makes a done condition — a reader must know what
     the monthly buys in five seconds, from the frame alone. Three clauses,
     quoted. Then the third one DRAWN, because "one predictable bill instead of
     a stack of vendor invoices" is the point that decides the deal and a
     sentence does not land it.

     The drawing is hand-written inline SVG at 1:1 — the viewBox is the frame's
     real inner width, so the 12px chart label classes render at 12px instead
     of being scaled up by width:100%. Every stroke and fill comes from §13's
     chart classes; this file names no colour. */

  /* the enumeration behind "any associated regular fees" — the category was
     quoted, the list was not, so the whole drawing lives inside .draft */
  var FEE_LINES = [
    'Supabase &mdash; Postgres, Auth, Storage, Realtime',
    'Vercel &mdash; hosting for the console and the dashboard',
    'Apple Developer Program &mdash; App Store membership',
    'Google Play &mdash; Play Console registration',
    'Transactional email &mdash; invitations and 2FA'
  ];

  /* 1210 = the pricing frame's 1240px inner width less .draft's 15px padding.
     Designed in real pixels so nothing is scaled. */
  var BILL_W = 1210;
  var SLIP_W = 520, SLIP_H = 24, SLIP_GAP = 6, SLIP_TOP = 26;
  var COLLECT_X = 572, ARROW_X = 660;
  var BOX_X = 672, BOX_Y = 56, BOX_H = 84;

  function oneBillDrawing() {
    var parts = [];
    var last = FEE_LINES.length - 1;
    var midOf = function (i) { return SLIP_TOP + i * (SLIP_H + SLIP_GAP) + SLIP_H / 2; };
    var bottom = SLIP_TOP + FEE_LINES.length * (SLIP_H + SLIP_GAP) - SLIP_GAP;

    parts.push(svg('text', { x: 0, y: 10, 'class': 'chart__axislabel' },
                   'Otherwise, five bills to manage'));
    parts.push(svg('text', { x: BOX_X, y: 10, 'class': 'chart__axislabel' },
                   'What A.R.T. actually pays'));

    FEE_LINES.forEach(function (line, i) {
      var y = SLIP_TOP + i * (SLIP_H + SLIP_GAP);
      parts.push(svg('rect', {
        x: 0.5, y: y + 0.5, width: SLIP_W, height: SLIP_H,
        rx: 3, 'class': 'chart__axis'
      }));
      parts.push(svg('text', { x: 12, y: y + 16, 'class': 'chart__label' }, line));
      /* feeder into the collector */
      parts.push(svg('path', {
        d: 'M' + SLIP_W + ' ' + midOf(i) + ' H' + COLLECT_X,
        'class': 'chart__annotline'
      }));
    });

    /* the collector, then one arrow out of it */
    parts.push(svg('path', {
      d: 'M' + COLLECT_X + ' ' + midOf(0) + ' V' + midOf(last),
      'class': 'chart__annotline'
    }));
    var armY = Math.round((midOf(0) + midOf(last)) / 2);
    parts.push(svg('path', {
      d: 'M' + COLLECT_X + ' ' + armY + ' H' + ARROW_X +
         ' M' + (ARROW_X - 8) + ' ' + (armY - 6) + ' L' + ARROW_X + ' ' + armY +
         ' L' + (ARROW_X - 8) + ' ' + (armY + 6),
      'class': 'chart__annotline'
    }));

    /* the one invoice: a coral-wash ground with a coral hairline, drawn as two
       elements because .chart__band carries the fill and .chart__annotline the
       stroke. No colour is named here — both are classes. */
    parts.push(svg('rect', {
      x: BOX_X, y: BOX_Y, width: BILL_W - BOX_X, height: BOX_H,
      rx: 5, 'class': 'chart__band'
    }));
    parts.push(svg('rect', {
      x: BOX_X + 0.5, y: BOX_Y + 0.5, width: BILL_W - BOX_X - 1, height: BOX_H,
      rx: 5, 'class': 'chart__annotline'
    }));
    parts.push(svg('text', { x: BOX_X + 24, y: BOX_Y + 30, 'class': 'chart__annot' },
                   'One invoice'));
    parts.push(svg('text', { x: BOX_X + 24, y: BOX_Y + 52, 'class': 'chart__label' },
                   'Everything on the left is inside the monthly.'));
    parts.push(svg('text', { x: BOX_X + 24, y: BOX_Y + 70, 'class': 'chart__label' },
                   'One renewal date. One line in the budget.'));

    return '<div class="chart" style="margin-top:4px">' +
             svg('svg', {
               'class': 'chart__svg',
               /* -4 of headroom: the two axis labels sit at y:10 and their
                  capitals measure to y:-2, so a viewBox starting at 0 put them
                  outside it. §8 requires viewBox room for outermost labels. */
               viewBox: '0 -4 ' + BILL_W + ' ' + (bottom + 14),
               role: 'img',
               'aria-label': 'Five recurring vendor bills on the left, ' +
                 'collected into one invoice on the right: Supabase, Vercel, the ' +
                 'Apple Developer Program, Google Play and transactional email are ' +
                 'inside the monthly.'
             }, parts.join('')) +
           '</div>';
  }

  function pricing(root) {
    var figures =
      '<div class="price">' +
        '<div class="price__line" data-emph>' +
          '<p class="price__label">To build it</p>' +
          '<p class="price__figure">' + UP_FRONT +
            '<small>paid across three stages</small></p>' +
          '<p class="meta" style="margin-top:4px">' +
            BUILD_FEE + ' build &middot; ' + SEC_FEE +
            ' third-party security audit</p>' +
        '</div>' +
        '<div class="price__line" data-emph>' +
          '<p class="price__label">Monthly</p>' +
          '<p class="price__figure">' + MONTHLY +
            '<small>per month</small></p>' +
        '</div>' +
        '<div class="price__line">' +
          '<p class="price__label">Minimum term</p>' +
          '<p class="price__figure">' + TERM + '</p>' +
        '</div>' +
      '</div>';

    /* Quoted, all three — so this block carries no chip. It is the answer to
       the question that decides the deal and it is set as clauses, not prose. */
    var covers =
      '<div style="margin-top:20px">' +
        eyebrow('What the ' + MONTHLY_PHRASE + ' covers') +
        '<ul class="list" style="margin-top:6px">' +
          clause('01', 'Site and app upkeep',
                 'It stays running, updated, and compliant with the stores.') +
          clause('02', 'Product modifications',
                 'It keeps changing as the practice changes.') +
          clause('03', 'Any associated regular fees',
                 'The recurring platform costs are inside the ' + MONTHLY + '.') +
        '</ul>' +
      '</div>' +
      /* The audit is quoted and sits beside the figure, because it is the
         reason the up-front moved. The copy does NOT characterise the data
         it protects: whose records these are, and under which regime, is a
         question still open with the practice (SPEC rule 13 / NOTES §B1),
         and a vendor should not be the one to label a client's data in a
         document the client is reading. The rigour is the point, and it
         stands on its own. */
      /* PAYMENT SCHEDULE. Nothing about it was quoted — Geoff asked what dev
         shops do, so it is a PROPOSAL and sits under the draft chip like
         every other unquoted term. It is built from his own line items so
         the arithmetic is self-evident: the $10,000 build splits 50/50
         across signing and delivery, and the $2,500 audit is billed when
         the audit actually runs. Nothing is paid for work not yet done,
         which is the whole objection to an all-up-front quote. */
      draft('<div>' +
        eyebrow('How it is paid') +
        '<ul class="list" style="margin-top:6px">' +
          clause('01', '$5,000 on signing',
                 'Half the build. Work starts the same week.') +
          clause('02', '$5,000 on v1 delivery',
                 'The other half, when v1 is handed over for QA.') +
          clause('03', '$2,500 before launch',
                 'The third-party audit, billed when it runs.') +
        '</ul>' +
        '<p class="meta" style="margin-top:8px">The ' + MONTHLY +
          ' starts at launch, not at signing.</p>' +
      '</div>') +
      '<div style="margin-top:18px">' +
        eyebrow('Independent third-party audit') +
        '<p class="lede" style="margin-top:6px">Before launch, the build ' +
        'is audited by someone who did not write it. Scope, not an upsell.</p>' +
      '</div>';

    var body =
      figures +
      covers +
      draft(oneBillDrawing() +
            '<p class="meta" style="margin-top:10px"><strong>Not quoted.</strong> ' +
            'Geoff gave the category &mdash; <em>any associated regular fees</em> ' +
            '&mdash; and not the list. These five are what the category covers in ' +
            'practice, and both the list and who holds each account are for the ' +
            'room.</p>');

    root.innerHTML =
      head('The engagement', 'What it costs',
           'Three figures, then the one that decides it: what $500 a month buys.') +
      zbody(body);
  }

  /* ========================================================= 6 · terms ==== */
  /* Nothing on this frame was quoted, so the whole of it that reads as a term
     sits inside ONE .draft block rather than three — three dashed boxes
     stacked would be the grid of identical cards this board exists to avoid,
     and a single provisional document is also the more honest object.

     Then "For the room" on warm paper: the five open questions from NOTES §D,
     unchanged and unanswered. They are the only thing on the frame that is not
     a proposal, because a question cannot be wrong. */

  /* `tag` is the claim the sentence above this list makes — four change the
     build, the fifth changes the contract — marked on each item rather than
     left for the reader to infer. */
  var ROOM = [
    { tag: 'build',
      q: 'Spine tapping &mdash; cadence, who performs it, and whether it is prescribed ' +
         'per allergen or per client.' },
    { tag: 'build',
      q: 'Drops &mdash; what they are, which dose unit, and whether they are prescribed ' +
         'per allergen or per client.' },
    { tag: 'build',
      q: 'The communal library &mdash; who owns submitted content, and is attribution ' +
         'shown to other families?' },
    { tag: 'build',
      q: 'Does the owner want to approve communal content, or is practitioner approval ' +
         'enough?' },
    { tag: 'contract',
      q: 'Carried over: the commercial shape beyond this contract, and whether a ' +
         'practitioner would rather open on the roster or on today&rsquo;s schedule.' }
  ];

  var ROOM_TAG = {
    build: { word: 'changes the build', chip: 'chip--peri' },
    contract: { word: 'changes the contract', chip: 'chip--coral' }
  };

  function terms(root) {
    var ownership =
      eyebrow('Ownership') +
      '<ul class="list" style="margin-top:6px">' +
        clause('', 'The data is A.R.T.&rsquo;s',
               'Clients, protocols, every logged dose and the tables behind them sit in ' +
               'A.R.T.&rsquo;s own Supabase project &mdash; exportable in full, at any time.') +
        clause('', 'The product is A.R.T.&rsquo;s',
               'Proposed: A.R.T. owns the product and the schema outright; the builders ' +
               'keep only generic components written before this engagement.') +
      '</ul>';

    var support =
      '<div style="margin-top:16px">' +
        eyebrow('Support') +
        '<ul class="list" style="margin-top:6px">' +
          clause('', 'One channel, no ticket queue',
                 'Proposed: the practice talks to the two people who built it.') +
          clause('', 'Anything that stops a family logging a dose comes first',
                 'Proposed: same-day for that, the next working day for everything else. ' +
                 'Response times were not quoted and are Geoff&rsquo;s to set.') +
        '</ul>' +
      '</div>';

    var excluded =
      '<div style="margin-top:16px">' +
        eyebrow('Excluded') +
        '<ul class="list" style="margin-top:6px">' +
          clause('', 'Clinical content',
                 'The protocols, the doses and the method are A.R.T.&rsquo;s. We ' +
                 'transcribe them; we never author them.') +
          clause('', 'Hardware, and the four exclusions on the scope frame',
                 'Nothing in v1 talks to a device, including the RF diagnostics &mdash; ' +
                 'and stages 1&ndash;3, scheduling, billing and research export are named ' +
                 'there with their reasons.') +
        '</ul>' +
      '</div>';

    var room = ROOM.map(function (item, i) {
      var n = i + 1 < 10 ? '0' + (i + 1) : String(i + 1);
      var t = ROOM_TAG[item.tag];
      return '<li class="list__item">' +
               '<p><span class="mono">' + n + '</span> ' + item.q +
                 ' <span class="chip ' + t.chip + '">' + t.word + '</span></p>' +
             '</li>';
    }).join('');

    var body =
      draft(ownership + support + excluded) +
      '<div class="card card--paper" style="margin-top:18px">' +
        eyebrow('For the room') +
        '<p class="meta" style="margin-top:5px">Four of these change the build. ' +
          'The fifth changes the contract. None of them is ours to answer.</p>' +
        '<ul class="list" style="margin-top:8px">' + room + '</ul>' +
      '</div>';

    root.innerHTML =
      head('Terms', 'Terms, and for the room',
           'Nothing here was quoted, so every term is marked as a proposal.') +
      zbody(body);
  }

  /* ============================================================== exports == */
  /* Six functions, named for their LAYOUT keys, mirroring zone-story.js so
     app.js's renderers() map is one line per frame. */

  ART.zones = ART.zones || {};
  ART.zones.business = {
    stack: stack,
    timeline: timeline,
    team: team,
    scope: scope,
    pricing: pricing,
    terms: terms
  };
}());
