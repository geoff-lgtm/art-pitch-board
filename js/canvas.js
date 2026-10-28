/* A.R.T. pitch board — the pan/zoom engine.          file: js/canvas.js
   owner: shell                                        SPEC §4

   Owns: the world transform, the LAYOUT table, the eight section headers, the
   four connectors, the sidebar (including the section the camera is standing
   in), the board map, the two guided walkthroughs (ART.tour) and every camera
   control in the top bar.

   Colours, radii, shadows and fonts live in css/app.css. Nothing here sets one:
   this file writes geometry — transforms, world offsets, widths — and `class` /
   `data-*` for everything else. Zero hex, zero rgba(, zero font-family.
   No localStorage, no Math.random(), no argless Date: "now" is store.today. */
(function () {
  'use strict';

  var ART = window.ART = window.ART || {};

  /* ---------------------------------------------------------------- constants */

  var W = 4200;            /* world width  — §4c, authoritative */
  var H = 12354;           /* world height — §4c, less the 226 section 2 gave
                              back when every frame in it took the device's
                              real ratio. 12280 − 226. See LAYOUT. */
  var Z_MIN = 0.3;         /* setZoom clamp */
  var Z_MAX = 1.6;
  var WP_MIN = 0.7;        /* goto() clamp — a waypoint is never illegible */
  var WP_MAX = 1.05;
  var INSET = 24;          /* top inset for a framed waypoint */
  var PAN_MARGIN = 180;    /* how much empty desk you may pull past an edge */
  var GOTO_MS = 520;
  var PACKET_MS = 900;
  var HERO_DELAY = 400;    /* after the camera lands, before the packet flies */
  var DRAG_SLOP = 3;       /* px before a press becomes a drag */
  var SVGNS = 'http://www.w3.org/2000/svg';

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : 0;
  }

  /* ------------------------------------------------------------------ layout */
  /* §4c, to the pixel, as amended by HOME_SPEC §1. Content spans x80 → x4120;
     eight sections stacked, each one a header band and then its frames. The
     board is 4200 × 12054, which is tall enough that NAVIGATION is the product
     here — hence the sidebar, the map, and two camera tracks through it.
     Nothing in this table is rounded, improved or re-flowed; the zones are
     placed on these numbers and the section rules, the map and both
     walkthroughs are all derived from them.

     SECTION 2 AND ph-handoff MOVED — HOME_SPEC §1, and it is the root fix of
     this round, not a nicety. The phones were 320 wide, which is narrower than
     any device Apple ships; the reference app's real screen is 393pt, so every metric
     copied off it (a 58px time gutter, a 92px action tile, 16px screen padding)
     had to be shrunk to fit and the result read as squeezed. The frame goes to
     390 FIRST and the metrics then drop straight in at their real sizes.

     SECTION 2 GAINS A SEVENTH PHONE — HOME_SPEC §12, `ph-reports`, placed
     FOURTH: the three tab screens, then the deeper surfaces, so the row reads
     HOME · SCHEDULE · CALENDAR · REPORTS · PREP · MEALS · MORE. The band's
     height does NOT change, so this round has NO CASCADE: every rectangle
     below section 2 is byte-for-byte what it was, and a y coordinate edited in
     section 3 or lower would be a misreading of the task. What changes is the
     width budget inside the band, and it is paid for twice over — once out of
     the inter-phone gap, once out of `ugc`.

     The band still closes exactly, and this is the arithmetic, checked:
     seven 390s is 2730 and six 36px gaps is 216, so the row spans 2946 and
     runs x80 → x3026; then the same 80px channel w-share has always climbed;
     then ugc, 1014 from x3106, landing its right edge on x4120 — the content
     band's own edge, to the pixel, with nothing left over. Per-frame:
     80·506·932·1358·1784·2210·2636, each +426 on the last (390 + 36), the
     seventh closing on 2636 + 390 = 3026, and 3026 + 80 = 3106, 3106 + 1014 =
     4120. The gap goes 44 → 36 (−8 × six gaps = −48 of the 426 a seventh phone
     costs) and `ugc` gives up the remaining 386 of width.

     THE SIX EXISTING PHONES DO NOT ALL MOVE THE SAME WAY, AND THREE OF THEM
     MOVE RIGHT, NOT LEFT. Inserting the new screen FOURTH splits the row: the
     three ahead of it only feel the tighter gap, the three behind it are
     displaced by a whole phone. Anything derived from these x values has to be
     re-derived per frame, never shifted by a constant:

       ph-home       80 →   80     0
       ph-schedule  514 →  506    −8    one tighter gap
       ph-calendar  948 →  932   −16    two tighter gaps
       ph-reports     — → 1358     —    new
       ph-prep     1382 → 1784  +402    +426 for the insert, −24 of gap
       ph-meals    1816 → 2210  +394    +426, −32
       ph-more     2250 → 2636  +386    +426, −40
       ugc         2720 → 3106  +386    and w 1400 → 1014

     Six frames, five different deltas, two of them negative. A sweep that
     assumed one direction or one offset would be wrong on five of the six.

     36 IS THE FLOOR, NOT A PREFERENCE. The gap has to stay wider than the
     12px bezel on either side of it so two devices never read as one hinged
     pair, and it has to stay narrower than the 80px channel so the eye still
     reads the review loop as standing apart from the row. 36 is on the §2
     spacing scale (xxl + 4 is not, but 36 is 3 × 12) and it is the last value
     on that scale that holds both of those. Below it the row becomes a filmstrip.

     `ugc` LOSES 386 OF WIDTH AND THAT IS A FIX, NOT A SQUEEZE — it was
     overflowing its own frame by 222px at 1400 already, and by 367.6 once the
     width came off. RESOLVED 2026-10-22: zone-family.js restructured the
     diagram per §12a (content and arrangement, nothing scaled, nothing under
     12px) and it now measures 813 inside the 856 its content box gives, with
     zero painted pixels below the frame. The record of the debt is kept below
     because the reasoning about h974 is still the reasoning in force; the
     DEFECT it describes is gone. This table only states the rectangle.

     h974, AND THE ARITHMETIC IS THE WHOLE REASON — BUT IT IS MEASURED ON THE
     GLASS, NOT ON THIS RECTANGLE. "make the screens normal size these are too
     big of screens, phones aren't that long" is about the hardware a reader
     looks at, so the ratio belongs to the glass:

         390 device − 2 × 12 bezel      = 366 of glass across
         366 × 2.168 (a real 393 × 852) = 794 of glass down
         794 + 2 × 12 bezel             = 818 OF DEVICE
         132 head + 24 margin + 818     = 974 OF FRAME

     At h1200 the glass rendered 366 × 1176, a ratio of 1:3.21 — roughly 48%
     longer than any device that exists, which is exactly what the note names.
     818 of device puts it at 1:2.169 against a real iPhone's 1:2.168.

     A `ph-*` RECTANGLE IS NOT A DEVICE, and that is the whole of the last line
     of the chain above — it is also the one way to overshoot this fix in the
     other direction, and the way it WAS overshot once already. A frame in this
     section is a PINNED 132px caption head, the head's 24px margin, and then
     the device, so h818 on the FRAME leaves the device 662 tall and the glass
     366 × 638, a ratio of 1:1.74 — squatter than an iPad mini, which is the
     same defect the client named, pointing the other way. (It is also
     unsurvivable: HOME's required furniture, HOME_SPEC §6, needs 623px of
     scroll port before it can show even one log row, and a 662-tall device has
     608.) zone-family.js derives the chain GLASS_H → PHONE_H → FRAME_H and
     publishes the result, so the 974 below is READ from
     ART.zones.family.FRAME_H rather than restated here: the number cannot
     drift out of sync with the module that derives it, and it cannot be
     applied to the wrong rectangle without that module changing its mind.

     EVERY FRAME IN SECTION 2 TAKES IT, `ugc` INCLUDED, so the band's floor is
     y2020 + 974 = 2994 and sections 3 through 8 come UP 226 as one piece:
     1200 − 974, which is the only cascade number on this board. §3's rule
     lands at 3234 and its first row at 3384; the 150px rule → first-row rhythm
     holds in all eight bands and the 120px floor → next-rule air holds in
     every one of them except §3's, which sits 240 under section 2's floor
     because that floor is now set by a 974 frame instead of the old 1196 one
     (it was 244 before, so the band reads as it always did). The world closes
     at 12054 rather than 12280, with the same 80px of desk under `scope`.
     Everything derived from these rows — the three section-2 waypoints, every
     waypoint below section 2, the four wires, the eight doors, the map and the
     camera's section bands — follows from here.

     `ugc` TAKING h974 IS A CONTENT DEBT, named here rather than buried: it is
     not hardware, it is the review loop diagram, and zone-family.js measures
     its three bands at 1078 under a 94px head and its 24px margin — 1196 to
     stand as built. At 974 its content box is 222 over.

     THE §12 WIDTH CUT TURNS THAT DEBT INTO A VISIBLE DEFECT, AND IT IS NOW
     MEASURED, NOT ESTIMATED. The 222 below was read at w1400. The frame is now
     w1014, narrower bands wrap taller, and the live board at 1014 × 974 reads:

         deepest painted pixel   local y1341.6  = 367.6 BELOW the frame bottom
         world y                        3361.6  (was 3215.9)
         §3's rule                      3234    -> it paints 127.6 PAST IT
         §3's first frame row           3384    -> clears it by 22.4
         x span of the overflow         3106 -> 4116

     So the overflow was 367.6, not 222, and it no longer merely stood on bare
     sand: it crossed section 3's hairline and painted over the right-hand
     1010px of it. That is "a header drawn across a frame" — the exact defect
     the paragraphs below reject h1196 for risking — arriving from the other
     direction. It still overlapped no FRAME, by 22.4px.

     CLOSED 2026-10-22, IN THE FILE THAT OWNS THE ARRANGEMENT. The five-step
     loop stopped carrying its own evidence (a 184px column is the worst place
     on this frame to draw a card: the same mealcard is 167 tall at 184 and 91
     at 430), the four decline facts went from a 564px column to a 2x2, the
     trace bar's card became a chip row on the queue item it was already
     describing, and the two before/after mealcards were cut. Re-measured on
     the live board at 1014 × 974: three bands at 282 + 295 + 236 = 813 inside
     a content box of 856, deepest painted pixel 0px below the frame, and the
     whole board shows no zone painting past its own rectangle except `burden`
     in section 1, which is 15.8px over and predates all of this.

     THIS TABLE CANNOT FIX IT. The rectangle is authoritative (HOME_SPEC §12a:
     1014 × 974, and `ugc` closes the content band on x4120) and the
     arrangement standing inside it is zone-family.js's, which §12a directs to
     restructure rather than scale — "the fix is content and arrangement, not
     scale, and under no circumstances shrink its type below 12px". Growing h
     here would push section 3 down and cascade the whole board, which §12
     forbids outright. So the number is REPORTED, loudly, with the band it has
     to fit, and the paragraphs below are kept only as the record of how the
     h974 choice was reasoned about — every figure in them is STALE BY WIDTH.

     RE-MEASURED 2026-10-20, AND THE NUMBERS THAT WERE HERE WERE BOTH WRONG.
     Read off the live board, clipping each node against every scrolling
     ancestor (the register's own `data-scroll` box was being counted at its
     full table height, which is what produced the old figures): the deepest
     PAINTED pixel sits at local y1195.9, so 222 of the 222 paints below the
     frame's own bottom edge — not 206 — and it reaches world y3215.9, which
     clears §3's rule at 3234 by 18, not by 34. It still overlaps no frame and
     it is still open desk, so the cost is bounded and cosmetic; it is simply
     twice as deep and three times as close to the rule as this file claimed.

     AND THE REASON GIVEN FOR PREFERRING 974 OVER 1196 DOES NOT HOLD. It read:
     "at h1196 `ugc` would reach y3216 and §3's rule at 3234 would sit 18px
     INSIDE it". 3234 is BELOW 3216, so the rule would sit 18px UNDER the
     frame, outside it — cramped against the board's 120px floor-to-rule
     rhythm, but not a header drawn across a frame. The honest comparison is
     that the INK ENDS AT y3215.9 EITHER WAY, because the frame does not clip:
     h1196 encloses that ink in its own card, h974 leaves 222px of it standing
     on bare sand. Neither is right, and the choice between them is a
     composition call on a diagram the client has already seen, so it is NOT
     being made quietly inside a proportions pass. h974 is kept because it is
     what the authoritative table says and because it holds the 120/240 rule
     rhythm; the orphaned 222 is reported, not absorbed.

     The real fix is still zone-family.js's, but NOT the one that file
     proposes — see the measurements recorded there, which falsify its own
     "455 + 8 + 303 = 766" row and give the arrangement that does fit (837).

     ph-handoff is the SAME screen rendered by the same function, so it takes
     the same 390 × 974 — a 340-wide twin of a 390-wide original would make the
     hero frame the one place the product looks different. Its 50px comes out of
     the hero channel (now x2720 → x2850, 130px) rather than out of the 80px gap
     to `templates`, which is already the tightest gap in section 3. The channel
     is the only place in that band with width to give. */

  /* The family frame, READ from the file that renders what stands inside it:
     132 of pinned caption head + 24 of margin + an 818 device whose glass is
     366 × 794. canvas.js loads after zone-family.js, so the number is there at
     table-definition time; the fallback is that same number written out, so a
     load-order change degrades to a stale constant rather than to NaN.

     Every section-2 frame is this tall and so is `ph-handoff`, which is why
     this is the only height in the table that is read rather than written: the
     frame and the hardware standing in it cannot disagree, and the 974 can
     never be re-derived here from the device's own 818 by mistake.

     `ph-reports` (HOME_SPEC §12) takes FAM_H like every other phone in the
     band rather than a literal 974, which is the whole point of reading it:
     the one way a new frame could silently stand a different height from the
     six beside it is a hand-typed number, and there is now no hand-typed
     height anywhere in section 2 to drift. */
  var FAM_H = (window.ART.zones && window.ART.zones.family &&
               window.ART.zones.family.FRAME_H) || 974;

  var LAYOUT = {
    /* UX AUDIT 2026-10-28. 4040 -> 1060. Measured: the masthead's three leaf
       blocks are 835, 758 and 970 world px wide, so a 4040 frame was 24%
       full with a 3070 x 200 dead rect to the right of it — and the camera
       could never show it whole anyway: goto() fits to WIDTH and clamps at
       1.05, so on a 1210px pan surface nothing wider than 1107 world px can
       render 12px type at 12 device px. The 12px credential line was
       rendering at 8.4. A FRAME IS THE SIZE OF ITS CONTENT: 1060 holds the
       970px foot with air, fills 91% of its width, and its own new waypoint
       lands at z=1.037 so the credential renders at 12.4px. The masthead's
       hairline is now its own width, which is correct — it is the frame's
       rule, and the full-bleed rules on this board are the SECTION rules
       canvas.js draws at x80 -> x4120. */
    title:         { x:   80, y:    60, w: 1060, h:  200, s: 0, role: 'banner',       label: 'The argument' },

    booklet:       { x:   80, y:   510, w:  880, h: 1240, s: 1, role: 'problem',      label: 'The booklet today' },
    concurrency:   { x: 1000, y:   510, w: 3120, h:  600, s: 1, role: 'problem',      label: 'Three protocols, one child' },
    wait:          { x: 1000, y:  1150, w: 1520, h:  600, s: 1, role: 'problem',      label: 'The wait protocol' },
    /* h 600 -> 620: measured leaf union 1520 x 616 in a 1520 x 600 frame, so
       .chart__cap was painting 16px onto bare board outside the rectangle it
       belongs to. 1150 + 620 = 1770, clearing §2's rule at 1870 by 100. */
    burden:        { x: 2600, y:  1150, w: 1520, h:  620, s: 1, role: 'problem',      label: 'What else they carry' },

    'ph-home':     { x:   80, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Home' },
    'ph-schedule': { x:  506, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Schedule' },
    'ph-calendar': { x:  932, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Calendar' },
    'ph-reports':  { x: 1358, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Reports' },
    'ph-prep':     { x: 1784, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Prep' },
    'ph-meals':    { x: 2210, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'Meals' },
    'ph-more':     { x: 2636, y:  2020, w:  390, h: FAM_H, s: 2, role: 'family',      label: 'More' },
    /* h FAM_H (974) -> 1160. `.tblwrap` was overflow:auto at clientHeight 147
       against scrollHeight 451: five of the seven rows of "every family idea
       in the practice" were behind an INNER SCROLLBAR, on a board the reader
       navigates by dragging the world and in a document read with nobody
       presenting. Uncapped, the frame needs 1177 of content box, so h1200:
       2020 + 1200 = 3220, which clears §3's rule at 3234 by 14px. The cap
       comes off in zone-family.js and NO ROW IS CUT — content taller than its
       box is a frame-sizing bug, not a scroll affordance. */
    ugc:           { x: 3106, y:  2020, w: 1014, h:   1200, s: 2, role: 'family',      label: 'The review loop' },

    /* h 1320 -> 1390. `.tblwrap` hid 138 of 608px (16 client rows, 77% shown).
       3384 + 1390 = 4774, which is every pixel section 3's band has left (the
       s3 door closes at 4784 and §4's rule is at 4824). The cap goes 470 ->
       540 to take it, leaving 68px still hidden — closing the last 68 needs
       the section-3 BAND to grow, which cascades sections 4-8 and the world
       height, so it is reported rather than done here. */
    roster:        { x:   80, y:  3384, w: 1320, h: 1390, s: 3, role: 'practitioner', label: 'Roster' },
    builder:       { x: 1480, y:  3384, w: 1240, h: 1320, s: 3, role: 'practitioner', label: 'Week builder' },
    'ph-handoff':  { x: 2850, y:  3384, w:  390, h: FAM_H, s: 3, role: 'family',      label: 'The same day, on the phone' },
    templates:     { x: 3320, y:  3384, w:  800, h: 1320, s: 3, role: 'practitioner', label: 'Template editor' },

    macro:         { x:   80, y:  4974, w: 1960, h: 1180, s: 4, role: 'owner',        label: 'Practice dashboard' },
    phases:        { x: 2120, y:  4974, w: 2000, h: 1180, s: 4, role: 'owner',        label: 'Phase duration' },

    roles:         { x:   80, y:  6424, w: 1240, h:  920, s: 5, role: 'method',       label: 'Who sees what' },
    /* h 920 -> 940: the three top-level columns overhang the declared rect by
       11.4px. Nothing clips today (.zone is overflow:visible) but the §4c
       table was wrong and any band tightening would have cut live text. */
    auth:          { x: 1400, y:  6424, w: 1180, h:  940, s: 5, role: 'method',       label: 'Sign-in and 2FA' },
    invite:        { x: 2660, y:  6424, w: 1460, h:  920, s: 5, role: 'method',       label: 'Invitations' },

    /* h 1280 -> 1320 on both: measured content 2540 x 1303 and 1420 x 1309
       against a declared 1280 (.schema__grid overhung by 50.5px, rls's last
       card by 44.9). 7614 + 1320 = 8934, inside the s6 door's 8974 floor. */
    erd:           { x:   80, y:  7614, w: 2540, h: 1320, s: 6, role: 'method',       label: 'The schema' },
    rls:           { x: 2700, y:  7614, w: 1420, h: 1320, s: 6, role: 'method',       label: 'What makes it safe' },

    stack:         { x:   80, y:  9164, w: 2060, h:  880, s: 7, role: 'method',       label: 'The stack' },
    timeline:      { x: 2220, y:  9164, w: 1900, h:  880, s: 7, role: 'method',       label: 'Six weeks to v1' },

    /* UX AUDIT 2026-10-28. 4040 x 560 -> 1100 x 420. Same defect as `title`
       and the one the client screenshotted: ink union 1273 x 353 inside a
       4040 x 560 box = 31.5% W / 63% H, with 1300px empty left, 1467px
       empty right and three dead rects over 200x200. The frame held a
       1440px band because the camera could not reach further — so the
       camera fix was baked into the LAYOUT and left a 2767px hole. The
       three credential columns measure 315 / 245 / 336 at max-content, so
       1100 is the content's own width; .team's max-width band comes off in
       app.css §16p and the head and the grid finally share one left edge
       (they were 167px apart). Its waypoint follows to w1160, z=1.002. */
    team:          { x:   80, y: 10314, w: 1100, h:  420, s: 8, role: 'owner',        label: 'Who builds it' },
    scope:         { x:   80, y: 10954, w: 1540, h: 1320, s: 8, role: 'owner',        label: 'What v1 includes' },
    pricing:       { x: 1700, y: 10954, w: 1240, h: 1320, s: 8, role: 'owner',        label: 'What it costs' },
    terms:         { x: 3020, y: 10954, w: 1100, h:  720, s: 8, role: 'owner',        label: 'Terms' }
  };

  /* Reading order, which is also DOM order for the map and the layout pass. */
  var ZONE_ORDER = Object.keys(LAYOUT);

  /* ---------------------------------------------------------------- sections */
  /* §4b. Each header is world chrome drawn by this file: a `.section` box whose
     top edge IS the hairline across x80 → x4120, with the number, the title and
     the one-liner hung under it. The frames start 150px below the rule, every
     time, so the rhythm of the board is a rule, a title, one line, then work —
     and the air above a rule always belongs to the section that just ended.

     `door` is where the sidebar sends you. It is deliberately NARROW and
     anchored at x40: goto() fits a rect to the viewport WIDTH, so a 4040-wide
     door would clamp at 0.7 and centre the band, landing you in the middle of a
     section with its first frame off screen to the left.

     EVERY DOOR IS NOW 1120, NOT 1700 — UX audit 2026-10-28, and this is the
     single highest-leverage fix for the half of the client's report that reads
     "some of this text is too small". Do the arithmetic the camera actually
     does: z = clamp((pan - 48) / rect.w, 0.7, 1.05). On a 1440 window the pan
     surface is 1210, so the numerator is 1162 and

       rect 1700  ->  z = 0.70 (the FLOOR)  ->  12px renders at  8.4 device px
       rect 1000  ->  z = 1.05  (the CEILING) ->  12px renders at 12.6 device px

     1700 was not "a legible zoom on any laptop": it was the zoom floor on
     every laptop, and the sidebar is the normal way to read a 12,000px board,
     so eight of the board's camera stops were serving 12px type at 8.4px.

     1000, not 1120, because the CLAMP ABSORBS THE EXCESS at the wide end and
     nothing absorbs it at the narrow end. A 1000-wide door lands at the 1.05
     ceiling on a 1440 window (showing a little more than the rect, which costs
     nothing) and at z=1.00 on a 1280 one, where the numerator is 1002 — so the
     doors are legible on BOTH common laptop widths. A 1120 door was 12.5px at
     1440 and 10.7px at 1280. The
     structural limit, stated plainly so no future rect walks back into it:
     WITH goto() CLAMPED AT 1.05 AND FITTING TO WIDTH, NO RECT WIDER THAN 1107
     WORLD PX CAN RENDER 12px TYPE AT 12 DEVICE PX, AND NONE WIDER THAN 1290
     CAN RENDER 13px AT 12. A door still lands on the section's top-left
     corner, which is its job; the reader drags for the rest, which is the
     model. Frames that the door no longer reaches have their own waypoints —
     `auth` and `rls` were added this pass precisely so the doors did not have
     to be wide to make them reachable. */

  var SECTIONS = [
    { n: 1, y:   360, title: 'The problem', track: 'product',
      /* section lines are set as TEXT, not HTML — a literal glyph, never an entity */
      line: 'One child, three foods, a paper booklet, and the rest carried in a parent’s head.',
      /* y:40, not 320. The banner ends at y260 and a door opening at y320
         started 26px below it, so the board's own "How to read this board"
         strip — the one thing a reader with nobody presenting needs first —
         was reachable only by dragging. Key 1 now includes it. */
      door: { x: 40, y:    40, w: 1000, h: 1790 } },
    { n: 2, y:  1870, title: 'The family app',
      line: 'The whole day — drops, tapping, every dose — on one screen.',
      /* THE ONE DOOR WHOSE HEIGHT CHANGED, 1590 → 1364, and the only edit in
         this table that is not a flat −226. Its y is its own rule − 40 and so
         is unmoved; its floor is the next rule − 40, which came up with every
         other rule on the board (3420 → 3194). Section 2 is now the shallowest
         band here — every frame in it is 974 — so a door still reaching 3420
         would be a door standing 226px inside section 3. Height is
         DOCUMENTATION in this table, not camera input: gotoKey fits a rect to
         WIDTH and anchors its top, so a stale h cannot misframe anything. That
         is precisely why it is kept honest — it is the only record of what a
         section occupies. */
      /* h 1364 -> 1404: `ugc` now stands 1200 tall (y2020 -> y3220) rather
         than FAM_H, so section 2 occupies 40 more than it did. Height is
         DOCUMENTATION in this table — gotoKey fits to WIDTH — and this is the
         only record of what a section occupies, so it is kept true. */
      door: { x: 40, y:  1830, w: 1000, h: 1404 } },
    { n: 3, y:  3234, title: 'The practitioner',
      line: 'Templates as a starting point, then changed in seconds.',
      door: { x: 40, y:  3194, w: 1000, h: 1590 } },
    { n: 4, y:  4824, title: 'What the practice learns',
      line: 'How long each phase really takes, and exactly where it stalls.',
      door: { x: 40, y:  4784, w: 1000, h: 1450 } },
    { n: 5, y:  6274, title: 'Access and invitations', track: 'business',
      line: 'Invite-only, two-factor, and practitioners who can help each other.',
      /* h1190, not 1200: §6's rule is at 7464, so rule - 40 is 7424 and 6234 +
         1200 overshot the next door's top by ten. Every other door in this
         table already closes on the next rule - 40 exactly. */
      /* measured before this pass: clicking "5" showed 30% of `auth` and 0% of
         `invite`, with nothing on screen saying `invite` existed. Widening the
         door was the wrong answer (it clamps to 0.70 and makes every string
         8.4px); the answer is per-frame waypoints, so `auth` now has one and
         `invite` always did. The door stays narrow and legible. */
      door: { x: 40, y:  6234, w: 1000, h: 1190 } },
    { n: 6, y:  7464, title: 'The data',
      line: 'Everything above, as tables you own.',
      /* same measurement: `rls` was 0% visible from "6", and now has its own
         waypoint rather than a 4120-wide door that nothing could read. */
      door: { x: 40, y:  7424, w: 1000, h: 1550 } },
    { n: 7, y:  9014, title: 'Delivery',
      line: 'Six weeks to v1, then QA against the real booklet.',
      door: { x: 40, y:  8974, w: 1000, h: 1150 } },
    { n: 8, y: 10164, title: 'The engagement',
      line: 'What it costs and what you get.',
      /* still closes on the world's own bottom edge: 10124 + 1930 = 12054 */
      door: { x: 40, y: 10124, w: 1000, h: 1930 } }
  ];

  /* Where each section begins, for the camera → sidebar derivation. A section
     owns everything from 120px above its rule down to 120px above the next
     one's, so the highlight changes as the rule comes into view rather than
     when its first frame does. */
  var BANDS = SECTIONS.map(function (s, i) { return i === 0 ? -1e9 : s.y - 120; });

  /* ------------------------------------------------------------- waypoints */
  /* Every camera destination, in one table. The eight section doors, every stop
     on both walkthroughs (rects verbatim from §4e), and three aliases kept so a
     zone that still says goto('family') lands somewhere sensible. */

  var WAYPOINTS = [];

  function wp(key, rect, label) {
    WAYPOINTS.push({ key: key, rect: rect, label: label });
  }

  SECTIONS.forEach(function (s) {
    wp('s' + s.n, s.door, s.n + ' · ' + s.title);
  });

  /* §4e product track */
  /* Four rects depart from the §4e table, and each one departs because the §4e
     rect and the §4e clamp cannot both hold at a laptop width. The camera can
     never show more than (pan width / WP_MIN) world px — 1728 on the 1210px
     pan surface of a 1440 window — so a rect wider than that is cropped no
     matter where it is anchored, and in every one of these four the thing the
     caption names is what fell off. The rule is kept; the rectangles move.

       burden   3200 → 1600  the caption is burden's content, but 2/3 of the
                             rect was the `wait` frame; now it frames burden.
       handoff  1560 → 1180  the §4e rect ran x1440→3000 while ph-handoff sits
                             inside x2850→3240, so the rect ITSELF excluded part
                             of the phone the stop exists to change. Re-anchored
                             on Publish-week → the phone's right edge + 30, which
                             also lifts the opening zoom to ≈0.98 (rule 2).
                             ITS y ALSO MOVED, 3580 → 3790 → 3564, and that is
                             the one camera edit the proportions pass forced.
                             gotoKey anchors a rect's TOP at the inset and takes
                             its zoom from the WIDTH, so the height of this rect
                             has never done anything and the only lever on what
                             fits below is y. At 0.985 the camera reaches 834 of
                             world; ph-handoff is a 974 frame, so from y3580 the
                             phone ran 194px off the bottom of the board's own
                             OPENING VIEW — its action tiles and its tab bar, on
                             the one stop that exists to show the plan landing.
                             3564 is the DEVICE's own top edge less the inset,
                             measured on a 1440 × 900 window: the pan surface is
                             1210 × 841, the width clamp puts z at 0.985, the
                             view runs 3540 → 4394, and the device (3540 → 4358)
                             sits FLUSH at the top of it with 36px to spare at
                             the bottom — verified, not derived. So the hardware
                             is whole and its top edge is where a camera stop
                             should put it. On a pan surface shorter than 818/z
                             the device cannot be whole at any y, which is the
                             window's limit and not this rect's.
                             The Publish week button (y3720–3756, re-measured off
                             the moved frame) and the wire (y3727–3738) are both
                             well inside. What it costs is
                             the two caption heads — `builder`'s and the phone's
                             — which the stop's own caption already says out loud;
                             what it buys is the whole of the thing that changes.
                             Rule 2 is kept: the width is untouched, so the board
                             still opens at 0.985. h follows y down to the phone's
                             bottom edge so the rect still DESCRIBES what is
                             shown rather than carrying a height nothing reads.
       ugc      1800 → 1400  the frame's own width, so it fits and stays centred.
       team     4120 → 1500  with the credential bar held to a 1440px band, so
                             all three credentials fit the camera's reach at a
                             1280 window as well as a 1440 one.

     THE THREE SECTION-2 RECTS ALSO CHANGE, because the frames under them did
     (HOME_SPEC §1). The rule that governs them is the same one as above: at 390
     wide, two phones and their gap are 824px, so a rect that frames two lands
     at the WP_MAX clamp and a rect that frames four cannot be shown at all. The
     old rects framed four 320s and three 320s and were already cropping at a
     laptop width; now each one frames the phones its caption actually names,
     fully, at 1.05.

       family-day    1900 → 904  ph-home + ph-schedule, the two screens stop 3's
                                 caption is about — HOME is the day, and its UP
                                 NEXT reads SCHEDULE's core plan. Lands at the
                                 1.05 clamp, so the screen the client is judging
                                 is shown at a shade over life size.
       family-ideas  1500 →  904  ph-meals + ph-more, re-anchored from x1170 to
                                 x1776 to follow them right.
       ugc           1720 → 1400  the frame's own new width. This one goes from
                                 clamping at 0.7 on a 1280 window to fitting at
                                 0.72, so narrowing the frame FIXED the stop.

     AND ALL THREE CHANGE AGAIN THIS ROUND — HOME_SPEC §12. The frames under
     them moved right and `ugc` narrowed, so a rect left alone would frame the
     wrong phones, which is the one failure a waypoint cannot survive: a stop
     whose caption names two screens and shows a third is worse than no stop.
     Each one is RE-ANCHORED ON ITS OWN SUBJECT, not shifted by a constant —
     the row is wider but the gap inside it is narrower, so there is no single
     offset that would be right for all three, and treating this as a flat
     translation is exactly how the rects would end up 8px wrong.

       family-day    904 →  896  SAME SUBJECT, ph-home + ph-schedule, and the
                                 same x40 — HOME did not move. Two phones and
                                 ONE gap is now 390 + 36 + 390 = 816, not 824,
                                 so the span runs x80 → x896 and the rect is
                                 that span with the 40px of air it has always
                                 carried either side: x40, w896. Still past the
                                 1.05 clamp on a 1280 window (1008/896 = 1.13),
                                 so the screen the client judges is still shown
                                 a shade over life size.
       family-ideas  904 →  896  SAME SUBJECT, ph-meals + ph-more, which moved
                                 right by +394 and +386 — DIFFERENT amounts, so
                                 there is no offset to apply. Derived instead:
                                 the span is x2210 → x3026, so the rect
                                 re-anchors x1776 → x2170 (2210 − 40) and takes
                                 816 + 80 = 896. The anchor moved +394 and the
                                 width moved −8, which is the 8px the gap gave
                                 up, showing up inside a single rectangle.
       ugc          1400 → 1014  the frame's own new width again, and its x
                                 follows the frame from 2720 to 3106. The stop
                                 now CLAMPS at 1.05 on a 1440 window
                                 (1162/1014 = 1.15) instead of fitting at 0.83,
                                 and still fits unclamped at 0.99 on a 1280 one
                                 — so the review loop is finally shown at life
                                 size rather than three-quarters of it. The
                                 narrowing of this frame has now improved this
                                 stop twice.

     `ph-reports` GETS NO WAYPOINT OF ITS OWN, deliberately, and neither does
     `ph-prep` or `ph-calendar` — §4e's product track has eight stops and
     HOME_SPEC §12 adds a screen, not a stop. Every one of those keys still
     answers ART.canvas.goto(), because rectFor() falls back to the LAYOUT
     rectangle plus 40px of air when no waypoint matches, and that fallback is
     read from the table above — so the three unlisted phones re-aim themselves
     and are the one part of this sweep with nothing to edit.

     EVERY RECT BELOW SECTION 2 CAME UP 226, because every frame below section 2
     did — one flat offset, no rect re-derived and no anchor re-chosen, because
     nothing changed SIZE down there. Each one keeps the 30px of air above its
     frame it has always had: templates 3354, phases 4944, roles and invite
     6394, erd 7584, timeline 9134, team 10284, pricing 10924. `handoff` is the
     exception and takes the same 226 (3790 → 3564) for a different reason —
     its y is the device's top edge, not a frame's, and the device came up with
     the frame.

     THE SECTION-2 RECTS keep their y and lose height: the phone row runs 2020 →
     2994, so family-day and family-ideas are 1990 → 3004 at h1014, and `ugc`
     now matches them (h1236 → 1014) because `ugc` is now the same 974 as the
     phones. The section-3 and section-4 rects are 226 up but otherwise
     untouched, because what sets those is `builder`, `templates` and `phases`,
     none of which changed size.

     §12 TOUCHES NO y AND NO h ANYWHERE IN THIS TABLE. All three section-2
     rects keep y1990 and h1014; every rect below section 2 is unchanged to the
     digit. The band's floor is still y2994 and §3's rule is still y3234,
     because a seventh phone 390 × FAM_H standing in the same row changes the
     band's WIDTH budget and nothing else. */

  /* THE MASTHEAD NOW HAS A STOP. It had none: its only reachable rect was
     the `s1` door, which shows world x26-1754 at z0.70 — 41% of the old
     4040 frame, with the credential at 8.4px. 1120 wide puts z at 1.037. */
  wp('title',        { x:   50, y:   30, w: 1120, h:  260 }, 'The argument');
  /* `concurrency` had no stop either, and it is the WIDEST frame on the board
     at 3120: from `s1` only 24% of it was reachable, with its 15 week labels
     at 8.4px. 1120 frames its label column and its first weeks at z=1.0375,
     which is where the frame is actually read; the rest is a drag. The frame
     itself is still wider than the camera can show whole — see the note on
     SECTIONS above for the structural limit, and SPEC §4c for the frames that
     still need re-cutting under it. */
  wp('concurrency',  { x:  960, y:  480, w: 1120, h:  660 }, 'Three protocols at once');
  wp('booklet',      { x:   40, y:  480, w:  920, h: 1280 }, 'The booklet');
  /* `wait` had no waypoint either — one of the four frames in section 1 was
     reachable only from `s1`, which shows 50% of its width and 10% of its
     height, and the wait-protocol argument is inside it. Mirrors `burden`. */
  wp('wait',         { x:  960, y: 1110, w: 1600, h:  680 }, 'The wait protocol');
  wp('burden',       { x: 2560, y: 1110, w: 1600, h:  680 }, 'What else they carry');
  wp('family-day',   { x:   40, y: 1990, w:  896, h: 1014 }, 'The day');
  wp('family-ideas', { x: 2170, y: 1990, w:  896, h: 1014 }, 'Meal ideas');
  /* h follows the frame: ugc is 1200 tall now, y2020 -> y3220 */
  wp('ugc',          { x: 3106, y: 1990, w: 1014, h: 1260 }, 'Shared back');
  wp('handoff',      { x: 2090, y: 3564, w: 1180, h:  794 }, 'The handoff');
  wp('templates',    { x: 3280, y: 3354, w:  880, h: 1380 }, 'The template');
  wp('phases',       { x: 2080, y: 4944, w: 2080, h: 1240 }, 'Where it stalls');
  /* §4e business track */
  wp('roles',        { x:   40, y: 6394, w: 1320, h:  980 }, 'Who sees what');
  /* TWO-FACTOR AND ROW-LEVEL SECURITY HAD NO CAMERA STOP AT ALL — not a
     waypoint, not a tour step. They are the B1 requirement and the
     justification for the $2,500 audit line, and from the section doors
     (1700 wide against content spanning x80-x4120) `invite` was 0% visible
     from `s5` and `rls` 0% from `s6`. Both now have their own stop. */
  wp('auth',         { x: 1360, y: 6394, w: 1260, h:  980 }, 'Sign-in and 2FA');
  wp('invite',       { x: 2620, y: 6394, w: 1540, h:  980 }, 'The invitation');
  wp('erd',          { x:   40, y: 7584, w: 2620, h: 1340 }, 'The schema');
  wp('rls',          { x: 2660, y: 7584, w: 1500, h: 1340 }, 'What makes it safe');
  wp('timeline',     { x: 2180, y: 9134, w: 1980, h:  940 }, 'The schedule');
  /* follows the resized frame: x80-x1180 with 30px of air either side */
  wp('team',         { x:   50, y:10284, w: 1160, h:  480 }, 'Who builds it');
  wp('pricing',      { x: 1660, y:10924, w: 1320, h: 1080 }, 'The engagement');

  var BY_KEY = {};
  WAYPOINTS.forEach(function (w) { BY_KEY[w.key] = w; });

  /* Older keys, from the five-stop canvas this board grew out of. */
  var ALIAS = {
    practitioner: 'builder', family: 'family-day', owner: 'macro',
    board: 's1', title: 's1', problem: 's1', 'family-app': 'family-day'
  };

  /* ------------------------------------------------------- the four connectors */
  /* §4d. Drawn in world coordinates UNDER the zones, so each wire reads as
     emerging from behind the surface it leaves. Labels ride on their own layer
     above and are counter-scaled, so they stay crisp at any zoom.

     Every anchor is a zone edge from LAYOUT, never a free coordinate — except
     the one marked MEASURED, which is a point inside rendered content and is
     therefore read off the live board rather than computed:
       w-booklet  booklet right  x960  → concurrency left x1000  (the 40px channel)
       w-handoff  builder right  x2720 → ph-handoff  left x2850  (the hero channel)
                  y both ends MEASURED: the Publish week button, and NEXT UP
       w-share    ph-meals       y2994 → ugc         left x3106
       w-actual   roster bottom  y4704 → macro        top y4974
     The hero leaves the builder level with Publish week and enters the phone
     level with its plan, so the packet reads as leaving the button.

     HOME_SPEC §12 MOVES EXACTLY ONE OF THE FOUR, AND IT IS w-share — BOTH
     ENDS. It is the one wire with an anchor inside section 2's phone row, and
     §12 moved both of the things it joins, and BY DIFFERENT AMOUNTS: ph-meals
     went x1816 → x2210 (so its bottom-centre, the departure point, went 2011 →
     2405, +394) and `ugc`'s left edge, the landing, went x2720 → x3106 (+386).
     +394 and +386 — because `ugc` sits past one more tightened gap than
     ph-meals does — so the curve is RE-DERIVED below rather than translated. w-booklet, w-handoff and
     w-actual are untouched to the digit: nothing in sections 1, 3 or 4 moved.

     THE §1 ROUND, for the record. Two of the four moved then, and neither was
     a phone's bottom edge: section 2 did not move at all, so w-share — ph-meals'
     bottom y2994 up the 80px channel into ugc's left edge — was byte-for-byte
     what it was, and so was w-booklet in section 1. What moved is everything BELOW section 2, 226 up,
     which is both ends of w-actual (roster's bottom and macro's top, so the
     270px gap it spans is unchanged and the whole run is a flat −226) and both
     ends of the hero.

     THE HERO WAS RE-MEASURED, NOT SHIFTED. Both its anchors are points inside
     rendered content — the Publish week button on one side, NEXT UP on the
     other — and content inside a frame does not necessarily travel with the
     frame's own top edge, so arithmetic on last round's numbers is exactly the
     mistake this round exists to correct. Both ends were read off the live
     board after the frames moved; they came out a flat 226 up, which is now a
     verified fact rather than an assumption. A wire left on a stale number
     would start or finish in open desk — which is why these `d` strings are the
     last thing edited and the first thing checked.

     `kind` is the only thing passed to CSS: app.css owns which colour each kind
     paints. An empty kind takes .wire's default hairline. */

  var WIRES = [
    /* up the 40px channel: out of the booklet low, into the gantt high. A
       40px-wide gutter cannot hold a wire AND a bend, so the wire owns the
       channel's centre line and the chip sits in the crook where the booklet,
       the gantt and the wait ladder meet. */
    { id: 'w-booklet', kind: '', sw: 1.5,
      d: 'M 960 1240 C 980 1240 980 1220 980 1190 L 980 880 C 980 852 980 840 1000 840',
      label: 'the same six fields', lx: 980, ly: 1130 },

    /* the hero, across the 130px channel builder → ph-handoff, and the one
       wire on the board that has to be right: it is the whole claim of the
       pitch made as a picture. BOTH ENDS MOVED, so both were re-derived rather
       than nudged.

       BOTH ENDS ARE MEASURED POINTS INSIDE CONTENT, so both were RE-MEASURED
       off the live board after the frames moved rather than arithmetically
       shifted. A frame's top edge moving 226 does not prove that the button
       drawn inside it moved 226 — a flow that reflows, a head that re-wraps or
       a scroller that re-clamps would break that assumption silently, and the
       hero is the one wire on the board where a silent 10px error is visible to
       the client.

       It leaves x2720 — the builder's right edge — at y3739, the vertical
       centre of the Publish week button, measured at x2579.05–2700,
       y3720.49–3756.69: its right edge lands exactly on x2700, 20px inside the
       builder's own edge, so the packet reads as leaving the button and not as
       leaving the frame somewhere near it.

       It lands on x2850, ph-handoff's left edge, at y3727 — the vertical centre
       of NEXT UP, the first thing a published week puts in front of a parent,
       measured at y3673.29–3780.98 inside a device of y3540 → y4358 and a glass
       of y3582 → y4346.

       Both reads came out a flat 226 above last round's (3965 → 3739, 3953 →
       3727), which is now a verified fact rather than an assumption: the
       content inside both frames travelled with its frame. The run is still the
       same twelve-pixel rise from the button to the thing the button causes —
       level, because on a phone-shaped phone the two ends already are. Control
       points stay at 45% and 55% across the 130px channel (x2779, x2791), and
       the label still rides the channel's centre line at x2785, midway between
       the two ends (3739 + 3727) / 2 = 3733. */
    { id: 'w-handoff', kind: 'hero', sw: 3, hero: true, grad: 'art-grad-handoff',
      d: 'M 2720 3739 C 2779 3739 2791 3727 2850 3727',
      mono: 'WeeklyPlan', label: '· published', lx: 2785, ly: 3733 },

    /* leaves the Meals phone (ph-meals, the screen a family idea is actually
       shared FROM) along the one free band under the seven phones, then up the
       80px channel between More and the review loop — so it never crosses a
       phone.

       BOTH ENDS MOVED THIS ROUND BY DIFFERENT AMOUNTS, which is the whole
       reason this `d` is re-derived instead of shifted. HOME_SPEC §12 put a
       seventh phone fourth in the row and paid for it out of the gap and out
       of `ugc`'s width:

         departure  bottom-centre of ph-meals, 2210 + 195 = x2405 (was 2011,
                    1816 + 195), at y2994, still the phone bottom at FAM_H 974.
                    +394.
         landing    ugc's left edge, x3106 (was 2720), at y2924. +386.

       +394 and +386. A flat translation of this curve would have been 8px
       wrong at one end, which on a 80px channel is a tenth of the only gap the
       wire has to thread. The horizontal run therefore shortens 709 → 701, and
       the two control points are re-anchored on the things they were anchored
       on in the first place rather than on the old x values:

         C1  x2574  = departure + 169, the same reach off the phone's underside
         C2  x3006  = ph-more's right edge (3026) − 20, the same 20px of bite
                      inside the frame it has to clear

       RE-MEASURED OFF THIS `d`, not assumed, and the shape it produces is the
       old shape to within half a pixel:
         deepest point              y3077.7 at x2719  (was y3077.7 at x2328)
         clears ph-more's left  x2636 by 79.2  (was 79.9 at the old x2250)
         clears ph-more's RIGHT x3026 by 10.0  (was  9.6 at the old x2640)
         crosses back above y2994 at x3040.9  — 14.9 INSIDE the 80px channel
                                               (was x2654.4, 14.4 inside it)
       So the tightest point on the whole run is still ph-more's bottom-right
       corner with ~10px of air, and the curve still re-crosses the phone line
       inside the channel rather than under a phone, which is the entire point
       of the shape. The §1 round established why the landing cannot be lifted
       to sit further from ugc's bottom-left corner: at an end of y2800 the
       crossing rises at x2566, at y2740 at x2531, both 60–90px deep inside
       ph-more. That still holds — the geometry is congruent — so the landing
       stays at y2924, 904px down a left edge running 2020 → 2994, 70px above
       the corner. The debt is still the FRAME's height, and `ugc` is being
       re-arranged inside 1014 × 974 in this same round; re-aim this wire at
       the band it actually arrives at THEN, off the live board, not now and
       not from these numbers.

       The chip rides 26px left and 12px above the curve's own midpoint
       (2781.4, 3075.3), in the open band below the row — the same offset it
       carried from the old midpoint, so lx 2365 → 2755 and ly is unchanged at
       3063. 69px under the phones, and still clear of §3's rule at 3234: the
       chip by 171, the curve's deepest point by 156. Both figures are
       identical to last round's because neither end's y moved. */
    { id: 'w-share', kind: 'coral', sw: 1.5,
      d: 'M 2405 2994 C 2574 3124 3006 3104 3106 2924',
      label: 'shared back', lx: 2755, ly: 3063 },

    /* the only wire that crosses a section rule, and it still crosses at
       x≈1530 — clear of §4's title on the left and its caption below. BOTH ends
       came up 226 with their own frames, so the run is a flat −226 and the
       270px gap it spans is what it always was: roster's bottom is y4704, §4's
       rule is y4824, and macro's top is y4974. */
    { id: 'w-actual', kind: 'navy', sw: 1.5,
      d: 'M 1340 4704 C 1340 4794 1800 4884 1800 4974',
      label: 'every logged day', lx: 1460, ly: 4762 }
  ];

  /* ---------------------------------------------------- the two walkthroughs */
  /* §4e. The sidebar lets you jump; a walkthrough says where to go and what to
     say. Captions are verbatim from the contract — this document is sent to the
     client, and these fourteen lines are the voice-over nobody will be there to
     give. `pulse` is the zone that rings when the camera lands; `hero` is the
     one stop that plays itself. */

  var TRACKS = {
    product: {
      key: 'product', label: 'The product',
      stops: [
        { n: 1, key: 'booklet',      title: 'The booklet',          pulse: 'booklet',
          line: 'Every line is the same six fields. It is already a schema with no screen.' },
        { n: 2, key: 'burden',       title: 'What else they carry', pulse: 'burden',
          line: 'Three protocols at once — plus the drops and the tap the page has no room for.' },
        { n: 3, key: 'family-day',   title: 'The day',              pulse: 'ph-home',
          line: 'The whole day on one screen: drops, the spine tap, and every dose in order.' },
        { n: 4, key: 'family-ideas', title: 'Meal ideas',           pulse: 'ph-meals',
          line: 'Maintenance is the long part, so the app carries meal ideas for it.' },
        { n: 5, key: 'ugc',          title: 'Shared back',          pulse: 'ugc',
          line: 'A family’s own idea, reviewed by their practitioner, shared to everyone.' },
        { n: 6, key: 'handoff',      title: 'The handoff',          pulse: 'ph-handoff', hero: true,
          line: 'Publish, and the week is on the family’s phone before the visit ends.' },
        { n: 7, key: 'templates',    title: 'The template',         pulse: 'templates',
          line: 'A template is a starting point. Stretch it, hold it, or skip a food.' },
        { n: 8, key: 'phases',       title: 'Where it stalls',      pulse: 'phases',
          line: 'How long each phase really takes — and exactly where it stalls.' }
      ]
    },
    business: {
      key: 'business', label: 'The engagement',
      stops: [
        { n: 1, key: 'roles',    title: 'Who sees what',   pulse: 'roles',
          line: 'Invite-only. Practitioners can see each other’s clients and help.' },
        { n: 2, key: 'invite',   title: 'The invitation',  pulse: 'invite',
          line: 'Assign a family, and the invitation and app download go out.' },
        { n: 3, key: 'erd',      title: 'The schema',      pulse: 'erd',
          line: 'Every table you would own, on Supabase.' },
        { n: 4, key: 'timeline', title: 'The schedule',    pulse: 'timeline',
          line: 'Six weeks to v1, then QA against your real booklets.' },
        { n: 5, key: 'team',     title: 'Who builds it',   pulse: 'team',
          line: 'Built by the people behind FlipaClip and Planet Fitness’s product org.' },
        { n: 6, key: 'pricing',  title: 'The engagement',  pulse: 'pricing',
          line: 'What it costs, and what the monthly actually covers.' }
      ]
    }
  };

  var DEFAULT_TRACK = 'product';
  var HOME = 'handoff';          /* where the board opens, and where exit returns */

  /* -------------------------------------------------------------------- state */

  var state = { x: 0, y: 0, z: 1 };            /* live, exposed as ART.canvas.state */
  var vp = { w: 1280, h: 800, left: 0, top: 0 };
  var node = {};
  var chips = [];            /* wire labels, counter-scaled */
  var current = HOME;        /* last framed waypoint */
  var sectionNow = 0;        /* the section the camera is standing in */
  var dirtyCam = false;      /* the user has taken the camera by hand */
  var frame = 0;
  var lastZ = -1;
  var anim = null;           /* goto tween */
  var glide = null;          /* pan inertia */
  var inFlight = {};         /* packet promises, keyed by wire id */
  var pulseTimers = {};
  var spaceDown = false;
  var lastMeasure = -1e9;
  var sectionBtns = null;
  var mapBands = null;
  var booted = false;

  /* ------------------------------------------------------------------- helpers */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(v) { return Math.round(v * 100) / 100; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function mk(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag), k;
    for (k in attrs) { if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]); }
    return el;
  }

  function div(cls, x, y, w, h) {
    var d = document.createElement('div');
    d.className = cls;
    d.style.position = 'absolute';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (w != null) d.style.width = w + 'px';
    if (h != null) d.style.height = h + 'px';
    return d;
  }

  function drop(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function measure(force) {
    if (!node.viewport) return;
    var t = now();
    if (!force && t - lastMeasure < 180) return;
    lastMeasure = t;
    var r = node.viewport.getBoundingClientRect();
    vp.w = r.width > 200 ? r.width : 1280;
    vp.h = r.height > 160 ? r.height : 800;
    vp.left = r.left;
    vp.top = r.top;
  }

  /* ----------------------------------------------------------------- the camera */

  function clampPan(x, y, z) {
    var ww = W * z, wh = H * z;
    if (ww <= vp.w) x = (vp.w - ww) / 2;
    else x = clamp(x, vp.w - ww - PAN_MARGIN, PAN_MARGIN);
    if (wh <= vp.h) y = (vp.h - wh) / 2;
    else y = clamp(y, vp.h - wh - PAN_MARGIN, PAN_MARGIN);
    return { x: x, y: y };
  }

  /* The only place the world transform is written: one element, one property,
     no layout touched. Everything else on the board stays still — the sidebar,
     the map rect and the section highlight are all arithmetic off the numbers
     already in hand, which is why a drag stays at frame rate on a 12,054px
     board. */
  function apply() {
    var c = clampPan(state.x, state.y, state.z);
    state.x = c.x;
    state.y = c.y;
    node.world.style.transform =
      'translate3d(' + rnd(state.x) + 'px,' + rnd(state.y) + 'px,0) scale(' + rnd(state.z) + ')';
    if (state.z !== lastZ) { lastZ = state.z; onZoomChange(); }
    updateMapRect();
    trackSection();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(function () { frame = 0; apply(); });
  }

  /* Wire labels hold a constant on-screen size, so they never blur and never
     balloon. Runs only when the zoom actually changes. */
  function onZoomChange() {
    if (node.zoomValue) node.zoomValue.textContent = Math.round(state.z * 100) + '%';
    var t = 'translate(-50%,-50%) scale(' + rnd(clamp(1 / state.z, 0.68, 1.5)) + ')';
    for (var i = 0; i < chips.length; i++) chips[i].style.transform = t;
  }

  function cancelAnims() {
    if (anim) { anim.stop = true; anim = null; }
    glide = null;
  }

  function animateTo(x, y, z, animate) {
    cancelAnims();
    if (!animate || reduced()) {
      state.x = x; state.y = y; state.z = z;
      apply();
      return;
    }
    var x0 = state.x, y0 = state.y, z0 = state.z, t0 = 0;
    var a = anim = { stop: false };
    requestAnimationFrame(function step(ts) {
      if (a.stop) return;
      if (!t0) t0 = ts;
      var t = clamp((ts - t0) / GOTO_MS, 0, 1);
      var e = 1 - Math.pow(1 - t, 3);
      state.z = z0 * Math.pow(z / z0, e);
      state.x = x0 + (x - x0) * e;
      state.y = y0 + (y - y0) * e;
      apply();
      if (t < 1) requestAnimationFrame(step);
      else if (anim === a) anim = null;
    });
  }

  /* Any waypoint, any stop key, or any frame key — a frame falls back to its
     own rectangle with 40px of air, so ART.canvas.goto('ph-meals') works for a
     zone that wants to send the camera somewhere specific. */
  function rectFor(key) {
    var w = BY_KEY[key] || BY_KEY[ALIAS[key]];
    if (w) return w.rect;
    var L = LAYOUT[key] || LAYOUT[ALIAS[key]];
    if (L) return { x: L.x - 40, y: L.y - 40, w: L.w + 80, h: L.h + 80 };
    return null;
  }

  /* THE CAMERA RULE, unchanged and non-negotiable: fit the rect TO WIDTH ONLY,
     align its top edge with a 24px inset, clamp z to [0.7, 1.05]. Never fit to
     height — height-fitting is what made the rejected version illegible, and
     vertical overflow is exactly what panning is for.

     Horizontally the rect is CENTRED while it fits. Once WP_MIN clamps — a rect
     wider than the camera's reach, which on a 1210px pan surface is 1728 world
     px — centring would cut BOTH edges, and the left edge is the one every
     caption refers to: a chart's category axis, a gantt's row labels, a frame's
     own title. So a rect that cannot fit is LEFT-ALIGNED to the same 24px inset
     the top gets, and the overflow is pushed to the right where panning finds
     it. §4e fixes the fit rule and the clamp; the horizontal anchor is ours. */
  function gotoKey(key, animate) {
    var r = rectFor(key);
    if (!r || !node.world) return;
    measure(true);
    var z = clamp((vp.w - INSET * 2) / r.w, WP_MIN, WP_MAX);
    var x = (r.w * z > vp.w)
      ? (INSET - r.x * z)
      : ((vp.w - r.w * z) / 2 - r.x * z);
    var y = INSET - r.y * z;
    current = key;
    dirtyCam = false;
    animateTo(x, y, z, animate !== false);
  }

  function gotoSection(n, animate) {
    n = Math.round(Number(n));
    if (!(n >= 1 && n <= SECTIONS.length)) return;
    gotoKey('s' + n, animate !== false);
  }

  function setZoom(z, cx, cy) {
    if (!node.world) return;
    measure();
    z = clamp(z, Z_MIN, Z_MAX);
    if (cx == null) { cx = vp.left + vp.w / 2; cy = vp.top + vp.h / 2; }
    var px = cx - vp.left, py = cy - vp.top;
    var wx = (px - state.x) / state.z;
    var wy = (py - state.y) / state.z;
    cancelAnims();
    state.z = z;
    state.x = px - wx * z;
    state.y = py - wy * z;
    dirtyCam = true;
    schedule();
  }

  /* Only ever reached on purpose: the Overview button, or the 0 key. The board
     never OPENS like this — rule 2 — but "show me the shape of the whole
     document" is a real move on a board this tall, and Reset is one button
     away. It deliberately does NOT clamp to Z_MIN: on a 4200x12054 world the
     whole board lands at ~6%, and clamping to 30% would deliver neither the
     shape nor legible type. The control is labelled Overview for that reason
     rather than Fit, because it cannot promise legibility. */
  function fit() {
    if (!node.world) return;
    if (stepNow()) tourExit(true);
    measure(true);
    var z = Math.min((vp.w - INSET * 2) / W, (vp.h - INSET * 2) / H, Z_MAX);
    dirtyCam = true;
    animateTo((vp.w - W * z) / 2, (vp.h - H * z) / 2, z, true);
  }

  function centerOn(wx, wy) {
    cancelAnims();
    dirtyCam = true;
    state.x = vp.w / 2 - wx * state.z;
    state.y = vp.h / 2 - wy * state.z;
    schedule();
  }

  function panBy(dx, dy) {
    cancelAnims();
    dirtyCam = true;
    state.x += dx;
    state.y += dy;
    schedule();
  }

  /* ------------------------------------------------------------------ the zones */
  /* app.js creates the zone elements from this table; init() then stamps the
     authoritative geometry onto whatever it finds, wherever it was appended. */

  function layoutZones() {
    ZONE_ORDER.forEach(function (key) {
      var el = document.getElementById('z-' + key);
      if (!el) return;
      var L = LAYOUT[key];
      el.style.position = 'absolute';
      el.style.left = L.x + 'px';
      el.style.top = L.y + 'px';
      el.style.width = L.w + 'px';
      el.style.height = L.h + 'px';
      el.setAttribute('data-key', key);
      el.setAttribute('data-section', String(L.s));
      if (!el.getAttribute('data-role')) el.setAttribute('data-role', L.role);
    });
  }

  function pulse(key) {
    var el = document.getElementById('z-' + key);
    if (!el) return;
    if (pulseTimers[key]) {
      clearTimeout(pulseTimers[key]);
      el.classList.remove('zone--pulse');
      void el.offsetWidth;                 /* restart the one-shot animation */
    }
    el.classList.add('zone--pulse');
    pulseTimers[key] = setTimeout(function () {
      el.classList.remove('zone--pulse');
      pulseTimers[key] = 0;
    }, 1200);
  }

  /* ----------------------------------------------------------------- the wires */

  function buildWires() {
    if (!node.wirePaths) return;
    WIRES.forEach(function (w) {
      var p = mk('path', {
        id: w.id,
        'class': 'wire',
        d: w.d,
        fill: 'none',
        'stroke-width': w.sw,
        'stroke-linecap': 'round',
        /* keeps a hairline a hairline at every zoom */
        'vector-effect': 'non-scaling-stroke'
      });
      if (w.kind) p.setAttribute('data-kind', w.kind);
      /* the only stroke this file names is the gradient reference; every colour
         behind it is app.css's */
      if (w.grad) p.setAttribute('stroke', 'url(#' + w.grad + ')');
      node.wirePaths.appendChild(p);
    });
  }

  function buildLabels() {
    if (!node.labels) return;
    node.labels.style.position = 'absolute';
    node.labels.style.left = '0';
    node.labels.style.top = '0';
    WIRES.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'wire__label';
      d.setAttribute('data-wire', w.id);
      if (w.hero) d.setAttribute('data-hero', '');
      if (w.mono) {
        var mono = document.createElement('span');
        mono.className = 'mono';
        mono.textContent = w.mono;
        d.appendChild(mono);
        d.appendChild(document.createTextNode(' '));
      }
      d.appendChild(document.createTextNode(w.label));
      d.style.position = 'absolute';
      d.style.left = w.lx + 'px';
      d.style.top = w.ly + 'px';
      d.style.transform = 'translate(-50%,-50%)';
      node.labels.appendChild(d);
      chips.push(d);
    });
  }

  /* ------------------------------------------------------------- world chrome */
  /* The eight section headers, §4b. One `.section` per section, positioned with
     its TOP EDGE on the section's y: app.css draws the hairline as that box's
     own border-top (with a short navy lead at the left end, because a 1px
     hairline across 4040px at 70% zoom needs an anchor), then lays the number,
     the title and the one-liner out underneath it. So this file owns the two
     numbers that matter — x80 and the exact y of the rule — and app.css owns
     every size, weight and colour in the band.

     The header stands ~104px tall and the section's first frame is 150px below
     the rule, every time, which is the rhythm of the whole board: a rule, a
     title, one line, then work. Nothing sits above the rule — that air belongs
     to the section that just ended.

     Sections 1 and 5 carry data-track, because those are where the two
     walkthroughs open; app.css turns their lead segment coral off it, and the
     aside says so in words for a reader with nobody presenting. */

  function buildChrome() {
    if (!node.chrome) return;
    node.chrome.style.position = 'absolute';
    node.chrome.style.left = '0';
    node.chrome.style.top = '0';
    node.chrome.style.width = W + 'px';
    node.chrome.style.height = H + 'px';
    node.chrome.style.pointerEvents = 'none';

    SECTIONS.forEach(function (s) {
      /* height stays auto: the band is as tall as its own type, and a fixed
         height here would be this file quietly re-deciding app.css's leading */
      var head = div('section', 80, s.y, 4040, null);
      head.setAttribute('data-section', String(s.n));
      if (s.track) head.setAttribute('data-track', s.track);

      var num = document.createElement('p');
      num.className = 'section__num';
      num.textContent = pad2(s.n);
      head.appendChild(num);

      var t = document.createElement('h2');
      t.className = 'section__title';
      t.textContent = s.title;
      head.appendChild(t);

      var cap = document.createElement('p');
      cap.className = 'section__line';
      cap.textContent = s.line;
      head.appendChild(cap);

      if (s.track) {
        var aside = document.createElement('p');
        aside.className = 'section__aside';
        var chip = document.createElement('span');
        chip.className = 'chip chip--coral';
        chip.textContent = TRACKS[s.track].label + ' walkthrough starts here';
        aside.appendChild(chip);
        head.appendChild(aside);
      }

      node.chrome.appendChild(head);
    });
  }

  /* The hero packet. Returns a promise that resolves when it lands, so the
     caller can chain the publish and the toast behind it. Deduped while in
     flight, so a double-press cannot stack two packets. */
  function packet(wireId) {
    if (inFlight[wireId]) return inFlight[wireId];
    var path = document.getElementById(wireId);
    if (!path || !node.wireFx) return Promise.resolve();

    var pr = new Promise(function (resolve) {
      function done() { inFlight[wireId] = null; resolve(); }

      if (reduced()) {
        path.classList.add('wire--flash');
        setTimeout(function () { path.classList.remove('wire--flash'); done(); }, 680);
        return;
      }

      var L = 0;
      try { L = path.getTotalLength(); } catch (e) { L = 0; }
      if (!L) { done(); return; }

      var trailLen = Math.min(190, L * 0.5);
      var trail = mk('path', {
        'class': 'wire__trail', d: path.getAttribute('d'), fill: 'none',
        stroke: path.getAttribute('stroke'), 'stroke-width': 7,
        'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
        opacity: '0.4',
        'stroke-dasharray': rnd(trailLen) + ' ' + rnd(L + trailLen + 2),
        'stroke-dashoffset': rnd(trailLen)
      });
      var halo = mk('circle', { 'class': 'wire__halo', r: 17, cx: -40, cy: -40, fill: 'currentColor', opacity: '0.14' });
      var head = mk('circle', { 'class': 'wire__packet', r: 7, cx: -40, cy: -40, fill: 'currentColor' });
      node.wireFx.appendChild(trail);
      node.wireFx.appendChild(halo);
      node.wireFx.appendChild(head);

      var t0 = 0;
      requestAnimationFrame(function step(ts) {
        if (!t0) t0 = ts;
        var t = clamp((ts - t0) / PACKET_MS, 0, 1);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var pt = path.getPointAtLength(e * L);
        head.setAttribute('cx', rnd(pt.x));
        head.setAttribute('cy', rnd(pt.y));
        halo.setAttribute('cx', rnd(pt.x));
        halo.setAttribute('cy', rnd(pt.y));
        trail.setAttribute('stroke-dashoffset', rnd(trailLen - e * (L + trailLen)));
        if (t < 1) { requestAnimationFrame(step); return; }
        setTimeout(function () { drop(trail); drop(halo); drop(head); done(); }, 160);
      });
    });

    inFlight[wireId] = pr;
    return pr;
  }

  /* --------------------------------------------------------------- the sidebar */
  /* The eight rows are real buttons, and the current one is DERIVED FROM THE
     CAMERA: a sidebar that only highlights the last thing you clicked is a
     menu, not a position. trackSection() runs inside apply(), so it updates
     while you drag — and it does no layout work, only arithmetic on numbers
     measure() already took. */

  function trackSection() {
    var n = 0;
    if (vp.h && state.z) {
      /* the whole board in view: no single section is current, and claiming one
         would be a lie the moment you press Fit */
      if (vp.h / state.z <= H * 0.55) {
        var probe = (-state.y + vp.h * 0.28) / state.z;
        for (var i = 0; i < BANDS.length; i++) if (probe >= BANDS[i]) n = i + 1;
      }
    }
    if (n === sectionNow) return;
    sectionNow = n;
    paintSection();
  }

  function paintSection() {
    var i;
    if (sectionBtns) {
      for (i = 0; i < sectionBtns.length; i++) {
        var on = Number(sectionBtns[i].getAttribute('data-section')) === sectionNow;
        sectionBtns[i].setAttribute('aria-current', on ? 'true' : 'false');
        if (on) sectionBtns[i].setAttribute('data-current', '');
        else sectionBtns[i].removeAttribute('data-current');
      }
    }
    if (mapBands) {
      for (i = 0; i < mapBands.length; i++) {
        if (Number(mapBands[i].getAttribute('data-section')) === sectionNow) {
          mapBands[i].setAttribute('data-current', '');
        } else {
          mapBands[i].removeAttribute('data-current');
        }
      }
    }
  }

  function bindSidebar() {
    if (!node.sections) return;
    sectionBtns = node.sections.querySelectorAll('[data-section]');
    node.sections.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-section]') : null;
      if (!b) return;
      /* leaving the path leaves the walkthrough: the bar may not stay behind
         claiming a stop you have panned away from */
      if (stepNow()) tourExit(true);
      gotoSection(b.getAttribute('data-section'), true);
    });
  }

  /* -------------------------------------------------------------------- the map */
  /* The board as positioned divs — app.css paints each frame by role, so
     everything here is a percentage of the world and survives any width the
     sidebar ends up with. 4200 × 12054 is a tall, narrow shape, and the map is
     drawn at exactly that shape: it is the one place the whole document is
     visible at once, so it may not lie about its proportions.

     IT IS WHOLLY DERIVED, which is why HOME_SPEC §12 needed no edit here: the
     loop walks ZONE_ORDER — Object.keys(LAYOUT), band order — and reads x/y/w/h
     straight off each row, so `ph-reports` appeared in the map, in the right
     place, at the right width, with its label on hover, the moment it was added
     to the table. The six phones that moved — two a few px left, three a whole
     phone right — moved in the map too, each by its own amount, because the map
     never held an x of its own to get wrong. A hand-kept list of keys here is
     the defect this shape exists to prevent; nothing in this function may ever
     name a frame. */

  function pc(v, total) { return (v / total * 100).toFixed(3) + '%'; }

  function buildMinimap() {
    var host = node.minimap;
    if (!host) return;

    var inner = document.createElement('div');
    inner.className = 'minimap__inner';

    ZONE_ORDER.forEach(function (key) {
      var L = LAYOUT[key];
      var d = document.createElement('div');
      d.className = 'minimap__zone';
      d.setAttribute('data-role', L.role);
      d.setAttribute('data-key', key);
      d.setAttribute('data-section', String(L.s));
      d.setAttribute('title', L.label);        /* hover names every frame */
      d.style.position = 'absolute';
      d.style.left = pc(L.x, W);
      d.style.top = pc(L.y, H);
      d.style.width = pc(L.w, W);
      d.style.height = pc(L.h, H);
      inner.appendChild(d);
    });

    /* the eight section rules, so the map carries the same divisions as the
       board. A zero-height .minimap__zone is exactly a hairline in the map's
       own vocabulary, so this file still names no colour. */
    mapBands = [];
    SECTIONS.forEach(function (s) {
      var r = document.createElement('div');
      r.className = 'minimap__zone minimap__rule';
      r.setAttribute('data-section', String(s.n));
      r.setAttribute('title', s.n + ' · ' + s.title);
      r.style.position = 'absolute';
      r.style.left = pc(80, W);
      r.style.width = pc(4040, W);
      r.style.top = pc(s.y, H);
      r.style.height = '0';
      inner.appendChild(r);
      mapBands.push(r);
    });

    node.mapRect = document.createElement('div');
    node.mapRect.className = 'minimap__rect';
    inner.appendChild(node.mapRect);

    host.appendChild(inner);
    node.mapInner = inner;
  }

  /* The map's SIZE is app.css's: in the rail it is sized by height (--mm-h) and
     takes its width from the same two world tokens, and it stands down on its
     own below a 700px-tall viewport. Nothing here sets its box — this file only
     fills it and keeps the view rect in register, which is why there is no
     measuring pass for it at all.

     Clamped to the world, so the rect can never spill outside the map frame. */
  function updateMapRect() {
    var r = node.mapRect;
    if (!r) return;
    var z = state.z;
    var x1 = clamp(-state.x / z, 0, W), x2 = clamp((-state.x + vp.w) / z, 0, W);
    var y1 = clamp(-state.y / z, 0, H), y2 = clamp((-state.y + vp.h) / z, 0, H);
    r.style.left = pc(x1, W);
    r.style.top = pc(y1, H);
    r.style.width = pc(Math.max(2, x2 - x1), W);
    r.style.height = pc(Math.max(1.4, y2 - y1), H);
  }

  function bindMinimap() {
    var host = node.minimap, inner = node.mapInner;
    if (!host || !inner) return;
    var md = null;

    function toWorld(e, box) {
      return {
        x: (e.clientX - box.left) * (W / box.width),
        y: (e.clientY - box.top) * (H / box.height)
      };
    }

    host.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      measure(true);
      var box = inner.getBoundingClientRect();
      if (!box.width) return;
      var p = toWorld(e, box);
      var cw = vp.w / state.z, ch = vp.h / state.z;
      var cx = -state.x / state.z, cy = -state.y / state.z;
      /* grabbing the rect keeps the grab offset; clicking the map centres there */
      var inside = p.x >= cx && p.x <= cx + cw && p.y >= cy && p.y <= cy + ch;
      md = {
        id: e.pointerId, box: box,
        ox: inside ? p.x - (cx + cw / 2) : 0,
        oy: inside ? p.y - (cy + ch / 2) : 0
      };
      centerOn(p.x - md.ox, p.y - md.oy);
      try { host.setPointerCapture(e.pointerId); } catch (err) {}
    });

    host.addEventListener('pointermove', function (e) {
      if (!md || e.pointerId !== md.id) return;
      var p = toWorld(e, md.box);
      centerOn(p.x - md.ox, p.y - md.oy);
    });

    function end() {
      if (!md) return;
      try { host.releasePointerCapture(md.id); } catch (err) {}
      md = null;
    }
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener('lostpointercapture', end);
  }

  /* ----------------------------------------------------------------- panning */
  /* Capture is taken lazily, only once the press has travelled past the slop
     threshold, so a plain click always reaches whatever is under it. */

  var NO_PAN = 'button,input,select,textarea,a,label,[data-nopan]';

  function bindPan() {
    var vpEl = node.viewport;
    var drag = null;

    vpEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (!spaceDown && e.target && e.target.closest && e.target.closest(NO_PAN)) return;
      measure(true);
      cancelAnims();
      drag = {
        id: e.pointerId, px: e.clientX, py: e.clientY,
        vx: 0, vy: 0, t: now(), live: false
      };
      if (spaceDown) e.preventDefault();
    });

    vpEl.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.px, dy = e.clientY - drag.py;

      if (!drag.live) {
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        drag.live = true;
        try { vpEl.setPointerCapture(drag.id); } catch (err) {}
        vpEl.setAttribute('data-panning', '');   /* app.css owns the cursor */
        dirtyCam = true;
      }

      drag.px = e.clientX;
      drag.py = e.clientY;
      var t = now();
      var dt = Math.max(1, t - drag.t);
      drag.t = t;
      drag.vx = drag.vx * 0.7 + (dx / dt) * 16 * 0.3;
      drag.vy = drag.vy * 0.7 + (dy / dt) * 16 * 0.3;
      state.x += dx;
      state.y += dy;
      schedule();
    });

    function release(e) {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (!d.live) return;
      try { vpEl.releasePointerCapture(d.id); } catch (err) {}
      vpEl.removeAttribute('data-panning');
      if (e && e.type === 'pointerup') startGlide(d.vx, d.vy);
    }
    vpEl.addEventListener('pointerup', release);
    vpEl.addEventListener('pointercancel', release);
  }

  /* A short glide off the end of a drag — the difference between an instrument
     and a web page, and the first thing reduced motion switches off. */
  function startGlide(vx, vy) {
    if (reduced()) return;
    if (Math.abs(vx) < 0.8 && Math.abs(vy) < 0.8) return;
    var g = glide = { vx: clamp(vx, -90, 90), vy: clamp(vy, -90, 90), stale: 0 };
    requestAnimationFrame(function loop() {
      if (glide !== g) return;
      var x0 = state.x, y0 = state.y;
      g.vx *= 0.9;
      g.vy *= 0.9;
      state.x += g.vx;
      state.y += g.vy;
      apply();
      if (Math.abs(state.x - x0) < 0.3 && Math.abs(state.y - y0) < 0.3) g.stale++;
      if ((Math.abs(g.vx) < 0.12 && Math.abs(g.vy) < 0.12) || g.stale > 2) { glide = null; return; }
      requestAnimationFrame(loop);
    });
  }

  function bindWheel() {
    var lastWheel = -1e9;
    node.viewport.addEventListener('wheel', function (e) {
      /* anything that scrolls its own content opts out with data-nopan */
      if (e.target && e.target.closest && e.target.closest('[data-nopan]')) return;
      var t = now();
      if (t - lastWheel > 220) measure(true);
      lastWheel = t;
      e.preventDefault();
      cancelAnims();
      var unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? vp.h : 1);
      if (e.ctrlKey || e.metaKey) {
        setZoom(state.z * Math.exp(-e.deltaY * unit * 0.0022), e.clientX, e.clientY);
        return;
      }
      dirtyCam = true;
      state.x -= e.deltaX * unit;
      state.y -= e.deltaY * unit;
      schedule();
    }, { passive: false });
  }

  /* ----------------------------------------------------------------- keyboard */

  function typing(e) {
    var t = e.target;
    if (!t) return false;
    if (t.isContentEditable) return true;
    var n = (t.tagName || '').toLowerCase();
    return n === 'input' || n === 'select' || n === 'textarea' || n === 'option';
  }

  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (typing(e)) return;
      var k = e.key;

      if (k === ' ' || k === 'Spacebar') {
        /* space is hold-to-pan — but on a focused control it is that control's
           activation key, and swallowing it would make every button in the
           chrome keyboard-dead */
        if (e.target && e.target.closest && e.target.closest(NO_PAN)) return;
        spaceDown = true;
        e.preventDefault();
        return;
      }

      /* While a walkthrough is running these override the plain pan bindings,
         and only while it is running: arrows step it, Escape leaves it. The
         digits stay what they are everywhere else on this board — section
         jumps — so they take the bar down on the way out rather than leaving it
         claiming a stop you have left. */
      if (stepNow()) {
        if (k === 'ArrowRight') { tourNext(); e.preventDefault(); return; }
        if (k === 'ArrowLeft')  { tourPrev(); e.preventDefault(); return; }
        if (k === 'Escape')     { tourExit(); e.preventDefault(); return; }
        if (k === 'h' || k === 'H') { tourExit(); e.preventDefault(); return; }
        if (k >= '1' && k <= '8') { tourExit(true); }
      }

      if (k === 'Escape' || k === 'h' || k === 'H') { gotoKey(HOME, true); return; }
      if (k === '0') { fit(); e.preventDefault(); return; }
      if (k >= '1' && k <= '8') { gotoSection(parseInt(k, 10), true); e.preventDefault(); return; }
      if (k === '+' || k === '=') { setZoom(state.z * 1.14); e.preventDefault(); return; }
      if (k === '-' || k === '_') { setZoom(state.z / 1.14); e.preventDefault(); return; }

      var step = e.shiftKey ? 480 : 120;
      if (k === 'ArrowLeft')  { panBy(step, 0);  e.preventDefault(); return; }
      if (k === 'ArrowRight') { panBy(-step, 0); e.preventDefault(); return; }
      if (k === 'ArrowUp')    { panBy(0, step);  e.preventDefault(); return; }
      if (k === 'ArrowDown')  { panBy(0, -step); e.preventDefault(); return; }
      if (k === 'PageUp')     { panBy(0, vp.h * 0.85);  e.preventDefault(); return; }
      if (k === 'PageDown')   { panBy(0, -vp.h * 0.85); e.preventDefault(); return; }
    });

    window.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') spaceDown = false;
    });
    window.addEventListener('blur', function () { spaceDown = false; });
  }

  /* ------------------------------------------------------- the walkthroughs */
  /* §4e. Two tracks: `product` is eight stops, `business` is six. The client
     could not work out how to walk through his own canvas, so one press and
     seven presses of Next have to tell the whole story unattended — including
     the money shot, which stop 6 fires for itself rather than waiting to be
     found.

     The bar lives in .viewport, NOT in .world, so it never scales with the zoom
     and never pans away. State lives in ART.store.state.tourTrack /
     .tourStep (0 = off), so the store stays the single source of truth and
     Reset clears the walkthrough with everything else. The local mirrors are
     only ever reached if core.js failed to load, which on file:// is a real
     possibility. */

  var localTrack = null;
  var localStep = 0;
  var tourTimer = 0;

  function trackNow() {
    var s = ART.store && ART.store.state;
    var k = s ? s.tourTrack : localTrack;
    return TRACKS[k] ? k : null;
  }

  function stopsOf(k) {
    return (TRACKS[k] || TRACKS[DEFAULT_TRACK]).stops;
  }

  function stepNow() {
    var s = ART.store && ART.store.state;
    var n = s ? s.tourStep : localStep;
    if (typeof n !== 'number' || n < 1) return 0;
    var k = trackNow();
    if (!k) return 0;
    return Math.min(n, stopsOf(k).length);
  }

  /* One write path. With the store present this re-enters paintTour through
     onStore, so the bar, the buttons and the camera can never disagree. */
  function writeStep(track, n) {
    localTrack = n > 0 ? track : null;
    localStep = n;
    if (ART.store && ART.store.set) {
      ART.store.set({ tourTrack: n > 0 ? track : null, tourStep: n });
    } else {
      paintTour();
    }
  }

  function clearTourTimer() {
    if (tourTimer) { clearTimeout(tourTimer); tourTimer = 0; }
  }

  function paintTour() {
    var bar = node.tour;
    if (!bar) return;
    var n = stepNow();
    var k = trackNow();
    var on = n > 0 && !!k;
    var had = !bar.hidden;

    /* both halves on purpose: `hidden` takes it out of the accessibility tree,
       and the explicit display beats the bar's own inline layout rule, which
       would otherwise out-specify the [hidden] default and leave it on screen */
    bar.hidden = !on;
    bar.style.display = on ? 'flex' : 'none';

    /* The two buttons carry this region's state, and only the running track's
       button carries it. */
    if (node.tourBtns) {
      for (var i = 0; i < node.tourBtns.length; i++) {
        var b = node.tourBtns[i];
        var mine = on && b.getAttribute('data-track') === k;
        /* aria-expanded because the button shows and hides the bar, and
           aria-pressed because it is also the track's own on/off state —
           app.css inverts the running one off the latter in the rail and off
           the former in the top bar, so both are set rather than guessed */
        b.setAttribute('aria-expanded', mine ? 'true' : 'false');
        b.setAttribute('aria-pressed', mine ? 'true' : 'false');
      }
    }

    if (node.viewport) {
      if (on) node.viewport.setAttribute('data-tour', '');
      else node.viewport.removeAttribute('data-tour');
    }

    if (!on) {
      bar.removeAttribute('data-step');
      bar.removeAttribute('data-steps');
      bar.removeAttribute('data-track');
      bar.removeAttribute('data-hero');
      /* the bar is going away: never leave focus inside a hidden region */
      if (had && node.tourBtns && node.tourBtns.length && bar.contains(document.activeElement)) {
        try { node.tourBtns[0].focus(); } catch (e) {}
      }
      return;
    }

    var stops = stopsOf(k);
    var s = stops[n - 1];

    /* the step, declared once. app.css reads data-step x data-steps for the
       progress rule along the top edge and data-hero for the one coral stop, so
       an eight-stop track and a six-stop track need no second widget and no
       inline value to keep in sync. */
    bar.setAttribute('data-step', String(n));
    bar.setAttribute('data-steps', String(stops.length));
    bar.setAttribute('data-track', k);
    if (s.hero) bar.setAttribute('data-hero', '');
    else bar.removeAttribute('data-hero');
    if (node.tourTrack) node.tourTrack.textContent = TRACKS[k].label;

    if (node.tourStop)  node.tourStop.textContent = n + ' · ' + s.title;
    if (node.tourLine)  node.tourLine.textContent = s.line;
    if (node.tourCount) node.tourCount.textContent = n + ' of ' + stops.length;
    if (node.tourPrev)  node.tourPrev.disabled = n === 1;
    /* the last Next finishes rather than pretending there is another stop */
    if (node.tourNext)  node.tourNext.textContent = n === stops.length ? 'Done' : 'Next →';
    if (node.tourPrev && node.tourNext &&
        node.tourPrev.disabled && document.activeElement === node.tourPrev) {
      try { node.tourNext.focus(); } catch (e) {}
    }
  }

  /* THE MONEY SHOT. The handoff stop plays itself: arm a draft if the week has
     already gone out, fly the packet, and PUBLISH ON ARRIVAL so the plan
     visibly lands on the phone at the exact moment the dot gets there.

     Without the re-arm, a second pass through the walkthrough would send an
     empty handoff — a packet travelling over an unchanged phone, which is the
     hollow version of this moment and the one this build has been caught on
     twice. The draft is captured when it is armed and checked again on arrival,
     so a re-entered stop cannot publish the same week twice. */
  function fireHandoff(opts) {
    var toast = !!(opts && opts.toast);
    clearTourTimer();
    tourTimer = setTimeout(function () {
      tourTimer = 0;
      var st = ART.store;
      var s = st && st.state;
      var armed = null;

      if (s && st.startDraft) {
        var d = s.draft;
        if (!d || d.publishedAt || d.clientId !== s.focusClientId) {
          try { st.startDraft(s.focusClientId); } catch (e) {}
        }
        armed = st.state.draft;
      }

      var p = packet('w-handoff');
      if (!p || !p.then) return;
      p.then(function () {
        var live = st && st.state ? st.state.draft : null;
        if (st && st.publishPlan && armed && live === armed && !armed.publishedAt) {
          try { st.publishPlan(); } catch (e) {}
          if (toast && st.toast) {
            try { st.toast('Published — next week is on the family’s phone', 'ok'); } catch (e2) {}
          }
        }
        pulse('ph-handoff');
      });
    }, HERO_DELAY);
  }

  function tourGoto(n) {
    var k = trackNow() || DEFAULT_TRACK;
    return trackGoto(k, n);
  }

  function trackGoto(k, n) {
    if (!TRACKS[k]) k = DEFAULT_TRACK;
    var stops = stopsOf(k);
    n = Math.round(Number(n));
    if (!(n >= 1 && n <= stops.length)) return stepNow();
    clearTourTimer();
    var s = stops[n - 1];
    writeStep(k, n);
    gotoKey(s.key, true);
    if (s.pulse) pulse(s.pulse);
    if (s.hero) fireHandoff({ toast: true });
    return n;
  }

  function tourStart(track) {
    var k = TRACKS[track] ? track : DEFAULT_TRACK;
    var n = trackGoto(k, 1);
    /* focus the one control the presenter will press seven more times, so the
       whole walkthrough is Enter, Enter, Enter */
    if (n === 1 && node.tourNext) { try { node.tourNext.focus(); } catch (e) {} }
    return n;
  }

  function tourNext() {
    var n = stepNow();
    var k = trackNow();
    if (!n || !k) return tourStart(DEFAULT_TRACK);
    if (n >= stopsOf(k).length) { tourExit(); return 0; }
    return trackGoto(k, n + 1);
  }

  function tourPrev() {
    var n = stepNow();
    var k = trackNow();
    return (n > 1 && k) ? trackGoto(k, n - 1) : n;
  }

  /* Leaves the board where it opened: the handoff stop, default zoom. */
  function tourExit(keepCamera) {
    clearTourTimer();
    var was = stepNow();
    writeStep(null, 0);
    if (was && !keepCamera) gotoKey(HOME, true);
    return 0;
  }

  /* ------------------------------------------------------------------ top bar */

  function bindChrome() {
    /* Anything, anywhere, that asks for a camera move by key — delegated from
       the document, because a zone that renders a `data-goto` button rebuilds
       its own subtree on every store change and a handler bound to the element
       would go with it. */
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-goto]') : null;
      if (!b) return;
      if (stepNow()) tourExit(true);
      gotoKey(b.getAttribute('data-goto'), true);
    });

    if (node.tourBtns) {
      Array.prototype.forEach.call(node.tourBtns, function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-track') || DEFAULT_TRACK;
          /* pressing the running track's own button is "close this" */
          if (stepNow() && trackNow() === k) { tourExit(); return; }
          tourStart(k);
        });
      });
    }

    if (node.tourNext)  node.tourNext.addEventListener('click', function () { tourNext(); });
    if (node.tourPrev)  node.tourPrev.addEventListener('click', function () { tourPrev(); });
    if (node.tourExit)  node.tourExit.addEventListener('click', function () { tourExit(); });

    if (node.fit) node.fit.addEventListener('click', function () { fit(); });
    if (node.zoomIn) node.zoomIn.addEventListener('click', function () { setZoom(state.z * 1.14); });
    if (node.zoomOut) node.zoomOut.addEventListener('click', function () { setZoom(state.z / 1.14); });

    /* Replay runs the whole handoff again, not just the animation: it frames
       the channel, arms next week and publishes it when the packet lands. A
       packet over an unchanged phone is the defect; a replay that changes
       nothing is the same defect with a different button on it. app.js owns the
       toast for this one. */
    if (node.replay) {
      node.replay.addEventListener('click', function () {
        if (stepNow()) tourExit(true);
        gotoKey(HOME, true);
        fireHandoff({ toast: false });
      });
    }

    /* The switch is app.js's control because it writes the store; the world
       class is reflected FROM store state, so both paths land in one place. */
    if (node.hints) {
      node.hints.addEventListener('change', function () {
        if (ART.store && ART.store.set) ART.store.set({ hints: !!node.hints.checked });
        else node.world.classList.toggle('world--hints', !!node.hints.checked);
      });
    }
  }

  function syncHints() {
    var on = (ART.store && ART.store.state && typeof ART.store.state.hints === 'boolean')
      ? ART.store.state.hints : true;
    node.world.classList.toggle('world--hints', on);
    if (node.hints && node.hints.checked !== on) node.hints.checked = on;
  }

  function has(changed, key) {
    if (!changed) return true;
    if (typeof changed === 'string') return changed === key;
    return changed.indexOf ? changed.indexOf(key) > -1 : true;
  }

  function onStore(changed) {
    if (has(changed, 'hints')) syncHints();
    /* `reset` matters as much as `tourStep`: store.reset() swaps in a fresh
       state object with no tour keys at all, which is the walkthrough being
       switched off — the bar has to follow it down. */
    if (has(changed, 'tourStep') || has(changed, 'tourTrack') || has(changed, 'reset')) {
      if (has(changed, 'reset')) { localTrack = null; localStep = 0; }
      paintTour();
    }
  }

  /* -------------------------------------------------------------------- resize */

  function onResize() {
    measure(true);
    if (dirtyCam) { schedule(); return; }
    gotoKey(current, false);
  }

  /* ---------------------------------------------------------------------- init */

  function init() {
    if (booted) return;

    node.viewport = document.getElementById('art-viewport');
    node.world = document.getElementById('art-world');
    if (!node.viewport || !node.world) return;
    booted = true;

    node.wirePaths = document.getElementById('art-wire-paths');
    node.wireFx = document.getElementById('art-wire-fx');
    node.chrome = document.getElementById('art-chrome');
    node.labels = document.getElementById('art-wirelabels');
    node.zones = document.getElementById('art-zones');
    node.plate = document.getElementById('art-plate');
    node.sidebar = document.getElementById('art-sidebar');
    node.sections = document.getElementById('art-sections');
    node.minimap = document.getElementById('art-minimap');
    node.zoomValue = document.getElementById('art-zoom-value');
    node.zoomIn = document.getElementById('art-zoom-in');
    node.zoomOut = document.getElementById('art-zoom-out');
    node.fit = document.getElementById('art-fit');
    node.replay = document.getElementById('art-replay');
    node.hints = document.getElementById('art-hints');

    node.tour = document.getElementById('art-tour');
    /* scoped to the sidebar's own group: paintTour() puts data-track on the BAR
       as well, and the two walkthrough buttons are the only [data-track] this
       list may ever contain */
    node.tourBtns = document.querySelectorAll('[data-area="tour"] [data-track]');
    node.tourTrack = document.getElementById('art-tour-track');
    node.tourStop = document.getElementById('art-tour-stop');
    node.tourLine = document.getElementById('art-tour-line');
    node.tourCount = document.getElementById('art-tour-count');
    node.tourPrev = document.getElementById('art-tour-prev');
    node.tourNext = document.getElementById('art-tour-next');
    node.tourExit = document.getElementById('art-tour-exit');

    node.world.style.width = W + 'px';
    node.world.style.height = H + 'px';
    if (node.zones) {
      node.zones.style.position = 'absolute';
      node.zones.style.left = '0';
      node.zones.style.top = '0';
    }
    /* app.css makes the plate absolute but states no offsets — the world's
       bottom-left corner is this file's call, so it is set here unconditionally.
       64px lines its own padding up with the x80 content column. */
    if (node.plate) {
      node.plate.style.position = 'absolute';
      node.plate.style.left = '64px';
      node.plate.style.bottom = '6px';
    }

    /* The walkthrough bar is pinned to .viewport rather than to .world: inside
       the world the transform would scale the type and pan it off screen.
       app.css owns its surface and its type; these are the offsets only this
       file knows, exactly as with the plate. */
    if (node.tour) {
      node.tour.style.position = 'absolute';
      node.tour.style.left = '24px';
      node.tour.style.right = '24px';
      node.tour.style.bottom = 'calc(18px + env(safe-area-inset-bottom, 0px))';
      node.tour.style.zIndex = '7';
    }

    layoutZones();
    buildWires();
    buildLabels();
    buildChrome();
    buildMinimap();

    bindPan();
    bindWheel();
    bindKeys();
    bindChrome();
    bindSidebar();
    bindMinimap();

    window.addEventListener('resize', onResize);
    if (ART.store && ART.store.on) ART.store.on(onStore);
    syncHints();
    paintTour();                 /* starts hidden: tourStep is 0 until pressed */

    /* The viewport can still be settling at first paint (stylesheet, webfonts).
       Re-frame on both, but only while the user has not taken the camera. */
    window.addEventListener('load', function () { if (!dirtyCam) onResize(); });
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { if (!dirtyCam) onResize(); });
      }
    } catch (e) {}

    measure(true);
    lastZ = -1;
    sectionNow = -1;             /* force the first paint of the sidebar */
    gotoKey(HOME, false);        /* never, ever fit-to-board on open */
  }

  /* ------------------------------------------------------------------- the API */

  ART.canvas = {
    LAYOUT: LAYOUT,
    SECTIONS: SECTIONS,
    WAYPOINTS: WAYPOINTS,
    WIRES: WIRES,
    size: { w: W, h: H },
    state: state,
    init: init,
    goto: gotoKey,               /* waypoint key, stop key, alias or frame key */
    gotoSection: gotoSection,    /* 1–8 */
    rect: rectFor,
    setZoom: setZoom,
    fit: fit,
    pulse: pulse,
    packet: packet,
    handoff: fireHandoff,        /* arm · fly · publish on arrival */
    section: function () { return sectionNow > 0 ? sectionNow : 0; }
  };

  /* §4e. Two tracks, one caption each stop, and a camera that drives itself. */
  ART.tour = {
    TRACKS: TRACKS,
    start: function (track) { return tourStart(track); },
    next: tourNext,
    prev: tourPrev,
    /* wrapped, so a caller that hands this straight to addEventListener cannot
       pass an Event in as `keepCamera` and silently skip the trip home */
    exit: function () { return tourExit(); },
    goto: tourGoto,              /* within the running track */
    step: stepNow,
    track: trackNow,
    stops: function (k) { return stopsOf(k || trackNow() || DEFAULT_TRACK); }
  };

}());
