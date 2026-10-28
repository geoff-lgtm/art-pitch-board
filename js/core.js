/* ===========================================================================
   A.R.T. pitch canvas — js/core.js            owner: data            SPEC §6
   ---------------------------------------------------------------------------
   Creates window.ART. Owns the session store (state + actions) and ART.ui.
   Loaded FIRST; every later file adds to window.ART and never reassigns it.

   NOTES FOR THE OTHER AGENTS
   - ART.ui.svg(tag, attrs, children) returns a MARKUP STRING, not a DOM node,
     because every surface in this build is assembled as an HTML string.
   - ART.ui.dayLabel('2026-10-19') -> 'Mon 10/19'   (booklet style, no padding)
     ART.ui.dayShort('2026-10-19') -> 'Mon'
   - ART.ui.pct() takes 0..100. A value in (0,1] is treated as a fraction.
   - store.on(fn) -> fn(changedKeys:string[]) and returns an unsubscribe fn.
     Key vocabulary: the state keys themselves, plus the synthetic keys
     'db'        the dataset was mutated  -> re-render every data-driven zone
     'log'       a dose status changed
     'published' a weekly plan was committed
     'messages'  a message was appended
     'ideas'     a meal idea was saved or unsaved
     'reset'     everything went back to seed
   - A row in client.days[iso] is a DAY ENTRY, not necessarily a dose:
     itemType is 'dose' | 'drops' | 'tapping' | 'alka'. store.entry/logEntry/
     undoEntry address all four; store.dose/logDose/undoLog are the older names
     for the same rows. Use ART.dayDoses(client, iso) where you mean food only.
   - Every entry carries TWO fields the whole product now reads:
       band      'core'  timed and strict — the alka-seltzer, the drops, the
                         dose of the food being treated, the tap on its days
                 'other' must happen today, the clock floats — maintenance food
       loggedAt  'HH:MM' when it was actually logged, or null while planned.
                 timing is the PRESCRIBED clock; loggedAt is the real one, and
                 it is what the HOME tally prints. There is one classification
                 and HOME and SCHEDULE both read it — see ART.metrics.daySplit.
   - No localStorage. No argless new Date()/Date.now(). No Math.random().
     "Today" is always ART.store.state.today and the WALL CLOCK inside the
     phones is always ART.store.state.now ('16:08'). Nothing may hard-code
     either one: a second copy of the clock is a second answer.
   =========================================================================== */
