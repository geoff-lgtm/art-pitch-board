/* A.R.T. pitch board — composition.          file: js/app.js
   owner: integrate                            SPEC §4

   This file is the only place that knows the board as a whole. It does five
   things and deliberately nothing else:

     1. makes sure ART.db is seeded — without ever REASSIGNING it, because every
        zone holds a reference to that object and store.reset() refills it in
        place;
     2. creates one host per ART.canvas.LAYOUT key, in LAYOUT order, positioned
        at its world rectangle, with id `z-<key>` and data-role set;
     3. renders each host through its mapped zone function (§4c, the registry
        below);
     4. owns the four top-bar controls nobody else owns — Household/Grams, Show
        what's live, Replay the handoff, Reset — plus the toast host;
     5. subscribes to the store and re-renders ONLY the frame roots whose data
        actually moved.

   Then, last of all, it calls ART.canvas.init(), which draws the four
   connectors and their labels, the eight section headers, the board map, binds
   pan / zoom / keys / sidebar / both walkthroughs, and frames the `handoff`
   waypoint. Those are canvas.js's to draw and it draws them from the zones'
   real geometry, so they can only be built once every host is on the desk.

   What this file must never do: touch `.world`, its transform, or
   ART.canvas.state. A render may not move the camera or interrupt a pan — the
   hosts are absolutely positioned inside the world and replacing a frame's
   innerHTML never reflows the transform. Nothing here sets a colour, a radius,
   a shadow or a typeface either: css/app.css owns those.

   Load order puts this file last, so every ART.* namespace exists by the time
   boot() runs. Zero hex, zero rgba(, zero font-family, zero storage, zero
   Math.random, zero argless Date — "now" is ART.store.state.today. */

