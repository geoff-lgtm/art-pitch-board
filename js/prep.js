/* ===========================================================================
   A.R.T. pitch canvas — js/prep.js            owner: data            SPEC §6
   ---------------------------------------------------------------------------
   The dose/fraction engine. This is the arithmetic a parent currently does on
   a cutting board at 6pm with a hungry child, and it is the single most
   persuasive detail in the product.

     ART.prep.fraction(value)      0.4375 -> '7/16' · 2.5 -> '2 1/2' · 1 -> '1'
     ART.prep.parts(value)         0.4375 -> {parts:16, take:7, whole:0}
     ART.prep.grams(dose)          '≈ 18 g' | '≈ 0.7 g' | '≈ 15 mg'
     ART.prep.household(dose)      '7/16 piece' | '5 seeds' | '2 1/2 tsp'
     ART.prep.describe(dose)       {headline, grams, household, steps[], viz}
     ART.prep.waitProtocol(level)  {level, label, short, steps[]}
     ART.prep.isItem(entry)        true for itemType 'alka'|'drops'|'tapping'
     ART.prep.item(entry)          the tablet / drops / spine-tap description;
                                   describe() routes to it, so one call covers
                                   every row in client.days. Adds three viz
                                   kinds:
                                     {kind:'tab', n:1, inGlass:true}
                                     {kind:'drop', n:3, under:'the tongue'}
                                     {kind:'tap', minutes:2, path:'base to neck',
                                      segments:7}
                                   and returns {label, cadence, detail} as well.
     ART.prep.fullDetail(entry)    the dose in the practice's own words:
                                   '1 serving baked', '7/16 piece', '3 drops'
     ART.prep.rowDetail(entry)     the SAME fact clamped to a log row's ~90px:
                                   '1 svg baked', '7/16 piece', '3 drops'
                                   Both honour the household / grams toggle.

   Household measure leads; grams are the cross-check. The `divide` viz takes
   its denominator from the dose's ACTUAL fraction — 7/16 divides into 16, not
   4 — because that is the cut a parent actually has to make.

   viz is one of exactly four shapes:
     {kind:'divide',  parts:16, take:7,    label:'one slice'}
     {kind:'count',   n:5, item:'sesame seed', mm:3}
     {kind:'spoon',   tsp:0.25, of:'marshmallow fluff'}
     {kind:'serving', fraction:0.25, of:'fresh egg pasta'}
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var EPS = 1e-6;
  var DENOMS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 32, 64];
  var HALVINGS = ['once', 'twice', 'three times', 'four times', 'five times', 'six times'];
  var PLURAL_TAIL = /\s*(seeds?|pieces?|beans?|crackers?|slices?|tenders?)$/i;

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }

  /* ------------------------------------------------------------- fraction -- */
  function fraction(value) {
    if (value === null || value === undefined || value !== value) return '—';
    var v = +value;
    var sign = v < 0 ? '-' : '';
    v = Math.abs(v);
    var whole = Math.floor(v + EPS);
    var frac = v - whole;
    if (frac < 1e-5) return sign + String(whole);
    for (var i = 0; i < DENOMS.length; i++) {
      var d = DENOMS[i];
      var n = frac * d;
      if (Math.abs(n - Math.round(n)) < 1e-4) {
        n = Math.round(n);
        var g = gcd(n, d) || 1;
        return sign + (whole ? whole + ' ' : '') + (n / g) + '/' + (d / g);
      }
    }
    return sign + (Math.round(v * 100) / 100);
  }

  /* The dose's real fraction, as the cut a parent makes. 0.4375 -> 16 / 7. */
  function parts(value) {
    var v = Math.abs(+value);
    var whole = Math.floor(v + EPS);
    var frac = v - whole;
    if (frac < 1e-5) return { parts: 1, take: whole, whole: whole };
    for (var i = 0; i < DENOMS.length; i++) {
      var d = DENOMS[i];
      var n = frac * d;
      if (Math.abs(n - Math.round(n)) < 1e-4) {
        n = Math.round(n);
        var g = gcd(n, d) || 1;
        return { parts: d / g, take: n / g, whole: whole };
      }
    }
    return { parts: 16, take: Math.max(1, Math.round(frac * 16)), whole: whole };
  }

  /* ---------------------------------------------------------------- grams -- */
  function grams(dose) {
    var g = dose && typeof dose.grams === 'number' ? dose.grams : 0;
    if (!g) return '—';
    /* a seed count is 0.003 g apiece, so a single clamped '< 0.1 g' made the
       whole sesame ramp read as one dead figure with the units toggle on
       Grams — sub-0.1 g doses carry a real number, in milligrams */
    if (g < 0.1) return '≈ ' + Math.round(g * 1000) + ' mg';
    if (g < 10) return '≈ ' + (Math.round(g * 10) / 10) + ' g';
    return '≈ ' + Math.round(g) + ' g';
  }

  /* ------------------------------------------------------------ household -- */
  /* The singular noun for the countable object behind a dose. */
  function noun(dose) {
    var f = String(dose.foodForm || '').toLowerCase();
    var u = dose.unit;
    if (u === 'tsp') return 'tsp';
    if (u === 'serving') return 'serving';
    if (u === 'tender') return 'tender';
    if (u === 'piece') {
      if (/toast|bread|slice/.test(f)) return 'slice';
      if (/cracker/.test(f)) return 'cracker';
      return 'piece';
    }
    /* unit 'seeds' covers everything counted out by hand */
    if (/sesame|seed/.test(f)) return 'seed';
    if (/edamame/.test(f)) return 'bean';
    return 'piece';
  }
  function base(dose) {
    return String(dose.foodForm || '').toLowerCase().replace(PLURAL_TAIL, '').trim();
  }
  function plural(n, word) {
    if (word === 'tsp' || word === 'Tbsp') return word;
    return Math.abs(n) > 1 ? word + 's' : word;     /* '7/16 piece', '5 seeds' */
  }
  var NOUN_RE = /tsp|tbsp|serving|piece|slice|seed|bean|tender|cracker/i;

  /* The booklet's own measure word — keyed off the unit, so a fraction of a
     French toast slice reads '7/16 piece' exactly as the booklet writes it. */
  function measureWord(dose) {
    var u = dose.unit;
    if (u === 'serving') return 'serving';
    if (u === 'tender') return 'tender';
    if (u === 'piece') return 'piece';
    if (u === 'tsp') return 'tsp';
    var f = String(dose.foodForm || '').toLowerCase();
    if (dose.value < 1) return 'piece';             /* half a cashew is a piece */
    if (/edamame/.test(f)) return 'bean';
    if (/sesame|seed/.test(f)) return 'seed';
    return 'piece';
  }

  function isItem(entry) {
    return !!(entry && entry.itemType && entry.itemType !== 'dose');
  }

  function household(dose) {
    if (!dose) return '—';
    /* the drops and the tap already carry their own measure word, and neither
       is a fraction of anything — '3 drops', '2 min' */
    if (isItem(dose)) return String(dose.display);
    var d = String(dose.display);
    if (NOUN_RE.test(d)) return d;                  /* the display already names it */
    return d + ' ' + plural(dose.value, measureWord(dose));
  }

  /* ---------------------------------------------------------- wait ladder -- */
  /* Straight off the booklet page. It titrates DOWN as the child tolerates
     more, which is why level 3 is the top rung and 0 is maintenance. */
  var WAIT = {
    3: {
      level: 3,
      label: 'Eat at a reasonable hour · wait 30 min · then a hot shower or 10 min hard exercise',
      short: '30 min + hot shower',
      /* the same ladder in chip form, because a phone shows the protocol as
         chips and not as a numbered list (the UX brief §4 screen 4). It lives
         here so the sentences and the chips cannot drift apart. */
      chips: ['not late', 'wait 30 min', 'hot shower', 'or 10 min exercise'],
      steps: [
        'Give the dose at a reasonable hour — not late.',
        'Wait 30 minutes.',
        'Then a hot shower, or 10 minutes of hard exercise.'
      ]
    },
    2: {
      level: 2,
      label: 'Wait 15 min after the dose',
      short: 'wait 15 min',
      chips: ['wait 15 min', 'stay with them'],
      steps: ['Wait 15 minutes after the dose.', 'Stay with them until the 15 minutes are up.']
    },
    1: { level: 1, label: 'No wait needed', short: 'no wait', chips: ['no wait needed'], steps: [] },
    0: { level: 0, label: '—', short: '—', chips: ['no wait'], steps: [] }
  };
  function waitProtocol(level) {
    var l = Number(level);
    if (!WAIT[l]) l = 0;
    var w = WAIT[l];
    return {
      level: w.level, label: w.label, short: w.short,
      chips: (w.chips || []).slice(), steps: w.steps.slice()
    };
  }

  /* ------------------------------------------------------------- describe -- */
  var MM = [
    [/sesame/, 3], [/cashew/, 12], [/edamame/, 9], [/walnut/, 14],
    [/cracker/, 32], [/halva/, 26], [/toast|bread|slice/, 95], [/tender/, 70]
  ];
  function mmFor(dose) {
    var f = String(dose.foodForm || '').toLowerCase();
    for (var i = 0; i < MM.length; i++) if (MM[i][0].test(f)) return MM[i][1];
    return 12;
  }
  /* 'sesame seeds' -> 'sesame seed' · 'cracker' -> 'cracker' */
  function itemName(dose) {
    var n = noun(dose);
    var b = base(dose);
    if (!b || b === n) return n;
    return b + ' ' + n;
  }
  /* The physical object the parent picks up. */
  function objectLabel(dose) {
    var n = noun(dose);
    var b = base(dose);
    if (n === 'slice') return 'one slice';
    if (n === 'tender') return 'one chicken tender';
    if (n === 'cracker') return 'one cracker';
    if (n === 'serving') return 'one serving';
    if (!b || b === n) return 'one ' + n;
    if (b.indexOf(' ') > -1) return 'one ' + n + ' of ' + b;
    return 'one ' + b + ' ' + n;
  }
  function cutLine(p) {
    var pow = Math.log(p) / Math.log(2);
    if (Math.abs(pow - Math.round(pow)) < 1e-9 && p >= 2 && p <= 64) {
      var k = Math.round(pow);
      if (k === 1) return 'Cut it straight down the middle.';
      return 'Halve it ' + HALVINGS[k - 1] + ' — that gives you ' + p + ' even pieces.';
    }
    return 'Cut it into ' + p + ' even pieces.';
  }
  function timingLine(dose) {
    if (dose.waitLevel >= 3) {
      return 'Give it at ' + ART.ui.clock(dose.timing) + ', wait 30 minutes, then the shower or the exercise.';
    }
    if (dose.waitLevel === 2) return 'Give it at ' + ART.ui.clock(dose.timing) + ', then wait 15 minutes.';
    return 'Give it at ' + ART.ui.clock(dose.timing) + '.';
  }
  function displayFraction(display) {
    var d = String(display);
    var m = d.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return (+m[1]) / (+m[2]);
    if (/whole/i.test(d)) return 1;
    var w = d.match(/^\s*(\d+)/);
    return w ? +w[1] : 1;
  }

  /* ---------------------------------------------------- the three items -- */
  /* NOTES §A2/§A3 and DESIGN_PASS §6. The morning ALKA-SELTZER tablet, the
     drops and the spine tap are prescribed, scheduled and loggable, and not
     one of them is a dose with arithmetic in it — so they get their own
     descriptions and their own three viz kinds. Everything else about them
     behaves exactly like a dose, deliberately. */
  var ITEM_FALLBACK = { alka: 'Alka-Seltzer', drops: 'Water drops', tapping: 'Spine tap' };

  function item(entry) {
    var kind = entry.itemType;
    var drops = kind === 'drops';
    var out = {
      itemType: kind,
      label: entry.label || ITEM_FALLBACK[kind] || 'Item',
      cadence: entry.cadence || (kind === 'tapping' ? null : 'Daily'),
      headline: '',
      grams: '—',
      household: String(entry.display),
      detail: entry.instructions || '',
      steps: [],
      viz: null
    };
    if (kind === 'alka') {
      out.headline = entry.display + ' dissolved in water, before the drops.';
      out.steps = [
        'Drop the tablet into a small glass of water.',
        'Wait until it has stopped fizzing.',
        'Have them drink all of it.',
        'Give it at ' + ART.ui.clock(entry.timing) + ', every morning.'
      ];
      out.viz = { kind: 'tab', n: entry.value, inGlass: true };
      return out;
    }
    if (drops) {
      out.headline = entry.display + ' under the tongue, before any food.';
      out.steps = [
        'Hold the dropper above the tongue — it should not touch.',
        'Count ' + entry.value + ' drops out loud with them.',
        'Nothing to eat or drink for the next few minutes.',
        'Give it at ' + ART.ui.clock(entry.timing) + ', every day.'
      ];
      out.viz = { kind: 'drop', n: entry.value, under: 'the tongue' };
      return out;
    }
    out.headline = 'Spine tap — base of the back to the neck, ' + entry.value + ' minutes.';
    out.steps = [
      'Sit them forward, or lie them on their front.',
      'Tap lightly with two fingers, base of the back upward to the neck.',
      'Work up and back down for the full ' + entry.value + ' minutes.',
      'Give it at ' + ART.ui.clock(entry.timing) + (entry.cadence ? ' on ' + entry.cadence : '') + '.'
    ];
    out.viz = { kind: 'tap', minutes: entry.value, path: 'base to neck', segments: 7 };
    return out;
  }

  function describe(dose) {
    if (!dose) {
      return { headline: '—', grams: '—', household: '—', steps: [], viz: null };
    }

    /* 0 — not a food at all: the drops, or the tap */
    if (isItem(dose)) return item(dose);
    var hh = household(dose);
    var gg = grams(dose);
    var out = { headline: '', grams: gg, household: hh, steps: [], viz: null };
    var allergen = String(dose.allergen || '').toLowerCase();

    /* 1 — maintenance: no arithmetic left, only the habit */
    if (dose.isMaintenance) {
      var twoPart = /baked/i.test(String(dose.display));
      out.headline = twoPart
        ? 'One serving of baked ' + allergen + ', plus one serving of any other ' + allergen + ' food.'
        : 'Keep it daily: ' + hh + ' of ' + dose.foodForm + '.';
      out.steps = twoPart
        ? [
          'Anything baked with ' + allergen + ' in it covers the first serving.',
          'The second can be any other ' + allergen + ' food — scrambled, mayo, ice cream.',
          'No wait protocol — that phase is behind them.'
        ]
        : [
          'Any ' + dose.foodForm + ' counts toward it.',
          'The point now is the habit, not the amount.',
          'No wait protocol — that phase is behind them.'
        ];
      out.viz = { kind: 'serving', fraction: 1, of: dose.foodForm };
      return out;
    }

    /* 2 — a serving, or a fraction of one: plate it, do not cut it.
       Catches milk's '1/4 serving' steps, which carry a tsp unit. */
    if (dose.unit === 'serving' || /serving/i.test(String(dose.display))) {
      var frac = dose.unit === 'serving' ? dose.value : displayFraction(dose.display);
      out.headline = frac >= 1
        ? 'Serve one whole serving of ' + dose.foodForm + '.'
        : 'Plate ' + fraction(frac) + ' of a serving of ' + dose.foodForm + '.';
      out.steps = frac >= 1
        ? [
          'Serve it the way it is normally eaten.',
          'Weigh it once for a reference: ' + gg + '.',
          timingLine(dose)
        ]
        : [
          'Make up one full serving of ' + dose.foodForm + '.',
          'Set aside ' + fraction(frac) + ' of it — ' + gg + ' on a kitchen scale.',
          'The rest is not part of the dose.',
          timingLine(dose)
        ];
      out.viz = { kind: 'serving', fraction: Math.min(frac, 1), of: dose.foodForm };
      return out;
    }

    /* 3 — volume: a measuring spoon, not a spoon from the drawer */
    if (dose.unit === 'tsp') {
      out.headline = 'Measure ' + dose.display + ' of ' + dose.foodForm + ' — level, not heaped.';
      out.steps = [
        'Use a measuring spoon, not a spoon from the drawer.',
        dose.value >= 3
          ? 'A tablespoon is three level teaspoons — ' + fraction(dose.value) + ' tsp in total.'
          : 'Scrape it level with a knife so it is exactly ' + dose.display + '.',
        'Stir it into something they already eat.',
        timingLine(dose)
      ];
      out.viz = { kind: 'spoon', tsp: dose.value, of: dose.foodForm };
      return out;
    }

    /* 4 — a fraction of one countable object. This is the cutting board, and
       the reason the whole feature exists. */
    if (dose.value < 1) {
      var p = parts(dose.value);
      var label = objectLabel(dose);
      out.headline = p.parts === 2
        ? 'Split ' + label + ' in half. Give one half.'
        : 'Cut ' + label + ' into ' + p.parts + '. Give ' + p.take + '.';
      out.steps = [
        'Start with ' + label + ', flat on the board.',
        cutLine(p.parts),
        p.take === 1
          ? 'Give ' + (p.parts === 2 ? 'one half' : 'one of them') + '. The rest keeps for tomorrow.'
          : 'Give ' + p.take + ' of the ' + p.parts + '.',
        'Or weigh it instead: ' + gg + '.'
      ];
      out.viz = { kind: 'divide', parts: p.parts, take: p.take, label: label };
      return out;
    }

    /* 5 — a whole count: seeds, beans, crackers, pieces */
    var n = dose.value;
    out.headline = 'Count out ' + fraction(n) + ' ' + plural(n, itemName(dose)) + '.';
    out.steps = [
      'Count them onto a dry teaspoon — not into your hand.',
      n >= 10 ? 'Count in groups of five so you do not lose the place.' : 'Check the count twice.',
      'Tip them into something they already eat.',
      timingLine(dose)
    ];
    out.viz = { kind: 'count', n: n, item: itemName(dose), mm: mmFor(dose) };
    return out;
  }

  /* --------------------------------------------------- the two row widths -- */
  /* A dose is one fact and it has to print at two widths, so the clamp lives
     here once rather than in each screen. fullDetail() is the prescription in
     the practice's own words, for anywhere with a line to spare — SCHEDULE's
     OTHER band, Prep, an aria-label. rowDetail() is the same fact in the
     ~90px a log row leaves after a 56px time column, which is what the reference app's
     timeline gives its right-hand figure. Both honour the household / grams
     toggle, so neither can disagree with the other about the dose. */
  /* The part label stays on BOTH widths and in BOTH units, because it is what
     tells the two servings of a maintenance day apart: without it the egg
     band is the same row printed twice, which is exactly the kind of thing
     this product is supposed to stop happening. */
  function fullDetail(entry) {
    if (!entry) return '—';
    if (isItem(entry)) return String(entry.display);
    var base = ART.store.state.units === 'grams' ? grams(entry) : household(entry);
    return entry.partLabel ? base + ' ' + entry.partLabel : base;
  }

  function rowDetail(entry) {
    if (!entry) return '—';
    if (isItem(entry)) return String(entry.display);
    var base;
    if (ART.store.state.units === 'grams') {
      base = grams(entry);
    } else {
      base = String(household(entry)).replace(/\bservings?\b/i, 'svg');
      /* a dose whose own wording will not fit becomes the count it is */
      if (!entry.qualifier && base.length > 14) {
        var n = String(entry.display).split('+').length;
        return n + ' ' + (n === 1 ? 'dose' : 'doses');
      }
    }
    return entry.qualifier ? base + ' ' + entry.qualifier : base;
  }

  ART.prep = {
    fraction: fraction,
    parts: parts,
    grams: grams,
    household: household,
    describe: describe,
    waitProtocol: waitProtocol,
    /* additions: the three non-food protocol items */
    item: item,
    isItem: isItem,
    /* the one dose string at the two widths the product needs */
    fullDetail: fullDetail,
    rowDetail: rowDetail
  };
})();