(function () {
  'use strict';

  var ART = (window.ART = window.ART || {});
  /* zone files load before app.js, so the namespace they write into has to
     exist already. app.js re-asserts this; both are harmless. */
  ART.zones = ART.zones || {};

  /* ---------------------------------------------------------------- dates -- */
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_MS = 86400000;

  function parseISO(iso) {
    var p = String(iso).slice(0, 10).split('-');
    return new Date(Date.UTC(+p[0], (+p[1]) - 1, +p[2]));
  }
  function toISO(d) {
    var m = d.getUTCMonth() + 1;
    var day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(iso, n) {
    return toISO(new Date(parseISO(iso).getTime() + (n || 0) * DAY_MS));
  }
  function diffDays(aIso, bIso) {
    return Math.round((parseISO(bIso).getTime() - parseISO(aIso).getTime()) / DAY_MS);
  }
  function dow(iso) { return parseISO(iso).getUTCDay(); }
  /* Monday of the week that contains iso. */
  function weekStart(iso) {
    var d = dow(iso);
    return addDays(iso, d === 0 ? -6 : 1 - d);
  }
  function md(iso) {
    var p = String(iso).slice(0, 10).split('-');
    return (+p[1]) + '/' + (+p[2]);
  }

  /* ------------------------------------------------------------------ ui -- */
  var GLYPH = { done: '✓', held: '=', skipped: '–', reaction: '!', planned: '' };
  var STATUS_LABEL = {
    done: 'Done', held: 'Held', skipped: 'Skipped', reaction: 'Reaction', planned: 'Planned'
  };
  var VOID_TAGS = { br: 1, hr: 1, img: 1, input: 1, use: 1, path: 1, circle: 1, rect: 1, line: 1, ellipse: 1, polygon: 1, polyline: 1, stop: 1 };

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cls() {
    var out = [];
    function walk(v) {
      if (!v) return;
      if (typeof v === 'string' || typeof v === 'number') { out.push(String(v)); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (typeof v === 'object') {
        Object.keys(v).forEach(function (k) { if (v[k]) out.push(k); });
      }
    }
    for (var i = 0; i < arguments.length; i++) walk(arguments[i]);
    var seen = {}, res = [];
    out.forEach(function (t) {
      t.split(/\s+/).forEach(function (w) {
        if (w && !seen[w]) { seen[w] = 1; res.push(w); }
      });
    });
    return res.join(' ');
  }

  /* One rendered time format for the whole canvas: '16:30' -> '4:30pm'. The
     24-hour string stays the stored value — it is what <time datetime> and an
     <input type="time"> take — but no surface ever prints it raw, or the same
     dose reads two ways one zone apart. */
  function clock(t) {
    var parts = String(t || '').split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    if (isNaN(h)) return '—';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m + (h >= 12 ? 'pm' : 'am');
  }

  /* The same instant in a 56px fixed column. the reference app's timeline prints '3:39p'
     and so does the HOME tally — it is the only format that fits a log row
     without the time column setting its own width. One implementation, so
     '4:08pm' and '4:08p' can never disagree about the minute. */
  function clockTiny(t) {
    var parts = String(t || '').split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    if (isNaN(h)) return '—';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m + (h >= 12 ? 'p' : 'a');
  }
  /* '16:08' -> '4:08'. The device status bar, which carries no suffix. */
  function clockShort(t) {
    var parts = String(t || '').split(':');
    var h = parseInt(parts[0], 10);
    if (isNaN(h)) return '—';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + (parts[1] || '00');
  }

  /* '16:08' -> 968. -1 when there is no clock on the row at all, which is how
     an OTHER item reads: it has no prescribed time and must never be sorted,
     filtered or rendered as though it did. */
  function minutesOf(t) {
    var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : -1;
  }
  function fromMinutes(min) {
    var v = Math.max(0, Math.min(23 * 60 + 59, Math.round(min || 0)));
    return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);
  }
  function nowMin() { return minutesOf(store.state.now); }

  function dayLabel(iso) { return DOW[dow(iso)] + ' ' + md(iso); }
  function dayShort(iso) { return DOW[dow(iso)]; }

  function relDay(iso, today) {
    var t = today || (ART.store && ART.store.state.today);
    var n = diffDays(t, iso);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n > 1 && n <= 6) return 'In ' + n + ' days';
    if (n < -1 && n >= -6) return n * -1 + ' days ago';
    return dayLabel(iso);
  }

  function pct(n) {
    if (n === null || n === undefined || n !== n) return '—';
    var v = +n;
    if (v > 0 && v <= 1) v = v * 100;
    return Math.round(v) + '%';
  }

  function weekDates(startIso) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(startIso, i));
    return out;
  }

  /* A tiny SVG/markup builder. Returns a STRING.
     attrs: null/undefined/false are dropped; true renders a bare attribute. */
  function svg(tag, attrs, children) {
    var a = '';
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (v === true) { a += ' ' + k; return; }
        if (typeof v === 'number') v = Math.round(v * 1000) / 1000;
        a += ' ' + k + '="' + esc(v) + '"';
      });
    }
    var inner = '';
    (function walk(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(walk); return; }
      if (typeof c === 'object' && c.outerHTML) { inner += c.outerHTML; return; }
      inner += String(c);
    })(children);
    if (!inner && VOID_TAGS[tag]) return '<' + tag + a + '/>';
    return '<' + tag + a + '>' + inner + '</' + tag + '>';
  }

  /* Preserve focus, caret and scroll across an innerHTML replace.
     Keyed by element id — anything that needs to survive a re-render must
     carry a stable id (SPEC §14: every id is prefixed with its zone key). */
  function keepFocus(root, fn) {
    if (!root || typeof fn !== 'function') return fn ? fn() : undefined;

    var active = document.activeElement;
    var saved = null;
    if (active && active !== document.body && active.id && root.contains(active)) {
      saved = { id: active.id, start: null, end: null, dir: null };
      try {
        if ('selectionStart' in active && active.selectionStart !== null) {
          saved.start = active.selectionStart;
          saved.end = active.selectionEnd;
          saved.dir = active.selectionDirection;
        }
      } catch (e) { /* number/time inputs throw on selectionStart */ }
    }

    var scrolls = [];
    if (root.scrollTop || root.scrollLeft) scrolls.push([root, root.scrollTop, root.scrollLeft]);
    var kids = root.querySelectorAll('[id]');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].scrollTop || kids[i].scrollLeft) {
        scrolls.push([kids[i].id, kids[i].scrollTop, kids[i].scrollLeft]);
      }
    }

    var out = fn();

    scrolls.forEach(function (s) {
      var el = typeof s[0] === 'string' ? root.querySelector('[id="' + s[0] + '"]') : s[0];
      if (el) { el.scrollTop = s[1]; el.scrollLeft = s[2]; }
    });

    if (saved) {
      var el2 = root.querySelector('[id="' + saved.id + '"]') || document.getElementById(saved.id);
      if (el2 && el2 !== document.activeElement) {
        try { el2.focus({ preventScroll: true }); } catch (e2) { try { el2.focus(); } catch (e3) {} }
      }
      if (el2 && saved.start !== null && typeof el2.setSelectionRange === 'function') {
        try { el2.setSelectionRange(saved.start, saved.end, saved.dir || 'none'); } catch (e4) {}
      }
    }
    return out;
  }

  ART.ui = {
    esc: esc,
    cls: cls,
    dayLabel: dayLabel,
    clock: clock,
    clockTiny: clockTiny,
    clockShort: clockShort,
    minutesOf: minutesOf,
    fromMinutes: fromMinutes,
    nowMin: nowMin,
    dayShort: dayShort,
    relDay: relDay,
    pct: pct,
    addDays: addDays,
    weekDates: weekDates,
    keepFocus: keepFocus,
    glyph: function (status) { return GLYPH[status] !== undefined ? GLYPH[status] : ''; },
    statusLabel: function (status) { return STATUS_LABEL[status] || 'Planned'; },
    svg: svg,
    /* additive helpers shared by data.js / metrics.js; zones may use them */
    diffDays: diffDays,
    weekStart: weekStart,
    md: md
  };

  /* --------------------------------------------------------------- store -- */
  var INITIAL = {
    focusClientId: 'c-mara',
    familyDoseId: null,
    familyRightPanel: 'week',
    units: 'household',
    ownerRange: 28,
    /* the Meals phone's food filter: 'all' or a protocol id ('egg') */
    mealFilter: 'all',
    /* the selected row in the phase-duration chart, as ART.metrics.phaseKey()
       reads it. It opens on the finding rather than on an empty state. */
    phaseKey: 'egg#2',
    today: '2026-10-21',
    /* The wall clock inside every phone. There is no clock in the dataset and
       SPEC §1.9 forbids an argless Date, so "now" is a state value exactly as
       "today" is. 16:08 is the hour the product is actually for: the drops
       were due at 8:05 and are not logged, sesame is due in twenty-two
       minutes, and Monday's spine tap was never written down. */
    now: '16:08',
    /* which day of the week SCHEDULE is showing; null means today */
    scheduleDay: null,
    weekStart: '2026-10-19',
    draft: null,
    drafts: {},
    hints: true,
    toast: null
  };

  function initialState() {
    var s = {};
    Object.keys(INITIAL).forEach(function (k) { s[k] = INITIAL[k]; });
    s.drafts = {};
    return s;
  }

  var listeners = [];
  var toastTimer = null;
  var publishCount = 0;
  var messageCount = 0;

  var store = {
    state: initialState(),
    rev: 0,

    on: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    emit: function (keys) {
      var k = keys && keys.length ? keys : Object.keys(store.state).concat(['db']);
      store.rev++;
      listeners.slice().forEach(function (fn) {
        try { fn(k); } catch (e) {
          if (window.console && console.error) console.error('[ART] listener failed', e);
        }
      });
    },

    set: function (patch) {
      if (!patch) return store.state;
      var prevFocus = store.state.focusClientId;
      var changed = [];
      Object.keys(patch).forEach(function (k) {
        if (store.state[k] !== patch[k]) changed.push(k);
        store.state[k] = patch[k];
      });

      /* Invariant: when the roster selection moves, anything pinned to the
         previous client goes with it. Without this, Publish would commit to
         the client you were looking at a moment ago, and the Prep phone would
         explain another child's dose. */
      if (patch.focusClientId !== undefined && patch.focusClientId !== prevFocus) {
        if (patch.familyDoseId === undefined && store.state.familyDoseId !== null) {
          store.state.familyDoseId = null;
          changed.push('familyDoseId');
        }
        if (store.state.draft && store.state.draft.clientId !== patch.focusClientId) {
          store.state.draft = null;
          if (changed.indexOf('draft') < 0) changed.push('draft');
        }
      }

      if (changed.length) store.emit(changed);
      return store.state;
    },

    /* ------------------------------------------------------------ lookups */
    client: function (id) {
      var cs = (ART.db && ART.db.clients) || [];
      for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
      return null;
    },
    focusClient: function () {
      return store.client(store.state.focusClientId) || (ART.db && ART.db.clients && ART.db.clients[0]) || null;
    },
    protocol: function (id) {
      var ps = (ART.db && ART.db.protocols) || [];
      for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
      return null;
    },
    dose: function (clientId, doseId) {
      var c = store.client(clientId);
      if (!c) return null;
      var days = c.days, isos = Object.keys(days);
      for (var i = 0; i < isos.length; i++) {
        var list = days[isos[i]];
        for (var j = 0; j < list.length; j++) if (list[j].id === doseId) return list[j];
      }
      return null;
    },

    /* Every row in client.days[iso] — a food dose, the daily drops, the
       spine tap — is addressed the same way, because they are one table
       (day_entries.item_type) and one status vocabulary. entry/logEntry/
       undoEntry are the honest names; dose/logDose/undoLog are the older
       ones and resolve to the same rows. */
    entry: function (clientId, entryId) { return store.dose(clientId, entryId); },
    logEntry: function (clientId, entryId, patch) {
      return store.logDose(clientId, entryId, patch);
    },
    undoEntry: function (clientId, entryId) { return store.undoLog(clientId, entryId); },

    /* the ProtocolItem records behind the drops and the tap */
    protocolItems: function (clientId) {
      var id = clientId || store.state.focusClientId;
      return ((ART.db && ART.db.protocolItems) || []).filter(function (it) {
        return it.clientId === id;
      });
    },

    mealIdea: function (id) {
      var list = (ART.db && ART.db.mealIdeas) || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },

    /* SPEC §7.7 — saving an idea on the Meals phone is what makes it show up
       in Community as `Saved`. A toggle, because that is what a UI needs. */
    saveIdea: function (ideaId, clientId) {
      var idea = store.mealIdea(ideaId);
      if (!idea) return null;
      var cid = clientId || store.state.focusClientId;
      if (!idea.savedByClientIds) idea.savedByClientIds = [];
      var at = idea.savedByClientIds.indexOf(cid);
      if (at >= 0) {
        idea.savedByClientIds.splice(at, 1);
        idea.savedCount = Math.max(0, (idea.savedCount || 0) - 1);
      } else {
        idea.savedByClientIds.push(cid);
        idea.savedCount = (idea.savedCount || 0) + 1;
      }
      store.emit(['db', 'ideas']);
      return at < 0;
    },

    setIdeaSaved: function (ideaId, on, clientId) {
      var idea = store.mealIdea(ideaId);
      if (!idea) return null;
      var cid = clientId || store.state.focusClientId;
      var has = (idea.savedByClientIds || []).indexOf(cid) >= 0;
      if (!!on === has) return has;
      return store.saveIdea(ideaId, cid);
    },

    /* The day SCHEDULE is showing. A week strip that moves the selection is
       the only navigation on that screen; everything else reads this. */
    scheduleDate: function () {
      return store.state.scheduleDay || store.state.today;
    },
    setScheduleDay: function (iso) {
      var d = iso && iso !== store.state.today ? String(iso).slice(0, 10) : null;
      return store.set({ scheduleDay: d });
    },

    /* ------------------------------------------------------------ actions */
    /* Logging stamps loggedAt, because the HOME tally is a history of when
       things actually happened and an OTHER item has no prescribed clock to
       fall back on. A hand-logged row is stamped with the wall clock, which
       is state.now and never a real Date. */
    logDose: function (clientId, doseId, patch) {
      var d = store.dose(clientId, doseId);
      if (!d) return null;
      patch = patch || {};
      d.status = patch.status || 'done';
      d.reason = patch.reason !== undefined ? patch.reason : null;
      d.note = patch.note !== undefined ? patch.note : (d.note || null);
      d.loggedAt = patch.at || store.state.now;
      store.emit(['db', 'log']);
      return d;
    },

    undoLog: function (clientId, doseId) {
      var d = store.dose(clientId, doseId);
      if (!d) return null;
      d.status = 'planned';
      d.reason = null;
      d.note = null;
      d.loggedAt = null;
      store.emit(['db', 'log']);
      return d;
    },

    /* Pre-fill the week AFTER the one currently published, continuing from
       where the child actually is today. Repeatable: each publish moves
       planPublishedForWeek on, so the next startDraft builds the next week. */
    startDraft: function (clientId) {
      var c = store.client(clientId || store.state.focusClientId);
      if (!c) return null;
      var cp = null;
      for (var i = 0; i < c.protocols.length; i++) {
        if (c.protocols[i].state !== 'maintenance') { cp = c.protocols[i]; break; }
      }
      if (!cp) cp = c.protocols[0];
      if (!cp) return null;

      var proto = store.protocol(cp.protocolId);
      var phase = proto.phases[Math.min(cp.phaseIdx, proto.phases.length - 1)];
      var start = addDays(c.planPublishedForWeek || store.state.weekStart, 7);
      var dates = weekDates(start);
      /* a child past the last phase has no ramp left to step: the week is the
         maintenance dose, seven times. Zones read draft.maintenance and render
         a fixed .dose instead of a .stepper. */
      var maint = cp.state === 'maintenance';

      var stepIdx = maint ? phase.steps.length - 1 : cp.stepIdx;
      var held = 0;
      var days = dates.map(function (iso) {
        var row = {
          dateISO: iso,
          stepIdx: Math.min(stepIdx, phase.steps.length - 1),
          timing: cp.timing || '16:30',
          waitLevel: cp.waitLevel === undefined ? 2 : cp.waitLevel
        };
        if (!maint) {
          held++;
          if (held >= (phase.steps[Math.min(stepIdx, phase.steps.length - 1)].days || 1)) {
            held = 0;
            if (stepIdx < phase.steps.length - 1) stepIdx++;
          }
        }
        return row;
      });

      var conditions = (proto.conditions || []).map(function (c2) {
        return { trigger: c2.trigger, action: c2.action, on: true };
      });

      var draft = {
        clientId: c.id,
        protocolId: cp.protocolId,
        weekStart: start,
        days: days,
        conditions: conditions,
        maintenance: maint,
        dirty: false,
        publishedAt: null
      };
      store.set({ draft: draft });
      return draft;
    },

    draftStep: function (dayIndex, dir) {
      var d = store.state.draft;
      if (!d || !d.days[dayIndex]) return null;
      if (d.maintenance) return d;              /* no ramp left to move along */
      var proto = store.protocol(d.protocolId);
      var c = store.client(d.clientId);
      var cp = clientProtocol(c, d.protocolId);
      var phase = proto.phases[Math.min(cp ? cp.phaseIdx : 0, proto.phases.length - 1)];
      var next = d.days[dayIndex].stepIdx + (dir > 0 ? 1 : -1);
      next = Math.max(0, Math.min(phase.steps.length - 1, next));
      if (next === d.days[dayIndex].stepIdx) return d;
      d.days[dayIndex].stepIdx = next;
      d.dirty = true;
      store.emit(['draft']);
      return d;
    },

    draftSet: function (dayIndex, patch) {
      var d = store.state.draft;
      if (!d || !d.days[dayIndex] || !patch) return null;
      var row = d.days[dayIndex], touched = false;
      ['timing', 'waitLevel', 'stepIdx'].forEach(function (k) {
        if (patch[k] !== undefined && row[k] !== patch[k]) { row[k] = patch[k]; touched = true; }
      });
      if (!touched) return d;
      d.dirty = true;
      store.emit(['draft']);
      return d;
    },

    draftFill: function (fromDayIndex) {
      var d = store.state.draft;
      if (!d || !d.days[fromDayIndex]) return null;
      var src = d.days[fromDayIndex];
      for (var i = fromDayIndex + 1; i < d.days.length; i++) {
        d.days[i].stepIdx = src.stepIdx;
        d.days[i].timing = src.timing;
        d.days[i].waitLevel = src.waitLevel;
      }
      d.dirty = true;
      store.emit(['draft']);
      return d;
    },

    draftCondition: function (i, on) {
      var d = store.state.draft;
      if (!d || !d.conditions[i]) return null;
      d.conditions[i].on = !!on;
      d.dirty = true;
      store.emit(['draft']);
      return d;
    },

    /* The hero. Commits the draft week onto the client, carries every other
       active protocol forward across the same seven days so the phone shows a
       complete week, advances the protocol position, and leaves the draft
       marked published so the builder can offer "Build next week again". */
    publishPlan: function () {
      var d = store.state.draft;
      if (!d) return null;
      var c = store.client(d.clientId);
      if (!c) return null;

      var proto = store.protocol(d.protocolId);
      var cp = clientProtocol(c, d.protocolId);
      var phaseIdx = Math.min(cp ? cp.phaseIdx : 0, proto.phases.length - 1);
      var dates = d.days.map(function (r) { return r.dateISO; });
      /* Re-publishing the SAME week (tweak a dose, publish again) must not
         advance "week N of M" — only a week that actually moves does. */
      var advanced = c.planPublishedForWeek !== d.weekStart;

      /* clear the week for every active protocol, then rewrite it */
      dates.forEach(function (iso) {
        var list = c.days[iso] || [];
        c.days[iso] = list.filter(function (dose) {
          return !hasProtocol(c, dose.protocolId);
        });
      });

      d.days.forEach(function (row) {
        pushDoses(c, row.dateISO, d.protocolId, phaseIdx, row.stepIdx, {
          timing: row.timing,
          waitLevel: row.waitLevel,
          status: 'planned',
          isMaintenance: !!d.maintenance
        });
      });

      c.protocols.forEach(function (other) {
        if (other.protocolId === d.protocolId) return;
        var op = store.protocol(other.protocolId);
        if (!op) return;
        var maint = other.state === 'maintenance';
        var oPhase = Math.min(other.phaseIdx, op.phases.length - 1);
        var oStep = other.stepIdx;
        var atStep = 0;
        dates.forEach(function (iso) {
          pushDoses(c, iso, other.protocolId, oPhase, oStep, {
            timing: other.timing || '17:30',
            waitLevel: other.waitLevel === undefined ? 1 : other.waitLevel,
            status: 'planned',
            isMaintenance: maint
          });
          if (!maint) {
            var steps = op.phases[oPhase].steps;
            atStep++;
            if (atStep >= (steps[oStep].days || 1)) {
              atStep = 0;
              if (oStep < steps.length - 1) oStep++;
            }
          }
        });
        /* the carried protocol keeps the position it reached, or the next
           published week restarts its ramp from the same step */
        if (!maint) {
          other.stepIdx = oStep;
          if (advanced) other.week = Math.min(other.week + 1, other.of + 4);
        }
      });

      /* the drops and the tap are prescribed independently of any food, so a
         week published past the seeded horizon still has to carry them —
         otherwise the published week would quietly stop being the whole day */
      if (typeof ART.ensureItems === 'function') {
        ART.ensureItems(c, dates[0], dates[dates.length - 1]);
      }

      dates.forEach(function (iso) {
        c.days[iso].sort(ART.entryOrder || function (a, b) {
          return String(a.timing).localeCompare(String(b.timing));
        });
      });

      /* the protocol moves on: last planned step becomes the live position */
      if (cp) {
        cp.stepIdx = d.days[d.days.length - 1].stepIdx;
        if (advanced) cp.week = Math.min(cp.week + 1, cp.of + 4);
        cp.heldSince = null;
        if (cp.state === 'held') cp.state = 'ramping';
      }
      c.planPublishedForWeek = d.weekStart;

      publishCount++;
      d.publishedAt = store.state.today + 'T' + (16 + Math.floor((publishCount - 1) / 20)) + ':' +
        pad2((4 + (publishCount - 1) * 3) % 60);
      d.dirty = false;

      store.emit(['db', 'draft', 'published']);
      return c;
    },

    sendMessage: function (clientId, from, body) {
      var c = store.client(clientId);
      if (!c || !body) return null;
      messageCount++;
      var m = {
        at: store.state.today + 'T' + pad2(9 + Math.floor(messageCount / 6)) + ':' + pad2((messageCount * 7) % 60),
        from: from || 'family',
        body: String(body),
        anchorDoseId: null
      };
      c.messages.push(m);
      store.emit(['db', 'messages']);
      return m;
    },

    toast: function (text, tone) {
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      store.set({ toast: text ? { text: String(text), tone: tone || 'info' } : null });
      if (text) {
        toastTimer = setTimeout(function () {
          toastTimer = null;
          store.set({ toast: null });
        }, 3400);
      }
      return store.state.toast;
    },

    reset: function () {
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      publishCount = 0;
      messageCount = 0;
      var fresh = ART.seed();
      var db = ART.db || (ART.db = {});
      Object.keys(db).forEach(function (k) { delete db[k]; });
      Object.keys(fresh).forEach(function (k) { db[k] = fresh[k]; });
      store.state = initialState();
      store.emit(Object.keys(store.state).concat(['db', 'reset']));
      return store.state;
    }
  };

  /* ------------------------------------------------------------- private -- */
  function pad2(n) { n = Math.abs(Math.round(n)); return (n < 10 ? '0' : '') + n; }

  function clientProtocol(client, protocolId) {
    if (!client) return null;
    for (var i = 0; i < client.protocols.length; i++) {
      if (client.protocols[i].protocolId === protocolId) return client.protocols[i];
    }
    return null;
  }
  function hasProtocol(client, protocolId) {
    return !!clientProtocol(client, protocolId);
  }
  function pushDose(client, iso, dose) {
    if (!client.days[iso]) client.days[iso] = [];
    client.days[iso].push(dose);
  }
  /* A maintenance prescription can be more than one serving a day — egg is
     "1 serving baked + 1 serving other egg foods" — and each serving is its
     own tickable row, so one published day lays down one entry per part.
     ART.makeDoseSet owns that split; publishing just pushes what it returns,
     and a single-part protocol still produces exactly one row. */
  function pushDoses(client, iso, protocolId, phaseIdx, stepIdx, opts) {
    var made = typeof ART.makeDoseSet === 'function'
      ? ART.makeDoseSet(client, protocolId, phaseIdx, stepIdx, iso, opts)
      : [ART.makeDose(client, protocolId, phaseIdx, stepIdx, iso, opts)];
    for (var i = 0; i < made.length; i++) pushDose(client, iso, made[i]);
    return made;
  }

  ART.store = store;
})();
