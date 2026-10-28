/* ===========================================================================
   A.R.T. pitch board — js/zone-practitioner.js  owner: practitioner  SPEC §6.3
   ---------------------------------------------------------------------------
   Section 3 is the practitioner's console, split across three frames. This
   file owns three of the four; `ph-handoff` is the family app's own Today
   screen, rendered by ART.zones.family.phoneToday() so that screen has exactly
   one implementation on the board.

     roster     (80,3610,1320,1320)   a browser window — the console itself
     builder    (1480,3610,1240,1320) a LIFTED SHEET — "the one thing being
                                      acted on" (§5's card discipline names the
                                      week being built), and the frame the hero
                                      wire leaves from
     templates  (3320,3610,800,1320)  a bare sheet — the ramp editor, a diff

   Four materials in a row — window, lifted sheet, phone, bare sheet — so no
   two adjacent frames read as the same kind of object (§1.15).

   WHERE THE HERO WIRE STARTS.  w-handoff leaves the builder's right edge at
   world (2720, 3990), i.e. 380px below that frame's top. `Publish week` sits
   in the week-builder head, under a booklet panel sized so the button lands
   within ~15px of that origin and the packet reads as leaving it. If the
   booklet panel's content changes, re-measure against 380.

   CROSS-PRACTITIONER ACCESS IS OPEN (NOTES §A6, SPEC §6.3). Every `read-only`
   affordance is gone: the rail reads `My clients (16)` / `All clients (58)`
   and both scopes are fully usable, the roster names the owning practitioner,
   the practice strip shows every colleague's numbers, and a client who belongs
   to someone else carries edit attribution on the roster AND in the builder.
   Ownership decides responsibility, not visibility.

   LIVE CONTROLS — SPEC §7 and nothing beyond it:
     §7.1  Publish week    -> packet('w-handoff'), then publishPlan() ON
                              ARRIVAL + pulse('ph-handoff') + one toast, then
                              `Build next week again`
     §7.2  Seven steppers  -> draftStep(), along the REAL ramp steps
     §7.3  Stretch/compress the phase, and Hold here -> the ramp re-spaces and
                              the week below it follows
     §7.4  Roster row      -> set({focusClientId}); every surface follows
     +     the roster scope rail, because §6.3 requires both scopes "fully
           usable" and a dead `All clients (58)` is the read-only framing this
           revision exists to remove. Same interaction KIND as §7.4: it widens
           the list the rows come from.
     +     the day's time field and wait select write draftSet(), as before.

   RENDERED AND DELIBERATELY NOT WIRED (§7): `Fill ↓`, the four condition
   checkboxes, and the rest of the template editor — Skip this food form, Swap
   food form, Nudge one day, Save as a variant, Propose to the library. They
   carry data-static, a click on one is swallowed, and each names its real
   target so none of them is a stub.

   No colour, no radius, no shadow and no typeface is named in this file.
   Inline style is geometry only — grid templates, widths, padding, gaps, the
   two tunables §01 allows (--span, --tbl-h) — plus one token-named hairline
   for the roster's column divider (see crossFileRequests).
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var store = ART.store;
  var prep = ART.prep;
  var E = ui.esc;

  /* The signed-in practitioner: Mara's own, so the board opens on the roster
     that contains her. */
  var PRACT_ID = 'p-ren';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* --- roster geometry ----------------------------------------------------
     The window is 1320 wide; .window__body 1320, panels 20px either side.
     The table takes the full width because seven honest columns need it, and
     the focused client sits underneath with one column per concurrent
     protocol — which is the only way three ramps are legible at once. */
  /* 470 -> 540, UX audit 2026-10-28. Measured clientHeight 470 against
     scrollHeight 608: 138px, a fifth of the 16-row client list, behind an
     inner scrollbar. canvas.js grew the frame 1320 -> 1390, which is every
     pixel section 3's band has spare, and this takes all 70 of it. 68px is
     still hidden; closing it needs the section-3 band to grow, which
     cascades sections 4-8 and the world height. Reported, not done here. */
  var ROSTER_TBL_H = 540;          /* a part row at the cut says there is more;
                                      26px of it went to the finished-phase
                                      rows §5d/NOTES §B3 require in the detail
                                      panel, which has no slack of its own     */
  var PHASE_COL_RAMP = 380;        /* usable width of one protocol column     */

  /* --- builder geometry ---------------------------------------------------
     1240 wide, 1200 inside the panels. Measured against what each control
     actually needs, because the sheet is overflow:hidden and an over-wide row
     fails silently:
       day    124  'Mon 10/26' in 13px mono = 70, plus 'day 1 of 7'
       actual 170  a 26px .cell + the dose that was actually given
       dose   250  the small stepper around the widest ramp dose = 178
       time   124  a native time field wants 101 with its clock glyph
       wait   244  the select around '30 min + hot shower' = 160
       fill   1fr  the remainder, ~208, around 'Fill ↓' = 110
     912 + 5 gutters of 16 = 992, inside the 1200 the panels leave. */
  var DAY_GRID = '124px 170px 250px 124px 244px 1fr';
  /* a maintenance week is the same dose seven times and has nothing to fill
     forward, so the Fill column's width goes to a dose that is a sentence */
  var DAY_GRID_MAINT = '124px 170px minmax(0,1fr) 124px 244px';
  var DAY_GAP = '16px';

  /* --- templates geometry -------------------------------------------------
     800 wide, 760 inside the panels. A .ramp__lane is a two-column grid:
     --ramp-label (132px by default, which fits "MARA'S VARIANT" at 12px with
     .12em tracking) + 16px + the lane, so a lane is ~612px. The week lane
     divides that into 7 cells of ~85px, which holds 'whole serving' on two
     lines. The food-form lane is proportional, so its narrowest cell carries
     only a numeral and its length in days. */
  var LANE_W = 612;
  var LANE_MIN_CELL = 34;          /* a collapsed/skipped cell's floor        */

  /* attention tone -> the chip that carries it. Every one carries a glyph AND
     a word, so no status on this surface is encoded by colour alone. */
  var TONE = {
    react:   { cls: 'chip--react',   glyph: '!' },
    hold:    { cls: 'chip--hold',    glyph: '=' },
    miss:    { cls: 'chip--neutral', glyph: '–' },
    advance: { cls: 'chip--advance', glyph: '↑' },
    ok:      { cls: 'chip--ok',      glyph: '✓' }
  };

  /* a day with several items reads as its worst honest signal: a reaction
     always wins, then an unlogged item (the failure this product fixes), then
     a hold, then a skip. */
  var PREC = { reaction: 0, planned: 1, held: 2, skipped: 3, done: 4 };

  var WAIT_OPT = [
    { v: 3, t: '30 min + hot shower' },
    { v: 2, t: 'wait 15 min' },
    { v: 1, t: 'no wait' },
    { v: 0, t: 'none — maintenance' }
  ];

  var HOLD_MAX = 7;                /* 'Hold here for N more days', N <= 7     */

  /* ======================================================= local view state ==

     The roster scope and the ramp editor's two live edits live HERE and not in
     the store, for three reasons: they belong to one frame, no other zone
     derives anything from them, and a store key with no DEPS entry in app.js
     would never repaint anything. Each frame keeps its own root so a local
     change repaints only that frame.

     `edit.key` pins the edit to one client AND one phase: focus another child
     and the stretch is gone rather than silently applied to a ramp it was
     never meant for. */
  var view = { scope: 'mine', edit: null };
  var roots = {};
  var rendering = {};

  if (store.on) {
    store.on(function (keys) {
      if (!keys || keys.indexOf('reset') === -1) return;
      view = { scope: 'mine', edit: null };
    });
  }

  /* ========================================================= small helpers == */

  function metrics() { return ART.metrics; }

  function practitioner(id) {
    var ps = (ART.db && ART.db.practitioners) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === (id || PRACT_ID)) return ps[i];
    return null;
  }

  function centreName(id) {
    var cs = (ART.db && ART.db.centres) || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i].name;
    return '—';
  }

  function firstName(n) { return String(n || '').split(' ')[0]; }

  /* Idempotent: 'Ren O.' stays 'Ren O.'. Practitioners read the way clients do
     — a first name and an initial, per §1.12, because this document goes to
     A.R.T. and no invented full identity may be attached to their centres. */
  function shortName(n) {
    var bits = String(n || '').split(' ');
    return bits.length > 1 ? bits[0] + ' ' + bits[1].charAt(0) + '.' : bits[0];
  }

  function practName(id) {
    var p = practitioner(id);
    return p ? shortName(p.name) : '—';
  }

  /* '2026-04-13' -> '13 Apr 2026'. Parsed by hand: no argless Date anywhere. */
  function longDate(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return (+p[2]) + ' ' + MONTHS[(+p[1]) - 1] + ' ' + p[0];
  }

  function cpOf(client, protocolId) {
    if (!client) return null;
    for (var i = 0; i < client.protocols.length; i++) {
      if (client.protocols[i].protocolId === protocolId) return client.protocols[i];
    }
    return null;
  }

  function doseFor(client, iso, protocolId) {
    var list = client && client.days[iso];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].protocolId === protocolId) return list[i];
    }
    return null;
  }

  /* The whole day, not the food: client.days[iso] carries the drops and the
     spine tap too, and adherence counts all three (SPEC §5a). The strip says
     so in its column head rather than quietly counting one thing and naming
     another. */
  function dayRoll(client, iso) {
    var list = (client && client.days[iso]) || [];
    var worst = null, logged = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i].status;
      if (s !== 'planned') logged++;
      if (worst === null || (PREC[s] !== undefined && PREC[s] < PREC[worst])) worst = s;
    }
    return { n: list.length, logged: logged, status: worst || 'planned' };
  }

  function doseFaces(dose) {
    var hh = prep.household(dose);
    var gg = prep.grams(dose);
    return store.state.units === 'grams'
      ? { big: gg, small: hh }
      : { big: hh, small: gg };
  }

  function shortStatus(a) {
    var m;
    if (a.tone === 'react') return 'Reaction';
    if (a.tone === 'hold') {
      m = /Held (\d+)/.exec(a.label);
      return m ? 'Held ' + m[1] + 'd' : 'Held';
    }
    if (a.tone === 'miss') {
      m = /^(\d+)/.exec(a.label);
      return (m ? m[1] + ' ' : '') + 'missed';
    }
    if (a.tone === 'advance') return 'Advance';
    if (a.label === 'Paused') return 'Paused';
    return 'On track';
  }

  function chipFor(a, label) {
    var t = TONE[a.tone] || TONE.ok;
    return '<span class="chip ' + t.cls + '"><span class="mono">' + t.glyph +
      '</span>' + E(label) + '</span>';
  }

  function zoneHead(eyebrow, title, note) {
    return '' +
      '<div class="zone__head">' +
        '<div class="zone__eyebrow">' + E(eyebrow) + '</div>' +
        '<h2 class="zone__title">' + E(title) + '</h2>' +
        '<p class="zone__note">' + note + '</p>' +
      '</div>';
  }

  /* 7 -> '7 d', 1 -> '1 d'. One wording for a length in days, everywhere. */
  function days(n) { return n + ' d'; }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }

  /* ========================================================== the draft ===== */
  /* A draft always belongs to the focused client. startDraft() writes through
     the store, which re-enters render(); the nested pass for THIS frame is
     skipped and the outer one picks up the fresh draft. */

  function ensureDraft() {
    var s = store.state;
    if (s.draft && s.draft.clientId === s.focusClientId) return s.draft;
    return store.startDraft(s.focusClientId);
  }

  /* The dose a draft row would publish, built with the SAME factory
     publishPlan() uses, so the stepper, the phone and the week strip can never
     disagree about what Monday is. */
  function draftDose(client, draft, row) {
    var cp = cpOf(client, draft.protocolId);
    var proto = store.protocol(draft.protocolId);
    if (!proto) return null;
    var phaseIdx = Math.min(cp ? cp.phaseIdx : 0, proto.phases.length - 1);
    return ART.makeDose(client, draft.protocolId, phaseIdx, row.stepIdx, row.dateISO, {
      timing: row.timing,
      waitLevel: row.waitLevel,
      status: 'planned',
      isMaintenance: !!draft.maintenance
    });
  }

  function draftPhase(client, draft) {
    var proto = store.protocol(draft.protocolId);
    var cp = cpOf(client, draft.protocolId);
    if (!proto) return null;
    return proto.phases[Math.min(cp ? cp.phaseIdx : 0, proto.phases.length - 1)];
  }

  /* 'last actual' — the most recent LOGGED dose on that weekday. For a Monday
     in next week's plan that is usually seven days back; where that day is
     still open it falls to fourteen or twenty-one. The practitioner is building
     against what happened, so a planned cell would tell them nothing. */
  function lastActual(client, iso, protocolId) {
    for (var k = 7; k <= 21; k += 7) {
      var d = doseFor(client, ui.addDays(iso, -k), protocolId);
      if (d && d.status !== 'planned') return { dose: d, back: k };
    }
    return null;
  }

  /* SPEC §7.1. The packet flies first and the week publishes ON ARRIVAL, so
     the phone changes at the moment the dot lands — a packet over an unchanged
     phone is the hollow version of this and the defect this build was caught
     on twice. canvas.handoff() does the same thing but shares the walkthrough's
     timer and cannot tell this file when it landed, so the button owns its own
     choreography and its own single toast. packet() dedupes while in flight, and
     the captured draft is re-checked on arrival, so a double click publishes
     once. With no canvas (a file:// load where a script was blocked) it
     publishes immediately rather than leaving the hero button dead. */
  function publish() {
    var draft = store.state.draft;
    if (!draft || draft.publishedAt) return;
    var client = store.client(draft.clientId);
    var name = firstName(client ? client.name : '');
    var cv = ART.canvas;

    function commit() {
      var live = store.state.draft;
      if (live !== draft || draft.publishedAt) return;      /* already landed */
      store.publishPlan();
      store.toast('Published — on ' + name + '’s phone now', 'ok');
    }

    if (cv && cv.packet) {
      var p = cv.packet('w-handoff');
      if (p && p.then) {
        p.then(function () {
          commit();
          if (cv.pulse) cv.pulse('ph-handoff');
        });
        return;
      }
    }
    commit();
  }

  /* ============================================================== FRAME 1 ===
     roster — 1320 x 1320. The console: every client in the practice, triaged,
     then the focused child with one column per concurrent protocol, then every
     colleague's numbers.
     ======================================================================== */

  function roster(root) {
    if (!root || rendering.roster) return;
    rendering.roster = true;
    roots.roster = root;
    try {
      var client = store.focusClient();
      var p = practitioner();
      var html = zoneHead('Practitioner · roster', 'The roster',
        'Sorted by who needs a decision today. Every practitioner opens every client.') +
        '<div class="zone__body">' +
          '<div class="window">' +
            '<div class="window__bar">' +
              '<div class="window__dots"><span></span><span></span><span></span></div>' +
              '<div class="window__url"><b>art-practice.app</b>/clients</div>' +
              '<span class="chip chip--navy" style="margin-left:auto">Practitioner</span>' +
              '<span class="chip chip--neutral">' +
                E(p ? shortName(p.name) : 'Practitioner') + ' · ' +
                E(p ? centreName(p.centreId) : '') +
              '</span>' +
            '</div>' +
            '<div class="window__body" style="display:flex;flex-direction:column">' +
              panelScope() +
              panelRoster(client) +
              panelFocus(client) +
              panelPractice() +
            '</div>' +
          '</div>' +
        '</div>';
      ui.keepFocus(root, function () { root.innerHTML = html; });
      bind(root);
    } finally {
      rendering.roster = false;
    }
  }

  /* --- the scope rail: both scopes usable (NOTES §A6) ---------------------- */

  function panelScope() {
    var p = practitioner();
    var mine = p ? p.clientIds.length : 0;
    var all = metrics().counts().activeClients;
    var isAll = view.scope === 'all';
    return '' +
      '<div class="panel">' +
        '<div class="panel__body" style="padding:13px 20px 11px;display:flex;' +
          'align-items:center;gap:16px">' +
          '<span class="h3" style="flex:0 0 auto">Roster</span>' +
          '<div class="seg" role="group" aria-label="Roster scope" ' +
               'data-live="see every client" data-hint="below">' +
            '<button class="seg__item" type="button" data-pr="scope" data-scope="mine" ' +
              'aria-pressed="' + (isAll ? 'false' : 'true') + '">' +
              'My clients <span class="num">' + mine + '</span></button>' +
            '<button class="seg__item" type="button" data-pr="scope" data-scope="all" ' +
              'aria-pressed="' + (isAll ? 'true' : 'false') + '">' +
              'All clients <span class="num">' + all + '</span></button>' +
          '</div>' +
          '<p class="meta" style="margin-left:auto;text-align:right">' +
            'Practitioners help each other, so nothing here is read-only.<br>' +
            '<strong>Ownership decides responsibility, not visibility.</strong></p>' +
        '</div>' +
      '</div>';
  }

  function rosterRows() {
    var p = practitioner();
    var list;
    if (view.scope === 'all') {
      list = ((ART.db && ART.db.clients) || []).filter(function (c) {
        return c.status === 'active';
      });
    } else {
      list = ((p && p.clientIds) || []).map(function (id) { return store.client(id); })
        .filter(function (c) { return !!c; });
    }
    var out = list.map(function (c) {
      return { c: c, a: metrics().attention(c), adh: metrics().clientAdherence(c, 7) };
    });
    out.sort(function (x, y) {
      return x.a.rank - y.a.rank || x.c.name.localeCompare(y.c.name);
    });
    return out;
  }

  /* seven days of the WHOLE day — doses, drops and the spine tap — because
     that is what adherence counts (SPEC §5a). Each cell says how many of the
     day's items were logged. */
  function weekCellsFor(client) {
    var today = store.state.today;
    var out = '';
    for (var k = 6; k >= 0; k--) {
      var iso = ui.addDays(today, -k);
      var r = dayRoll(client, iso);
      out += '<span class="cell" data-status="' + r.status + '"' +
        (k === 0 ? ' data-today' : '') +
        ' title="' + E(ui.dayLabel(iso) + ' · ' +
          (r.n ? r.logged + ' of ' + r.n + ' items logged' : 'nothing prescribed')) +
        '">' + E(ui.glyph(r.status)) + '</span>';
    }
    return out;
  }

  function panelRoster(client) {
    var rows = rosterRows();
    var isAll = view.scope === 'all';
    var attn = 0;
    var body = '';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var cur = client && r.c.id === client.id;
      if (r.a.rank <= 3) attn++;

      var foods = r.c.protocols.map(function (cp) {
        var pr = store.protocol(cp.protocolId);
        return pr ? pr.allergen : cp.protocolId;
      }).join(' · ');

      var lead = null;
      for (var j = 0; j < r.c.protocols.length; j++) {
        if (r.c.protocols[j].state !== 'maintenance') { lead = r.c.protocols[j]; break; }
      }
      if (!lead) lead = r.c.protocols[0];

      body += '' +
        '<tr class="rowlink" role="button" tabindex="0" data-client="' + E(r.c.id) + '"' +
          (cur ? ' aria-current="true"' : '') +
          ' aria-label="' + E(r.c.name + ' — ' + r.a.label) + '">' +
          '<td data-key>' + E(r.c.name) + '</td>' +
          '<td data-num>' + r.c.age + '</td>' +
          '<td style="white-space:nowrap"><span class="meta">' + E(foods) + '</span></td>' +
          '<td data-num>' + (lead ? lead.week + '/' + lead.of : '—') + '</td>' +
          (isAll
            ? '<td style="white-space:nowrap">' +
                (r.c.practitionerId === PRACT_ID
                  ? '<strong>' + E(practName(PRACT_ID)) + '</strong>'
                  : '<span class="meta">' + E(practName(r.c.practitionerId)) + '</span>') +
              '</td>'
            : '') +
          '<td>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<div style="display:flex;gap:2px;--cell-size:16px">' +
                weekCellsFor(r.c) + '</div>' +
              '<span class="mono">' + ui.pct(r.adh.pct) + '</span>' +
            '</div>' +
          '</td>' +
          '<td>' + chipFor(r.a, shortStatus(r.a)) + '</td>' +
        '</tr>';
    }

    return '' +
      '<div class="panel">' +
        '<div class="panel__body" style="padding:0 20px 14px">' +
          /* 30px, not 8: with hints ON the roster's coral "open a client" label
             prints ABOVE the table and would cover this sentence. */
          '<p class="meta" style="margin:0 0 30px">' +
            '<strong>' + attn + ' of ' + rows.length + '</strong> need a decision today' +
            (isAll ? ' across the practice' : '') +
            '. Last 7 days counts every prescribed item — doses, the daily ' +
            'drops and the spine tap.' +
          '</p>' +
          '<div data-live="open a client">' +
            /* id, because ART.ui.keepFocus only records and restores the
               scroll position of id-bearing children — without it every
               re-render snapped the list back to the top and a row clicked
               below the fold went off screen the moment it was selected. */
            '<div class="tblwrap" id="roster-scroll" data-scroll data-nopan style="--tbl-h:' +
              ROSTER_TBL_H + 'px">' +
              '<table class="tbl tbl--dense">' +
                '<thead><tr>' +
                  '<th>Client</th>' +
                  '<th data-num>Age</th>' +
                  '<th>Running</th>' +
                  '<th data-num>Wk</th>' +
                  (isAll ? '<th>Practitioner</th>' : '') +
                  '<th>Last 7 days · every item</th>' +
                  '<th>Status</th>' +
                '</tr></thead>' +
                '<tbody>' + body + '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* --- the focused client -------------------------------------------------- */

  function panelFocus(client) {
    if (!client) {
      return '<div class="panel"><div class="panel__body">' +
        '<p class="empty">No client selected.</p></div></div>';
    }
    var a = metrics().attention(client);
    var d7 = metrics().clientAdherence(client, 7);
    var d28 = metrics().clientAdherence(client, 28);
    var mine = client.practitionerId === PRACT_ID;
    var ramping = 0, maint = 0;
    client.protocols.forEach(function (cp) {
      if (cp.state === 'maintenance') maint++; else ramping++;
    });

    var owner = '<span class="chip ' + (mine ? 'chip--neutral' : 'chip--peri') + '">' +
      (mine ? 'Your client' : practName(client.practitionerId) + '’s client') +
      ' · ' + E(centreName(client.centreId)) + '</span>';

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:14px 20px 8px">' +
          '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
            '<span class="h3">' + E(client.name) + '</span>' +
            '<span class="meta">age ' + client.age + ' · started ' +
              E(longDate(client.startedISO)) + '</span>' +
            owner +
          '</div>' +
          '<div class="panel__actions">' + chipFor(a, a.label) + '</div>' +
        '</div>' +
        '<div class="panel__body" style="padding:0 20px 13px">' +
          '<div class="chiprow">' +
            '<span class="chip chip--neutral">7 days <span class="mono">' +
              ui.pct(d7.pct) + '</span> · ' + d7.logged + ' of ' + d7.planned + '</span>' +
            '<span class="chip chip--neutral">28 days <span class="mono">' +
              ui.pct(d28.pct) + '</span></span>' +
            '<span class="chip chip--neutral">' + client.protocols.length + ' foods · ' +
              ramping + ' ramping · ' + maint + ' maintenance</span>' +
          '</div>' +
          (mine ? '' :
            '<p class="meta" style="margin-top:8px">Opened from <strong>All clients</strong>' +
            ' — you can read and edit ' + E(practName(client.practitionerId)) +
            '’s client, and every change you publish is logged as <strong>' +
            E(practName(PRACT_ID)) + '</strong>.</p>') +
          panelPhases(client) +
        '</div>' +
      '</div>';
  }

  /* --- the phase chain, one column per concurrent protocol ---------------- */
  /* A 12-week protocol made legible in one glance: the ordered phases with
     their real food forms, the current one marked, and the ramp position
     inside it. Only the protocol the builder is editing carries the full ramp;
     the others state their position in words. */

  function phaseRail(proto, cp) {
    var cur = Math.min(cp.phaseIdx, proto.phases.length - 1);
    var maint = cp.state === 'maintenance';
    var out = '<div class="phase" aria-hidden="true">';
    for (var i = 0; i < proto.phases.length; i++) {
      var isCur = maint ? (i === proto.phases.length - 1) : (i === cur);
      var past = maint ? i < proto.phases.length - 1 : i < cur;
      out += '<span class="phase__dot"' +
        (isCur ? ' aria-current="true"' : (past ? ' data-state="past"' : '')) + '></span>';
      if (i < proto.phases.length - 1) {
        var barPast = maint || i < cur;
        var barCur = !maint && i === cur;
        out += '<span class="phase__bar"' +
          (barCur ? ' aria-current="true"' : (barPast ? ' data-state="past"' : '')) + '></span>';
      }
    }
    return out + '</div>';
  }

  function phaseLabels(proto) {
    var out = '<div style="display:grid;grid-template-columns:repeat(' +
      proto.phases.length + ',minmax(0,1fr));gap:6px;margin-top:5px">';
    for (var i = 0; i < proto.phases.length; i++) {
      out += '<span class="meta" title="' + E(proto.phases[i].label) +
        '" style="min-width:0">' + E(proto.phases[i].label) + '</span>';
    }
    return out + '</div>';
  }

  /* The real ramp, in mono. Whether a phase fits on one line depends on the
     WIDTH of its own steps, not their count — `1 2 3 4 5 7 10 15 20 30` is ten
     steps in 290px, while milk's seven run past 580 because 'whole serving' is
     thirteen monospaced characters. So measure, then window around the current
     step with a .ramp__sep. */
  function rampWidth(steps, keep, w) {
    var out = -4;
    for (var i = 0; i < keep.length; i++) {
      /* .ramp__step: 13px mono (0.6em advance) + 7px padding each side,
         + 2px border, + the 4px .ramp gap before it */
      out += String(steps[keep[i]].display).length * 7.8 + 16 + 2 + 4;
      if (i && keep[i] > keep[i - 1] + 1) out += 16 + 4;   /* a '…' separator */
    }
    return out;
  }

  function rampRow(phase, stepIdx, maxW) {
    var steps = phase.steps;
    var n = steps.length;
    var i;

    var keep = [];
    for (i = 0; i < n; i++) keep.push(i);

    if (rampWidth(steps, keep) > maxW) {
      var want = {};
      want[0] = 1;
      want[n - 1] = 1;
      for (i = stepIdx - 1; i <= stepIdx + 1; i++) if (i >= 0 && i < n) want[i] = 1;
      keep = Object.keys(want).map(Number).sort(function (a, b) { return a - b; });
      for (i = 2; i <= 5; i++) {
        var grow = {}, k;
        for (k = 0; k < keep.length; k++) grow[keep[k]] = 1;
        if (stepIdx - i >= 0) grow[stepIdx - i] = 1;
        if (stepIdx + i < n) grow[stepIdx + i] = 1;
        var next = Object.keys(grow).map(Number).sort(function (a, b) { return a - b; });
        if (rampWidth(steps, next) > maxW) break;
        keep = next;
      }
    }

    var out = '<div class="ramp" style="margin-top:7px">';
    var prev = -1;
    for (i = 0; i < keep.length; i++) {
      var kk = keep[i];
      if (prev >= 0 && kk > prev + 1) out += '<span class="ramp__sep">…</span>';
      out += '<span class="ramp__step"' +
        (kk === stepIdx ? ' aria-current="true"' : (kk < stepIdx ? ' data-state="past"' : '')) +
        (steps[kk].food ? ' title="' + E(steps[kk].food + ' · ' + steps[kk].display) + '"' : '') +
        '>' + E(steps[kk].display) + '</span>';
      prev = kk;
    }
    return out + '</div>';
  }

  function phaseBlock(client, cp, isDraftProtocol) {
    var proto = store.protocol(cp.protocolId);
    if (!proto) return '';
    var maint = cp.state === 'maintenance';
    var phase = proto.phases[Math.min(cp.phaseIdx, proto.phases.length - 1)];
    var stateChip = maint
      ? '<span class="chip chip--peri">maintenance</span>'
      : (cp.state === 'held'
          ? '<span class="chip chip--hold"><span class="mono">=</span>held since ' +
            E(ui.md(cp.heldSince || store.state.today)) + '</span>'
          : '<span class="chip chip--navy">ramping</span>');

    var pos;
    if (maint) {
      pos = '<p class="meta" style="margin-top:7px">Phase ' + proto.phases.length + ' of ' +
        proto.phases.length + ' cleared · <span class="mono">' +
        E(proto.maintenanceDose.display) + '</span></p>';
    } else {
      var step = phase.steps[Math.min(cp.stepIdx, phase.steps.length - 1)];
      /* The position names the dose the way the booklet does — '5 seeds', not a
         bare '5'. egg's final phase ramps five different foods through the same
         three fractions, so there the food has to be named too. */
      var at = ART.makeDose(client, cp.protocolId,
        Math.min(cp.phaseIdx, proto.phases.length - 1), cp.stepIdx, store.state.today, {
          timing: cp.timing, waitLevel: cp.waitLevel, status: 'planned', isMaintenance: false
        });
      pos = '<p class="meta" style="margin-top:6px">Phase ' +
        phase.n + ' of ' + proto.phases.length + ' · ' + E(phase.label) +
        ' · step <strong>' + (cp.stepIdx + 1) + ' of ' + phase.steps.length +
        '</strong> · <span class="mono">' + E(prep.household(at)) + '</span>' +
        (step && step.food ? ' ' + E(step.food) : '') + '</p>';
      if (isDraftProtocol) pos = rampRow(phase, cp.stepIdx, PHASE_COL_RAMP) + pos;
    }

    return '' +
      '<div style="min-width:0">' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
          '<span class="h3">' + E(proto.allergen) + '</span>' +
          stateChip +
          '<span class="meta">week ' + cp.week + ' of ' + cp.of + ' · ' +
            E(proto.version) + '</span>' +
        '</div>' +
        '<div style="margin-top:8px">' + phaseRail(proto, cp) + phaseLabels(proto) + '</div>' +
        pos +
        doneRuns(client, cp) +
      '</div>';
  }

  /* NOTES §B3's micro view: this child's OWN completed runs of each phase,
     planned against actual, with the practice median for the same phase beside
     it. These are the rows the `phases` frame aggregates, so a practitioner and
     the owner are reading one object at two zooms instead of two objects that
     happen to agree. Most recent three; the rest are counted, because the
     column is 1320px of frame and not a report. */
  function doneRuns(client, cp) {
    var all = (metrics().clientPhaseRuns ? metrics().clientPhaseRuns(client) : []) || [];
    var mine = all.filter(function (r) {
      return r.protocolId === cp.protocolId && r.completedOn;
    });
    if (!mine.length) return '';
    var show = mine.slice(-3);
    var more = mine.length - show.length;
    return '<p class="meta" style="margin-top:6px">' +
      '<strong>Finished</strong> ' +
      show.map(function (r) {
        /* planned → actual, and the practice median for the same phase in the
           title so the two zooms are one hover apart without a third figure on
           a line that has to stay two deep. */
        return '<span title="' + E(r.phaseLabel + ' · this child ' + r.actualDays +
            ' d · practice median ' + r.practiceMedian + ' d · ' +
            r.repeatDays + ' days repeated') + '">' +
          E(r.phaseLabel) + ' <span class="mono">' + r.plannedDays + '&rarr;' +
          r.actualDays + ' d</span></span>';
      }).join(' &middot; ') +
      (more ? ' &middot; <span class="mono">+' + more + '</span> earlier' : '') +
      '</p>';
  }

  function panelPhases(client) {
    var draft = store.state.draft;
    var n = Math.max(1, client.protocols.length);
    var blocks = client.protocols.map(function (cp) {
      return phaseBlock(client, cp, !!draft && draft.clientId === client.id &&
        draft.protocolId === cp.protocolId);
    }).join('');

    return '' +
      '<div style="margin-top:14px">' +
        '<div style="display:flex;align-items:baseline;gap:12px">' +
          '<div class="eyebrow">Phase chain</div>' +
          '<span class="meta">' + client.protocols.length +
            ' running concurrently — the hardest thing about a multi-allergy ' +
            'household, and the reason the week is one object</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(' + n +
          ',minmax(0,1fr));gap:26px;margin-top:11px">' + blocks + '</div>' +
      '</div>';
  }

  /* --- who can cover (NOTES §A6) ------------------------------------------
     NOT a leaderboard. This panel used to carry each colleague's 28-day logged
     percentage, sorted descending — which is a league table on a peer's own
     screen. Geoff: "no need to create competition between practitioners."
     Comparative adherence still exists, on the OWNER dashboard in section 4,
     where management comparison is the actual job. Here the question is only
     "who else holds clients, where are they, and do they have room" — the
     facts you need to cover for someone. Sorted by centre then name, so the
     order can never read as a ranking. */

  function panelPractice() {
    var rows = (metrics().byPractitioner(28) || []).slice().sort(function (a, b) {
      var c = String(a.centre).localeCompare(String(b.centre));
      return c !== 0 ? c : String(a.name).localeCompare(String(b.name));
    });
    var body = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var me = r.id === PRACT_ID;
      body += '' +
        '<tr' + (me ? ' aria-current="true"' : '') + '>' +
          '<td data-key>' + E(shortName(r.name)) +
            (me ? ' <span class="chip chip--neutral">you</span>' : '') +
            (r.kind === 'independent'
              ? ' <span class="chip chip--peri">independent</span>' : '') + '</td>' +
          '<td><span class="meta">' + E(r.centre) + '</span></td>' +
          '<td data-num>' + r.clients + '</td>' +
          '<td data-num>' + r.openSlots + '</td>' +
        '</tr>';
    }
    return '' +
      '<div class="panel" style="margin-top:auto">' +
        '<div class="panel__head" style="padding:10px 20px 6px">' +
          '<div><div class="eyebrow">Every client, and who can cover</div></div>' +
          '<div class="panel__actions"><span class="meta">' +
            'A practitioner can open any colleague’s dashboard — they cover for ' +
            'each other</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 13px">' +
          '<div class="tblwrap">' +
            '<table class="tbl tbl--dense">' +
              '<thead><tr>' +
                '<th>Practitioner</th><th>Centre</th>' +
                '<th data-num>Clients</th>' +
                '<th data-num>Open slots</th>' +
              '</tr></thead>' +
              '<tbody>' + body + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ============================================================== FRAME 2 ===
     builder — 1480,3610,1240,1320. The week being built, so it is the one
     surface on this board that carries --sh-lift (§5's card discipline). The
     hero wire leaves its right edge at world y3990; `Publish week` is measured
     to land there.
     ======================================================================== */

  function builder(root) {
    if (!root || rendering.builder) return;
    rendering.builder = true;
    roots.builder = root;
    try {
      var client = store.focusClient();
      var draft = ensureDraft();
      var html = zoneHead('Practitioner · week builder', 'Next week, in under a minute',
        'Cloned and adjusted, never typed from blank. Publish, and the phone has it.') +
        '<div class="zone__body">' +
          '<div class="card--lift" style="padding:0;flex:1 1 auto;min-height:0;' +
            'display:flex;flex-direction:column;overflow:hidden">' +
            builderBody(client, draft) +
          '</div>' +
        '</div>';
      ui.keepFocus(root, function () { root.innerHTML = html; });
      bind(root);
    } finally {
      rendering.builder = false;
    }
  }

  function builderBody(client, draft) {
    if (!client) return '<p class="empty" style="margin:20px">No client selected.</p>';
    if (!draft) {
      return '<p class="empty" style="margin:20px">' +
        'This client has no active protocol to plan.</p>';
    }
    return panelBooklet(client, draft) +
      panelBuilderHead(client, draft) +
      panelDays(client, draft) +
      panelConditions(draft);
  }

  /* --- the one-line booklet facsimile. The argument, not a feature. -------
     Sized deliberately: the panel's height is what puts `Publish week` beside
     the hero wire's origin at world y3990. The margin note is the booklet's own
     conditional rule in the practitioner's hand — the same rule the conditions
     block at the bottom of this sheet turns into data. */

  function panelBooklet(client, draft) {
    var today = store.state.today;
    var proto = store.protocol(draft.protocolId);
    var dose = doseFor(client, today, draft.protocolId);
    if (!dose) dose = draftDose(client, draft, draft.days[0]);

    var day = ui.md(dose.dateISO);
    var food = String(proto ? proto.allergen : dose.allergen).toLowerCase();

    /* the four fields THIS line carries. The six-field proof belongs to the
       booklet frame in section 1, where every one of them has a real value — a
       viewer who counts along this line must not come up two short. */
    var chips = ['day', 'allergen', 'dose + unit', 'rule'].map(function (f) {
      return '<span class="chip chip--neutral">' + E(f) + '</span>';
    }).join('');

    return '' +
      '<div class="panel">' +
        /* the bottom padding is MEASURED: it is what puts `Publish week`,
           in the panel below, level with the hero wire's origin at world y3990 */
        '<div class="panel__body" style="padding:14px 20px 31px">' +
          '<div style="display:flex;align-items:baseline;gap:16px">' +
            '<div class="eyebrow">The line this replaces</div>' +
            '<p class="meta" style="margin-left:auto">' +
              'Handwritten at the end of every visit. Here it is a record.</p>' +
          '</div>' +
          '<div class="booklet" style="margin-top:8px">' +
            '<div class="booklet__page">' +
              '<div class="booklet__line">' +
                '<span>' + E(day) + ' · ' + E(food) + ' · ' +
                  E(prep.household(dose)) + ' · </span>' +
                '<em>only if healthy, else hold</em>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="chiprow" style="margin-top:10px">' + chips +
            '<span class="meta">four of the six fields, already a schema</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* --- the builder head: provenance left, the hero right ------------------ */

  function panelBuilderHead(client, draft) {
    var proto = store.protocol(draft.protocolId);
    var cp = cpOf(client, draft.protocolId);
    var phase = draftPhase(client, draft);
    var end = ui.addDays(draft.weekStart, 6);
    var published = !!draft.publishedAt;
    var mine = client.practitionerId === PRACT_ID;

    /* Where the fill came from, named. Never a blank form, and never silent
       about which version of which protocol it was cloned off. */
    var from = draft.maintenance
      ? 'Pre-filled from ' + proto.allergen + ' ' + proto.version +
        ' · maintenance · ' + proto.maintenanceDose.display
      : 'Pre-filled from ' + proto.allergen + ' ' + proto.version + ' · phase ' +
        phase.n + ' · continuing from ' +
        prep.household(draftDose(client, draft, {
          stepIdx: Math.min(cp ? cp.stepIdx : 0, phase.steps.length - 1),
          dateISO: draft.weekStart,
          timing: cp ? cp.timing : draft.days[0].timing,
          waitLevel: cp ? cp.waitLevel : draft.days[0].waitLevel
        }));

    var actions = '';
    if (draft.dirty) {
      actions += '<span class="chip chip--coral">Unpublished changes</span>';
    } else if (published) {
      actions += '<span class="chip chip--ok"><span class="mono">✓</span>Published ' +
        E(String(draft.publishedAt).slice(11)) + '</span>';
    }
    if (published) {
      actions += '<button class="btn" type="button" data-pr="again" ' +
        'data-live="build it again">Build next week again</button>';
    }
    if (!published || draft.dirty) {
      actions += '<button class="btn btn--primary" type="button" data-pr="publish" ' +
        'data-live="publish — the handoff">Publish week</button>';
    }

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:13px 20px 8px">' +
          '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
            '<div class="eyebrow">Week builder</div>' +
            '<div class="h3">' + E(client.name) + ' · ' +
              E(ui.dayLabel(draft.weekStart)) + ' → ' + E(ui.dayLabel(end)) + '</div>' +
            (mine ? '' : '<span class="chip chip--peri">' +
              practName(client.practitionerId) + '’s client · you are editing as ' +
              E(practName(PRACT_ID)) + '</span>') +
          '</div>' +
          '<div class="panel__actions">' + actions + '</div>' +
        '</div>' +
        '<div class="panel__body" style="padding:0 20px 14px">' +
          '<p class="meta" style="margin:0">' + E(from) +
            ' · <strong>cloned from the template, never a blank form</strong></p>' +
        '</div>' +
      '</div>';
  }

  /* --- seven days --------------------------------------------------------- */

  function dayHeadRow(maint) {
    var cols = [
      { t: 'Day' },
      { t: 'Last actual', tip: 'The most recent logged dose on that weekday' },
      { t: maint ? 'Dose · every day' : 'Dose' },
      { t: 'Time' },
      { t: 'Wait protocol' }
    ];
    if (!maint) cols.push({ t: '' });
    var out = '<div style="display:grid;grid-template-columns:' +
      (maint ? DAY_GRID_MAINT : DAY_GRID) +
      ';gap:' + DAY_GAP + ';align-items:end;padding-bottom:25px">';
    for (var i = 0; i < cols.length; i++) {
      out += '<span class="eyebrow"' +
        (cols[i].tip ? ' title="' + E(cols[i].tip) + '"' : '') +
        '>' + E(cols[i].t) + '</span>';
    }
    return out + '</div>';
  }

  function dayRow(client, draft, i) {
    var row = draft.days[i];
    var dose = draftDose(client, draft, row);
    var phase = draftPhase(client, draft);
    var faces = doseFaces(dose);
    var la = lastActual(client, row.dateISO, draft.protocolId);
    var last = la ? la.dose : null;
    var lastSt = last ? last.status : 'planned';
    var isToday = row.dateISO === store.state.today;

    /* the actual cell, beside the row it informs — and now the dose that was
       really given, which the 1240px frame finally has room to print */
    var actual = '' +
      '<div style="display:flex;align-items:center;gap:8px;padding-top:4px">' +
        '<span class="cell" data-status="' + lastSt + '" title="' +
          (last
            ? E(ui.dayLabel(last.dateISO) + ' · ' + ui.statusLabel(lastSt) +
                (last.note ? ' · ' + last.note : ''))
            : 'no logged dose on that weekday') +
          '">' + E(last ? ui.glyph(lastSt) : '') + '</span>' +
        (last
          /* one line, with the full string on hover: a maintenance dose is a
             sentence ('1 serving baked + 1 serving other egg foods') and four
             wrapped lines here, seven times, took the conditions block off the
             bottom of the sheet. The same dose is printed in full in this
             row's own Dose cell. */
          ? '<div style="min-width:0">' +
              '<span class="mono" title="' + E(prep.household(last)) +
                '" style="display:block;min-width:0;overflow:hidden;' +
                'text-overflow:ellipsis;white-space:nowrap">' +
                E(prep.household(last)) + '</span>' +
              '<span class="meta" style="display:block;white-space:nowrap">' + la.back +
                ' days back · ' + E(ui.statusLabel(lastSt).toLowerCase()) + '</span>' +
            '</div>'
          : '<span class="meta">none logged</span>') +
      '</div>';

    /* the dose control, along the REAL ramp steps, grams underneath */
    var ctrl;
    if (draft.maintenance) {
      ctrl = '<span class="dose" data-size="sm">' + E(faces.big) + '</span>';
    } else {
      var minus = row.stepIdx <= 0;
      var plus = row.stepIdx >= phase.steps.length - 1;
      ctrl = '' +
        '<div class="stepper" data-size="sm" data-live="step the dose"' +
          (i ? ' data-hint="quiet"' : '') + '>' +
          '<button class="stepper__btn" type="button" data-pr="step" data-day="' + i +
            '" data-dir="-1" aria-label="Lower the dose on ' + E(ui.dayLabel(row.dateISO)) +
            '"' + (minus ? ' disabled' : '') + '>−</button>' +
          '<span class="stepper__value">' + E(faces.big) + '</span>' +
          '<button class="stepper__btn" type="button" data-pr="step" data-day="' + i +
            '" data-dir="1" aria-label="Raise the dose on ' + E(ui.dayLabel(row.dateISO)) +
            '"' + (plus ? ' disabled' : '') + '>+</button>' +
        '</div>';
    }

    var opts = WAIT_OPT.map(function (o) {
      return '<option value="' + o.v + '"' +
        (o.v === row.waitLevel ? ' selected' : '') + '>' + E(o.t) + '</option>';
    }).join('');

    return '' +
      '<div class="list__item" style="padding:9px 0;display:grid;grid-template-columns:' +
        (draft.maintenance ? DAY_GRID_MAINT : DAY_GRID) +
        ';gap:' + DAY_GAP + ';align-items:start">' +

        '<div style="padding-top:5px">' +
          '<span class="mono">' + E(ui.dayLabel(row.dateISO)) + '</span>' +
          '<span class="meta" style="display:block">' +
            (isToday ? 'today' : 'day ' + (i + 1) + ' of 7') + '</span>' +
        '</div>' +

        actual +

        '<div style="min-width:0">' +
          ctrl +
          '<span class="meta" style="display:block;margin-top:4px">' +
            E(faces.small) + (draft.maintenance ? '' : ' · ' + E(dose.foodForm)) +
            '</span>' +
        '</div>' +

        '<div style="padding-top:2px">' +
          '<input type="time" id="pr-time-' + i + '" data-day="' + i + '" data-field="timing"' +
            ' value="' + E(row.timing) + '" style="width:100%"' +
            ' aria-label="Dose time on ' + E(ui.dayLabel(row.dateISO)) + '">' +
        '</div>' +

        '<div style="padding-top:2px">' +
          '<select id="pr-wait-' + i + '" data-day="' + i + '" data-field="wait"' +
            ' style="width:100%" aria-label="Wait protocol on ' +
            E(ui.dayLabel(row.dateISO)) + '">' + opts + '</select>' +
        '</div>' +

        (draft.maintenance ? '' :
          '<div style="padding-top:4px">' +
            '<button class="btn btn--quiet btn--sm" type="button" data-static' +
              ' title="Copies this day forward over the rest of the week"' +
              ' aria-label="Fill forward from ' + E(ui.dayLabel(row.dateISO)) +
              '">Fill ↓</button>' +
          '</div>') +

      '</div>';
  }

  /* The other protocols publishPlan() carries across the same seven days. The
     phone shows the child's whole week, not one food. */
  function carriedRow(client, draft) {
    var chips = '';
    for (var i = 0; i < client.protocols.length; i++) {
      var cp = client.protocols[i];
      if (cp.protocolId === draft.protocolId) continue;
      var proto = store.protocol(cp.protocolId);
      if (!proto) continue;
      var maint = cp.state === 'maintenance';
      var d = ART.makeDose(client, cp.protocolId,
        Math.min(cp.phaseIdx, proto.phases.length - 1), cp.stepIdx, draft.days[0].dateISO, {
          timing: cp.timing || '17:30',
          waitLevel: cp.waitLevel === undefined ? 1 : cp.waitLevel,
          status: 'planned',
          isMaintenance: maint
        });
      chips += '<span class="chip ' + (maint ? 'chip--peri' : 'chip--neutral') + '">' +
        E(proto.allergen) + ' <span class="mono">' + E(prep.household(d)) + '</span> · ' +
        '<span class="mono">' + E(ui.clock(d.timing)) + '</span></span>';
    }
    /* the two items the booklet has no room for ride along too (SPEC §5a) */
    var items = ART.protocolItems ? ART.protocolItems(client.id) : [];
    for (var k = 0; k < items.length; k++) {
      chips += '<span class="chip chip--neutral">' + E(items[k].label) +
        ' <span class="mono">' + E(items[k].doseValue + ' ' + items[k].doseUnit) +
        '</span> · ' + E(items[k].cadence) + '</span>';
    }
    if (!chips) return '';
    return '' +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-top:12px;flex-wrap:wrap">' +
        '<span class="meta">Also on the week, carried forward:</span>' +
        '<div class="chiprow">' + chips + '</div>' +
      '</div>';
  }

  function panelDays(client, draft) {
    var rows = '';
    for (var i = 0; i < draft.days.length; i++) rows += dayRow(client, draft, i);
    var wk = metrics().clientAdherence(client, 7);

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:11px 20px 4px">' +
          '<div><div class="eyebrow">Seven days</div></div>' +
          '<div class="panel__actions"><span class="meta">Last 7 days logged <strong>' +
            wk.logged + ' of ' + wk.planned + '</strong></span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 14px">' +
          '<p class="meta" style="margin:0 0 8px">' +
            'Pre-filled along the real ramp, with grams and the food form under ' +
            'every dose.</p>' +
          dayHeadRow(!!draft.maintenance) +
          '<div class="list">' + rows + '</div>' +
          carriedRow(client, draft) +
        '</div>' +
      '</div>';
  }

  /* --- the conditions: the booklet's margin notes, attached to the week --- */

  function panelConditions(draft) {
    var conds = draft.conditions || [];
    var items = '';
    for (var i = 0; i < conds.length; i++) {
      items += '' +
        '<li class="list__item" style="padding:5px 0">' +
          '<label data-static style="display:flex;align-items:baseline;gap:10px;cursor:default">' +
            '<input type="checkbox"' + (conds[i].on ? ' checked' : '') + ' data-static' +
              ' aria-label="' + E(conds[i].trigger + ' — ' + conds[i].action) + '">' +
            '<span>' + E(conds[i].trigger) +
              ' <span class="meta">→</span> <strong>' + E(conds[i].action) +
              '</strong></span>' +
          '</label>' +
        '</li>';
    }

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:10px 20px 2px">' +
          '<div><div class="eyebrow">Conditions</div></div>' +
          '<div class="panel__actions"><span class="meta">' +
            'They travel with the week</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 10px">' +
          '<div class="card--paper">' +
            '<ul class="list">' + items + '</ul>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ============================================================== FRAME 3 ===
     templates — 3320,3610,800,1320. THE RAMP EDITOR.

     "There has to be a way to have predefined templates but also very very
     very easily modify them — not everyone is the same." So this frame is a
     DIFF, not a form: the published template and this child's variant on one
     scale, with every edit the brief names present as a real control.

     Two diffs, because the seven edits live at two scales:
       FOOD FORMS   the phase chain, each cell as wide as its length in days —
                    where stretch, skip and swap are stated and quantified
       THE WEEK     seven days of real doses — where stretch and hold are
                    VISIBLE, because three days of a 58-day chain is 5% of a
                    bar and 4 of 7 doses in a week

     The subject is derived, never hard-coded: the focused client's leading
     ramping protocol if it still has a food form ahead of it, otherwise a
     published protocol they have not started — which is the real practitioner
     move for a child who has finished everything they are on.
     ======================================================================== */

  function templates(root) {
    if (!root || rendering.templates) return;
    rendering.templates = true;
    roots.templates = root;
    try {
      var model = subject();
      var html = zoneHead('Practitioner · ramp editor', 'A template, changed for one child',
        'A protocol is a starting point. Stretch, hold, skip or swap it.') +
        '<div class="zone__body">' +
          '<div class="window window--bare" style="display:flex;flex-direction:column">' +
            '<div class="window__body" style="display:flex;flex-direction:column">' +
              (model
                ? tplHead(model) + tplForms(model) + tplWeek(model) +
                  tplControls(model) + tplFooter(model)
                : '<p class="empty" style="margin:20px">No client selected.</p>') +
            '</div>' +
          '</div>' +
        '</div>';
      ui.keepFocus(root, function () { root.innerHTML = html; });
      bind(root);
    } finally {
      rendering.templates = false;
    }
  }

  /* --- what is being edited ----------------------------------------------- */

  function publishedProtocols() {
    return ((ART.db && ART.db.protocols) || []).filter(function (p) {
      return p.state === 'published';
    });
  }

  /* the client's leading ramping protocol, or — for a child in maintenance on
     everything they are on — the next published food they have not started */
  function pickProtocol(client) {
    var i, cp, proto;
    for (i = 0; i < client.protocols.length; i++) {
      cp = client.protocols[i];
      if (cp.state === 'maintenance') continue;
      proto = store.protocol(cp.protocolId);
      if (!proto) continue;
      /* a ramp with nothing ahead of it has no food form to skip or swap */
      if (Math.min(cp.phaseIdx, proto.phases.length - 1) < proto.phases.length - 1) {
        return { proto: proto, cp: cp, started: true };
      }
    }
    var taken = {};
    client.protocols.forEach(function (c) { taken[c.protocolId] = 1; });
    (client.history || []).forEach(function (h) { taken[h.protocolId] = 1; });
    var pool = publishedProtocols();
    for (i = 0; i < pool.length; i++) {
      if (!taken[pool[i].id] && pool[i].phases.length > 1) {
        return { proto: pool[i], cp: null, started: false };
      }
    }
    /* every published food either running or done: fall back to the leading
       protocol so the frame still shows a real ramp */
    for (i = 0; i < client.protocols.length; i++) {
      proto = store.protocol(client.protocols[i].protocolId);
      if (proto) return { proto: proto, cp: client.protocols[i], started: true };
    }
    return null;
  }

  /* integer allocation of `total` days across `weights`, every entry >= 1.
     Largest remainder, so stretching a phase re-spaces it deterministically
     and the days always add up to the figure on screen. */
  function spread(total, weights) {
    var n = weights.length;
    if (!n) return [];
    total = Math.max(total, n);
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += weights[i];
    var raw = [], out = [], used = 0;
    for (i = 0; i < n; i++) {
      var v = sum ? total * weights[i] / sum : total / n;
      raw.push(v);
      var f = Math.max(1, Math.floor(v));
      out.push(f);
      used += f;
    }
    var order = [];
    for (i = 0; i < n; i++) order.push({ i: i, frac: raw[i] - Math.floor(raw[i]) });
    order.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    var left = total - used, k = 0;
    while (left > 0) { out[order[k % n].i]++; left--; k++; }
    while (left < 0) {
      var moved = false;
      for (i = n - 1; i >= 0 && left < 0; i--) {
        if (out[order[i].i] > 1) { out[order[i].i]--; left++; moved = true; }
      }
      if (!moved) break;
    }
    return out;
  }

  /* the practice's own numbers for one phase of one protocol */
  function phaseStat(protocolId, phaseIdx) {
    var rows = metrics().phaseDuration({ protocolId: protocolId }) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].phaseIdx === phaseIdx) return rows[i];
    }
    return null;
  }

  /* THE TWO FOOD-FORM EDITS, chosen jointly and from the data rather than
     authored, so they are true for whichever client is focused:

       SKIP  the food form ahead of this child that the practice's own phase
             durations say runs longest past plan — "some children will not eat
             French toast" is exactly that phase on the egg protocol. Never the
             phase they are on (they are mid-way through it) and never the last
             one on a chain of three or more, because the final food form is the
             goal of the protocol.
       SWAP  a food form ahead of them exchanged for one at the SAME PROTEIN
             LOAD, measured in grams off the dataset's own grams-per-unit, and
             asserted only when a step lands within 12%. A food already cleared
             is preferred as the target: a child who will not eat halva gets the
             same 15 g of sesame as a quarter serving of hummus they already
             tolerate.

     Both are rendered but not wired (§7); the variant carries one of each
     already, which is what makes the diff legible at rest. */
  function formEdits(proto, cur) {
    var n = proto.phases.length;
    var i, j, s;
    var skipIdx = -1, best = -1e9;
    var lastExcluded = n >= 3 ? n - 1 : -1;
    for (i = cur + 1; i < n; i++) {
      if (i === lastExcluded) continue;
      s = phaseStat(proto.id, i);
      var score = s ? s.overrun * 100 + s.repeatPct : 0;
      if (score > best) { best = score; skipIdx = i; }
    }

    var swap = null;
    for (i = cur + 1; i < n; i++) {
      if (i === skipIdx) continue;
      var from = proto.phases[i];
      var top = from.steps[from.steps.length - 1];
      var want = top.value * from.gramsPerUnit;
      if (!want) continue;
      for (j = 0; j < n; j++) {
        if (j === i || j === skipIdx) continue;
        var to = proto.phases[j];
        /* What the child actually FINISHED that form at, if they finished it.
           Swapping a form ahead of them for a cleared form at a LOWER load is
           not an equivalent — it is a step back onto a food they already
           tolerate at more than that. On the sesame chain this is exactly the
           halva -> hummus case: halva's 1/2 is 15 g and hummus starts at 15 g,
           but hummus ends on a whole serving at 60 g. */
        var cleared = j < i;
        var done = to.steps[to.steps.length - 1].value * to.gramsPerUnit;
        for (var k = 0; k < to.steps.length; k++) {
          var have = to.steps[k].value * to.gramsPerUnit;
          var err = Math.abs(have - want) / want;
          if (err > 0.12) continue;
          if (cleared && have < done - 1e-9) continue;
          var cand = {
            from: i, to: j, err: err, cleared: cleared,
            fromStep: top, toStep: to.steps[k],
            fromG: want, toG: have
          };
          /* a food form the child has already cleared beats a closer match on
             one they have not met yet, and after that the closest load wins */
          if (!swap) swap = cand;
          else if (cand.cleared !== swap.cleared) { if (cand.cleared) swap = cand; }
          else if (cand.err < swap.err) swap = cand;
        }
      }
    }
    return { skipIdx: skipIdx, swap: swap };
  }

  /* one grams figure, the way the rest of the board prints them */
  function gramStr(g) {
    return (g >= 10 ? Math.round(g) : Math.round(g * 10) / 10) + ' g';
  }

  /* The whole editor state, derived once per render. Everything the frame
     draws — both diffs, every control's target, every figure — comes from
     here, so the lanes and the controls can never disagree. */
  function subject() {
    var client = store.focusClient();
    if (!client) return null;
    var picked = pickProtocol(client);
    if (!picked) return null;

    var proto = picked.proto;
    var cp = picked.cp;
    var cur = cp ? Math.min(cp.phaseIdx, proto.phases.length - 1) : 0;
    var phase = proto.phases[cur];
    var stepIdx = cp && picked.started
      ? Math.min(cp.stepIdx, phase.steps.length - 1) : 0;

    var key = client.id + '|' + proto.id + '|' + cur;
    var edit = view.edit && view.edit.key === key ? view.edit : null;
    var plan = phase.days;
    var stat = phaseStat(proto.id, cur);

    /* the three justified lengths the segmented control offers, every one of
       them sourced: the template's own plan, the practice's slower quartile
       for this exact phase, and a whole week more. A compress option appears
       only when the practice's faster quartile really is shorter than plan. */
    var opts = [];
    function opt(dd, label, tip) {
      for (var i = 0; i < opts.length; i++) if (opts[i].d === dd) return;
      if (dd < phase.steps.length) return;        /* never fewer days than steps */
      opts.push({ d: dd, label: label, tip: tip });
    }
    if (stat && stat.p25 < plan) {
      opt(Math.round(stat.p25), 'practice p25',
        'A quarter of children clear this food form in ' + days(Math.round(stat.p25)) +
        ' (n=' + stat.n + ')');
    }
    opt(plan, 'the plan', proto.allergen + ' ' + proto.version + ' schedules ' +
      days(plan) + ' for ' + phase.label);
    if (stat && stat.p75 > plan) {
      opt(Math.round(stat.p75), 'practice p75',
        'A quarter of children need ' + days(Math.round(stat.p75)) + ' or more here (n=' +
        stat.n + ')');
    }
    opt(plan + 7, 'a week more', 'A week slower than the template, for a slower child');
    opts.sort(function (a, b) { return a.d - b.d; });

    var target = edit ? edit.days : plan;
    var hold = edit ? edit.hold : 0;

    /* stretching re-spaces only what is still ahead: the days already spent at
       the earlier steps are history, not plan */
    var spent = 0, i2;
    for (i2 = 0; i2 < stepIdx; i2++) spent += phase.steps[i2].days || 1;
    var ahead = phase.steps.slice(stepIdx);
    var aheadW = ahead.map(function (s) { return s.days || 1; });
    var budget = Math.max(target - spent, ahead.length);
    var aheadDays = spread(budget, aheadW);

    var stockCounts = phase.steps.map(function (s) { return s.days || 1; });
    var varCounts = stockCounts.slice();
    for (i2 = 0; i2 < aheadDays.length; i2++) varCounts[stepIdx + i2] = aheadDays[i2];
    varCounts[stepIdx] += hold;

    var phaseDays = spent + budget + hold;
    var forms = formEdits(proto, cur);

    /* the week this variant would produce: the week AFTER the one already
       published, which is the same week the builder is drafting */
    var weekStart = ui.addDays(client.planPublishedForWeek || store.state.weekStart, 7);
    var dates = ui.weekDates(weekStart);
    var stockWalk = walk(phase.steps, stockCounts, stepIdx, dates.length);
    var varWalk = walk(phase.steps, varCounts, stepIdx, dates.length);

    /* the nudged day, fixed off the TEMPLATE's schedule so it does not move
       when the ramp re-spaces: the first day the template advances a step */
    var nudgeAt = -1;
    for (i2 = 1; i2 < stockWalk.length; i2++) {
      if (stockWalk[i2] !== stockWalk[i2 - 1]) { nudgeAt = i2; break; }
    }

    return {
      client: client, proto: proto, cp: cp, started: picked.started,
      cur: cur, phase: phase, stepIdx: stepIdx, stat: stat,
      plan: plan, target: target, hold: hold, phaseDays: phaseDays,
      opts: opts, key: key,
      stockCounts: stockCounts, varCounts: varCounts,
      dates: dates, stockWalk: stockWalk, varWalk: varWalk, nudgeAt: nudgeAt,
      skipIdx: forms.skipIdx, swap: forms.swap
    };
  }

  /* the same walk ART.store.startDraft() does: hold a step for its days, then
     advance. Mirrored on purpose — the template row in the week lane has to be
     the same week the builder pre-fills. */
  function walk(steps, counts, startIdx, n) {
    var out = [], idx = startIdx, held = 0;
    for (var i = 0; i < n; i++) {
      var at = Math.min(idx, steps.length - 1);
      out.push(at);
      held++;
      if (held >= (counts[at] || 1)) {
        held = 0;
        if (idx < steps.length - 1) idx++;
      }
    }
    return out;
  }

  /* --- the head: the subject, and the variant's parent version ------------ */

  function tplHead(m) {
    var varName = firstName(m.client.name) + '’s variant';
    var edited = (m.target !== m.plan ? 1 : 0) + (m.hold > 0 ? 1 : 0) +
      (m.skipIdx > -1 ? 1 : 0) + (m.swap ? 1 : 0) + (m.nudgeAt > -1 ? 1 : 0);

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:14px 20px 6px">' +
          '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">' +
            '<span class="h3">' + E(m.proto.allergen) + ' ' + E(m.proto.version) + '</span>' +
            '<span class="chip chip--navy">published</span>' +
            '<span class="meta">phase ' + (m.cur + 1) + ' of ' + m.proto.phases.length +
              ' · ' + E(m.phase.label) + '</span>' +
          '</div>' +
          '<div class="panel__actions"><span class="chip chip--peri">' +
            edited + ' edits</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:0 20px 13px">' +
          '<p class="ramp__parent">' +
            '<b>' + E(varName) + '</b>' +
            '<span>parent: ' + E(m.proto.allergen + ' ' + m.proto.version) +
              ' · phase ' + (m.cur + 1) + ' · ' + days(m.plan) + '</span>' +
          '</p>' +
          '<p class="meta" style="margin-top:7px">' +
            (m.started
              ? E(firstName(m.client.name)) + ' is on this food now, at step ' +
                (m.stepIdx + 1) + ' of ' + m.phase.steps.length + '. '
              : E(firstName(m.client.name)) + ' has not started this food — the ' +
                'template is being adapted before it begins. ') +
            'The variant is one row on <span class="mono">client_protocols.' +
            'ramp_override</span>, not a pile of edited day rows, so the library ' +
            'is untouched.</p>' +
        '</div>' +
      '</div>';
  }

  /* --- DIFF A: the food forms -------------------------------------------- */
  /* Each cell is as wide as its length in days (--span), so the chain re-spaces
     when a phase is stretched and collapses where a food form comes out. The
     narrowest cell on a 59-day chain is ~30px, so cells carry a numeral and a
     length and the names are named underneath, in words, with their edits. */

  function formCell(m, i, variant) {
    var ph = m.proto.phases[i];
    var skip = variant && i === m.skipIdx;
    var swap = variant && m.swap && i === m.swap.from;
    var dd = ph.days;
    var diff = 'same';
    var delta = '';

    if (variant && i === m.cur) {
      dd = m.phaseDays;
      if (dd > m.plan) diff = m.target > m.plan ? 'stretch' : 'hold';
      else if (dd < m.plan) diff = 'compress';
      if (dd !== m.plan) delta = signed(dd - m.plan) + ' d';
    }
    if (skip) { diff = 'skip'; dd = 2; delta = '−' + ph.days + ' d'; }
    if (swap) { diff = 'swap'; delta = 'swapped'; }

    return '<span class="ramp__step" data-diff="' + diff + '"' +
      (i === m.cur && !variant ? ' aria-current="true"' : '') +
      ' style="--span:' + dd + ';min-width:' + LANE_MIN_CELL + 'px"' +
      ' title="' + E(ph.label + ' · ' + days(ph.days) +
        (skip ? ' · skipped in this variant' : '') +
        (swap ? ' · swapped for ' + m.proto.phases[m.swap.to].foodForm : '')) + '">' +
      '<b>' + (i + 1) + '</b>' +
      '<span class="ramp__days">' + (diff === 'skip' ? 'out' : days(dd)) + '</span>' +
      (delta ? '<span class="ramp__delta">' + E(delta) + '</span>' : '') +
      '</span>';
  }

  function formLane(m, variant) {
    var units = 0, i;
    for (i = 0; i < m.proto.phases.length; i++) {
      if (variant && i === m.skipIdx) units += 2;
      else if (variant && i === m.cur) units += m.phaseDays;
      else units += m.proto.phases[i].days;
    }
    return { units: units };
  }

  function tplForms(m) {
    var stockU = formLane(m, false).units;
    var varU = formLane(m, true).units;
    var axis = Math.max(stockU, varU) || 1;
    var i;

    var stockCells = '', varCells = '';
    for (i = 0; i < m.proto.phases.length; i++) {
      stockCells += formCell(m, i, false);
      varCells += formCell(m, i, true);
    }

    /* the names, in words, with what the variant does to each — because a
       hatch and a navy fill are not a vocabulary on their own */
    var legend = '';
    for (i = 0; i < m.proto.phases.length; i++) {
      var ph = m.proto.phases[i];
      var note = '';
      if (i === m.skipIdx) {
        note = '<strong>SKIPPED</strong> — ' + days(ph.days) + ' out';
      } else if (m.swap && i === m.swap.from) {
        note = '<strong>SWAPPED</strong> → ' + E(m.proto.phases[m.swap.to].foodForm);
      } else if (i === m.cur && m.phaseDays !== m.plan) {
        note = '<strong>' + (m.phaseDays > m.plan ? 'STRETCHED' : 'COMPRESSED') +
          '</strong> ' + days(m.plan) + ' → ' + days(m.phaseDays);
      }
      legend += '<span class="meta" style="min-width:0">' +
        '<span class="mono">' + (i + 1) + '</span> ' + E(ph.label) +
        (note ? ' · ' + note : '') + '</span>';
    }

    var totalVar = 0;
    for (i = 0; i < m.proto.phases.length; i++) {
      if (i === m.skipIdx) continue;
      totalVar += i === m.cur ? m.phaseDays : m.proto.phases[i].days;
    }
    var totalStock = 0;
    for (i = 0; i < m.proto.phases.length; i++) totalStock += m.proto.phases[i].days;

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:12px 20px 4px">' +
          '<div><div class="eyebrow">The food forms</div></div>' +
          '<div class="panel__actions"><span class="meta">' +
            'Each block is as wide as its length in days</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 14px">' +
          '<div class="ramp__lane" data-lane="stock">' +
            '<div class="ramp__lanelabel">' +
              '<b>Template</b>' +
              '<span class="meta">' + E(m.proto.allergen + ' ' + m.proto.version) + ' · ' +
                days(totalStock) + ' · ' + m.proto.phases.length + ' food forms</span>' +
            '</div>' +
            '<div class="ramp ramp--edit" style="width:' +
              Math.round(stockU / axis * 1000) / 10 + '%">' + stockCells + '</div>' +
          '</div>' +
          '<div class="ramp__lane" data-lane="variant">' +
            '<div class="ramp__lanelabel">' +
              '<b>' + E(firstName(m.client.name) + '’s variant') + '</b>' +
              '<span class="meta">' + days(totalVar) + ' · ' +
                (totalVar === totalStock
                  ? 'same length, different shape'
                  : signed(totalVar - totalStock) + ' d on the chain') + '</span>' +
            '</div>' +
            '<div class="ramp ramp--edit" style="width:' +
              Math.round(varU / axis * 1000) / 10 + '%">' + varCells + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px 18px;margin-top:10px">' +
            legend + '</div>' +
        '</div>' +
      '</div>';
  }

  /* --- DIFF B: the week below -------------------------------------------- */
  /* §7.3: the ramp re-spaces and the week below it follows. Seven equal days,
     the real doses on both rows, so a three-day stretch shows up as four
     different doses rather than as 5% of a bar. */

  function weekCell(m, i, variant) {
    var at = variant ? m.varWalk[i] : m.stockWalk[i];
    var nudged = variant && i === m.nudgeAt;
    if (nudged) at = Math.max(0, at - 1);
    var dose = ART.makeDose(m.client, m.proto.id, m.cur, at, m.dates[i], {
      timing: (m.cp && m.cp.timing) || '16:30',
      waitLevel: m.cp && m.cp.waitLevel !== undefined ? m.cp.waitLevel : 2,
      status: 'planned',
      isMaintenance: false
    });
    var faces = doseFaces(dose);

    var diff = 'same', delta = '';
    if (variant) {
      if (nudged) { diff = 'nudge'; delta = '−1 step'; }
      else if (at !== m.stockWalk[i]) {
        var n = at - m.stockWalk[i];
        diff = m.hold > 0 && at === m.stepIdx ? 'hold' : 'stretch';
        /* the delta is always the DIFFERENCE from the template, in steps —
           the word matches the vocabulary the legend and the controls use */
        delta = diff === 'hold' ? 'held'
          : signed(n) + ' step' + (Math.abs(n) === 1 ? '' : 's');
      }
    }

    return '<span class="ramp__step" data-diff="' + diff + '" style="--span:1"' +
      ' title="' + E(ui.dayLabel(m.dates[i]) + ' · ' + faces.big + ' · step ' +
        (at + 1) + ' of ' + m.phase.steps.length) + '">' +
      '<b>' + E(faces.big) + '</b>' +
      '<span class="ramp__days">' + E(ui.dayLabel(m.dates[i])) + '</span>' +
      (delta ? '<span class="ramp__delta">' + E(delta) + '</span>' : '') +
      '</span>';
  }

  function tplWeek(m) {
    var stock = '', vary = '', i;
    for (i = 0; i < m.dates.length; i++) {
      stock += weekCell(m, i, false);
      vary += weekCell(m, i, true);
    }
    var moved = 0;
    for (i = 0; i < m.dates.length; i++) {
      var at = m.varWalk[i];
      if (i === m.nudgeAt) at = Math.max(0, at - 1);
      if (at !== m.stockWalk[i]) moved++;
    }

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:12px 20px 4px">' +
          '<div><div class="eyebrow">The week it publishes</div></div>' +
          '<div class="panel__actions"><span class="meta">' +
            E(ui.dayLabel(m.dates[0])) + ' → ' + E(ui.dayLabel(m.dates[6])) +
            '</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 14px">' +
          '<div class="ramp__lane" data-lane="stock">' +
            '<div class="ramp__lanelabel">' +
              '<b>Template</b>' +
              '<span class="meta">what the week builder pre-fills</span>' +
            '</div>' +
            '<div class="ramp ramp--edit">' + stock + '</div>' +
          '</div>' +
          '<div class="ramp__lane" data-lane="variant">' +
            '<div class="ramp__lanelabel">' +
              '<b>' + E(firstName(m.client.name) + '’s variant') + '</b>' +
              '<span class="meta">' +
                (moved ? moved + ' of 7 days move' : 'the same seven days — so far') +
                '</span>' +
            '</div>' +
            '<div class="ramp ramp--edit">' + vary + '</div>' +
          '</div>' +
          '<p class="meta" style="margin-top:8px">' +
            'Stretching and holding change next week. Skipping and swapping change ' +
            'the chain weeks ahead.</p>' +
        '</div>' +
      '</div>';
  }

  /* --- the controls: all seven, two of them live ------------------------- */

  function ctrlRow(title, note, control, live) {
    return '' +
      '<div class="list__item" style="padding:9px 0;display:grid;' +
        'grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center">' +
        '<div style="min-width:0">' +
          '<strong>' + title + '</strong>' +
          '<p class="meta" style="margin-top:3px">' + note + '</p>' +
        '</div>' +
        '<div style="flex:0 0 auto"' + (live ? ' data-live="' + E(live) + '"' : '') + '>' +
          control + '</div>' +
      '</div>';
  }

  function tplControls(m) {
    var i;

    /* 1 — stretch or compress, wired. Every option on the control is sourced:
       the template's plan, the practice's own quartiles for this exact phase,
       or a week more. */
    var seg = '<div class="seg" role="group" aria-label="Length of this phase">';
    for (i = 0; i < m.opts.length; i++) {
      var o = m.opts[i];
      seg += '<button class="seg__item" type="button" data-pr="stretch" data-days="' +
        o.d + '" aria-pressed="' + (o.d === m.target ? 'true' : 'false') +
        '" title="' + E(o.tip) + '">' +
        '<span class="num">' + o.d + '</span> d</button>';
    }
    seg += '</div>';

    var statLine = m.stat
      ? 'The practice takes a median <strong>' + days(m.stat.medianActual) +
        '</strong> on ' + E(m.phase.label) + ' against a planned ' + days(m.stat.plannedDays) +
        ' (n=' + m.stat.n + ', ' + m.stat.repeatPct + '% repeat days).'
      : 'No completed runs of this food form yet.';

    /* 2 — hold here, wired */
    var step = m.phase.steps[m.stepIdx];
    var atDose = ART.makeDose(m.client, m.proto.id, m.cur, m.stepIdx, m.dates[0], {
      timing: '16:30', waitLevel: 2, status: 'planned', isMaintenance: false
    });
    var hold = '' +
      '<div class="stepper" data-size="sm">' +
        '<button class="stepper__btn" type="button" data-pr="hold" data-dir="-1"' +
          ' aria-label="Fewer held days"' + (m.hold <= 0 ? ' disabled' : '') + '>−</button>' +
        '<span class="stepper__value">' + (m.hold ? '+' + m.hold + ' d' : 'none') + '</span>' +
        '<button class="stepper__btn" type="button" data-pr="hold" data-dir="1"' +
          ' aria-label="More held days"' + (m.hold >= HOLD_MAX ? ' disabled' : '') +
          '>+</button>' +
      '</div>';

    /* 3 — skip a food form, rendered not wired, target named */
    var skipCtrl, skipNote;
    if (m.skipIdx > -1) {
      var sp = m.proto.phases[m.skipIdx];
      var ss = phaseStat(m.proto.id, m.skipIdx);
      skipNote = '<strong>' + E(sp.label) + '</strong> — ' + days(sp.days) + ' on the plan' +
        (ss ? ', a median ' + days(ss.medianActual) + ' in practice and ' +
          ss.repeatPct + '% repeat days' : '') +
        '. Out of this variant already.';
      skipCtrl = '<button class="btn" type="button" data-static>Skip this food form</button>';
    } else {
      skipNote = 'Every food form ahead of ' + E(firstName(m.client.name)) +
        ' is the goal of the protocol, so there is nothing here to drop.';
      skipCtrl = '<button class="btn" type="button" data-static disabled>' +
        'Skip this food form</button>';
    }

    /* 4 — swap a food form for one at the same protein load */
    var swapCtrl, swapNote;
    if (m.swap) {
      var sf = m.proto.phases[m.swap.from];
      var stt = m.proto.phases[m.swap.to];
      swapNote = '<strong>' + E(sf.label) + '</strong> ' +
        '<span class="mono">' + E(m.swap.fromStep.display) + '</span> = ' +
        '<span class="mono">' + gramStr(m.swap.fromG) + '</span> → ' +
        '<strong>' + E(stt.foodForm) + '</strong> ' +
        '<span class="mono">' + E(m.swap.toStep.display) + '</span> = ' +
        '<span class="mono">' + gramStr(m.swap.toG) + '</span>' +
        (m.swap.cleared
          ? ', a food form already cleared &mdash; and at a serving above the ' +
            '<span class="mono">' + E(stt.steps[stt.steps.length - 1].display) +
            '</span> that form ended on, so it is an advance and not a repeat.'
          : '.');
      swapCtrl = '<button class="btn" type="button" data-static>Swap food form</button>';
    } else {
      swapNote = 'Nothing else on ' + E(m.proto.allergen + ' ' + m.proto.version) +
        ' carries a food form ahead of ' + E(firstName(m.client.name)) +
        ' at the same load within 12% &mdash; the forms behind have already been ' +
        'cleared at more than it, and a cleared form at a lower serving is a step ' +
        'back, not an equivalent. On a longer chain this control has somewhere to go.';
      swapCtrl = '<button class="btn" type="button" data-static>Swap food form</button>';
    }

    /* 5 — nudge one day */
    var nudgeNote = m.nudgeAt > -1
      ? '<strong>' + E(ui.dayLabel(m.dates[m.nudgeAt])) + '</strong> sits one step ' +
        'back in this variant. The six days around it are untouched — a nudge is ' +
        'not a hold.'
      : 'The template does not advance a step inside this week, so there is no ' +
        'day to nudge.';

    return '' +
      '<div class="panel">' +
        '<div class="panel__head" style="padding:12px 20px 2px">' +
          '<div><div class="eyebrow">Change it for this child</div></div>' +
          '<div class="panel__actions"><span class="meta">' +
            'Two of these are live on this board</span></div>' +
        '</div>' +
        '<div class="panel__body" style="padding:2px 20px 10px">' +

          '<p class="meta" style="margin:0 0 2px"><strong>The pace</strong> — ' +
            statLine + '</p>' +
          '<div class="list">' +
            ctrlRow('Stretch or compress ' + E(m.phase.label),
              'The whole food form, re-spaced across the ' + m.phase.steps.length +
                ' steps. Now <span class="mono">' + days(m.phaseDays) + '</span>.',
              seg, 'stretch the phase') +
            ctrlRow('Hold here for more days',
              'Stay at <span class="mono">' + E(prep.household(atDose)) + '</span>' +
                (step && step.food ? ' ' + E(step.food) : '') +
                ' instead of advancing. Adds to the food form’s length.',
              hold, 'hold here') +
          '</div>' +

          '<p class="meta" style="margin:14px 0 2px"><strong>The food</strong> — ' +
            'not every child will eat every form of it.</p>' +
          '<div class="list">' +
            ctrlRow('Skip this food form', skipNote, skipCtrl) +
            ctrlRow('Swap food form', swapNote, swapCtrl) +
          '</div>' +

          '<p class="meta" style="margin:14px 0 2px"><strong>One day</strong> — ' +
            'a single day off the ramp, without breaking the rest of it.</p>' +
          '<div class="list">' +
            ctrlRow('Nudge one day', nudgeNote,
              '<button class="btn" type="button" data-static>Nudge a day</button>') +
          '</div>' +

        '</div>' +
      '</div>';
  }

  /* --- the footer: the two things you can do with a variant -------------- */

  function tplFooter(m) {
    var varName = firstName(m.client.name) + '’s variant';
    return '' +
      '<div class="panel" style="margin-top:auto">' +
        '<div class="panel__body" style="padding:12px 20px 13px;display:flex;' +
          'align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div style="min-width:0;flex:1 1 240px">' +
            '<p class="meta" style="margin:0">Saved against this child only. The ' +
              'library keeps <span class="mono">' +
              E(m.proto.allergen + ' ' + m.proto.version) + '</span>; proposing it ' +
              'sends a candidate version to the owner, who is the only account ' +
              'that can publish one.</p>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">' +
            '<button class="btn btn--primary" type="button" data-static>Save as ' +
              E(varName) + '</button>' +
            '<button class="btn" type="button" data-static>Propose to the library</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ================================================================ events == */

  function bind(root) {
    if (root.__artPractBound) return;
    root.__artPractBound = true;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
  }

  /* a local repaint: the roster scope and the two ramp edits belong to one
     frame each, so they redraw that frame and nothing else */
  function repaint(which) {
    var el = roots[which];
    if (!el) return;
    if (which === 'roster') roster(el);
    else if (which === 'builder') builder(el);
    else if (which === 'templates') templates(el);
  }

  function setEdit(patch) {
    var m = subject();
    if (!m) return;
    var cur = view.edit && view.edit.key === m.key
      ? view.edit
      : { key: m.key, days: m.plan, hold: 0 };
    view.edit = {
      key: m.key,
      days: patch.days === undefined ? cur.days : patch.days,
      hold: patch.hold === undefined ? cur.hold : patch.hold
    };
    repaint('templates');
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    /* SPEC §7: Fill ↓, the condition checkboxes and the four template controls
       that are not wired are rendered at full strength and do not respond. */
    if (t.closest('[data-static]')) { e.preventDefault(); return; }

    var act = t.closest('[data-pr]');
    if (act) {
      var a = act.getAttribute('data-pr');

      if (a === 'step') {
        store.draftStep(+act.getAttribute('data-day'), +act.getAttribute('data-dir'));
        return;
      }
      if (a === 'publish') { publish(); return; }
      if (a === 'again') { store.startDraft(store.state.focusClientId); return; }

      if (a === 'scope') {
        var sc = act.getAttribute('data-scope') === 'all' ? 'all' : 'mine';
        if (sc !== view.scope) { view.scope = sc; repaint('roster'); }
        return;
      }
      if (a === 'stretch') { setEdit({ days: +act.getAttribute('data-days') }); return; }
      if (a === 'hold') {
        var m = subject();
        if (!m) return;
        var n = Math.max(0, Math.min(HOLD_MAX,
          m.hold + (+act.getAttribute('data-dir') > 0 ? 1 : -1)));
        if (n !== m.hold) setEdit({ hold: n });
        return;
      }
      return;
    }

    var row = t.closest('[data-client]');
    if (row) {
      var id = row.getAttribute('data-client');
      if (id !== store.state.focusClientId) store.set({ focusClientId: id });
    }
  }

  function onChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.closest && t.closest('[data-static]')) { e.preventDefault(); return; }
    var day = t.getAttribute('data-day');
    if (day === null) return;
    var field = t.getAttribute('data-field');
    if (field === 'timing' && t.value) store.draftSet(+day, { timing: t.value });
    else if (field === 'wait') store.draftSet(+day, { waitLevel: +t.value });
  }

  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('[data-client]');
    if (!row) return;
    e.preventDefault();
    var id = row.getAttribute('data-client');
    if (id !== store.state.focusClientId) store.set({ focusClientId: id });
  }

  /* ================================================================ export ==
     One function per frame, keyed by its LAYOUT key, plus `render` as an alias
     of the roster so an older app.js still puts something real on the desk. */

  ART.zones = ART.zones || {};
  ART.zones.practitioner = {
    roster: roster,
    builder: builder,
    templates: templates,
    render: roster
  };
}());
