/* ===========================================================================
   A.R.T. pitch canvas — js/zone-owner.js    owner: analytics        SPEC §6.4
   ---------------------------------------------------------------------------
   Section 4, "What the practice learns", is TWO frames and this file renders
   both of them:

     macro   1960 x 1180   the practice overview, condensed to the four things
                           §6.4 names: four derived KPIs, the adherence trend,
                           adherence by practitioner, and the protocol library
                           governance table. Everything is scoped by the one
                           range control.

     phases  2000 x 1180   NEW, and the centrepiece. It answers two questions
                           with charts and no sentences:
                             1  how long does each phase ACTUALLY take
                             2  where does it stall, and FOR WHOM
                           Band 1 is the finding itself, in figures, so the
                           worked example is readable the moment the frame is
                           on screen rather than after a hunt. Band 2 is the
                           ranked chart on the left and, on the right, the row
                           you picked broken down two ways: by age band with
                           the repeat-day share beside it, and as the raw
                           distribution of every run behind that median.

   Both frames are built only from classes that exist in css/app.css: .kpirow
   gives the vertical hairlines between columns, sibling .panel gives the
   horizontal one between bands, .chart hosts a hand-written SVG. The only
   inline styles anywhere are the two sizing custom properties tokens
   sanctions (--tbl-h, --tip-arrow).

   Standing client rule honoured here: DATA, NOT PROSE. Every explainer is one
   line of twelve words or fewer, every hover carries the arithmetic, and
   nothing on screen grades a child — a phase that ran long is reported as
   days, never as a verdict.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var esc = ui.esc;

  var F = ART.charts.fmt;
  var pct = F.pct;
  var k = F.thousands;
  var r1 = F.r1;
  var signed = F.signed;

  /* ======================================================== geometry =======
     Authored in real pixels so every chart renders 1:1 and all chart text is
     exactly 12px. A .window costs 2px of border; .panel__body costs 20px each
     side; a .kpi costs 24px each side plus a 1px hairline, except the first,
     which has no left padding and no border.

     A chart column is a .panel inside its .kpi, so its head and body get the
     band padding the dashboard already uses — which is what lets the right
     column of `phases` stack two chart blocks and have the hairline from
     `.panel + .panel` separate them, with no new CSS and no cramped gap.   */

  var MACRO_W = 1960 - 2;                  /* 1958 inside the window border  */
  var MACRO_ROW = MACRO_W - 40;            /* 1918 inside .panel__body       */
  var MACRO_TRACK = MACRO_ROW / 2;         /* 959 per column                 */
  var MACRO_A = MACRO_TRACK - 24 - 40;     /* 895 — first column, no left pad */
  var MACRO_B = MACRO_TRACK - 49 - 40;     /* 870 — second column            */
  var MACRO_CH = 214;                      /* both charts, so the row is level */
  var MACRO_TBL = 350;

  var PH_W = 2000 - 2;                     /* 1998                           */
  var PH_ROW = PH_W - 40;                  /* 1958                           */
  var PH_TRACK = PH_ROW / 2;               /* 979                            */
  var PH_A = PH_TRACK - 24 - 40;           /* 915 — the ranked chart         */
  var PH_B = PH_TRACK - 49 - 40;           /* 890 — the selected phase       */
  var PH_RANK_H = 640;                     /* 18 rows at a 31px pitch        */
  var PH_BAND_H = 290;                     /* 5 age bands at a 43px pitch    */
  var PH_RUNS_H = 250;

  /* ------------------------------------------------------------ view state -
     Which panels are showing their Table view. Module-local on purpose: it is
     presentation, not data, so it must not live in the shared store. The
     phases keys survive a selection re-render, which is what lets a reader
     pick rows while the table is open.                                     */
  var view = { trend: 0, people: 0, rank: 0, bands: 0, runs: 0 };

  /* ------------------------------------------------------------- helpers -- */

  function median(sorted) {
    if (!sorted.length) return 0;
    var m = Math.floor(sorted.length / 2);
    var v = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    return Math.round(v * 10) / 10;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function runs(n) { return plural(n, 'run', 'runs'); }

  /* "Egg · French toast". The food form is deliberately NOT in the row label:
     egg phase 5 carries five forms in one string and it would set the gutter
     width for all eighteen rows. It rides in the hover instead. */
  function phaseName(row) { return row.allergen + ' · ' + row.phaseLabel; }

  function kpi(label, value, sub, opts) {
    var o = opts || {};
    return '<div class="' + ui.cls('kpi', o.cls) + '"' +
      (o.emph ? ' data-emph' : '') +
      (o.id ? ' id="' + o.id + '"' : '') +
      (o.describe ? ' tabindex="0" aria-describedby="' + o.describe + '"' : '') + '>' +
      '<div class="kpi__label">' + esc(label) + '</div>' +
      '<div class="kpi__value">' + value + '</div>' +
      '<p class="kpi__sub">' + (o.subHtml || esc(sub)) + '</p>' +
      (o.after || '') +
      '</div>';
  }

  /* The Table toggle keeps ONE label and shows its state two ways: the
     pressed button loses .btn--quiet so it reads as a held control, and
     aria-pressed says the same thing to a screen reader. `loud` marks the one
     instance per frame that carries the "Show what's live" ring — §7 rings a
     repeated control once. */
  function tableBtn(key, loud) {
    var on = view[key];
    return '<button class="' + (on ? 'btn btn--sm' : 'btn btn--quiet btn--sm') + '" ' +
      'type="button" id="owner-view-' + key + '" data-view="' + key + '" ' +
      'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
      'data-live="table view" data-hint="' + (loud ? 'below' : 'quiet') + '">Table</button>';
  }

  function head(title, key, loud, extra) {
    return '<div class="panel__head">' +
      '<div><span class="eyebrow">' + esc(title) + '</span></div>' +
      '<div class="panel__actions">' + (extra || '') +
        (key ? tableBtn(key, loud) : '') + '</div>' +
      '</div>';
  }

  /* One chart block: a head of its own and the chart under it. Two of these in
     one column are separated by the `.panel + .panel` hairline. */
  function block(title, key, chartId, loud, extra, live) {
    return '<div class="panel">' +
      head(title, key, loud, extra) +
      '<div class="panel__body">' +
        '<div class="chart" id="' + chartId + '"' +
        (live ? ' data-live="' + esc(live) + '" data-hint="below"' : '') + '></div>' +
      '</div>' +
      '</div>';
  }

  function column(title, key, chartId, loud, extra, live) {
    return '<div class="kpi" data-col="' + (key || chartId) + '">' +
      block(title, key, chartId, loud, extra, live) +
      '</div>';
  }

  /* `phases` is a FINDING, not a screen, and it sits directly beside `macro`,
     which IS one. Rule 15 forbids two adjacent frames reading as the same kind
     of object, and with the same navy chrome, the same art-practice.app URL bar
     and the same four-tile KPI strip under the head they read as two copies of
     one dashboard. So this frame gets the window MATERIAL without the window
     CHROME — .window--bare drops the bar — and leads on type instead of tiles. */
  function report(opts) {
    return '<div class="zone__head">' +
        '<p class="zone__eyebrow">' + esc(opts.eyebrow) + '</p>' +
        '<h2 class="zone__title">' + esc(opts.title) + '</h2>' +
        '<p class="zone__note">' + opts.note + '</p>' +
      '</div>' +
      '<div class="zone__body">' +
        '<div class="window window--bare">' +
          '<div class="window__body">' + opts.body + '</div>' +
        '</div>' +
      '</div>';
  }

  function frame(opts) {
    return '<div class="zone__head">' +
        '<p class="zone__eyebrow">' + esc(opts.eyebrow) + '</p>' +
        '<h2 class="zone__title">' + esc(opts.title) + '</h2>' +
        '<p class="zone__note">' + opts.note + '</p>' +
      '</div>' +
      '<div class="zone__body">' +
        '<div class="window">' +
          '<div class="window__bar">' +
            '<div class="window__dots"><span></span><span></span><span></span></div>' +
            '<span class="window__url">art-practice.app/<b>' + esc(opts.url) + '</b></span>' +
            '<p class="meta">' + opts.bar + '</p>' +
          '</div>' +
          '<div class="window__body">' + opts.body + '</div>' +
        '</div>' +
      '</div>';
  }

  /* ========================================================================
     MACRO — the practice overview
     ===================================================================== */

  function macroModel() {
    var st = ART.store.state;
    var range = st.ownerRange;
    var from = ui.addDays(st.today, -(range - 1));

    var adh = ART.metrics.adherence(null, from, st.today);
    var counts = ART.metrics.counts();
    var wtf = ART.metrics.weeksToFreedom(range);
    var trend = ART.metrics.adherenceTrend(range);
    var people = ART.metrics.byPractitioner(range);
    var byType = ART.metrics.byItemType(range);

    var pooled = [];
    wtf.forEach(function (r) { pooled = pooled.concat(r.weeksList); });
    pooled.sort(function (a, b) { return a - b; });

    var openSlots = 0;
    people.forEach(function (p) { openSlots += p.openSlots; });

    return {
      range: range, from: from, today: st.today,
      adh: adh, counts: counts, wtf: wtf, trend: trend, people: people,
      byType: byType, pooled: pooled, med: median(pooled), openSlots: openSlots,
      protocols: (ART.db.protocols || []).map(function (p) {
        var on = 0;
        (ART.db.clients || []).forEach(function (c) {
          if (c.status !== 'active') return;
          for (var i = 0; i < c.protocols.length; i++) {
            if (c.protocols[i].protocolId === p.id) { on++; return; }
          }
        });
        return {
          id: p.id, allergen: p.allergen, version: p.version, state: p.state,
          phases: p.phases.length, weeks: p.weeks, updatedISO: p.updatedISO,
          authorNote: p.authorNote, maintenance: p.maintenance, clients: on
        };
      })
    };
  }

  function macroBandOne(m) {
    var seg = ['7', '28', '90'].map(function (n) {
      return '<button class="seg__item" type="button" data-range="' + n + '" ' +
        'aria-pressed="' + (m.range === +n ? 'true' : 'false') + '">' +
        n + ' days</button>';
    }).join('');

    /* ONE definition, and it now spans three kinds of prescribed item, so the
       tip names all three rather than saying "doses" and meaning more. */
    var definition =
      '<div class="tip" id="owner-adh-def" data-arrow="none" hidden>' +
      '<b>Adherence = every prescribed item logged &divide; items planned</b>, ' +
      'for every date up to today &mdash; food doses, the morning tablet, the ' +
      'daily drops and the spine tap, one definition for all four. ' +
      '<b>Held</b> and <b>skipped</b> ' +
      'count as logged: the failure this fixes is <b>not knowing</b>, not a ' +
      'held dose.' +
      '<br>Last ' + m.range + ' days: <span class="mono">' + k(m.adh.logged) +
      ' &divide; ' + k(m.adh.planned) + '</span>' +
      m.byType.map(function (t) {
        return '<br>' + esc(t.label) + ': <span class="mono">' + k(t.logged) +
          ' &divide; ' + k(t.planned) + ' = ' + pct(t.pct) + '</span>';
      }).join('') +
      '</div>';

    var typeLine = m.byType.map(function (t) {
      return esc(t.label.toLowerCase()) + ' <span class="mono">' + pct(t.pct) + '</span>';
    }).join(' · ');

    var tiles =
      kpi('Active clients', String(m.counts.activeClients),
        plural(m.counts.paused, 'paused', 'paused') + ' · ' +
        plural(m.counts.practitioners, 'practitioner', 'practitioners') + ' · ' +
        plural(m.counts.centres, 'centre', 'centres')) +

      kpi('Adherence', pct(m.adh.pct), '',
        { emph: true, cls: 'chart', id: 'owner-kpi-adh', describe: 'owner-adh-def',
          subHtml: k(m.adh.logged) + ' of ' + k(m.adh.planned) +
            ' planned items logged<br>' + typeLine,
          after: definition }) +

      kpi('Median weeks to food freedom',
        r1(m.med) + ' <small>wks</small>',
        m.pooled.length
          ? 'median of ' + plural(m.pooled.length, 'graduation', 'graduations') +
            ' · range ' + m.pooled[0] + '–' + m.pooled[m.pooled.length - 1]
          : 'no graduations finished inside this window') +

      kpi('Waitlist', String(m.counts.waitlist),
        plural(m.openSlots, 'open slot', 'open slots') + ' · ' +
        m.counts.graduated + ' graduated all-time');

    return '<div class="panel">' +
      '<div class="panel__head">' +
        '<div>' +
          '<span class="eyebrow">Practice overview</span>' +
          '<p class="meta">Every figure below is scoped to this window.</p>' +
        '</div>' +
        '<div class="panel__actions">' +
          '<p class="meta">Range</p>' +
          '<div class="seg" id="owner-range" role="group" aria-label="Date range" ' +
            'data-live="date range">' + seg + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel__body"><div class="kpirow">' + tiles + '</div></div>' +
      '</div>';
  }

  function macroBandTwo() {
    var cohort =
      '<span class="chip chip--navy">Staff</span>' +
      '<span class="chip chip--peri">Independent</span>';

    return '<div class="panel"><div class="panel__body"><div class="kpirow">' +
      column('Adherence trend', 'trend', 'owner-chart-trend', true) +
      column('Adherence by practitioner', 'people', 'owner-chart-people', false, cohort) +
      '</div></div></div>';
  }

  var STATE_CHIP = {
    published: 'chip--navy', review: 'chip--peri', draft: 'chip--neutral'
  };
  var STATE_WORD = {
    published: 'Published', review: 'In review', draft: 'Draft'
  };
  var STATE_RANK = { review: 0, draft: 1, published: 2 };

  function macroBandThree(m) {
    var rows = m.protocols.slice().sort(function (a, b) {
      return (STATE_RANK[a.state] - STATE_RANK[b.state]) ||
        (b.clients - a.clients) ||
        a.allergen.localeCompare(b.allergen);
    });

    var body = rows.map(function (p) {
      return '<tr>' +
        '<td data-key>' + esc(p.allergen) +
          ' <span class="mono">' + esc(p.version) + '</span></td>' +
        '<td><span class="chip ' + STATE_CHIP[p.state] + '">' +
          esc(STATE_WORD[p.state]) + '</span></td>' +
        '<td data-num>' + p.phases + '</td>' +
        '<td data-num>' + p.weeks + '</td>' +
        '<td data-num>' + (p.clients || '—') + '</td>' +
        '<td>' + (p.authorNote ? esc(p.authorNote) : '—') + '</td>' +
        '<td data-num>' + esc(ui.md(p.updatedISO)) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="panel">' +
      '<div class="panel__head">' +
        '<div>' +
          '<span class="eyebrow">Protocol library</span>' +
          '<p class="meta">Only the owner publishes · independents inherit ' +
            'that version.</p>' +
        '</div>' +
        '<div class="panel__actions">' +
          '<button class="btn btn--quiet btn--sm" type="button" data-static ' +
            'aria-disabled="true">Publish version</button>' +
        '</div>' +
      '</div>' +
      '<div class="panel__body">' +
      /* the id is load-bearing: ART.ui.keepFocus restores scroll by id, so the
         library stays where the viewer left it across a re-render */
      '<div class="tblwrap" id="owner-library-scroll" data-scroll data-nopan ' +
        'style="--tbl-h:' + MACRO_TBL + 'px">' +
        '<table class="tbl tbl--dense">' +
        '<thead><tr>' +
          '<th scope="col">Protocol version</th>' +
          '<th scope="col">State</th>' +
          '<th scope="col" data-num>Phases</th>' +
          '<th scope="col" data-num>Planned wks</th>' +
          '<th scope="col" data-num>Clients on it</th>' +
          '<th scope="col">Version note</th>' +
          '<th scope="col" data-num>Updated</th>' +
        '</tr></thead>' +
        '<tbody>' + body + '</tbody></table>' +
      '</div>' +
      '</div></div>';
  }

  function drawTrend(m, el, W) {
    var cap = 'Logged &divide; planned, every day. Today is still partial.';
    var data = m.trend.map(function (p, i) {
      var last = i === m.trend.length - 1;
      return {
        x: ui.md(p.dateISO),
        y: p.pct,
        label: ui.dayLabel(p.dateISO) + (last ? ' · today' : ''),
        note: k(p.logged) + ' of ' + k(p.planned) + (last ? ' logged so far' : ' logged')
      };
    });

    if (view.trend) {
      return ART.charts.tableView(el,
        ['Day', { label: 'Logged', num: true }, { label: 'Planned', num: true },
          { label: 'Adherence', num: true }],
        m.trend.slice().reverse().map(function (p) {
          return [
            ui.dayLabel(p.dateISO) + (p.dateISO === m.today ? ' · today' : ''),
            k(p.logged), k(p.planned), pct(p.pct)
          ];
        }),
        { height: MACRO_CH, caption: cap });
    }

    var ys = m.trend.map(function (p) { return p.pct; });
    ART.charts.area(el, {
      data: data,
      width: W, height: MACRO_CH,
      yDomain: [0, 100],
      yFmt: pct,
      axisLabel: '% of planned items logged',
      endNote: 'today, partial',
      caption: cap,
      ariaLabel: 'Adherence trend over ' + m.range + ' days, from ' +
        pct(Math.min.apply(null, ys)) + ' to ' + pct(Math.max.apply(null, ys)) +
        ', ending ' + pct(ys[ys.length - 1]) + ' today so far. ' +
        'Left and right arrow keys read each day.'
    });
  }

  function drawPeople(m, el, W) {
    var cap = 'Every practitioner, the same definition as above.';

    if (view.people) {
      return ART.charts.tableView(el,
        ['Practitioner', 'Centre', { label: 'Clients', num: true },
          { label: 'Adherence', num: true }, { label: 'Open', num: true }],
        m.people.map(function (p) {
          return [
            { html: esc(p.name) + '<div><span class="chip ' +
              (p.kind === 'independent' ? 'chip--peri' : 'chip--navy') + '">' +
              (p.kind === 'independent' ? 'Independent' : 'Staff') + '</span></div>' },
            p.centre, String(p.clients), pct(p.pct), String(p.openSlots)
          ];
        }),
        { height: MACRO_CH, caption: cap });
    }

    ART.charts.bars(el, {
      data: m.people.map(function (p) {
        return {
          label: p.name,
          note: p.centre,
          value: p.pct,
          cohort: p.kind === 'independent',
          tip: '<span class="mono">' + k(p.logged) + ' of ' + k(p.planned) +
            '</span> items logged<br>' + plural(p.clients, 'client', 'clients') +
            ' · ' + plural(p.openSlots, 'open slot', 'open slots')
        };
      }),
      width: W, height: MACRO_CH,
      max: 100,
      barHeight: 26,
      valueFmt: pct,
      axisLabel: '% of planned items logged',
      caption: cap
    });
  }

  function macroPaint(root) {
    var m = macroModel();

    root.innerHTML = frame({
      eyebrow: 'Owner · all centres',
      title: 'Practice overview',
      /* Four, because the breakdown directly beneath it lists four. */
      note: 'Every figure comes from the same logs — food doses, the tablet, ' +
        'the drops and the spine tap.',
      url: 'overview',
      bar: 'Owner scope · all centres and independents',
      body: macroBandOne(m) + macroBandTwo() + macroBandThree(m)
    });

    [[drawTrend, '#owner-chart-trend', MACRO_A],
     [drawPeople, '#owner-chart-people', MACRO_B]].forEach(function (job) {
      var el = root.querySelector(job[1]);
      if (el) job[0](m, el, job[2]);
    });
  }

  /* ========================================================================
     PHASES — how long each phase really takes, and where it stalls
     ===================================================================== */

  function phasesModel() {
    var ranked = ART.metrics.overrunRanked(0);
    var key = ART.metrics.phaseKey(ART.store.state.phaseKey);

    var sel = null, rank = 0;
    ranked.forEach(function (r, i) {
      if (r.phaseKey === key) { sel = r; rank = i + 1; }
    });
    /* A key the dataset does not carry (a phase whose n fell under the floor)
       falls back to rank 1, which is also where the frame opens. */
    if (!sel && ranked.length) { sel = ranked[0]; rank = 1; key = sel.phaseKey; }

    var bands = sel ? ART.metrics.overrunByAge(key) : [];
    var worst = bands.slice().sort(function (a, b) {
      return b.overrun - a.overrun || b.repeatPct - a.repeatPct || b.n - a.n;
    })[0] || null;

    /* The micro view the macro aggregates: every completed run of this phase,
       binned on the day it finished. */
    var rows = (ART.db.phaseRuns || []).filter(function (r) {
      return r.phaseKey === key;
    });
    var planned = sel ? sel.plannedDays : 0;
    var lo = planned, hi = planned, counts = {};
    rows.forEach(function (r) {
      lo = Math.min(lo, r.actualDays);
      hi = Math.max(hi, r.actualDays);
      counts[r.actualDays] = (counts[r.actualDays] || 0) + 1;
    });
    /* one empty bin either side, then widened to nine so a four-day phase does
       not render as four columns the width of a hand */
    lo = Math.max(0, lo - 1); hi = hi + 1;
    while (hi - lo + 1 < 9) { hi += 1; if (lo > 0) lo -= 1; }
    var bins = [];
    for (var d = lo; d <= hi; d++) {
      bins.push({ day: d, count: counts[d] || 0, band: d > planned });
    }
    var past = 0, onPlan = 0, under = 0;
    rows.forEach(function (r) {
      if (r.actualDays > planned) past++;
      else if (r.actualDays === planned) onPlan++;
      else under++;
    });

    return {
      ranked: ranked, key: key, sel: sel, rank: rank,
      bands: bands, worst: worst,
      runs: rows, bins: bins, past: past, onPlan: onPlan, under: under,
      totalRuns: (ART.db.phaseRuns || []).length
    };
  }

  /* The one line §6.4 asks for: at most twelve words, stating what the finding
     means for the PLAN — not restating the figures in the sentence above it,
     which was the whole fault of the line this replaces. It carries the
     consequence and the knock-on NOTES §B3 asks for: what to plan instead, and
     how far the whole food moves because of it. Derived, so it stays true for
     whichever row is selected, and it reports days, never a judgement about a
     child. */
  function knockOn(days) {
    var d = Math.abs(days);
    if (d < 3.5) return 'a few days';
    var w = Math.round(d / 7);
    if (w <= 1) return 'about a week';
    return 'about ' + (NUMWORD[w] || String(w)) + ' weeks';
  }

  var NUMWORD = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

  /* 'Under 2' -> 'under 2', 'Egg' -> 'egg': both read mid-sentence. An all-caps
     or hyphenated label ('11+') is left alone. */
  function lower(s) {
    s = String(s || '');
    return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  function planLine(m) {
    if (!m.sel || !m.worst) return 'No completed runs for this phase yet.';
    var b = m.worst;
    var food = lower(m.sel.allergen);
    var ov = r1(b.medianActual - b.plannedDays);
    /* REPORTS, DOES NOT PRESCRIBE. This line is the largest type on the
       frame and it used to open "Plan N days here, not M" — an instruction
       to change a clinical plan, issued by the software to the practice.
       The scope frame on this same board says, in as many words, that v1
       records the protocol and never decides it. So the line states what
       the runs did and what it costs downstream, and the decision stays
       with the practitioner reading it. */
    if (ov >= 0.5) {
      return 'Runs here take ' + r1(b.medianActual) + ' days against a planned ' +
        r1(b.plannedDays) + '; ' + food + ' finishes ' + knockOn(ov) + ' later.';
    }
    if (ov <= -0.5) {
      return 'Runs here take ' + r1(b.medianActual) + ' days against a planned ' +
        r1(b.plannedDays) + '; ' + food + ' finishes ' + knockOn(ov) + ' earlier.';
    }
    return 'Every age band lands within a day of the planned ' +
      r1(b.plannedDays) + '.';
  }

  function phasesBandOne(m) {
    if (!m.sel) {
      return '<div class="panel"><div class="panel__body">' +
        '<p class="empty">No completed phase runs in the dataset.</p>' +
        '</div></div>';
    }
    var s = m.sel;
    var b = m.worst;
    var bandOv = b ? r1(b.medianActual - b.plannedDays) : 0;

    var scope = m.rank === 1
      ? 'The finding · worst overrun of ' + m.ranked.length + ' phases'
      : 'Selected phase · rank ' + m.rank + ' of ' + m.ranked.length + ' by overrun';

    /* ONE statement, set as type, in the order §6.4 writes it:
       `Egg · French toast · age 2–3 · planned 14 d · actual 21 d · +7 · 38%
       repeat days`. A reader who looks at this frame for five seconds should
       leave with that sentence, and a four-tile KPI strip is the shape of a
       dashboard rather than the shape of a finding. Every part is derived, so
       selecting another row in the chart below rewrites the sentence. */
    var proto = ART.store.protocol(s.protocolId);
    var ageOf = b ? b.ageBandLabel : null;
    var plan = b ? b.plannedDays : s.plannedDays;
    var act = b ? b.medianActual : s.medianActual;
    var rep = b ? b.repeatPct : s.repeatPct;

    var run =
      part(esc(s.allergen), 'name') +
      part(esc(s.phaseLabel), 'name') +
      (ageOf ? part('age <b>' + esc(lower(ageOf)) + '</b>', 'age') : '') +
      part('planned <b>' + r1(plan) + ' d</b>', 'fig') +
      part('actual <b>' + r1(act) + ' d</b>', 'fig') +
      part('<b>' + signed(b ? bandOv : s.overrun) + '</b>',
           (b ? bandOv : s.overrun) < 0 ? 'under' : 'over') +
      part('<b>' + pct(rep) + '</b> repeat days', 'fig');

    var support =
      'phase <span class="mono">' + (s.phaseIdx + 1) + ' of ' +
        (proto ? proto.phases.length : s.phaseIdx + 1) + '</span> · ' +
      runs(s.n) + ' completed' +
      (b ? ' · this band ' + runs(b.n) + ', middle half <span class="mono">' +
           r1(b.p25) + '–' + r1(b.p75) + ' d</span> of five bands' +
           ' · all ages ' + signed(s.overrun) + ' d' : '') +
      ' · <span class="mono">' + k(b ? b.repeatDays : s.repeatDays) + ' of ' +
        k(b ? b.totalDays : s.totalDays) + '</span> days repeated the same step';

    return '<div class="panel">' +
      '<div class="panel__head">' +
        '<div>' +
          '<span class="eyebrow">' + esc(scope) + '</span>' +
          '<p class="meta">A repeated day and a long phase are different problems.</p>' +
        '</div>' +
        '<div class="panel__actions">' +
          '<p class="meta"><strong>' + k(m.totalRuns) + '</strong> completed runs · ' +
            '<strong>' + m.ranked.length + '</strong> phases · ' +
            '<strong>5</strong> age bands</p>' +
        '</div>' +
      '</div>' +
      '<div class="panel__body">' +
        '<p class="finding">' + run + '</p>' +
        '<p class="finding__line" id="phases-plan-line">' + esc(planLine(m)) + '</p>' +
        '<p class="meta">' + support + '</p>' +
      '</div>' +
      '</div>';
  }

  /* one run of the finding sentence; `kind` is the only thing CSS is told */
  function part(html, kind) {
    return '<span class="finding__part" data-kind="' + kind + '">' + html + '</span>';
  }

  function phasesBandTwo(m) {
    var sel = m.sel ? phaseName(m.sel) : 'No phase';
    return '<div class="panel"><div class="panel__body"><div class="kpirow">' +
      column('Planned vs actual · every phase, worst overrun first', 'rank',
        'phases-chart-rank', true, '', 'select a phase') +
      '<div class="kpi" data-col="detail">' +
        block(sel + ' · by age band', 'bands', 'phases-chart-bands', false) +
        block('Runs by days to finish · ' + sel, 'runs', 'phases-chart-runs', false) +
      '</div>' +
      '</div></div></div>';
  }

  function drawRank(m, el, W) {
    var cap = '<strong>' + m.ranked.length + '</strong> phases · <strong>' +
      k(m.totalRuns) + '</strong> completed runs · all ages pooled.';

    if (view.rank) {
      return ART.charts.tableView(el,
        ['Phase', { label: 'Plan', num: true }, { label: 'p25', num: true },
          { label: 'Median', num: true }, { label: 'p75', num: true },
          { label: 'vs plan', num: true }, { label: 'Repeat', num: true },
          { label: 'n', num: true }],
        m.ranked.map(function (r) {
          return {
            rowAttrs: r.phaseKey === m.key ? ' aria-current="true"' : '',
            cells: [
              phaseName(r), r1(r.plannedDays) + ' d', r1(r.p25), r1(r.medianActual),
              r1(r.p75), signed(r.overrun), pct(r.repeatPct), String(r.n)
            ]
          };
        }),
        { height: PH_RANK_H, caption: cap });
    }

    ART.charts.spread(el, {
      data: m.ranked.map(function (r) {
        return {
          key: r.phaseKey,
          label: phaseName(r),
          n: r.n,
          planned: r.plannedDays,
          median: r.medianActual,
          p25: r.p25,
          p75: r.p75,
          rate: r.repeatPct,
          rateNote: k(r.repeatDays) + ' of ' + k(r.totalDays) + ' days',
          note: 'form <span class="mono">' + esc(r.foodForm) + '</span>',
          selected: r.phaseKey === m.key
        };
      }),
      width: W, height: PH_RANK_H,
      select: true,
      idPrefix: 'phases-rank',
      gutter: 214,
      axisLabel: 'days to complete a phase',
      rateAxisLabel: 'days re-administered',
      caption: cap
    });
  }

  function drawBands(m, el, W) {
    var sel = m.sel;
    if (!sel || !m.bands.length) {
      return ART.charts.tableView(el, ['Age band'], [['No age band has enough runs']],
        { height: PH_BAND_H });
    }
    var cap = 'Plan <strong>' + r1(sel.plannedDays) + ' d</strong> for every band · ' +
      'median and repeat share.';

    if (view.bands) {
      return ART.charts.tableView(el,
        ['Age band', { label: 'Plan', num: true }, { label: 'Median', num: true },
          { label: 'vs plan', num: true }, { label: 'Repeat', num: true },
          { label: 'n', num: true }],
        m.bands.map(function (b) {
          return {
            rowAttrs: (m.worst && b.ageBand === m.worst.ageBand) ? ' aria-current="true"' : '',
            cells: [
              b.ageBandLabel, r1(b.plannedDays) + ' d', r1(b.medianActual),
              signed(b.medianActual - b.plannedDays), pct(b.repeatPct), String(b.n)
            ]
          };
        }),
        { height: PH_BAND_H, caption: cap });
    }

    ART.charts.spread(el, {
      data: m.bands.map(function (b) {
        return {
          key: b.ageBand,
          label: b.ageBandLabel,
          n: b.n,
          planned: b.plannedDays,
          median: b.medianActual,
          p25: b.p25,
          p75: b.p75,
          rate: b.repeatPct,
          rateNote: k(b.repeatDays) + ' of ' + k(b.totalDays) + ' days',
          selected: !!(m.worst && b.ageBand === m.worst.ageBand)
        };
      }),
      width: W, height: PH_BAND_H,
      gutter: 128,
      rateW: 168,
      nLabel: 'runs',
      axisLabel: 'days to complete',
      rateAxisLabel: 'days re-administered',
      caption: cap
    });
  }

  function drawRuns(m, el, W) {
    var sel = m.sel;
    if (!sel) return;
    var n = m.runs.length;
    var cap = '<strong>' + m.past + '</strong> of <strong>' + n +
      '</strong> runs finished past the planned <strong>' + r1(sel.plannedDays) +
      ' d</strong>.';

    if (view.runs) {
      return ART.charts.tableView(el,
        [{ label: 'Finished on day', num: true }, { label: 'Runs', num: true },
          { label: 'Share', num: true }, 'Against plan'],
        m.bins.map(function (b) {
          return [
            String(b.day), String(b.count),
            n ? pct((b.count / n) * 100) : '0%',
            b.day > sel.plannedDays
              ? signed(b.day - sel.plannedDays) + ' d past plan'
              : (b.day === sel.plannedDays ? 'on plan'
                : signed(b.day - sel.plannedDays) + ' d under plan')
          ];
        }),
        { height: PH_RUNS_H, caption: cap });
    }

    ART.charts.columns(el, {
      data: m.bins.map(function (b) {
        return {
          label: String(b.day),
          value: b.count,
          band: b.band,
          note: (n ? pct((b.count / n) * 100) : '0%') + ' of runs · ' +
            (b.day === sel.plannedDays ? 'on plan'
              : signed(b.day - sel.plannedDays) + ' d vs plan')
        };
      }),
      width: W, height: PH_RUNS_H,
      maxBar: 999,
      tickFmt: function (v) { return String(v); },
      valueFmt: function (v) { return plural(v, 'run', 'runs'); },
      itemLabel: 'Finished on day',
      annotate: 'past plan',
      axisLabel: 'days to complete · plan ' + r1(sel.plannedDays) + ' d',
      caption: cap
    });
  }

  function phasesPaint(root) {
    var m = phasesModel();

    root.innerHTML = report({
      eyebrow: 'Owner · phase analytics',
      title: 'How long each phase really takes',
      note: 'Planned days against actual. Select a row to see who it stalls for.',
      body: phasesBandOne(m) + phasesBandTwo(m)
    });

    [[drawRank, '#phases-chart-rank', PH_A],
     [drawBands, '#phases-chart-bands', PH_B],
     [drawRuns, '#phases-chart-runs', PH_B]].forEach(function (job) {
      var el = root.querySelector(job[1]);
      if (el) job[0](m, el, job[2]);
    });
  }

  /* ============================================================== wiring == */

  /* One delegated click handler per frame root. It covers the mouse and the
     keyboard alike, because charts.js dispatches a real click when a row
     button takes Enter or Space. */
  function bind(root, repaint) {
    if (root._artOwnerBound) return;
    root._artOwnerBound = true;

    root.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var r = t.closest('[data-range]');
      if (r && root.contains(r)) {
        ART.store.set({ ownerRange: +r.getAttribute('data-range') });
        return;
      }

      /* a phase row: the store key is what makes the selection a fact the
         whole canvas could read, rather than a local highlight.

         The attribute is `data-select`, which is what charts.js puts on a
         selectable row's hit target — and the same attribute its keydown
         handler re-dispatches a click through, so Enter and Space land here
         too. It is NOT `data-key`: .tbl marks its key COLUMN with a bare
         data-key (no value), so reading that name matched the cell and
         returned an empty string, and this branch never fired at all. */
      var row = t.closest('[data-select]');
      if (row && root.contains(row)) {
        var key = row.getAttribute('data-select');
        if (key && key !== ART.store.state.phaseKey) ART.store.set({ phaseKey: key });
        return;
      }

      var v = t.closest('[data-view]');
      if (v && root.contains(v)) {
        var vk = v.getAttribute('data-view');
        view[vk] = view[vk] ? 0 : 1;
        ui.keepFocus(root, function () { repaint(root); });
      }
    });
  }

  /* The adherence definition tip, anchored by .kpi.chart (position:relative). */
  function bindDefTip(root) {
    if (root._artDefBound) return;
    root._artDefBound = true;

    function defTip(on) {
      var tip = root.querySelector('#owner-adh-def');
      if (tip) tip.hidden = !on;
    }
    function inTile(n) { return !!(n && n.closest && n.closest('#owner-kpi-adh')); }
    root.addEventListener('pointerover', function (e) {
      if (inTile(e.target)) defTip(true);
    });
    root.addEventListener('pointerout', function (e) {
      /* only hide when the pointer has genuinely left the tile — moving
         between the label, the figure and the sub-line must not flicker */
      if (inTile(e.target) && !inTile(e.relatedTarget)) defTip(false);
    });
    root.addEventListener('focusin', function (e) {
      if (e.target.id === 'owner-kpi-adh') defTip(true);
    });
    root.addEventListener('focusout', function (e) {
      if (e.target.id === 'owner-kpi-adh') defTip(false);
    });
  }

  /* Reset puts both frames back to charts as well as back to the data: a panel
     left in its Table view mid-pitch is exactly the stale state Reset exists
     to clear. The selected phase row returns to the finding with the store. */
  ART.store.on(function (keys) {
    if (keys.indexOf('reset') === -1) return;
    view = { trend: 0, people: 0, rank: 0, bands: 0, runs: 0 };
  });

  ART.zones = ART.zones || {};
  ART.zones.owner = {
    macro: function (root) {
      if (!root) return;
      bind(root, macroPaint);
      bindDefTip(root);
      macroPaint(root);
    },
    phases: function (root) {
      if (!root) return;
      bind(root, phasesPaint);
      phasesPaint(root);
    },
    /* kept so a composition that has not learned the two frame keys yet still
       renders the overview rather than nothing */
    render: function (root) { ART.zones.owner.macro(root); }
  };
})();
