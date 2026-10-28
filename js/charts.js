/* ===========================================================================
   A.R.T. pitch canvas — js/charts.js        owner: analytics     SPEC §6.4, §8
   ---------------------------------------------------------------------------
   Five hand-written inline-SVG charts. No library, no CDN, no <canvas>.

   Binding rules enforced here, not left to the caller:
     · ONE axis per chart. `spread()` draws two PANELS side by side — days on
       the left, repeat-day share on the right — each with its own single axis,
       its own ticks and its own axis label. That is a small multiple, which is
       the correct answer to "show two quantities over the same rows", and it
       is the opposite of a second y-scale: no mark is ever read against two
       scales, and the two panels never share one.
     · A single series is ONE colour. The series colour arrives from
       css/app.css via .chart__bar / .chart__line / .chart__median — this file
       never names a colour, and no value-ramp is ever applied to a nominal
       category. The two exceptions are both real nominal splits declared with
       a data-* hook rather than a ramp: data-cohort (staff / independent) and
       data-delta (over plan / under plan), which is a SIGNED quantity and is
       also always carried by the sign of its own printed figure, so the chart
       never depends on colour alone.
     · Grid and axis rules are SOLID hairlines (.chart__grid / .chart__axis).
       Nothing in this file emits a dash array.
     · Data-ends are 4px-rounded and anchored to the baseline; lines are 2px;
       markers are >= 8px across; adjacent fills keep a >= 2px surface gap.
     · Hover ships by default: one .tip per mark, and the identical content on
       keyboard focus. A tooltip never GATES a value — every panel the zone
       builds also carries a Table toggle that calls tableView().
     · No number on every mark. Only the extremes and the selected row are
       labelled; `n` is a gutter column, not a mark label, because the client
       asked for n on every row.
     · The viewBox is authored in REAL pixels at the width the zone gives us,
       so .chart__svg { width:100% } renders 1:1 and every label is exactly
       12px. The box always includes both axis bands, so no chart ever needs a
       nested scrollbar.

   Upgrade hooks. Four marks in `spread()` are new to this round and carry an
   EXISTING class plus a data-* attribute: .chart__area[data-iqr] (the p25-p75
   box), .chart__range[data-plan] (the planned-days tick), .chart__bar and
   .chart__value with [data-delta='over'|'under'|'met']. Attribute selectors
   outrank the bare class regardless of source order, so css/app.css can retint
   any of them without this file moving — and until it does, every mark still
   paints a real palette colour instead of SVG's default black.

   Geometry only is ever written inline (tip left/top and --tip-arrow, and
   --tbl-h on a table view). No colour literal, no translucency literal and no
   typeface is named anywhere in this file — css/app.css owns all of it.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var S = ui.svg;
  var esc = ui.esc;

  var MINUS = '−';   /* a real minus sign: '-' reads as a hyphen in mono */

  /* ------------------------------------------------------------- numbers -- */

  function r1(n) { return Math.round(n * 10) / 10; }

  function thousands(n) {
    var s = String(Math.round(n));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return out;
  }

  function pctFmt(v) { return Math.round(v) + '%'; }

  /* A signed delta, never a bare '-0.5'. Used for every "vs plan" figure, so
     the direction is in the glyph as well as in the colour. */
  function signed(v) {
    var n = r1(v);
    if (n === 0) return '0';
    return (n > 0 ? '+' : MINUS) + Math.abs(n);
  }

  /* A tick step that lands on 1 / 2 / 2.5 / 5 x 10^k, so ticks read cleanly. */
  function niceStep(span, want) {
    if (!(span > 0)) return 1;
    var raw = span / Math.max(1, want);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function ticks(lo, hi, want) {
    var step = niceStep(hi - lo, want);
    var out = [];
    for (var v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  /* Up to `want` evenly spaced indices, always including first and last. */
  function sampleIdx(n, want) {
    if (n <= want) {
      var all = [];
      for (var i = 0; i < n; i++) all.push(i);
      return all;
    }
    var out = [], k;
    for (k = 0; k < want; k++) out.push(Math.round(k * (n - 1) / (want - 1)));
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  /* ------------------------------------------------------------- shapes --- */

  /* A column anchored to the baseline at y+h, with only its data-end rounded. */
  function colPath(x, y, w, h, rad) {
    if (h <= 0.4) return 'M' + r1(x) + ',' + r1(y + h) + 'h' + r1(w);
    var rr = Math.min(rad, w / 2, h);
    var b = y + h;
    return 'M' + r1(x) + ',' + r1(b) +
      'V' + r1(y + rr) +
      'Q' + r1(x) + ',' + r1(y) + ' ' + r1(x + rr) + ',' + r1(y) +
      'H' + r1(x + w - rr) +
      'Q' + r1(x + w) + ',' + r1(y) + ' ' + r1(x + w) + ',' + r1(y + rr) +
      'V' + r1(b) + 'Z';
  }

  /* A horizontal bar anchored to the baseline at x, data-end rounded. */
  function barPath(x, y, w, h, rad) {
    if (w <= 0.4) return 'M' + r1(x) + ',' + r1(y) + 'v' + r1(h);
    var rr = Math.min(rad, h / 2, w);
    return 'M' + r1(x) + ',' + r1(y) +
      'H' + r1(x + w - rr) +
      'Q' + r1(x + w) + ',' + r1(y) + ' ' + r1(x + w) + ',' + r1(y + rr) +
      'V' + r1(y + h - rr) +
      'Q' + r1(x + w) + ',' + r1(y + h) + ' ' + r1(x + w - rr) + ',' + r1(y + h) +
      'H' + r1(x) + 'Z';
  }

  function line(x1, y1, x2, y2, klass, attrs) {
    var a = { class: klass, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return S('line', a);
  }

  function text(x, y, str, klass, anchor, attrs) {
    var a = { class: klass, x: r1(x), y: r1(y), 'text-anchor': anchor || 'start' };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return S('text', a, esc(str));
  }

  /* A transparent hit target that also carries its tip content and anchor.
     `opts.key` turns it into a real control: role=button, aria-pressed and a
     stable id, so ART.ui.keepFocus can restore the focused row across the
     re-render that selecting it causes. */
  function hit(x, y, w, h, tip, label, opts) {
    var o = opts || {};
    return S('rect', {
      class: 'chart__hit',
      x: r1(x), y: r1(y), width: r1(Math.max(1, w)), height: r1(Math.max(1, h)),
      'data-tip': tip,
      'data-tx': r1(x + w / 2),
      'data-ty': r1(y),
      /* `data-select`, not `data-key`: .tbl marks its key COLUMN with a bare
         data-key, so a shared name would make a closest() lookup in the zone
         match the cell instead of the row. */
      'data-select': o.key || null,
      id: o.id || null,
      tabindex: o.focusable === false ? null : '0',
      role: o.key ? 'button' : 'img',
      'aria-pressed': o.key ? (o.on ? 'true' : 'false') : null,
      'aria-label': label
    });
  }

  /* ---------------------------------------------------------------- tips -- */

  function tipHost(el) {
    var t = el.querySelector(':scope > .tip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'tip';
      t.hidden = true;
      el.appendChild(t);
    }
    return t;
  }

  function place(el, t, tx, ty) {
    var W = +el.getAttribute('data-w') || el.clientWidth || 400;
    t.hidden = false;
    t.removeAttribute('data-arrow');
    t.style.left = '0px';
    t.style.top = '0px';
    var tw = t.offsetWidth, th = t.offsetHeight;
    var left = Math.max(0, Math.min(Math.max(0, W - tw), tx - tw / 2));
    var top = ty - th - 11;
    if (top < 0) { top = ty + 15; t.setAttribute('data-arrow', 'none'); }
    t.style.left = r1(left) + 'px';
    t.style.top = r1(top) + 'px';
    t.style.setProperty('--tip-arrow', r1(Math.max(11, Math.min(Math.max(11, tw - 11), tx - left))) + 'px');
  }

  function show(el, node) {
    var t = tipHost(el);
    t.innerHTML = node.getAttribute('data-tip') || '';
    place(el, t, +node.getAttribute('data-tx'), +node.getAttribute('data-ty'));
  }

  function hide(el) {
    var t = el.querySelector(':scope > .tip');
    if (t) { t.hidden = true; t.innerHTML = ''; }
  }

  /* One delegated set of listeners per chart element, bound once. */
  function wire(el) {
    if (el._artWired) return;
    el._artWired = true;

    function target(e) {
      var n = e.target;
      return n && n.getAttribute && n.getAttribute('data-tip') !== null ? n : null;
    }
    el.addEventListener('pointerover', function (e) {
      var n = target(e);
      if (n) show(el, n);
    });
    el.addEventListener('pointerout', function (e) {
      if (target(e)) hide(el);
    });
    el.addEventListener('focusin', function (e) {
      var n = target(e);
      if (n) show(el, n);
    });
    el.addEventListener('focusout', function () { hide(el); });
    el.addEventListener('pointerleave', function () { hide(el); });

    el.addEventListener('keydown', function (e) {
      /* A selectable row is a real button, so Enter and Space must activate it.
         SVGElement has no .click(), so the click is dispatched — which means
         the zone needs exactly ONE delegated click handler for mouse and
         keyboard alike, and charts.js never learns what a row means. */
      var n = e.target;
      if (n && n.getAttribute && n.getAttribute('data-select') &&
          (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault();
        e.stopPropagation();
        n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return;
      }

      /* The dense series (the trend) gets ONE focus stop and an arrow-key
         cursor instead of ninety tab stops. The canvas also listens for
         arrows, so propagation stops here while the cursor is in use. */
      var cur = el._artCursor;
      if (!cur || document.activeElement !== cur.node) return;
      var k = e.key, i = cur.i;
      if (k === 'ArrowRight') i = Math.min(cur.pts.length - 1, i + 1);
      else if (k === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = cur.pts.length - 1;
      else return;
      e.preventDefault();
      e.stopPropagation();
      cur.i = i;
      var p = cur.pts[i];
      var t = tipHost(el);
      t.innerHTML = p.tip;
      place(el, t, p.tx, p.ty);
      cur.node.setAttribute('aria-label', p.label);
    });
  }

  function mount(el, w, h, body, caption) {
    el.setAttribute('data-w', w);
    el.setAttribute('data-h', h);
    el._artCursor = null;
    el.innerHTML =
      S('svg', {
        class: 'chart__svg',
        viewBox: '0 0 ' + w + ' ' + h,
        width: w, height: h,
        preserveAspectRatio: 'xMidYMid meet',
        focusable: 'false'
      }, body) +
      (caption ? '<p class="chart__cap">' + caption + '</p>' : '');
    wire(el);
    return el.querySelector('.chart__svg');
  }

  /* =========================================================== 1 · BARS === */
  /* Horizontal bars, one nominal row each. The bar is centred in its row and
     its label sits directly above it, so the component reads the same with
     four rows in a tall column as with sixteen in a short one. Only the two
     extremes are numbered; every value is on hover, on focus, and in Table. */

  function bars(el, o) {
    var data = o.data || [];
    var W = o.width || 429, H = o.height || 282;
    var fmt = o.valueFmt || pctFmt;
    var P = { top: 30, right: 54, bottom: 44, left: 10 };
    var x0 = P.left, x1 = W - P.right;
    var y0 = P.top, y1 = H - P.bottom;
    var hi = o.max || 100;
    var pitch = (y1 - y0) / Math.max(1, data.length);
    /* The row is label + gap + bar + gap. 23px is what the 12px label and the
       two gaps cost, so the bar takes what is left and never crowds the label
       of the row below it — which is what went wrong when the bar height was
       a constant and the pitch was not. */
    var bh = Math.max(10, Math.min(o.barHeight || 16, pitch - 23));
    var g = [];

    var tk = ticks(0, hi, 4);
    tk.forEach(function (v) {
      var x = x0 + (v / hi) * (x1 - x0);
      g.push(line(x, y0 - 6, x, y1, v === 0 ? 'chart__axis' : 'chart__grid'));
      g.push(text(x, y1 + 17, fmt(v), 'chart__tick', 'middle'));
    });

    var vals = data.map(function (d) { return d.value; });
    var maxV = Math.max.apply(null, vals), minV = Math.min.apply(null, vals);
    var maxAt = vals.indexOf(maxV), minAt = vals.lastIndexOf(minV);

    data.forEach(function (d, i) {
      var top = y0 + i * pitch;
      var by = top + (pitch - bh) / 2 + 5;     /* +5: the label owns the air above */
      var bw = (d.value / hi) * (x1 - x0);

      g.push(text(x0, by - 7, d.label + (d.note ? '  ·  ' + d.note : ''), 'chart__label'));
      g.push(S('path', {
        class: 'chart__bar',
        d: barPath(x0, by, bw, bh, 4),
        'data-emphasis': d.emphasis ? '' : null,
        'data-cohort': d.cohort ? '' : null
      }));
      if (i === maxAt || i === minAt) {
        g.push(text(x0 + bw + 9, by + bh / 2 + 4, fmt(d.value), 'chart__value'));
      }
      g.push(hit(x0, top, x1 - x0 + P.right - 8, pitch,
        '<b>' + esc(d.label) + '</b><br>' + esc(fmt(d.value)) +
        (d.note ? ' &middot; ' + esc(d.note) : '') +
        (d.tip ? '<br>' + d.tip : ''),
        d.label + ': ' + fmt(d.value) + (d.note ? ', ' + d.note : '')));
    });

    if (o.axisLabel) g.push(text(x0, H - 6, o.axisLabel, 'chart__axislabel'));
    mount(el, W, H, g.join(''), o.caption);
  }

  /* ======================================================== 2 · COLUMNS === */
  /* Vertical columns over an ordinal axis, with an optional highlight band
     behind a contiguous run and one annotation. Used for an ordinal series
     (protocol week) and, with maxBar raised, as a true histogram where the
     columns nearly touch and an empty bin still draws its honest zero. */

  function columns(el, o) {
    var data = o.data || [];
    var W = o.width || 429, H = o.height || 282;
    var fmt = o.valueFmt || pctFmt;
    /* the axis gutter is 36px, so a tick string must stay short — tickFmt lets
       a caller print "8 runs" on the mark and a bare "8" on the axis rather
       than painting a long tick outside the viewBox */
    var tfmt = o.tickFmt || fmt;
    var P = { top: 30, right: 8, bottom: 46, left: 36 };
    var x0 = P.left, x1 = W - P.right;
    var y0 = P.top, y1 = H - P.bottom;
    var n = Math.max(1, data.length);
    var pitch = (x1 - x0) / n;
    var bw = Math.max(6, Math.min(o.maxBar || 18, pitch - (o.maxBar ? 5 : 8)));
    var g = [];

    var maxV = Math.max.apply(null, data.map(function (d) { return d.value; }));
    var hi = Math.max(niceStep(maxV * 1.18, 3) * 3, 10);
    function Y(v) { return y1 - (v / hi) * (y1 - y0); }

    /* the band sits behind everything, so no 2px gap rule applies to it */
    var first = -1, last = -1;
    data.forEach(function (d, i) { if (d.band) { if (first < 0) first = i; last = i; } });
    if (first >= 0) {
      g.push(S('rect', {
        class: 'chart__band',
        x: r1(x0 + first * pitch + 1), y: r1(y0 - 8),
        width: r1((last - first + 1) * pitch - 2), height: r1(y1 - y0 + 8)
      }));
    }

    ticks(0, hi, hi <= 10 ? 2 : 3).forEach(function (v) {
      g.push(line(x0, Y(v), x1, Y(v), v === 0 ? 'chart__axis' : 'chart__grid'));
      g.push(text(x0 - 8, Y(v) + 4, tfmt(v), 'chart__tick', 'end'));
    });

    /* A solid reference hairline. It carries no text: the columns occupy the
       whole bottom of the plot at every range, so there is no position on
       either side where a label would not land inside a column. The caption
       states the figure and every column's tip repeats it. */
    if (typeof o.reference === 'number') {
      g.push(line(x0, Y(o.reference), x1, Y(o.reference), 'chart__annotline'));
    }

    var maxAt = data.map(function (d) { return d.value; }).indexOf(maxV);
    data.forEach(function (d, i) {
      var cx = x0 + i * pitch + (pitch - bw) / 2;
      /* a 1.5px stub for a near-zero bin, so an honest zero cannot be
         misread as a missing category */
      var h = Math.max(1.5, y1 - Y(d.value));
      g.push(S('path', {
        class: 'chart__bar',
        d: colPath(cx, y1 - h, bw, h, 4),
        'data-emphasis': i === maxAt ? '' : null
      }));
      if (i === maxAt) {
        g.push(text(cx + bw / 2, Y(d.value) - 8, fmt(d.value), 'chart__value', 'middle'));
      }
      g.push(text(x0 + i * pitch + pitch / 2, y1 + 18, d.label, 'chart__tick', 'middle'));
      g.push(hit(x0 + i * pitch, y0 - 8, pitch, y1 - y0 + 8,
        '<b>' + esc(o.itemLabel ? o.itemLabel + ' ' + d.label : d.label) + '</b><br>' +
        esc(fmt(d.value)) + (d.note ? ' &middot; ' + esc(d.note) : ''),
        (o.itemLabel ? o.itemLabel + ' ' + d.label : d.label) + ': ' + fmt(d.value) +
        (d.note ? ', ' + d.note : '')));
    });

    if (o.annotate && first >= 0) {
      var ax = x0 + (first + (last - first + 1) / 2) * pitch;
      g.push(text(ax, y0 - 13, o.annotate, 'chart__annot', 'middle'));
    }
    if (o.axisLabel) g.push(text(x0, H - 6, o.axisLabel, 'chart__axislabel'));
    mount(el, W, H, g.join(''), o.caption);
  }

  /* =========================================================== 3 · AREA === */
  /* Zero-based, because a filled shape on a truncated axis lies about size.
     Ninety daily points share ONE focus stop with an arrow-key cursor. */

  function area(el, o) {
    var data = o.data || [];
    var W = o.width || 453, H = o.height || 282;
    var fmt = o.yFmt || pctFmt;
    var P = { top: 30, right: 54, bottom: 38, left: 42 };
    var x0 = P.left, x1 = W - P.right;
    var y0 = P.top, y1 = H - P.bottom;
    var dom = o.yDomain || [0, 100];
    var n = Math.max(1, data.length);
    var g = [];

    function X(i) { return n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0); }
    function Y(v) { return y1 - ((v - dom[0]) / (dom[1] - dom[0])) * (y1 - y0); }

    ticks(dom[0], dom[1], 4).forEach(function (v) {
      g.push(line(x0, Y(v), x1, Y(v), v === dom[0] ? 'chart__axis' : 'chart__grid'));
      g.push(text(x0 - 8, Y(v) + 4, fmt(v), 'chart__tick', 'end'));
    });

    var seg = data.map(function (d, i) { return (i ? 'L' : 'M') + r1(X(i)) + ',' + r1(Y(d.y)); }).join('');
    g.push(S('path', {
      class: 'chart__area',
      d: seg + 'L' + r1(X(n - 1)) + ',' + r1(Y(dom[0])) + 'L' + r1(X(0)) + ',' + r1(Y(dom[0])) + 'Z'
    }));
    g.push(S('path', { class: 'chart__line', d: seg }));

    var ys = data.map(function (d) { return d.y; });
    var maxV = Math.max.apply(null, ys);
    var maxAt = ys.indexOf(maxV);
    var lastAt = n - 1;

    if (maxAt !== lastAt) {
      g.push(S('circle', { class: 'chart__dot', cx: r1(X(maxAt)), cy: r1(Y(maxV)), r: 5 }));
      g.push(text(X(maxAt), Y(maxV) - 12, fmt(maxV), 'chart__value', 'middle'));
    }
    g.push(S('circle', { class: 'chart__dot', cx: r1(X(lastAt)), cy: r1(Y(ys[lastAt])), r: 5 }));
    g.push(text(X(lastAt) + 11, Y(ys[lastAt]) + 4, fmt(ys[lastAt]), 'chart__value'));
    /* right-anchored, so a long note can never paint past the viewBox into
       the neighbouring column */
    if (o.endNote) {
      g.push(text(W - 4, Math.min(y1 - 8, Y(ys[lastAt]) + 21), o.endNote, 'chart__annot', 'end'));
    }

    sampleIdx(n, 5).forEach(function (i) {
      g.push(text(X(i), y1 + 18, data[i].x, 'chart__tick', i === 0 ? 'start' : 'middle'));
    });

    /* keyboard: ONE focus stop over the whole plot, arrows walk the series —
       ninety tab stops would be worse than useless. It is pushed BEFORE the
       per-point rects so that it never steals their hover. */
    g.push(S('rect', {
      class: 'chart__hit', id: (el.id || 'chart') + '-cursor',
      x: r1(x0), y: r1(y0 - 8), width: r1(x1 - x0), height: r1(y1 - y0 + 8),
      tabindex: '0', role: 'img',
      'aria-label': o.ariaLabel || 'Trend. Use left and right arrow keys to read each point.'
    }));

    /* mouse: a per-point column so the nearest value is always reachable */
    var pts = [];
    var pw = (x1 - x0) / Math.max(1, n - 1);
    data.forEach(function (d, i) {
      var tip = '<b>' + esc(d.label || d.x) + '</b><br>' + esc(fmt(d.y)) +
        (d.note ? ' &middot; ' + esc(d.note) : '');
      var label = (d.label || d.x) + ': ' + fmt(d.y) + (d.note ? ', ' + d.note : '');
      pts.push({ tx: X(i), ty: Y(d.y), tip: tip, label: label });
      g.push(S('rect', {
        class: 'chart__hit',
        x: r1(X(i) - pw / 2), y: r1(y0 - 8),
        width: r1(Math.max(2, pw)), height: r1(y1 - y0 + 8),
        'data-tip': tip, 'data-tx': r1(X(i)), 'data-ty': r1(Y(d.y))
      }));
    });

    if (o.axisLabel) g.push(text(x0, H - 6, o.axisLabel, 'chart__axislabel'));
    mount(el, W, H, g.join(''), o.caption);

    var cursor = el.querySelector('#' + (el.id || 'chart') + '-cursor');
    if (cursor) {
      el._artCursor = { node: cursor, pts: pts, i: pts.length - 1 };
      cursor.addEventListener('focus', function () {
        var c = el._artCursor;
        if (!c) return;
        var p = c.pts[c.i];
        var t = tipHost(el);
        t.innerHTML = p.tip;
        place(el, t, p.tx, p.ty);
      });
      cursor.addEventListener('blur', function () { hide(el); });
    }
  }

  /* =================================================== 4 · DISTRIBUTION === */
  /* One row per nominal category: the full min-max range as a 2px rule with
     round caps, and the median as a 10px marker. One axis, zero-based. */

  function distribution(el, o) {
    var data = o.data || [];
    var W = o.width || 429, H = o.height || 282;
    var P = { top: 30, right: 20, bottom: 46, left: 96 };
    var x0 = P.left, x1 = W - P.right;
    var y0 = P.top, y1 = H - P.bottom;
    var g = [];

    if (!data.length) {
      mount(el, W, H, text(x0, (y0 + y1) / 2, 'No rows in this window', 'chart__label'), o.caption);
      return;
    }

    var hi = Math.max(4, Math.ceil(Math.max.apply(null, data.map(function (d) { return d.max; })) / 4) * 4);
    var pitch = (y1 - y0) / data.length;
    function X(v) { return x0 + (v / hi) * (x1 - x0); }

    ticks(0, hi, 5).forEach(function (v) {
      g.push(line(X(v), y0 - 6, X(v), y1, v === 0 ? 'chart__axis' : 'chart__grid'));
      g.push(text(X(v), y1 + 17, String(v), 'chart__tick', 'middle'));
    });

    var meds = data.map(function (d) { return d.median; });
    var fastAt = meds.indexOf(Math.min.apply(null, meds));
    var slowAt = meds.lastIndexOf(Math.max.apply(null, meds));

    data.forEach(function (d, i) {
      var cy = y0 + i * pitch + pitch / 2;
      g.push(text(x0 - 12, cy + 4, d.label + ' (' + d.n + ')', 'chart__label', 'end'));
      g.push(S('line', {
        class: 'chart__range',
        x1: r1(X(d.min)), y1: r1(cy), x2: r1(X(d.max)), y2: r1(cy)
      }));
      g.push(S('circle', { class: 'chart__median', cx: r1(X(d.median)), cy: r1(cy), r: 5 }));
      if (i === fastAt || i === slowAt) {
        g.push(text(X(d.median), cy - 12, r1(d.median) + ' ' + (o.unit || 'wk'), 'chart__value', 'middle'));
      }
      /* the hit row covers the label gutter too, so the name is hoverable */
      g.push(hit(0, y0 + i * pitch, x1, pitch,
        '<b>' + esc(d.label) + '</b><br>median <b>' + r1(d.median) + ' ' +
        (o.unitLong || 'weeks') + '</b><br>range ' + d.min + '&ndash;' + d.max +
        ' &middot; ' + d.n + (d.n === 1 ? ' run' : ' runs'),
        d.label + ': median ' + r1(d.median) + ' ' + (o.unitLong || 'weeks') +
        ', range ' + d.min + ' to ' + d.max + ', from ' + d.n + ' runs'));
    });

    if (o.axisLabel) g.push(text(x0, H - 6, o.axisLabel, 'chart__axislabel'));
    mount(el, W, H, g.join(''), o.caption);
  }

  /* ========================================================= 5 · SPREAD === */
  /* PLANNED vs ACTUAL, one row per phase. The centrepiece of §6.4 and the only
     chart on this canvas that carries two panels:

       gutter        the row's name, and `n` for every row, right-aligned
       days panel    |---- p25-p75 box ----|   with a plan tick, a median disc,
                     and the planned->median gap drawn as its own bar: that bar
                     IS the overrun, which is the question the frame answers
       vs plan       the signed figure, so direction never rests on colour
       repeat panel  share of days re-administered — a SECOND PANEL with its
                     own axis, because "it ran long" and "the same day was
                     repeated" are different problems and the practice has to
                     tell them apart

     Rows are selectable when o.select is set; the selected row is drawn with
     the attention band, its name in the annotation ink, and its own day
     figures — three signals, so selection is never colour alone.
     ======================================================================= */

  function spread(el, o) {
    var data = o.data || [];
    var W = o.width || 955, H = o.height || 600;
    var unit = o.unit || 'd';
    var g = [];

    if (!data.length) {
      mount(el, W, H, text(20, H / 2, o.emptyNote || 'No completed runs yet', 'chart__label'), o.caption);
      return;
    }

    var hasRate = false;
    data.forEach(function (d) { if (typeof d.rate === 'number') hasRate = true; });

    /* ------------------------------------------------------------ columns */
    var gx = o.gutter || 214;
    var figW = 52, LAB_GAP = 16, FIG_GAP = 10, RATE_GAP = 34;
    var rateW = hasRate ? (o.rateW || 186) : 0;
    var padR = hasRate ? 48 : 56;
    var durL = gx + LAB_GAP;
    var durW = Math.max(120,
      W - gx - LAB_GAP - FIG_GAP - figW - (hasRate ? RATE_GAP + rateW : 0) - padR);
    var durR = durL + durW;
    var figR = durR + FIG_GAP + figW;
    var rateL = figR + RATE_GAP;
    var rateR = rateL + rateW;

    /* Top band: the legend, then one header per column — including each
       panel's unit, which sits ABOVE the panel it names rather than under it.
       That buys 20px of plot height back for the eighteen-row chart and reads
       like a table header, which is what these columns are. The bottom band is
       then only the tick row. */
    var LEGEND_Y = 16, HEAD_Y = 38;
    var y0 = 50, y1 = H - 26;
    var pitch = (y1 - y0) / data.length;
    var tick = Math.max(7, Math.min(12, pitch / 2 - 4));

    /* ------------------------------------------------------------- scales */
    var dhi = o.max;
    if (!dhi) {
      var dm = 0;
      data.forEach(function (d) {
        dm = Math.max(dm, d.p75 || 0, d.planned || 0, d.median || 0);
      });
      dhi = Math.max(5, Math.ceil(dm / 5) * 5);
    }
    var rhi = o.rateMax;
    if (hasRate && !rhi) {
      var rm = 0;
      data.forEach(function (d) { rm = Math.max(rm, d.rate || 0); });
      rhi = Math.max(10, Math.ceil(rm / 10) * 10);
    }
    function X(v) { return durL + (Math.max(0, v) / dhi) * durW; }
    function R(v) { return rateL + (Math.max(0, v) / rhi) * rateW; }

    /* --------------------------------------------------------------- grid */
    ticks(0, dhi, 5).forEach(function (v) {
      g.push(line(X(v), y0 - 4, X(v), y1, v === 0 ? 'chart__axis' : 'chart__grid'));
      g.push(text(X(v), y1 + 17, String(v), 'chart__tick', 'middle'));
    });
    if (hasRate) {
      ticks(0, rhi, 3).forEach(function (v) {
        g.push(line(R(v), y0 - 4, R(v), y1, v === 0 ? 'chart__axis' : 'chart__grid'));
        g.push(text(R(v), y1 + 17, pctFmt(v), 'chart__tick', 'middle'));
      });
    }

    /* ------------------------------------------------------------- legend */
    /* Specimens drawn with the same classes as the marks, so the key cannot
       drift from the chart it decodes. The two delta entries are MINIATURES of
       the real mark — tick, bar, disc in the order they appear on the row —
       rather than two identical swatches that differ only in colour. That way
       the key still tells past-plan from under-plan for a reader who cannot
       separate the two hues, which is the same reason the row prints a signed
       figure instead of relying on the bar. */
    var lx = durL;
    function legend(spec, label, w) {
      g.push(spec);
      g.push(text(lx + (w > 118 ? 36 : 30), LEGEND_Y + 4, label, 'chart__label'));
      lx += w;
    }
    function tickAt(x) {
      return line(x, LEGEND_Y - 7, x, LEGEND_Y + 7, 'chart__range', { 'data-plan': '' });
    }
    function discAt(x) {
      return S('circle', { class: 'chart__median', cx: r1(x), cy: r1(LEGEND_Y), r: 5.5 });
    }
    function deltaAt(x, w2, dir) {
      return S('path', {
        class: 'chart__bar', 'data-delta': dir,
        d: barPath(x, LEGEND_Y - 2.5, w2, 5, 2.5)
      });
    }
    legend(tickAt(lx + 10), 'plan', 70);
    legend(S('rect', {
      class: 'chart__area', 'data-iqr': '',
      x: r1(lx), y: r1(LEGEND_Y - 7), width: 24, height: 14, rx: 4
    }), 'middle half', 128);
    legend(discAt(lx + 10), 'median', 88);
    legend(deltaAt(lx + 2, 24, 'over') + tickAt(lx + 2) + discAt(lx + 26),
      '+ past plan', 134);
    legend(deltaAt(lx + 2, 24, 'under') + discAt(lx + 2) + tickAt(lx + 26),
      MINUS + ' under plan', 140);

    /* ------------------------------------------------------- column heads */
    g.push(text(gx, HEAD_Y, o.nLabel || 'runs', 'chart__axislabel', 'end'));
    g.push(text(durL, HEAD_Y, o.axisLabel || 'days to complete', 'chart__axislabel'));
    g.push(text(figR, HEAD_Y, 'vs plan', 'chart__axislabel', 'end'));
    if (hasRate) {
      g.push(text(rateL, HEAD_Y, o.rateAxisLabel || 'days re-administered',
        'chart__axislabel'));
    }

    /* --------------------------------------------------------- the extremes
       Labelled by overrun, not by row order, so the two numbered rows are the
       real extremes whether the caller sorted the data or not. */
    var ovs = data.map(function (d) { return d.median - d.planned; });
    var hiAt = ovs.indexOf(Math.max.apply(null, ovs));
    var loAt = ovs.lastIndexOf(Math.min.apply(null, ovs));
    var rateHiAt = -1, rateLoAt = -1;
    if (hasRate) {
      var rs = data.map(function (d) { return typeof d.rate === 'number' ? d.rate : -1; });
      rateHiAt = rs.indexOf(Math.max.apply(null, rs));
      rateLoAt = rs.lastIndexOf(Math.min.apply(null, rs.filter(function (v) { return v >= 0; })));
    }

    /* ----------------------------------------------------------- the rows */
    data.forEach(function (d, i) {
      var top = y0 + i * pitch;
      var cy = top + pitch / 2;
      var on = !!d.selected;
      var ov = d.median - d.planned;
      var dir = ov > 0.049 ? 'over' : (ov < -0.049 ? 'under' : 'met');

      if (on) {
        g.push(S('rect', {
          class: 'chart__band',
          x: 0, y: r1(top + 1), width: r1(W), height: r1(Math.max(2, pitch - 2))
        }));
      }

      /* the middle half of every real run, behind the markers */
      var a = X(Math.min(d.p25, d.p75)), b = X(Math.max(d.p25, d.p75));
      g.push(S('rect', {
        class: 'chart__area', 'data-iqr': '',
        x: r1(a - (b - a < 3 ? 1.5 : 0)), y: r1(cy - 7),
        width: r1(Math.max(3, b - a)), height: 14, rx: 4
      }));

      /* the gap between plan and median: the overrun itself */
      var pX = X(d.planned), mX = X(d.median);
      if (Math.abs(mX - pX) >= 1) {
        g.push(S('path', {
          class: 'chart__bar', 'data-delta': dir,
          d: barPath(Math.min(pX, mX), cy - 2.5, Math.abs(mX - pX), 5, 2.5)
        }));
      }
      g.push(line(pX, cy - tick, pX, cy + tick, 'chart__range', { 'data-plan': '' }));
      g.push(S('circle', { class: 'chart__median', cx: r1(mX), cy: r1(cy), r: 5.5 }));

      /* name + n, in the gutter */
      g.push(text(0, cy + 4, d.label, on ? 'chart__annot' : 'chart__label'));
      g.push(text(gx, cy + 4, 'n ' + d.n, 'chart__tick', 'end'));

      /* the signed figure, on every row: it is the ranking key */
      g.push(text(figR, cy + 4, signed(ov), 'chart__value', 'end', { 'data-delta': dir }));

      /* The median's own figure, on the extremes and the selected row only —
         the planned value is readable off the axis under the tick, and it is
         already spelled out in the tip, the Table view and the frame's own
         finding plate. One label per labelled row, on the side away from the
         plan tick, clamped so it can never paint into the next column. */
      if (i === hiAt || i === loAt || on) {
        var rx = Math.max(mX, b) + 11;
        var right = ov >= 0 && rx + 38 <= durR + FIG_GAP;
        g.push(text(right ? rx : Math.min(mX, a) - 11, cy + 4,
          r1(d.median) + ' ' + unit, 'chart__value', right ? 'start' : 'end'));
      }

      /* the second panel */
      if (hasRate && typeof d.rate === 'number') {
        var rw = (Math.max(0, d.rate) / rhi) * rateW;
        g.push(S('path', { class: 'chart__bar', d: barPath(rateL, cy - 8, rw, 16, 4) }));
        if (i === rateHiAt || i === rateLoAt || on) {
          g.push(text(rateL + rw + 9, cy + 4, pctFmt(d.rate), 'chart__value'));
        }
      }

      /* ---------------------------------------------------- hover + select */
      var tip =
        '<b>' + esc(d.label) + '</b><br>' +
        'plan <span class="mono">' + r1(d.planned) + ' ' + unit + '</span> &middot; ' +
        'median <span class="mono">' + r1(d.median) + ' ' + unit + '</span> &middot; ' +
        '<b>' + esc(signed(ov)) + ' ' + unit + '</b><br>' +
        'middle half <span class="mono">' + r1(d.p25) + '&ndash;' + r1(d.p75) + ' ' +
        unit + '</span> &middot; ' + d.n + (d.n === 1 ? ' run' : ' runs') +
        (typeof d.rate === 'number'
          ? '<br>repeat days <span class="mono">' +
            (d.rateNote ? esc(d.rateNote) + ' ' : '') + '(' + pctFmt(d.rate) + ')</span>'
          : '') +
        (d.note ? '<br>' + d.note : '') +
        (o.select ? '<br>' + (on ? 'shown by age band on the right' : 'select to break down by age band') : '');

      var aria = d.label + ': planned ' + r1(d.planned) + ' days, median ' +
        r1(d.median) + ' days, ' +
        (ov === 0 ? 'on plan' : Math.abs(r1(ov)) + (ov > 0 ? ' days past plan' : ' days under plan')) +
        ', middle half ' + r1(d.p25) + ' to ' + r1(d.p75) + ', ' + d.n + ' runs' +
        (typeof d.rate === 'number' ? ', ' + Math.round(d.rate) + ' percent repeat days' : '') +
        (o.select ? '. Select to break this phase down by age band.' : '');

      g.push(hit(0, top, W, pitch, tip, aria, o.select
        ? { key: d.key, on: on, id: (o.idPrefix || 'row') + '-' + String(d.key).replace(/[^a-z0-9]+/gi, '-') }
        : {}));
    });

    mount(el, W, H, g.join(''), o.caption);
  }

  /* ====================================================== 6 · TABLEVIEW === */
  /* The ungated reading of any chart. Keeps the panel's height so toggling a
     view never reflows the dashboard; --tbl-h is a tokens-sanctioned inline
     property and data-nopan keeps the canvas from eating the wheel. */

  function tableView(el, headers, rows, opts) {
    var o = opts || {};
    var head = headers.map(function (h) {
      var label = typeof h === 'string' ? h : h.label;
      var num = typeof h === 'object' && h.num;
      return '<th scope="col"' + (num ? ' data-num' : '') + '>' + esc(label) + '</th>';
    }).join('');

    /* A row is either an array of cells or {cells, rowAttrs}. The shape is
       tested, never the truthiness of rowAttrs: an unmarked row passes an
       EMPTY attribute string, and treating that as "no wrapper" left the whole
       object where the cell array should be. */
    var body = rows.map(function (row) {
      var attrs = '';
      if (row && !Array.isArray(row) && row.cells) { attrs = row.rowAttrs || ''; row = row.cells; }
      return '<tr' + attrs + '>' + row.map(function (c, i) {
        var h = headers[i];
        var num = typeof h === 'object' && h.num;
        var cell = (c && typeof c === 'object') ? (c.html || '') : esc(c);
        var attr = (i === 0 ? ' data-key' : '') + (num ? ' data-num' : '');
        return '<td' + attr + '>' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('');

    el.removeAttribute('data-w');
    el._artCursor = null;
    el.innerHTML =
      '<div class="tblwrap" data-scroll data-nopan' +
      (o.height ? ' style="--tbl-h:' + Math.round(o.height) + 'px"' : '') + '>' +
      '<table class="tbl tbl--dense"><thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      (o.caption ? '<p class="chart__cap">' + o.caption + '</p>' : '');
  }

  ART.charts = {
    bars: bars,
    columns: columns,
    area: area,
    distribution: distribution,
    spread: spread,
    tableView: tableView,
    /* shared by zone-owner.js so one formatter serves every surface */
    fmt: { pct: pctFmt, thousands: thousands, r1: r1, signed: signed, minus: MINUS }
  };
})();
