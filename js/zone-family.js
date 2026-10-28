/* ===========================================================================
   A.R.T. pitch board — js/zone-family.js     owner: family        SPEC §6.2
   ---------------------------------------------------------------------------
   Section 2. The surface a parent uses at 4pm at a kitchen counter with a
   hungry child. Rebuilt 2026-10-20 against DESIGN_PASS.md PART 4 and PART 5.

   WHAT CHANGED THIS ROUND AND WHY
   Geoff: "I hate the design, it is messy misaligned, ugly, not clean… Start by
   redoing the UX everywhere (colors are not bad) but the design sucks, then do
   the Home, and then make the schedule next to it."

   So the craft, not the colour and not the features:

   1. NO INLINE STYLE LAYS OUT A PHONE ANY MORE. Six screens used to open with
      the same 60-character padding string and then every block re-declared its
      own flex column and its own gap — 7px here, 8 there, 9 below it — which
      is how six devices ended up with five different rhythms. `.pscreen` owns
      the gutter, the top inset and the 12px between blocks; `.psec` is the one
      band label and there are never more than two — HOME now spends ZERO of
      them (HOME_SPEC §6); `.tally` and `.band` own their own row rhythm. Across all seven phones the only `style` left is
      `--pct` on the NEXT UP track, which app.css asks for by name. (The three
      geometry properties on the FRAME — `--phone-h`, the pinned caption height
      and the ugc ledger's `--tbl-h` — are the board's, not a screen's.)

   2. ONE CLOCK. `NOW` and `BAR_CLOCK` were two constants in this file holding
      the same moment in two formats. Both are gone: the wall clock is
      `ART.store.state.now`, and `ui.clockShort` / `ui.clockTiny` format it.

   3. ONE DEFINITION OF THE DAY. `dayRows`, `nextUp`, `dayCount` and `ordMap`
      were this zone re-deriving what metrics.js already knows. Gone, replaced
      by `ART.metrics.daySplit` / `upNext` / `loggedFeed` / `nextUnlogged`, so
      HOME's NEXT UP and SCHEDULE's CORE band are literally the same objects.

   THE FOUR TABS, left to right across the section (DESIGN_PASS PART 3)

       HOME  ·  SCHEDULE  ·  CALENDAR  ·  MORE

   and nothing that needs READING sits in the fast path.

   THE SEVEN FRAMES
     ph-home      HOME — rebuilt this round to the shipped app's own metrics
                  (HOME_SPEC §4–§7), and it FITS WITH NO SCROLL in the 764px
                  port a real phone's proportions leave: the header · NEXT UP ·
                  FOUR log rows at 40 tall with a 58px left-aligned time gutter
                  · `View all` · three primary tiles and two secondary ones ·
                  `+ Log something earlier` · the tab bar. Every item on that
                  list survived the device getting shorter; the row count is
                  what paid for it, measured across all 64 children.
                  Not one count, stat or section header anywhere on it.
     ph-schedule  SCHEDULE — new, and the core of the product. The week
                  selectable Mon–Sun, then two bands: CORE (required, timed,
                  strict — the tablet, the drops, the treated dose with its
                  wait, the spine tap on its days) and OTHER (must happen
                  today, timing is yours). The contrast IS the feature.
     ph-calendar  CALENDAR — the week, plan against actual. Content unchanged
                  this round; Geoff: "move them to the right."
     ph-reports   REPORTS — the record, built this round to the reference app's own
                  Reports tab (HOME_SPEC §12): the adherence ring with its
                  period, the component bars under it, a three-tile strip, the
                  phase rail, ONE phase card and NEXT STEP. It fits the 764px
                  port with 16 to spare for all 64 children, and the phase
                  card count is what paid for it.
     ph-prep      PREP — almost wordless. The viz IS the screen.
     ph-meals     MEALS — the one deep surface built through, as P3 cards.
     ph-more      MORE — a real populated menu over everything complex.
     ph-handoff   the IDENTICAL HOME screen, embedded in section 3, so the
                  published week visibly lands on a phone.
     ugc          the review loop as a real diagram (unchanged this round).

   THE RULE THAT GOVERNS EVERY STRING IN THIS FILE
   If a sentence on a phone runs past eight words it is a defect. Status is a
   chip or a glyph, explanation is a data line, an instruction is a number and
   a unit. eightWords() is the clamp and it is applied to everything that comes
   out of the dose engine or the content set.

   THE PALETTE IS UNCHANGED. the reference app is purple; we are cream, navy and coral,
   which he called "phenom" three times. There is not one colour in this file:
   css/app.css owns every hue, radius, shadow and typeface.

   API
     ART.zones.family.phoneToday(client, idPrefix, opts) -> HTML STRING, pure
     ART.zones.family.home / schedule / calendar / prep / meals / more /
                      handoff / ugc   -> function(root)

   phoneToday() is pure — it reads ART.store.state and ART.db, mutates
   nothing, touches no DOM — and returns a complete `.phone` as a string, so
   there is exactly ONE implementation of the homebase on the board. SPEC §6.3
   and js/zone-practitioner.js both name it, so the name stays.

   Interactivity is SPEC §7 plus what PART 4 and PART 5 explicitly name, and
   nothing more: log a dose, the drops, the tap, a food group or a reaction
   (§7.5) with reason chips, tap a row to drive Prep (§7.6), tick an item on
   SCHEDULE and pick a day on its Mon–Sun strip (PART 5), the Meals food
   filter and Save an idea (§7.7). The tab bar is rendered and deliberately
   inert — navigation is not in §7, and a tab drawn as a button that moved
   nothing would be a worse lie than a tab drawn as what it is.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var esc = ui.esc;

  /* ------------------------------------------------------------ constants -- */

  /* THE DEVICE IS 390 x 818, AND THE FRAME IS TALLER THAN THE DEVICE.
     "make the screens normal size these are too big of screens, phones aren't
     that long" is about the HARDWARE a reader looks at, so the ratio has to be
     measured on the glass, not on the §4c rectangle:

         390 device  − 2 x 12 bezel      = 366 of glass across
         366 x 2.168 (a real 393 x 852)  = 794 of glass down
         794 + 2 x 12 bezel              = 818 of device

     818 is therefore PHONE_H — the height of `.phone` — and it is NOT the
     height of the LAYOUT frame, because a frame in this section is a caption
     head stacked on a device, not a device:

         FRAME_H = HEAD_H (132) + the head's 24px margin + PHONE_H (818) = 974

     That distinction is the whole of this round. At frame 818 the device would
     be 818 − 156 = 662, a 366 x 638 glass at 1:1.74 — squatter than an iPad
     mini, and an overshoot of the same defect rather than a fix. It is also
     not survivable: HOME's required furniture (HOME_SPEC §6) needs 623px of
     scroll port before it can show even ONE log row, and a 662-tall device
     only has 608. So canvas.js's `ph-*` and `ugc` rows want h974 — see the
     crossFileRequest; until they do, `.phone` simply overhangs its frame (156
     rather than the 384 it overhangs today), which is the safe direction.

     HEAD_H stays PINNED so all seven phones stand at exactly the same height —
     a head that sized itself to its own note would stagger them — and stays
     at 132, which clears the tallest caption in this file (113, a two-line
     note) with a line of headroom. */
  var HEAD_H = 132;
  var GLASS_H = 794;              /* 366 of glass x 2.168, the real ratio    */
  var BEZEL = 12;                 /* .phone's own padding, per side          */
  var PHONE_H = GLASS_H + BEZEL * 2;                       /* 818            */
  var FRAME_H = HEAD_H + 24 + PHONE_H;                     /* 974            */

  /* The drawing width inside a card, MEASURED off the live board rather than
     derived from a chain of paddings. There is exactly ONE host for a VW-wide
     drawing on the whole board — PREP's `.vizbig` — and its content box reads
     310px: 390 device − 2x12 bezel = a 366px screen, −2x16 of .pscreen gutter
     = 334 of card, −2x12 of .vizbig's own padding = 310.

     It was 224 against a 300px device. Every `actual size` drawing in PREP is
     measured in MM against this number and .chart__svg is `width:100%`, so
     leaving it at 224 inside a 310px box would have scaled a 1:1 measuring
     spoon up by 1.38 and quietly made the one honest claim on the board
     false. (`.vizbig` also caps the drawing at --vizbig-h, which costs the
     1:1 about 6% on the tallest viz — pre-existing, and noted upstream.) */
  var VW = 310;
  var MM = 3.7795;           /* 1mm in CSS px at 96dpi — "actual size"       */

  /* THE ONE GUTTER. This was a 60-character inline padding string, which is
     how six phones ended up with five different gutters; `.pscreen` owns the
     16px side gutter, the 16px top inset, the 12px gap between blocks and the
     tab bar's bleed back out to the hardware edge. A screen sets no padding. */
  var SCREEN = '<div class="pscreen">';

  /* HOW MANY ROWS THE TALLY SHOWS, and how much height it may take.

     HOME_SPEC §4 asked for `rows shown 6`, and six rows fitted a 992px scroll
     port. THE PORT IS NOW 764 — 818 of device, less 2 x 12 of bezel, less the
     30px status bar — so the count is the lever that pays for the device being
     the right shape, and it is the honest lever: HOME_SPEC §6's furniture is
     a fixed list (header · NEXT UP · the card · five tiles · `+ Log something
     earlier` · the tab bar) and nothing in it may be deleted, while a log row
     is the one thing on the screen there can legitimately be fewer of.

     The height box stays as the SECOND guard, because the count alone cannot
     keep "it fits on one screen with no scrolling": a feed that spans three
     days carries two dividers where one that spans two carries one, so the
     same four rows are 28px taller for one child than another. Four rows is
     the ceiling; the box is the floor under it, and whichever binds first wins.

     The row metrics are unchanged — §21 set them and they are not being
     retuned to buy height:
         40  one .logrow                        24  the first .tallyday
         40  the `View all` row                 28  every one after it
          8  the card's own padding, 4 top + 4 bottom

     BOTH NUMBERS ARE MEASURED ON THE LIVE BOARD at the new port, across all
     64 children in the set, not reasoned about. Everything on HOME that is
     not the card — the 16px top inset, the header, NEXT UP, the five tiles,
     `+ Log something earlier`, the tab bar and the five 12px gaps — takes 493
     for a one-line NEXT UP headline and 502 for a two-line one, and 15 of the
     64 children carry the two-line one. So the card's budget is 764 − 502 =
     262, and the card wants:
         232   four rows across ONE day    (8 + 24 + 4x40 + 40)
         260   four rows across TWO days
         288   four rows across THREE days
         300   five rows across TWO days
     262 is the number. It seats four rows for every child whose four rows
     span two days or fewer, which is all 64 — the measured worst case is 259
     — and it holds the child whose four rows span three days to three rather
     than scrolling the device, which is the trade the box exists to make.
     Five rows does not fit for anybody: 502 + 300 is 802 against a 764 port.

     Measured result: HOME scrolls for 0 of 64 children. The worst case is
     c-00 at 761 of 764, so the slack is 3px — thin, and worth knowing before
     anything is added to this screen. The dataset is fixed (no Math.random),
     so 761 is a real ceiling and not an estimate. */
  var TALLY_ROWS = 4;
  var TALLY_BOX = 262;
  var ROW_H = 40, LINK_H = 40, DIV_H = 28, DIV_H1 = 24, TALLY_PAD = 8;
  var TALLY_FETCH = 24;

  var REASONS = [
    { key: 'cold', label: 'Cold', note: 'skip, had cold' },
    { key: 'vaccine', label: 'Vaccine', note: 'skip, vaccine' },
    { key: 'travel', label: 'Travel', note: 'skip, travelling' },
    { key: 'refused', label: 'Refused', note: 'skip, refused it' },
    { key: 'other', label: 'Other', note: 'skip' }
  ];

  /* DESIGN_PASS PART 3, as the tab bar. HOME and SCHEDULE are the product,
     CALENDAR is the booklet's week, MORE is everything that needs reading —
     which is the point of having it. */
  var TABS = [
    { key: 'home', label: 'Home' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'more', label: 'More' }
  ];

  /* THE FIVE BUTTONS (PART 4.4), in his order. `what` is the argument to
     ART.metrics.nextUnlogged, so every tile stands on a real unlogged entry
     or renders disabled — a tile that logged nothing would be a lie. `taps`
     deliberately reaches back to the spine tap missed on Mon 10/19, which is
     the whole reason the product exists. */
  /* Row one is the two things logged constantly — the treated dose and a
     maintenance food — at full width. Row two is the standing items with the
     exception between them: Drops · Reaction · Taps. */
  var ACTIONS = [
    { act: 'dose', word: 'Dose', what: 'dose' },
    { act: 'food', word: 'Food', what: 'food' },
    { act: 'drops', word: 'Drops', what: 'drops' },
    { act: 'reaction', word: 'Reaction', what: 'dose', react: true },
    { act: 'taps', word: 'Taps', what: 'tapping' }
  ];

  /* The wait protocol as CHIPS, never as a numbered list. prep.js owns the
     ladder and its full sentences; this is the same four levels in the form a
     366px screen can carry. If ART.prep.waitProtocol() ever returns `chips`,
     that wins — see crossFileRequests. */
  var WAIT_CHIPS = {
    3: ['not late', 'wait 30 min', 'hot shower', 'or 10 min exercise'],
    2: ['wait 15 min', 'stay with them'],
    1: ['no wait needed'],
    0: ['no wait']
  };

  /* measuring spoons, largest first — the greedy decomposition a parent
     actually performs at the drawer */
  var SPOONS = [
    { v: 3, label: '1 Tbsp', r: 24 },
    { v: 1, label: '1 tsp', r: 17 },
    { v: 0.5, label: '1/2', r: 13.5 },
    { v: 0.25, label: '1/4', r: 11 }
  ];

  /* Review states for community content are drawn from the navy/periwinkle
     chip ramp, NEVER from .pill[data-status]: the status trio means a logged
     dose outcome, and a meal idea in review is not a child who held a dose. */
  var IDEA_STATE = {
    saved: {
      chip: 'chip--neutral', word: 'Saved',
      mine: 'Saved', short: 'saved'
    },
    submitted: {
      chip: 'chip--peri', word: 'In review',
      mine: 'Shared — in review', short: 'with your practitioner'
    },
    approved: {
      chip: 'chip--navy', word: 'Published',
      mine: 'Shared — published', short: 'in the shared library'
    },
    declined: {
      chip: 'chip--react', word: 'Declined',
      mine: 'Declined', short: 'declined'
    }
  };
  /* ------------------------------------------------------------- plumbing -- */

  function st() { return ART.store.state; }

  function clientProtocol(client, protocolId) {
    if (!client) return null;
    for (var i = 0; i < client.protocols.length; i++) {
      if (client.protocols[i].protocolId === protocolId) return client.protocols[i];
    }
    return null;
  }

  function doseOn(client, iso, protocolId) {
    var list = client && client.days[iso];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].protocolId === protocolId) return list[i];
    }
    return null;
  }

  /* the drops / the tap for one date, or null when it is not due that day */
  function itemOn(client, iso, kind) {
    var list = client && client.days[iso];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].itemType === kind) return list[i];
    }
    return null;
  }

  function isItem(entry) {
    return !!(entry && entry.itemType && entry.itemType !== 'dose');
  }

  /* the whole day, time-ordered — drops before the food, the tap last */
  function dayEntries(client) {
    if (!client) return [];
    return ART.dayEntries ? ART.dayEntries(client, st().today)
      : (client.days[st().today] || []);
  }

  function dayFoods(client) {
    if (!client) return [];
    return ART.dayDoses ? ART.dayDoses(client, st().today)
      : dayEntries(client).filter(function (e) { return !isItem(e); });
  }

  /* The entry the Prep phone explains. familyDoseId when it is set — which is
     how tapping a log row drives Prep — otherwise the first FOOD dose of
     today still to come, because that is the one a parent is standing at the
     counter for, and it is where the fraction engine earns its place. */
  function prepTarget(client) {
    if (!client) return null;
    var s = st();
    var all = dayEntries(client);
    var i;
    if (s.familyDoseId) {
      for (i = 0; i < all.length; i++) if (all[i].id === s.familyDoseId) return all[i];
      var pinned = ART.store.entry(client.id, s.familyDoseId);
      if (pinned) return pinned;
    }
    /* A CORE dose first. Since the day split, the first unlogged food of the
       day is often a maintenance serving — and `1 serving` has nothing to
       work out, so Prep would draw a whole plate where the frame's whole
       argument is the fraction engine. The dose being ramped is the one with
       a count, a fraction and a wait protocol on it. */
    var foods = dayFoods(client);
    for (i = 0; i < foods.length; i++) {
      if (foods[i].status === 'planned' && foods[i].band !== 'other') return foods[i];
    }
    for (i = 0; i < foods.length; i++) if (foods[i].status === 'planned') return foods[i];
    for (i = 0; i < all.length; i++) if (all[i].status === 'planned') return all[i];
    return foods[0] || all[0] || null;
  }

  function practitioner(client) {
    return practitionerById(client && client.practitionerId);
  }

  function practitionerById(id) {
    var ps = (ART.db && ART.db.practitioners) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }

  function centre(client) {
    var cs = (ART.db && ART.db.centres) || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === (client && client.centreId)) return cs[i];
    return null;
  }

  function firstName(person) {
    return String((person && person.name) || '').split(' ')[0];
  }

  /* 'Mara R.' -> the attribution string a family's own idea carries. Compared
     on the name PREFIX so a straight or curly apostrophe both match. */
  function isMine(idea, client) {
    if (!idea || !client || idea.source !== 'family') return false;
    var by = String(idea.submittedByName || '');
    if (by && by.indexOf(client.name) === 0) return true;
    return (idea.savedByClientIds || []).indexOf(client.id) >= 0 && idea.status === 'saved';
  }

  function slug(s) { return String(s).replace(/[^A-Za-z0-9]+/g, '-'); }

  function reasonFor(key) {
    for (var i = 0; i < REASONS.length; i++) if (REASONS[i].key === key) return REASONS[i];
    return REASONS[REASONS.length - 1];
  }

  function plural(n, word) { return n === 1 ? word : word + 's'; }

  /* the first sentence of a method, which is all the review-loop diagram's
     cards have room for. Phones use eightWords() instead — the diagram is a
     desktop frame 1400px wide and is not bound by the phone rule. */
  function firstSentence(body, max) {
    var t = String(body || '').trim();
    var m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
    var out = (m ? m[0] : t).trim();
    var lim = max || 118;
    if (out.length > lim) out = out.slice(0, lim - 1).replace(/\s+\S*$/, '') + '…';
    return out;
  }

  function initial(client) {
    return String((client && client.name) || '?').charAt(0).toUpperCase();
  }

  /* ----------------------------------------------------- the eight-word rule -- */

  function wordsOf(s) {
    return String(s || '').trim().split(/\s+/).filter(function (w) { return !!w; });
  }

  /* Never end a clamped line on a conjunction, article or preposition. */
  function tidyTail(s) {
    var t = String(s).replace(/[\s,;:·—–-]+$/, '');
    for (var i = 0; i < 4; i++) {
      t = t.replace(
        /\s+(?:and|or|but|with|the|a|an|of|to|in|on|at|for|from|into|beside|then|that|it|is|as|so|per|by)$/i,
        ''
      );
    }
    return t;
  }

  /* THE hard rule of this file, as a function. Whole sentences while they fit
     eight words; then whole clauses; then eight words and an ellipsis. Applied
     to everything that comes out of prep.js or the meal-idea set, because both
     of those write for a desktop console and this is a phone. */
  function eightWords(text, max) {
    var lim = max || 8;
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (wordsOf(t).length <= lim) return t;

    var sentences = t.match(/[^.!?]+[.!?]?/g) || [t];
    var out = '', n = 0, i, k;
    for (i = 0; i < sentences.length; i++) {
      k = wordsOf(sentences[i]).length;
      if (n + k > lim) break;
      out += sentences[i];
      n += k;
    }
    if (out.trim()) return out.trim();

    var clauses = String(sentences[0]).split(/\s*(?:,|;|:|—|–)\s+/);
    out = ''; n = 0;
    for (i = 0; i < clauses.length; i++) {
      k = wordsOf(clauses[i]).length;
      if (n + k > lim) break;
      out += (out ? ', ' : '') + String(clauses[i]).trim().replace(/[.!?]+\s*$/, '');
      n += k;
    }
    if (out.trim()) return tidyTail(out) + '.';

    return tidyTail(wordsOf(t).slice(0, lim).join(' ')) + '…';
  }

  /* ------------------------------------------------------------- the clock -- */

  /* ONE clock, and it is not in this file. `NOW` and `BAR_CLOCK` used to live
     here as two constants holding the same moment in two formats, which is two
     answers to one question. The wall clock is ART.store.state.now and core.js
     owns every format of it: clockShort for the device status bar, clockTiny
     for the 58px time column, clock for a sentence. */
  function greeting() {
    var m = ui.nowMin();
    if (m < 12 * 60) return 'Good morning';
    if (m < 17 * 60) return 'Good afternoon';
    if (m < 21 * 60) return 'Good evening';
    return 'Good night';
  }

  /* ------------------------------------------------------------- the day --- */

  /* THE DAY IS NOT DERIVED HERE ANY MORE. dayRows / nextUp / dayCount / ordMap
     were this zone computing what metrics.js already publishes, which is how
     HOME and the old Checklist drifted apart. Four calls now, and both screens
     stand on the same live entry objects:

       ART.metrics.daySplit(client, iso)   {core[], other[], counts}
       ART.metrics.upNext(client)          the next unlogged CORE item by clock
       ART.metrics.loggedFeed(client, n)   what was actually logged, newest first
       ART.metrics.nextUnlogged(client, k) the entry one tile would log

     So NEXT UP on HOME and the top of SCHEDULE's CORE band are the same row,
     and a tick on either is one ART.store.logEntry on one object. */

  function split(client, iso) {
    return ART.metrics.daySplit(client, iso || st().today);
  }

  /* ART.entryLabel is the ONE definition of a row's name — 'Drops', 'Spine
     tap', 'Alka-Seltzer', the allergen. This file used to keep its own
     rowName(), which did not know about the tablet and called it a dose. */
  function fullName(e) {
    if (isItem(e)) return String(e.label || ART.entryLabel(e));
    return String(e.allergen || 'the dose');
  }

  /* The dose AS DATA at row width. prep.js owns both widths — fullDetail for a
     card, rowDetail for a 58px-column row — and it honours the units toggle.
     The old local rowDose() collapsed anything over 14 characters to
     '1 serving', which now mislabels the two split egg servings. */
  function rowDose(e) { return ART.prep.rowDetail(e); }

  /* --- the type marker -----------------------------------------------------
     THE PILL IS A TYPE MARKER, NEVER A STATUS (the UX brief §6). Five kinds, five
     tints, pinned by data-kind so one item is one colour everywhere on the
     board: the tablet, the drops, a dose of a food being treated, a
     maintenance serving, the spine tap. Two treated foods share the `dose`
     tint deliberately — the pill says what KIND of event it was, and the row's
     own name says which food. */
  function markKind(kind, band) {
    if (kind === 'alka') return 'tablet';
    if (kind === 'drops' || kind === 'tapping') return kind;
    return band === 'other' ? 'food' : 'dose';
  }

  /* --- where a row sits in the day ----------------------------------------
     Two facts from two places, exactly as §18d says: `late` comes off the
     clock, `future` off the date. A row on a past day that was never logged is
     overdue whatever its hour. */
  function rowWhen(e, iso, nowId) {
    var today = st().today;
    if (iso > today) return 'future';
    if (e.status !== 'planned') return '';
    if (iso < today) return 'overdue';
    if (ui.minutesOf(e.timing) >= 0 && ui.minutesOf(e.timing) < ui.nowMin()) return 'overdue';
    return e.id === nowId ? 'now' : '';
  }

  /* --- the wait protocol, as ONE line ------------------------------------
     `wait 30 min + hot shower` is prep.js's own short form, which is why it is
     not written here. Levels 0 and 1 have no wait at all and get no line — a
     row that said "no wait needed" would be a sentence explaining an absence.
     It goes in .checkrow__note, a full-width grid row, and NOT in
     .checkrow__sub: 170px of type does not fit an 85px item cell. */
  function waitNote(e) {
    if (isItem(e) || !e.waitLevel || e.waitLevel < 2) return '';
    var w = ART.prep.waitProtocol(e.waitLevel);
    var s = String((w && w.short) || '').trim();
    if (!s || s === '—') return '';
    return /^wait\b/i.test(s) ? s : 'wait ' + s;
  }

  /* --- the aria labels ---------------------------------------------------
     A row is five columns of data to a sighted parent and one sentence to a
     screen reader, so the sentence is built once and carries the facts the
     glyph and the ink carry visually. */
  function feedAria(r) {
    return [r.label, r.full || r.detail, r.dayLabel + ' ' + r.at,
      String(r.statusLabel || '').toLowerCase()].join(', ') +
      ' — show how to prepare it';
  }

  /* ---------------------------------------------------------------- doses -- */

  /* Where this dose sits on its ramp, as ONE figure. The old screen printed
     the phase label beside the allergen, which on sesame read 'Sesame ·
     Sesame seeds' and said nothing twice; the step number says where they
     actually are. */
  function stepChip(dose) {
    if (dose.isMaintenance) return 'Maintenance';
    var proto = ART.store.protocol(dose.protocolId);
    var phase = proto && proto.phases && proto.phases[dose.phaseIdx];
    if (phase && phase.steps) {
      return 'Step ' + (dose.stepIdx + 1) + ' of ' + phase.steps.length;
    }
    return 'Phase ' + ((dose.phaseIdx | 0) + 1);
  }
  /* ========================================================= tab bar ===== */

  /* HOME · SCHEDULE · CALENDAR · MORE. Rendered, marked and deliberately
     inert. SPEC §7 is a ceiling and navigation is not on it; a tab drawn as a
     <button> that moved nothing would be a worse lie than a tab drawn as what
     it is. The bar is here because it is the thing that makes the architecture
     legible at a glance — a stranger sees in one look that the product has a
     schedule, a calendar and depth behind them. */
  /* `badge` marks ONE tab with the dot §17b draws, and on these screens it has
     exactly one job: when the practitioner publishes, the week lands on the
     family's phone and SCHEDULE is where it lands. That used to be a chip in a
     week block on HOME, and PART 4 gives HOME four blocks with no room for a
     fifth — so the phone says it the way a phone says it, with a dot on the tab
     and the word in the tab's own title, never the dot alone. */
  function pnav(current, badge) {
    return '<nav class="pnav" aria-label="App sections">' +
      TABS.map(function (t) {
        var on = t.key === current;
        var mark = badge && badge.tab === t.key && !on;
        return '<span class="pnav__tab" data-tab="' + t.key + '"' +
          (on ? ' aria-current="page"' : '') +
          (mark ? ' data-badge title="' + esc(badge.note) + '"' : '') + '>' +
          navIcon(t.key) +
          '<span class="pnav__label">' + esc(t.label) + '</span>' +
          '</span>';
      }).join('') +
      '</nav>';
  }

  /* The published-week signal, as the tab bar carries it. Drawn from the one
     fact CALENDAR's chip draws from, so the two can never disagree. */
  function planBadge(client) {
    var n = weeksAhead(client);
    if (!n) return null;
    var pub = client.planPublishedForWeek;
    return {
      tab: 'schedule',
      note: n === 1
        ? 'Next week published \u2014 ' + ui.dayLabel(pub)
        : 'Published to ' + ui.dayLabel(ui.addDays(pub, 6))
    };
  }

  function iconWrap(klass, d, extra) {
    return ui.svg('svg', {
      class: klass, viewBox: '0 0 22 22', width: 22, height: 22,
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false'
    }, ui.svg('path', { d: d }) + (extra || ''));
  }

  function navIcon(key) {
    if (key === 'home') {
      return iconWrap('pnav__icon', 'M3 10 11 3l8 7v8a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1z');
    }
    /* SCHEDULE is a plan you tick: a sheet with a check in it. */
    if (key === 'schedule') {
      return iconWrap('pnav__icon', 'M4 4h14v14H4z', ui.svg('path', { d: 'M7.5 11.2 10 13.6 15 8' }));
    }
    if (key === 'calendar') {
      return iconWrap('pnav__icon', 'M4 6h14v12H4z',
        ui.svg('path', { d: 'M8 3v4M14 3v4M4 10h14' }));
    }
    return iconWrap('pnav__icon', 'M6 7h0M16 7h0M6 15h0M16 15h0',
      ui.svg('circle', { cx: 6, cy: 7, r: 1.7, fill: 'currentColor', stroke: 'none' }) +
      ui.svg('circle', { cx: 16, cy: 7, r: 1.7, fill: 'currentColor', stroke: 'none' }) +
      ui.svg('circle', { cx: 6, cy: 15, r: 1.7, fill: 'currentColor', stroke: 'none' }) +
      ui.svg('circle', { cx: 16, cy: 15, r: 1.7, fill: 'currentColor', stroke: 'none' }));
  }
  /* ============================================================ SCREEN 1 ===
     HOME — rebuilt to the shipped app's own metrics (HOME_SPEC §4–§7).

     Geoff: "okay just make it look like mine w/ your color scheme. your
     buttons suck everything is just janky and hippy, this is an app people
     need to use."

     So this round copies STRUCTURE and SUBTRACTION and keeps the palette. In
     order, and there is nothing else on the screen:

       1  the header               avatar, greeting, name, one quiet line
       2  NEXT UP                  label · the RELATIVE time hard right · the
                                   headline · the track. NOTHING ELSE in the
                                   card. It reads SCHEDULE's core plan — the
                                   same object, not a second source of truth.
       3  SIX LOG ROWS             what has actually been logged, newest
                                   first, across days, each row 40 tall with
                                   its time starting at a constant x
       4  `View all`
       5  THREE PRIMARY TILES      Dose · Drops · Taps
       6  TWO SECONDARY TILES      Food · Reaction
       7  `+ Log something earlier`
       8  the tab bar

     WHAT §6 DELETED, AND THIS IS AS IMPORTANT AS THE REST. His home carries
     not one count, stat or section header. Gone from ours this round:
     `LOGGED 13/19 this week` (the band and its figure), the per-day counts on
     the dividers (`Today 2/6`), and `Core 1 of 4 / Other 1 of 2` under the
     track. Those are the "how am I doing" question and they belong on
     CALENDAR, which is where someone asks it. HOME answers "what now".

     So HOME now spends ZERO of its two allowed band labels. The screen reads
     top to bottom with no label on it at all, because every block is already
     self-evident: a name, a next thing, a history, five buttons.

     A stranger has to know in four seconds, without reading a sentence: whose
     day it is, what is next, how long until it, what is already done, and
     where to tap to log.
     ====================================================================== */

  function phoneToday(client, idPrefix, opts) {
    var pre = idPrefix || 'family';
    var o = opts || {};
    if (!client) return phone(screenEmpty('Home', 'No client selected.'));

    var next = ART.metrics.upNext(client);
    var feed = tallyFit(ART.metrics.loggedFeed(client, TALLY_FETCH));
    var dose = ART.metrics.nextUnlogged(client, 'dose');

    /* SPEC §7 rings a repeated control once. Two distinct affordances carry
       the day here: the tiles are §7.5's direct log and the newest tally row
       is §7.6's tap-to-Prep, so one ring each and no more. Inside a phone the
       ring IS the whole hint — app.css suppresses the label on a phone screen
       and the device carries one note below the hardware instead. */
    var ringRow = (!o.quiet && feed.length) ? feed[0].id : null;

    /* the row the Prep phone is currently drawing, marked, so the two phones
       standing side by side are visibly one interaction and not two screens */
    var drawn = prepTarget(client);

    var body = SCREEN +
      pheadBlock(client) +
      nextUpBlock(client, next) +
      tallyBlock(client, feed, pre, { ring: ringRow, drawn: drawn && drawn.id }) +
      tileBlock(client, pre, o) +
      pastLink() +
      reasonHost(client, dose, pre) +
      pnav('home', planBadge(client)) +
      '</div>';

    return phone(body, o.quiet ? null : 'Tap a tile to log');
  }

  /* --- 1. the identity header. Three lines, no card, no border ----------- */

  function pheadBlock(client) {
    /* Age, then where she actually is — two foods still climbing and one in
       maintenance IS the concurrency problem, stated as three figures. Capped
       at three parts, because a fourth would make it a sentence. */
    var by = { ramping: 0, maintenance: 0, held: 0 };
    (client.protocols || []).forEach(function (cp) {
      if (by[cp.state] !== undefined) by[cp.state]++;
      else by.ramping++;
    });
    var sub = [client.age + ' years'];
    ['ramping', 'maintenance', 'held'].forEach(function (k) {
      if (by[k] && sub.length < 3) sub.push(by[k] + ' ' + k);
    });
    if (sub.length === 1) sub.push(client.protocols.length + ' foods');

    return '<header class="phead">' +
      '<span class="phead__avatar" aria-hidden="true">' + esc(initial(client)) + '</span>' +
      '<div class="phead__who">' +
        '<p class="phead__greet">' + esc(greeting()) + '</p>' +
        '<h2 class="phead__name">' + esc(client.name) + '</h2>' +
        '<p class="phead__sub"><span class="num">' + esc(sub.join(' · ')) + '</span></p>' +
      '</div>' +
      '</header>';
  }

  /* --- 2. NEXT UP. The most important object in the app ------------------ */

  /* Four words and a figure, and it is a real control: tapping it drives the
     Prep phone, which is where the arithmetic lives. Everything on it comes
     off ART.metrics.upNext(), which picks the next unlogged CORE item by the
     clock — so this card and SCHEDULE's core band can never disagree.

     HOME_SPEC §7: "Label 12/800 uppercase left, relative time right (`in 29
     minutes`), headline ~24/800, then the progress track. NOTHING ELSE in the
     card." So two things changed here.

     1  THE TIME IS NOW RELATIVE, not the clock. `4:30pm` is a fact a parent
        has to subtract from to use; `in 22 minutes` is the answer. It is the
        same source — upNext() already returns minutesUntil — so this is a
        formatter and not a second definition of the day. The clock survives
        where a clock is the right unit: on SCHEDULE, which is a timetable.

     2  `Core 1 of 4 / Other 1 of 2` IS GONE. It was the only stat on the
        screen and §6 sends every stat to CALENDAR. The track still carries
        exactly the same fact as a shape, which is the "one value, one answer"
        rule: a bar and a fraction saying the same thing twice is the noise.

     The track takes --pct, ONE integer, and both the fill and the dot follow
     it. The dot therefore sits exactly where the done part of the required day
     stops, which is the shipped app's "filled dot at the current position". */
  function nextUpBlock(client, n) {
    var d = split(client);

    /* A paused or graduated child has no plan on this date, and the roster is
       clickable (§7.4), so every surface here has to survive an empty day. */
    if (!d.planned) {
      return '<section class="nextup" data-empty>' +
        '<div class="nextup__head">' +
          '<span class="nextup__label">Next up</span>' +
          '<span class="nextup__when">—</span>' +
        '</div>' +
        '<p class="nextup__title">Nothing prescribed today</p>' +
        '</section>';
    }

    if (!n) {
      return '<section class="nextup" data-done style="--pct:100">' +
        '<div class="nextup__head">' +
          '<span class="nextup__label">Next up</span>' +
          '<span class="nextup__when" data-ok>all done</span>' +
        '</div>' +
        '<p class="nextup__title">Today is complete</p>' +
        nextTrack() +
        '</section>';
    }

    var state = n.overdue ? 'overdue' : (n.minutesUntil <= 30 ? 'now' : 'later');

    return '<section class="nextup" data-state="' + state + '"' +
      ' style="--pct:' + (n.pct | 0) + '"' +
      ' data-fam-dose="' + esc(n.id) + '" data-fam-client="' + esc(client.id) + '">' +
      '<div class="nextup__head">' +
        '<span class="nextup__label">Next up</span>' +
        (n.overdue
          ? '<span class="nextup__when" data-late>' + esc(lateIn(n)) + '</span>'
          : '<span class="nextup__when">' + esc(dueIn(n)) + '</span>') +
      '</div>' +
      '<button type="button" class="nextup__hit" data-fam="pick"' +
        ' aria-label="' + esc(nextAria(n)) + '">' +
        '<span class="nextup__title">' + esc(n.label) + '</span>' +
        '<span class="nextup__dose">' + esc(n.detail) + '</span>' +
      '</button>' +
      nextTrack() +
      '</section>';
  }

  function nextTrack() {
    return '<div class="nextup__track" aria-hidden="true">' +
      '<span class="nextup__fill"></span><span class="nextup__dot"></span>' +
      '</div>';
  }

  /* --- the relative time, both directions --------------------------------
     `in 22 minutes` · `in 2 hr 22 min` · `22 min late` · `8 hr late`. The
     overdue side says how LATE rather than how long ago, because late is the
     fact a parent is acting on. Every form fits .nextup__when's mono tabular
     box, so it cannot reflow by a pixel as it counts down from `in 29` to
     `in 9`.

     THE TWO SIDES ROUND DIFFERENTLY, ON PURPOSE. Ahead of the dose, the
     minute is the useful unit — `in 2 hr 22 min` is the thing you plan an
     afternoon around. Behind it, the minute is noise: `8 hr 8 min late` reads
     as a stopwatch on a parent, and the only fact in it is the 8 hours. So
     the late side stops at the coarser unit it has crossed.

     An item with no prescribed clock at all (minutesUntil null) can still be
     next, and it gets the em dash rather than a sentence explaining itself. */
  function dueIn(n) {
    var mins = n.minutesUntil;
    if (mins === null || mins === undefined) return '—';
    if (mins <= 0) return 'now';
    /* the literal form HOME_SPEC §7 names, while it still fits the box */
    if (mins < 60) return 'in ' + mins + (mins === 1 ? ' minute' : ' minutes');
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'in ' + h + ' hr' + (m ? ' ' + m + ' min' : '');
  }

  function lateIn(n) {
    var mins = n.minutesUntil;
    if (mins === null || mins === undefined) return 'overdue';
    var late = Math.abs(mins);
    if (late < 60) return late + ' min late';
    return Math.floor(late / 60) + ' hr late';
  }

  /* The screen reader still gets the clock AND the countdown, because a
     relative time read out of context ("in 22 minutes" — from when?) is worse
     than the pair. The visual card spends its width on the one a parent needs;
     the label is free. */
  function nextAria(n) {
    return [n.label, n.full || n.detail,
      n.overdue ? 'overdue, was due ' + n.at : 'due ' + n.at + ', ' + dueIn(n),
      n.logged + ' of ' + n.planned + ' required items done']
      .join(', ') + ' — show how to prepare it';
  }

  /* --- 3. THE LOG ROWS -------------------------------------------------- */

  /* Geoff: "I want the home screen to show a running tally of the historically
     logged events which could either be your daily task/dose, the drops, taps,
     or a food group consumed."

     So it is a HISTORY, not today's list: ART.metrics.loggedFeed returns only
     what was actually logged, newest first, across days, and it prints
     entry.loggedAt rather than the prescribed clock — a maintenance serving has
     no prescribed clock at all.

     Every row is exactly
         time (fixed 58px, LEFT-aligned) · a rail mark · the item · detail · ›
     and nothing else. No description, no instruction, no status sentence, no
     button in a row. The detail is DATA. The right column holds the chevron on
     an ordinary row and the one glyph on an exception, so the right edge stays
     on one vertical rule either way and only the exceptions are marked.

     WHAT §6 TOOK OFF THIS BLOCK. Three counts, and the band label with them:
     the `LOGGED` header, its `13/19 this week` figure, and the `2/6` beside
     every day divider. The card now opens straight onto its first row. Six
     rows of what actually happened, under a next thing and over five buttons,
     is the whole screen — and a parent at a kitchen counter is not auditing
     themselves, they are looking for whether the 8am drops got ticked. */
  /* HOME_SPEC §4 says six rows, so six is the ceiling, and the measured box is
     the floor under it for the child whose six span five days. The feed is
     deterministic, so this is too: the same child always gets the same rows,
     and HOME never scrolls. */
  function tallyFit(feed) {
    var h = TALLY_PAD, last = null, out = [], i, step;
    for (i = 0; i < feed.length && out.length < TALLY_ROWS; i++) {
      step = ROW_H + (feed[i].dayLabel === last ? 0 : (out.length ? DIV_H : DIV_H1));
      if (h + step + LINK_H > TALLY_BOX) break;
      h += step;
      last = feed[i].dayLabel;
      out.push(feed[i]);
    }
    return out;
  }

  function tallyBlock(client, feed, pre, o) {
    /* No band label even here: an empty state that announced itself with a
       header would spend the one thing §6 deleted on the one case that has
       nothing to show. */
    if (!feed.length) return '<div class="empty">Nothing logged yet.</div>';

    var rows = '', lastDay = null;
    feed.forEach(function (r) {
      if (r.dayLabel !== lastDay) {
        lastDay = r.dayLabel;
        rows += tallyDay(r);
      }
      rows += tallyRow(client, r, pre, o);
    });

    return '<div class="tally">' + rows +
        /* navigation is not on SPEC §7, so the link is marked up as what it
           is — the affordance, not a button that moves nothing */
        '<span class="plink">View all<i class="pchev" aria-hidden="true"></i></span>' +
      '</div>';
  }

  /* `Today` · `Yesterday` · `Mon 10/19`, and NOTHING ELSE on the line.
     HOME_SPEC §6: "keep a day divider only where the day changes, 9/800
     uppercase muted, NO NUMBER." The `2/6` that used to ride hard right was
     the day's adherence, which is the "how am I doing" question — it is on
     CALENDAR, where someone asks it, and taking it off here is also what lets
     the divider be a 28px label instead of a row with two columns in it. */
  function tallyDay(r) {
    return '<p class="tallyday">' + esc(r.dayLabel) + '</p>';
  }

  function tallyRow(client, r, pre, o) {
    var odd = r.status !== 'done';
    return '<button type="button" class="logrow"' +
      ' id="' + esc(pre + '-row-' + slug(r.id)) + '"' +
      ' data-fam="pick" data-fam-dose="' + esc(r.id) + '"' +
      ' data-fam-client="' + esc(client.id) + '"' +
      (odd ? ' data-status="' + esc(r.status) + '"' : '') +
      (o.drawn === r.id ? ' data-due' : '') +
      (o.ring === r.id ? ' data-live="Tap a row"' : '') +
      ' aria-label="' + esc(feedAria(r)) + '">' +
      '<span class="logrow__time">' + esc(r.at) + '</span>' +
      '<i class="logrow__mark" data-kind="' + markKind(r.kind, r.band) + '"' +
        ' aria-hidden="true"></i>' +
      '<span class="logrow__name">' + esc(r.label) + '</span>' +
      '<span class="logrow__detail">' + esc(r.detail) + '</span>' +
      (odd
        ? '<span class="logrow__state" data-status="' + esc(r.status) + '"' +
          ' aria-hidden="true"></span>'
        : '<i class="logrow__go" aria-hidden="true"></i>') +
      '</button>';
  }

  /* --- 4 & 5. THE BUTTONS. Two tiers, and the size gap IS the hierarchy -- */

  /* HOME_SPEC §5: ours are the thing he called janky, and there were two
     separate reasons.

     1  FIVE EQUAL TILES FLATTENED THE HIERARCHY. `Reaction` looked exactly as
        important as `Dose`, which is wrong four days out of five. Now:
            PRIMARY    Dose · Drops · Taps     3 across, 92 tall, radius 28,
                                               icon 28, label 15/700, lifted
            SECONDARY  Food · Reaction         2 across, 66 tall, radius 20,
                                               icon 22, label 11.5/700, flat
        The split is also stated in the markup as data-tier rather than left to
        fall out of :nth-child, so a later reorder of ACTIONS cannot silently
        promote `Reaction` into the front row.

     2  THE 40px TINTED DISC CAME OFF. A glyph centred in a coloured circle is
        a list-item avatar; five of them in a grid is a contact list, and that
        is most of what read as "hippy". The tint moved to the icon's own ink,
        so the five actions are still five colours and the object on the tile
        is now the object itself.

     Each tile stands on a real unlogged entry from ART.metrics.nextUnlogged,
     so nothing here is decorative: Dose logs the scheduled core dose, Drops
     and Taps the two standing items — Taps reaching back to the spine tap
     nobody wrote down on Monday — Food a maintenance serving, and Reaction
     opens the reason chips on the dose it belongs to. */
  function tileBlock(client, pre, o) {
    /* The ring names one control, so it rings one control. Wrapping all five
       tiles drew a coral rectangle round the busiest block on the screen,
       which is the clutter the design pass exists to remove. */
    return '<div class="tiles" data-count="5" data-pin="low">' +
      ACTIONS.map(function (a, i) {
        return tile(client, a, ART.metrics.nextUnlogged(client, a.what), pre,
          i === 0 && !o.quiet, i < 3 ? 'primary' : 'secondary');
      }).join('') +
      '</div>';
  }

  function tile(client, a, entry, pre, ringed, tier) {
    var inner = '<span class="tile__icon">' + tileIcon(a.act) + '</span>' +
      '<span class="tile__label">' + esc(a.word) + '</span>';
    /* one ring, on the first tile, standing for all five */
    var live = ringed ? ' data-live="Log a dose"' : '';
    var kind = ' data-act="' + a.act + '" data-tier="' + tier + '"';

    /* nothing left to log of that kind — drawn, and honestly inert */
    if (!entry) {
      return '<span class="tile"' + kind + live + ' aria-disabled="true">' +
        inner + '</span>';
    }

    var anchor = ' data-fam-dose="' + esc(entry.id) + '"' +
      ' data-fam-client="' + esc(client.id) + '"';

    if (a.react) {
      return '<button type="button" class="tile"' + kind + live +
        ' data-fam="log" data-status="reaction"' + anchor +
        ' data-fam-reveal="' + esc(pre + '-reasons') + '"' +
        ' aria-expanded="false" aria-controls="' + esc(pre + '-reasons-row') + '"' +
        ' aria-label="' + esc('Log a reaction to ' + fullName(entry)) + '">' +
        inner + '</button>';
    }

    return '<button type="button" class="tile"' + kind + live +
      ' data-fam="log" data-status="done" data-direct' + anchor +
      ' aria-label="' + esc('Log ' + fullName(entry) + ' — ' +
        ART.prep.fullDetail(entry) + ' — as done') + '">' +
      inner + '</button>';
  }

  /* --- 6. `+ Log something earlier` ------------------------------------- */

  /* HOME_SPEC §5. The shipped app's `+ Add a past entry`, and it is the one
     control on this screen that exists because of the PAPER booklet: the whole
     failure mode this product replaces is "I gave the 8am drops and wrote it
     down later, or never". A log you can only write in the present tense
     records a different day than the one that happened.

     Marked as the affordance rather than a <button>, because back-dating a
     log is a real second screen and SPEC §7 is a ceiling — and the `+` is the
     affordance, which is why §21i draws no chevron on it. */
  function pastLink() {
    return '<span class="plink plink--past">+ Log something earlier</span>';
  }

  /* The reason chips, inline — no modal, no second screen, no free text. They
     live in their own HIDDEN host at the foot of the screen rather than on a
     row, because the tally is a history and the dose a reaction belongs to has
     by definition not been logged yet, so it has no row to open on. The host
     carries `hidden` itself, so while it is closed it contributes no height
     and no gap and the screen is laid out exactly as if it were not there. */
  function reasonHost(client, entry, pre) {
    if (!entry) return '';
    return '<div id="' + esc(pre + '-reasons') + '"' +
      ' data-fam-dose="' + esc(entry.id) + '"' +
      ' data-fam-client="' + esc(client.id) + '" hidden>' +
      '<div class="chiprow" id="' + esc(pre + '-reasons-row') + '"' +
        ' data-fam-reasons="' + esc(entry.id) + '" hidden>' +
        '<span class="meta">Reason</span>' +
        REASONS.map(function (r) {
          return '<button type="button" class="chip" data-fam="reason"' +
            ' data-reason="' + r.key + '">' + esc(r.label) + '</button>';
        }).join('') +
      '</div></div>';
  }

  /* --- the five marks, FILLED --------------------------------------------
     HOME_SPEC §5: "the reference app's icons are filled, coloured, literal objects — a
     bottle, a moon, a changing table, an apple, a pill. Ours are 1.6px
     monochrome outlines, which is most of 'hippy'."

     He is right, and the reason is scale. A 1.6px outline is a drawing of a
     thing; at 28px in a 92px tile it is four hairlines with air between them,
     so the eye reads a diagram and has to decode it. A filled silhouette is
     the thing: it has one edge, it survives being glanced at from arm's
     length across a kitchen, and it still carries the tint.

     So all five are now solid silhouettes in currentColor with no stroke at
     all, and each one is the LITERAL object in this protocol rather than a
     symbol for it. §21h supplies the per-action ink and the 28/22 size; the
     stroke-width it sets as an interim is inert against a fill.

       dose      a measuring spoon  — the object at the drawer, and the same
                 decomposition SPOONS performs further down this file
       drops     a dropper          — bulb, tube, and the drop leaving it
       taps      a spine            — five vertebrae, base to neck
       food      an apple           — a maintenance serving, his own mark
       reaction  a filled alert     — the bang KNOCKED OUT of the triangle, so
                 it is one object and not a glyph stacked on a shape
     ---------------------------------------------------------------------- */

  /* Same 22x22 box as iconWrap, filled instead of stroked. Kept separate
     rather than given a flag, because every caller of iconWrap draws a
     line-art tab or menu mark and none of them should change. */
  function iconFill(klass, inner, rule) {
    return ui.svg('svg', {
      class: klass, viewBox: '0 0 22 22', width: 22, height: 22,
      fill: 'currentColor', stroke: 'none',
      'fill-rule': rule || 'nonzero',
      'aria-hidden': 'true', focusable: 'false'
    }, inner);
  }

  /* EACH ONE WAS DRAWN, PUT ON THE BOARD AT 28px AND LOOKED AT, and three of
     the first five were redrawn because of what they turned out to read as:

       a spoon drawn UPRIGHT — an oval bowl over a straight handle — reads as
       a map pin, because a pin is exactly that silhouette. The bowl had to go
       DIAGONAL, which is the orientation a spoon is actually held in and the
       one thing a pin never is.

       a dropper drawn as bulb + glass + drop reads as an EXCLAMATION MARK at
       28px: three stacked shapes on one vertical axis with the small one at
       the bottom. Worse, it sat two tiles from the reaction triangle, which
       has a real bang in it. It is now one wide teardrop, which cannot be
       mistaken for a bar and a dot.

       an apple drawn as a circle with a stem reads as a CHERRY. It needed the
       notch at the top and the two lobes at the bottom — the parts that make
       an apple an apple rather than a round fruit.
     ---------------------------------------------------------------------- */
  function tileIcon(key) {
    if (key === 'dose') {
      /* a measuring spoon, held: the bowl on the diagonal, the handle running
         out of it to the lower right. The bowl is 8.4 across against a 3.0
         handle, so the head reads as a bowl and not as a pin's head. */
      return iconFill('picon',
        ui.svg('ellipse', {
          cx: 7.8, cy: 7.8, rx: 5.6, ry: 4.2, transform: 'rotate(45 7.8 7.8)'
        }) +
        ui.svg('path', {
          d: 'M10.06 7.94 19.06 16.94a1.5 1.5 0 0 1-2.12 2.12L7.94 10.06Z'
        }));
    }
    if (key === 'drops') {
      /* one drop, 11.8 wide — the measured liquid under the tongue */
      return iconFill('picon',
        ui.svg('path', {
          d: 'M11 2.4c3.6 4.6 5.9 7.6 5.9 10.6a5.9 5.9 0 0 1-11.8 0' +
             'c0-3 2.3-6 5.9-10.6z'
        }));
    }
    if (key === 'taps') {
      /* a spine, base to neck — five vertebrae, each a capsule, tapering out
         to the middle. The taper is what stops five stacked bars reading as a
         menu glyph. */
      return iconFill('picon',
        ui.svg('rect', { x: 7.7, y: 1.5, width: 6.6, height: 3, rx: 1.5 }) +
        ui.svg('rect', { x: 6.8, y: 5.5, width: 8.4, height: 3, rx: 1.5 }) +
        ui.svg('rect', { x: 6.1, y: 9.5, width: 9.8, height: 3, rx: 1.5 }) +
        ui.svg('rect', { x: 6.8, y: 13.5, width: 8.4, height: 3, rx: 1.5 }) +
        ui.svg('rect', { x: 7.7, y: 17.5, width: 6.6, height: 3, rx: 1.5 }));
    }
    if (key === 'food') {
      /* an apple: the notch, the two lobes, the stem and the leaf */
      return iconFill('picon',
        ui.svg('path', {
          d: 'M11 6.4C9.6 4.8 7.2 4.3 5.4 5.4 3.6 6.5 2.9 9 3.3 11.4' +
             'c.6 4 3.2 8.2 4.9 8.2.8 0 1.4-.5 2.8-.5s2 .5 2.8.5' +
             'c1.7 0 4.3-4.2 4.9-8.2.4-2.4-.3-4.9-2.1-6-1.8-1.1-4.2-.6-5.6 1z'
        }) +
        ui.svg('rect', { x: 10.35, y: 2.2, width: 1.3, height: 4.4, rx: 0.65 }) +
        ui.svg('path', {
          d: 'M11.8 4.7c1-2 3.3-2.4 4.3-2.2.2 1-.4 3.2-2.5 3.7-.9.2-1.6-.5-1.8-1.5z'
        }));
    }
    /* reaction — one filled object with the bang cut out of it, rather than a
       glyph stacked on a shape. evenodd does the knockout. */
    return iconFill('picon',
      ui.svg('path', {
        d: 'M9.26 3.08a2 2 0 0 1 3.48 0l7.02 12.9A2 2 0 0 1 18.02 19H3.98' +
           'a2 2 0 0 1-1.74-3.02z' +
           'M10.1 7.9h1.8l-.35 5.2h-1.1z' +
           'M11 14.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z'
      }), 'evenodd');
  }
  /* ============================================================ SCREEN 2 ===
     SCHEDULE — new, and Geoff calls it the core of the product.

     > "The schedule is the weekly schedule for the specific allergy food being
     >  treated and the associated plan. That's like....start morning off w/
     >  alka seltzer tab @ xyz amount, 5 sesame seeds + anything else. That is
     >  the core or critical. and make it known."

     > "a roving schedule, like stuff that is (OTHER) → other food groups they
     >  need to include but not a hard requirement on it, can be adjusted in
     >  real time because it is always a fluid scenario as to what people do
     >  during the day but they know they need to include XYZ."

     TWO BANDS, AND THE HIERARCHY BETWEEN THEM IS THE WHOLE IDEA. The contrast
     is spent on five axes at once so it reads from across a room, and every
     one of them is app.css's (§19) rather than written here:

                        CORE                        OTHER
       ground           white, elevated             cream, flat
       rail             4px coral, full height      none
       badge            REQUIRED                    ANY TIME
       title            17px semibold               15px medium
       rows             a fixed 58px time column    NO time column at all

     THE WEEK IS SELECTABLE Mon–Sun and that selector is the only navigation
     on the screen; everything else reads ART.store.scheduleDate(). Every item
     in both bands is tickable, and ticking one is the same single mutation
     HOME's tiles make — ART.store.logEntry on the row it is standing on.
     ====================================================================== */

  function phoneSchedule(client, idPrefix) {
    var pre = idPrefix || 'fam-sched';
    if (!client) return phone(screenEmpty('Schedule', 'No client selected.'));

    var iso = ART.store.scheduleDate();
    var d = split(client, iso);
    var next = ART.metrics.upNext(client);
    var nowId = (iso === st().today && next) ? next.id : null;

    /* the ring goes on the first core item that can still be ticked */
    var ringId = null;
    if (!d.future) {
      for (var i = 0; i < d.core.length && !ringId; i++) {
        if (d.core[i].status === 'planned') ringId = d.core[i].id;
      }
    }

    var body = SCREEN +
      schedHead(client, d, iso) +
      dayPick(client, iso) +
      coreBand(client, d, iso, { now: nowId, ring: ringId }) +
      otherBand(client, d, iso) +
      pnav('schedule', planBadge(client)) +
      '</div>';

    return phone(body, 'Tick it off');
  }

  /* The day's figure as a badge, never a sentence. A future day has nothing
     logged and nothing missed, so it states what is prescribed instead of
     `0 of 7 done`, which would read as a family failing a day they have not
     reached. */
  function schedHead(client, d, iso) {
    var badge = !d.planned
      ? '<span class="phead__badge chip chip--neutral">Nothing prescribed</span>'
      : (d.future
        ? '<span class="phead__badge chip chip--neutral num">' + d.planned + ' planned</span>'
        : '<span class="phead__badge chip chip--coral num">' +
          d.logged + ' of ' + d.planned + ' done</span>');

    return '<header class="phead phead--plain">' +
      '<div class="phead__who">' +
        '<h2 class="phead__name">Schedule</h2>' +
        '<p class="phead__sub"><span class="num">' + esc(ui.dayLabel(iso)) +
          '</span></p>' +
      '</div>' +
      badge +
      '</header>';
  }

  /* Mon–Sun. Seven equal columns, a day letter over a date figure, and the
     selection marked three ways by app.css — navy ground, cream ink, heavier
     figure — never colour alone. Today keeps its own coral dot whether or not
     it is the day being viewed, because "today" and "selected" are two facts.
     The per-day figures come off weekMeter, so the strip needs no second pass
     over the dataset. */
  function dayPick(client, iso) {
    var w = ART.metrics.weekMeter(client);
    var today = st().today;

    return '<div class="daypick" role="group" aria-label="Pick a day"' +
      ' data-live="Pick a day">' +
      w.days.map(function (day) {
        var on = day.dateISO === iso;
        var planned = day.core.planned + day.other.planned;
        return '<button type="button" class="daypick__day"' +
          ' data-fam="day" data-day="' + esc(day.dateISO) + '"' +
          ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
          (day.dateISO === today ? ' data-today' : '') +
          ' aria-label="' + esc(ui.dayLabel(day.dateISO) + ', ' +
            (day.future ? planned + ' prescribed' : day.logged + ' of ' + planned + ' logged')) +
          '">' +
          '<span class="daypick__dow">' + esc(ui.dayShort(day.dateISO)) + '</span>' +
          '<span class="daypick__n">' + (+String(day.dateISO).slice(8, 10)) + '</span>' +
          '</button>';
      }).join('') +
      '</div>';
  }

  /* --- BAND 1 — CORE. Required, timed, strict. "make it known" ---------- */

  /* The protocol for the food being treated, in clock order: the morning
     tablet, the drops behind it, the dose itself with its wait protocol, and
     the spine tap on its days. THIS IS WHAT HOME'S NEXT UP READS FROM — the
     same daySplit, the same entries, the same ids.

     data-rows="tall" goes on the BAND and only when a row in it actually
     carries a note, so every row in the band steps to 60px together and one
     long wait protocol can never make its own row taller than its neighbour. */
  function coreBand(client, d, iso, o) {
    var tall = false;
    d.core.forEach(function (e) { if (waitNote(e)) tall = true; });

    return '<section class="band band--core"' + (tall ? ' data-rows="tall"' : '') + '>' +
      '<div class="band__head">' +
        '<h3 class="band__title">Core protocol</h3>' +
        '<span class="band__badge">Required</span>' +
        '<p class="band__note">These times are fixed.</p>' +
      '</div>' +
      (d.core.length
        ? '<div class="band__rows">' +
            d.core.map(function (e) { return coreRow(client, e, iso, o); }).join('') +
          '</div>'
        : '<div class="empty">Nothing prescribed this day.</div>') +
      '</section>';
  }

  function coreRow(client, e, iso, o) {
    var when = rowWhen(e, iso, o.now);
    var logged = e.status !== 'planned';
    var note = waitNote(e);

    return '<div class="checkrow"' + (when ? ' data-when="' + when + '"' : '') +
      (when === 'future' ? ' data-future' : '') +
      (logged ? ' data-status="' + esc(e.status) + '"' : '') +
      ' data-fam-dose="' + esc(e.id) + '" data-fam-client="' + esc(client.id) + '">' +

      '<span class="checkrow__time">' + esc(ui.clockTiny(e.timing)) +
        (when === 'overdue' ? '<small class="checkrow__late">late</small>' : '') +
      '</span>' +

      checkCircle(e, iso, logged, when, o) +

      '<div class="checkrow__main">' +
        '<span class="checkrow__item">' + esc(ART.entryLabel(e)) + '</span>' +
      '</div>' +
      '<span class="checkrow__dose">' + esc(rowDose(e)) + '</span>' +
      (note ? '<p class="checkrow__note">' + esc(note) + '</p>' : '') +
      '</div>';
  }

  /* --- BAND 2 — OTHER. It must happen today, but the clock is yours ----- */

  /* The maintenance foods. They are prescribed for the day and not for an
     hour, so the row has NO time column at all — that single structural
     difference is what tells the two bands apart at a glance even with the
     type unread. Mara's egg maintenance is genuinely two servings, so it is
     two tickable rows and not one row carrying a 25-character phrase.

     An empty OTHER band is not drawn. A heading over nothing would cost the
     screen a band label to say that a child has no maintenance food yet. */
  function otherBand(client, d, iso) {
    if (!d.other.length) return '';

    return '<section class="band band--other">' +
      '<div class="band__head">' +
        '<h3 class="band__title">Other foods</h3>' +
        '<span class="band__badge">Any time</span>' +
        '<p class="band__note">Any time today. Your call.</p>' +
      '</div>' +
      '<div class="band__rows">' +
        d.other.map(function (e) { return otherRow(client, e, iso); }).join('') +
      '</div>' +
      '</section>';
  }

  function otherRow(client, e, iso) {
    var when = iso > st().today ? 'future' : '';
    var logged = e.status !== 'planned';
    /* `1 serving other egg foods` is one fact in three columns: the food, the
       form it takes, and the amount. Where a protocol has only one serving
       there is no form to name and the whole prescription is the amount. */
    var part = String(e.partLabel || '');

    return '<div class="checkrow"' + (when ? ' data-when="' + when + '"' : '') +
      (when ? ' data-future' : '') +
      (logged ? ' data-status="' + esc(e.status) + '"' : '') +
      ' data-fam-dose="' + esc(e.id) + '" data-fam-client="' + esc(client.id) + '">' +

      checkCircle(e, iso, logged, when, {}) +

      '<div class="checkrow__main">' +
        '<span class="checkrow__item">' + esc(ART.entryLabel(e)) + '</span>' +
        (part ? '<span class="checkrow__sub">' + esc(part) + '</span>' : '') +
      '</div>' +
      '<span class="checkrow__dose">' +
        esc(part ? String(e.display) : ART.prep.fullDetail(e)) + '</span>' +
      '</div>';
  }

  /* The circle IS the interaction, in both directions: an empty one logs the
     item done, a ticked one takes it back. One control, no second screen, no
     confirmation, and a real aria-pressed state. A day that has not happened
     yet is not a checkbox, so a future circle is drawn and inert. */
  function checkCircle(e, iso, logged, when, o) {
    var name = ART.entryLabel(e);

    if (when === 'future') {
      return '<span class="checkrow__circle" data-future aria-hidden="true"></span>';
    }
    if (logged) {
      return '<button type="button" class="checkrow__circle" data-fam="undo"' +
        ' data-status="' + esc(e.status) + '" aria-pressed="true" data-hint="quiet"' +
        ' aria-label="' + esc('Undo — ' + name + ' logged as ' +
          ui.statusLabel(e.status).toLowerCase()) + '">' +
        '</button>';
    }
    return '<button type="button" class="checkrow__circle" data-fam="log"' +
      ' data-status="done" data-direct aria-pressed="false"' +
      (o && o.ring === e.id ? ' data-live="Tick it off"' : ' data-hint="quiet"') +
      ' aria-label="' + esc('Log ' + name + ' — ' +
        ART.prep.fullDetail(e) + ' — as done') + '">' +
      '</button>';
  }
  /* ============================================================ SCREEN 3 ===
     CALENDAR. The week, plan against actual. A row per protocol plus a row for
     the drops and a row for the tap — which IS the concurrency argument — a
     stat strip beneath, and a legend. No sentence anywhere on this screen.
     ====================================================================== */

  /* How many weeks ahead of this one the published plan sits. This and the
     badge under it belonged to the old HOME, which carried a published-week
     chip as a sixth block; PART 4 allows four, so they live here now — on the
     screen whose whole subject is the week. */
  function weeksAhead(client) {
    var published = client && client.planPublishedForWeek;
    if (!published) return 0;
    var gap = ui.diffDays(st().weekStart, published);
    return gap >= 7 ? Math.round(gap / 7) : 0;
  }

  /* The handoff, as one chip. It is always drawn, because the honest BEFORE
     state is what makes the publish visible: a neutral `not yet` becomes a
     dated tick the instant the practitioner publishes. */
  function aheadBadge(client) {
    var n = weeksAhead(client);
    var pub = client.planPublishedForWeek;
    if (!n) {
      return '<span class="chip chip--neutral">Next week · not yet</span>';
    }
    return '<span class="chip chip--ok">✓ ' +
      (n === 1
        ? 'Next week · ' + esc(ui.dayLabel(pub))
        : 'Published to ' + esc(ui.dayLabel(ui.addDays(pub, 6)))) +
      '</span>';
  }

  function phoneCalendar(client) {
    if (!client) return phone(screenEmpty('Calendar', 'No client selected.'));
    var s = st();
    var w = ART.metrics.weekMeter(client);
    var ahead = weeksAhead(client);
    var nextStart = ahead > 0 ? client.planPublishedForWeek : ui.addDays(s.weekStart, 7);

    var body = SCREEN +

      '<header class="phead phead--plain">' +
        '<div class="phead__who">' +
          '<h2 class="phead__name h2">Calendar</h2>' +
          '<p class="phead__sub meta num">' + esc(ui.dayLabel(s.today)) + '</p>' +
        '</div>' +
        aheadBadge(client) +
      '</header>' +

      weekPanel(client, s.weekStart, 'This week', { items: true, foods: true }) +

      /* P2: a stat strip of three tiles. One scope, named, and the three
         figures are three different facts — the week's logged count, the one
         definition of adherence over that same week, and how many days are
         complete end to end. HOME's three tiles sum to the first of them. */
      '<div class="statstrip">' +
        stat('Logged', w.logged + '/' + w.planned) +
        stat('Adherence', w.pct + '%') +
        stat('Days', w.daysComplete + '/' + w.daysElapsed) +
      '</div>' +

      weekPanel(client, nextStart,
        ahead > 1 ? 'In ' + ahead + ' weeks' : 'Next week',
        { items: true, foods: ahead > 0, badge: ahead > 0 }) +

      /* THE LEGEND SITS ABOVE `Last week`, NOT UNDER IT, AND THE FOLD IS THE
         REASON — specifically the fold AFTER the handoff fires.

         At the 764 port this screen measures 764 exactly for c-mara, which is
         the default client and the only one of the 64 with five strip rows
         (drops + three protocols + the tap — the concurrency argument itself,
         so not a row that can go). Then the practitioner publishes, `Next
         week` gains its three food rows, and the screen becomes 848. That is
         not an edge case: it is the state the hero stop leaves the board in.

         The 84px that then fall past the fold used to be THE LEGEND, which
         left the glyphs on every visible strip unexplained at exactly the
         moment the board is making its point. With the order swapped it is
         `Last week` instead — a completed week the stat strip above already
         summarises — and the screen scrolls to it like any phone list.
         Measured post-publish: the legend's bottom edge sits at 581, well
         above the 764 fold.

         Nothing was cut to do this, and the remaining content question —
         whether a phone CALENDAR wants three weeks or two — is reported
         rather than decided here: dropping this one `weekPanel` call takes the
         published screen to 667 and fits all 64 children with ~97 to spare.
         The legend's own rule still holds, because both weeks it explains are
         on this screen. */
      legendFor(client, [s.weekStart, ui.addDays(s.weekStart, -7)]) +

      weekPanel(client, ui.addDays(s.weekStart, -7), 'Last week', { items: true, foods: true }) +

      pnav('calendar') +
      '</div>';

    return phone(body);
  }

  function stat(label, value) {
    return '<div class="stat">' +
      '<span class="stat__label eyebrow">' + esc(label) + '</span>' +
      '<span class="stat__value dose">' + esc(value) + '</span>' +
      '</div>';
  }

  /* One week. A head, the strip, and nothing else — the old block carried two
     explanatory sentences under every strip and they are deleted: the legend
     says what the glyphs mean and the rows say the rest.

     Before the practitioner publishes, the food rows genuinely do not exist
     yet while the drops and the tap already do, because those are prescribed
     independently of the weekly plan. That is the honest BEFORE state, and it
     is what makes the publish visible: three food rows appear in a strip that
     already had two. */
  function weekPanel(client, startISO, label, which) {
    var dates = ui.weekDates(startISO);
    /* The head is .psec — the same 11px band label HOME and SCHEDULE use —
       and the strip is its sibling, so the 12px between them comes from
       .pscreen and not from a wrapper with its own gap. That inline flex
       column is how this file used to hold a label and a card together, and
       it is most of what six phones with five different rhythms were made of. */
    return '<p class="psec"><span>' + esc(label) + '</span>' +
        (which.badge === undefined
          ? '<span class="psec__n">' + esc(ui.md(dates[0])) + '</span>'
          : (which.badge
            ? '<span class="chip chip--ok">✓ Published</span>'
            : '<span class="chip chip--neutral">Not published</span>')) +
      '</p>' +
      strip(client, dates, which);
  }

  /* ============================================================ SCREEN 4 ===
     PREP. Almost wordless, and the detail that wins the room. The viz IS the
     screen: at least half the screen height of drawing, the dose above it as a
     big mono figure, and below it ONE instruction of eight words, a gram chip,
     and the wait protocol as CHIPS. Nothing else.
     ====================================================================== */

  function phonePrep(client) {
    var entry = prepTarget(client);
    if (!entry) {
      return phone(screenEmpty('Prep', 'Tap a row on Home.'));
    }

    var p = ART.prep.describe(entry);
    var item = isItem(entry);
    var s = st();
    var lead = item ? String(entry.display)
      : (s.units === 'grams' ? ART.prep.grams(entry) : ART.prep.household(entry));
    var cross = item ? (entry.cadence || 'Daily')
      : (s.units === 'grams' ? ART.prep.household(entry) : ART.prep.grams(entry));

    /* A 42-character booklet phrase is not a figure. Mara's egg maintenance
       line is exactly that, so the big slot takes the count and the practice's
       own wording follows it as one quiet mono line, which is allowed to wrap
       where a chip is not. */
    var big = String(lead).length > 16 ? rowDose(entry) : String(lead);
    var longForm = big !== String(lead) ? String(lead) : '';

    var body = SCREEN +

      '<div class="chiprow">' +
        '<span class="chip chip--coral num">' + esc(fullName(entry)) + ' · ' +
          esc(ui.clock(entry.timing)) + '</span>' +
        '<span class="chip chip--neutral num">' +
          esc(item ? (entry.cadence || 'Daily') : stepChip(entry)) + '</span>' +
      '</div>' +

      '<p class="prep__figure dose" data-size="lg">' + esc(big) + '</p>' +
      /* the practice's own wording, as the parts it actually is */
      (longForm
        ? '<div class="chiprow">' +
            longForm.split('+').map(function (part) {
              return '<span class="chip chip--neutral num">' + esc(part.trim()) + '</span>';
            }).join('') +
          '</div>'
        : '') +

      /* THE SCREEN */
      vizBig(p.viz, entry) +

      /* ONE instruction. eight words, hard. */
      '<p class="prep__say lede">' + esc(instructionFor(p)) + '</p>' +

      /* the gram figure is a FACT about the dose, so it stays out of the wait
         sequence — §17l draws a chevron after every chip but the last, and a
         chevron between `15 mg` and `wait 30 min` would read as a step. */
      (cross && cross !== '—'
        ? '<div class="chiprow">' +
            '<span class="chip chip--neutral num">' + esc(cross) + '</span>' +
          '</div>'
        : '') +

      '<div class="waitchips">' + waitChips(client, entry) + '</div>' +

      tomorrowLine(client, entry) +

      pnav('home') +
      '</div>';

    return phone(body);
  }

  /* The one instruction, and it has to survive the eight-word clamp as an
     INSTRUCTION. The spine tap's headline is "Spine tap — base of the back to
     the neck, 2 minutes", which clamps to "Spine tap." and tells a parent
     nothing, so when the headline collapses the first real action step takes
     its place. Nothing is written here that the dose engine does not already
     say; this only chooses which of its sentences fits. */
  function instructionFor(p) {
    var out = eightWords(p.headline);
    if (wordsOf(out).length >= 4) return out;
    var steps = p.steps || [];
    for (var i = 1; i >= 0; i--) {
      if (!steps[i]) continue;
      var alt = eightWords(steps[i]);
      if (wordsOf(alt).length >= 4) return alt;
    }
    return out;
  }

  /* The wait protocol as chips, never as a numbered three-step list. An item
     has no wait ladder at all — it has a cadence, and the week strip under it
     is the honest form of that. */
  function waitChips(client, entry) {
    if (isItem(entry)) {
      /* NOT the per-week count as well: 'Daily' and '7/week' are one fact
         twice, and the cadence chip above already carries it. */
      return '<span class="chip chip--peri">' +
        esc(eightWords(itemClause(entry), 5)) + '</span>';
    }
    var w = ART.prep.waitProtocol(entry.waitLevel);
    var chips = (w && w.chips && w.chips.length) ? w.chips : (WAIT_CHIPS[w.level] || WAIT_CHIPS[0]);
    /* a figure is mono and heavier, an instruction stays in the UI face —
       §17l's two kinds, one typeface per job. */
    return chips.map(function (c) {
      return '<span class="chip chip--hold" data-kind="' +
        (/\d/.test(c) ? 'time' : 'act') + '">' + esc(c) + '</span>';
    }).join('');
  }

  /* 'under the tongue' · 'along the spine' — the first clause of the
     prescribed instruction, which is the only part that fits a chip. */
  function itemClause(entry) {
    var t = String(entry.instructions || '').split(',')[0].replace(/\.$/, '').trim();
    if (!t) return entry.itemType === 'drops' ? 'under the tongue' : 'along the spine';
    return t.charAt(0).toLowerCase() + t.slice(1);
  }

  /* Tomorrow, as one quiet line of data. Not a paragraph about the ramp. */
  function tomorrowLine(client, entry) {
    var next = ui.addDays(st().today, 1);
    var e = isItem(entry)
      ? itemOn(client, next, entry.itemType)
      : doseOn(client, next, entry.protocolId);
    var value = e
      ? (isItem(e) ? String(e.display) : rowDose(e)) + ' · ' + ui.clock(e.timing)
      : 'comes with next week';
    return '<p class="prep__tomorrow meta num">Tomorrow · ' + esc(value) + '</p>';
  }

  /* ============================================================ SCREEN 5 ===
     MORE. Everything tied to more complex information, as a real populated
     menu. Showing the depth as live counts sells it better than six
     half-built screens would — and then Meals is built through, so the depth
     is demonstrated rather than claimed.
     ====================================================================== */

  function phoneMore(client) {
    if (!client) return phone(screenEmpty('More', 'No client selected.'));

    var foods = familyFoods(client);
    var maint = foods.filter(function (f) { return f.state === 'maintenance'; });
    var pids = {};
    foods.forEach(function (f) { pids[f.protocolId] = 1; });

    var mealCount = (maint[0] ? maint[0].ideas.length : 0) ||
      ART.metrics.mealIdeas({ client: client }).length;
    var mealWhere = maint[0]
      ? maint[0].allergen.toLowerCase() + ' maintenance'
      : 'her ' + foods.length + ' foods';

    var shared = ART.metrics.mealIdeas({
      source: 'family', status: 'approved', communal: true
    }).filter(function (i) { return pids[i.protocolId] && !isMine(i, client); });

    var last = lastFromPractitioner(client);
    var items = ART.protocolItems ? ART.protocolItems(client.id) : [];
    var p = practitioner(client);
    var ct = centre(client);

    var body = SCREEN +

      '<header class="phead phead--plain">' +
        '<span class="phead__avatar" aria-hidden="true">' + esc(initial(client)) + '</span>' +
        '<div class="phead__who">' +
          '<h2 class="phead__name h2">More</h2>' +
          '<p class="phead__sub meta">' + esc(client.name) + '</p>' +
        '</div>' +
      '</header>' +

      /* two band labels, which is the PART 1.8 ceiling, and the rows run
         inside one card each — the separator between them is inset to that
         card's own padding, which is the ONE hairline PART 1.1 keeps. */
      '<p class="psec"><span>Behind the day</span></p>' +
      '<div class="card--quiet">' +
        moreItem('meals', 'Meal ideas', mealCount + ' for ' + mealWhere) +
        moreItem('community', 'Community',
          shared.length + ' shared by other families') +
        moreItem('messages', 'Messages', last) +
        moreItem('reports', 'Reports', 'adherence, components, phases') +
      '</div>' +

      '<p class="psec"><span>The plan</span></p>' +
      '<div class="card--quiet">' +
        /* three foods and a remainder, because a four-food list is 27
           characters in a 152px row and the menu's job is to be read */
        moreItem('protocols', 'Protocols',
          foods.slice(0, 3).map(function (f) {
            return f.allergen.toLowerCase();
          }).join(', ') + (foods.length > 3 ? ' +' + (foods.length - 3) : '')) +
        /* The data line is a COUNT, not a list. Three standing items with
           three cadences is 50 characters and the row gives it 152px, so the
           menu's one job — being read — failed the moment PART 6 added the
           morning tablet as a third. What the row has to say is that there
           are things prescribed every day that are not a food dose. */
        moreItem('standing', 'Standing items',
          items.length + ' beside the food doses') +
        moreItem('care', 'Your practitioner',
          (p ? p.name : 'unassigned') + (ct ? ' · ' + ct.name : '')) +
      '</div>' +

      pnav('more') +
      '</div>';

    return phone(body);
  }

  /* A row, not a control. Navigation is not on SPEC §7, and the one surface
     behind this menu that IS built — Meals — stands on the board as its own
     frame rather than behind a tap nothing else honours. */
  function moreItem(key, name, data) {
    return '<div class="moreitem" data-item="' + key + '">' +
      moreIcon(key) +
      '<span class="moreitem__name">' + esc(name) + '</span>' +
      '<span class="moreitem__sub meta">' + esc(eightWords(data)) + '</span>' +
      '<span class="moreitem__go" aria-hidden="true">›</span>' +
      '</div>';
  }

  function moreIcon(key) {
    if (key === 'meals') {
      return iconWrap('moreitem__icon', 'M5 3v8a3 3 0 0 0 6 0V3',
        ui.svg('path', { d: 'M8 11v8M15.5 3v16M15.5 3c1.8 0 2.5 1.4 2.5 3.2S17.3 9.4 15.5 9.4' }));
    }
    if (key === 'community') {
      return iconWrap('moreitem__icon', 'M8 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        ui.svg('path', { d: 'M2.5 18.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 5.2a3 3 0 0 1 0 5.6M16.5 13.9c1.7.7 3 2.3 3 4.6' }));
    }
    if (key === 'messages') {
      return iconWrap('moreitem__icon', 'M3.5 5h15v9.5h-9L5.5 18v-3.5h-2z');
    }
    if (key === 'reports') {
      return iconWrap('moreitem__icon', 'M3.5 18.5h15',
        ui.svg('path', { d: 'M6.5 18.5V11M11 18.5V4.5M15.5 18.5V8' }));
    }
    if (key === 'protocols') {
      return iconWrap('moreitem__icon', 'M5.5 3h11v16h-11z',
        ui.svg('path', { d: 'M8.5 7.5h5M8.5 11h5M8.5 14.5h3' }));
    }
    if (key === 'standing') {
      return iconWrap('moreitem__icon',
        'M11 3.5c2.6 3.1 4.3 5.4 4.3 7.6a4.3 4.3 0 0 1-8.6 0c0-2.2 1.7-4.5 4.3-7.6z');
    }
    return iconWrap('moreitem__icon', 'M11 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z',
      ui.svg('path', { d: 'M4 19c0-3.4 3.1-5.8 7-5.8s7 2.4 7 5.8' }));
  }

  /* The last thing the practitioner actually said, and when. There is no read
     receipt in the dataset, so this screen does not claim one: inventing "1
     unread" would be inventing a record. */
  function lastFromPractitioner(client) {
    var msgs = (client && client.messages) || [];
    var last = null;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].from === 'practitioner') last = msgs[i];
    }
    if (!last) return msgs.length + ' in this thread';
    var iso = String(last.at).slice(0, 10);
    var hhmm = String(last.at).slice(11, 16);
    return practitionerName(client) + ' · ' + ui.dayShort(iso) + ' ' + ui.clock(hhmm);
  }

  function practitionerName(client) {
    var p = practitioner(client);
    return p ? p.name : 'your practitioner';
  }

  /* ============================================================ SCREEN 6 ===
     MEALS. The one deep surface built through, as P3 cards: a tiny uppercase
     category, a short bold title, a time chip hard right, one line of method
     of eight words, and a save. A filter row of food chips at the top. No
     paragraphs of recipe — this is an idea, not a cookbook.
     ====================================================================== */

  function phoneMeals(client) {
    if (!client) return phone(screenEmpty('Meals', 'No client selected.'));
    var s = st();
    var foods = familyFoods(client);
    if (!foods.length) {
      return phone(screenEmpty('Meals',
        'Ideas appear for every food she reaches maintenance on.'));
    }

    var filter = s.mealFilter && s.mealFilter !== 'all' ? s.mealFilter : 'all';
    var active = null;
    foods.forEach(function (f) { if (f.protocolId === filter) active = f; });
    if (filter !== 'all' && !active) filter = 'all';

    var total = foods.reduce(function (n, f) { return n + f.ideas.length; }, 0);
    var shown = active ? [active] : foods;
    var flat = [];
    shown.forEach(function (f) {
      f.ideas.forEach(function (idea) { flat.push({ food: f, idea: idea }); });
    });

    /* Unfiltered, the maintenance food leads — that is what the screen is for
       — but it does not take the whole fold: four of its ideas, then the next
       food, so the filter is visibly doing something before it is pressed and
       the category line on a card is never the only one on screen.

       CAP IS DERIVED FROM THE FOLD, NOT FROM THE CONTENT, and THE FOLD HAS
       MOVED AGAIN AND THIS NUMBER HAS NOT FOLLOWED IT. Five was derived from
       a 992px port. The port is 764 now, and five cards measure 1038 against
       it — MEALS overruns by 274 for 63 of the 64 children, which is the one
       screen in this section that does not fit. Measured at the new port:
       three cards is 744 and fits with 20 to spare, four is 911 and overruns
       by 147. So by this comment's own rule CAP is 3.

       IT IS NOW 3 — the call this comment asked for, taken in the UX audit of
       2026-10-28. Re-measured live: `.phone__screen` was overflow:auto at
       clientHeight 764 against scrollHeight 1005, so 241px of the Meals screen
       was behind an inner scrollbar INCLUDING the whole 58px .pnav tab bar —
       the thing that makes the mockup read as an app — and ph-meals was the
       only one of the seven phones that overflowed (the other six measure
       969-974 of 974). Meals is also product-walkthrough stop 4. The frame
       cannot grow: all seven section-2 frames are FAM_H and §3's rule at 3234
       binds the band. So the content comes down to the fold, exactly as this
       comment's own rule says. The argument the screen makes is carried by the
       header count and the `+N more` line, not by the card count, and `rest`
       recounts itself off pick.length so that line stays true untold. */
    var CAP = 3, PER = 4;
    var pick = [], seen = {};
    for (var fi = 0; fi < flat.length && pick.length < CAP; fi++) {
      var key = flat[fi].food.protocolId;
      seen[key] = (seen[key] || 0) + 1;
      if (!active && seen[key] > PER) continue;
      pick.push(flat[fi]);
    }
    var cards = pick.map(function (row, i) {
      return ideaCard(row.idea, client, row.food, { loud: i === 0 });
    }).join('');
    var rest = flat.length - pick.length;

    var body = SCREEN +

      '<header class="phead phead--plain">' +
        '<div class="phead__who">' +
          '<h2 class="phead__name h2">Meals</h2>' +
          '<p class="phead__sub meta num">' + flat.length + ' ideas · ' +
            (active ? esc(active.allergen.toLowerCase()) : foods.length + ' foods') + '</p>' +
        '</div>' +
      '</header>' +

      /* §7.7 — filter by food. Real counts, so the control is informative
         before it is pressed. */
      '<div class="mealfilter" role="group" aria-label="Filter meal ideas by food"' +
        ' data-live="Filter by food">' +
        filterChip('all', 'All', total, filter) +
        foods.map(function (f) {
          return filterChip(f.protocolId, f.allergen, f.ideas.length, filter);
        }).join('') +
      '</div>' +

      cards +

      (rest > 0
        ? '<p class="meta num">' + rest + ' more in the library</p>'
        : '') +

      pnav('more') +
      '</div>';

    return phone(body);
  }

  function foodState(food) {
    if (food.state === 'maintenance') return 'maintenance';
    if (food.state === 'held') return 'held · week ' + food.week;
    if (food.week && food.of) return 'week ' + food.week + ' of ' + food.of;
    return 'ramping';
  }

  function filterChip(key, label, n, active) {
    return '<button type="button" class="chip' +
      (key === active ? ' chip--coral' : ' chip--neutral') + '"' +
      ' data-fam="mealfilter" data-filter="' + esc(key) + '"' +
      ' aria-pressed="' + (key === active ? 'true' : 'false') + '">' +
      esc(label) + (n ? ' <span class="num">' + n + '</span>' : '') + '</button>';
  }

  /* P3, exactly: category line, bold title, the time hard right, ONE line of
     method, a chip for state where there is one, a save. The chip carries the
     state and the figures carry the proof; nothing else is allowed on it. */
  function ideaCard(idea, client, food, opts) {
    var o = opts || {};
    var saved = ART.metrics.isSaved(idea, client);
    var mine = isMine(idea, client);
    var family = idea.source === 'family';
    var state = IDEA_STATE[idea.status] || IDEA_STATE.approved;

    var by = family
      ? (mine ? 'Yours' : String(idea.submittedByName))
      : idea.savedCount + ' saved';

    return '<article class="idea" data-source="' + esc(idea.source) + '"' +
      (family ? ' data-status="' + esc(idea.status) + '"' : '') +
      (idea.isCommunal ? ' data-communal' : '') + '>' +

      '<p class="idea__cat eyebrow">' + esc(food.allergen) + ' · ' +
        esc(foodState(food)) + '</p>' +

      '<div class="idea__head">' +
        '<h3 class="idea__title">' + esc(idea.title) + '</h3>' +
        '<span class="idea__time dose" data-size="sm">' + idea.minutes +
          ' <small>min</small></span>' +
      '</div>' +

      '<p class="idea__line">' + esc(eightWords(idea.body)) + '</p>' +

      '<div class="idea__foot"' + (o.loud ? ' data-live="Save an idea"' : '') + '>' +
        '<span class="idea__by meta">' + esc(by) + '</span>' +
        (family
          ? '<span class="chip ' + state.chip + '">' + esc(state.word) + '</span>'
          : '') +
        '<button type="button" class="idea__save" data-fam="save"' +
          ' data-idea="' + esc(idea.id) + '"' +
          ' aria-pressed="' + (saved ? 'true' : 'false') + '"' +
          ' aria-label="' + esc((saved ? 'Remove ' : 'Save ') + idea.title) + '"></button>' +
      '</div>' +
      '</article>';
  }

  /* ============================================================== the viz ===
     Hand-written inline SVG, and on PREP it IS the screen: `.vizbig` holds at
     least half the screen height and every figure is drawn LARGE inside it.

     Two of the six are drawn at 1:1 against a real 10 mm grid, because "five
     sesame seeds" is a figure nobody can picture and a measured drawing of it
     is the single most persuasive detail in the product. Nothing here is
     scaled silently: anything not at actual size says so on the drawing.
     ====================================================================== */

  function vizBig(viz, dose) {
    if (!viz) return '';
    var fig = null;
    if (viz.kind === 'divide') fig = vizDivideBig(viz);
    else if (viz.kind === 'count') fig = vizCountBig(viz);
    else if (viz.kind === 'spoon') fig = vizSpoonBig(viz);
    else if (viz.kind === 'serving') fig = vizServingBig(viz, dose);
    else if (viz.kind === 'drop') fig = vizDropBig(viz);
    else if (viz.kind === 'tap') fig = vizTapBig(viz);
    else if (viz.kind === 'tab') fig = vizTabBig(viz);
    if (!fig) return '';
    return '<div class="vizbig" data-kind="' + esc(viz.kind) + '">' + fig + '</div>';
  }

  function stripArticle(label) {
    return String(label || 'piece').replace(/^one\s+/i, '');
  }

  /* divide — every part, with `take` filled. Drawn as STRIPS down the screen,
     because 7/16 of a slice is sixteen strips and that is the cut a parent
     physically has to make. Short denominators get tall strips, so a half and
     a sixteenth both fill the same block. */
  function vizDivideBig(viz) {
    var parts = Math.max(2, viz.parts | 0);
    var take = Math.max(1, Math.min(parts, viz.take | 0));
    /* 320, not 470, and a 16px floor rather than a 20px one: the stack has to
       stand in --vizbig-h (364) with its 32px of annotation under it. This
       figure is a SCHEMATIC — it claims nothing about size, and its caption
       says so ("drawn as N equal strips") — so shortening the block is a pure
       re-flow. The 16-strip case is what sets the floor: 16 x (16 + 4) − 4 is
       316, and 316 + 32 lands at 348. */
    var gap = parts > 8 ? 4 : 7;
    var h = Math.max(16, Math.min(150, Math.round(320 / parts) - gap));
    var total = parts * (h + gap) - gap;
    var out = '', i;

    for (i = 0; i < parts; i++) {
      out += ui.svg('rect', {
        class: i < take ? 'chart__bar' : 'chart__area',
        x: 0, y: r2(i * (h + gap)), width: VW, height: r2(h),
        rx: r2(Math.min(5, h / 3))
      });
    }

    /* the cut: where the dose stops and the rest of the object begins */
    var cy = take * (h + gap) - gap / 2;
    out += ui.svg('path', { class: 'chart__annotline', d: 'M0 ' + r2(cy) + ' H' + VW });
    out += ui.svg('text', { class: 'chart__annot', x: 0, y: r2(total + 23) },
      'give ' + take + ' of ' + parts);

    return svgBox(VW, total + 32, out,
      'One ' + stripArticle(viz.label) + ' drawn as ' + parts +
      ' equal strips, ' + take + ' of them filled');
  }

  /* count — the dose at ACTUAL SIZE, in the teaspoon the instruction names,
     on a 10 mm grid that makes the scale checkable. Five sesame seeds is
     15 mg; the picture is the argument. */
  function vizCountBig(viz) {
    if (viz.mm > 14) return vizCountScaled(viz);

    var n = Math.max(1, Math.round(viz.n));
    var d = Math.max(4, viz.mm * MM);
    var cell = 10 * MM;
    /* 7 x 7 cells of 10 mm, not 5 x 10. THE CELL IS THE CLAIM — the figure
       says "10 mm · actual size" and the grid is what makes it checkable — so
       the cell is untouched and only the grid's SHAPE changes: 70 x 70 mm
       instead of 50 x 100. That is what makes the drawing honest for the first
       time. At 5 x 10 the viewBox was 447 tall inside a 420px cap, so the whole
       figure rendered at 0.94 — a drawing that said "actual size" and was 6%
       small. 7 x 7 is 334 tall, which is inside --vizbig-h (364) with room, so
       nothing scales and 10 mm on the screen IS 10 mm. 7 columns is 264.6 of
       the 310 available, so it still fits across. */
    var cols = 7, rws = 7;
    var gw = cols * cell, gh = rws * cell;
    var gx = (VW - gw) / 2, gy = 10;
    var out = '', i;

    out += ui.svg('rect', {
      class: 'chart__area', x: r2(gx), y: gy, width: r2(gw), height: r2(gh), rx: 6
    });
    for (i = 1; i < cols; i++) {
      out += ui.svg('path', {
        class: 'chart__grid',
        d: 'M' + r2(gx + i * cell) + ' ' + gy + ' V' + r2(gy + gh)
      });
    }
    for (i = 1; i < rws; i++) {
      out += ui.svg('path', {
        class: 'chart__grid',
        d: 'M' + r2(gx) + ' ' + r2(gy + i * cell) + ' H' + r2(gx + gw)
      });
    }
    out += ui.svg('rect', {
      class: 'chart__axis', x: r2(gx), y: gy, width: r2(gw), height: r2(gh),
      rx: 6, fill: 'none'
    });

    /* a teaspoon is 32 mm across its bowl and about 60 mm of handle, so it
       sits on the same 1:1 scale as the seeds in it */
    var bw = 32 * MM, bh = 24 * MM;
    var bcx = gx + gw / 2, bcy = gy + gh * 0.4;
    out += ui.svg('rect', {
      class: 'chart__area', x: r2(bcx - 2.5 * MM), y: r2(bcy),
      width: r2(5 * MM), height: r2(gy + gh - bcy - 10), rx: 5
    });
    out += ui.svg('rect', {
      class: 'chart__axis', x: r2(bcx - 2.5 * MM), y: r2(bcy),
      width: r2(5 * MM), height: r2(gy + gh - bcy - 10), rx: 5, fill: 'none'
    });
    out += ui.svg('ellipse', {
      class: 'chart__band', cx: r2(bcx), cy: r2(bcy), rx: r2(bw / 2), ry: r2(bh / 2)
    });
    out += ui.svg('ellipse', {
      class: 'chart__axis', cx: r2(bcx), cy: r2(bcy),
      rx: r2(bw / 2), ry: r2(bh / 2), fill: 'none'
    });

    var gap = Math.max(2.5, d * 0.45);
    var perRow = Math.max(1, Math.floor((bw * 0.78 + gap) / (d + gap)));
    var nrows = Math.ceil(n / perRow);
    var bx = bcx - (Math.min(n, perRow) * (d + gap) - gap) / 2 + d / 2;
    var by = bcy - (nrows * (d + gap) - gap) / 2 + d / 2;
    for (i = 0; i < n; i++) {
      var cx = bx + (i % perRow) * (d + gap);
      var cy = by + Math.floor(i / perRow) * (d + gap);
      var a = ((i * 37) % 50) - 25;          /* deterministic, never random */
      out += ui.svg('ellipse', {
        class: 'chart__bar', cx: r2(cx), cy: r2(cy),
        rx: r2(d / 2), ry: r2(d / 2 * 0.72),
        transform: 'rotate(' + a + ' ' + r2(cx) + ' ' + r2(cy) + ')'
      });
    }

    /* one cell, measured — the key to the whole figure */
    var ly = gy + gh + 21;
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + r2(gx) + ' ' + r2(ly - 5) + ' v10 M' + r2(gx) + ' ' + r2(ly) +
         ' H' + r2(gx + cell) + ' M' + r2(gx + cell) + ' ' + r2(ly - 5) + ' v10'
    });
    out += ui.svg('text', {
      class: 'chart__annot', x: r2(gx + cell + 9), y: r2(ly + 4)
    }, '10 mm · actual size');
    out += ui.svg('text', {
      class: 'chart__value', x: r2(gx), y: r2(ly + 27)
    }, n + ' × ' + viz.mm + ' mm');

    return svgBox(VW, ly + 38, out,
      n + ' ' + viz.item + (n === 1 ? '' : 's') +
      ' on a teaspoon, drawn at actual size on a 10 mm grid');
  }

  /* count, for an object too big to draw 1:1 on a phone — a 32 mm cracker,
     a 95 mm slice. Drawn to a stated scale, with a measured reference, so the
     drawing never implies a size it is not. */
  function vizCountScaled(viz) {
    var n = Math.max(1, Math.round(viz.n));
    var full = Math.max(5, viz.mm * MM);
    var ratio = viz.mm <= 4 ? 0.55 : 0.72;
    var d = full, gap, perRow, rows, scale = 1;
    for (var guard = 0; guard < 7; guard++) {
      d = full * scale;
      gap = Math.max(4, d * 0.22);
      perRow = Math.max(1, Math.floor((VW + gap) / (d + gap)));
      rows = Math.ceil(n / perRow);
      if (rows * (d + gap) - gap <= 360) break;
      scale *= 0.72;
    }

    var top = 12, rowH = d + gap, out = '';
    for (var i = 0; i < n; i++) {
      var cx = (i % perRow) * rowH + d / 2;
      var cy = top + Math.floor(i / perRow) * rowH + d / 2;
      var a = ((i * 37) % 50) - 25;
      out += ui.svg('ellipse', {
        class: 'chart__bar', cx: r2(cx), cy: r2(cy),
        rx: r2(d / 2), ry: r2(d / 2 * ratio),
        transform: 'rotate(' + a + ' ' + r2(cx) + ' ' + r2(cy) + ')'
      });
    }

    var baseY = top + rows * rowH - gap + 4;
    out += ui.svg('path', { class: 'chart__axis', d: 'M0 ' + r2(baseY) + ' H' + VW });

    var dy = baseY + 22;
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M0 ' + r2(dy - 5) + ' v10 M0 ' + r2(dy) + ' H' + r2(d) +
         ' M' + r2(d) + ' ' + r2(dy - 5) + ' v10'
    });
    out += ui.svg('text', { class: 'chart__annot', x: r2(d + 9), y: r2(dy + 4) },
      viz.mm + ' mm' + (scale === 1 ? ' · actual size' : ' · to scale'));

    return svgBox(VW, dy + 18, out,
      n + ' ' + viz.item + (n === 1 ? '' : 's') +
      (scale === 1 ? ' drawn at actual size' : ' drawn to scale, one is ' + viz.mm + ' mm'));
  }

  /* spoon — the drawer, decomposed the way a parent actually does it. The
     ones you need are filled; the ones you do not are drawn anyway, because
     the mistake this prevents is reaching for the wrong one. */
  function vizSpoonBig(viz) {
    var k = 1.35;
    var rem = Math.max(0, +viz.tsp || 0);
    var counts = SPOONS.map(function (sp) {
      var c = Math.floor(rem / sp.v + 1e-9);
      rem -= c * sp.v;
      return c;
    });
    var order = [3, 2, 1, 0];
    var gap = 15, x = 0, top = 12;
    var maxR = SPOONS[0].r * k;
    var baseY = top + maxR * 2;
    var out = '';

    order.forEach(function (idx) {
      var sp = SPOONS[idx];
      var r = sp.r * k;
      var used = counts[idx] > 0;
      var cx = x + r, cy = baseY - r;
      out += ui.svg('circle', {
        class: used ? 'chart__bar' : 'chart__area', cx: r2(cx), cy: r2(cy), r: r2(r)
      });
      out += ui.svg('circle', {
        class: 'chart__axis', cx: r2(cx), cy: r2(cy), r: r2(r), fill: 'none'
      });
      out += ui.svg('text', {
        class: 'chart__tick', x: r2(cx), y: r2(baseY + 18), 'text-anchor': 'middle'
      }, sp.label);
      if (used) {
        out += ui.svg('text', {
          class: 'chart__value', x: r2(cx), y: r2(baseY + 36), 'text-anchor': 'middle'
        }, '×' + counts[idx]);
      }
      x += r * 2 + gap;
    });

    return svgBox(Math.max(VW, x - gap), baseY + 44, out,
      'Measuring spoons, the ones this dose needs filled in');
  }

  /* serving — a plate, and the fraction of it that is the dose */
  function vizServingBig(viz, dose) {
    var frac = Math.max(0.02, Math.min(1, +viz.fraction || 1));
    var whole = frac >= 0.999;
    var r = 96, cx = VW / 2, cy = r + 12;
    var out = '';

    out += ui.svg('circle', { class: 'chart__area', cx: r2(cx), cy: r2(cy), r: r });
    out += whole
      ? ui.svg('circle', { class: 'chart__bar', cx: r2(cx), cy: r2(cy), r: r - 16 })
      : ui.svg('path', { class: 'chart__bar', d: wedge(cx, cy, r - 16, frac) });
    out += ui.svg('circle', {
      class: 'chart__axis', cx: r2(cx), cy: r2(cy), r: r, fill: 'none'
    });
    out += ui.svg('circle', {
      class: 'chart__grid', cx: r2(cx), cy: r2(cy), r: r - 16, fill: 'none'
    });
    out += ui.svg('text', { class: 'chart__annot', x: 0, y: r2(cy + r + 26) },
      whole ? 'all of it' : ART.prep.fraction(frac) + ' of one serving');
    out += ui.svg('text', { class: 'chart__value', x: 0, y: r2(cy + r + 48) },
      String(ART.prep.grams(dose)));

    return svgBox(VW, cy + r + 58, out,
      (whole ? 'A full plate' : ART.prep.fraction(frac) + ' of a plate') + ' shaded');
  }

  /* drop — the dropper, the count, and the tongue they go under. Drawn at
     actual size: a drop is about 5 mm, which is why the count is the dose. */
  function vizDropBig(viz) {
    var n = Math.max(1, Math.round(+viz.n || 1));
    var r = 9, pitch = r * 2 + 18;
    var span = n * r * 2 + (n - 1) * 18;
    var x0 = Math.max(0, (VW - span) / 2) + r;
    var cx = VW / 2;
    var out = '';

    /* the dropper, held above and not touching */
    out += ui.svg('rect', {
      class: 'chart__area', x: r2(cx - 17), y: 10, width: 34, height: 92, rx: 12
    });
    out += ui.svg('rect', {
      class: 'chart__axis', x: r2(cx - 17), y: 10, width: 34, height: 92, rx: 12, fill: 'none'
    });
    out += ui.svg('path', {
      class: 'chart__band',
      d: 'M' + r2(cx - 17) + ' 102 L' + r2(cx - 5) + ' 134 h10 L' + r2(cx + 17) + ' 102 Z'
    });
    out += ui.svg('path', {
      class: 'chart__axis',
      d: 'M' + r2(cx - 17) + ' 102 L' + r2(cx - 5) + ' 134 M' + r2(cx + 5) + ' 134 L' +
         r2(cx + 17) + ' 102'
    });

    var tipY = 184;
    for (var i = 0; i < n; i++) {
      out += ui.svg('path', { class: 'chart__bar', d: teardrop(x0 + i * pitch, tipY, r) });
    }

    /* the tongue: a filled lozenge, so "under the tongue" has an under */
    var ty = tipY + 18;
    out += ui.svg('path', {
      class: 'chart__area',
      d: 'M' + r2(x0 - r - 20) + ' ' + r2(ty + 12) +
         ' Q' + r2(cx) + ' ' + r2(ty - 10) + ' ' + r2(x0 + (n - 1) * pitch + r + 20) + ' ' + r2(ty + 12) +
         ' Q' + r2(cx) + ' ' + r2(ty + 32) + ' ' + r2(x0 - r - 20) + ' ' + r2(ty + 12) + ' Z'
    });
    out += ui.svg('path', {
      class: 'chart__grid',
      d: 'M' + r2(x0 - r - 20) + ' ' + r2(ty + 12) +
         ' Q' + r2(cx) + ' ' + r2(ty - 10) + ' ' + r2(x0 + (n - 1) * pitch + r + 20) + ' ' + r2(ty + 12)
    });

    var by = ty + 46;
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + r2(x0 - r) + ' ' + r2(by) + ' v6 H' + r2(x0 + (n - 1) * pitch + r) + ' v-6'
    });
    out += ui.svg('text', { class: 'chart__annot', x: r2(x0 - r), y: r2(by + 23) },
      n + ' ' + plural(n, 'drop') + ' · 5 mm each');

    return svgBox(VW, by + 32, out,
      n + ' drops from a dropper held above the tongue, drawn at actual size');
  }

  /* tap — the spine, base of the back to the neck, and the minutes it takes.
     Seven rungs because the instruction is a path, not a point. */
  function vizTapBig(viz) {
    var segs = Math.max(4, Math.round(+viz.segments || 7));
    var minutes = +viz.minutes || 2;
    var topY = 24, botY = 356;
    var sx = 84, out = '', i;

    out += ui.svg('path', {
      class: 'chart__axis', d: 'M' + sx + ' ' + topY + ' V' + botY
    });
    for (i = 0; i < segs; i++) {
      var y = topY + (botY - topY) * (i / (segs - 1));
      out += ui.svg('rect', {
        class: 'chart__bar', x: sx - 20, y: r2(y - 3), width: 40, height: 6, rx: 3
      });
    }

    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + (sx + 38) + ' ' + (botY - 6) + ' V' + (topY + 12) +
         ' M' + (sx + 38) + ' ' + (topY + 12) + ' l-5 9 M' + (sx + 38) + ' ' + (topY + 12) + ' l5 9'
    });
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + (sx + 56) + ' ' + (topY + 12) + ' V' + (botY - 6) +
         ' M' + (sx + 56) + ' ' + (botY - 6) + ' l-5 -9 M' + (sx + 56) + ' ' + (botY - 6) + ' l5 -9'
    });

    out += ui.svg('text', {
      class: 'chart__tick', x: sx - 28, y: topY + 5, 'text-anchor': 'end'
    }, 'neck');
    out += ui.svg('text', {
      class: 'chart__tick', x: sx - 28, y: botY + 5, 'text-anchor': 'end'
    }, 'base');
    out += ui.svg('text', {
      class: 'chart__value', x: sx + 68, y: (topY + botY) / 2 + 6
    }, minutes + ' min');

    return svgBox(VW, botY + 26, out,
      'A spine with ' + segs + ' rungs and arrows running up to the neck and back down');
  }

  /* tab — the morning tablet, in the glass it dissolves in. The instruction is
     "one tablet dissolved in water, before the drops", so the drawing is the
     glass, the water line and the tablet fizzing at the bottom: the one thing
     about this item a parent can get wrong is giving it dry. Drawn at actual
     size — a standard tablet is 19 mm across and a small glass 62 mm. */
  function vizTabBig(viz) {
    var n = Math.max(1, Math.round(+viz.n || 1));
    /* A 62 x 70 mm tumbler, not 62 x 86. The 1:1 claim on this figure is the
       TABLET — "19 mm · actual size" — and 19 mm is untouched; the glass is
       just the container it dissolves in, and 70 mm is a real short tumbler
       (a 200 ml one) rather than a tall 86 mm glass. At 86 the viewBox was
       421 tall against a 420px cap, so even the tablet was being scaled; at
       70 the viewBox is 361, inside --vizbig-h (364), and the 19 mm tablet
       renders at exactly 19 mm. */
    var gw = 62 * MM, gh = 70 * MM;
    var gx = (VW - gw) / 2, gy = 16;
    var lip = 7, wall = 5;
    var waterY = gy + gh * 0.26;
    var out = '';

    /* the glass: a tumbler tapering very slightly to its base */
    var bx = gx + wall * 1.6, bw = gw - wall * 3.2;
    var body = 'M' + r2(gx) + ' ' + r2(gy + lip) +
      ' L' + r2(bx) + ' ' + r2(gy + gh) +
      ' H' + r2(bx + bw) +
      ' L' + r2(gx + gw) + ' ' + r2(gy + lip) + ' Z';

    out += ui.svg('path', { class: 'chart__area', d: body });

    /* the water, clipped to the same taper by sharing its two side edges */
    var t = (waterY - (gy + lip)) / gh;
    var wl = gx + (bx - gx) * t;
    var wr = gx + gw - (gx + gw - (bx + bw)) * t;
    out += ui.svg('path', {
      class: 'chart__band',
      d: 'M' + r2(wl) + ' ' + r2(waterY) +
         ' L' + r2(bx) + ' ' + r2(gy + gh) +
         ' H' + r2(bx + bw) +
         ' L' + r2(wr) + ' ' + r2(waterY) + ' Z'
    });
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + r2(wl) + ' ' + r2(waterY) + ' H' + r2(wr)
    });

    /* the tablet, and the bubbles coming off it */
    var d = 19 * MM;
    var cx = gx + gw / 2, cy = gy + gh - d * 0.72;
    for (var i = 0; i < n; i++) {
      out += ui.svg('ellipse', {
        class: 'chart__bar',
        cx: r2(cx + (i - (n - 1) / 2) * (d * 0.62)), cy: r2(cy),
        rx: r2(d / 2), ry: r2(d / 2 * 0.3)
      });
    }
    var fizz = [[-14, 46, 4], [6, 62, 3], [-4, 88, 2.5], [17, 96, 3.5], [-19, 118, 2]];
    for (i = 0; i < fizz.length; i++) {
      out += ui.svg('circle', {
        class: 'chart__grid', fill: 'none',
        cx: r2(cx + fizz[i][0]), cy: r2(cy - fizz[i][1]), r: fizz[i][2]
      });
    }

    /* the glass's own edge, over everything, so the taper reads as one object */
    out += ui.svg('path', { class: 'chart__axis', d: body, fill: 'none' });

    var ly = gy + gh + 22;
    out += ui.svg('path', {
      class: 'chart__annotline',
      d: 'M' + r2(cx - d / 2) + ' ' + r2(ly) + ' v6 H' + r2(cx + d / 2) + ' v-6'
    });
    out += ui.svg('text', { class: 'chart__annot', x: r2(gx), y: r2(ly + 25) },
      n + ' ' + plural(n, 'tablet') + ' · 19 mm · actual size');
    out += ui.svg('text', { class: 'chart__value', x: r2(gx), y: r2(ly + 47) },
      'all of the water');

    return svgBox(VW, ly + 58, out,
      n + ' ' + plural(n, 'tablet') +
      ' dissolving at the bottom of a glass of water, drawn at actual size');
  }

  function teardrop(cx, tipY, r) {
    var cy = tipY - r * 1.9;
    return 'M' + r2(cx) + ' ' + r2(tipY) +
      ' C' + r2(cx - r * 0.95) + ' ' + r2(tipY - r * 1.05) +
      ', ' + r2(cx - r) + ' ' + r2(cy + r * 0.6) +
      ', ' + r2(cx - r) + ' ' + r2(cy) +
      ' A' + r + ' ' + r + ' 0 1 1 ' + r2(cx + r) + ' ' + r2(cy) +
      ' C' + r2(cx + r) + ' ' + r2(cy + r * 0.6) +
      ', ' + r2(cx + r * 0.95) + ' ' + r2(tipY - r * 1.05) +
      ', ' + r2(cx) + ' ' + r2(tipY) + ' Z';
  }

  function wedge(cx, cy, r, frac) {
    var a0 = -Math.PI / 2;
    var a1 = a0 + frac * Math.PI * 2;
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return 'M' + r2(cx) + ' ' + r2(cy) + ' L' + r2(x0) + ' ' + r2(y0) +
      ' A' + r + ' ' + r + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + r2(x1) + ' ' + r2(y1) + ' Z';
  }

  function svgBox(w, h, inner, label) {
    return ui.svg('svg', {
      class: 'chart__svg',
      viewBox: '0 0 ' + r2(w) + ' ' + r2(h),
      width: r2(w), height: r2(h),
      role: 'img', 'aria-label': label, focusable: 'false'
    }, inner);
  }

  function r2(n) { return Math.round(n * 100) / 100; }
  /* One strip: the drops, then each food in the order the day gives it, then
     the tap. Five rows, which IS the concurrency argument — and no row is a
     summary of another, so nothing here says the same thing twice.
     --strip-label is 76px and carries no glyph: even at 334px of content the glyph
     costs 22px of the label column and truncates 'Spine tap'. */
  function strip(client, dates, which) {
    var s = st();
    var rows = '';

    if (which.items && itemRowExists(client, dates, 'drops')) {
      rows += stripRow('Drops', itemCells(client, 'drops', dates));
    }
    if (which.foods) {
      var protos = client.protocols.slice().sort(function (a, b) {
        return String(a.timing).localeCompare(String(b.timing));
      });
      protos.forEach(function (cp) {
        var proto = ART.store.protocol(cp.protocolId);
        rows += stripRow(proto ? proto.allergen : cp.protocolId, doseCells(client, cp.protocolId, dates));
      });
    }
    if (which.items && itemRowExists(client, dates, 'tapping')) {
      rows += stripRow('Spine tap', itemCells(client, 'tapping', dates));
    }
    if (!rows) rows = stripRow('—', '');

    return '<div class="strip" style="--strip-label:76px;--cell-size:20px">' +
      '<div class="strip__head"><span></span>' +
        dates.map(function (iso) {
          return '<span' + (iso === s.today ? ' data-today' : '') + '>' +
            esc(String(+iso.slice(8, 10))) + '</span>';
        }).join('') +
      '</div>' +
      rows +
      '</div>';
  }

  function stripRow(label, cells) {
    return '<div class="strip__row">' +
      '<span class="strip__label">' + esc(label) + '</span>' + cells + '</div>';
  }

  function itemRowExists(client, dates, kind) {
    for (var i = 0; i < dates.length; i++) if (itemOn(client, dates[i], kind)) return true;
    return false;
  }

  function doseCells(client, protocolId, dates) {
    var s = st();
    return dates.map(function (iso) {
      var d = doseOn(client, iso, protocolId);
      var mark = iso === s.today ? ' data-today' : '';
      if (!d) {
        return '<span class="cell" data-status="off"' + mark + ' title="' +
          esc(ui.dayLabel(iso) + ' · nothing scheduled') + '"></span>';
      }
      return '<span class="cell" data-status="' + esc(d.status) + '"' + mark +
        ' title="' + esc(ui.dayLabel(iso) + ' · ' + ui.statusLabel(d.status) +
          ' · ' + ART.prep.household(d)) + '">' + esc(ui.glyph(d.status)) + '</span>';
    }).join('');
  }

  /* A tapping row has cells on Monday and Thursday and NOTHING on the other
     five. Those five are not misses: data-status='off' draws a bare dot, so a
     twice-weekly row cannot read as a family failing five days a week. */
  function itemCells(client, kind, dates) {
    var s = st();
    var label = kind === 'drops' ? 'Water drops' : 'Spine tap';
    return dates.map(function (iso) {
      var e = itemOn(client, iso, kind);
      var mark = iso === s.today ? ' data-today' : '';
      if (!e) {
        return '<span class="cell" data-status="off"' + mark + ' title="' +
          esc(ui.dayLabel(iso) + ' · ' + label + ' not scheduled') + '"></span>';
      }
      return '<span class="cell" data-status="' + esc(e.status) + '"' + mark +
        ' title="' + esc(ui.dayLabel(iso) + ' · ' + label + ' · ' +
          ui.statusLabel(e.status) + ' · ' + e.display) + '">' +
        esc(ui.glyph(e.status)) + '</span>';
    }).join('');
  }

  /* The strip's vocabulary, in words. A 20px cell has room for a glyph and not
     for a label, and SPEC §1.14 forbids a status carried by colour alone — so
     the two strips above get one legend between them, keyed off .legend__item,
     which app.css already sizes a .cell down to 18px inside.

     Only the marks actually drawn in the weeks passed in are listed, so the
     legend can never explain something that is not on the screen, and an empty
     set renders nothing rather than an empty list. `off` is listed whenever one
     is drawn, because a bare dot on a twice-weekly tapping row is the mark most
     easily misread as five missed days. */
  var LEGEND_ORDER = ['done', 'held', 'skipped', 'reaction', 'planned', 'off'];

  function legendWord(status) {
    if (status === 'off') return 'Nothing scheduled';
    if (status === 'planned') return 'Still to come';
    return ui.statusLabel(status);
  }

  function legendFor(client, startISOs) {
    if (!client) return '';
    var seen = {};
    var protos = client.protocols || [];

    (startISOs || []).forEach(function (startISO) {
      var dates = ui.weekDates(startISO);
      /* mirrors strip(): a kind with no entry anywhere in the week has no row
         at all, so it contributes no `off` cells either */
      var kinds = ['drops', 'tapping'].filter(function (k) {
        return itemRowExists(client, dates, k);
      });
      dates.forEach(function (iso) {
        protos.forEach(function (cp) {
          var d = doseOn(client, iso, cp.protocolId);
          seen[d ? d.status : 'off'] = 1;
        });
        kinds.forEach(function (k) {
          var e = itemOn(client, iso, k);
          seen[e ? e.status : 'off'] = 1;
        });
      });
    });

    var marks = LEGEND_ORDER.filter(function (s) { return seen[s]; });
    if (!marks.length) return '';

    return '<ul class="legend">' +
      marks.map(function (s) {
        return '<li class="legend__item">' +
          '<span class="cell" data-status="' + s + '" aria-hidden="true">' +
            esc(ui.glyph(s)) + '</span>' +
          esc(legendWord(s)) +
          '</li>';
      }).join('') +
      '</ul>';
  }
  /* The foods this child is on, maintenance first — those are the ones meal
     ideas are actually for — then whatever is still ramping, in dose order. */
  function familyFoods(client) {
    if (!client) return [];
    var out = [], seen = {};
    function add(protocolId) {
      if (!protocolId || seen[protocolId]) return;
      var proto = ART.store.protocol(protocolId);
      if (!proto) return;
      var cp = clientProtocol(client, protocolId);
      seen[protocolId] = 1;
      out.push({
        protocolId: protocolId,
        allergen: proto.allergen,
        maintenance: proto.maintenance,
        state: cp ? cp.state : 'graduated',
        week: cp ? cp.week : null,
        of: cp ? cp.of : null,
        ideas: ART.metrics.mealIdeas({ client: client, protocolId: protocolId })
      });
    }
    ART.metrics.maintenanceAllergens(client).forEach(function (m) { add(m.protocolId); });
    client.protocols.slice().sort(function (a, b) {
      return String(a.timing).localeCompare(String(b.timing));
    }).forEach(function (cp) { add(cp.protocolId); });
    return out;
  }
  /* One idea. Title, the time in minutes as a real figure, one line of method,
     a save. Two stocks by source (app.css §16m), so a card from the practice
     and a card from a household are told apart without a label. */
  function mealCard(idea, client, opts) {
    var o = opts || {};
    var saved = ART.metrics.isSaved(idea, client);
    var mine = isMine(idea, client);
    var state = IDEA_STATE[idea.status] || IDEA_STATE.approved;

    var by = idea.source === 'family'
      ? (mine ? '<strong>Yours</strong>' : '<strong>' + esc(idea.submittedByName) + '</strong>')
      : 'A.R.T. practice';
    if (idea.source === 'family' && idea.status !== 'approved') {
      by += ' &middot; ' + esc(state.word);
    }

    return '<article class="mealcard' + (o.tight ? ' mealcard--tight' : '') + '"' +
      ' data-source="' + esc(idea.source) + '"' +
      (idea.source === 'family' ? ' data-status="' + esc(idea.status) + '"' : '') +
      (idea.isCommunal ? ' data-communal' : '') + '>' +
      '<div class="mealcard__head">' +
        '<h3 class="mealcard__title">' + esc(idea.title) + '</h3>' +
        '<span class="mealcard__time">' + idea.minutes + ' <small>min</small></span>' +
      '</div>' +
      '<p class="mealcard__body">' + esc(firstSentence(idea.body, o.tight ? 96 : 118)) + '</p>' +
      /* the live ring goes on the FOOT, not on the 28px button: the hint
         label is 96px wide and anchored to its element's left edge, so on the
         button it hung 44px out past the phone's bezel. */
      '<div class="mealcard__foot"' + (o.loud ? ' data-live="Save an idea"' : '') + '>' +
        '<span class="mealcard__by">' + by + '</span>' +
        '<span class="mealcard__saves">' + idea.savedCount + ' saved</span>' +
        /* the save is a real control on the two phones and a static artefact
           inside the ugc diagram — an unwired button there would be worse
           than no button at all */
        (o.still
          ? ''
          : '<button type="button" class="mealcard__save" data-fam="save"' +
            ' data-idea="' + esc(idea.id) + '"' +
            ' aria-pressed="' + (saved ? 'true' : 'false') + '"' +
            ' aria-label="' + esc((saved ? 'Remove ' : 'Save ') + idea.title) +
            '"></button>') +
      '</div>' +
      '</article>';
  }
  /* ================================================================ ugc ===
     The review loop, 1014 wide. This is medical-adjacent content moving from
     one family to another, so the governance IS the frame: every step names
     who can see it, the decline path is drawn as fully as the approval, and a
     real submission is traced along the rail.

     RESTRUCTURED 2026-10-22 TO STAND INSIDE 1014 x 974 — HOME_SPEC §12a.
     Section 2 gained a seventh phone and this frame paid for it with 386 of
     width. It did not fit the old one either: measured on the live board at
     1014 the stacked column was 1229 against a content box of 856 (974 frame,
     less the 94 zone head, less its 24 margin), so 373 of it painted onto bare
     desk and 128 of that crossed §3's hairline. §12a's instruction was content
     and arrangement, never scale and never type under 12px, and that is what
     this is: nothing here is transformed, nothing is clamped, and the smallest
     type on the frame is still the 12px `.flow__see` / `.meta` the rest of the
     board uses.

     THE ONE STRUCTURAL MOVE: the five-step loop no longer carries its own
     evidence. Measured per step at 1014 (five columns of 184, `flow--row`
     stretches them all to the tallest), the arts were what made it deep:

         step 1  403   of which 167 was a mealcard
         step 2  332
         step 3  555   of which 338 was the review queue   <- the binding step
         step 4  441
         step 5  426   of which 186 was a mealcard

     A 184px column is the worst place on this frame to draw a card: the same
     mealcard measures 167 at 184 and 91 at 430, and the same queue measures
     338 at 184 and 191 at 600. So the three arts come out of the columns and
     stand together in one wide band under the loop, where they are evidence
     for the whole loop rather than a picture inside one step of it — and the
     loop above them becomes what it always argued it was: five actors, five
     titles, five sentences and five statements of who can see the thing.

     WHAT WAS CUT, NAMED RATHER THAN QUIETLY DROPPED:
       · the trace bar's CARD. The bar restated the queue's own contents one
         block below the queue — `reviewQueue()` is oldest first, so the traced
         submission was always the first item drawn beside it. The trace is now
         a marker ON that item plus its five-stop chip row, which is the same
         five facts in one place instead of two. `One value, one answer`.
       · step 4's two quoted review notes. The decline band below quotes its
         note IN FULL, and the approval's note is still quoted there, so the
         branch chips in the column carry who and when and stop there.
       · prose. Every `flow__body` lost its second sentence where the second
         sentence restated the title. No `flow__see` line was shortened: those
         are the governance claim and they are the reason the frame exists.
       · the register's table cap, 147 -> LEDGER_TBL_H below. Its own comment
         has always named it the frame's slack absorber and it absorbs again.

     MEASURED RESULT, live board, 1014 wide — see the band table at ugcBody.
     ====================================================================== */

  function ugcBody() {
    var queue = ART.metrics.reviewQueue();
    var published = ART.metrics.mealIdeas({ source: 'family', status: 'approved', communal: true });
    var declined = ART.metrics.mealIdeas({ source: 'family', status: 'declined', visibleTo: false });
    var flow = ART.metrics.ideaFlow();

    var traced = queue[0] || null;
    var exemplar = published[0] || null;
    var refused = declined[0] || null;

    /* .panel + .panel draws the hairline between the bands, so the rules on
       this frame come from app.css and not from a colour written here. */
    return '<div style="display:flex;flex-direction:column">' +

      '<div class="panel" style="padding-bottom:8px">' +
        loopFlow({ queue: queue, exemplar: exemplar }) +
      '</div>' +

      (refused
        ? '<div class="panel" style="padding:8px 0">' + declineBand(refused) + '</div>'
        : '') +

      '<div class="panel" style="padding-top:8px">' +
        evidence({ queue: queue, traced: traced, rows: flow }) +
      '</div>' +

      '</div>';
  }

  /* THE LOOP ITSELF — five actors, and for each of them one sentence and one
     statement of who can see the thing at that moment. No art: see the section
     head. The two branches that are not the happy path stay, because a loop
     drawn with only its happy path is a diagram that lies. */
  function loopFlow(d) {
    var qCount = d.queue.length;
    /* reviewQueue() is oldest first, because it is a queue and not a feed */
    var oldest = d.queue.length ? ageDays(d.queue[0].createdAt) : 0;

    return '<div class="flow flow--row">' +

      /* 1 — the family writes it down ------------------------------------ */
      '<div class="flow__step" data-by="family">' +
        '<p class="flow__actor">The family</p>' +
        '<h3 class="flow__title">Saved, privately</h3>' +
        '<p class="flow__body">A parent writes down the way that actually worked.</p>' +
        '<p class="flow__see"><strong>Visible to:</strong> this family only. Not their ' +
          'practitioner, not the practice, not another family.</p>' +
      '</div>' +

      /* 2 — they share it ------------------------------------------------ */
      '<div class="flow__step" data-by="family">' +
        '<p class="flow__actor">The family</p>' +
        '<h3 class="flow__title">Shared to their practitioner</h3>' +
        '<p class="flow__body">Sharing publishes nothing &mdash; it asks a question.</p>' +
        '<p class="flow__see"><strong>Visible to:</strong> this family and their ' +
          'practitioner.</p>' +
        '<div class="flow__branch" data-loop>' +
          '<b>Withdrawn</b>Unshared at any time, before or after approval. The ' +
          'credit stays theirs.' +
        '</div>' +
      '</div>' +

      /* 3 — the queue ---------------------------------------------------- */
      '<div class="flow__step" data-by="practitioner">' +
        '<p class="flow__actor">The practitioner</p>' +
        '<h3 class="flow__title">The review queue</h3>' +
        '<p class="flow__body">Oldest first. <span class="mono">' + qCount +
          '</span> waiting' +
          (oldest ? ', the oldest for ' + oldest + ' ' + plural(oldest, 'day') : '') + '.</p>' +
        '<p class="flow__see"><strong>Visible to:</strong> every practitioner in the ' +
          'practice, and the owner. No other family.</p>' +
      '</div>' +

      /* 4 — the decision ------------------------------------------------- */
      '<div class="flow__step" data-by="practitioner">' +
        '<p class="flow__actor">The practitioner</p>' +
        '<h3 class="flow__title">Approved, or declined</h3>' +
        '<p class="flow__body">Either way the family is told which it was.</p>' +
        '<p class="flow__see"><strong>Recorded:</strong> who decided, when, and the ' +
          'reason in their own words.</p>' +
      '</div>' +

      /* 5 — the library -------------------------------------------------- */
      '<div class="flow__step" data-by="system">' +
        '<p class="flow__actor">The library</p>' +
        '<h3 class="flow__title">Communal, and attributed</h3>' +
        '<p class="flow__body">It reaches every family in maintenance on that food, ' +
          'credited.</p>' +
        '<p class="flow__see"><strong>Visible to:</strong> every family on ' +
          (d.exemplar ? esc(d.exemplar.allergen) : 'that food') + '. ' +
          (d.exemplar ? d.exemplar.savedCount + ' have saved this one.' : '') + '</p>' +
      '</div>' +

      '</div>';
  }

  /* ---------------------------------------------------------- evidence ----
     ONE BAND, TWO COLUMNS: the queue as it really is with a real submission
     traced along it, and the register of every family idea in the practice.

     The queue's items sit SIDE BY SIDE, not stacked — `2 waiting` is printed
     in the step above, so the band must show two, and measured at 1014 two
     stacked in the column this band can spare are 230 where two across it are
     141. The register takes 520 of the 1014 and not a pixel less, because its
     six columns have a 493px min-content width: at 422 the same table scrolled
     SIDEWAYS inside its own box, which is a register that cannot be read, and
     at 500 one of its three visible rows still ran to three lines where the
     other two ran to two. 520 is where every row is the same height.

     THE TWO MEALCARDS THAT USED TO BE HERE ARE CUT, and that is the last of
     §12a's content decisions. Steps 1 and 5 each drew one, the same artefact
     before and after the decision; measured, a `mealcard--tight` is 129 tall
     at any width under 330 and 91 above 400, so the pair cost 217 of an 856px
     box to illustrate a card the Meals phone four frames to the left already
     draws at full size. What survives is the artefact only this frame has: the
     DECLINED card above, which is the one state no other screen on the board
     shows.
     -------------------------------------------------------------------- */
  function evidence(d) {
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,520px);' +
      'gap:24px;align-items:start">' +
      '<div>' +
        '<p class="eyebrow">Waiting on a decision right now</p>' +
        '<div style="margin-top:10px">' + queueArt(d.queue) + '</div>' +
        (d.traced ? traceChips(d.traced) : '') +
      '</div>' +
      '<div>' + ledger(d.rows) + '</div>' +
      '</div>';
  }

  /* the queue as it really is: an inbox, oldest first, no decision controls —
     the decision is the next step, and an unwired button is worse than none.
     TWO ACROSS, because the step above prints how many are waiting. */
  function queueArt(queue) {
    if (!queue.length) return '<div class="empty">Nothing waiting.</div>';
    return '<div style="display:grid;grid-template-columns:repeat(' +
      Math.min(queue.length, 2) + ',minmax(0,1fr));gap:12px;align-items:start">' +
      queue.map(function (idea, i) {
        var age = ageDays(idea.createdAt);
        return '<div class="queue">' +
          '<article class="queue__item" data-state="pending"' +
            (i === 0 ? ' aria-current="true"' : '') + '>' +
            '<div class="queue__head">' +
              '<h4 class="queue__title">' + esc(idea.title) + '</h4>' +
            '</div>' +
            '<span class="queue__age">' + age + ' ' + plural(age, 'day') + '</span>' +
            '<p class="queue__body">' + esc(firstSentence(idea.body, 60)) + '</p>' +
            '<div class="queue__foot">' +
              '<span><strong>' + esc(idea.submittedByName) + '</strong></span>' +
              '<span>' + esc(idea.allergen) + '</span>' +
              '<span>' + idea.minutes + ' min</span>' +
            '</div>' +
          '</article>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  /* "Show a real submitted idea moving along it" — so the OLDEST item in the
     queue beside this row, which is the one `reviewQueue()` puts first, has
     its five stops drawn under it and the stop it has actually reached marked.
     A row of chips rather than the card this used to be: the card repeated the
     queue item's own title, author and age two inches below the queue item. */
  function traceChips(idea) {
    var age = ageDays(idea.createdAt);
    var steps = [
      { label: 'Saved', done: true },
      { label: 'Shared', done: true },
      { label: 'Waiting ' + age + ' ' + plural(age, 'day'), now: true },
      { label: 'Not decided' },
      { label: 'Not in the library' }
    ];
    return '<p class="meta" style="margin-top:12px">' +
        '<strong>' + esc(idea.title) + '</strong> &mdash; step 3 of 5</p>' +
      '<div class="chiprow" style="margin-top:8px">' +
        steps.map(function (s) {
          return '<span class="chip ' + (s.now ? 'chip--coral' : 'chip--neutral') + '">' +
            (s.done ? '&#10003; ' : '') + esc(s.label) + '</span>';
        }).join('') +
      '</div>';
  }

  /* The decline path, drawn as fully as the approval — because a loop with
     only a happy path is a diagram that lies.

     THE FOUR FACTS ARE A 2x2, not a column. At 1014 the old shape gave them a
     564px column and stacked them, which is the one arrangement that spends
     width and buys nothing: measured, four of them stacked in a 564px column
     are 353 tall and two abreast at 295 are 173. The card beside them keeps
     400, which is where its own body stops wrapping onto a fourth line. */
  function declineBand(idea) {
    var who = firstName(practitionerById(idea.reviewedBy)) || 'the practitioner';
    return '<div>' +
      '<p class="eyebrow">If it is declined</p>' +
      '<div style="display:grid;grid-template-columns:minmax(0,400px) minmax(0,1fr);' +
        'gap:24px;margin-top:10px;align-items:start">' +

        '<div>' +
          '<p class="meta" style="margin-bottom:6px">What the family sees</p>' +
          '<article class="mealcard" data-source="family" data-status="declined">' +
            '<div class="mealcard__head">' +
              '<h3 class="mealcard__title">' + esc(idea.title) + '</h3>' +
              '<span class="mealcard__time">' + idea.minutes + ' <small>min</small></span>' +
            '</div>' +
            '<p class="mealcard__body">' + esc(firstSentence(idea.body, 104)) + '</p>' +
            '<div class="mealcard__foot">' +
              '<span class="mealcard__by"><strong>Declined</strong> &middot; ' + esc(who) +
                (idea.reviewedAt ? ' &middot; ' + esc(ui.dayLabel(idea.reviewedAt)) : '') +
              '</span>' +
            '</div>' +
          '</article>' +
          '<div class="flow__branch" data-kind="decline" style="margin:10px 0 0">' +
            '<b>The reason, in full</b>' + esc(idea.reviewNote) +
          '</div>' +
        '</div>' +

        '<div class="flow flow--grid">' +
          declineFact('It is not deleted',
            'The idea stays in that family’s own saved list. Declining keeps it out ' +
            'of the library, not out of the household that found it.') +
          declineFact('The reason is written, not generated',
            'A practitioner types it. A child needs to know what they ate if there ' +
            'is a reaction.') +
          declineFact('The decision is attributable',
            'Who decided, when, and the note, against the practitioner’s own account ' +
            '— in <span class="mono">meal_ideas</span> and in the audit log.') +
          declineFact('It can be revisited',
            'A declined idea can be re-shared after a change. Nothing about the first ' +
            'decision is overwritten.') +
        '</div>' +

      '</div>' +
      '</div>';
  }

  function declineFact(title, body) {
    return '<div class="flow__step" data-by="practitioner">' +
      '<h4 class="flow__title">' + esc(title) + '</h4>' +
      '<p class="flow__body">' + body + '</p>' +
      '</div>';
  }

  /* Every family idea in the practice, and where it actually stands. A table,
     because this is a register — and because nothing else in this section is
     one.

     LEDGER_TBL_H IS THIS FRAME'S SLACK ABSORBER, and after the §12a
     restructure it no longer has to absorb anything. The register now stands
     in the evidence band's 520px column rather than across the whole 1014, so
     its height is this cap plus a 48px head: 195 of a band whose other column
     — the queue and the trace — is 228. It is the SHORTER of the two, which
     means cutting it buys nothing: the band's height is the queue's.

     Measured at 147: a 32px header row, two full rows and a part row at the
     cut saying there is more, with data-scroll reaching the other four without
     moving the frame. At 520 wide every row is 60 (two lines); at 500 one of
     the three visible rows ran to three and the column read ragged, which is
     why the evidence grid fixes 520 and not a pixel less — see evidence().

     THE FRAME HAS BEEN GIVEN ITS HEIGHT BACK — UX audit 2026-10-28. The cap
     measured 147 against a scrollHeight of 451: five of seven rows of "every
     family idea in the practice" were behind an inner scrollbar, which on a
     board navigated by dragging the world is indistinguishable from the
     content simply ending, and this document is read with nobody presenting.
     canvas.js LAYOUT now carries ugc at h1160 instead of FAM_H (974), so the
     full register is affordable and NO ROW IS CUT: the
     register stands at its full seven rows with scrollHeight == clientHeight.
     The band's height becomes this column's (284 + a 48px head = 332) rather
     than the queue's 228, which is the 104px the extra frame height buys. */
  var LEDGER_TBL_H = 460;   /* measured scrollHeight is 451; 460 leaves it 9px
                                of slack so clientHeight == scrollHeight and the
                                box never scrolls. The 284 the comment above
                                predicted was short — the rows are 60 at this
                                width, not the 40 that number assumed. */

  function ledger(rows) {
    if (!rows.length) return '';
    return '<div>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:20px;' +
        'margin-bottom:12px">' +
        '<p class="eyebrow">Every family idea in the practice</p>' +
        '<p class="meta">' + rows.length + ' submitted by households since ' +
          esc(monthOf(earliest(rows))) + ' &middot; ' +
          rows.filter(function (r) { return r.isCommunal; }).length +
          ' in the communal library</p>' +
      '</div>' +
      /* Capped, and scrolling on its own, because seven rows of register is
         more than this frame has ever had room for. Same device the roster
         uses: a part row at the cut says there is more. See LEDGER_TBL_H —
         since §12a the frame no longer overflows, so this cap is a reading
         decision rather than a debt. */
      '<div class="tblwrap" id="ugc-ledger" data-scroll data-nopan ' +
        'style="--tbl-h:' + LEDGER_TBL_H + 'px"><table class="tbl tbl--dense">' +
        '<thead><tr>' +
          '<th scope="col">Idea</th>' +
          '<th scope="col">Food</th>' +
          '<th scope="col">From</th>' +
          '<th scope="col">Where it stands</th>' +
          '<th scope="col" data-num>Saved by</th>' +
          '<th scope="col">Decided</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (idea) {
          var state = IDEA_STATE[idea.status] || IDEA_STATE.saved;
          var who = firstName(practitionerById(idea.reviewedBy));
          var decided = idea.reviewedAt
            ? esc(who || 'practitioner') + ' · ' + esc(ui.md(idea.reviewedAt))
            : (idea.status === 'submitted'
              ? 'waiting ' + ageDays(idea.createdAt) + ' ' + plural(ageDays(idea.createdAt), 'day')
              : 'not shared');
          return '<tr>' +
            '<td data-key>' + esc(idea.title) + '</td>' +
            '<td>' + esc(idea.allergen) + '</td>' +
            '<td>' + esc(idea.submittedByName) + '</td>' +
            '<td><span class="chip ' + state.chip + '">' + esc(state.word) + '</span></td>' +
            '<td data-num>' + idea.savedCount + '</td>' +
            '<td>' + decided + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>' +
      '</div>';
  }

  function ageDays(iso) {
    return Math.max(0, ui.diffDays(String(iso).slice(0, 10), st().today));
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function earliest(rows) {
    var out = null;
    rows.forEach(function (r) {
      var d = String(r.createdAt || '').slice(0, 10);
      if (d && (!out || d < out)) out = d;
    });
    return out;
  }

  function monthOf(iso) {
    if (!iso) return '';
    return MONTHS[Math.max(0, Math.min(11, (+iso.slice(5, 7)) - 1))];
  }


  /* ============================================================ SCREEN 7 ===
     REPORTS.  HOME_SPEC §12 — the family app's seventh screen.

     Geoff: *"throw reports mockup for the family app"*

     the reference app's Reports tab is the model (read-only reference): a big ring
     figure with a one-word state, labelled component bars, a stat strip, a
     goal-and-ETA line, Milestones as cards, and a NEXT STEP card that ends in
     one pill button. That is the reference app's score card (the ring,
     the 4-signal breakdown and the CTA pill), `src/components/WeekPulse.tsx`
     (the stat tiles and the `Goal · … · ETA …` line) and the Milestones
     pattern. SAME SHAPE, OUR CONTENT, OUR PALETTE — the reference app is purple and that
     is not the lesson; the lesson is a ring, four bars, three tiles and one
     action, in that order.

     THREE RULES DECIDED WHAT IS ON THIS SCREEN, AND THEY CUT THINGS.

     1  EVERY FIGURE HAS A FUNCTION BEHIND IT, OR IT IS NOT HERE. The screen
        reads `ART.metrics.clientAdherence` (the ring), `daySplit` (the bars,
        the day counts, the open items, today's dose and the next ramp move),
        `clientPhaseRuns` (the finished phases) and `phaseDuration` (what a
        phase is planned to take and what it took across the practice). It
        reads nothing else and it hardcodes no number. HOME_SPEC §12b asked
        for a `WEEKS ON SESAME` tile and there is no function that returns it
        — `client.protocols[].week` is a stored field, not a measurement —
        so THE TILE IS CUT rather than filled from the record. Same for the
        deltas §12b asks for "where one exists": the 28 days before this
        window contain 3 planned days for c-mara, not 28, so a delta against
        them would be an artefact of where the dataset starts. None is drawn.

     2  REPORT WHAT HAPPENED, NEVER A VERDICT ON THE CHILD OR THE FAMILY.
        The word beside the ring describes the LOGGING RECORD and nothing
        else, and ringState() is its whole definition: nothing prescribed
        before today is still open -> `On plan`; something is open and the
        newest of them is inside the last week -> `Slipping`; something is
        open but the recent days are clean -> `Catching up`. No praise, no
        blame, no grade, and the same holds for the phase chips — `ACHIEVED`
        / `IN PROGRESS` / `COMING UP` are positions in a protocol.
        the reference app reached the same place from the other direction and its own
        source says so: the reference score card band label ("Locked in" /
        "Settling" / "Finding") was deleted on 2026-10-06 as "a verdict on
        the baby". Ours is a word about a record, which is why it survives.

     3  ONE VALUE, ONE ANSWER. Adherence has ONE definition on this board —
        logged over planned, which is what `clientAdherence` returns — so it
        appears exactly once, in the ring, with its period stated under it.
        The component bars are a BREAKDOWN of that same 28 days by item type,
        not a second adherence; the four of them cover every prescribed item
        in the window, which is why the TABLET is a bar. §12b named three
        (Food · Drops · Spine tap) and the tablet is 28 of the window's 161
        planned items — drawing three bars under a ring they do not account
        for would be the one defect this screen cannot carry. Reported, not
        decided quietly: see the crossFileRequest.
        For the same reason the step number lives in ONE place (the phase
        rail's line), the next ramp move lives in ONE place (the NEXT STEP
        card), and the stat strip carries three facts that appear nowhere
        else on the screen. `OPEN ITEMS` is one of them and it is the tile
        that substantiates the word beside the ring: ringState() reads
        exactly that count, so the word is never a claim a reader cannot
        check against a number in front of them.

     THE SIX BLOCKS, in §12b's order
        1  the ring + its period + the one-word state
        2  the component bars, labelled left, track right
        3  the stat strip
        4  where they are in the protocol, as a phase rail
        5  the phases, as P3 cards
        6  NEXT STEP, ending in one pill button

     Blocks 1 and 2 share one card, because that is literally one card in
     the reference app (the reference score card draws the ring and the breakdown inside one
     `DuskCard`) and because a second card costs 36px — 24 of padding and a
     12 gap — of a port that has 16 to spare. Block 4 is a LINE rather than a
     card for the same two reasons: the reference app's goal-and-ETA line is drawn
     straight onto the gradient by `WeekPulse`, and a card around it measured
     112 against the 48 it takes on the ground.

     COMPONENTS: .card, .statstrip/.stat, .ramp, .idea, .chip, .phead and
     .pnav are the existing system and are reused as they are — the phase card
     IS the P3 card MEALS stands on, and the phase rail IS §09's .ramp. Four
     shapes had no rule on this board and are the only CSS this screen adds:
     the ring (§24a), the component bars (§24b), a card that ends in a pill
     (§24c) and the rail's own line on the ground (§24d). No new token, no new
     hue, and no type under 12px.

     TWO ELEVEN-PIXEL LABELS ARE ON THIS SCREEN AND BOTH ARE INHERITED, NOT
     ADDED: .stat__label (§17g) and .pnav__label (§17b), which render at 11 on
     CALENDAR and on every other phone in this section already. §12d's "nothing
     below 12px" is a rule carried forward, and HOME shipped under it with the
     same two components at the same size, so §24 reads it as a rule about what
     a screen ADDS. Lifting §17g to 12 would retune another section for all
     seven phones and would ellipsise `DAYS COMPLETE` in a 103px column, so it
     is reported rather than done quietly.

     INERT, like the tab bar. SPEC §7 is a ceiling and this screen is not on
     it, so the pill is a <span>: a button drawn as a <button> that moved
     nothing would be a worse lie than one drawn as what it is.
     ====================================================================== */

  /* The ring's period, and the window every figure on this screen is measured
     over. 28 is `clientAdherence`'s own default-shaped window and the number
     the rest of the board already uses for a month. */
  var REPORT_DAYS = 28;

  /* "Recent", for ringState only: the cut that decides whether an open item
     is a miss in the last week or an older gap the recent days have left
     behind. One week, because that is the unit the booklet is published in. */
  var REPORT_RECENT = 7;

  /* The component bars — every prescribed item type in a day, in the order a
     day runs them (the tablet and the first food at 08:00, the drops at
     08:05, the treated doses in the afternoon, the tap in the evening).
     `dose` is BOTH the treated allergen doses and the maintenance servings,
     because both are food and that is the bar a parent reads as "the food".
     A type with nothing planned in the window draws no bar at all — the reference app's
     own rule for a null component: "Skip the row rather than drawing an empty
     bar that reads as a zero." */
  var REPORT_BARS = [
    { key: 'dose', label: 'Food' },
    { key: 'alka', label: 'Tablet' },
    { key: 'drops', label: 'Drops' },
    { key: 'tapping', label: 'Spine tap' }
  ];

  /* A phase's position in its protocol, as the chip vocabulary §12b names.
     NOT the status trio: --ok / --hold / --react mean a logged dose outcome
     and a phase is not a child who held a dose, so these ride the
     navy/periwinkle ramp §16 reserves for exactly this (.idea's own review
     states do the same thing one screen over). */
  var PHASE_STATE = {
    done: { chip: 'chip--navy', word: 'Achieved' },
    live: { chip: 'chip--peri', word: 'In progress' },
    next: { chip: 'chip--neutral', word: 'Coming up' }
  };

  /* ONE PASS OVER THE WINDOW, and it is `daySplit` 28 times — the same object
     SCHEDULE renders and HOME's NEXT UP reads, so a figure here can never
     disagree with one there. Everything this screen counts comes out of this
     one walk:
         daysPlanned / daysComplete  daySplit's own `complete` flag, which is
                                     true only when every prescribed thing on
                                     the day is logged
         byType                      the window's entries bucketed by
                                     itemType, with metrics.js's own rate
                                     (logged / planned, rounded) — there is no
                                     per-client-per-type function to call, and
                                     byItemType() is practice-wide
         heldDays                    days carrying a held dose. A hold is the
                                     protocol's own mechanism, so it is
                                     counted, never scored
         openBefore / openNewest     prescribed items on a day BEFORE today
                                     that were never logged. Today's own
                                     not-yet-due items are deliberately not in
                                     it: an 18:30 dose at four in the
                                     afternoon is not a miss */
  function reportWindow(client) {
    var t = st().today;
    var from = ui.addDays(t, -(REPORT_DAYS - 1));
    var out = {
      from: from, to: t, days: REPORT_DAYS,
      daysPlanned: 0, daysComplete: 0, heldDays: 0,
      openBefore: 0, openNewest: null,
      byType: {}
    };
    if (!client) return out;

    REPORT_BARS.forEach(function (b) {
      out.byType[b.key] = { logged: 0, planned: 0, pct: 0 };
    });

    for (var i = 0; i < REPORT_DAYS; i++) {
      var iso = ui.addDays(from, i);
      var day = ART.metrics.daySplit(client, iso);
      if (!day.planned) continue;
      out.daysPlanned++;
      if (day.complete) out.daysComplete++;
      var held = false;
      for (var j = 0; j < day.all.length; j++) {
        var e = day.all[j];
        var bucket = out.byType[e.itemType || 'dose'];
        if (bucket) {
          bucket.planned++;
          if (e.status !== 'planned') bucket.logged++;
        }
        if (e.status === 'held') held = true;
        if (e.status === 'planned' && iso < t) {
          out.openBefore++;
          if (!out.openNewest || iso > out.openNewest) out.openNewest = iso;
        }
      }
      if (held) out.heldDays++;
    }

    REPORT_BARS.forEach(function (b) {
      var k = out.byType[b.key];
      k.pct = k.planned ? Math.round((k.logged / k.planned) * 100) : 0;
    });
    return out;
  }

  /* The word beside the ring. RULE 2 is the whole of this function: it
     describes the record, it never grades anybody, and every branch of it is
     a fact a reader can check against the card's own `N open before today`
     line. */
  /* The word beside the ring NAMES THE STATE; it does not grade the family.
     'Slipping' and 'Catching up' were verdicts on a parent's behaviour, and
     'Slipping' beside a 96% ring also read as a contradiction. These describe
     only where the unlogged items sit in the window, which is the fact the
     ring cannot show on its own — and none of them restates a number another
     tile already carries. */
  function ringState(w) {
    if (!w.openBefore) return 'All logged';
    var cut = ui.addDays(st().today, -REPORT_RECENT);
    return w.openNewest >= cut ? 'Open this week' : 'Open from earlier';
  }

  /* TODAY'S DOSE OF ONE PROTOCOL, and the next day its STEP moves — the
     "next ramp move" §12b's position card and NEXT STEP card are both about.
     Derived, never named: whichever food steps up soonest is the one the
     screen follows, so a published change re-targets both blocks without a
     line of this file knowing which allergen it is.
     Maintenance servings are skipped — a maintenance food has no next step,
     which is the point of reaching it. */
  function reportRamp(client) {
    if (!client) return null;
    var t = st().today;
    var nowOf = {};
    ART.metrics.daySplit(client, t).all.forEach(function (e) {
      if (!e.protocolId || e.isMaintenance) return;
      if (!nowOf[e.protocolId]) nowOf[e.protocolId] = e;
    });

    for (var k = 1; k <= REPORT_DAYS; k++) {
      var iso = ui.addDays(t, k);
      var day = ART.metrics.daySplit(client, iso);
      for (var i = 0; i < day.all.length; i++) {
        var e = day.all[i];
        if (!e.protocolId || e.isMaintenance) continue;
        var now = nowOf[e.protocolId];
        if (!now || e.stepIdx <= now.stepIdx) continue;
        return { protocolId: e.protocolId, today: now, next: e, dateISO: iso };
      }
    }

    /* no step moves inside the window: follow the first non-maintenance food
       anyway, so the position card still has something true to draw */
    var ids = Object.keys(nowOf);
    return ids.length ? { protocolId: ids[0], today: nowOf[ids[0]], next: null, dateISO: null } : null;
  }

  function phaseOf(protocolId, phaseIdx) {
    var proto = ART.store.protocol(protocolId);
    var phases = (proto && proto.phases) || [];
    return phases[phaseIdx] || null;
  }

  /* The practice's own numbers for one phase, from phaseDuration — what it is
     planned to take and what it actually took across every child who has
     finished it. minN 1 so a phase with few runs still answers rather than
     silently dropping the card's data line. */
  function phaseFacts(protocolId, phaseIdx) {
    var rows = ART.metrics.phaseDuration({ protocolId: protocolId, minN: 1 });
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].phaseIdx === phaseIdx) return rows[i];
    }
    return null;
  }

  /* ---------------------------------------------------- 1 + 2 · the ring -- */

  /* the reference app's the reference score card, in our stock: a 96px ring at 9px stroke with
     the figure inside it, the state word and the period beside it, and the
     breakdown under it. The ring's geometry is 96/9 because those are his two
     numbers; the arc carries pathLength="100" so ONE integer — --pct — drives
     stroke-dasharray with no circumference arithmetic in this file and no
     colour crossing the boundary. */
  function ringCard(client, w) {
    var a = ART.metrics.clientAdherence(client, REPORT_DAYS);
    var bars = REPORT_BARS.filter(function (b) {
      return w.byType[b.key] && w.byType[b.key].planned > 0;
    });
    var low = null;
    bars.forEach(function (b) {
      if (!low || w.byType[b.key].pct < w.byType[low.key].pct) low = b;
    });

    return '<section class="card repring" style="--pct:' + (a.pct | 0) + '">' +
      '<div class="repring__row">' +

        /* the figure, and its period under it */
        '<div class="repring__dial">' +
          ui.svg('svg', {
            class: 'repring__svg', viewBox: '0 0 96 96', width: 96, height: 96,
            'aria-hidden': 'true', focusable: 'false'
          },
            ui.svg('circle', { class: 'repring__track', cx: 48, cy: 48, r: 43.5, fill: 'none' }) +
            ui.svg('circle', {
              class: 'repring__arc', cx: 48, cy: 48, r: 43.5, fill: 'none',
              pathLength: 100, transform: 'rotate(-90 48 48)'
            })) +
          '<span class="repring__fig">' +
            '<b class="repring__pct num">' + (a.pct | 0) +
              '<span class="repring__unit">%</span></b>' +
          '</span>' +
          '<p class="repring__period">last ' + REPORT_DAYS + ' days</p>' +
        '</div>' +

        /* what it is, what it says, and what it is made of */
        '<div class="repring__meta">' +
          '<p class="idea__cat">Adherence</p>' +
          '<p class="repring__state">' + esc(ringState(w)) + '</p>' +

          /* the breakdown. The lowest bar is marked, which is the reference app's
             `weakest` — the one a reader's eye should land on — and it is
             drawn in the ring's own coral rather than a status colour,
             because a component rate is not a logged dose outcome. */
          '<div class="repbars">' +
            bars.map(function (b) {
              var k = w.byType[b.key];
              return '<div class="repbar" style="--pct:' + k.pct + '"' +
                (low && b.key === low.key && bars.length > 1 ? ' data-low' : '') + '>' +
                '<span class="repbar__label">' + esc(b.label) + '</span>' +
                '<span class="repbar__track" aria-hidden="true">' +
                  '<span class="repbar__fill"></span>' +
                '</span>' +
                '<span class="repbar__value num">' + k.pct + '</span>' +
                '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  /* ------------------------------------------------------ 3 · the strip -- */

  /* THREE TILES, THREE FACTS, and not one of them appears anywhere else on
     this screen: how many days in the window were complete end to end, how
     many prescribed items from a day before today are still unlogged, and how
     many days carried a held dose. The middle one is what substantiates the
     word beside the ring — ringState() reads exactly that count — so the
     state word is never a claim a reader cannot check.

     TWO OF §12b's FOUR TILES ARE NOT HERE, and both are deliberate:
       CURRENT STEP      it is on the phase rail below, where the rail gives
                         it its context. Stated twice it would be the "one
                         value, one answer" defect.
       WEEKS ON SESAME   NO FUNCTION RETURNS IT. `client.protocols[].week` is
                         a stored field on the record, not a measurement, and
                         deriving a week count from the logged days would
                         produce a SECOND answer to it. §12c's rule is to cut
                         the figure rather than fill it from somewhere, so it
                         is cut. */
  function reportStrip(client, w) {
    return '<div class="statstrip" data-align>' +
      stat('Days complete', w.daysComplete + '/' + w.daysPlanned) +
      stat('Open items', String(w.openBefore)) +
      stat('Held days', String(w.heldDays)) +
      '</div>';
  }

  /* --------------------------------------------------- 4 · the position -- */

  /* Where they are in the protocol. the reference app's model for this block is a LINE,
     not a card — `WeekPulse` draws `Goal · {title} · ETA {eta}` straight onto
     the gradient with no card under it at all — so this is the phase chain as
     a rail with one line under it, standing on the graded ground beside the
     cards rather than inside a seventh one. That reading is both the faithful
     one and the one that fits: a card around it costs 61px of a 764px port
     for a block whose content is a rail and a sentence fragment.

     THE CHAIN IS THE POSITION, so there is no `phase 1 of 4` written beside
     it: a fraction and a rail saying the same thing twice is the noise HOME
     deleted when `Core 1 of 4` came off the NEXT UP track. The line carries
     the two facts the rail cannot — which step inside the live phase, and
     what today's amount is. */
  function reportPosition(client, ramp) {
    if (!ramp) return '';
    var proto = ART.store.protocol(ramp.protocolId);
    var phases = (proto && proto.phases) || [];
    var at = ramp.today.phaseIdx | 0;
    var phase = phases[at];
    var steps = (phase && phase.steps) ? phase.steps.length : 0;

    return '<div class="repchain">' +
      '<div class="ramp">' +
        phases.map(function (p, i) {
          return '<span class="ramp__step"' +
            (i === at ? ' aria-current="true"' : '') +
            (i < at ? ' data-state="past"' : '') + '>' +
            (i + 1) +
            (i === at ? ' ' + esc(shortPhase(p.label, proto.allergen)) : '') +
            '</span>';
        }).join('') +
      '</div>' +
      '<p class="repchain__line num">' +
        '<b>' + esc(proto.allergen) + '</b>' +
        (steps ? ' &middot; step ' + ((ramp.today.stepIdx | 0) + 1) + ' of ' + steps : '') +
        ' &middot; ' + esc(rowDose(ramp.today)) + ' today' +
      '</p>' +
      '</div>';
  }

  /* THE RAIL NAMES THE STOP THEY ARE ON AND NUMBERS THE REST, which is what
     makes it a COMPACT rail (§12b) and what makes its height a constant.
     Measured: with every phase labelled, egg's five-phase chain wraps to a
     second chip row — 51px instead of 24 — and ten of the 64 children in the
     set overran the port by exactly that 27px. The rail is also the one block
     on this screen whose height is driven by a protocol's shape rather than
     by a family's record, so it is the one that had to stop varying.

     The label that survives is cut to two words, and an allergen the line
     under the rail already names is dropped from the front of it: `Sesame
     seeds` under a line that opens `Sesame` says sesame twice and costs 50px
     of a 334px rail for the privilege. Never a truncation mid-word — the
     five-food maintenance label is cut at a word boundary, and CSS ellipsis
     is only the backstop under it. */
  function shortPhase(label, allergen) {
    var words = String(label || '').split(/\s+/);
    var food = String(allergen || '').toLowerCase();
    if (words.length > 1 && words[0].toLowerCase() === food) {
      words = words.slice(1);
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    }
    return words.length <= 2 ? words.join(' ') : words.slice(0, 2).join(' ');
  }

  /* ----------------------------------------------------- 5 · the phases -- */

  /* the reference app's Milestones pattern, and it maps one to one onto .idea — the P3
     card MEALS already stands on: a tiny uppercase category, a short title, a
     chip hard right, one line of at most eight words, one coloured data line.
     Nothing else is allowed on it.

     THE LIVE RAMPS COME FIRST, then the finished phase, which is the reference app's own
     sort (`in_progress: 0 … achieved: 2`). The data line is the one honest
     line each kind of phase can carry:
       finished    what it took against what it was planned to take, from
                   clientPhaseRuns — §12b's literal shape
       in progress what it is planned to take against what it took across the
                   practice, from phaseDuration. There is no "finished in" for
                   a phase nobody has finished, and inventing one is the
                   defect this screen cannot carry. */
  function reportPhases(client, limit, ramp) {
    var cards = [];
    var lead = ramp && ramp.protocolId;

    (client.protocols || []).forEach(function (cp) {
      if (cp.state === 'maintenance') return;
      var phase = phaseOf(cp.protocolId, cp.phaseIdx);
      if (!phase) return;
      var facts = phaseFacts(cp.protocolId, cp.phaseIdx);
      cards.push({
        protocolId: cp.protocolId, phaseIdx: cp.phaseIdx,
        state: 'live', title: phase.label,
        line: phaseLine(client, cp),
        data: facts
          ? '<b>Planned ' + facts.plannedDays + ' days</b> &middot; practice median ' +
            facts.medianActual
          : '',
        tone: 'quiet'
      });
    });

    /* the finished phases, newest first. clientPhaseRuns is the only place a
       real `finished in N days` exists on this board. */
    var runs = ART.metrics.clientPhaseRuns(client).slice().sort(function (a, b) {
      return String(b.completedOn).localeCompare(String(a.completedOn));
    });
    runs.forEach(function (r) {
      cards.push({
        protocolId: r.protocolId, phaseIdx: r.phaseIdx,
        state: 'done', title: r.phaseLabel,
        line: runLine(client, r),
        data: '<b>Finished in ' + r.actualDays + ' days</b> &middot; planned ' + r.plannedDays,
        tone: null
      });
    });

    /* THE CARD AND THE RAIL ABOVE IT MUST BE ABOUT THE SAME FOOD. The rail
       follows whichever food steps up soonest, and `client.protocols` is in
       dose-time order, so for a child with two live ramps the first card and
       the rail named different allergens — two blocks, one subject, and a
       reader has no way to tell they disagree. The rail's food leads. */
    if (lead) {
      cards.sort(function (a, b) {
        return (b.protocolId === lead ? 1 : 0) - (a.protocolId === lead ? 1 : 0);
      });
    }

    return cards.slice(0, limit).map(phaseCard).join('');
  }

  function phaseCard(c) {
    var proto = ART.store.protocol(c.protocolId);
    var state = PHASE_STATE[c.state] || PHASE_STATE.next;
    return '<article class="idea">' +
      '<p class="idea__cat">' + esc(String(proto.allergen).toUpperCase()) +
        ' &middot; Phase ' + ((c.phaseIdx | 0) + 1) + '</p>' +
      '<div class="idea__head">' +
        '<h3 class="idea__title">' + esc(c.title) + '</h3>' +
        '<span class="chip ' + state.chip + '">' + esc(state.word) + '</span>' +
      '</div>' +
      (c.line ? '<p class="idea__line">' + esc(eightWords(c.line)) + '</p>' : '') +
      (c.data
        ? '<p class="idea__data num"' + (c.tone ? ' data-tone="' + c.tone + '"' : '') +
          '>' + c.data + '</p>'
        : '') +
      '</article>';
  }

  /* The ≤8-word line on a LIVE phase: when the dose falls and what the wait
     after it is. Both come off the prescription itself — the entry's timing
     and its waitLevel — so the line cannot drift from the plan, and neither
     fact is stated anywhere else on this screen. */
  function phaseLine(client, cp) {
    var e = doseOn(client, st().today, cp.protocolId);
    if (!e) return '';
    var when = dayPartOf(e.timing);
    var wait = (e.waitLevel | 0) >= 2 ? 'with a wait after' : 'no wait needed';
    return when + ' dose, ' + wait + '.';
  }

  /* and on a FINISHED one: what the food does now. A phase that completed
     into maintenance is a daily serving; one that completed into the next
     phase handed over to it. */
  function runLine(client, r) {
    var cp = clientProtocol(client, r.protocolId);
    if (cp && cp.state === 'maintenance') {
      var e = doseOn(client, st().today, r.protocolId);
      return 'Now in maintenance, ' + (e ? dayPartOf(e.timing) : 'daily') + ' serving.';
    }
    return 'Finished, and handed to the next phase.';
  }

  function dayPartOf(timing) {
    var m = ui.minutesOf(timing);
    if (m < 0) return 'Daily';
    if (m < 12 * 60) return 'Morning';
    if (m < 17 * 60) return 'Afternoon';
    return 'Evening';
  }

  /* -------------------------------------------------- 6 · the next step -- */

  /* the reference app ends its Reports with a title, a line and one pill. Ours is the
     next ramp move and the practitioner who set it — the only place on this
     screen the next move is stated, and the only place the practitioner's
     name appears.
     The pill is a <span>: see the section head. */
  function reportNext(client, ramp) {
    var p = practitioner(client);
    var who = p ? p.name : 'your practitioner';

    if (!ramp || !ramp.next) {
      return '<section class="card repstack repnext">' +
        '<p class="idea__cat">Next step</p>' +
        '<p class="repnext__title">No change due this week</p>' +
        '<p class="repnext__line">' + esc(eightWords(who + ' publishes the next move.')) + '</p>' +
        '</section>';
    }

    var proto = ART.store.protocol(ramp.protocolId);
    var day = ui.dayLabel(ramp.dateISO);

    return '<section class="card repstack repnext">' +
      '<p class="idea__cat">Next step</p>' +
      '<p class="repnext__title">' +
        esc(proto.allergen) + ' goes to ' + esc(rowDose(ramp.next)) +
      '</p>' +
      '<p class="repnext__line num">' + esc(day) + ' &middot; set by ' + esc(who) + '</p>' +
      '<span class="repnext__cta">Open ' + esc(day) + '</span>' +
      '</section>';
  }

  /* ------------------------------------------------------- the screen ----- */

  /* IT FITS THE 366 x 794 GLASS WITH NO SCROLLING, AND THE PHASE COUNT IS
     WHAT PAYS FOR IT. The port is 764 — 818 of device, less 2 x 12 of bezel,
     less the 30px status bar — and §12d forbids paying for an overflow out of
     type or out of the 8px rhythm, so §12b's own lever is the one used:
     "drop a phase card rather than shrink type".

     EVERY NUMBER BELOW IS MEASURED ON THE LIVE BOARD AT 390 x 818, ACROSS ALL
     64 CHILDREN IN THE SET, not reasoned about. Everything on this screen
     that is not a phase card — the 16px top inset, the header, the ring card,
     the stat strip, the phase rail, the NEXT STEP card, the tab bar and the
     six 12px gaps — takes 600 at the worst case. A phase card is 136 with its
     12px gap making 148, so:

         748   one phase card      the measured worst case, 16 inside the port
         896   two phase cards     132 over, for every child in the set

     PHASE_CAP is therefore 1. The card drawn is the live ramp the rail above
     it is already about, which is also the reference app's own sort order (`in_progress:
     0 … achieved: 2`), so the cap takes the LAST card off the list rather
     than choosing a different one. Measured result: REPORTS scrolls for 0 of
     64 children; the worst case is 748 of 764 and the best is 594. The
     dataset is fixed (no Math.random), so 748 is a real ceiling and not an
     estimate — and 16px of slack is thin, which is worth knowing before
     anything is added to this screen.

     THE CUT IS REPORTED, NOT HIDDEN. §12b asks for the three phases c-mara
     has real material for — egg in maintenance, sesame mid-ramp, cashew just
     started — and this device has room for one of them. The honest ways to
     get the other two are a taller frame or a Phases surface one tap behind
     MORE, and both are decisions to take with the content in front of you,
     not inside a fit pass. See the crossFileRequest. Nothing on this screen
     is scaled or clamped to buy the fit, and §24 adds no type under 12px. */
  var PHASE_CAP = 1;

  function phoneReports(client) {
    if (!client) return phone(screenEmpty('Reports', 'No client selected.'));

    var w = reportWindow(client);
    if (!w.daysPlanned) {
      return phone(screenEmpty('Reports',
        'Figures appear once a week of the plan is logged.'));
    }
    var ramp = reportRamp(client);

    var body = SCREEN +

      '<header class="phead phead--plain">' +
        '<span class="phead__avatar" aria-hidden="true">' + esc(initial(client)) + '</span>' +
        '<div class="phead__who">' +
          '<h2 class="phead__name h2">Reports</h2>' +
          '<p class="phead__sub meta">' + esc(client.name) + '</p>' +
        '</div>' +
      '</header>' +

      ringCard(client, w) +
      reportStrip(client, w) +
      reportPosition(client, ramp) +

      reportPhases(client, PHASE_CAP, ramp) +

      reportNext(client, ramp) +

      pnav('more') +
      '</div>';

    return phone(body);
  }


  /* ============================================================== frames ===
     Phone hardware, and the caption head every frame in this section carries.
     ====================================================================== */

  /* One device. The status-bar clock is ART.store.state.now in core.js's own
     short format — there is no second copy of the hour in this file any more.
     `note` is the phone's ONE live-hint label: app.css suppresses per-control
     hint labels inside a phone screen, because a label there either reserved a
     28px band (which moved the content it was annotating) or printed across
     the next row. The note hangs below the hardware, where it overlaps
     nothing. */
  function phone(screenHTML, note) {
    return '<div class="phone"' +
      (note ? ' data-live-note="' + esc(note) + '"' : '') + '>' +
      '<div class="phone__bar"><b>' + esc(ui.clockShort(st().now)) +
        '</b><span>LTE 86%</span></div>' +
      '<div class="phone__screen">' + screenHTML + '</div>' +
      '<div class="phone__home"></div>' +
      '</div>';
  }

  function screenEmpty(title, line) {
    return SCREEN +
      '<h2 class="h2">' + esc(title) + '</h2>' +
      '<div class="empty">' + esc(line) + '</div>' +
      '</div>';
  }

  /* The caption that makes each frame readable with nobody presenting. Height
     is PINNED so seven phones standing side by side are the same height — a
     head that sized itself to its own note would stagger them. */
  function zoneHead(eyebrow, title, note, fixed) {
    return '<header class="zone__head"' +
      (fixed === false ? '' : ' style="height:' + HEAD_H + 'px"') + '>' +
      '<p class="zone__eyebrow">' + esc(eyebrow) + '</p>' +
      '<h2 class="zone__title">' + esc(title) + '</h2>' +
      '<p class="zone__note">' + note + '</p>' +
      '</header>';
  }

  function mountPhone(root, eyebrow, title, note, screenHTML) {
    if (!root) return;
    root.innerHTML = zoneHead(eyebrow, title, note) +
      '<div class="zone__body" style="--phone-h:' + PHONE_H + 'px">' + screenHTML + '</div>';
    bind();
  }

  /* ================================================================ zones ===
     One renderer per §4c frame. A renderer never sets its own geometry.

     The frame keys and the renderers now carry the tab bar's own vocabulary,
     one to one, left to right across section 2:

       ph-home · ph-schedule · ph-calendar · ph-reports · ph-prep · ph-meals · ph-more

     HOME and SCHEDULE stand side by side because they are the product and
     because NEXT UP reads SCHEDULE's core plan; PREP sits beside them because
     tapping a row on either redraws it (§7.6). CALENDAR, PREP, MEALS and MORE
     keep their content this round — Geoff: "you could keep them on there just
     move them to the right and we'll work off that later."
     ====================================================================== */

  function focus() { return ART.store.focusClient(); }

  function renderHome(root) {
    mountPhone(root, 'Family · the homebase', 'Home',
      'What&rsquo;s next, every event already logged, and five ways to log one.',
      phoneToday(focus(), 'fam-home'));
  }

  function renderSchedule(root) {
    mountPhone(root, 'Family · the core', 'Schedule',
      'Required and timed, then the foods that only have to happen.',
      phoneSchedule(focus(), 'fam-sched'));
  }

  function renderPrep(root) {
    var client = focus();
    mountPhone(root, 'Family · prep', 'Prep', prepStandfirst(client), phonePrep(client));
  }

  /* The standfirst names the dose the frame is ACTUALLY drawing, so the
     caption and the screen can never name different ones. It has to be
     derived, not written: tapping a row on Home re-targets this phone. */
  function prepStandfirst(client) {
    var entry = prepTarget(client);
    if (!entry) {
      return 'Whatever is tapped on Home, worked out and drawn at actual size.';
    }
    var what = esc(fullName(entry) + ' — ' + rowDose(entry));
    if (isItem(entry)) {
      return what + ', drawn out in order with the day it is due on it. ' +
        'Prescribed today, recorded nowhere.';
    }
    return what + ', drawn at actual size. The arithmetic, done for you.';
  }

  function renderCalendar(root) {
    mountPhone(root, 'Family · the week', 'Calendar',
      'Plan against what happened, with a row for the drops and the tap.',
      phoneCalendar(focus()));
  }

  /* REPORTS sits FOURTH in the row (HOME_SPEC §12a) — the three tab screens,
     then the deeper surfaces. It is reached from MORE, so its tab bar marks
     `more`, exactly as MEALS does. */
  function renderReports(root) {
    mountPhone(root, 'Family · the record', 'Reports',
      'Adherence over 28 days, what it is made of, and the next move.',
      phoneReports(focus()));
  }

  function renderMeals(root) {
    mountPhone(root, 'Family · maintenance', 'Meals',
      'Maintenance runs for months. By then the hard part is variety, not safety.',
      phoneMeals(focus()));
  }

  function renderMore(root) {
    mountPhone(root, 'Family · everything else', 'More',
      'Everything that needs reading lives here. Nothing that does sits up front.',
      phoneMore(focus()));
  }

  /* Section 3's copy of the homebase. Same function, same component, so the
     week the practitioner publishes lands on the screen the family uses.
     Rings are quiet here: SPEC §7 rings a repeated control once, and the loud
     copy is in section 2. */
  function renderHandoff(root) {
    mountPhone(root, 'Family · the handoff', 'The same day',
      'Not a second screen &mdash; the same component, from the plan just published.',
      phoneToday(focus(), 'fam-handoff', { quiet: true }));
  }

  function renderUgc(root) {
    if (!root) return;
    root.innerHTML = zoneHead('Family · governance', 'The review loop',
      'A family idea becomes everyone’s only after their practitioner approves it.', false) +
      '<div class="zone__body">' + ugcBody() + '</div>';
    bind();
  }

  /* Legacy single-host render: the whole section-2 strip in one zone. app.js
     builds a host per frame now, so nothing calls this on the current board —
     it is kept so a mis-mapped renderer shows the screens rather than nothing. */
  function render(root) {
    if (!root) return;
    var client = focus();
    root.innerHTML =
      zoneHead('Family · client app', 'Family app',
        'Four tabs — Home, Schedule, Calendar, More — plus the two surfaces ' +
        'behind them: Prep and Meals.', false) +
      '<div class="zone__body" style="flex-direction:row;align-items:flex-start;' +
        'gap:56px;--phone-h:' + PHONE_H + 'px">' +
        phoneToday(client, 'fam-home') +
        phoneSchedule(client, 'fam-sched') +
        phoneCalendar(client) +
        phonePrep(client) +
        phoneMeals(client) +
        phoneMore(client) +
      '</div>';
    bind();
  }

  /* ============================================================== events ===
     ONE delegated listener on document, bound once. Any copy of this markup,
     anywhere on the board, is live — which is the point: the practitioner
     sees literally the same component the family taps.
     ====================================================================== */

  var bound = false;

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', onClick, false);
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var act = t.closest('[data-fam]');
    if (act) { handle(act); return; }

    /* tapping the body of a row also drives the Prep phone */
    var card = t.closest('[data-fam-dose]');
    if (card && !t.closest('button,input,select,textarea,a')) {
      ART.store.set({ familyDoseId: card.getAttribute('data-fam-dose') });
    }
  }

  function handle(el) {
    var action = el.getAttribute('data-fam');
    var card = el.closest('[data-fam-dose]');
    var entryId = card && card.getAttribute('data-fam-dose');
    var clientId = card && card.getAttribute('data-fam-client');

    /* PART 5 — the Mon–Sun strip on SCHEDULE. The only navigation on any of
       these screens, and the one thing on them that is not a log: everything
       else on SCHEDULE reads ART.store.scheduleDate() back off the store. */
    if (action === 'day') {
      ART.store.setScheduleDay(el.getAttribute('data-day'));
      repaintSchedule(el);
      return;
    }

    /* §7.7 — the Meals food filter */
    if (action === 'mealfilter') {
      ART.store.set({ mealFilter: el.getAttribute('data-filter') || 'all' });
      return;
    }

    /* §7.7 — saving an idea, which is what shares it back to the practice */
    if (action === 'save') {
      var ideaId = el.getAttribute('data-idea');
      var idea = ART.store.mealIdea(ideaId);
      var on = ART.store.saveIdea(ideaId);
      if (idea) {
        ART.store.toast(on
          ? 'Saved — “' + idea.title + '” is yours now'
          : 'Removed from your saved ideas', on ? 'ok' : 'info');
      }
      return;
    }

    if (action === 'pick') {
      if (entryId) ART.store.set({ familyDoseId: entryId });
      return;
    }
    if (!entryId || !clientId) return;

    if (action === 'log') {
      var status = el.getAttribute('data-status');
      /* the compact affordances carry data-direct: a circle and a tile have no
         room for five reason chips, so the chips open on the ROW the dose
         belongs to — data-fam-reveal names it. */
      if ((status === 'skipped' || status === 'reaction') && !el.hasAttribute('data-direct')) {
        var revealId = el.getAttribute('data-fam-reveal');
        var host = revealId ? document.getElementById(revealId) : card;
        revealReasons(host, status, el);
        return;
      }
      ART.store.logEntry(clientId, entryId, {
        status: status,
        reason: null,
        /* Held carries the booklet's own annotation, verbatim */
        note: status === 'held' ? 'hold @ same amount' : null
      });
      return;
    }

    if (action === 'reason') {
      var row = el.closest('[data-fam-reasons]');
      var st2 = (row && row.getAttribute('data-status')) || 'skipped';
      var r = reasonFor(el.getAttribute('data-reason'));
      ART.store.logEntry(clientId, entryId, {
        status: st2,
        reason: r.key,
        note: st2 === 'skipped' ? r.note : null
      });
      return;
    }

    if (action === 'undo') {
      ART.store.undoEntry(clientId, entryId);
    }
  }

  /* THE DAY PICKER'S OWN REPAINT, and it is a stopgap that removes itself.
     ART.store.setScheduleDay emits `scheduleDay`; app.js's DEPS list for
     ph-schedule does not carry that key yet (it was copied from ph-home's,
     which predates the screen), so the emit has no subscriber and the Mon–Sun
     strip would be a control that moved nothing. Until the key is in that list
     SCHEDULE repaints its own host — the same call app.js's own draw() makes,
     through the same ui.keepFocus — and the moment app.js subscribes, the
     guard at the top makes this a no-op rather than a second paint.
     See crossFileRequests: one word in one array. */
  function repaintSchedule(el) {
    var deps = ART.app && ART.app.DEPS && ART.app.DEPS['ph-schedule'];
    if (deps && deps.indexOf('scheduleDay') > -1) return;
    var host = el && el.closest ? el.closest('.zone') : null;
    if (!host) return;
    ui.keepFocus(host, function () { renderSchedule(host); });
  }

  /* Skipped and Reaction reveal the reason row inline. No modal, no second
     screen, no free text — just the five reasons the booklet actually uses.

     THE HOST IS HIDDEN TOO, and that is deliberate. On HOME the chips cannot
     open on a row, because the tally is a history and a dose that is about to
     be logged as a reaction has by definition not been logged yet — so it has
     no row. They open in their own block at the foot of the screen, and while
     that block is closed `hidden` on the WRAPPER means it contributes neither
     height nor one of .pscreen's 12px gaps. Opening it is therefore the only
     thing on this screen that changes the layout, which is the behaviour of a
     sheet and is what it is. */
  function revealReasons(card, status, source) {
    if (!card) return;
    var scope = card.closest('.phone__screen') || document;
    var rows = scope.querySelectorAll('[data-fam-reasons]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].closest('[data-fam-dose]') !== card) {
        rows[i].hidden = true;
        rows[i].removeAttribute('data-status');
        shut(rows[i]);
      }
    }
    var row = card.querySelector('[data-fam-reasons]');
    if (!row) return;

    var same = !row.hidden && row.getAttribute('data-status') === status;
    if (same) {
      row.hidden = true;
      row.removeAttribute('data-status');
    } else {
      row.setAttribute('data-status', status);
      row.hidden = false;
    }
    /* the wrapper follows its row, so a closed block reserves nothing */
    if (card !== row) {
      if (row.hidden) card.setAttribute('hidden', '');
      else card.removeAttribute('hidden');
    }

    var btns = scope.querySelectorAll('[data-fam="log"][aria-expanded]');
    for (var j = 0; j < btns.length; j++) {
      var owns = btns[j] === source ||
        btns[j].closest('[data-fam-dose]') === card;
      btns[j].setAttribute(
        'aria-expanded',
        (owns && !row.hidden && btns[j].getAttribute('data-status') === status)
          ? 'true' : 'false'
      );
    }
  }

  /* A reason block whose row has just been closed: close its wrapper too, so
     it stops reserving a gap. A row inside a .logrow is its own wrapper and
     there is nothing to shut. */
  function shut(row) {
    var host = row.parentNode;
    if (host && host.nodeType === 1 && host.hasAttribute('data-fam-dose') &&
        !host.classList.contains('logrow')) {
      host.setAttribute('hidden', '');
    }
  }

  /* ------------------------------------------------------------------------ */

  ART.zones = ART.zones || {};
  /* One name per frame, and the name is the tab's own word — app.js maps
     ph-home → home, ph-schedule → schedule, and so on down the row. The old
     frame-shaped verbs (today / week / community / messages) and `checklist`
     are gone with the keys that carried them; nothing on the board maps them
     any more, and a dead alias is a second answer to one question. */
  ART.zones.family = {
    home: renderHome,
    schedule: renderSchedule,
    calendar: renderCalendar,
    reports: renderReports,
    prep: renderPrep,
    meals: renderMeals,
    more: renderMore,
    handoff: renderHandoff,
    ugc: renderUgc,

    /* the one pure function the practitioner section also renders. SPEC §6.3
       and js/zone-practitioner.js both name it, so the name stays. */
    phoneToday: phoneToday,

    /* THE DEVICE GEOMETRY, PUBLISHED, so the number lives in exactly one
       place. A `ph-*` or `ugc` row in canvas.js's LAYOUT is this tall — the
       132px caption head, its 24px margin and an 818px device — and reading
       it from here is how the frame and the hardware can never disagree
       again. 974 today. */
    FRAME_H: FRAME_H,
    PHONE_H: PHONE_H,

    /* legacy single-host fallback */
    render: render
  };

  /* bound at load as well as from a render, so a copy of phoneToday() rendered
     by another zone is live even if this zone has not rendered yet */
  bind();
})();