(function () {
  'use strict';

  var ART = window.ART = window.ART || {};
  ART.zones = ART.zones || {};              /* core.js already made it; cheap */

  var ui = ART.ui;
  var store = ART.store;

  /* =================================================== the frame registry ==

     §4c has THIRTY frames across eight sections; SEVEN of them are the
     phones in section 2, whose LAYOUT keys are `ph-*`. Those seven carry the
     tab bar's own vocabulary — HOME · SCHEDULE · CALENDAR · MORE, plus the
     three surfaces behind them, PREP, MEALS and now REPORTS — so the key, the
     renderer and the tab a reader is looking at are all the same word:
     `ph-home` → `home`, `ph-schedule` → `schedule`, and so on. Everything else
     is likewise the same name on both sides.

     `ph-reports` → `reports` (HOME_SPEC §12) keeps that rule and is placed
     FOURTH in this table, matching LAYOUT, because this table's order IS band
     order and a registry that disagreed with the board's reading order would
     repaint the row out of sequence on a multi-key emit. The screen is reached
     from MORE, not from a seventh tab — the tab bar still shows four — so the
     key names the surface, as PREP's and MEALS' already do.

     Those phones are 390 × 974 as FRAMES and 390 × 818 as DEVICES — a frame
     here is a 132px pinned caption head, its 24px margin and then the
     hardware, and it is the hardware that carries a 366 × 794 screen at an
     iPhone's real 1:2.168. Not the 320 × 1320 this table was first written
     against, and not the 390 × 1200 of the round before this one, whose glass
     stood 48% longer than any device that exists. `ph-handoff` in section 3 is
     an EIGHTH frame at the same size. Nothing in this file encodes that: every rectangle is read
     out of ART.canvas.LAYOUT by buildFrames(), which is why re-proportioning
     the whole family section needs no edit here at all — and why §12's
     seventh phone cost this file two lines, a REGISTRY row and a DEPS row, and
     not one coordinate.

     [module, fn] rather than a direct function reference, because this table is
     written at load and the zone objects are only guaranteed complete by
     DOMContentLoaded. resolve() dereferences it at boot.

     ph-handoff belongs to `family` deliberately: section 3's HOME screen is
     the IDENTICAL component the family taps, rendered from the same plan, which
     is the whole claim of the hero wire. There is one implementation of that
     screen and §6.3 requires it. */

  var REGISTRY = {
    /* banner */
    title:          ['story',        'title'],
    /* 1 · the problem */
    booklet:        ['story',        'booklet'],
    concurrency:    ['story',        'concurrency'],
    wait:           ['story',        'wait'],
    burden:         ['story',        'burden'],
    /* 2 · the family app */
    'ph-home':      ['family',       'home'],
    'ph-schedule':  ['family',       'schedule'],
    'ph-calendar':  ['family',       'calendar'],
    'ph-reports':   ['family',       'reports'],
    'ph-prep':      ['family',       'prep'],
    'ph-meals':     ['family',       'meals'],
    'ph-more':      ['family',       'more'],
    ugc:            ['family',       'ugc'],
    /* 3 · the practitioner */
    roster:         ['practitioner', 'roster'],
    builder:        ['practitioner', 'builder'],
    'ph-handoff':   ['family',       'handoff'],
    templates:      ['practitioner', 'templates'],
    /* 4 · what the practice learns */
    macro:          ['owner',        'macro'],
    phases:         ['owner',        'phases'],
    /* 5 · access and invitations */
    roles:          ['platform',     'roles'],
    auth:           ['platform',     'auth'],
    invite:         ['platform',     'invite'],
    /* 6 · the data */
    erd:            ['platform',     'erd'],
    rls:            ['platform',     'rls'],
    /* 7 · delivery */
    stack:          ['business',     'stack'],
    timeline:       ['business',     'timeline'],
    /* 8 · the engagement */
    team:           ['business',     'team'],
    scope:          ['business',     'scope'],
    pricing:        ['business',     'pricing'],
    terms:          ['business',     'terms']
  };

  /* ======================================================= frame dependencies

     Which store keys actually change what a frame draws.

     The emit vocabulary is small and fixed: `db`, `log`, `published`, `draft`,
     `messages`, `ideas` and `reset` from core.js, plus whichever state keys
     store.set() actually moved.

     Over-subscribing costs a wasted render pass. UNDER-subscribing leaves a
     surface stale, and a stale surface on this board is a real defect: two
     places showing the same fact differently is the one thing the client has a
     standing rule against. So where it was a close call, the key is in.

     Notes on the deliberate choices, since several look like omissions:
       · `ph-home` and `ph-schedule` take the SAME list, deliberately. HOME's
         UP NEXT reads SCHEDULE's core plan — one object, not a second source
         of truth — so any emit that can move one can move the other, and the
         two must never repaint on different passes. `ph-prep` is in that set
         too: §7.6 has a tap on HOME re-target the Prep phone.
       · `ph-reports` takes `db`, `log`, `published`, `focusClientId`, `units`
         and `reset` — every input to the only figure on it that can move. The
         ring is `ART.metrics.adherence` over the last 28 days, the component
         bars split that same figure three ways, and the stat strip and the
         phase cards come off `clientPhaseRuns` / `phaseDuration`: logging a
         dose moves all of them, publishing a week moves the denominator, and
         switching client re-asks the question of somebody else. `units` is in
         because the NEXT STEP line names a ramp amount, and an amount on this
         board is formatted by `ART.prep` against the household/grams toggle —
         the same reason `ph-calendar` and `ph-handoff` carry it. It does NOT
         take `familyDoseId` (nothing on Reports is selected — that key is
         HOME's chosen dose) or `messages` (no thread on this screen).
         Adherence has ONE definition and the ring states its period, so this
         screen cannot become a second reading of a number HOME already shows.
       · `booklet` does NOT take `units`. A handwritten page is written in
         household measure; ART.prep.household() is hard-wired there on purpose.
       · `burden` and `wait` do NOT take `focusClientId`. Both draw Mara
         explicitly (zone-story's demo()), because section 1 is one child's week
         and the roster selection belongs to section 3.
       · The five `platform` frames and the six `business` frames take `reset`
         alone. Everything they draw — the permissions matrix, the invitation
         sequence, the schema, the policies, the stack, the schedule, the
         credentials, the scope, the figures, the terms — is fixed content or a
         count of practitioners and centres that no mutation on this board can
         move. `reset` is in the list because store.reset() re-seeds the db, and
         a frame that never repaints at all would be a frame that silently
         stopped being derived.
       · `ideas` rides beside `db` on the three frames that draw the review
         loop, because store.saveIdea() emits both and `ideas` is the honest
         name for what moved.

     Key order mirrors ART.canvas.LAYOUT, which is band order, so a multi-key
     emit still repaints top-to-bottom, left-to-right across the board. */

  var DEPS = {
    title:          ['reset'],

    booklet:        ['db', 'log', 'published', 'reset'],
    concurrency:    ['db', 'log', 'published', 'units', 'focusClientId', 'reset'],
    wait:           ['db', 'log', 'published', 'reset'],
    burden:         ['db', 'log', 'published', 'reset'],

    'ph-home':      ['db', 'log', 'published', 'focusClientId', 'familyDoseId',
                     'units', 'reset'],
    'ph-schedule':  ['db', 'log', 'published', 'focusClientId', 'familyDoseId',
                     'units', 'reset'],
    'ph-calendar':  ['db', 'messages', 'log', 'published', 'focusClientId',
                     'units', 'reset'],
    'ph-reports':   ['db', 'log', 'published', 'focusClientId', 'units',
                     'reset'],
    'ph-prep':      ['db', 'log', 'published', 'focusClientId', 'familyDoseId',
                     'units', 'reset'],
    'ph-meals':     ['db', 'ideas', 'mealFilter', 'focusClientId', 'reset'],
    'ph-more':      ['db', 'ideas', 'messages', 'focusClientId', 'reset'],
    ugc:            ['db', 'ideas', 'focusClientId', 'reset'],

    roster:         ['db', 'log', 'published', 'draft', 'focusClientId',
                     'units', 'reset'],
    builder:        ['db', 'log', 'published', 'draft', 'focusClientId',
                     'units', 'reset'],
    'ph-handoff':   ['db', 'log', 'published', 'focusClientId', 'familyDoseId',
                     'units', 'reset'],
    templates:      ['db', 'published', 'focusClientId', 'units', 'reset'],

    macro:          ['db', 'log', 'published', 'ownerRange', 'reset'],
    phases:         ['db', 'log', 'published', 'phaseKey', 'reset'],

    roles:          ['reset'],
    auth:           ['reset'],
    invite:         ['reset'],

    erd:            ['reset'],
    rls:            ['reset'],

    stack:          ['reset'],
    timeline:       ['reset'],

    team:           ['reset'],
    scope:          ['reset'],
    pricing:        ['reset'],
    terms:          ['reset']
  };

  /* Resolved at boot from ART.canvas.LAYOUT, so the table in canvas.js stays
     the single source of truth for which frames exist and in what order. */
  var FRAME_KEYS = [];
  var RENDER = {};
  var roots = {};
  var toastHost = null;

  /* ================================================================== the db */

  /* data.js seeds ART.db as it loads, so this is belt-and-braces for a file://
     load where a script was blocked. It copies keys IN; it never swaps the
     object, because ART.store.reset() and every zone depend on its identity
     surviving. */
  function ensureDb() {
    if (ART.db && ART.db.clients && ART.db.clients.length) return;
    if (typeof ART.seed !== 'function') return;
    var fresh = ART.seed();
    var db = ART.db || (ART.db = {});
    Object.keys(fresh).forEach(function (k) { db[k] = fresh[k]; });
  }

  /* ============================================================== renderers */

  /* REGISTRY, dereferenced. A key whose module or function is missing is
     reported once, by name, rather than silently drawing an empty rectangle —
     an empty frame on a document that is sent to the client is the one failure
     mode worth being loud about. */
  function resolve() {
    var out = {};
    var missing = [];
    Object.keys(REGISTRY).forEach(function (key) {
      var ref = REGISTRY[key];
      var mod = ART.zones[ref[0]];
      var fn = mod && mod[ref[1]];
      if (typeof fn !== 'function') {
        missing.push(key + ' (ART.zones.' + ref[0] + '.' + ref[1] + ')');
        return;
      }
      out[key] = fn;
    });
    if (missing.length && window.console && window.console.error) {
      window.console.error('[ART] no renderer for: ' + missing.join(', '));
    }
    return out;
  }

  /* ============================================================== the frames */

  /* One bare host per LAYOUT key: the class, the id canvas.init() looks for,
     the role that paints its eyebrow rail, and the world rectangle. Nothing
     else — every zone renders its own head and body, so a wrapper or a padding
     here would double theirs. (`title` is the one exception: as a full-width
     masthead it renders no .zone__body, so anything reaching for
     `#z-title .zone__body` gets null.)

     The geometry is read straight off canvas's LAYOUT table, so there is still
     exactly one source of truth for it; canvas.init() re-stamps the same
     numbers onto whatever it finds, which makes the two passes agree by
     construction rather than by coincidence. A frame NEVER positions itself.

     Built in LAYOUT's own order, which is band order. The frames are
     absolutely positioned, so the order moves nothing on screen — but DOM order
     IS the keyboard and the screen-reader order, and on this board it has to be
     the reading order: banner, then section 1 left-to-right, then section 2, and
     so on down to the terms. On a 12,054px board read with nobody presenting,
     that is the difference between a document and a pile of rectangles. */
  function buildFrames() {
    var L = ART.canvas && ART.canvas.LAYOUT;
    var host = document.getElementById('art-zones') || document.getElementById('art-world');
    if (!L || !host) return false;

    FRAME_KEYS = Object.keys(L).filter(function (key) {
      return !!REGISTRY[key];
    });

    var orphans = Object.keys(L).filter(function (key) { return !REGISTRY[key]; });
    if (orphans.length && window.console && window.console.error) {
      window.console.error('[ART] LAYOUT keys with no registry entry: ' + orphans.join(', '));
    }

    FRAME_KEYS.forEach(function (key) {
      var r = L[key];
      var el = document.createElement('div');
      el.className = 'zone';
      el.id = 'z-' + key;                      /* the id canvas.init() stamps */
      el.setAttribute('data-key', key);
      el.setAttribute('data-role', r.role);
      el.setAttribute('data-section', String(r.s));
      el.style.position = 'absolute';
      el.style.left = r.x + 'px';
      el.style.top = r.y + 'px';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      host.appendChild(el);
      roots[key] = el;
    });
    return FRAME_KEYS.length > 0;
  }

  /* A frame render is always wrapped in ART.ui.keepFocus: these renders replace
     a whole subtree by innerHTML, and the week builder's time field or the
     roster's scroll position has to survive a publish. keepFocus restores
     focus, caret and scroll by element id, which is why every frame prefixes
     its generated ids with its own key.

     Wrapped in try/catch so one broken surface cannot take the board with it: a
     frame that throws leaves the other twenty-eight on screen and says so once
     in the console, instead of killing the pan engine before it is even bound. */
  /* ONE HINT LABEL PER FRAME — applied here, immediately after the frame's own
     markup lands, because anywhere else is a race: the renderer rewrites
     innerHTML and the fresh nodes carry data-live again, so a rule applied
     before the draw is wiped by the draw it was meant to correct.
     Every live control keeps its coral ring. Only the first in the frame keeps
     the TEXT label. Two labels in one frame converge on the gap between their
     anchors and land on whatever sits there — the roster had "see every client"
     rendering downward and "open a client" rendering upward, meeting on the
     "8 of 16 need a decision" line. The ring says "this is live"; the label
     only has to say it once. */
  function oneLabel(el) {
    var live = el.querySelectorAll('[data-live]');
    var seen = false;
    for (var i = 0; i < live.length; i++) {
      if (live[i].getAttribute('data-hint') === 'quiet') continue;
      if (seen) live[i].setAttribute('data-hint', 'quiet');
      else seen = true;
    }
  }

  /* ================================================== placing the hint plates

     ONE LABEL PER FRAME WAS NOT ENOUGH. oneLabel() above decides WHICH control
     keeps the text; it says nothing about WHERE the plate lands, and the plate
     is a nowrap absolute box pinned to a fixed corner with no awareness of
     anything around it. Measured on the live board, that produced three
     separate ways of looking broken:

       - roster: "SEE EVERY CLIENT" printed straight across the sentence
         "8 of 16 need a decision today. Last 7 days counts every..."
       - templates: "STRETCH THE PHASE" across "...on Sesame seeds against a
         planned 21"
       - builder: "PUBLISH — THE HANDOFF" ran 30px past the frame's right edge
         and was cut off mid-word

     So the plate is now PLACED, not pinned. For each candidate we measure the
     plate, try four corners, and take the first that is entirely inside the
     frame AND covers no text. If a control has no clean corner we move on and
     offer the label to the next candidate; if no candidate in the frame has
     one, the frame shows rings only. A ring already says "this is live" — a
     word printed over a sentence says the board is broken.

     Text is measured with Ranges over text NODES, not element boxes. The
     roster collision is invisible to an element-box check: the covered words
     live in a <p> that also contains a <strong>, so the <p> has children and
     a leaf-element sweep skips it and reports the frame clean. */

  var HINT_OBSTACLES = '.phone__screen, canvas, svg, img, table, .chart';

  function plateOf(el) {
    var cs = window.getComputedStyle(el, '::after');
    if (!cs || !cs.content || cs.content === 'none' || cs.content === 'normal') return null;
    var w = parseFloat(cs.width), h = parseFloat(cs.height);
    if (!w || !h) return null;
    return { w: w, h: h };
  }

  /* Every rect in a frame that a plate must not cover.

     `skip` is the labelled element's own text — a button should not count its
     own caption as something it collides with. But a .phone carrying a note is
     not a control: it is the entire screen the note describes, and skipping it
     told the engine the phone was empty space. The note then placed itself
     straight across "Sesame 5 seeds". So a skip that would swallow the frame's
     actual content is no skip at all: anything bigger than a control keeps its
     contents in the obstacle set. */
  function obstacles(frame, owner) {
    var out = [], i;

    /* `owner` is the element the plate names. Its TEXT is not an obstacle —
       a button should not collide with its own caption — but its BOX always
       is: a plate that lands on its own button hides the thing it points at.
       And when the owner is not a control but something frame-sized (a phone
       is the whole screen the note describes), skipping its text would tell
       the engine the frame was empty, so only a small owner gets that pass. */
    var skipText = null;
    if (owner) {
      var own = owner.getBoundingClientRect();
      var fr0 = frame.getBoundingClientRect();
      if (own.width > 1 && own.height > 1) out.push(own);
      if (own.width * own.height <= fr0.width * fr0.height * 0.2) skipText = owner;
    }

    var walk = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      if (skipText && (skipText === n.parentNode || skipText.contains(n.parentNode))) continue;
      var rg = document.createRange();
      rg.selectNodeContents(n);
      var rs = rg.getClientRects();
      for (i = 0; i < rs.length; i++) if (rs[i].width > 1 && rs[i].height > 1) out.push(rs[i]);
    }

    var hard = frame.querySelectorAll(HINT_OBSTACLES);
    for (i = 0; i < hard.length; i++) {
      if (owner && (owner === hard[i] || owner.contains(hard[i]) || hard[i].contains(owner))) continue;
      var hr = hard[i].getBoundingClientRect();
      if (hr.width > 1 && hr.height > 1) out.push(hr);
    }
    return out;
  }

  function hits(box, rects) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var x = Math.min(box.right, r.right) - Math.max(box.left, r.left);
      var y = Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top);
      if (x > 1 && y > 1) return true;
    }
    return false;
  }

  /* UNITS. getBoundingClientRect() returns SCREEN pixels — the world sits
     under a transform, so at 70% zoom a 100px box measures 70. getComputedStyle()
     returns CSS pixels, untransformed. Every candidate box below is computed in
     SCREEN px so it can be compared against obstacle rects and the frame rect,
     and the offset is divided back by the scale on the way out, because
     --hint-l is read inside the transform. Mixing the two put the roster's
     plate across its own control: the plate's width came back unscaled and
     overshot the arithmetic by 1/0.7 of itself. */
  function corners(r, pw, ph, gap) {
    return [
      { side: '',      beside: false, dx: 0,           top: r.top - ph - gap },
      { side: '',      beside: false, dx: r.width - pw, top: r.top - ph - gap },
      { side: 'below', beside: false, dx: 0,           top: r.bottom + gap },
      { side: 'below', beside: false, dx: r.width - pw, top: r.bottom + gap },
      /* BESIDE IT. Above and below are both blocked on a frame whose control
         is boxed in vertically — a phone has its caption directly above and
         the frame's own edge directly below — but a wide frame holding a
         narrow control has room either side. */
      { side: '',      beside: true,  dx: r.width + gap, top: r.top },
      { side: '',      beside: true,  dx: -(pw + gap),   top: r.top }
    ];
  }

  function placeOne(el, frame, fr, rects, gap, sc) {
    var p = plateOf(el);
    if (!p) return false;
    var r = el.getBoundingClientRect();
    var pw = p.w * sc, ph = p.h * sc;
    var cand = corners(r, pw, ph, gap);
    for (var i = 0; i < cand.length; i++) {
      var c = cand[i];
      var box = { left: r.left + c.dx, top: c.top, right: r.left + c.dx + pw, bottom: c.top + ph };
      if (box.left < fr.left || box.right > fr.right) continue;
      if (box.top < fr.top || box.bottom > fr.bottom) continue;
      if (hits(box, rects)) continue;
      if (c.side) el.setAttribute('data-hint', 'below');
      else el.removeAttribute('data-hint');
      el.style.setProperty('--hint-l', Math.round(c.dx / sc) + 'px');
      /* A side placement is the only one the stylesheet cannot express on its
         own: above/below are its two anchors, and beside-it needs the plate's
         bottom pinned level with the control's top rather than above it.
         Read the candidate's own flag — NEVER re-derive it from dx. A
         right-aligned plate has dx = width - plateWidth, which goes negative
         whenever the plate is wider than the control it names, and a "dx < 0"
         test then misread it as a side placement and pinned it level with the
         control's top. That dropped "PUBLISH — THE HANDOFF" flat on top of
         the Publish week button. */
      if (c.beside) {
        el.style.setProperty('--hint-b', 'calc(100% - ' + Math.round(p.h) + 'px)');
      } else {
        el.style.removeProperty('--hint-b');
      }
      return true;
    }
    return false;
  }

  /* A phone's note is mounted into the caption head, which has measured slack
     below the subtitle and nothing to collide with. See app.css for why it
     cannot be a pseudo-element on .phone: that pseudo is the side button. */
  function mountNote(frame) {
    var ph = frame.querySelector('.phone[data-live-note]');
    var head = frame.querySelector('.zone__head');
    var have = frame.querySelector('.livenote');
    if (!ph || !head) {
      if (have) have.parentNode.removeChild(have);
      return;
    }
    var text = ph.getAttribute('data-live-note') || '';
    if (!have) {
      have = document.createElement('p');
      have.className = 'livenote';
      head.appendChild(have);
    }
    if (have.textContent !== text) have.textContent = text;
  }

  function placeFrame(frame) {
    mountNote(frame);
    var all = frame.querySelectorAll('[data-live]');
    var cands = [], i, el;
    for (i = 0; i < all.length; i++) {
      el = all[i];
      var tg = el.tagName.toLowerCase();
      if (tg === 'input' || tg === 'select' || tg === 'textarea' || tg === 'tr') continue;
      /* Inside .phone__screen the ring IS the whole hint and the plate is
         reverted to a plain static pseudo — but COMPONENTS put their own
         ::after glyphs on those same nodes, and a ticked row's check mark
         measured as a plate 16px wide. The engine then "placed" a check mark,
         spent the frame's one label on it, and left the real note quiet: that
         is why the Schedule phone showed a floating tick and no caption.
         Nothing in a phone screen is ever a hint plate. */
      if (el.closest && el.closest('.phone__screen')) continue;
      el.style.removeProperty('--hint-l');
      el.style.removeProperty('--hint-b');
      if (el.getAttribute('data-hint-auto') === 'quiet') {
        el.removeAttribute('data-hint');
        el.removeAttribute('data-hint-auto');
      }
      cands.push(el);
    }
    if (!cands.length) return;

    var fr = frame.getBoundingClientRect();
    /* scale-aware gap: every rect here is in screen space, and the world is
       under a transform, so a flat 4px would shrink with the zoom. */
    var sc = fr.width / (frame.offsetWidth || fr.width) || 1;
    var gap = 4 * sc;

    var placed = false;
    for (i = 0; i < cands.length; i++) {
      el = cands[i];
      if (!placed && placeOne(el, frame, fr, obstacles(frame, el), gap, sc)) {
        placed = true;
        continue;
      }
      /* no clean corner, or the frame already has its one label: ring only */
      el.setAttribute('data-hint', 'quiet');
      el.setAttribute('data-hint-auto', 'quiet');
    }
  }

  /* RE-ENTRANT, because a swallowed request is a silent miss. The old guard
     dropped any call that arrived while a pass was already queued — and boot
     draws thirty frames in a synchronous loop, so twenty-nine requests were
     dropped and the one that ran measured frames that were later re-rendered,
     wiping every --hint-l it had just set. The board then opened with the
     plates back at their unplaced defaults, which is exactly what it looked
     like. A request during a pass now marks it dirty and runs again. */
  var placeQueued = false, placeDirty = false;
  function placeHints() {
    if (placeQueued) { placeDirty = true; return; }
    placeQueued = true;
    window.requestAnimationFrame(function () {
      placeQueued = false;
      var world = document.getElementById('art-world');
      if (world && world.className.indexOf('world--hints') !== -1) {
        var frames = document.querySelectorAll('.world [id^="z-"]');
        for (var i = 0; i < frames.length; i++) placeFrame(frames[i]);
      }
      if (placeDirty) { placeDirty = false; placeHints(); }
    });
  }

  function draw(key) {
    var el = roots[key];
    var fn = RENDER[key];
    if (!el || typeof fn !== 'function') return;
    try {
      ui.keepFocus(el, function () { fn(el); oneLabel(el); });
      placeHints();
    } catch (e) {
      if (window.console && window.console.error) {
        window.console.error('[ART] frame "' + key + '" failed to render', e);
      }
    }
  }

  /* =================================================================== toast */

  /* The toast is position:fixed, so its host lives in .app and NOT in .world —
     inside the world the transform would drag it off screen. tone 'ok' and
     'info' each draw their own glyph in CSS, so the message is never carried by
     colour alone. */
  function paintToast() {
    if (!toastHost) return;
    var t = store.state.toast;
    if (!t || !t.text) {
      if (toastHost.firstChild) toastHost.innerHTML = '';
      return;
    }
    toastHost.innerHTML =
      '<p class="toast toast--' + (t.tone === 'ok' ? 'ok' : 'info') + '">' +
      ui.esc(t.text) + '</p>';
  }

  /* ================================================================= top bar */

  function syncUnits() {
    var u = store.state.units;
    var btns = document.querySelectorAll('[data-units]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        btns[i].getAttribute('data-units') === u ? 'true' : 'false');
    }
  }

  /* canvas.js already owns this button's camera move, the travelling packet and
     the publish on arrival. app.js adds the one piece it owns — the toast — so
     the two handlers add up to one behaviour rather than two competing ones.
     The wording is deliberately about the week travelling rather than about a
     publish, because a replay is a replay whether or not a draft was armed. */
  function onReplay() {
    store.toast('Replaying the handoff — the week, travelling again', 'info');
  }

  /* Reset restores the dataset AND the camera. A reset mid-pitch is almost
     always "put it back the way it opened", and leaving the view parked on the
     owner dashboard while the data jumps back to the start is exactly the stale
     state the button exists to clear. */
  function onReset() {
    store.reset();
    if (ART.canvas && ART.canvas.goto) ART.canvas.goto('handoff');
    store.toast('Reset — sample data back to the start', 'info');
  }

  function bindTopbar() {
    var bar = document.getElementById('art-topbar');
    if (!bar) return;

    bar.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!t) return;
      var a = t.getAttribute('data-action');
      if (a === 'units') {
        var u = t.getAttribute('data-units');
        if (u && u !== store.state.units) store.set({ units: u });
        return;
      }
      if (a === 'replay') { onReplay(); return; }
      if (a === 'reset') { onReset(); return; }
    });


    /* The switch writes the store; canvas.js reflects .world--hints FROM store
       state, so both paths land in one place and a double-bind is a no-op
       (store.set only notifies on a real change). */
    bar.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || t.getAttribute('data-action') !== 'hints') return;
      store.set({ hints: !!t.checked });
      placeHints();
    });
  }

  /* ============================================================ subscription */

  function onStore(changed) {
    if (!changed) return;
    var keys = typeof changed === 'string' ? [changed] : changed;
    if (!keys || !keys.length) return;

    var hit = {};
    var toast = false;
    var units = false;

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'toast') { toast = true; continue; }
      if (k === 'units') units = true;
      for (var j = 0; j < FRAME_KEYS.length; j++) {
        var fk = FRAME_KEYS[j];
        if (DEPS[fk] && DEPS[fk].indexOf(k) > -1) hit[fk] = 1;
      }
    }

    if (units) syncUnits();
    if (toast) paintToast();

    /* LAYOUT order, so a multi-key emit still paints predictably. Only the
       frames in `hit` are touched: never .world, never its transform, never
       ART.canvas.state, so a render can never interrupt a pan. */
    for (var z = 0; z < FRAME_KEYS.length; z++) {
      if (hit[FRAME_KEYS[z]]) draw(FRAME_KEYS[z]);
    }
  }

  /* ==================================================================== boot */

  function boot() {
    if (!ART.canvas || !ART.store || !ART.ui) {
      if (window.console && window.console.error) {
        window.console.error('[ART] a script did not load — canvas, store or ui is missing');
      }
      return;
    }
    ui = ART.ui;
    store = ART.store;
    RENDER = resolve();
    toastHost = document.getElementById('art-toast');

    ensureDb();
    if (!buildFrames()) return;

    /* BEFORE the first draw, not after. A frame may legitimately set state
       while it renders — the week builder arms its draft on first paint — and
       with no subscriber yet that emit is swallowed, so a frame already painted
       (the roster, which draws the draft's ramp strip) never heard about it and
       a cold load did not match a post-Reset render. */
    store.on(onStore);

    for (var i = 0; i < FRAME_KEYS.length; i++) draw(FRAME_KEYS[i]);

    bindTopbar();
    syncUnits();
    paintToast();

    /* LAST, and only once every frame is on the desk: init() builds the four
       connectors and their labels, the eight section headers, the board map,
       binds pan / zoom / wheel / keys / sidebar / minimap and both
       walkthroughs, and then frames the `handoff` waypoint. It never fits the
       world — the board does not open zoomed out. */
    ART.canvas.init();
    /* Twice: once now, and once after the opening camera move has settled.
       init() frames the handoff waypoint with an animation, and a frame
       measured mid-flight is measured against geometry the reader never
       sees. */
    placeHints();
    window.setTimeout(placeHints, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Exposed so the README can describe it and a console can poke it; the canvas
     itself never calls back into here. */
  ART.app = {
    boot: boot,
    draw: draw,
    DEPS: DEPS,
    REGISTRY: REGISTRY,
    keys: function () { return FRAME_KEYS.slice(); }
  };

  /* The palette toggle (HOME_SPEC §11c). Flips one attribute on the board root;
     css/app.css §23 does the rest. No re-render — the tokens cascade. */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-palette-set]');
    if (!b) return;
    var set = b.getAttribute('data-palette-set');
    var root = document.querySelector('.app') || document.body;
    if (set === 'alt') root.setAttribute('data-palette', 'alt');
    else root.removeAttribute('data-palette');
    var seg = b.parentNode;
    if (seg) {
      var all = seg.querySelectorAll('[data-palette-set]');
      for (var i = 0; i < all.length; i++) {
        all[i].setAttribute('aria-pressed', all[i] === b ? 'true' : 'false');
      }
    }
  });

}());
