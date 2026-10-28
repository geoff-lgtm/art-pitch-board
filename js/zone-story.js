/* ===========================================================================
   A.R.T. pitch board — js/zone-story.js        owner: story        SPEC §6.1
   ---------------------------------------------------------------------------
   The banner, and all four frames of section 1 — THE PROBLEM:

     title        the masthead: wordmark, the hinge, the credential, how to read
     booklet      a facsimile of the real page, with its six fields called out
     concurrency  one child's three protocols at two time scales (weeks, hours)
     wait         the booklet's wait protocol as a ladder that titrates DOWN
     burden       NEW — everything with a time on it that the page does not hold

   WHAT MOVED IN v2 (SPEC §2, §4c)
     · `title` is now 4040x200 and is drawn with app.css §16c's `.banner`, not
       a `.zone__head` of KPI tiles. It carries the credential line verbatim.
     · `concurrency` went 1280 -> 3120 wide, so the sixteen-week axis finally
       gets ~187px a week instead of 67px, and the day gantt ~103px a column.
     · `wait` went 860 -> 1520 wide. A 1520px rung holding a stacked list of
       three steps leaves ~1000px of blank paper per line, so the steps now lay
       out ACROSS the rung as the sequence they are. The titration still reads
       three ways: fewer step discs, a narrower rung, and the occupancy chips
       staircasing inward off each rung's right edge.
     · `library`, `model` and `questions` are GONE from this file. The protocol
       library governance table moved into `macro` (analytics), the ERD into
       `erd` (platform) and the open questions into `terms` (business). Their
       helpers went with them rather than being left as dead code.

   No two of these read as the same kind of object (SPEC rule 15): type on the
   desk · warm paper in a handwriting face · horizontal bars on a continuous
   axis · a narrowing ladder · a dot-matrix ledger of discrete days.

   Nothing here is interactive (SPEC §7 — section 1 is a faithful static
   rendering). `concurrency` follows the roster selection; `booklet`, `wait`
   and `burden` are anchored to the hand-authored client, because a sheet of
   paper does not re-render when you click a roster row, and because SPEC §5a
   fixes HER two protocol items to the letter.

   Discipline: this file names no colour and no typeface — css/app.css owns all
   of both. Inline style is used only for geometry CSS cannot know (grid spans
   and templates, annotation offsets) and for the tunable custom properties
   app.css documents.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var esc = ui.esc;

  var WEEKS = 16;            /* the shared gantt axis, per ART.metrics.timeline */
  var DAY_FROM = 6;          /* the day strip runs 6:00am … 8:30pm              */
  var DAY_TO = 20;
  var DAY_SLOT = 30;         /* minutes per column — doses land on the half hour */
  var DAY_COLS = ((DAY_TO - DAY_FROM) * 60) / DAY_SLOT + 1;   /* 29 */
  var DAY_SPAN = DAY_COLS * DAY_SLOT;                          /* 870 minutes  */

  /* ONE definition of what a wait level costs in minutes, because two frames
     now quote it: the day gantt sizes a dose's bar by it, and `burden` totals
     it over the week. Level 3 is the booklet's "wait 30 min, then a hot shower
     or 10 minutes of hard exercise"; level 2 is its flat 15 minutes. */
  var WAIT_MIN = { 3: 40, 2: 15, 1: 0, 0: 0 };
  function waitMinutes(level) {
    var m = WAIT_MIN[Number(level)];
    return m === undefined ? 0 : m;
  }

  /* The appointment, which lives in the booklet margin and nowhere else. One
     constant, read by `booklet` (which writes it in the margin, as the page
     does) and by `burden` (which puts the visit on the week). Transcribed from
     the photographed page — the same line, not two drifting copies. */
  var APPOINTMENT = {
    dayShort: 'Tue',
    at: '12:30',
    minutes: 30,
    margin: 'next wk &mdash; Tues 10/27 @ 12:30, then Thursdays @ 2:00 beginning 11/5'
  };

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
  function num(v) { return Math.round(v * 1000) / 1000; }

  /* Small counts read as words in prose and as digits in data. Nothing on this
     canvas ever needs more than six of anything in a sentence. */
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  function word(n) { return WORDS[n] !== undefined ? WORDS[n] : String(n); }

  /* 385 -> '6h 25m'. Minutes only below an hour, so '55m' never reads '0h 55m'. */
  function hm(mins) {
    var m = Math.max(0, Math.round(mins));
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (!h) return r + 'm';
    return h + 'h' + (r ? ' ' + (r < 10 ? '0' : '') + r + 'm' : '');
  }

  /* The hand-authored client. She is the one whose booklet page was
     transcribed, so the paper zones stay with her even when the roster moves. */
  function demo() {
    return ART.store.client('c-mara') || ART.store.focusClient();
  }

  function cpOf(client, protocolId) {
    var list = (client && client.protocols) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].protocolId === protocolId) return list[i];
    }
    return null;
  }

  /* Doses for one protocol on one date. client.days may hold doses for a
     protocol that is no longer in client.protocols (foods already finished),
     so never assume the reverse lookup succeeds.

     NOTE since v2: client.days[iso] is THE DAY, not a dose list — it also
     holds the drops and the spine tap. Every call here passes a protocolId,
     and an item entry carries protocolId:null, so the filter keeps them out.
     dosesOn(client, iso) with no protocolId would return items too; use
     ART.dayDoses(client, iso) where you mean food and nothing else. */
  function dosesOn(client, iso, protocolId) {
    var list = (client && client.days && client.days[iso]) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!protocolId || list[i].protocolId === protocolId) out.push(list[i]);
    }
    return out;
  }

  function doseOn(client, iso, protocolId) {
    var hit = dosesOn(client, iso, protocolId);
    return hit.length ? hit[0] : null;
  }

  function protoOf(cp) {
    return cp ? ART.store.protocol(cp.protocolId) : null;
  }

  /* The protocols a parent is actually running, in the order the day happens. */
  function byTime(client) {
    var list = ((client && client.protocols) || []).slice();
    list.sort(function (a, b) {
      return String(a.timing || '').localeCompare(String(b.timing || ''));
    });
    return list;
  }

  function stateWord(state) {
    if (state === 'ramping') return 'ramping';
    if (state === 'maintenance') return 'maintenance';
    if (state === 'held') return 'held';
    return '';
  }

  function hourLabel(h) {
    if (h === 12) return '12p';
    if (h === 0) return '12a';
    return (h > 12 ? h - 12 : h) + (h >= 12 ? 'p' : 'a');
  }

  /* one definition, in ART.ui, so a dose time reads the same in every zone */
  function clockLabel(hhmm) { return ui.clock(hhmm); }

  /* ============================================================== 1 · title */
  /* THE MASTHEAD. 4040 x 200, full bleed across the top of the world, and the
     first thing anyone reads — including a reader with nobody presenting, which
     is the condition this whole board has to survive.
     It is app.css §16c's `.banner`: a masthead, not a card. No fill, no border,
     no shadow, one hairline under it. Three jobs, and only three:

       1  the wordmark, with THE ARGUMENT as its standfirst — A.R.T.'s own FAQ
          names strict adherence as the biggest driver of outcome, and it is
          measured nowhere today. One sentence. That is the hinge of the pitch
          and it belongs above everything else on the board.
       2  the CREDENTIAL, held to one line in .meta on the right, where a
          standfirst sits in a newspaper. Two names and three facts — FlipaClip
          and Cradle, 150M users, the Apple App of the Year WIN; Head of
          Product at Planet Fitness; and an A.R.T. family. Stated, not argued:
          the line names the three credentials and draws no conclusion from
          them. Weight is spent inside the line (the names, the figure), never
          by breaking it into a paragraph: a two-line credential pushes the
          rule off a 200px frame.
       3  HOW TO READ THE BOARD, under the rule: the eight sections in the rail,
          the two walkthroughs, and the fact that you drag to move. Set as
          chips, because an instruction is a control label, not an essay.

     40 words of prose in the whole banner. Everything else here is a name, a
     figure or a key. */

  /* Two names, three facts, no hedging. The previous line said "the team
     behind FlipaClip" and "Planet Fitness's product organisation" — both
     vague about who actually did what, and the second was simply wrong:
     Lisa IS the Head of Product for Planet Fitness, not a reference to
     their org. The award reads as WON, because naming an award is not the
     same as saying you won it. */
  var CREDENTIAL =
    '<strong>Geoff Hladik</strong> &mdash; built ' + '<a class="credlink" href="https://apps.apple.com/us/app/flipaclip-draw-2d-animation/id1101848914" target="_blank" rel="noopener noreferrer"><strong>FlipaClip</strong></a> and ' + '<a class="credlink" href="https://apps.apple.com/us/app/cradle-baby-tracker/id6764861171" target="_blank" rel="noopener noreferrer"><strong>Cradle</strong></a>, ' +
    '<span class="num">150M</span> users, winner of Apple App of the Year. ' +
    '<strong>Lisa Debenedictis</strong> &mdash; Head of Product, Planet Fitness. ' +
    'And an <strong>A.R.T. family</strong>.';

  function title(root) {
    var banner =
      '<div class="banner">' +
        /* THE FIRST SENTENCE ON THE BOARD, so it states the shared premise
           and nothing else. An earlier draft opened by citing the practice's
           own published material back at them and then declaring that they
           measure nothing. Both were wrong for an opening line: the first is
           an argument you make against someone rather than for them, and a
           forwarded link puts it in front of people it was not written for;
           the second is untrue, because the booklet IS the measurement and
           the whole of section 1 is built on respecting that.

           The hinge is the same and the accusation is gone: adherence
           decides the outcome, the booklet already records it, and the gap
           is that nobody can add it up. A problem to solve together. */
        '<h1 class="banner__title">A.R.T. Daily &amp; Practice' +
          '<small>Strict adherence is the biggest driver of outcome. The ' +
            'booklet records it a day at a time &mdash; nothing adds it ' +
            'up.</small>' +
        '</h1>' +
        '<p class="meta banner__cred">' + CREDENTIAL + '</p>' +
      '</div>';

    /* A sibling of .banner, not a child: §16c puts the hairline under the title
       row and the credential, and gives the foot its own padding above. */
    /* A GUIDE, NOT A KEYBOARD REFERENCE. This row used to be three chips —
       keys, drag, zoom — which tell a reader how to OPERATE the board and
       nothing about how to read it. The board opens here now, so these are
       the first words after the title, and they have one job: say what the
       thing is, in what order it goes, and that nobody has to drive it if
       they would rather be walked through. */
    var guide =
      '<p class="banner__guide">' +
        'Start at the top and read down. <strong>Sections 1 to 6 are the ' +
        'product</strong> &mdash; the problem the booklet has today, the ' +
        'family&rsquo;s app, the practitioner&rsquo;s, what the practice sees ' +
        'across every client, who may open what, and the data underneath. ' +
        '<strong>Sections 7 and 8 are the plan</strong> &mdash; how it is ' +
        'built, and what it costs. Drag anywhere to move, or press a ' +
        'walkthrough below and the board takes you through it.' +
      '</p>';

    var foot =
      '<div class="banner__foot">' +
        '<p class="eyebrow">How to read this board</p>' +
        '<span class="chip chip--neutral">' +
          '<strong class="num">8</strong> sections in the rail &middot; ' +
          'keys <strong class="num">1</strong>&ndash;<strong class="num">8</strong>' +
        '</span>' +
        '<span class="chip chip--coral">' +
          '<span aria-hidden="true">&#9654;</span> Two walkthroughs &mdash; ' +
          'the product, the engagement' +
        '</span>' +
        '<span class="chip chip--neutral">Drag to move &middot; ' +
          '&#8984;/Ctrl-scroll to zoom</span>' +
      '</div>';

    root.innerHTML = banner + guide + foot;
  }

  /* ============================================================ 2 · booklet */
  /* The "before", and the most persuasive object available. It has to read as
     PAPER: warm stock, a margin rule, staples in the gutter, a handwriting
     face, annotations struck through in the practitioner's own hand.

     Six callout tags bracket ONE line, each naming the field AND the place it
     already lives in a schema. That is the whole argument of the zone: the page
     is a table someone is writing by hand.

     Three of the six are written ON that line — day, dose+unit, status — and
     those three carry a leader measured onto the exact handwritten token
     (the day at x87, the dose at x199, the status glyph at x275 of the page's
     text column). The other three are written elsewhere on the same page — the
     allergen in the header, the rule in the margin, the exception on the struck
     line — so they carry no leader rather than a pointer at blank paper. The
     tags are content-width: stretched to equal columns they read as two
     segmented white bars lying on the paper instead of as six pointers.

     880 x 1240, unchanged in shape from v1. */

  /* leader: 'down' points at the line below, 'up' at the line above, omitted =
     no leader. offset nudges the tag right so its leader meets its token. */
  function field(name, value, path, opts) {
    opts = opts || {};
    var lead = opts.leader;
    return '<div class="booklet__field"' +
             (lead === 'down' ? ' data-leader="down"' : '') +
             (lead ? '' : ' data-leader="none"') +
             (opts.offset ? ' style="margin-left:' + opts.offset + 'px"' : '') + '>' +
             '<b>' + esc(name) + '</b>' +
             '<span class="mono">' + esc(value) + '</span>' +
             '<span class="meta">' + esc(path) + '</span>' +
           '</div>';
  }

  /* the two callout rows: content-width tags, left-aligned, never a grid */
  function fieldRow(tags) {
    return '<div style="display:flex;align-items:flex-start;gap:18px">' + tags + '</div>';
  }

  function line(text, opts) {
    opts = opts || {};
    return '<p class="' + ui.cls('booklet__line', { 'booklet__strike': opts.strike }) + '"' +
             (opts.indent ? ' data-indent' : '') + '>' + text + '</p>';
  }

  /* The most recent line on which the practitioner had to write an exception.
     It is what the sixth callout points at, and it is real data, not a sample. */
  function lastException(client, protocolId) {
    var today = ART.store.state.today;
    var best = null;
    for (var back = 1; back <= 28; back++) {
      var iso = ui.addDays(today, -back);
      var hit = dosesOn(client, iso, protocolId);
      for (var i = 0; i < hit.length; i++) {
        if (hit[i].note && (hit[i].status === 'skipped' || hit[i].status === 'reaction')) {
          best = hit[i];
          break;
        }
      }
      if (best) break;
    }
    return best;
  }

  /* The wait protocol as it is actually written on the page, by level. */
  var WAIT_ON_PAGE = {
    3: '30 min, then hot shower or 10 min hard exercise',
    2: '15 min after the dose',
    1: null,
    0: null
  };

  function bookletLineFor(client, cp, iso) {
    var dose = doseOn(client, iso, cp.protocolId);
    if (!dose) return null;
    var glyph = ui.glyph(dose.status);
    var amount = ART.prep.household(dose);
    var tail = '';
    if (dose.status === 'held') tail = '<em>hold @ same amount</em>';
    else if (dose.status === 'skipped') tail = '<em>' + esc(dose.note || 'skip') + '</em>';
    else if (dose.status === 'reaction') tail = '<em>' + esc(dose.note || 'reaction') + '</em>';
    return '<span>' + esc(ui.dayLabel(iso)) + '</span>' +
           '<span>&mdash;</span>' +
           '<span>' + esc(amount) + '</span>' +
           (glyph ? '<span>&mdash;</span><span>' + glyph + '</span>' : '') +
           (tail ? '<span>&mdash;</span>' + tail : '');
  }

  function booklet(root) {
    var client = demo();
    var all = byTime(client);
    var ramping = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].state !== 'maintenance') { ramping = all[i]; break; }
    }
    if (!ramping) ramping = all[0];

    var proto = protoOf(ramping);
    var phase = proto && proto.phases[ramping.phaseIdx];
    var week = ui.weekDates(ART.store.state.weekStart);

    /* the one line the six callouts annotate: the first logged day of the week */
    var targetISO = week[0];
    var target = doseOn(client, targetISO, ramping.protocolId);
    var condition = (proto && proto.conditions && proto.conditions[0]) || null;
    var exception = lastException(client, ramping.protocolId);

    var page = '';

    /* --- the page's own header, in the practitioner's hand ---------------- */
    page += line('<span>' + esc(client.name) + '</span>' +
                 '<span class="meta">booklet p. 11 &middot; wk of ' +
                 esc(ui.md(week[0])) + '</span>');
    page += line('<span>' + esc(proto.allergen.toLowerCase()) + '</span>' +
                 '<span>&mdash;</span>' +
                 '<span>wk ' + ramping.week + ' of ' + ramping.of + '</span>' +
                 '<span>&mdash;</span>' +
                 '<span>phase ' + (phase ? phase.n : 1) +
                   ' (' + esc(phase ? phase.unit : '') + ')</span>');

    /* --- the two fields written at the head of the line, dropping onto it -- */
    page += fieldRow(
      field('Day', ui.dayLabel(targetISO), 'dayEntry.date', { leader: 'down' }) +
      field('Dose + unit', target ? ART.prep.household(target) : '—',
            'value × unit', { leader: 'down' }) +
      field('Allergen', target ? target.allergen : proto.allergen,
            'protocol.allergen'));

    /* --- THE line -------------------------------------------------------- */
    page += line(bookletLineFor(client, ramping, targetISO) ||
                 '<span>' + esc(ui.dayLabel(targetISO)) + '</span>');

    /* --- the status glyph, pointing back up at it; then the two fields the
           page keeps elsewhere --------------------------------------------- */
    page += fieldRow(
      field('Status', target ? ui.statusLabel(target.status).toLowerCase() : 'planned',
            'dayEntry.status', { leader: 'up', offset: 188 }) +
      field('Rule', condition ? condition.action.toLowerCase() : 'advance if healthy',
            'condition.action') +
      field('Exception', exception ? exception.note : 'skip, had cold',
            'reason + note'));

    /* --- the rest of the week, as written -------------------------------- */
    for (var d = 1; d < week.length; d++) {
      var row = bookletLineFor(client, ramping, week[d]);
      if (row) page += line(row);
    }

    /* --- the margin note, which is a conditional rule in handwriting ----- */
    page += '<span class="booklet__margin">only if healthy, otherwise hold @ same amount' +
            '&hellip; or email me</span>';

    var onPage = WAIT_ON_PAGE[Number(ramping.waitLevel)];
    if (onPage) {
      page += line('<span>wait</span><span>&mdash;</span><span>' + onPage + '</span>');
    }

    /* --- the other foods, on the same page, which is the whole problem ---- */
    if (all.length > 1) page += line('<span>also this wk &mdash;</span>');
    all.forEach(function (cp) {
      if (cp === ramping) return;
      var p = protoOf(cp);
      if (!p) return;
      var dose = doseOn(client, ART.store.state.today, cp.protocolId);
      var amount = dose ? ART.prep.household(dose) : (p.maintenance || '—');
      var state = cp.state === 'maintenance' ? 'maintenance' : 'wk ' + cp.week;
      page += line('<span>' + esc(p.allergen.toLowerCase()) + '</span>' +
                   '<span>&mdash;</span><span>' + esc(state) + '</span>' +
                   '<span>&mdash;</span><span>' + esc(amount) + '</span>' +
                   '<span>&mdash;</span><span>' + esc(clockLabel(cp.timing)) + '</span>',
                   { indent: true });
    });
    page += line('<span>push egg to 6pm once</span>', { indent: true });

    /* "or email me" is the booklet's own escalation path, and it leaves a
       trace on the page. This is the line the message thread replaces. */
    var emailed = null;
    (client.messages || []).forEach(function (msg) {
      if (msg.from === 'practitioner') emailed = msg;
    });
    if (emailed) {
      page += line('<span>emailed ' + esc(ui.md(String(emailed.at).slice(0, 10))) +
                   ' &mdash; see email</span>', { indent: true });
    }

    /* --- the annotation vocabulary, verbatim off the photographed page ---- */
    /* 'earlier wks', not 'last wk': the three strings below are transcribed as
       SPEC §3 requires them, and two of them (10/5, 8/18) are older than last
       week — under a 'last wk' heading they read as wrong dates on a page whose
       own header says wk of 10/19. */
    page += line('<span>earlier wks &mdash;</span>');
    page += line('<span>10/5 &mdash; 1 seed &mdash; skip, had cold</span>',
                 { indent: true, strike: true });
    page += line('<span>8/18 &mdash; N/A (vaccine)</span>', { indent: true });
    page += line('<span>10/15 &mdash; 5 seeds &mdash; hold @ same amount</span>',
                 { indent: true });

    /* --- what comes next, and the appointment that lives here too -------- */
    var next = proto && proto.phases[(ramping.phaseIdx || 0) + 1];
    if (next) {
      page += line('<span>next phase &mdash;</span>' +
                   '<span>' + esc(next.label.toLowerCase()) + ',</span>' +
                   '<span>' + esc(next.steps[0].display) + ' &rarr; ' +
                   esc(next.steps[next.steps.length - 1].display) + '</span>');
    }
    /* one copy of this line on the board: `burden` reads the same constant to
       put the visit on the week */
    page += '<span class="booklet__margin" data-side="left">' +
            APPOINTMENT.margin + '</span>';
    page += line('<span>&mdash; R.O.</span>');

    root.innerHTML =
      head('Before', 'The booklet today',
           'One child, one week, three foods &mdash; the page as it is written.') +
      zbody(
        '<div class="booklet">' +
          '<div class="booklet__page">' + page + '</div>' +
          cap('<strong>Every line is the same six fields.</strong> ' +
              'It is already a schema. It has no screen.') +
        '</div>'
      );
  }

  /* ======================================================== 3 · concurrency */
  /* The best single picture of the problem: one child's protocols at two time
     scales. Across sixteen weeks you see the overlap — one food in maintenance
     while another ramps and a third restarts. Across one day you see what that
     costs by the clock, including the wait each dose drags behind it. Both read
     from the focused client.

     3120 x 600 (was 1280 x 580). No structural reflow was needed: both gantts
     are `repeat(--gantt-weeks, 1fr)` over whatever width the track is given, so
     the extra 1840px lands straight on the columns — 67px a week becomes 187px,
     and the day's half-hour columns go 41px -> 103px. The only change is that
     the label gutter widens with them: at 118px 'maintenance · wk 13' wrapped
     to a second line inside a 42px row, and at 168px it does not. */

  function expandStates(row) {
    var byWeek = {};
    (row.segments || []).forEach(function (seg) {
      for (var i = 0; i < seg.span; i++) byWeek[seg.week + i] = seg.state;
    });
    return byWeek;
  }

  function phaseMarks(cp, proto, nowWeek) {
    var out = [];
    var startW = nowWeek - (cp.week - 1);
    var days = 0;
    var phases = proto.phases || [];
    for (var i = 0; i < phases.length - 1; i++) {
      days += phases[i].days;
      var pos = (startW - 1) + days / 7;          /* 0-based weeks on the axis */
      if (pos > 0.1 && pos < WEEKS - 0.1) out.push(pos / WEEKS * 100);
    }
    return out;
  }

  function holdMarks(client, cp, nowWeek, byWeek) {
    var out = [];
    var base = ART.store.state.weekStart;
    var startW = Math.max(1, nowWeek - (cp.week - 1));
    for (var w = startW; w <= WEEKS; w++) {
      if (byWeek[w] === 'held' || byWeek[w] === 'none' || !byWeek[w]) continue;
      var ws = ui.addDays(base, (w - nowWeek) * 7);
      var holds = 0;
      for (var d = 0; d < 7; d++) {
        dosesOn(client, ui.addDays(ws, d), cp.protocolId).forEach(function (dose) {
          if (dose.status === 'held' || dose.status === 'reaction') holds++;
        });
      }
      if (holds) out.push(((w - 1) + 0.5) / WEEKS * 100);
    }
    return out;
  }

  /* the wider gutter the 3120px frame pays for — a tunable app.css documents */
  var GANTT_LABEL = 'style="--gantt-weeks:%N;--gantt-label:168px"';

  function ganttOpen(cols) { return GANTT_LABEL.replace('%N', String(cols)); }

  function weekAxis(nowWeek) {
    var base = ART.store.state.weekStart;
    var cells = '';
    for (var w = 1; w <= WEEKS; w++) {
      var iso = ui.addDays(base, (w - nowWeek) * 7);
      cells += '<span class="gantt__week"' + (w === nowWeek ? ' data-now' : '') + '>' +
                 esc(ui.md(iso)) + '</span>';
    }
    /* No '16 weeks' sub-label under 'Week of'. The axis prints all sixteen
       dates and the panel head already says 'sixteen weeks', so a third copy
       broke the standing rule that one fact never shows two ways. */
    return '<div class="gantt__axis">' +
             '<div class="gantt__label">Week of</div>' +
             '<div class="gantt__weeks">' + cells + '</div>' +
           '</div>';
  }

  function weeksGantt(client, rows, nowWeek, todayAt) {
    var html = '<div class="gantt" ' + ganttOpen(WEEKS) + '>' + weekAxis(nowWeek);

    rows.forEach(function (row, idx) {
      var cp = cpOf(client, row.protocolId);
      var proto = ART.store.protocol(row.protocolId);
      var byWeek = expandStates(row);
      var bars = '';

      (row.segments || []).forEach(function (seg) {
        if (seg.state === 'none') return;
        var label = stateWord(seg.state);
        bars += '<div class="gantt__bar" data-state="' + seg.state + '"' +
                  ' style="grid-column:' + seg.week + ' / span ' + seg.span + '">' +
                  (seg.span >= 2 && label ? '<span>' + label + '</span>' : '') +
                '</div>';
      });

      if (cp && proto) {
        /* only phase changes that have actually happened: a mark is a fact,
           and one sitting on top of the today line is just noise */
        phaseMarks(cp, proto, nowWeek).forEach(function (at) {
          if (at > todayAt - 1.2) return;
          bars += '<i class="gantt__mark" data-kind="phase" aria-hidden="true"' +
                    ' style="left:' + num(at) + '%"></i>';
        });
        holdMarks(client, cp, nowWeek, byWeek).forEach(function (at) {
          bars += '<i class="gantt__mark" data-kind="hold" aria-hidden="true"' +
                    ' style="left:' + num(at) + '%"></i>';
        });
      }

      bars += '<i class="gantt__today"' + (idx === 0 ? ' data-label="Today"' : '') +
                ' aria-hidden="true" style="left:' + num(todayAt) + '%"></i>';

      /* 'wk 13 of 12' is true and reads like a bug, so a protocol past its
         nominal length says what it actually is */
      var sub;
      if (!cp) {
        sub = 'finished';
      } else if (cp.state === 'maintenance') {
        sub = 'maintenance · wk ' + cp.week;
      } else {
        sub = 'wk ' + cp.week + ' of ' + cp.of;
        if (proto && proto.phases[cp.phaseIdx]) {
          sub += ' · ' + proto.phases[cp.phaseIdx].label.toLowerCase();
        }
      }

      html += '<div class="gantt__row">' +
                '<div class="gantt__label">' + esc(row.allergen) +
                  '<span class="meta">' + esc(sub) + '</span></div>' +
                '<div class="gantt__track">' + bars + '</div>' +
              '</div>';
    });

    return html + '</div>';
  }

  function dayGantt(client) {
    /* 29 half-hour columns, labelled on the hour only: a ruler, not a crowd.
       At 103px a column there is finally room for every hour label. */
    var cells = '';
    for (var i = 0; i < DAY_COLS; i++) {
      var onHour = i % 2 === 0;
      cells += '<span class="gantt__week">' +
                 (onHour ? hourLabel(DAY_FROM + i / 2) : '') + '</span>';
    }

    var html = '<div class="gantt" ' + ganttOpen(DAY_COLS) + '>' +
                 '<div class="gantt__axis">' +
                   '<div class="gantt__label">Clock</div>' +
                   '<div class="gantt__weeks">' + cells + '</div>' +
                 '</div>';

    byTime(client).forEach(function (cp) {
      var proto = protoOf(cp);
      if (!proto) return;
      var parts = String(cp.timing || '17:30').split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) || 0;
      if (isNaN(h)) h = 17;
      h = Math.min(Math.max(h, DAY_FROM), DAY_TO);

      var wait = ART.prep.waitProtocol(cp.waitLevel);
      var waitMin = waitMinutes(wait.level);
      var minute = (h - DAY_FROM) * 60 + m;
      var col = Math.floor(minute / DAY_SLOT) + 1;
      var span = Math.max(1, Math.round((DAY_SLOT + waitMin) / DAY_SLOT));
      if (col + span - 1 > DAY_COLS) span = DAY_COLS - col + 1;

      var at = minute / DAY_SPAN * 100;
      var state = cp.state === 'maintenance' ? 'maintenance' : 'ramping';
      var dose = doseOn(client, ART.store.state.today, cp.protocolId);
      var amount = dose
        ? (ART.store.state.units === 'grams' ? ART.prep.grams(dose) : ART.prep.household(dose))
        : proto.allergen;

      html += '<div class="gantt__row">' +
                '<div class="gantt__label">' + esc(clockLabel(cp.timing)) +
                  '<span class="meta">' + esc(proto.allergen.toLowerCase()) +
                  ' · ' + esc(wait.short === '—' ? 'no wait' : wait.short) +
                  '</span></div>' +
                '<div class="gantt__track">' +
                  '<div class="gantt__bar" data-state="' + state + '"' +
                    ' style="grid-column:' + col + ' / span ' + span + '">' +
                    /* a label only where the bar can hold it: the span is the
                       dose plus its wait, and a nowrap label is not clipped by
                       the bar, it spills past it */
                    (span >= 2 && amount.length <= 14
                      ? '<span>' + esc(amount) + '</span>' : '') +
                  '</div>' +
                  '<i class="gantt__mark" data-kind="phase" aria-hidden="true"' +
                    ' style="left:' + num(at) + '%"></i>' +
                '</div>' +
              '</div>';
    });

    return html + '</div>';
  }

  function concurrency(root) {
    var client = ART.store.focusClient();
    var rows = ART.metrics.timeline(client);
    var nowWeek = (rows[0] && rows[0].nowWeek) || 14;
    var intoWeek = ui.diffDays(ART.store.state.weekStart, ART.store.state.today);
    var todayAt = ((nowWeek - 1) + Math.min(Math.max(intoWeek, 0), 6) / 7) / WEEKS * 100;

    var n = rows.length;
    var waits = 0;
    var doses = 0;
    byTime(client).forEach(function (cp) {
      if (Number(cp.waitLevel) >= 2) waits++;
      if (doseOn(client, ART.store.state.today, cp.protocolId)) doses++;
    });

    var legend =
      '<div class="chiprow">' +
        '<span class="chip chip--navy">ramping</span>' +
        '<span class="chip chip--peri">maintenance</span>' +
        '<span class="chip chip--hold">held</span>' +
        '<span class="chip chip--neutral">&#9670; phase change</span>' +
        '<span class="chip chip--hold">&#9642; a hold that week</span>' +
      '</div>';

    var body =
      '<section class="panel">' +
        '<div class="panel__head">' +
          '<h3 class="h3">' + esc(client.name) + ', ' + client.age +
            ' &middot; ' + n + ' protocol' + (n === 1 ? '' : 's') +
            ' &middot; sixteen weeks' +
            (client.status === 'active' ? '' : ' &middot; paused') + '</h3>' +
          '<div class="panel__actions">' + legend + '</div>' +
        '</div>' +
        '<div class="panel__body">' +
          (n ? weeksGantt(client, rows, nowWeek, todayAt)
             : '<p class="empty">No protocol running this week.</p>') +
        '</div>' +
      '</section>' +

      '<section class="panel panel--inset">' +
        '<div class="panel__head">' +
          '<h3 class="h3">One day &middot; ' + esc(ui.dayLabel(ART.store.state.today)) +
            ' &middot; half-hour columns</h3>' +
          '<div class="panel__actions"><div class="chiprow">' +
            '<span class="chip chip--neutral">' + doses + ' doses &middot; ' +
              waits + ' with a wait</span>' +
            '<span class="chip chip--neutral">&#9670; the dose</span>' +
            '<span class="chip chip--neutral">bar = the window it occupies, ' +
              'wait included</span>' +
          '</div></div>' +
        '</div>' +
        '<div class="panel__body">' + dayGantt(client) + '</div>' +
      '</section>' +

      cap('<strong>What a parent holds in their head</strong>, on top of the booklet.');

    /* No .zone__note here on purpose: this zone has a mandatory caption, and a
       note above the gantt would say the same thing twice. */
    root.innerHTML = head('The problem', 'Three protocols, one child') + zbody(body);
  }

  /* =============================================================== 4 · wait */
  /* Straight off the booklet page. The protocol titrates DOWN as the child
     tolerates more, and the frame carries that three ways at once:

       WIDTH   100% -> 84% -> 68% -> 52%, from app.css's data-level rules
       STEPS   three numbered steps -> two -> one line -> one line
       REACH   the occupancy chips ride each rung's RIGHT EDGE, so they
               staircase inward as the rungs narrow — which is the titration
               drawn a third time, in the one axis nothing else uses

     1520 x 600 (was 860 x 580). The 660px of new width is the reason the steps
     now lay out ACROSS a rung instead of down it: a stacked three-step list in
     a 1520px rung leaves about 1000px of blank paper on every line, and the
     sequence reads better left-to-right anyway — it IS a sequence. The measure
     is capped at 96ch so the procedure stays a readable column rather than one
     1400px line, and the chips are pushed to the edge with an auto margin. */

  /* ART.prep.waitProtocol() holds the booklet's own wording for levels 3, 2
     and 1, so it is the single source. Level 0 is the exception: prep returns
     '—' because a maintenance dose renders no wait block on the phone, and
     the ladder needs a last rung to land on.

     That rung is DESCRIBED, not quoted. It used to read "the food is just
     food now", which is a sentence about a child's clinical status that no
     booklet contains and nobody at the practice wrote. The ladder's job here
     is to show that the wait protocol ends; saying there is no wait does
     that without putting words in a practitioner's mouth. */
  var RUNG_0 = 'No wait protocol at this level';

  function wait(root) {
    var client = demo();
    var levels = [3, 2, 1, 0];

    /* which of her foods is sitting on each rung, from the real ClientProtocol */
    var occupant = {};
    var foods = 0;
    byTime(client).forEach(function (cp) {
      var proto = protoOf(cp);
      if (!proto) return;
      var lvl = Number(cp.waitLevel);
      if (!occupant[lvl]) occupant[lvl] = [];
      occupant[lvl].push(proto.allergen.toLowerCase() + ' &middot; ' + clockLabel(cp.timing));
      foods++;
    });

    /* the rung she is actually on is the highest one still occupied */
    var current = null;
    var lowest = null;
    var taken = 0;
    for (var i = 0; i < levels.length; i++) {
      if (occupant[levels[i]] && occupant[levels[i]].length) {
        taken++;
        if (current === null) current = levels[i];
        lowest = levels[i];
      }
    }

    var rungs = levels.map(function (lvl) {
      var book = ART.prep.waitProtocol(lvl);

      /* A rung states its instruction ONCE. book.label and book.steps are the
         same instruction at two lengths, so a rung that has steps shows the
         steps and a rung that has none shows its one line — never both. That
         is also what keeps the step DISCS a count of the procedure's length. */
      var instruction = book.steps.length
        ? '<ul class="wait" data-steps style="flex-direction:row;flex-wrap:wrap;' +
             'gap:10px 26px;align-items:flex-start">' +
            book.steps.map(function (step) {
              return '<li class="wait__step">' + esc(step) + '</li>';
            }).join('') +
          '</ul>'
        : '<span>' + (lvl === 0 ? RUNG_0 : esc(book.label)) + '</span>';

      /* Occupancy is carried in WORDS on the rung — 'sesame · 4:30 pm' — so the
         coral on the current rung is emphasis on a fact already written there,
         never the only way to read it (SPEC rule 14). */
      var who = (occupant[lvl] || []).map(function (label) {
        return '<span class="chip chip--neutral">' + label + '</span>';
      }).join('');

      return '<li class="wait__rung" data-level="' + lvl + '"' +
                  (lvl === current ? ' aria-current="true"' : '') +
                  (lvl === 0 ? ' data-state="off"' : '') +
                  ' style="padding:19px 22px">' +
               '<b>' + lvl + '</b>' +
               '<div style="flex:0 1 auto;min-width:0;max-width:96ch">' +
                 instruction +
               '</div>' +
               (who
                 ? '<div class="chiprow" style="flex:0 0 auto;margin-left:auto;' +
                     'justify-content:flex-end">' + who + '</div>'
                 /* The ladder titrates DOWN, so an empty rung with an
                    occupied one BELOW it has been climbed off, not "not
                    reached yet" — which is what it used to say for rung 1
                    while egg sat on rung 0 underneath it. */
                 : '<span class="meta" style="flex:0 0 auto;margin-left:auto">' +
                     (lowest !== null && lvl > lowest
                       ? 'climbed off &mdash; nothing here now'
                       : 'not reached yet') + '</span>') +
             '</li>';
    }).join('');

    /* The ladder IS the body, and it is a real .wait: app.css's nth-child
       widths and its data-level widths then agree by construction, and the
       nested numbered step lists — also .wait, for the counter — can never be
       mistaken for rungs, because every width rule is scoped to a .wait__rung. */
    var note = taken > 1
      ? 'It titrates <strong>down</strong> &mdash; ' + esc(client.name) +
        '&rsquo;s ' + word(foods) + ' foods sit on ' + word(taken) +
        ' different rungs.'
      : 'It titrates <strong>down</strong> &mdash; every rung below is one ' +
        esc(client.name) + ' has already climbed off.';

    /* The ladder left about a third of the frame empty, and the booklet page it
       transcribes carries one more instruction that lives nowhere else: a
       single dose moved by hand, one evening, written in the margin. It is the
       titration done manually, and it is the fourth thing on the page. */
    var nudge =
      '<div class="card--quiet" style="margin-top:20px">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;' +
          'gap:20px">' +
          '<p class="eyebrow">And one line that is not a rung</p>' +
          '<p class="meta">handwritten in the margin, once</p>' +
        '</div>' +
        '<p style="margin-top:8px"><span class="mono">push egg to 6pm once</span> ' +
          '&mdash; one dose moved one evening, off the ladder and off the ramp. ' +
          'Nothing in the booklet records whether it happened, and nothing ' +
          'reminds anyone it was asked for.</p>' +
      '</div>';

    root.innerHTML =
      head('From the booklet', 'The wait protocol', note) +
      '<div class="zone__body">' +
        '<ul class="wait" style="gap:30px">' + rungs + '</ul>' +
        nudge +
      '</div>';
  }

  /* ============================================================= 5 · burden */
  /* NEW in v2, and it earns stop 2 of the product walkthrough.
     1520 x 600.

     THE ARGUMENT: the booklet captures the food. Everything else a parent is
     holding — the daily drops, the spine tap on its own cadence, a different
     wait protocol per food, and the appointment — is written once in a margin
     or written nowhere at all. NOTES §A2/§A3 say both of the first two are
     prescribed and tracked nowhere today, and that is the gap the product
     closes on one screen.

     THE OBJECT: a week-shaped LEDGER, not a list. Ten grid columns —
       34px   the kind glyph, in its own gutter so every row's name is flush
       366px  what it is, and when
       7 x    one column per day of the booklet's own week
       292px  IS IT WRITTEN DOWN? — the spine of the whole frame
     and one row per thing with a time on it. The texture does the arguing: a
     block of real logged statuses across the three foods, then the two rows
     whose marks go hollow, then the two whose marks go periwinkle because they
     exist exactly once, in handwriting, in the margin.

     It is deliberately a different OBJECT from its neighbours (SPEC rule 15):
     `concurrency` above it is continuous bars on a time axis and `wait` beside
     it is a narrowing ladder. This is a discrete matrix of days. Nothing here
     is a chart of the same shape as anything near it.

     Anchored to the hand-authored client, like `booklet` and `wait`: SPEC §5a
     fixes HER two items to the letter (3 drops at 08:00 daily; the spine tap
     Mon & Thu at 19:00), and the frame is built from ART.protocolItems() so a
     client with no tap simply renders one row fewer rather than lying. */

  /* 1520 - 34 - 366 - 292 - (9 gaps x 5px) = 783, i.e. ~112px a day column.
     Stated once and applied to the head and to every row, because a grid whose
     header and body disagree by one column is a silent misalignment.
     The glyph gutter is 34 and not 26 because .drop__glyph is a 22px square
     ROTATED 45deg: its painted box is 31px across, and in a 26px column it
     hung 3px outside the frame. */
  var LEDGER_COLS =
    'grid-template-columns:34px 366px repeat(7, minmax(0, 1fr)) 292px';

  /* the three verdicts, in the order the rows use them */
  var VERDICT = {
    booklet: { v: 'yes', words: 'a line every day' },
    nowhere: { v: 'no', words: 'nowhere at all' },
    margin: { v: 'scoped', words: 'once, in the margin' }
  };

  function ledgerCell(verdict) {
    var k = VERDICT[verdict];
    /* .mark draws its own glyph, so the mark can never render blank; the words
       beside it are what keep `scoped` honest and keep every verdict readable
       without colour (SPEC rule 14). */
    return '<span class="chiprow" style="justify-self:stretch;flex-wrap:nowrap;gap:8px">' +
             '<span class="mark mark--sm" data-v="' + k.v + '"></span>' +
             '<span class="meta">' + esc(k.words) + '</span>' +
           '</span>';
  }

  /* one row of the ledger. `glyph` is a class name or null; `cells` is already
     seven grid children.

     The glyph is emitted as a DIRECT grid child, not wrapped: .drop__glyph and
     .tap__glyph are sized boxes, and an <i> is inline, so width and height
     would be ignored on it anywhere else. A grid item is blockified, which is
     what makes the 22px droplet and the 22px spine actually draw — and it puts
     them in their own gutter, so every row's name stays flush whether or not
     it has one. */
  function ledgerRow(glyph, name, detail, cells, verdict) {
    return '<div class="strip__row" style="' + LEDGER_COLS + '">' +
             (glyph
               ? '<i class="' + glyph + '" aria-hidden="true"></i>'
               : '<span></span>') +
             '<span class="strip__label">' + esc(name) +
               '<span class="meta">' + esc(detail) + '</span></span>' +
             cells +
             ledgerCell(verdict) +
           '</div>';
  }

  /* a day a thing is not scheduled at all. NOT 'planned': app.css §16l draws
     data-status='off' as a bare centred dot precisely so a twice-weekly row
     does not read as a family failing five days a week. */
  function offCell() { return '<span class="cell" data-status="off"></span>'; }

  /* a day with a logged outcome, or a prescribed day not yet logged */
  function statusCell(status, iso, today) {
    return '<span class="cell" data-status="' + status + '"' +
             (iso === today ? ' data-today' : '') + '>' +
             esc(ui.glyph(status)) + '</span>';
  }

  /* a day carrying a QUANTITY rather than an outcome — the minutes of waiting a
     day costs, and the minutes of the weekly visit. A .cell with no data-status
     is the neutral stock, so a figure can never be mistaken for a status. */
  function figureCell(mins, iso, today) {
    if (!mins) return offCell();
    return '<span class="cell"' + (iso === today ? ' data-today' : '') + '>' +
             String(Math.round(mins)) + '</span>';
  }

  function burden(root) {
    var client = demo();
    var today = ART.store.state.today;
    var week = ui.weekDates(ART.store.state.weekStart);
    var meter = ART.metrics.weekMeter(client, week[0]);
    var items = ART.protocolItems(client) || [];

    /* ---- the counts, all derived from the one dataset ------------------- */
    var total = 0;
    var doseCount = 0;
    var byKind = {};
    var waitTotal = 0;
    week.forEach(function (iso) {
      var day = ART.dayEntries(client, iso) || [];
      day.forEach(function (e) {
        total++;
        var kind = e.itemType || 'dose';
        if (kind === 'dose') {
          doseCount++;
          waitTotal += waitMinutes(e.waitLevel);
        } else {
          byKind[kind] = (byKind[kind] || 0) + 1;
        }
      });
    });
    var unwritten = total - doseCount;

    /* ---- the rows ------------------------------------------------------- */
    var rows = '';

    /* 1-3 · the foods. These are the booklet's own content: a line a day. */
    byTime(client).forEach(function (cp) {
      var proto = protoOf(cp);
      if (!proto) return;
      /* the wait is read off the DAY's own entry, not off the ClientProtocol:
         a maintenance dose carries waitLevel 0 whatever the protocol says, and
         what the family actually runs is the day */
      var mins = null;
      var cells = week.map(function (iso) {
        var dose = doseOn(client, iso, cp.protocolId);
        if (!dose) return offCell();
        if (mins === null) mins = waitMinutes(dose.waitLevel);
        return statusCell(dose.status, iso, today);
      }).join('');
      var state = cp.state === 'maintenance'
        ? 'maintenance'
        : 'wk ' + cp.week + ' of ' + cp.of;
      var detail = state + ' · ' + clockLabel(cp.timing) +
        (mins ? ' · then ' + mins + ' min of waiting' : ' · no wait');
      rows += ledgerRow(null, proto.allergen, detail, cells, 'booklet');
    });

    /* 4-5 · the drops and the spine tap. Prescribed, loggable, and recorded on
       no page anywhere — which is the point of the frame. */
    items.forEach(function (item) {
      var glyph = item.kind === 'drops' ? 'drop__glyph' : 'tap__glyph';
      var cells = week.map(function (iso) {
        var day = ART.dayItems(client, iso) || [];
        for (var i = 0; i < day.length; i++) {
          if (day[i].itemType === item.kind) {
            return statusCell(day[i].status, iso, today);
          }
        }
        return offCell();
      }).join('');
      /* the cadence is printed, always: twice a week is not 'daily, missed five
         times', and it is the whole reason tapping is trackable at all */
      var when = item.cadenceKind === 'daily' ? 'every day' : item.cadence;
      var detail = ART.itemDose(item.kind, item.doseValue) + ' · ' +
        clockLabel(item.timing) + ' · ' + when;
      rows += ledgerRow(glyph, item.label, detail, cells, 'nowhere');
    });

    /* 6 · the wait, which the page writes ONCE and the family runs every day,
       at a different length per food. */
    if (waitTotal) {
      var topDay = 0;
      var lowDay = -1;
      var waitCells = week.map(function (iso) {
        var mins = 0;
        ART.dayDoses(client, iso).forEach(function (dose) {
          mins += waitMinutes(dose.waitLevel);
        });
        if (mins > topDay) topDay = mins;
        if (mins && (lowDay < 0 || mins < lowDay)) lowDay = mins;
        return figureCell(mins, iso, today);
      }).join('');
      /* 'up to' only when the days actually differ — a flat week stated as a
         range reads as hedging about a figure that is simply the same */
      var perDay = (lowDay === topDay ? '' : 'up to ') + topDay + ' a day';
      rows += ledgerRow(null, 'Waiting after a dose',
        'minutes · ' + perDay + ' · different per food',
        waitCells, 'margin');
    }

    /* 7 · the appointment, which is also a margin note — and is the reason the
       margin note exists at all. */
    var visitCells = week.map(function (iso) {
      if (ui.dayShort(iso) !== APPOINTMENT.dayShort) return offCell();
      return figureCell(APPOINTMENT.minutes, iso, today);
    }).join('');
    rows += ledgerRow(null, 'The weekly visit',
      'minutes · ' + APPOINTMENT.dayShort + ' ' + clockLabel(APPOINTMENT.at) +
      ' · next week gets written',
      visitCells, 'margin');

    /* ---- the head row --------------------------------------------------- */
    var dayHead = week.map(function (iso) {
      return '<span' + (iso === today ? ' data-today' : '') + '>' +
               esc(ui.dayShort(iso)) + ' ' + esc(String(+iso.slice(8, 10))) +
             '</span>';
    }).join('');

    var ledger =
      '<div class="strip">' +
        '<div class="strip__head" style="' + LEDGER_COLS + '">' +
          '<span></span>' +
          '<span class="meta" style="justify-self:stretch;text-align:left">' +
            'Week of ' + esc(ui.md(week[0])) + '</span>' +
          dayHead +
          '<span class="meta" style="justify-self:stretch;text-align:left">' +
            'Written down?</span>' +
        '</div>' +
        rows +
      '</div>';

    /* ---- the three figures ---------------------------------------------- */
    /* `unwritten` is the frame's whole claim, so it is the one that gets the
       44px treatment. The gap line under it is read from weekMeter().gaps, so
       it names the actual outstanding items and can never go stale. */
    /* Held to ONE line on purpose: a .kpi__sub that wraps costs this frame 20
       of its 28px of slack, and these three figures are the last thing in it. */
    var gapWords = meter.gaps.length
      ? 'Still unlogged: ' + meter.gaps.map(function (g) {
          return esc(String(g.label).toLowerCase()) + ' ' + esc(ui.md(g.dateISO));
        }).join(', ')
      : 'Every one of them logged, so far this week';

    /* ONE LABEL PER KIND. This was a two-way ternary — drops, or else "spine
       taps" — and the kinds that reach it are 'alka', 'drops' and 'tapping'.
       So the seven weekly Alka-Seltzer tablets printed as "7 spine taps", and
       the frame told an allergy practice the child receives NINE spinal taps
       a week beside a plan that says two. A clinic reads that number first. */
    var KIND_LABEL = {
      alka:    'Alka-Seltzer tablets',
      drops:   'days of drops',
      tapping: 'spine taps'
    };
    var kinds = Object.keys(byKind).map(function (k) {
      return byKind[k] + ' ' + (KIND_LABEL[k] || k);
    }).join(', ');

    var figures =
      '<div class="kpirow">' +
        '<div class="kpi">' +
          '<p class="kpi__label">With a time on it</p>' +
          '<p class="kpi__value">' + total + ' <small>this week</small></p>' +
          '<p class="kpi__sub">' + doseCount + ' food doses' +
            (kinds ? ', ' + esc(kinds) : '') + '.</p>' +
        '</div>' +
        '<div class="kpi" data-emph>' +
          '<p class="kpi__label">No line on any page</p>' +
          '<p class="kpi__value">' + unwritten + ' <small>of them</small></p>' +
          '<p class="kpi__sub">' + gapWords + '.</p>' +
        '</div>' +
        '<div class="kpi">' +
          '<p class="kpi__label">Waiting after a dose</p>' +
          '<p class="kpi__value">' + hm(waitTotal) + ' <small>a week</small></p>' +
          '<p class="kpi__sub">From one line in the margin, run by the family ' +
            'every day.</p>' +
        '</div>' +
      '</div>';

    /* No .zone__note, for the same reason `concurrency` has none: this frame's
       argument is its mandatory caption, and a note above the ledger would be
       that argument a second time — 26px of a 600px frame spent saying one
       thing twice. The ledger's own header row carries the orientation ('Week
       of 10/19 … Written down?'), which is what a note would otherwise do. */
    root.innerHTML =
      head('The same week', 'What else they carry') +
      zbody(
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          ledger +
          figures +
          cap('<strong>The booklet captures the food.</strong> The rest lives ' +
              'in one margin note &mdash; <em>&ldquo;' + APPOINTMENT.margin +
              '&rdquo;</em> &mdash; or nowhere at all.') +
        '</div>'
      );
  }

  /* ============================================================== exports */

  ART.zones.story = {
    title: title,
    booklet: booklet,
    concurrency: concurrency,
    wait: wait,
    burden: burden
  };
})();
