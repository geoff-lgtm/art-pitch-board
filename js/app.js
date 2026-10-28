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
  function draw(key) {
    var el = roots[key];
    var fn = RENDER[key];
    if (!el || typeof fn !== 'function') return;
    try {
      ui.keepFocus(el, function () { fn(el); });
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
