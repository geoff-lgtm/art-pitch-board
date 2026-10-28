/* ===========================================================================
   A.R.T. pitch canvas — js/metrics.js         owner: data            SPEC §6
   ---------------------------------------------------------------------------
   ONE definition of adherence, used by every surface on the canvas:

       adherence = entries logged ÷ entries planned, over dates <= today,
       across EVERY prescribed thing — the food doses, the morning
       alka-seltzer tablet, the daily drops and the spine tap, and the
       maintenance servings as well.
       "Logged" is any status other than 'planned'. Held and skipped count as
       logged — the failure mode this product fixes is NOT KNOWING, not a held
       dose. A day with the food logged and the drops missing is NOT a logged
       day, and every surface that quotes the figure has to say so.

   Everything below derives from that same pass over ART.db. Nothing is typed
   twice, and no fact is allowed to render two different ways: pct is always
   returned already rounded, so two callers can never print 88% and 87.6%.
   weeksToFreedom() and timeToFreedom() are literally one computation under
   two names, for the same reason.

   Results are memoised and the cache is dropped whenever the store reports a
   dataset change, so Log / Publish / Reset all recompute honestly.

   DESIGN_PASS §4/§5 — HOME and SCHEDULE read ONE classification
   ---------------------------------------------------------------------------
   daySplit(client, iso?)     -> {core[], other[], all[], and the counts for
                                 each: coreLogged/corePlanned/corePct,
                                 otherLogged/otherPlanned/otherPct, plus the
                                 day's own logged/planned/pct/complete}
                                 CORE is timed and strict (the tablet, the
                                 drops, the dose being treated, the tap);
                                 OTHER must happen today but the hour floats
                                 (the maintenance servings). Entries are the
                                 LIVE objects — tick with ART.store.logEntry.
   upNext(client, iso?)       -> the next unlogged CORE item by the clock, or
                                 null. Carries {label, detail, at, overdue,
                                 minutesUntil, index, count, logged, planned,
                                 pct, wait} — everything the card prints,
                                 read off the same daySplit SCHEDULE renders.
   loggedFeed(client, limit?) -> the running tally: what has actually been
                                 logged, newest first, ACROSS DAYS. Each row
                                 {at, dateISO, dayLabel, kind, band, label,
                                 detail, status, entry}. `at` is loggedAt, not
                                 timing — it is a history, and an OTHER item
                                 has no prescribed clock. dayLabel is already
                                 'Today' | 'Yesterday' | 'Mon 10/19'.
   nextUnlogged(client, what, iso?) -> what HOME's five buttons act on:
                                 'dose' the scheduled CORE dose · 'drops' ·
                                 'tapping' · 'food' a maintenance serving ·
                                 also 'alka', 'core', 'other', 'any'. A CORE
                                 item nobody logged carries forward six days,
                                 which is why `Taps` is live on a day with no
                                 tap due. A missed food dose does not carry.

   SPEC §5d additions
   ---------------------------------------------------------------------------
   byItemType(days)          -> [{itemType, label, logged, planned, pct}]
   weekMeter(client, start?)  -> the Today meter: {logged, planned, pct,
                                 core{}, other{},
                                 byType{dose,alka,drops,tapping}, days[7]
                                 (each with core{} / other{} / isToday),
                                 daysComplete, daysElapsed, gaps[]}
   dayPlan(client, iso)       -> {entries, doses, items, logged, planned,
                                 complete, outstanding[], nextItems[]}
   phaseDuration(filter)      -> one row per phase (see SPEC §5d) + repeatPct
   overrunRanked(limit)       -> the same rows, worst overrun first
   overrunByAge(phaseKey)     -> the same rows cut by age band
   repeatRate(phaseKey, band?)-> {repeatDays, totalDays, n, pct}
   timeToFreedom(filter)      -> weeksToFreedom's shape, from phase runs
   clientPhaseRuns(client)    -> the micro view, each row carrying
                                 practiceMedian / bandMedian / vsPractice
   reviewQueue()              -> meal ideas awaiting review, oldest first
   ideaFlow() mealIdeas(f) maintenanceAllergens(c) isSaved(idea, c)
   phaseKey(k)                -> normalises 'egg#2' | 'egg#French toast' |
                                 {protocolId, phaseIdx} | a row
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var addDays = ui.addDays;
  var diffDays = ui.diffDays;

  var GANTT_WEEKS = 16;
  var GANTT_NOW = 14;          /* the current calendar week sits at column 14 */

  /* ----------------------------------------------------------------- memo -- */
  var cache = {};
  ART.store.on(function (keys) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'db' || k === 'log' || k === 'published' || k === 'messages' || k === 'reset') {
        cache = {};
        return;
      }
    }
  });
  function memo(key, fn) {
    if (!(key in cache)) cache[key] = fn();
    var v = cache[key];
    return Array.isArray(v) ? v.slice() : v;
  }

  /* -------------------------------------------------------------- helpers -- */
  function today() { return ART.store.state.today; }
  function range() { return ART.store.state.ownerRange || 28; }
  function db() { return ART.db || {}; }
  function allClients() { return db().clients || []; }
  function activeClients() {
    return allClients().filter(function (c) { return c.status === 'active'; });
  }
  function protoById(id) {
    var ps = db().protocols || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }
  function windowStart(days) { return addDays(today(), -(Math.max(1, days) - 1)); }

  /* Walks [from..to] for each client, clamped to dates that have happened. */
  function eachDose(clients, fromISO, toISO, fn) {
    var t = today();
    var to = toISO || t;
    if (diffDays(t, to) > 0) to = t;
    var span = diffDays(fromISO, to);
    if (span < 0) return;
    for (var ci = 0; ci < clients.length; ci++) {
      var c = clients[ci];
      var days = c.days;
      for (var i = 0; i <= span; i++) {
        var iso = addDays(fromISO, i);
        var list = days[iso];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) fn(list[j], c, iso);
      }
    }
  }
  function doseOf(client, iso, protocolId) {
    var list = client.days[iso];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].protocolId === protocolId) return list[i];
    return null;
  }
  function rate(logged, planned) {
    return planned ? Math.round((logged / planned) * 100) : 0;
  }
  function median(sorted) {
    if (!sorted.length) return 0;
    var m = Math.floor(sorted.length / 2);
    var v = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    return Math.round(v * 10) / 10;
  }

  /* ====================================================== adherence ====== */
  function adherence(clients, fromISO, toISO) {
    var cs = clients || activeClients();
    var logged = 0, planned = 0;
    eachDose(cs, fromISO || windowStart(28), toISO, function (d) {
      planned++;
      if (d.status !== 'planned') logged++;
    });
    return { logged: logged, planned: planned, pct: rate(logged, planned) };
  }

  function clientAdherence(client, days) {
    if (!client) return { logged: 0, planned: 0, pct: 0 };
    var n = days || 7;
    return adherence([client], windowStart(n), today());
  }

  /* ================================================== by practitioner ==== */
  function byPractitioner(days) {
    var n = days || range();
    return memo('byPract:' + n, function () {
      var centres = db().centres || [];
      function centreName(id) {
        for (var i = 0; i < centres.length; i++) if (centres[i].id === id) return centres[i].name;
        return '—';
      }
      var rows = (db().practitioners || []).map(function (p) {
        var cs = activeClients().filter(function (c) { return c.practitionerId === p.id; });
        var a = adherence(cs, windowStart(n), today());
        return {
          id: p.id,
          name: p.name,
          kind: p.kind,
          clients: cs.length,
          pct: a.pct,
          logged: a.logged,
          planned: a.planned,
          centreId: p.centreId,
          centre: centreName(p.centreId),
          capacity: p.capacity,
          openSlots: Math.max(0, (p.capacity || 0) - cs.length)
        };
      });
      rows.sort(function (a, b) { return b.pct - a.pct || a.name.localeCompare(b.name); });
      return rows;
    });
  }

  /* =============================================== weeks to freedom ====== */
  /* ONE computation, two names. weeksToFreedom() is what the owner dashboard
     already calls; timeToFreedom() is the SPEC §5d name and takes a filter.
     Both read the completed journeys built from phase runs, so the figure on
     the KPI tile and the figure the phase chart implies are the same figure. */
  function weeksToFreedom(days) {
    return timeToFreedom({ days: days || range() });
  }

  /* =================================================== holds by week ===== */
  /* Protocol weeks 1..16. Nothing here knows that weeks 3-5 are special —
     the spike has to fall out of the data, which is the whole point of the
     owner's "where protocols stall" panel. */
  function holdsByWeek(days) {
    var n = days || range();
    return memo('holds:' + n, function () {
      var rows = [];
      var byWeek = {};
      for (var w = 1; w <= GANTT_WEEKS; w++) {
        byWeek[w] = { week: w, holds: 0, planned: 0, rate: 0 };
        rows.push(byWeek[w]);
      }
      eachDose(activeClients(), windowStart(n), today(), function (d) {
        var b = byWeek[d.week];
        if (!b) return;
        b.planned++;
        if (d.status === 'held') b.holds++;
      });
      rows.forEach(function (b) { b.rate = b.planned ? b.holds / b.planned : 0; });
      return rows;
    });
  }

  /* ================================================ adherence trend ====== */
  function adherenceTrend(days) {
    var n = days || range();
    return memo('trend:' + n, function () {
      var cs = activeClients();
      var from = windowStart(n);
      var out = [];
      for (var i = 0; i < n; i++) {
        var iso = addDays(from, i);
        var logged = 0, planned = 0;
        for (var ci = 0; ci < cs.length; ci++) {
          var list = cs[ci].days[iso];
          if (!list) continue;
          for (var j = 0; j < list.length; j++) {
            planned++;
            if (list[j].status !== 'planned') logged++;
          }
        }
        out.push({ dateISO: iso, pct: rate(logged, planned), logged: logged, planned: planned });
      }
      return out;
    });
  }

  /* ===================================================== phase stalls ==== */
  function phaseStalls(days) {
    var n = days || range();
    return memo('stalls:' + n, function () {
      var groups = {};
      eachDose(activeClients(), windowStart(n), today(), function (d) {
        if (d.isMaintenance) return;
        var key = d.protocolId + '#' + d.phaseIdx;
        var g = groups[key];
        if (!g) {
          var proto = protoById(d.protocolId);
          if (!proto) return;
          var phase = proto.phases[Math.min(d.phaseIdx, proto.phases.length - 1)];
          g = groups[key] = {
            protocolId: d.protocolId,
            allergen: proto.allergen,
            phaseLabel: phase.label,
            holds: 0,
            n: 0,
            holdRate: 0
          };
        }
        g.n++;
        if (d.status === 'held') g.holds++;
      });
      var rows = Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return g.n >= 20; });
      rows.forEach(function (g) { g.holdRate = g.n ? g.holds / g.n : 0; });
      rows.sort(function (a, b) { return b.holdRate - a.holdRate || b.n - a.n; });
      return rows;
    });
  }

  /* ========================================================= attention === */
  function recentReaction(client, protocolId, days) {
    var t = today();
    for (var k = 0; k < days; k++) {
      var d = doseOf(client, addDays(t, -k), protocolId);
      if (d && d.status === 'reaction') return true;
    }
    return false;
  }

  function reasonWord(r) {
    if (r === 'cold' || r === 'illness') return 'illness';
    if (r === 'vaccine') return 'vaccine';
    if (r === 'travel') return 'travel';
    if (r === 'refused') return 'refused';
    return null;
  }

  /* rank 0 is the most urgent; it drives the roster sort, and the four real
     attention states all sort ahead of 'On track'. */
  function attention(client) {
    if (!client) return { rank: 4, label: 'On track', tone: 'ok' };
    if (client.status !== 'active') return { rank: 6, label: 'Paused', tone: 'ok' };
    var t = today();
    var k, iso, list, i, cp, d;

    /* 0 — a reaction in the last three days */
    for (k = 0; k < 3; k++) {
      iso = addDays(t, -k);
      list = client.days[iso] || [];
      for (i = 0; i < list.length; i++) {
        if (list[i].status === 'reaction') {
          return { rank: 0, label: 'Reaction ' + ui.dayShort(iso), tone: 'react' };
        }
      }
    }

    /* 1 — held three days or more (the booklet's own escalation rule) */
    var heldRun = 0, heldReason = null;
    for (var pi = 0; pi < client.protocols.length; pi++) {
      cp = client.protocols[pi];
      var run = 0, reason = null;
      for (k = 0; k < 21; k++) {
        iso = addDays(t, -k);
        d = doseOf(client, iso, cp.protocolId);
        if (!d) { if (run) break; else continue; }
        if (d.status === 'planned') { if (k === 0) continue; break; }
        if (d.status === 'held') { run++; if (!reason) reason = d.reason; continue; }
        break;
      }
      if (run > heldRun) { heldRun = run; heldReason = reason; }
    }
    if (heldRun >= 3) {
      var w = reasonWord(heldReason);
      return {
        rank: 1,
        label: 'Held ' + heldRun + ' days' + (w ? ' — ' + w : ''),
        tone: 'hold'
      };
    }

    /* 2 — days nobody logged. Today is excluded: it has not finished yet. */
    var miss = 0;
    for (k = 1; k <= 14; k++) {
      iso = addDays(t, -k);
      list = client.days[iso];
      if (!list || !list.length) break;
      var allPlanned = true;
      for (i = 0; i < list.length; i++) {
        if (list[i].status !== 'planned') { allPlanned = false; break; }
      }
      if (!allPlanned) break;
      miss++;
    }
    if (miss >= 2) return { rank: 2, label: miss + ' days unlogged', tone: 'miss' };

    /* 3 — clean run at the current step, so the step can move. A protocol that
       reacted in the last fortnight is excluded: the booklet's rule is that it
       holds until the practitioner says otherwise. */
    for (var qi = 0; qi < client.protocols.length; qi++) {
      cp = client.protocols[qi];
      if (cp.state !== 'ramping') continue;
      if (recentReaction(client, cp.protocolId, 14)) continue;
      var proto = protoById(cp.protocolId);
      if (!proto) continue;
      var phase = proto.phases[Math.min(cp.phaseIdx, proto.phases.length - 1)];
      if (cp.stepIdx >= phase.steps.length - 1) continue;
      var need = phase.steps[cp.stepIdx].days || 1;
      var streak = 0;
      for (k = 0; k < 14; k++) {
        iso = addDays(t, -k);
        d = doseOf(client, iso, cp.protocolId);
        if (!d) continue;
        if (d.status === 'planned') { if (k === 0) continue; break; }
        if (d.status === 'done' && d.stepIdx === cp.stepIdx) { streak++; continue; }
        break;
      }
      if (streak >= need) return { rank: 3, label: 'Ready to advance', tone: 'advance' };
    }

    return { rank: 4, label: 'On track', tone: 'ok' };
  }

  /* ============================================================ counts === */
  function counts() {
    return memo('counts', function () {
      var all = allClients();
      var active = all.filter(function (c) { return c.status === 'active'; });
      return {
        activeClients: active.length,
        paused: all.length - active.length,
        graduated: (db().graduates || []).length,
        waitlist: db().waitlist || 0,
        practitioners: (db().practitioners || []).length,
        centres: (db().centres || []).length,
        protocolsPublished: (db().protocols || []).filter(function (p) {
          return p.state === 'published';
        }).length
      };
    });
  }

  /* ========================================================== timeline === */
  /* A SHARED 16-week calendar axis, so concurrency is actually visible: the
     current week is column 14, columns 15-16 are the published plan ahead.
     Weeks are honest about ramping, maintenance and held. */
  function weekState(client, protocolId, weekStartISO) {
    var holds = 0, dones = 0, any = 0;
    for (var i = 0; i < 7; i++) {
      var d = doseOf(client, addDays(weekStartISO, i), protocolId);
      if (!d) continue;
      any++;
      if (d.status === 'held') holds++;
      else if (d.status === 'done') dones++;
    }
    if (!any) return 'none';
    if (holds > 0 && holds >= dones) return 'held';
    return 'active';
  }

  function timeline(client) {
    if (!client) return [];
    var base = ART.store.state.weekStart;
    var out = [];
    (client.protocols || []).forEach(function (cp) {
      var proto = protoById(cp.protocolId);
      if (!proto) return;
      var startW = GANTT_NOW - (cp.week - 1);
      var rampDays = proto.phases.reduce(function (s, p) { return s + p.days; }, 0);
      var maintW = startW + Math.ceil(rampDays / 7);
      if (cp.state === 'maintenance') maintW = Math.min(maintW, GANTT_NOW);

      var states = [];
      for (var w = 1; w <= GANTT_WEEKS; w++) {
        if (w < startW) { states.push('none'); continue; }
        var ws = addDays(base, (w - GANTT_NOW) * 7);
        if (weekState(client, cp.protocolId, ws) === 'held') { states.push('held'); continue; }
        states.push(w >= maintW ? 'maintenance' : 'ramping');
      }

      var segments = [];
      for (var i = 0; i < states.length; i++) {
        var last = segments[segments.length - 1];
        if (last && last.state === states[i]) last.span++;
        else segments.push({ week: i + 1, span: 1, state: states[i] });
      }
      out.push({
        protocolId: cp.protocolId,
        allergen: proto.allergen,
        segments: segments,
        weeks: GANTT_WEEKS,
        nowWeek: GANTT_NOW,
        startWeek: Math.max(1, startW)
      });
    });
    return out;
  }

  /* ================================================= the day, in full ==== */
  /* Adherence spans doses, drops and the spine tap because client.days holds
     all three — adherence() above never needed to know. These three read the
     mix back out, for the surfaces that have to SAY so. */

  var TYPE_LABEL = {
    dose: 'Food doses', alka: 'Alka-Seltzer', drops: 'Daily drops', tapping: 'Spine tap'
  };
  var TYPE_ORDER = ['dose', 'alka', 'drops', 'tapping'];

  function byItemType(days) {
    var n = days || range();
    return memo('byType:' + n, function () {
      var acc = {};
      TYPE_ORDER.forEach(function (k) {
        acc[k] = { itemType: k, label: TYPE_LABEL[k], logged: 0, planned: 0, pct: 0 };
      });
      eachDose(activeClients(), windowStart(n), today(), function (d) {
        var b = acc[d.itemType || 'dose'];
        if (!b) return;
        b.planned++;
        if (d.status !== 'planned') b.logged++;
      });
      return TYPE_ORDER.map(function (k) {
        acc[k].pct = rate(acc[k].logged, acc[k].planned);
        return acc[k];
      }).filter(function (r) { return r.planned > 0; });
    });
  }

  /* The Today screen's meter. A day counts as logged only when every
     prescribed thing on it is logged — the food AND the tablet AND the drops
     AND the tap. Each day also carries its CORE and OTHER counts, so
     SCHEDULE's Mon–Sun selector can show the required band's state per day
     without a second pass over the week. */
  function weekMeter(client, weekStartISO) {
    var start = weekStartISO || ART.store.state.weekStart;
    var t = today();
    var out = {
      weekStart: start,
      logged: 0, planned: 0, pct: 0,
      core: { logged: 0, planned: 0, pct: 0 },
      other: { logged: 0, planned: 0, pct: 0 },
      byType: {}, days: [], daysComplete: 0, daysElapsed: 0, gaps: []
    };
    TYPE_ORDER.forEach(function (k) {
      out.byType[k] = { itemType: k, label: TYPE_LABEL[k], logged: 0, planned: 0, pct: 0 };
    });
    if (!client) return out;

    for (var i = 0; i < 7; i++) {
      var iso = addDays(start, i);
      var future = diffDays(t, iso) > 0;
      var list = client.days[iso] || [];
      var day = {
        dateISO: iso, logged: 0, planned: 0, future: future, complete: false,
        isToday: iso === t,
        core: { logged: 0, planned: 0 },
        other: { logged: 0, planned: 0 }
      };
      for (var j = 0; j < list.length; j++) {
        var e = list[j];
        var type = e.itemType || 'dose';
        var band = (e.band === 'other') ? 'other' : 'core';
        var bucket = out.byType[type];
        var done = e.status !== 'planned';
        day.planned++;
        day[band].planned++;
        if (done) { day.logged++; day[band].logged++; }
        if (!future) {
          out.planned++;
          out[band].planned++;
          if (bucket) bucket.planned++;
          if (done) {
            out.logged++;
            out[band].logged++;
            if (bucket) bucket.logged++;
          } else if (type !== 'dose') {
            out.gaps.push({ dateISO: iso, itemType: type, label: e.label || TYPE_LABEL[type] });
          }
        }
      }
      day.complete = day.planned > 0 && day.logged === day.planned;
      if (!future) {
        out.daysElapsed++;
        if (day.complete) out.daysComplete++;
      }
      out.days.push(day);
    }
    out.pct = rate(out.logged, out.planned);
    out.core.pct = rate(out.core.logged, out.core.planned);
    out.other.pct = rate(out.other.logged, out.other.planned);
    TYPE_ORDER.forEach(function (k) {
      out.byType[k].pct = rate(out.byType[k].logged, out.byType[k].planned);
    });
    return out;
  }

  /* Everything prescribed for one date, in the order the day happens, plus
     the two things a list of foods can never show: what is still outstanding
     from earlier in the week, and when the next tap falls. */
  function dayPlan(client, iso) {
    var date = iso || today();
    var out = {
      dateISO: date, entries: [], doses: [], items: [],
      logged: 0, planned: 0, complete: false, outstanding: [], nextItems: []
    };
    if (!client) return out;

    out.entries = (client.days[date] || []).slice().sort(ART.entryOrder);
    out.entries.forEach(function (e) {
      if ((e.itemType || 'dose') === 'dose') out.doses.push(e); else out.items.push(e);
      out.planned++;
      if (e.status !== 'planned') out.logged++;
    });
    out.complete = out.planned > 0 && out.logged === out.planned;

    /* unlogged drops and taps from the six days behind this one */
    for (var k = 1; k <= 6; k++) {
      var back = addDays(date, -k);
      var list = client.days[back] || [];
      for (var i = 0; i < list.length; i++) {
        var e2 = list[i];
        if ((e2.itemType || 'dose') === 'dose') continue;
        if (e2.status !== 'planned') continue;
        out.outstanding.push(e2);
      }
    }

    /* the next scheduled occurrence of each item kind after this date */
    var seen = {};
    for (var f = 1; f <= 14; f++) {
      var fwd = addDays(date, f);
      var flist = client.days[fwd] || [];
      for (var g = 0; g < flist.length; g++) {
        var e3 = flist[g];
        var type = e3.itemType || 'dose';
        if (type === 'dose' || seen[type]) continue;
        seen[type] = 1;
        out.nextItems.push({
          itemType: type, label: e3.label || TYPE_LABEL[type],
          dateISO: fwd, timing: e3.timing, entry: e3
        });
      }
    }
    return out;
  }

  /* ============================================ CORE · OTHER · the tally == */
  /* DESIGN_PASS §4 and §5. HOME and SCHEDULE are two views of ONE day, and
     the hierarchy between CORE and OTHER is the product's whole idea, so
     there is exactly one classification and both screens read it from here.
     Nothing below re-derives it, re-sorts it, or decides it a second time.

       CORE   timed and strict — the alka-seltzer tablet, the drops, the dose
              of the food being treated, the tap on its days. SCHEDULE's
              required band. HOME's UP NEXT is the next unlogged one of these.
       OTHER  must happen today, the hour is the family's — the maintenance
              servings. SCHEDULE's roving band. HOME's `Food` button ticks one.

     The classification itself is a field on the entry (entry.band), written
     by the factories in data.js, so a day read through any other accessor
     still carries it. */

  function bandOf(e) { return (e && e.band === 'other') ? 'other' : 'core'; }

  /* One day, split. Entries are the LIVE objects, so a tick on either screen
     is ART.store.logEntry on the row it is standing on and nothing else. */
  function daySplit(client, dateISO) {
    var date = dateISO || today();
    var out = {
      dateISO: date, future: diffDays(today(), date) > 0,
      all: [], core: [], other: [],
      logged: 0, planned: 0, pct: 0,
      coreLogged: 0, corePlanned: 0, corePct: 0,
      otherLogged: 0, otherPlanned: 0, otherPct: 0,
      complete: false, coreComplete: false
    };
    if (!client) return out;

    out.all = (client.days[date] || []).slice().sort(ART.entryOrder);
    out.all.forEach(function (e) {
      var band = bandOf(e);
      var done = e.status !== 'planned';
      out[band].push(e);
      out.planned++;
      if (done) out.logged++;
      if (band === 'core') {
        out.corePlanned++;
        if (done) out.coreLogged++;
      } else {
        out.otherPlanned++;
        if (done) out.otherLogged++;
      }
    });

    out.pct = rate(out.logged, out.planned);
    out.corePct = rate(out.coreLogged, out.corePlanned);
    out.otherPct = rate(out.otherLogged, out.otherPlanned);
    out.complete = out.planned > 0 && out.logged === out.planned;
    out.coreComplete = out.corePlanned > 0 && out.coreLogged === out.corePlanned;
    return out;
  }

  /* HOME's UP NEXT: the next unlogged CORE item by the clock, or null when
     the required day is done. It reads daySplit, which is the same object
     SCHEDULE renders — there is no second plan anywhere.
     An item whose hour has not come yet wins. When nothing is left ahead of
     the clock the earliest unlogged one stands in and `overdue` is true: a
     morning dose at four in the afternoon is not "next", and the card has to
     say so rather than pretend. */
  function upNext(client, dateISO) {
    var date = dateISO || today();
    var split = daySplit(client, date);
    var core = split.core;
    var nowMin = ui.nowMin();
    var i, pick = null, idx = -1;

    for (i = 0; i < core.length; i++) {
      if (core[i].status !== 'planned') continue;
      if (ui.minutesOf(core[i].timing) >= nowMin) { pick = core[i]; idx = i; break; }
    }
    if (!pick) {
      for (i = 0; i < core.length; i++) {
        if (core[i].status === 'planned') { pick = core[i]; idx = i; break; }
      }
    }
    if (!pick) return null;

    var mins = ui.minutesOf(pick.timing);
    /* the wait protocol rides along on the dose that needs one, because that
       is the part of the prescription a clock alone cannot carry */
    var wait = (ART.prep && (pick.itemType || 'dose') === 'dose' && pick.waitLevel >= 2)
      ? ART.prep.waitProtocol(pick.waitLevel)
      : null;

    return {
      entry: pick,
      id: pick.id,
      kind: pick.itemType || 'dose',
      band: 'core',
      label: ART.entryLabel(pick),
      detail: detailOf(pick),
      full: fullOf(pick),
      protocolId: pick.protocolId || null,
      dateISO: date,
      timing: pick.timing,
      at: ui.clock(pick.timing),
      atTiny: ui.clockTiny(pick.timing),
      overdue: mins >= 0 && mins < nowMin,
      minutesUntil: mins < 0 ? null : mins - nowMin,
      /* where it sits in the required day, for the progress track's dot */
      index: idx,
      count: core.length,
      logged: split.coreLogged,
      planned: split.corePlanned,
      pct: split.corePct,
      wait: wait
    };
  }

  /* HOME's RUNNING TALLY: what has actually been LOGGED, newest first, across
     days — the tablet, the drops, the taps, the doses and the maintenance
     servings, all one kind of row.
     It prints loggedAt, not timing: this is a history of events, and an OTHER
     serving has no prescribed clock to print in the first place. Rows carry
     their own day label so the divider ('Today' · 'Yesterday' · 'Mon 10/19')
     is read off the row rather than recomputed per screen. */
  function feedDayLabel(iso, t) {
    var n = diffDays(t, iso);
    if (n === 0) return 'Today';
    if (n === -1) return 'Yesterday';
    return ui.dayLabel(iso);
  }

  function atOf(e) { return ui.minutesOf(e.loggedAt || e.timing); }

  function feedRow(e, iso, t) {
    var at = e.loggedAt || e.timing;
    return {
      id: e.id,
      entry: e,
      dateISO: iso,
      dayLabel: feedDayLabel(iso, t),
      at: ui.clockTiny(at),
      atFull: ui.clock(at),
      atMin: ui.minutesOf(at),
      kind: e.itemType || 'dose',
      band: bandOf(e),
      label: ART.entryLabel(e),
      detail: detailOf(e),
      full: fullOf(e),
      status: e.status,
      statusLabel: ui.statusLabel(e.status),
      reason: e.reason || null,
      protocolId: e.protocolId || null
    };
  }

  function loggedFeed(client, limit) {
    var lim = Math.max(1, limit || 24);
    if (!client) return [];
    /* keyed on the units toggle as well, because the detail honours it */
    return memo('feed:' + client.id + ':' + lim + ':' + ART.store.state.units, function () {
      var t = today();
      var rows = [];
      for (var back = 0; back < 120 && rows.length < lim; back++) {
        var iso = addDays(t, -back);
        var list = client.days[iso];
        if (!list || !list.length) continue;
        var day = list.filter(function (e) { return e.status !== 'planned'; });
        /* Newest first inside the day. Two things logged in the same minute —
           the tablet and the drops are five minutes apart on the plan — fall
           back to the REVERSE of the day's own order, so the one prescribed
           later sits higher and the pair never reads backwards. */
        day.sort(function (a, b) {
          var d = atOf(b) - atOf(a);
          return d ? d : -ART.entryOrder(a, b);
        });
        for (var i = 0; i < day.length && rows.length < lim; i++) {
          rows.push(feedRow(day[i], iso, t));
        }
      }
      return rows;
    });
  }

  /* What each of HOME's five buttons acts on:
       Dose     nextUnlogged(client, 'dose')      the scheduled CORE dose
       Drops    nextUnlogged(client, 'drops')
       Taps     nextUnlogged(client, 'tapping')
       Food     nextUnlogged(client, 'food')      a maintenance serving
     `what` is a kind ('dose', 'drops', 'tapping', 'alka'), a band ('core',
     'other' / 'food') or 'any'. 'dose' means the dose of the food being
     TREATED — a maintenance serving is reached with 'food', because that is
     the button Geoff named and the two are different acts.
     A CORE item that was never logged carries forward for six days — that
     outstanding Monday spine tap is the thing the booklet loses and the whole
     reason the `Taps` button is live on a Wednesday. A missed food dose does
     NOT carry: it was skipped, and skipped is a status, not a backlog. */
  function nextUnlogged(client, what, dateISO) {
    var date = dateISO || today();
    var w = String(what || 'any');
    if (w === 'food') w = 'other';
    var split = daySplit(client, date);
    var list = w === 'core' ? split.core : (w === 'other' ? split.other : split.all);
    var i, e;

    function wants(entry) {
      if (w === 'core' || w === 'other' || w === 'any') return true;
      if ((entry.itemType || 'dose') !== w) return false;
      /* a food dose only counts as "the dose" while it is being treated */
      return w !== 'dose' || bandOf(entry) === 'core';
    }

    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.status === 'planned' && wants(e)) return e;
    }
    if (w === 'other' || !client) return null;

    for (var k = 1; k <= 6; k++) {
      var back = (client.days[addDays(date, -k)] || []).slice().sort(ART.entryOrder);
      for (i = 0; i < back.length; i++) {
        e = back[i];
        if (e.status !== 'planned') continue;
        if ((e.itemType || 'dose') === 'dose') continue;   /* food does not carry */
        if (wants(e)) return e;
      }
    }
    return null;
  }

  /* prep.js owns dose presentation, so the row string has one implementation
     for the whole board; these two keep metrics from caring how. */
  function detailOf(e) {
    return ART.prep ? ART.prep.rowDetail(e) : String(e && e.display);
  }
  function fullOf(e) {
    return ART.prep ? ART.prep.fullDetail(e) : String(e && e.display);
  }

  /* ==================================================== phase duration === */
  /* SPEC §5d. The unit is a PhaseRun; every number below is a reduction over
     ART.db.phaseRuns and nothing else. */

  function phaseRuns() { return db().phaseRuns || []; }
  function journeyRows() { return db().journeys || []; }

  function normBand(b) {
    return String(b === null || b === undefined ? '' : b)
      .replace(/[‒-―]/g, '-').trim();
  }

  /* accepts 'egg#2', 'egg#French toast', a phase-duration row, or
     {protocolId, phaseIdx} */
  function phaseKey(k) {
    if (!k) return '';
    if (typeof k === 'object') {
      if (k.phaseKey) return k.phaseKey;
      if (k.protocolId !== undefined && k.phaseIdx !== undefined) {
        return k.protocolId + '#' + k.phaseIdx;
      }
      return '';
    }
    var s = String(k);
    if (/#\d+$/.test(s)) return s;
    var cut = s.indexOf('#');
    if (cut < 0) return s;
    var pid = s.slice(0, cut), label = s.slice(cut + 1).toLowerCase();
    var p = protoById(pid);
    if (p) {
      for (var i = 0; i < p.phases.length; i++) {
        if (String(p.phases[i].label).toLowerCase() === label) return pid + '#' + i;
      }
    }
    return s;
  }

  function runFilter(f) {
    var o = (typeof f === 'number' || !f) ? {} : f;
    var band = o.ageBand ? normBand(o.ageBand) : null;
    var pid = o.protocolId || null;
    var pract = o.practitionerId || null;
    var cid = o.clientId || (o.client && o.client.id) || null;
    var key = o.phaseKey ? phaseKey(o.phaseKey) : null;
    return function (r) {
      if (pid && r.protocolId !== pid) return false;
      if (band && r.ageBand !== band) return false;
      if (pract && r.practitionerId !== pract) return false;
      if (cid && r.clientId !== cid) return false;
      if (key && r.phaseKey !== key) return false;
      return true;
    };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var i = (sorted.length - 1) * q;
    var lo = Math.floor(i), hi = Math.ceil(i);
    var v = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
    return Math.round(v * 10) / 10;
  }
  function one(n) { return Math.round(n * 10) / 10; }

  function reduceRuns(rows) {
    var actuals = rows.map(function (r) { return r.actualDays; })
      .sort(function (a, b) { return a - b; });
    var repeatDays = 0, totalDays = 0;
    rows.forEach(function (r) { repeatDays += r.repeatDays; totalDays += r.actualDays; });
    var med = median(actuals);
    var planned = rows[0].plannedDays;
    return {
      plannedDays: planned,
      medianActual: med,
      p25: quantile(actuals, 0.25),
      p75: quantile(actuals, 0.75),
      minActual: actuals[0],
      maxActual: actuals[actuals.length - 1],
      n: rows.length,
      overrun: one(med - planned),
      repeatDays: repeatDays,
      totalDays: totalDays,
      repeatPct: totalDays ? Math.round((repeatDays / totalDays) * 100) : 0
    };
  }

  function phaseOrder(protocolId) {
    var ps = db().protocols || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === protocolId) return i;
    return 99;
  }

  /* filter: {protocolId, ageBand, practitionerId, clientId, minN} — all
     optional. minN defaults to 3, because a phase with one run is not a
     finding and the chart prints n on every row. */
  function phaseDuration(filter) {
    var o = (typeof filter === 'number' || !filter) ? {} : filter;
    var minN = o.minN === undefined ? 3 : o.minN;
    var cacheKey = 'phaseDur:' + [o.protocolId || '', normBand(o.ageBand) || '',
      o.practitionerId || '', o.clientId || (o.client && o.client.id) || '', minN].join('|');

    return memo(cacheKey, function () {
      var keep = runFilter(o);
      var groups = {};
      var order = [];
      phaseRuns().forEach(function (r) {
        if (!keep(r)) return;
        if (!groups[r.phaseKey]) { groups[r.phaseKey] = []; order.push(r.phaseKey); }
        groups[r.phaseKey].push(r);
      });
      var rows = order.map(function (key) {
        var rs = groups[key];
        var head = rs[0];
        var agg = reduceRuns(rs);
        return {
          phaseKey: key,
          protocolId: head.protocolId,
          allergen: head.allergen,
          phaseIdx: head.phaseIdx,
          phaseLabel: head.phaseLabel,
          foodForm: head.foodForm,
          plannedDays: agg.plannedDays,
          medianActual: agg.medianActual,
          p25: agg.p25,
          p75: agg.p75,
          minActual: agg.minActual,
          maxActual: agg.maxActual,
          n: agg.n,
          overrun: agg.overrun,
          repeatDays: agg.repeatDays,
          totalDays: agg.totalDays,
          repeatPct: agg.repeatPct
        };
      }).filter(function (r) { return r.n >= minN; });

      rows.sort(function (a, b) {
        return phaseOrder(a.protocolId) - phaseOrder(b.protocolId) || a.phaseIdx - b.phaseIdx;
      });
      return rows;
    });
  }

  /* worst overrun first. The ranked list IS the answer to "where does it
     stall"; selecting a row is what names who it stalls for. */
  function overrunRanked(limit) {
    var lim = limit || 0;
    return memo('overrunRanked:' + lim, function () {
      var rows = phaseDuration(null).slice();
      rows.sort(function (a, b) {
        return b.overrun - a.overrun || b.repeatPct - a.repeatPct || b.n - a.n;
      });
      return lim ? rows.slice(0, lim) : rows;
    });
  }

  function overrunByAge(key) {
    var k = phaseKey(key);
    return memo('overrunByAge:' + k, function () {
      var groups = {};
      phaseRuns().forEach(function (r) {
        if (r.phaseKey !== k) return;
        if (!groups[r.ageBand]) groups[r.ageBand] = [];
        groups[r.ageBand].push(r);
      });
      var bands = ART.ageBands || [];
      var out = [];
      bands.forEach(function (b) {
        var rs = groups[b.key];
        if (!rs || !rs.length) return;
        var agg = reduceRuns(rs);
        out.push({
          ageBand: b.key,
          ageBandLabel: b.label,
          phaseKey: k,
          protocolId: rs[0].protocolId,
          allergen: rs[0].allergen,
          phaseLabel: rs[0].phaseLabel,
          plannedDays: agg.plannedDays,
          medianActual: agg.medianActual,
          p25: agg.p25,
          p75: agg.p75,
          n: agg.n,
          overrun: agg.overrun,
          repeatDays: agg.repeatDays,
          totalDays: agg.totalDays,
          repeatPct: agg.repeatPct
        });
      });
      return out;
    });
  }

  /* how often a day was re-administered instead of advanced. A phase that
     overruns because the same day repeats is a different problem from one
     that is simply long, so this is reported beside the overrun, never
     folded into it. */
  function repeatRate(key, ageBand) {
    var k = phaseKey(key);
    var band = ageBand ? normBand(ageBand) : null;
    return memo('repeatRate:' + k + '|' + (band || ''), function () {
      var repeatDays = 0, totalDays = 0, n = 0;
      phaseRuns().forEach(function (r) {
        if (k && r.phaseKey !== k) return;
        if (band && r.ageBand !== band) return;
        repeatDays += r.repeatDays;
        totalDays += r.actualDays;
        n++;
      });
      return {
        phaseKey: k,
        ageBand: band,
        repeatDays: repeatDays,
        totalDays: totalDays,
        n: n,
        pct: totalDays ? Math.round((repeatDays / totalDays) * 100) : 0
      };
    });
  }

  /* filter: {days, protocolId, ageBand, practitionerId, kind}. Default kind
     'graduate' — a completed food for a client still in the programme is a
     real duration but it is not a graduation, and counts().graduated has to
     keep meaning what it says. */
  function timeToFreedom(filter) {
    var o = (typeof filter === 'number') ? { days: filter } : (filter || {});
    var n = o.days || range();
    var kind = o.kind || 'graduate';
    var band = o.ageBand ? normBand(o.ageBand) : null;
    var cacheKey = 'ttf:' + [n, kind, o.protocolId || '', band || '',
      o.practitionerId || ''].join('|');

    return memo(cacheKey, function () {
      var from = windowStart(n), t = today();
      var groups = {};
      journeyRows().forEach(function (j) {
        if (!j.complete) return;
        if (kind !== 'all' && j.kind !== kind) return;
        if (o.protocolId && j.protocolId !== o.protocolId) return;
        if (band && j.ageBand !== band) return;
        if (o.practitionerId && j.practitionerId !== o.practitionerId) return;
        if (!j.completedOn) return;
        if (diffDays(from, j.completedOn) < 0) return;
        if (diffDays(j.completedOn, t) < 0) return;
        if (!groups[j.allergen]) {
          groups[j.allergen] = { protocolId: j.protocolId, weeks: [], overrun: [] };
        }
        groups[j.allergen].weeks.push(j.weeks);
        groups[j.allergen].overrun.push(j.overrun);
      });
      var rows = Object.keys(groups).map(function (allergen) {
        var g = groups[allergen];
        var ws = g.weeks.slice().sort(function (a, b) { return a - b; });
        var ov = g.overrun.slice().sort(function (a, b) { return a - b; });
        var proto = protoById(g.protocolId);
        return {
          allergen: allergen,
          protocolId: g.protocolId,
          median: median(ws),
          n: ws.length,
          min: ws[0],
          max: ws[ws.length - 1],
          weeksList: ws,
          plannedWeeks: proto ? proto.weeks : null,
          medianOverrunDays: median(ov)
        };
      });
      rows.sort(function (a, b) {
        return a.median - b.median || a.allergen.localeCompare(b.allergen);
      });
      return rows;
    });
  }

  /* The micro view the macro aggregates: one client's own phase runs, each
     carrying the practice median for the same phase and the median for the
     same phase in that child's age band, so a practitioner and the owner are
     reading one object at two zooms. */
  function clientPhaseRuns(client) {
    var c = client && client.id ? client : ART.store.client(client);
    if (!c) return [];
    return memo('clientRuns:' + c.id, function () {
      var mine = phaseRuns().filter(function (r) { return r.clientId === c.id; });
      mine.sort(function (a, b) {
        return String(a.startedOn).localeCompare(String(b.startedOn)) ||
          a.phaseIdx - b.phaseIdx;
      });
      var all = phaseDuration({ minN: 1 });
      var index = {};
      all.forEach(function (r) { index[r.phaseKey] = r; });
      return mine.map(function (r) {
        var practice = index[r.phaseKey];
        var band = overrunByAge(r.phaseKey);
        var cell = null;
        for (var i = 0; i < band.length; i++) if (band[i].ageBand === r.ageBand) cell = band[i];
        var row = {};
        Object.keys(r).forEach(function (k) { row[k] = r[k]; });
        row.practiceMedian = practice ? practice.medianActual : null;
        row.practiceN = practice ? practice.n : 0;
        row.bandMedian = cell ? cell.medianActual : null;
        row.bandN = cell ? cell.n : 0;
        row.vsPractice = practice ? one(r.actualDays - practice.medianActual) : null;
        row.repeatPct = r.actualDays ? Math.round((r.repeatDays / r.actualDays) * 100) : 0;
        return row;
      });
    });
  }

  /* ====================================================== meal ideas ===== */
  function allIdeas() { return db().mealIdeas || []; }

  function isSaved(idea, client) {
    if (!idea) return false;
    var c = client && client.id ? client : ART.store.focusClient();
    var ids = idea.savedByClientIds || [];
    return !!(c && ids.indexOf(c.id) >= 0);
  }

  /* The foods this child is in maintenance on — the ones meal ideas are
     actually for. "1-2 servings daily, ideally for 3 months" is the long
     part, and by then the problem is variety, not safety. */
  function maintenanceAllergens(client) {
    var c = client && client.id ? client : ART.store.focusClient();
    if (!c) return [];
    var out = [];
    (c.protocols || []).forEach(function (cp) {
      if (cp.state !== 'maintenance') return;
      var p = protoById(cp.protocolId);
      if (!p) return;
      out.push({ protocolId: p.id, allergen: p.allergen, maintenance: p.maintenance });
    });
    (c.history || []).forEach(function (h) {
      var p = protoById(h.protocolId);
      if (!p) return;
      for (var i = 0; i < out.length; i++) if (out[i].protocolId === p.id) return;
      out.push({ protocolId: p.id, allergen: p.allergen, maintenance: p.maintenance });
    });
    return out;
  }

  /* filter: {allergen|protocolId, source, status, communal, client, savedOnly}
     Default: everything a family is allowed to see — the curated set plus
     anything a practitioner has made communal, plus that family's own. */
  function mealIdeas(filter) {
    var o = filter || {};
    var c = o.client && o.client.id ? o.client : (o.client ? ART.store.client(o.client) : null);
    var want = o.allergen ? String(o.allergen).toLowerCase() : null;
    var pid = o.protocolId && o.protocolId !== 'all' ? o.protocolId : null;
    if (want === 'all') want = null;

    return allIdeas().filter(function (idea) {
      if (want && String(idea.allergen).toLowerCase() !== want &&
        String(idea.protocolId).toLowerCase() !== want) return false;
      if (pid && idea.protocolId !== pid) return false;
      if (o.source && idea.source !== o.source) return false;
      if (o.status && idea.status !== o.status) return false;
      if (o.communal === true && !idea.isCommunal) return false;
      if (o.savedOnly && !isSaved(idea, c)) return false;
      if (o.visibleTo !== false && !o.status && !o.source) {
        /* a private or in-review idea belongs only to the family that wrote it */
        if (!idea.isCommunal) {
          var mine = c && (idea.savedByClientIds || []).indexOf(c.id) >= 0;
          if (!mine) return false;
        }
      }
      return true;
    }).sort(function (a, b) {
      return (b.savedCount - a.savedCount) || String(a.title).localeCompare(String(b.title));
    });
  }

  /* The practitioner's queue. Oldest first — it is a queue, not a feed. */
  function reviewQueue() {
    return memo('reviewQueue', function () {
      return allIdeas().filter(function (i) { return i.status === 'submitted'; })
        .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    });
  }

  /* every family-submitted idea, at whatever status — the loop, end to end */
  function ideaFlow() {
    return memo('ideaFlow', function () {
      var order = { submitted: 0, approved: 1, saved: 2, declined: 3 };
      return allIdeas().filter(function (i) { return i.source === 'family'; })
        .sort(function (a, b) {
          return (order[a.status] - order[b.status]) ||
            String(a.createdAt).localeCompare(String(b.createdAt));
        });
    });
  }

  ART.metrics = {
    adherence: adherence,
    clientAdherence: clientAdherence,
    byPractitioner: byPractitioner,
    weeksToFreedom: weeksToFreedom,
    holdsByWeek: holdsByWeek,
    adherenceTrend: adherenceTrend,
    attention: attention,
    counts: counts,
    phaseStalls: phaseStalls,
    timeline: timeline,
    /* ------------------------------------------------- SPEC §5d additions */
    byItemType: byItemType,
    weekMeter: weekMeter,
    dayPlan: dayPlan,
    /* ------------------------------------------- DESIGN_PASS §4/§5/§6 */
    daySplit: daySplit,
    upNext: upNext,
    loggedFeed: loggedFeed,
    nextUnlogged: nextUnlogged,
    phaseDuration: phaseDuration,
    overrunRanked: overrunRanked,
    overrunByAge: overrunByAge,
    repeatRate: repeatRate,
    timeToFreedom: timeToFreedom,
    clientPhaseRuns: clientPhaseRuns,
    reviewQueue: reviewQueue,
    ideaFlow: ideaFlow,
    mealIdeas: mealIdeas,
    maintenanceAllergens: maintenanceAllergens,
    isSaved: isSaved,
    phaseKey: phaseKey
  };
})();
