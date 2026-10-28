/* ===========================================================================
   A.R.T. pitch canvas — js/data.js            owner: data            SPEC §6
   ---------------------------------------------------------------------------
   ART.db  — the one dataset every surface derives from.
   ART.seed() — pure: returns a brand-new dataset. Reset calls it.
   ART.makeDose(client, protocolId, phaseIdx, stepIdx, iso, opts) — the single
     dose factory, used by the seeder and by ART.store.publishPlan().

   The ramps below were transcribed off photographs of the real booklet.
   Dose units are deliberately heterogeneous — counts of seeds, thirty-seconds
   of a chicken tender, sixteenths of a slice, quarter-teaspoons, fractions of
   a serving. Every dose carries {value, unit, display}; nothing is a bare
   number. `value` is always expressed in the phase's own `unit`; `display` is
   the booklet's own wording for it (so a milk step of 12 tsp displays as
   '1/4 serving').

   Determinism: one seeded mulberry32, no Math.random, no argless Date.

   SPEC §5 ADDITIONS — read this before writing a zone
   ---------------------------------------------------------------------------
   ART.db.protocolItems  ProtocolItem[]  the alka-seltzer, the drops and the
                                         spine tap, per client
   ART.db.mealIdeas      MealIdea[]      22 curated + 7 family
   ART.db.phaseRuns      PhaseRun[]      476 rows — the analytics spine
   ART.db.journeys       Journey[]       a whole food start to finish; carries
                                         `weeks`, which is what time-to-freedom
                                         medians, and `kind`:
                                         graduate | completed-food | maintenance
                                         | in-flight  (only the first two are
                                         `complete`)

   client.days[iso] IS NOT A LIST OF DOSES ANY MORE. It is the day: every row
   carries itemType 'dose' | 'alka' | 'drops' | 'tapping', with the same
   status vocabulary, because adherence counts all four. Rows are ordered by
   time, and at the same time the tablet leads, the drops follow (both taken
   before food) and the tap comes last.

   DESIGN_PASS §6 — THE TWO FIELDS THE WHOLE PRODUCT NOW READS
     band       'core'  timed and strict: the ALKA-SELTZER tablet, the drops,
                        the dose of the food being treated, the tap on its
                        days. SCHEDULE's required band; HOME's UP NEXT.
                'other' must happen today, the hour is the family's: the
                        maintenance servings. SCHEDULE's roving band.
                There is ONE classification and both screens read it —
                ART.metrics.daySplit(client, iso) -> {core:[], other:[]}.
     loggedAt   'HH:MM' when it actually happened, null while planned. timing
                is the PRESCRIBED clock and SCHEDULE shows that; loggedAt is
                the real one and HOME's running tally shows that. An OTHER
                item has no prescribed clock at all, so loggedAt is the only
                time it has.

   A MAINTENANCE DAY CAN BE MORE THAN ONE ROW. Egg maintenance is "1 serving
   baked + 1 serving other egg foods" — two servings, so two entries, each
   with its own status and its own tick: partIdx 0/1, partCount 2, partLabel
   'baked' / 'other egg foods'. Part 0 keeps the historic id; part 1 appends
   ':2'. ART.maintenanceParts(protocolId) is the split and every other
   protocol returns a single part, so callers just loop.

   Helpers:
     ART.dayEntries(client, iso)   the whole day
     ART.dayDoses(client, iso)     food only  <- use this where you mean doses
     ART.dayItems(client, iso)     the tablet + drops + tap
     ART.dayBand(client, iso, band)  one band, in clock order
     ART.entryLabel(entry)         'Alka-Seltzer' | 'Drops' | 'Spine tap' |
                                   the allergen — the one row vocabulary
     ART.itemKinds                 ['alka','drops','tapping']
     ART.protocolItems(clientId)   the ProtocolItem records
     ART.entryOrder(a, b)          the comparator above, if you re-sort
     ART.makeItemEntry(client, item, iso, opts)   the item entry factory
     ART.makeDoseSet(...)          one protocol-day as the rows it really is
     ART.maintenanceParts(id)      the servings in one maintenance day
     ART.ensureItems(client, from, to)            idempotent backfill
     ART.ageBands / ART.ageBandOf(age) / ART.ageBandLabel(key)
       keys are ASCII: 'under 2' '2-3' '4-6' '7-10' '11+'
       labels carry the en dash: 'Under 2' '2–3' '4–6' '7–10' '11+'
       RENDER THE LABEL, FILTER ON THE KEY (filters accept either).
     ART.phaseKeyOf(protocolId, phaseIdx) -> 'egg#2'
   ---------------------------------------------------------------------------
   ADDITIVE FIELDS (not in the SPEC shapes, safe to ignore):
     Client.history             foods already finished [{protocolId, weeks,
                                startedISO, finishedISO}]
     ProtocolItem.cadenceKind / .cadenceDays / .perWeek
     DayEntry.band / .loggedAt / .partIdx / .partCount / .partLabel /
             .qualifier
     Protocol.maintenanceParts  the servings in one maintenance day
     MealIdea.protocolId / .reviewedByName / .reviewNote / .savedByClientIds
     PhaseRun.phaseKey / .journeyId / .ageAtRun / .ageBandLabel / .clientName
     Graduate.age / .ageBand    (Graduate.weeks is DERIVED from the phase runs)
     Protocol.maintenanceDose   {display,value,unit,gramsPerUnit,foodForm}
     RampStep.food              only on egg phase 5
     Dose.week                  protocol week this dose falls in
     ClientProtocol.timing / .waitLevel
     Practitioner.capacity / .pausedClientIds
     Graduate.protocolId
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var addDays = ui.addDays;
  var diffDays = ui.diffDays;
  var weekStart = ui.weekStart;

  var TODAY = ART.store.state.today;        /* '2026-10-21' */
  var WEEK0 = ART.store.state.weekStart;    /* '2026-10-19' (Mon) */
  var PLAN_END = addDays(WEEK0, 6);         /* '2026-10-25' (Sun) */
  var HISTORY_FLOOR = addDays(TODAY, -95);  /* oldest generated dose */

  /* ------------------------------------------------------------------ prng */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

  /* -------------------------------------------------------------- protocols */
  function s(display, value, days) { return { display: display, value: value, days: days }; }

  var CONDITIONS = [
    { trigger: 'Symptom-free yesterday', action: 'Advance to the next step' },
    { trigger: 'Illness, fever or a vaccine', action: 'Hold at the current dose' },
    { trigger: 'Any reaction', action: 'Hold and message the practitioner' },
    { trigger: 'Held 3 days or more', action: 'Notify the practitioner' }
  ];

  /* MAINTENANCE PARTS — the OTHER band, as data.
     Maintenance is not always one thing a day. Egg is "1 serving baked + 1
     serving other egg foods", which is TWO servings and therefore two rows a
     parent ticks off separately, at whatever hours the day allows. Splitting
     it here, once, is what lets HOME and SCHEDULE both render two tickable
     rows without either of them parsing a string: one part, one day entry,
     one status, one tick. The parts sum to maintenanceDose.value, so grams and
     servings still add up to the prescription.
     Every other protocol is a single serving and falls through to the
     one-part default in ART.maintenanceParts(). */
  var MAINT_PARTS = {
    egg: [
      {
        display: '1 serving', value: 1, unit: 'serving', gramsPerUnit: 60,
        foodForm: 'baked egg', partLabel: 'baked', qualifier: 'baked'
      },
      {
        display: '1 serving', value: 1, unit: 'serving', gramsPerUnit: 60,
        foodForm: 'other egg foods', partLabel: 'other egg foods', qualifier: 'other'
      }
    ]
  };

  function eggPhase5Steps() {
    var foods = ['scrambled', 'ice cream with egg', 'mayo', 'mousse', 'meringue'];
    var out = [];
    foods.forEach(function (f) {
      out.push({ display: '1/4', value: 0.25, days: 1, food: f });
      out.push({ display: '1/2', value: 0.5, days: 1, food: f });
      out.push({ display: 'whole serving', value: 1, days: 1, food: f });
    });
    return out;
  }

  function buildProtocols() {
    return [
      {
        id: 'egg', allergen: 'Egg', version: 'v3', state: 'published', weeks: 12,
        updatedISO: '2026-09-30', authorNote: null,
        maintenance: '1 serving baked + 1 serving other egg foods daily, ideally 3 months',
        maintenanceDose: {
          display: '1 serving baked + 1 serving other egg foods', value: 2,
          unit: 'serving', gramsPerUnit: 60, foodForm: 'baked egg + other egg foods'
        },
        maintenanceParts: MAINT_PARTS.egg,
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Chicken tenders', foodForm: 'breaded chicken tender',
            unit: 'tender', gramsPerUnit: 30, days: 17, steps: [
              s('1/32', 1 / 32, 2), s('1/16', 1 / 16, 2), s('3/32', 3 / 32, 2),
              s('5/32', 5 / 32, 1), s('7/32', 7 / 32, 1), s('9/32', 9 / 32, 1),
              s('5/16', 5 / 16, 1), s('3/8', 3 / 8, 1), s('7/16', 7 / 16, 1),
              s('1/2', 1 / 2, 1), s('9/16', 9 / 16, 1), s('5/8', 5 / 8, 1),
              s('11/16', 11 / 16, 1), s('3/4', 3 / 4, 1)
            ]
          },
          {
            n: 2, label: 'Fresh egg pasta', foodForm: 'fresh egg pasta',
            unit: 'serving', gramsPerUnit: 85, days: 3, steps: [
              s('1/4', 0.25, 1), s('1/2', 0.5, 1), s('whole serving', 1, 1)
            ]
          },
          {
            n: 3, label: 'French toast', foodForm: 'French toast',
            unit: 'piece', gramsPerUnit: 42, days: 14, steps: [
              s('1/16', 1 / 16, 2), s('1/8', 1 / 8, 2), s('3/16', 3 / 16, 2),
              s('1/4', 1 / 4, 2), s('5/16', 5 / 16, 2), s('3/8', 3 / 8, 2),
              s('7/16', 7 / 16, 1), s('1/2', 1 / 2, 1)
            ]
          },
          {
            n: 4, label: 'Marshmallow fluff', foodForm: 'marshmallow fluff',
            unit: 'tsp', gramsPerUnit: 7, days: 10, steps: [
              s('1/4 tsp', 0.25, 2), s('1/2 tsp', 0.5, 2), s('1 tsp', 1, 2),
              s('1 1/2 tsp', 1.5, 1), s('2 tsp', 2, 1), s('2 1/2 tsp', 2.5, 1),
              s('1 Tbsp', 3, 1)
            ]
          },
          {
            n: 5, label: 'All egg foods',
            foodForm: 'scrambled · ice cream with egg · mayo · mousse · meringue',
            unit: 'serving', gramsPerUnit: 60, days: 15, steps: eggPhase5Steps()
          }
        ]
      },
      {
        id: 'sesame', allergen: 'Sesame', version: 'v2', state: 'published', weeks: 12,
        updatedISO: '2026-08-22', authorNote: null,
        maintenance: '1–2 servings daily',
        maintenanceDose: {
          display: 'whole serving', value: 1, unit: 'serving', gramsPerUnit: 60,
          foodForm: 'hummus or tahini'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Sesame seeds', foodForm: 'sesame seeds',
            unit: 'seeds', gramsPerUnit: 0.003, days: 21, steps: [
              s('1', 1, 3), s('2', 2, 2), s('3', 3, 2), s('4', 4, 2), s('5', 5, 2),
              s('7', 7, 2), s('10', 10, 2), s('15', 15, 2), s('20', 20, 2), s('30', 30, 2)
            ]
          },
          {
            n: 2, label: 'Tahini', foodForm: 'tahini', unit: 'tsp', gramsPerUnit: 15,
            days: 14, steps: [
              s('1/4 tsp', 0.25, 3), s('1/2 tsp', 0.5, 3), s('1 tsp', 1, 3),
              s('2 tsp', 2, 3), s('1 Tbsp', 3, 2)
            ]
          },
          {
            n: 3, label: 'Hummus', foodForm: 'hummus', unit: 'serving', gramsPerUnit: 60,
            days: 9, steps: [s('1/4', 0.25, 3), s('1/2', 0.5, 3), s('whole serving', 1, 3)]
          },
          {
            n: 4, label: 'Halva', foodForm: 'halva', unit: 'piece', gramsPerUnit: 30,
            days: 14, steps: [
              s('1/16', 1 / 16, 3), s('1/8', 1 / 8, 3), s('1/4', 1 / 4, 3),
              s('3/8', 3 / 8, 3), s('1/2', 1 / 2, 2)
            ]
          }
        ]
      },
      {
        id: 'cashew', allergen: 'Cashew', version: 'v1', state: 'published', weeks: 10,
        updatedISO: '2026-09-11', authorNote: null,
        maintenance: '8 cashew pieces or 1 Tbsp cashew butter daily',
        maintenanceDose: {
          display: '8', value: 8, unit: 'seeds', gramsPerUnit: 1.4, foodForm: 'cashew pieces'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Cashew pieces', foodForm: 'cashew pieces',
            unit: 'seeds', gramsPerUnit: 1.4, days: 14, steps: [
              s('1/4', 0.25, 2), s('1/2', 0.5, 2), s('1', 1, 2), s('2', 2, 2),
              s('3', 3, 2), s('5', 5, 2), s('8', 8, 2)
            ]
          },
          {
            n: 2, label: 'Cashew butter', foodForm: 'cashew butter',
            unit: 'tsp', gramsPerUnit: 16, days: 15, steps: [
              s('1/4 tsp', 0.25, 3), s('1/2 tsp', 0.5, 3), s('1 tsp', 1, 3),
              s('2 tsp', 2, 3), s('1 Tbsp', 3, 3)
            ]
          }
        ]
      },
      {
        id: 'milk', allergen: 'Milk', version: 'v2', state: 'published', weeks: 14,
        updatedISO: '2026-09-18', authorNote: null,
        maintenance: '1–2 servings daily, ideally 3 months',
        maintenanceDose: {
          display: 'whole serving', value: 1, unit: 'serving', gramsPerUnit: 240,
          foodForm: 'milk or yogurt'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Baked goods with milk', foodForm: 'baked goods with milk',
            unit: 'piece', gramsPerUnit: 40, days: 15, steps: [
              s('1/16', 1 / 16, 3), s('1/8', 1 / 8, 3), s('1/4', 1 / 4, 3),
              s('1/2', 1 / 2, 3), s('whole piece', 1, 3)
            ]
          },
          {
            n: 2, label: 'Yogurt', foodForm: 'yogurt', unit: 'tsp', gramsPerUnit: 15,
            days: 12, steps: [
              s('1/2 tsp', 0.5, 3), s('1 tsp', 1, 3), s('1 Tbsp', 3, 3), s('2 Tbsp', 6, 3)
            ]
          },
          {
            n: 3, label: 'Milk', foodForm: 'milk', unit: 'tsp', gramsPerUnit: 5,
            days: 21, steps: [
              s('1/4 tsp', 0.25, 3), s('1 tsp', 1, 3), s('1 Tbsp', 3, 3),
              s('2 Tbsp', 6, 3), s('1/4 serving', 12, 3), s('1/2 serving', 24, 3),
              s('whole serving', 48, 3)
            ]
          }
        ]
      },
      {
        id: 'wheat', allergen: 'Wheat', version: 'v1', state: 'published', weeks: 10,
        updatedISO: '2026-07-29', authorNote: null,
        maintenance: '1 serving daily',
        maintenanceDose: {
          display: 'whole serving', value: 1, unit: 'serving', gramsPerUnit: 85,
          foodForm: 'wheat pasta or bread'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Cracker', foodForm: 'cracker', unit: 'piece', gramsPerUnit: 4,
            days: 12, steps: [
              s('1/8', 1 / 8, 2), s('1/4', 1 / 4, 2), s('1/2', 1 / 2, 2),
              s('whole piece', 1, 2), s('2 pieces', 2, 2), s('4 pieces', 4, 2)
            ]
          },
          {
            n: 2, label: 'Pasta', foodForm: 'wheat pasta', unit: 'serving',
            gramsPerUnit: 85, days: 9, steps: [
              s('1/4', 0.25, 3), s('1/2', 0.5, 3), s('whole serving', 1, 3)
            ]
          }
        ]
      },
      {
        id: 'soy', allergen: 'Soy', version: 'v1', state: 'published', weeks: 8,
        updatedISO: '2026-08-06', authorNote: null,
        maintenance: '1 serving daily',
        maintenanceDose: {
          display: 'whole serving', value: 1, unit: 'serving', gramsPerUnit: 80,
          foodForm: 'tofu or edamame'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Edamame', foodForm: 'edamame', unit: 'seeds', gramsPerUnit: 1.1,
            days: 12, steps: [
              s('1', 1, 2), s('2', 2, 2), s('4', 4, 2), s('6', 6, 2),
              s('10', 10, 2), s('16', 16, 2)
            ]
          },
          {
            n: 2, label: 'Tofu', foodForm: 'tofu', unit: 'serving', gramsPerUnit: 80,
            days: 9, steps: [s('1/4', 0.25, 3), s('1/2', 0.5, 3), s('whole serving', 1, 3)]
          }
        ]
      },
      {
        id: 'peanut', allergen: 'Peanut', version: 'v1', state: 'review', weeks: 12,
        updatedISO: '2026-10-14',
        authorNote: 'Flour phase split from v0 after three holds in week 4. Awaiting sign-off.',
        maintenance: '1 Tbsp peanut butter daily, ideally 3 months',
        maintenanceDose: {
          display: '1 Tbsp', value: 3, unit: 'tsp', gramsPerUnit: 16, foodForm: 'peanut butter'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Peanut flour in applesauce', foodForm: 'peanut flour in applesauce',
            unit: 'tsp', gramsPerUnit: 8, days: 18, steps: [
              s('1/32 tsp', 1 / 32, 3), s('1/16 tsp', 1 / 16, 3), s('1/8 tsp', 1 / 8, 3),
              s('1/4 tsp', 1 / 4, 3), s('1/2 tsp', 1 / 2, 3), s('1 tsp', 1, 3)
            ]
          },
          {
            n: 2, label: 'Peanut butter', foodForm: 'peanut butter', unit: 'tsp',
            gramsPerUnit: 16, days: 14, steps: [
              s('1/4 tsp', 0.25, 3), s('1/2 tsp', 0.5, 3), s('1 tsp', 1, 3),
              s('2 tsp', 2, 3), s('1 Tbsp', 3, 2)
            ]
          }
        ]
      },
      {
        id: 'treenut', allergen: 'Tree nut mix', version: 'v1', state: 'draft', weeks: 12,
        updatedISO: '2026-10-09',
        authorNote: 'Blocked — needs a decision on sequencing against cashew.',
        maintenance: '4 walnut pieces daily',
        maintenanceDose: {
          display: '4', value: 4, unit: 'seeds', gramsPerUnit: 1.3, foodForm: 'walnut pieces'
        },
        conditions: CONDITIONS.slice(),
        phases: [
          {
            n: 1, label: 'Walnut', foodForm: 'walnut pieces', unit: 'seeds',
            gramsPerUnit: 1.3, days: 10, steps: [
              s('1/4', 0.25, 2), s('1/2', 0.5, 2), s('1', 1, 2), s('2', 2, 2), s('4', 4, 2)
            ]
          }
        ]
      }
    ];
  }

  /* canonical, read-only copy for the dose factory */
  var CANON = {};
  buildProtocols().forEach(function (p) { CANON[p.id] = p; });

  /* ----------------------------------------------------- centres / staff -- */
  function buildCentres() {
    return [
      { id: 'ct-burl', name: 'A.R.T. Burlington', city: 'Burlington, MA' },
      { id: 'ct-nyc', name: 'A.R.T. Manhattan', city: 'New York, NY' },
      { id: 'ct-ind', name: 'Independent network', city: 'Remote · 9 states' }
    ];
  }
  var STAFF = [
    { id: 'p-ren', name: 'Ren O.', centreId: 'ct-burl', kind: 'staff', active: 16, paused: 2, capacity: 18 },
    { id: 'p-dana', name: 'Dana W.', centreId: 'ct-burl', kind: 'staff', active: 15, paused: 2, capacity: 18 },
    { id: 'p-sol', name: 'Sol M.', centreId: 'ct-nyc', kind: 'staff', active: 17, paused: 1, capacity: 18 },
    { id: 'p-kit', name: 'Kit F.', centreId: 'ct-ind', kind: 'independent', active: 10, paused: 1, capacity: 14 }
  ];

  /* ------------------------------------------------------------- names ---- */
  var FIRST = [
    'Ezra', 'Nina', 'Theo', 'Sora', 'Jonah', 'Alma', 'Dev', 'Iris', 'Noor', 'Beck',
    'Lila', 'Omar', 'Rosa', 'Finn', 'Zuri', 'Milo', 'Juno', 'Asher', 'Priya', 'Cleo',
    'Rafi', 'Esme', 'Nico', 'Wren', 'Idris', 'Tova', 'Luca', 'Maeve', 'Arlo', 'Sana',
    'Bodhi', 'Clara', 'Emir', 'Freya', 'Gus', 'Hana', 'Ira', 'Jade', 'Kofi', 'Leni',
    'Mina', 'Nate', 'Oona', 'Pia', 'Quinn', 'Rhys', 'Suri', 'Tess', 'Uma', 'Vera',
    'Wyatt', 'Xavi', 'Yara', 'Zane', 'Ada', 'Bram', 'Cora', 'Dax', 'Elia', 'Fern',
    'Gia', 'Hugo', 'Ines', 'Jory', 'Kira', 'Lars', 'Mira', 'Nael', 'Odin', 'Paz',
    'Remy', 'Tam', 'Vida', 'Yusuf', 'Zadie', 'Ana', 'Beto', 'Cai', 'Dara', 'Eli',
    'Faye', 'Gael', 'Hal', 'Imani', 'Joss', 'Nadia', 'Osric', 'Perla'
  ];
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function nameAt(i) {
    return FIRST[(i * 7 + 3) % FIRST.length] + ' ' + ALPHA[(i * 11 + 5) % 26] + '.';
  }

  /* ------------------------------------------------------- dose factory --- */
  function stepFor(proto, phaseIdx, stepIdx) {
    var phase = proto.phases[Math.min(phaseIdx, proto.phases.length - 1)];
    return { phase: phase, step: phase.steps[Math.min(Math.max(stepIdx, 0), phase.steps.length - 1)] };
  }

  /* The parts of one day's maintenance prescription. Always at least one row,
     so every caller can loop without asking whether this food happens to be
     the two-serving one. */
  ART.maintenanceParts = function (protocolId) {
    var id = (protocolId && protocolId.id) ? protocolId.id : protocolId;
    var proto = resolveProto(id);
    if (!proto || !proto.maintenanceDose) return [];
    if (proto.maintenanceParts && proto.maintenanceParts.length) return proto.maintenanceParts;
    if (MAINT_PARTS[id]) return MAINT_PARTS[id];
    var m = proto.maintenanceDose;
    return [{
      display: m.display, value: m.value, unit: m.unit, gramsPerUnit: m.gramsPerUnit,
      foodForm: m.foodForm, partLabel: null, qualifier: null
    }];
  };

  /* One day of one protocol, as the rows it actually is: one entry for a ramp
     dose, one per serving for a multi-part maintenance prescription. The
     seeder and ART.store.publishPlan() both go through this, so a published
     week and a seeded week are the same shape. */
  ART.makeDoseSet = function (client, protocolId, phaseIdx, stepIdx, iso, opts) {
    opts = opts || {};
    var parts = opts.isMaintenance ? ART.maintenanceParts(protocolId) : [];
    if (parts.length < 2) {
      return [ART.makeDose(client, protocolId, phaseIdx, stepIdx, iso, opts)];
    }
    return parts.map(function (part, i) {
      var o = {};
      Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
      o.partIdx = i;
      return ART.makeDose(client, protocolId, phaseIdx, stepIdx, iso, o);
    });
  };

  function resolveProto(id) {
    return (ART.db && ART.db.protocols && findById(ART.db.protocols, id)) || CANON[id] || null;
  }

  /* opts: {timing, waitLevel, status, reason, note, isMaintenance, week,
            partIdx}
     partIdx addresses one serving of a multi-part maintenance day. Left out,
     a maintenance dose still renders as the whole prescription exactly as it
     always did — which is what the practitioner's preview chip wants. */
  ART.makeDose = function (client, protocolId, phaseIdx, stepIdx, iso, opts) {
    opts = opts || {};
    var proto = resolveProto(protocolId);
    var maint = !!opts.isMaintenance;
    var display, value, unit, gpu, foodForm, phaseLabel, sIdx, pIdx;
    var partIdx = 0, partCount = 1, partLabel = null, qualifier = null;

    if (maint) {
      var parts = ART.maintenanceParts(protocolId);
      var pi = (typeof opts.partIdx === 'number' && parts.length > 1)
        ? Math.max(0, Math.min(parts.length - 1, opts.partIdx))
        : -1;
      var m = pi >= 0 ? parts[pi] : proto.maintenanceDose;
      display = m.display; value = m.value; unit = m.unit; gpu = m.gramsPerUnit;
      foodForm = m.foodForm; phaseLabel = 'Maintenance';
      if (pi >= 0) {
        partIdx = pi; partCount = parts.length;
        partLabel = m.partLabel; qualifier = m.qualifier;
      }
      pIdx = proto.phases.length - 1;
      sIdx = proto.phases[pIdx].steps.length - 1;
    } else {
      var r = stepFor(proto, phaseIdx, stepIdx);
      display = r.step.display; value = r.step.value;
      unit = r.phase.unit; gpu = r.phase.gramsPerUnit;
      foodForm = r.step.food ? r.step.food : r.phase.foodForm;
      phaseLabel = r.phase.label;
      pIdx = Math.min(phaseIdx, proto.phases.length - 1);
      sIdx = Math.min(Math.max(stepIdx, 0), r.phase.steps.length - 1);
    }

    var week = opts.week;
    if (week === undefined || week === null) week = protoWeek(client, protocolId, iso);

    return {
      /* part 0 keeps the historic id, so every anchorDoseId, focused-dose id
         and deep link that already exists still resolves */
      id: client.id + ':' + protocolId + ':' + iso + (partIdx > 0 ? ':' + (partIdx + 1) : ''),
      clientId: client.id,
      itemType: 'dose',
      protocolId: protocolId,
      allergen: proto.allergen,
      phaseLabel: phaseLabel,
      foodForm: foodForm,
      display: display,
      value: value,
      unit: unit,
      grams: value * gpu,
      timing: opts.timing || '17:30',
      waitLevel: opts.waitLevel === undefined ? 1 : opts.waitLevel,
      status: opts.status || 'planned',
      reason: opts.reason || null,
      note: opts.note || null,
      /* CORE vs OTHER, and it is the only classification in the product. A
         dose of the food being treated is timed and strict; a maintenance
         serving must happen today but the hour is the family's. */
      band: maint ? 'other' : 'core',
      loggedAt: null,
      partIdx: partIdx,
      partCount: partCount,
      partLabel: partLabel,
      qualifier: qualifier,
      isMaintenance: maint,
      dateISO: iso,
      stepIdx: sIdx,
      phaseIdx: pIdx,
      week: week
    };
  };

  function findById(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function protoWeek(client, protocolId, iso) {
    for (var i = 0; i < client.protocols.length; i++) {
      var cp = client.protocols[i];
      if (cp.protocolId !== protocolId) continue;
      return cp.week - Math.round(diffDays(weekStart(iso), WEEK0) / 7);
    }
    return 1;
  }

  function putDose(client, dose) {
    if (!client.days[dose.dateISO]) client.days[dose.dateISO] = [];
    client.days[dose.dateISO].push(dose);
  }
  /* Lay down one day of one protocol as the rows it really is — see
     ART.makeDoseSet. Every seeding path goes through here. */
  function putDoses(client, protocolId, phaseIdx, stepIdx, iso, opts) {
    var made = ART.makeDoseSet(client, protocolId, phaseIdx, stepIdx, iso, opts);
    for (var i = 0; i < made.length; i++) putDose(client, made[i]);
    return made;
  }
  /* The order the day actually happens in. Time first; then, when two things
     share a time, the alka-seltzer leads (it is taken before the drops), the
     drops come before the food — prescribed "before any food" — and the tap
     comes last. Two servings of the same maintenance food keep their part
     order, so '1 serving baked' always sits above '1 serving other egg
     foods' and the pair never swaps between renders. */
  var ENTRY_RANK = { alka: 0, drops: 1, dose: 2, tapping: 3 };
  function entryRank(e) {
    var k = (e && e.itemType) || 'dose';
    return ENTRY_RANK[k] === undefined ? 2 : ENTRY_RANK[k];
  }
  ART.entryOrder = function (a, b) {
    var t = String(a.timing).localeCompare(String(b.timing));
    if (t) return t;
    var r = entryRank(a) - entryRank(b);
    if (r) return r;
    return (a.partIdx || 0) - (b.partIdx || 0);
  };

  function sortDays(client) {
    Object.keys(client.days).forEach(function (iso) {
      client.days[iso].sort(ART.entryOrder);
    });
  }

  /* ========================================================== c-mara ===== */
  /* Hand-authored. She is on screen for the whole demo, so every line here is
     deliberate — including the booklet's own annotation vocabulary. */
  function buildMara() {
    var mara = {
      id: 'c-mara',
      name: 'Mara R.',
      age: 7,
      practitionerId: 'p-ren',
      centreId: 'ct-burl',
      startedISO: '2026-04-13',
      status: 'active',
      protocols: [
        {
          protocolId: 'egg', week: 13, of: 12, phaseIdx: 4, stepIdx: 14,
          state: 'maintenance', heldSince: null, timing: '08:00', waitLevel: 0
        },
        {
          protocolId: 'sesame', week: 4, of: 12, phaseIdx: 0, stepIdx: 4,
          state: 'ramping', heldSince: null, timing: '16:30', waitLevel: 3
        },
        {
          protocolId: 'cashew', week: 1, of: 10, phaseIdx: 0, stepIdx: 1,
          state: 'ramping', heldSince: null, timing: '18:30', waitLevel: 2
        }
      ],
      history: [],
      days: {},
      messages: [],
      planPublishedForWeek: '2026-10-19'
    };

    var HOLD = 'hold @ same amount';

    /* egg — maintenance, every morning since July */
    run(mara, 'egg', '2026-09-21', '2026-10-21', 0, 'done', null, null, true);
    run(mara, 'egg', '2026-10-22', '2026-10-25', 0, 'planned', null, null, true);

    /* sesame — the ramp, with the cold and the hold that the booklet records */
    run(mara, 'sesame', '2026-09-28', '2026-09-30', 0, 'done');
    run(mara, 'sesame', '2026-10-01', '2026-10-03', 1, 'done');
    run(mara, 'sesame', '2026-10-04', '2026-10-06', 2, 'done');
    run(mara, 'sesame', '2026-10-07', '2026-10-09', 3, 'done');
    run(mara, 'sesame', '2026-10-10', '2026-10-10', 3, 'held', null, HOLD);
    run(mara, 'sesame', '2026-10-11', '2026-10-11', 3, 'done');
    run(mara, 'sesame', '2026-10-12', '2026-10-13', 4, 'done');
    run(mara, 'sesame', '2026-10-14', '2026-10-14', 4, 'skipped', 'cold', 'skip, had cold');
    run(mara, 'sesame', '2026-10-15', '2026-10-15', 4, 'held', null, HOLD);
    run(mara, 'sesame', '2026-10-16', '2026-10-20', 4, 'done');
    run(mara, 'sesame', '2026-10-21', '2026-10-21', 4, 'planned');
    run(mara, 'sesame', '2026-10-22', '2026-10-23', 5, 'planned');
    run(mara, 'sesame', '2026-10-24', '2026-10-25', 6, 'planned');

    /* cashew — the reaction, the hold, and the restart at 1/2 piece */
    run(mara, 'cashew', '2026-10-05', '2026-10-06', 0, 'done');
    run(mara, 'cashew', '2026-10-07', '2026-10-07', 1, 'done');
    run(mara, 'cashew', '2026-10-08', '2026-10-08', 1, 'reaction', null,
      'hives on chin, 40 min after dose — cleared in an hour');
    run(mara, 'cashew', '2026-10-09', '2026-10-11', 1, 'held', null, HOLD);
    run(mara, 'cashew', '2026-10-12', '2026-10-20', 1, 'done');
    run(mara, 'cashew', '2026-10-21', '2026-10-25', 1, 'planned');

    sortDays(mara);

    mara.messages = [
      {
        at: '2026-10-08T19:42', from: 'family',
        body: 'Hives on her chin about 40 minutes after the cashew. Gone inside the hour, no trouble breathing. Logged it.',
        anchorDoseId: 'c-mara:cashew:2026-10-08'
      },
      {
        at: '2026-10-08T21:05', from: 'practitioner',
        body: 'Thank you for logging the timing — that is the part I need. Hold the cashew where it is and we will look at it Wednesday.',
        anchorDoseId: null
      },
      {
        at: '2026-10-18T16:22', from: 'practitioner',
        body: 'Hold the cashew at 1/2 piece this week. If the hives come back at all, stop and message me before the next dose.',
        anchorDoseId: null
      },
      {
        at: '2026-10-20T07:55', from: 'family',
        body: 'Understood. Sesame is back on 5 seeds now the cold has cleared.',
        anchorDoseId: null
      }
    ];

    return mara;
  }

  function run(client, protocolId, fromISO, toISO, stepIdx, status, reason, note, maint) {
    var cp = null;
    for (var i = 0; i < client.protocols.length; i++) {
      if (client.protocols[i].protocolId === protocolId) cp = client.protocols[i];
    }
    for (var iso = fromISO; diffDays(iso, toISO) >= 0; iso = addDays(iso, 1)) {
      putDoses(client, protocolId, cp ? cp.phaseIdx : 0, stepIdx, iso, {
        timing: cp ? cp.timing : '17:30',
        waitLevel: cp ? cp.waitLevel : 1,
        status: status,
        reason: reason || null,
        note: note || null,
        isMaintenance: !!maint
      });
    }
  }

  /* =================================================== generated clients == */
  var PROTO_WEIGHTS = [
    ['egg', 0.26], ['milk', 0.22], ['sesame', 0.16],
    ['wheat', 0.14], ['cashew', 0.12], ['soy', 0.10]
  ];
  function weightedProtocol(rnd, used) {
    for (var tries = 0; tries < 24; tries++) {
      var r = rnd(), acc = 0, id = 'egg';
      for (var i = 0; i < PROTO_WEIGHTS.length; i++) {
        acc += PROTO_WEIGHTS[i][1];
        if (r <= acc) { id = PROTO_WEIGHTS[i][0]; break; }
      }
      if (used.indexOf(id) < 0) return id;
    }
    for (var j = 0; j < PROTO_WEIGHTS.length; j++) {
      if (used.indexOf(PROTO_WEIGHTS[j][0]) < 0) return PROTO_WEIGHTS[j][0];
    }
    return null;
  }

  var TIMINGS = ['07:30', '08:00', '12:30', '16:00', '16:30', '17:30', '18:00', '18:30', '19:00'];
  var REASONS = ['cold', 'vaccine', 'travel', 'refused', 'other'];

  /* Walks a protocol day by day from its start, writing one dose per day.
     Holds spike in protocol weeks 3-5 and for the two days after a phase
     change — the owner's stall chart has to DISCOVER that, so the bias is
     expressed here and nowhere else.
     `cp` carries timing/waitLevel in, and the live position out. A completed
     protocol passes a throwaway cp: it still lays down real history. */
  function walkProtocol(rnd, client, cp, proto, logRate, firstISO, lastISO) {
    var trueStart = firstISO;
    var total = diffDays(trueStart, lastISO) + 1;
    var phaseIdx = 0, stepIdx = 0, atStep = 0, lastPhaseChange = -99;
    var position = { phaseIdx: 0, stepIdx: 0, maint: false };
    var trailingHeld = 0, heldFrom = null;

    for (var d = 0; d < total; d++) {
      var iso = addDays(trueStart, d);
      var week = Math.floor(d / 7) + 1;
      var maint = phaseIdx >= proto.phases.length;
      var usePhase = maint ? proto.phases.length - 1 : phaseIdx;
      var steps = proto.phases[usePhase].steps;
      var future = diffDays(TODAY, iso) > 0;
      var status;

      if (future) {
        status = 'planned';
      } else if (rnd() > logRate) {
        status = 'planned';                       /* logged nowhere — the gap */
      } else {
        var spike = (week >= 3 && week <= 5) || (d - lastPhaseChange) <= 2;
        var holdP = spike ? 0.22 : 0.05;
        var r = rnd();
        if (r < holdP) status = 'held';
        else if (r < holdP + 0.05) status = 'skipped';
        else if (r < holdP + 0.07) status = 'reaction';
        else status = 'done';
      }

      if (diffDays(HISTORY_FLOOR, iso) >= 0) {
        putDoses(client, proto.id, usePhase, stepIdx, iso, {
          timing: cp.timing,
          waitLevel: maint ? 0 : cp.waitLevel,
          status: status,
          reason: (status === 'skipped') ? pick(rnd, REASONS) : (status === 'held' && spikeReason(rnd) ? 'cold' : null),
          note: status === 'held' ? 'hold @ same amount' : null,
          isMaintenance: maint,
          week: week
        });
      }

      if (!future) {
        /* the live position is wherever the walk stood on the last day that
           has already happened — for a paused client, their last day */
        position = { phaseIdx: usePhase, stepIdx: stepIdx, maint: maint };
        if (status === 'held') {
          if (trailingHeld === 0) heldFrom = iso;
          trailingHeld++;
        } else { trailingHeld = 0; heldFrom = null; }
      }

      if (!maint && (status === 'done' || future)) {
        atStep++;
        if (atStep >= (steps[stepIdx].days || 1)) {
          atStep = 0;
          stepIdx++;
          if (stepIdx >= steps.length) {
            stepIdx = 0;
            phaseIdx++;
            lastPhaseChange = d;
            if (phaseIdx < proto.phases.length) {
              /* new phase, new food form */
            }
          }
        }
      }
    }

    cp.phaseIdx = position.maint ? proto.phases.length - 1 : position.phaseIdx;
    cp.stepIdx = position.maint
      ? proto.phases[proto.phases.length - 1].steps.length - 1
      : position.stepIdx;
    cp.state = position.maint ? 'maintenance' : (trailingHeld >= 3 ? 'held' : 'ramping');
    cp.heldSince = trailingHeld >= 3 ? heldFrom : null;
    return trueStart;
  }
  function spikeReason(rnd) { return rnd() < 0.45; }

  function buildGenerated(rnd) {
    var clients = [];
    var idx = 0;
    STAFF.forEach(function (p) {
      var wanted = (p.id === 'p-ren') ? p.active - 1 : p.active;   /* Mara is one of Ren's */
      var i;
      for (i = 0; i < wanted; i++) clients.push(genClient(rnd, idx++, p, 'active'));
      for (i = 0; i < p.paused; i++) clients.push(genClient(rnd, idx++, p, 'paused'));
    });
    return clients;
  }

  /* One uniform draw -> one age, 1..14. Deliberately weighted young at the
     bottom end, because age is a real dimension of the phase-duration
     analysis (SPEC §5c) and the `under 2` and `2-3` bands have to carry
     enough runs to be read honestly. Exactly ONE rnd() call, so the seeded
     stream downstream of this line is unchanged. */
  var AGE_STEPS = [
    [0.07, 1], [0.13, 2], [0.26, 3], [0.36, 4], [0.45, 5], [0.53, 6],
    [0.62, 7], [0.70, 8], [0.77, 9], [0.83, 10], [0.88, 11], [0.92, 12],
    [0.96, 13], [1.01, 14]
  ];
  function ageFromUnit(u) {
    for (var i = 0; i < AGE_STEPS.length; i++) if (u < AGE_STEPS[i][0]) return AGE_STEPS[i][1];
    return 14;
  }

  function genClient(rnd, idx, pract, status) {
    var client = {
      id: 'c-' + (idx < 10 ? '0' : '') + idx,
      name: nameAt(idx),
      age: ageFromUnit(rnd()),
      practitionerId: pract.id,
      centreId: pract.centreId,
      startedISO: null,
      status: status,
      protocols: [],
      history: [],        /* foods already finished — see buildHistory() */
      days: {},
      messages: [],
      planPublishedForWeek: WEEK0
    };

    var rn = rnd();
    var count = rn < 0.40 ? 1 : (rn < 0.80 ? 2 : 3);
    /* how reliably this household logs at all — the spread the owner's
       adherence number exists to expose */
    var logRate = 0.62 + 0.36 * Math.pow(rnd(), 0.40);
    var lastISO = status === 'paused' ? addDays(TODAY, -(10 + Math.floor(rnd() * 14))) : PLAN_END;
    var used = [];
    var earliest = TODAY;

    for (var k = 0; k < count; k++) {
      var pid = weightedProtocol(rnd, used);
      if (!pid) break;
      used.push(pid);
      var proto = CANON[pid];
      /* skewed a little older, and capped a few weeks past the protocol's
         nominal length — which is what maintenance looks like on a roster */
      var week = 1 + Math.floor(Math.pow(rnd(), 0.85) * (proto.weeks + 4));
      /* a paused client stopped weeks ago, so they must have a history */
      if (status === 'paused' && week < 6) week += 6;
      var cp = {
        protocolId: pid,
        week: week,
        of: proto.weeks,
        phaseIdx: 0,
        stepIdx: 0,
        state: 'ramping',
        heldSince: null,
        timing: TIMINGS[Math.floor(rnd() * TIMINGS.length)],
        waitLevel: week <= 4 ? 3 : (week <= 8 ? 2 : 1)
      };
      client.protocols.push(cp);
      var trueStart = addDays(WEEK0, -(week - 1) * 7);
      walkProtocol(rnd, client, cp, proto, logRate, trueStart, lastISO);
      if (diffDays(trueStart, earliest) > 0) earliest = trueStart;
      if (cp.state === 'maintenance') cp.waitLevel = 0;
    }

    earliest = buildHistory(rnd, client, used, logRate, earliest);
    concurrencyDrag(rnd, client);
    client.startedISO = addDays(earliest, -84);   /* stages 1-3 come first */
    sortDays(client);
    return client;
  }

  /* The client's own thesis, in the data: a household running three foods at
     once on top of the booklet loses track of more of them than a household
     running one. Days with concurrent doses give some logged doses back to
     'planned'. Concurrency climbs as a child stacks protocols, which is why
     the owner's 7 / 28 / 90 figures genuinely differ. Mara is hand-authored
     and never passes through here. */
  function concurrencyDrag(rnd, client) {
    Object.keys(client.days).sort().forEach(function (iso) {
      var list = client.days[iso];
      if (list.length < 2) return;
      if (diffDays(iso, TODAY) < 0) return;              /* the future is planned anyway */
      var drop = list.length === 2 ? 0.045 : 0.10;
      list.forEach(function (d) {
        if (d.status !== 'planned' && rnd() < drop) {
          d.status = 'planned';
          d.reason = null;
          d.note = null;
        }
      });
    });
  }

  /* The foods this child has already finished. A.R.T. works one allergen at a
     time, so a household in week 3 of sesame has months of egg history behind
     it — that history is why the owner's 90-day figures have a real base.
     Completed protocols are deliberately NOT in client.protocols: the roster
     shows what is running now. They always end well clear of the current week,
     so nothing stale can turn up on a phone or in the last-7-days strip. */
  function buildHistory(rnd, client, used, logRate, earliestCurrent) {
    var end = earliestCurrent;
    var guard = addDays(TODAY, -12);
    if (diffDays(end, guard) < 0) end = guard;         /* end = min(end, guard) */
    var earliest = earliestCurrent;

    for (var h = 0; h < 3; h++) {
      end = addDays(end, -(3 + Math.floor(rnd() * 12)));   /* a gap between foods */
      if (diffDays(HISTORY_FLOOR, end) < 10) break;        /* nothing left to fill */
      var pid = weightedProtocol(rnd, used);
      if (!pid) break;
      used.push(pid);
      var proto = CANON[pid];
      var took = proto.weeks + Math.floor(rnd() * 4);      /* holds stretch it */
      var start = addDays(end, -(took * 7 - 1));
      var ghost = {
        protocolId: pid, week: took, of: proto.weeks, phaseIdx: 0, stepIdx: 0,
        state: 'ramping', heldSince: null,
        timing: TIMINGS[Math.floor(rnd() * TIMINGS.length)], waitLevel: 2
      };
      walkProtocol(rnd, client, ghost, proto, logRate, start, end);
      /* A finished food is a completed journey, and the analytics spine needs
         it: this is where most of the phase-duration evidence comes from.
         `weeks` is re-derived from the phase runs in buildPhaseRuns() so the
         duration a reader sees and the one the chart aggregates are the same
         number. */
      client.history.push({
        protocolId: pid,
        weeks: took,
        startedISO: start,
        finishedISO: end
      });
      if (diffDays(start, earliest) > 0) earliest = start;
      end = start;
    }
    return earliest;
  }

  /* -------------------------------------------- the four triage patterns -- */
  function setStep(client, dose, proto, phaseIdx, stepIdx) {
    var r = stepFor(proto, phaseIdx, stepIdx);
    dose.display = r.step.display;
    dose.value = r.step.value;
    dose.unit = r.phase.unit;
    dose.grams = r.step.value * r.phase.gramsPerUnit;
    dose.foodForm = r.step.food ? r.step.food : r.phase.foodForm;
    dose.phaseLabel = r.phase.label;
    dose.phaseIdx = Math.min(phaseIdx, proto.phases.length - 1);
    dose.stepIdx = Math.min(Math.max(stepIdx, 0), r.phase.steps.length - 1);
    dose.isMaintenance = false;
    /* isMaintenance and band are two names for one fact and must never
       disagree: a dose pulled back onto the ramp is CORE again. */
    dose.band = 'core';
    dose.partIdx = 0;
    dose.partCount = 1;
    dose.partLabel = null;
    dose.qualifier = null;
  }

  function dosesBetween(client, fromISO, toISO, protocolId) {
    var out = [];
    for (var iso = fromISO; diffDays(iso, toISO) >= 0; iso = addDays(iso, 1)) {
      (client.days[iso] || []).forEach(function (d) {
        if (!protocolId || d.protocolId === protocolId) out.push(d);
      });
    }
    return out;
  }

  function applyTriage(clients, protocols) {
    /* Ren's roster, minus Mara — she is hand-authored and must not be touched */
    var ren = clients.filter(function (c) {
      return c.practitionerId === 'p-ren' && c.status === 'active' && c.id !== 'c-mara';
    });
    var a = ren[0], b = ren[1], c3 = ren[2], d4 = ren[3];

    /* 1 — a reaction yesterday */
    if (a) {
      var ap = a.protocols[0];
      dosesBetween(a, '2026-10-20', '2026-10-20', ap.protocolId).forEach(function (dose) {
        dose.status = 'reaction';
        dose.reason = null;
        dose.note = 'flushed cheeks and one hive, 35 min after the dose';
      });
      dosesBetween(a, '2026-10-17', '2026-10-19').forEach(function (dose) {
        if (dose.status === 'planned') dose.status = 'done';
      });
      a.messages = [{
        at: '2026-10-20T18:10', from: 'family',
        body: 'Reaction logged on the ' + findById(protocols, ap.protocolId).allergen.toLowerCase() +
          ' dose tonight. Held her there and did not go up.',
        anchorDoseId: a.id + ':' + ap.protocolId + ':2026-10-20'
      }];
    }

    /* 2 — held four days, illness */
    if (b) {
      var bp = b.protocols[0];
      bp.state = 'held';
      bp.heldSince = '2026-10-17';
      dosesBetween(b, '2026-10-17', '2026-10-20', bp.protocolId).forEach(function (dose) {
        dose.status = 'held';
        dose.reason = 'cold';
        dose.note = 'hold @ same amount';
      });
      dosesBetween(b, '2026-10-17', '2026-10-20').forEach(function (dose) {
        if (dose.status === 'planned') dose.status = 'held';
        if (dose.status === 'held' && !dose.note) dose.note = 'hold @ same amount';
      });
      /* today is still open, so the run reads as four days held */
      dosesBetween(b, TODAY, TODAY).forEach(function (dose) {
        dose.status = 'planned'; dose.reason = null; dose.note = null;
      });
      b.messages = [{
        at: '2026-10-17T08:30', from: 'family',
        body: 'Fever since last night, so we are holding everything at the same amount.',
        anchorDoseId: null
      }];
    }

    /* 3 — three days nobody logged */
    if (c3) {
      dosesBetween(c3, '2026-10-18', TODAY).forEach(function (dose) {
        dose.status = 'planned';
        dose.reason = null;
        dose.note = null;
      });
      dosesBetween(c3, '2026-10-14', '2026-10-17').forEach(function (dose) {
        if (dose.status === 'planned') dose.status = 'done';
      });
    }

    /* 4 — ready to advance: five clean days at the current step */
    if (d4) {
      var dp = null;
      for (var i = 0; i < d4.protocols.length; i++) {
        if (d4.protocols[i].state !== 'maintenance') { dp = d4.protocols[i]; break; }
      }
      if (dp) {
        var proto = findById(protocols, dp.protocolId);
        var steps = proto.phases[Math.min(dp.phaseIdx, proto.phases.length - 1)].steps;
        dp.state = 'ramping';
        dp.heldSince = null;
        if (dp.stepIdx >= steps.length - 1) dp.stepIdx = Math.max(0, steps.length - 2);
        /* no reaction in the last fortnight, or the step would be pinned */
        dosesBetween(d4, addDays(TODAY, -13), TODAY).forEach(function (dose) {
          if (dose.status === 'reaction') { dose.status = 'done'; dose.note = null; }
        });
        /* a clean week, every dose logged, every one at the current step */
        dosesBetween(d4, '2026-10-14', TODAY).forEach(function (dose) {
          dose.status = 'done';
          dose.reason = null;
          dose.note = null;
        });
        dosesBetween(d4, '2026-10-16', TODAY, dp.protocolId).forEach(function (dose) {
          setStep(d4, dose, proto, dp.phaseIdx, dp.stepIdx);
        });
      }
    }
  }

  /* ======================================================== graduates ==== */
  var GRAD_RANGE = {
    egg: [11, 17], sesame: [10, 15], cashew: [8, 13],
    milk: [12, 19], wheat: [8, 12], soy: [6, 10]
  };
  var GRAD_RECENT = [
    { protocolId: 'egg', weeks: 13, practitionerId: 'p-ren', finishedISO: '2026-10-20' },
    { protocolId: 'sesame', weeks: 12, practitionerId: 'p-sol', finishedISO: '2026-10-19' },
    { protocolId: 'milk', weeks: 15, practitionerId: 'p-dana', finishedISO: '2026-10-17' },
    { protocolId: 'wheat', weeks: 10, practitionerId: 'p-kit', finishedISO: '2026-10-16' },
    { protocolId: 'egg', weeks: 14, practitionerId: 'p-sol', finishedISO: '2026-10-15' }
  ];

  function buildGraduates(rnd, protocols, nameOffset) {
    var out = [];
    var i;
    for (i = 0; i < GRAD_RECENT.length; i++) {
      var g = GRAD_RECENT[i];
      out.push({
        clientName: nameAt(nameOffset + i),
        protocolId: g.protocolId,
        allergen: findById(protocols, g.protocolId).allergen,
        weeks: g.weeks,
        practitionerId: g.practitionerId,
        finishedISO: g.finishedISO
      });
    }
    var ids = Object.keys(GRAD_RANGE);
    var staffIds = STAFF.map(function (p) { return p.id; });
    var rest = 44 - GRAD_RECENT.length;
    for (i = 0; i < rest; i++) {
      var pid = ids[Math.floor(rnd() * ids.length) % ids.length];
      var band = GRAD_RANGE[pid];
      out.push({
        clientName: nameAt(nameOffset + GRAD_RECENT.length + i),
        protocolId: pid,
        allergen: findById(protocols, pid).allergen,
        weeks: band[0] + Math.floor(rnd() * (band[1] - band[0] + 1)),
        practitionerId: staffIds[Math.floor(rnd() * staffIds.length) % staffIds.length],
        finishedISO: addDays('2026-07-24', Math.round(i * 81 / (rest - 1)))
      });
    }
    return out;
  }

  /* =================================================== protocol items ==== */
  /* NOTES §A2/§A3 and DESIGN_PASS §6. THREE prescribed things that are not
     food and are tracked nowhere today: a morning ALKA-SELTZER tablet, daily
     water DROPS, and a SPINE TAP on its own cadence.
     They are per-client (not per-allergen) and they produce entries in
     client.days alongside the doses, carrying itemType 'alka' | 'drops' |
     'tapping' and the same status vocabulary, because adherence has to count
     them — a day with the food logged and the drops missing is not a logged
     day. All three are CORE: they are timed and they are strict.

     THE ALKA-SELTZER DOSE IS A QUESTION FOR THE ROOM. Geoff gave it as "alka
     seltzer tab @ xyz amount", so `1 tab` is a placeholder standing in for a
     real prescription, and it is the one figure on these screens that nobody
     has confirmed. It is listed in the open questions for exactly that
     reason. */

  var ALKA_LABEL = 'Alka-Seltzer';
  var DROP_LABEL = 'Water drops';
  var TAP_LABEL = 'Spine tap';
  var ALKA_INSTR = 'One tablet dissolved in water, first thing, before the drops.';
  var DROP_INSTR = 'Under the tongue, in the morning, before any food.';
  var TAP_INSTR = 'Along the spine, base of the back to the neck, 2 minutes.';
  var ALKA_TIMES = ['07:15', '08:00', '07:45', '08:15', '07:30', '08:00'];
  var DROP_TIMES = ['07:35', '08:05', '08:05', '08:35', '08:05', '07:50'];
  var TAP_TIMES = ['19:00', '19:30', '18:30', '20:00', '19:00'];
  var DROP_VALUES = [2, 3, 3, 4, 3, 5, 3, 6];
  var TAP_CADENCES = [
    { days: [1, 4], label: 'Mon & Thu' },
    { days: [2, 5], label: 'Tue & Fri' },
    { days: [1, 3, 5], label: 'Mon, Wed & Fri' },
    { days: [3, 6], label: 'Wed & Sat' },
    { days: [0, 3], label: 'Sun & Thu' },
    { days: [2], label: 'Tuesdays' }
  ];
  var ITEM_HORIZON = 28;        /* days of plan ahead of the published week */

  function dow(iso) { return ((diffDays('2026-10-18', iso) % 7) + 7) % 7; }

  var ITEM_SPEC = {
    alka: {
      label: ALKA_LABEL, instructions: ALKA_INSTR, daily: true,
      doseValue: 1, doseUnit: 'tab', times: ALKA_TIMES
    },
    drops: {
      label: DROP_LABEL, instructions: DROP_INSTR, daily: true,
      doseValue: null, doseUnit: 'drops', times: DROP_TIMES
    },
    tapping: {
      label: TAP_LABEL, instructions: TAP_INSTR, daily: false,
      doseValue: 2, doseUnit: 'minutes', times: TAP_TIMES
    }
  };

  function makeItem(client, kind, i) {
    var spec = ITEM_SPEC[kind];
    var cad = TAP_CADENCES[i % TAP_CADENCES.length];
    return {
      id: 'it-' + client.id + '-' + kind,
      clientId: client.id,
      kind: kind,
      label: spec.label,
      cadence: spec.daily ? 'Daily' : cad.label,
      cadenceKind: spec.daily ? 'daily' : 'weekdays',
      cadenceDays: spec.daily ? [0, 1, 2, 3, 4, 5, 6] : cad.days.slice(),
      perWeek: spec.daily ? 7 : cad.days.length,
      doseValue: spec.doseValue === null ? DROP_VALUES[i % DROP_VALUES.length] : spec.doseValue,
      doseUnit: spec.doseUnit,
      timing: spec.times[i % spec.times.length],
      instructions: spec.instructions,
      activeFrom: null,
      activeTo: null
    };
  }

  /* The entry factory for a non-food item. Deliberately dose-SHAPED: display,
     value, unit, grams, timing, status, so a surface that walks client.days
     without filtering still renders something true ('3 drops · 8:00am')
     instead of breaking. protocolId is null and week is null, which is what
     keeps the per-protocol metrics out of its way. */
  var ITEM_PHASE = { alka: 'Alka-Seltzer', drops: 'Daily drops', tapping: 'Spine tap' };
  var ITEM_FORM = {
    alka: 'alka-seltzer tablet in water',
    drops: 'water drops',
    tapping: 'spine tap, base to neck'
  };
  var ITEM_DISPLAY = {
    alka: function (v) { return v + (v === 1 ? ' tab' : ' tabs'); },
    drops: function (v) { return v + ' drops'; },
    tapping: function (v) { return v + ' min'; }
  };

  ART.makeItemEntry = function (client, item, iso, opts) {
    opts = opts || {};
    var kind = item.kind;
    return {
      id: client.id + ':' + kind + ':' + iso,
      clientId: client.id,
      itemType: kind,
      itemId: item.id,
      protocolId: null,
      allergen: null,
      label: item.label,
      phaseLabel: ITEM_PHASE[kind] || item.label,
      foodForm: ITEM_FORM[kind] || item.label,
      display: (ITEM_DISPLAY[kind] || function (v) { return String(v); })(item.doseValue),
      value: item.doseValue,
      unit: item.doseUnit,
      grams: 0,
      timing: item.timing,
      waitLevel: 0,
      status: opts.status || 'planned',
      reason: opts.reason || null,
      note: opts.note || null,
      /* prescribed, timed and strict — every one of the three is CORE */
      band: 'core',
      loggedAt: null,
      partIdx: 0,
      partCount: 1,
      partLabel: null,
      qualifier: null,
      instructions: item.instructions,
      cadence: item.cadence,
      isMaintenance: false,
      dateISO: iso,
      stepIdx: 0,
      phaseIdx: 0,
      week: null
    };
  };

  function itemDue(item, iso) {
    if (item.cadenceKind === 'daily') return true;
    return item.cadenceDays.indexOf(dow(iso)) >= 0;
  }

  function hasEntry(client, iso, kind) {
    var list = client.days[iso];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) if (list[i].itemType === kind) return true;
    return false;
  }

  /* Idempotent: fills in any missing item entry across [fromISO..toISO].
     publishPlan() calls it so a week published past the seeded horizon still
     has its drops and its tap. */
  ART.ensureItems = function (client, fromISO, toISO) {
    var items = (ART.db && ART.db.protocolItems) || [];
    var mine = items.filter(function (it) { return it.clientId === client.id; });
    if (!mine.length) return 0;
    var made = 0;
    mine.forEach(function (item) {
      for (var iso = fromISO; diffDays(iso, toISO) >= 0; iso = addDays(iso, 1)) {
        if (item.activeTo && diffDays(item.activeTo, iso) > 0) break;
        if (!itemDue(item, iso)) continue;
        if (hasEntry(client, iso, item.kind)) continue;
        putDose(client, ART.makeItemEntry(client, item, iso, { status: 'planned' }));
        made++;
      }
    });
    return made;
  };

  function firstDoseISO(client) {
    var isos = Object.keys(client.days).sort();
    return isos.length ? isos[0] : TODAY;
  }
  function lastDoseISO(client) {
    var isos = Object.keys(client.days).sort();
    return isos.length ? isos[isos.length - 1] : TODAY;
  }

  /* The household's own logging rate, measured off the doses that already
     exist, so an item's rate is anchored to the same family's behaviour. */
  function measuredLogRate(client) {
    var logged = 0, planned = 0;
    for (var k = 0; k < 90; k++) {
      var list = client.days[addDays(TODAY, -k)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        if (list[i].itemType !== 'dose') continue;
        planned++;
        if (list[i].status !== 'planned') logged++;
      }
    }
    return planned ? logged / planned : 0.8;
  }

  /* …and per day, because the drops get remembered on the days the food gets
     remembered. Correlating them is what makes "the food is logged and the
     drops are not" a real, findable shape in the data rather than noise. */
  function dayLogIndex(client) {
    var index = {};
    Object.keys(client.days).forEach(function (iso) {
      var doses = 0, logged = 0;
      client.days[iso].forEach(function (e) {
        if (e.itemType !== 'dose') return;
        doses++;
        if (e.status !== 'planned') logged++;
      });
      index[iso] = doses ? logged / doses : -1;
    });
    return index;
  }

  function buildProtocolItems(clients) {
    var rnd = mulberry32(0x17E45);
    var items = [];

    clients.forEach(function (client, i) {
      var mara = client.id === 'c-mara';
      var alka = makeItem(client, 'alka', i);
      var drops = makeItem(client, 'drops', i);
      /* Mara is on screen for the whole demo, so her items are the ones the
         briefs name, to the letter: the tablet at 8:00a, 3 drops five minutes
         later, and the tap twice a week on Mon & Thu at 19:00. The tablet
         comes BEFORE the drops — that order is the prescription. */
      if (mara) {
        alka.timing = '08:00';
        drops.doseValue = 3;
        drops.timing = '08:05';
      }
      var wantsTap = mara || (i % 5 !== 3);     /* ~80% of the practice */
      var tap = wantsTap ? makeItem(client, 'tapping', mara ? 0 : i) : null;
      if (tap && mara) { tap.timing = '19:00'; }

      var from = firstDoseISO(client);
      if (diffDays(HISTORY_FLOOR, from) < 0) from = HISTORY_FLOOR;
      var to = client.status === 'paused' ? lastDoseISO(client) : addDays(PLAN_END, ITEM_HORIZON);
      var dayLog = dayLogIndex(client);

      [alka, drops, tap].forEach(function (item) {
        if (!item) return;
        item.activeFrom = from;
        item.activeTo = client.status === 'paused' ? to : null;
        items.push(item);

        /* The tablet rides with breakfast, so it is remembered about as well
           as the food; the drops get forgotten more often; and the
           twice-weekly tap more often still — it has no mealtime to hang off.
           That gradient is the finding, so it lives in the data and nowhere
           else. */
        var base = measuredLogRate(client);
        var rate = item.kind === 'alka'
          ? Math.max(0.30, base - 0.02)
          : item.kind === 'drops'
            ? Math.max(0.24, base - 0.06)
            : Math.max(0.18, base - 0.11);

        for (var iso = from; diffDays(iso, to) >= 0; iso = addDays(iso, 1)) {
          if (!itemDue(item, iso)) continue;
          var status = 'planned', reason = null;
          if (diffDays(TODAY, iso) <= 0) {
            var f = dayLog[iso];
            if (f === undefined || f < 0) f = 0.85;
            var p = Math.max(0.05, Math.min(0.97, rate * (0.70 + 0.38 * f)));
            var r = rnd();
            if (r < p) {
              status = r < p * 0.93 ? 'done' : 'skipped';
              if (status === 'skipped') reason = pick(rnd, REASONS);
            }
          }
          putDose(client, ART.makeItemEntry(client, item, iso, {
            status: status,
            reason: reason,
            note: null
          }));
        }
      });
    });

    return items;
  }

  /* A day on which nobody logged a single dose is a day nobody opened the
     app, so its drops and its tap cannot be logged either. Without this the
     roster's "3 days unlogged" client silently stops being one. */
  function alignUnloggedDays(clients) {
    clients.forEach(function (client) {
      Object.keys(client.days).forEach(function (iso) {
        if (diffDays(iso, TODAY) < 0) return;
        var list = client.days[iso];
        var doses = 0, logged = 0;
        list.forEach(function (e) {
          if (e.itemType !== 'dose') return;
          doses++;
          if (e.status !== 'planned') logged++;
        });
        if (!doses || logged) return;
        list.forEach(function (e) {
          if (e.itemType === 'dose') return;
          e.status = 'planned';
          e.reason = null;
          e.note = null;
        });
      });
    });
  }

  /* Mara's week, by hand — and it is the state every HOME and SCHEDULE screen
     on the board renders, so each line here is a deliberate claim.

     Today is Wednesday 10/21 and the clock inside the phones is 4:08pm. By
     then she has had the tablet and her baked egg, the drops were due at 8:05
     and are still open, sesame is twenty-two minutes away, the second egg
     serving has not happened yet, and MONDAY'S SPINE TAP was never written
     down — which is exactly the thing the product catches and the booklet
     cannot. That gives HOME an UP NEXT, an overdue row, a tally with real
     history behind it, and five buttons that all do something. */
  function tuneMaraItems(mara) {
    function set(kind, iso, status) {
      var list = mara.days[iso] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].itemType === kind) {
          list[i].status = status;
          list[i].reason = null;
          return list[i];
        }
      }
      return null;
    }
    /* the maintenance servings are two rows, so they are addressed by part */
    function setPart(protocolId, iso, partIdx, status) {
      var list = mara.days[iso] || [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.itemType !== 'dose' || e.protocolId !== protocolId) continue;
        if ((e.partIdx || 0) !== partIdx) continue;
        e.status = status;
        e.reason = null;
        e.note = null;
        return e;
      }
      return null;
    }
    var iso;
    for (iso = '2026-09-21'; diffDays(iso, '2026-10-20') >= 0; iso = addDays(iso, 1)) {
      set('alka', iso, 'done');
      set('drops', iso, 'done');
    }
    /* the two mornings the drops were skipped, and the one the tablet was */
    set('drops', '2026-10-06', 'skipped');
    set('drops', '2026-10-14', 'skipped');
    set('alka', '2026-10-14', 'skipped');
    /* today: the tablet taken at 8, the drops still open at four in the
       afternoon — the gap the product exists to catch */
    set('alka', TODAY, 'done');
    set('drops', TODAY, 'planned');
    /* the taps she did: Thu 10/15, Mon 10/12, Thu 10/08 … and the one she
       missed, Mon 10/19 */
    ['2026-09-24', '2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08',
      '2026-10-12', '2026-10-15'].forEach(function (d) { set('tapping', d, 'done'); });
    set('tapping', '2026-10-19', 'planned');
    /* OTHER: the baked egg went in at breakfast, the second egg serving is
       still to come. SCHEDULE's OTHER band needs a real unticked row and
       HOME's `Food` button needs something to log. */
    setPart('egg', TODAY, 1, 'planned');
    /* yesterday she only managed the baked one — maintenance variety is the
       hard part of maintenance, which is the whole case for Meal ideas */
    setPart('egg', '2026-10-20', 1, 'planned');
  }

  /* ===================================================== logged clocks === */
  /* `timing` is the clock the practitioner PRESCRIBED. `loggedAt` is the clock
     the thing actually happened on, and it is what the HOME tally prints —
     the tally is a history of events, not a reprint of the plan. The two are
     different facts and the product shows both: SCHEDULE renders timing,
     HOME's feed renders loggedAt.
     An OTHER item has no prescribed clock at all, so there is nothing to fall
     back on and this pass is the only place its time comes from: a maintenance
     serving lands near a meal, which is how a family actually fits it in.
     Two passes over each day, in that order, because the prescription has an
     order: the tablet and the drops come BEFORE any food, so a maintenance
     serving can never be stamped earlier than that morning's last CORE item.
     One seeded prng, walked in a fixed order, so the feed is byte-identical
     on every reload and after Reset. */
  var OTHER_ANCHOR = [8 * 60 + 40, 17 * 60 + 45];   /* breakfast, then dinner */
  var NOON = 12 * 60;

  function assignLoggedAt(clients) {
    var rnd = mulberry32(0x10C9ED);
    clients.forEach(function (client) {
      Object.keys(client.days).sort().forEach(function (iso) {
        var list = client.days[iso];
        var i, e;
        /* 1 — everything with a prescribed clock. A parent logs it while they
           are still standing there, so within twenty minutes of the time. */
        var morning = -1;
        for (i = 0; i < list.length; i++) {
          e = list[i];
          if (e.status === 'planned') { e.loggedAt = null; continue; }
          if (e.band === 'other') continue;
          var at = ui.minutesOf(e.timing) + Math.floor(rnd() * 19);
          e.loggedAt = ui.fromMinutes(at);
          if (ui.minutesOf(e.timing) < NOON && at > morning) morning = at;
        }
        /* 2 — the untimed servings, around a meal, and never before the
           tablet and the drops that morning */
        for (i = 0; i < list.length; i++) {
          e = list[i];
          if (e.status === 'planned' || e.band !== 'other') continue;
          var anchor = OTHER_ANCHOR[(e.partIdx || 0) % OTHER_ANCHOR.length] +
            Math.floor(rnd() * 51) - 20;
          if (anchor < NOON && morning >= 0) anchor = Math.max(anchor, morning + 8);
          e.loggedAt = ui.fromMinutes(anchor);
        }
      });
    });
  }

  /* ======================================================= meal ideas ==== */
  /* NOTES §A4/§A5. Maintenance is the long part — "1-2 servings daily,
     ideally for 3 months" — and by then the problem is variety, not safety.
     22 curated ideas across seven foods, then 7 from families, at the four
     statuses the review loop actually produces. */

  function curated(id, allergen, protocolId, title, minutes, body, tags, saved, createdAt) {
    return {
      id: id, allergen: allergen, protocolId: protocolId, title: title,
      body: body, minutes: minutes, tags: tags,
      source: 'curated', submittedByName: null,
      status: 'approved', reviewedBy: null, reviewedByName: null, reviewedAt: null,
      reviewNote: null, isCommunal: true,
      savedCount: saved, savedByClientIds: [], createdAt: createdAt
    };
  }

  function buildMealIdeas() {
    var out = [
      curated('mi-egg-1', 'Egg', 'egg', 'Banana egg pancakes', 10,
        'Two eggs mashed into one banana and cooked as small rounds. Three rounds is about a serving, and they freeze flat.',
        ['breakfast', 'freezer'], 46, '2026-06-18'),
      curated('mi-egg-2', 'Egg', 'egg', 'French toast sticks, cut and frozen', 25,
        'Make a loaf of it on Sunday, cut into sticks and freeze on a tray. Two sticks from the toaster is the baked serving on a school morning.',
        ['batch cook', 'freezer', 'breakfast'], 61, '2026-06-18'),
      curated('mi-egg-3', 'Egg', 'egg', 'Egg-fried rice from last night’s rice', 12,
        'Cold rice, one beaten egg per child, frozen peas. The egg goes in last and sets in thirty seconds.',
        ['dinner', 'leftovers'], 38, '2026-07-02'),
      curated('mi-egg-4', 'Egg', 'egg', 'Chocolate mousse pots', 15,
        'Melted chocolate folded through whipped egg white and set in small glasses. Covers the non-baked serving and reads as a pudding, not a dose.',
        ['sweet', 'make ahead'], 52, '2026-07-02'),
      curated('mi-egg-5', 'Egg', 'egg', 'Mayonnaise as a dip, not a condiment', 3,
        'A spoon of real mayonnaise beside chips or chicken strips. For a child who refuses visible egg, this is usually the one that lands.',
        ['no cook', 'refusal'], 44, '2026-07-16'),

      curated('mi-ses-1', 'Sesame', 'sesame', 'Tahini and maple on apple slices', 4,
        'A teaspoon of tahini loosened with maple syrup, apple slices to dip. Sweet enough to be eaten without hiding anything.',
        ['no cook', 'snack'], 33, '2026-06-25'),
      curated('mi-ses-2', 'Sesame', 'sesame', 'Hummus instead of butter in the sandwich', 3,
        'Spread it right out to the crusts. A sandwich’s worth is a full serving, and nobody notices the swap after the first week.',
        ['lunchbox', 'no cook'], 57, '2026-06-25'),
      curated('mi-ses-3', 'Sesame', 'sesame', 'A sesame jar on the table', 5,
        'Toast a jar of seeds and keep it next to the salt. A teaspoon goes on rice, on eggs, on noodles, on anything.',
        ['batch cook', 'habit'], 41, '2026-08-06'),
      curated('mi-ses-4', 'Sesame', 'sesame', 'Halva crumbled over yogurt', 4,
        'A thumb of halva crushed with a fork over plain yogurt. Sweet, and the serving is small.',
        ['sweet', 'no cook'], 22, '2026-08-06'),

      curated('mi-cas-1', 'Cashew', 'cashew', 'Cashew butter stirred into warm oats', 6,
        'A tablespoon melts straight into hot oatmeal and disappears into the cinnamon.',
        ['breakfast'], 29, '2026-07-09'),
      curated('mi-cas-2', 'Cashew', 'cashew', 'The trail-mix cup', 4,
        'Count the pieces into a cup with raisins and cereal. The count is the dose, and it travels.',
        ['no cook', 'lunchbox'], 35, '2026-07-09'),
      curated('mi-cas-3', 'Cashew', 'cashew', 'Cashew cream pasta sauce', 15,
        'Soaked cashews blitzed with pasta water and lemon. Pours like a cream sauce, and a child’s portion carries the whole serving.',
        ['dinner', 'batch cook'], 26, '2026-08-20'),

      curated('mi-milk-1', 'Milk', 'milk', 'Frozen banana yogurt smoothie', 5,
        'A full pot of yogurt, a frozen banana, a splash of milk. Thick enough to need a spoon, which helps.',
        ['breakfast', 'no cook'], 48, '2026-07-23'),
      curated('mi-milk-2', 'Milk', 'milk', 'Hot cocoa as the evening serving', 6,
        'Whole milk on the hob with cocoa. It reads as the end of the day rather than as a dose.',
        ['habit', 'evening'], 54, '2026-07-23'),
      curated('mi-milk-3', 'Milk', 'milk', 'Macaroni with a real cheese sauce', 20,
        'Butter, flour, milk, cheese. One child’s bowl covers the serving twice over.',
        ['dinner'], 39, '2026-09-03'),

      curated('mi-whe-1', 'Wheat', 'wheat', 'Pasta night, twice a week, fixed', 15,
        'Put it in the week as a night, not as a dose. A child’s bowl is a serving and nobody asks why.',
        ['dinner', 'habit'], 31, '2026-08-13'),
      curated('mi-whe-2', 'Wheat', 'wheat', 'Soft pretzel from the freezer aisle', 8,
        'Oven from frozen, eight minutes, torn into pieces. Reliable on a day when nothing else is being eaten.',
        ['freezer', 'refusal'], 27, '2026-08-13'),
      curated('mi-whe-3', 'Wheat', 'wheat', 'Pita strips with the hummus', 3,
        'Cut a pita into strips and let it ride along with the sesame serving. Two foods, one plate.',
        ['no cook', 'lunchbox'], 24, '2026-09-17'),

      curated('mi-soy-1', 'Soy', 'soy', 'Edamame as the television snack', 6,
        'Frozen, boiled four minutes, salted. Podding them is half the appeal, and the count is easy to keep.',
        ['snack'], 30, '2026-08-27'),
      curated('mi-soy-2', 'Soy', 'soy', 'Tofu cubes crisped in the air fryer', 18,
        'Pressed, cubed, dusted with cornflour, twelve minutes. They come out like croutons and go in a wrap.',
        ['dinner', 'batch cook'], 21, '2026-08-27'),

      curated('mi-pea-1', 'Peanut', 'peanut', 'Peanut butter on the breakfast toast', 3,
        'Thin, right to the edges, every morning at the same time. The habit does the work, not the recipe.',
        ['breakfast', 'habit'], 36, '2026-09-24'),
      curated('mi-pea-2', 'Peanut', 'peanut', 'Satay dip for chicken strips', 12,
        'Peanut butter, coconut milk and a little soy, warmed through. A dip is easier than a spread for a cautious child.',
        ['dinner'], 19, '2026-09-24')
    ];

    function family(o) {
      out.push({
        id: o.id, allergen: o.allergen, protocolId: o.protocolId, title: o.title,
        body: o.body, minutes: o.minutes, tags: o.tags,
        source: 'family', submittedByName: o.by,
        status: o.status,
        reviewedBy: o.reviewedBy || null,
        reviewedByName: o.reviewedByName || null,
        reviewedAt: o.reviewedAt || null,
        reviewNote: o.reviewNote || null,
        isCommunal: !!o.isCommunal,
        savedCount: o.savedCount,
        savedByClientIds: o.savedByClientIds || [],
        createdAt: o.createdAt
      });
    }

    family({
      id: 'mi-fam-1', allergen: 'Egg', protocolId: 'egg',
      title: 'Egg in the waffle batter, Sunday batch', minutes: 20,
      body: 'We make a double batch of waffles on Sunday with two extra eggs in the batter and freeze them. Two squares from the toaster is the baked serving, and it is the only breakfast she asks for.',
      tags: ['batch cook', 'freezer', 'breakfast'], by: 'Noor H.’s family',
      status: 'approved', isCommunal: true, savedCount: 31,
      reviewedBy: 'p-ren', reviewedAt: '2026-09-29',
      reviewNote: 'Baked egg, and the portion stays the same every day. Good for the library.'
    });
    family({
      id: 'mi-fam-2', allergen: 'Sesame', protocolId: 'sesame',
      title: 'Tahini in the smoothie, not on the plate', minutes: 5,
      body: 'A heaped teaspoon of tahini in a banana smoothie. He will not touch hummus but he drinks this every afternoon without a word about it.',
      tags: ['no cook', 'refusal'], by: 'Theo L.’s family',
      status: 'approved', isCommunal: true, savedCount: 24,
      reviewedBy: 'p-sol', reviewedAt: '2026-10-02',
      reviewNote: 'Approved. Level the spoon so the amount is the same each day.'
    });
    family({
      id: 'mi-fam-3', allergen: 'Cashew', protocolId: 'cashew',
      title: 'Cashew butter on rice cakes before school', minutes: 4,
      body: 'Rice cake, thin layer, straight after the drops. It is the one thing he will eat standing up at the door.',
      tags: ['breakfast', 'no cook'], by: 'Alma W.’s family',
      status: 'approved', isCommunal: true, savedCount: 18,
      reviewedBy: 'p-dana', reviewedAt: '2026-10-06',
      reviewNote: 'Approved, and pairing it with the drops is a habit worth copying.'
    });
    family({
      id: 'mi-fam-4', allergen: 'Egg', protocolId: 'egg',
      title: 'French toast muffins', minutes: 30,
      body: 'The same custard as French toast, baked in a muffin tin, so every one is the same size. We weighed one at 42 g, which is what the booklet calls a piece.',
      tags: ['batch cook', 'breakfast'], by: 'Priya N.’s family',
      status: 'submitted', isCommunal: false, savedCount: 3, createdAt: '2026-10-19'
    });
    family({
      id: 'mi-fam-5', allergen: 'Soy', protocolId: 'soy',
      title: 'Edamame pasta on a Friday', minutes: 15,
      body: 'Edamame pasta instead of wheat pasta on Fridays. One bowl covers the soy serving and it looks like a normal dinner, which matters more than we expected.',
      tags: ['dinner', 'habit'], by: 'Beck T.’s family',
      status: 'submitted', isCommunal: false, savedCount: 2, createdAt: '2026-10-20'
    });
    family({
      id: 'mi-fam-6', allergen: 'Egg', protocolId: 'egg',
      title: 'Mayonnaise in the tuna she already eats', minutes: 5,
      body: 'She will not eat visible egg but she has always eaten tuna mayo. Two tablespoons of real mayonnaise in the tuna covers the non-baked serving.',
      tags: ['no cook', 'refusal'], by: 'Mara R.’s family',
      status: 'saved', isCommunal: false, savedCount: 1,
      savedByClientIds: ['c-mara'], createdAt: '2026-10-20'
    });
    family({
      id: 'mi-fam-7', allergen: 'Egg', protocolId: 'egg',
      title: 'Egg hidden in the brownie mix', minutes: 25,
      body: 'We put the egg into brownies and did not tell him it was in there, because it is the only way he will take it.',
      tags: ['sweet', 'refusal'], by: 'Finn D.’s family',
      status: 'declined', isCommunal: false, savedCount: 0,
      reviewedBy: 'p-ren', reviewedAt: '2026-10-13',
      reviewNote: 'Not for the shared library. Hiding the dose undoes the fear work, and a child needs to know what they ate if there is a reaction. Happy to help find a brownie he knows about.'
    });

    out.forEach(function (idea, i) {
      if (idea.createdAt) return;
      idea.createdAt = addDays('2026-06-18', i * 3);
    });
    return out;
  }

  /* ======================================================= phase runs ==== */
  /* NOTES §B3 — the analytics spine, and the thing the practice asked for by
     name: "how long it takes for a client to make it through a specific
     phase", and "specifically where there are slowdowns".
     The unit is a PhaseRun: one client, one phase, planned days against the
     days it actually took, plus the days that were re-administered instead of
     advanced. Journeys (a whole food, start to finish) are built from the
     same runs so the micro view and the macro view cannot disagree.

     The bias lives here and nowhere else, so the chart DISCOVERS it:
     Egg -> French toast at age 2-3 runs 14 planned days in about 21, with
     roughly 38% repeat days. Everything else stays plausible — most phases
     within a couple of days of plan, a few mild overruns, and Sesame ->
     Hummus genuinely faster than plan so the chart is not one-way. */

  var AGE_BANDS = [
    { key: 'under 2', label: 'Under 2', min: 0, max: 1 },
    { key: '2-3', label: '2–3', min: 2, max: 3 },
    { key: '4-6', label: '4–6', min: 4, max: 6 },
    { key: '7-10', label: '7–10', min: 7, max: 10 },
    { key: '11+', label: '11+', min: 11, max: 999 }
  ];
  function ageBandOf(age) {
    var a = Math.max(0, Math.round(+age || 0));
    for (var i = 0; i < AGE_BANDS.length; i++) {
      if (a >= AGE_BANDS[i].min && a <= AGE_BANDS[i].max) return AGE_BANDS[i].key;
    }
    return '11+';
  }
  function ageBandLabel(key) {
    var k = String(key || '').replace(/[‒-―]/g, '-');
    for (var i = 0; i < AGE_BANDS.length; i++) if (AGE_BANDS[i].key === k) return AGE_BANDS[i].label;
    return k || '—';
  }

  /* mean overrun in days, per phase */
  var OVERRUN = {
    'egg#0': 1, 'egg#1': 0, 'egg#2': 2.5, 'egg#3': 0, 'egg#4': 0.5,
    'sesame#0': 1.5, 'sesame#1': 1, 'sesame#2': -2, 'sesame#3': 1,
    'cashew#0': 0.5, 'cashew#1': 0.5,
    'milk#0': 0.5, 'milk#1': 1, 'milk#2': 3,
    'wheat#0': -1, 'wheat#1': 0,
    'soy#0': 0, 'soy#1': -1,
    'peanut#0': 2, 'peanut#1': 1, 'treenut#0': 1
  };
  var OVERRUN_AGE = { 'under 2': 1.5, '2-3': 1, '4-6': 0.25, '7-10': 0, '11+': -0.5 };
  /* the interaction that IS the finding: the French toast phase of egg, and a
     very young child who cannot be talked through a piece of it */
  var FT_AGE = { 'under 2': 2.5, '2-3': 3.5, '4-6': 1.5, '7-10': 0.5, '11+': 0 };

  var REPEAT = {
    'egg#0': 0.12, 'egg#1': 0.04, 'egg#2': 0.26, 'egg#3': 0.05, 'egg#4': 0.07,
    'sesame#0': 0.10, 'sesame#1': 0.08, 'sesame#2': 0.03, 'sesame#3': 0.11,
    'cashew#0': 0.09, 'cashew#1': 0.08,
    'milk#0': 0.08, 'milk#1': 0.10, 'milk#2': 0.13,
    'wheat#0': 0.05, 'wheat#1': 0.04,
    'soy#0': 0.06, 'soy#1': 0.04,
    'peanut#0': 0.12, 'peanut#1': 0.09, 'treenut#0': 0.08
  };
  var REPEAT_AGE = { 'under 2': 0.10, '2-3': 0.07, '4-6': 0.03, '7-10': 0, '11+': -0.01 };
  var FT_REPEAT = { 'under 2': 0.06, '2-3': 0.05, '4-6': 0.02, '7-10': 0, '11+': 0 };

  var PHASE_GAP = 4;            /* days between finishing one phase and starting the next */

  function phaseKeyOf(protocolId, phaseIdx) { return protocolId + '#' + phaseIdx; }

  /* symmetric, so the MEDIAN of a cell lands on its mean */
  function jitter(rnd, spread) {
    return Math.round((rnd() + rnd() + rnd() - 1.5) * spread);
  }

  function drawActual(rnd, key, band, planned) {
    var mean = planned + (OVERRUN[key] || 0) + (OVERRUN_AGE[band] || 0) +
      (key === 'egg#2' ? (FT_AGE[band] || 0) : 0);
    var v = Math.round(mean) + jitter(rnd, planned >= 12 ? 2.2 : 1.2);
    var floor = Math.max(2, Math.ceil(planned * 0.45));
    return Math.max(floor, Math.min(Math.round(planned * 2.6) + 2, v));
  }

  function drawRepeat(rnd, key, band, actual) {
    var frac = (REPEAT[key] || 0.07) + (REPEAT_AGE[band] || 0) +
      (key === 'egg#2' ? (FT_REPEAT[band] || 0) : 0);
    frac = Math.max(0, Math.min(0.62, frac));
    var v = Math.round(actual * frac) + jitter(rnd, 0.8);
    return Math.max(0, Math.min(actual - 1, v));
  }

  function ageAtISO(baseAge, iso) {
    var back = diffDays(iso, TODAY);
    return Math.max(1, (+baseAge || 1) - Math.floor(Math.max(0, back) / 365));
  }

  /* Builds the phase runs of one journey, chained BACKWARDS from `anchorISO`
     (the day the last included phase finished), which is the only anchor the
     rest of the dataset actually fixes. */
  function journeyRuns(rnd, ref, proto, phaseCount, anchorISO, journeyId) {
    var runs = [];
    var cursor = anchorISO;
    for (var i = phaseCount - 1; i >= 0; i--) {
      var phase = proto.phases[i];
      var key = phaseKeyOf(proto.id, i);
      var ageAt = ageAtISO(ref.age, cursor);
      var band = ageBandOf(ageAt);
      var planned = phase.days;
      var actual = drawActual(rnd, key, band, planned);
      var repeat = drawRepeat(rnd, key, band, actual);
      var startedOn = addDays(cursor, -(actual - 1));
      runs.push({
        id: journeyId + ':p' + i,
        journeyId: journeyId,
        clientId: ref.clientId,
        clientName: ref.clientName,
        practitionerId: ref.practitionerId,
        protocolId: proto.id,
        allergen: proto.allergen,
        phaseIdx: i,
        phaseKey: key,
        phaseLabel: phase.label,
        foodForm: phase.foodForm,
        ageAtRun: ageAt,
        ageBand: band,
        ageBandLabel: ageBandLabel(band),
        plannedDays: planned,
        actualDays: actual,
        repeatDays: repeat,
        startedOn: startedOn,
        completedOn: cursor,
        overrun: actual - planned
      });
      cursor = addDays(startedOn, -(PHASE_GAP + 1));
    }
    runs.reverse();
    return runs;
  }

  function journeyOf(ref, proto, runs, kind, complete) {
    var planned = 0, actual = 0, repeat = 0, over = 0;
    runs.forEach(function (r) {
      planned += r.plannedDays; actual += r.actualDays;
      repeat += r.repeatDays; over += r.overrun;
    });
    /* A protocol is sold as an N-week protocol; what a family lives is N weeks
       plus whatever the phases overran by. Stating it that way is what keeps
       "week 7 of 12" on the roster and "median weeks to food freedom" on the
       dashboard talking about the same thing — and it is carried to one
       decimal, because a two-phase food rounded to whole weeks would read as
       though every child finished it on exactly the same day. */
    return {
      id: runs.length ? runs[0].journeyId : (ref.clientId + ':' + proto.id),
      kind: kind,
      complete: !!complete,
      clientId: ref.clientId,
      clientName: ref.clientName,
      practitionerId: ref.practitionerId,
      protocolId: proto.id,
      allergen: proto.allergen,
      age: ref.age,
      ageBand: ageBandOf(ref.age),
      phases: runs.length,
      startedOn: runs.length ? runs[0].startedOn : null,
      completedOn: runs.length ? runs[runs.length - 1].completedOn : null,
      plannedDays: planned,
      actualDays: actual,
      repeatDays: repeat,
      overrun: over,
      weeks: complete ? Math.round((proto.weeks * 7 + over) / 7 * 10) / 10 : null,
      plannedWeeks: proto.weeks
    };
  }

  /* the day before the client's CURRENT phase began, read off the dose
     history, so an in-flight journey lines up with the walk that produced it */
  function phaseStartISO(client, protocolId, phaseIdx, maintenance) {
    var isos = Object.keys(client.days).sort();
    for (var i = 0; i < isos.length; i++) {
      var list = client.days[isos[i]];
      for (var j = 0; j < list.length; j++) {
        var d = list[j];
        if (d.protocolId !== protocolId) continue;
        if (maintenance ? d.isMaintenance : (!d.isMaintenance && d.phaseIdx === phaseIdx)) {
          return isos[i];
        }
      }
    }
    return null;
  }

  function buildPhaseRuns(clients, graduates, protocols) {
    var rnd = mulberry32(0x9B5E11);
    var runs = [];
    var journeys = [];
    function proto(id) { return findById(protocols, id) || CANON[id]; }

    /* 1 — graduates: a whole food, finished. These are the only journeys
       time-to-freedom counts, so its medians and the all-time graduate count
       stay the same fact. */
    graduates.forEach(function (g, i) {
      var p = proto(g.protocolId);
      if (!p) return;
      if (g.age === undefined) g.age = ageFromUnit(rnd());
      var ref = {
        clientId: 'g-' + i, clientName: g.clientName,
        practitionerId: g.practitionerId, age: g.age
      };
      var jid = 'j-grad-' + i;
      var rs = journeyRuns(rnd, ref, p, p.phases.length, g.finishedISO, jid);
      var j = journeyOf(ref, p, rs, 'graduate', true);
      g.weeks = j.weeks;                  /* one number, derived once */
      g.ageBand = j.ageBand;
      journeys.push(j);
      runs = runs.concat(rs);
    });

    /* 2 — the foods a current client has already finished, and the phases
       they have already come through on the food they are on now. */
    clients.forEach(function (client) {
      var ref = {
        clientId: client.id, clientName: client.name,
        practitionerId: client.practitionerId, age: client.age
      };

      (client.history || []).forEach(function (h, hi) {
        var p = proto(h.protocolId);
        if (!p) return;
        var jid = 'j-' + client.id + '-h' + hi;
        var rs = journeyRuns(rnd, ref, p, p.phases.length, h.finishedISO, jid);
        var j = journeyOf(ref, p, rs, 'completed-food', true);
        h.weeks = j.weeks;
        h.startedISO = j.startedOn;
        journeys.push(j);
        runs = runs.concat(rs);
      });

      (client.protocols || []).forEach(function (cp, pi) {
        var p = proto(cp.protocolId);
        if (!p) return;
        var maint = cp.state === 'maintenance';
        var done = maint ? p.phases.length : cp.phaseIdx;
        if (done <= 0) return;
        var boundary = phaseStartISO(client, cp.protocolId, cp.phaseIdx, maint);
        var anchor = boundary ? addDays(boundary, -1) : addDays(TODAY, -3);
        var jid = 'j-' + client.id + '-' + cp.protocolId + '-' + pi;
        var rs = journeyRuns(rnd, ref, p, done, anchor, jid);
        var j = journeyOf(ref, p, rs, maint ? 'maintenance' : 'in-flight', false);
        j.phasesTotal = p.phases.length;
        journeys.push(j);
        runs = runs.concat(rs);
      });
    });

    return { runs: runs, journeys: journeys };
  }

  ART.ageBands = AGE_BANDS.map(function (b) { return { key: b.key, label: b.label }; });
  ART.ageBandOf = ageBandOf;
  ART.ageBandLabel = ageBandLabel;
  ART.phaseKeyOf = phaseKeyOf;

  /* ---------------------------------------------------------- accessors -- */
  /* client.days[iso] now holds doses AND items. Anything that means "the food
     doses" must filter; anything that means "the day" must not. */
  ART.dayEntries = function (client, iso) {
    if (!client) return [];
    return (client.days[iso] || []).slice();
  };
  ART.dayDoses = function (client, iso) {
    if (!client) return [];
    return (client.days[iso] || []).filter(function (e) { return e.itemType === 'dose'; });
  };
  /* the prescribed non-food items — the tablet, the drops, the tap */
  ART.dayItems = function (client, iso) {
    if (!client) return [];
    return (client.days[iso] || []).filter(function (e) {
      return !!e.itemType && e.itemType !== 'dose';
    });
  };
  /* one band of one day, in clock order. ART.metrics.daySplit() returns both
     at once with the counts, and is what HOME and SCHEDULE actually read. */
  ART.dayBand = function (client, iso, band) {
    if (!client) return [];
    return (client.days[iso] || []).filter(function (e) {
      return (e.band || 'core') === band;
    }).sort(ART.entryOrder);
  };

  /* The short name a row carries. 'Alka-Seltzer' · 'Drops' · 'Spine tap' ·
     the allergen. One vocabulary, so the tally, the schedule, the buttons and
     the aria-labels cannot drift apart. The full label ('Water drops') is on
     the entry and belongs on Prep. */
  var SHORT_LABEL = { alka: 'Alka-Seltzer', drops: 'Drops', tapping: 'Spine tap' };
  ART.entryLabel = function (entry) {
    if (!entry) return '—';
    var k = entry.itemType || 'dose';
    if (k !== 'dose') return SHORT_LABEL[k] || String(entry.label || k);
    return String(entry.allergen || 'Dose');
  };
  /* 'alka' | 'drops' | 'tapping' — the non-food kinds, in day order. */
  ART.itemKinds = ['alka', 'drops', 'tapping'];
  ART.protocolItems = function (clientId) {
    var id = clientId && clientId.id ? clientId.id : clientId;
    return ((ART.db && ART.db.protocolItems) || []).filter(function (it) {
      return it.clientId === id;
    });
  };
  ART.mealIdea = function (id) {
    return findById((ART.db && ART.db.mealIdeas) || [], id);
  };

  /* ============================================================ seed ===== */
  ART.seed = function () {
    var rnd = mulberry32(0x5EEDA27);
    var protocols = buildProtocols();
    var centres = buildCentres();

    var mara = buildMara();
    var generated = buildGenerated(rnd);
    var clients = [mara].concat(generated);
    applyTriage(clients, protocols);

    var practitioners = STAFF.map(function (p) {
      return {
        id: p.id, name: p.name, centreId: p.centreId, kind: p.kind,
        capacity: p.capacity,
        clientIds: clients.filter(function (c) {
          return c.practitionerId === p.id && c.status === 'active';
        }).map(function (c) { return c.id; }),
        pausedClientIds: clients.filter(function (c) {
          return c.practitionerId === p.id && c.status === 'paused';
        }).map(function (c) { return c.id; })
      };
    });

    var graduates = buildGraduates(rnd, protocols, generated.length + 1);

    /* the three non-food items, their entries, and the day-level alignment
       that keeps "nobody logged anything" honest */
    var protocolItems = buildProtocolItems(clients);
    alignUnloggedDays(clients);
    tuneMaraItems(mara);
    clients.forEach(sortDays);
    /* last, because it walks each day in its final order */
    assignLoggedAt(clients);

    /* the analytics spine. buildPhaseRuns also writes back the one derived
       duration — graduate.weeks and history[].weeks — so a journey's length
       is computed in exactly one place. */
    var spine = buildPhaseRuns(clients, graduates, protocols);

    return {
      protocols: protocols,
      clients: clients,
      practitioners: practitioners,
      centres: centres,
      graduates: graduates,
      waitlist: 63,
      protocolItems: protocolItems,
      mealIdeas: buildMealIdeas(),
      phaseRuns: spine.runs,
      journeys: spine.journeys
    };
  };

  /* seeded at load so no surface can ever see an empty dataset; ART.db keeps
     this identity for the whole session (reset() refills it in place). */
  ART.db = ART.seed();
})();
