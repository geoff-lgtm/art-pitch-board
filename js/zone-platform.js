/* ===========================================================================
   A.R.T. pitch board — js/zone-platform.js    owner: platform   SPEC §6.5–6.6
   ---------------------------------------------------------------------------
   The five frames that answer "can we trust you with our data" for a practice
   whose protocol is its entire competitive asset. Specifics, never reassurance.

     roles   1240x920   the permissions matrix: three roles, six capabilities
     auth    1180x920   the real sign-in surfaces, and the policy beside them
     invite  1460x920   assign -> email -> accept -> 2FA -> app -> first login
     erd     2540x1280  twenty-two Supabase tables, grouped, with the spine drawn
     rls     1420x1280  the policies, buckets, channels, functions, backups, views

   Each frame has to read as a DIFFERENT KIND OF OBJECT from its neighbour, so:
     roles   a ruled, zebra-striped document with three unambiguous marks
     auth    hardware-free product surfaces on the left, a hairline policy list
             on the right, and one worked scenario
     invite  a numbered rail down the left, three real artefacts to the right
     erd     many small hairline tables on grouped sand, under one drawn chain
     rls     a policy table, then four labelled specification blocks

   Nothing here is interactive. SPEC §7 renders sections 5–8 statically on
   purpose: every control carries `data-static`, and no frame claims a `data-live`
   label it cannot honour. A half-working permissions matrix would be worse than
   an honest static one.

   Discipline: this file names NO colour, NO radius, NO shadow and NO typeface —
   css/app.css owns all of those. Inline style is used only for geometry CSS
   cannot know (grid tracks, diagram node positions, the ERD band height) and
   for the tunable custom properties app.css documents (--schema-cols, --win-h,
   --phone-h). No localStorage, no Math.random, no argless Date: "now" is
   ART.store.state.today.
   =========================================================================== */
(function () {
  'use strict';

  var ART = window.ART;
  var ui = ART.ui;
  var esc = ui.esc;
  var svg = ui.svg;

  /* ======================================================== tiny helpers == */

  function head(eyebrow, title, note) {
    return '<header class="zone__head">' +
             '<p class="zone__eyebrow">' + esc(eyebrow) + '</p>' +
             '<h2 class="zone__title">' + esc(title) + '</h2>' +
             (note ? '<p class="zone__note">' + note + '</p>' : '') +
           '</header>';
  }

  function zbody(inner) { return '<div class="zone__body">' + inner + '</div>'; }

  /* A grid is the only layout primitive these frames need. Tracks are geometry,
     so they are the one thing allowed inline. `align-content:start` keeps a
     short column from stretching its children, which is what makes a ragged
     diagram read as deliberate rather than as a stretched bug. */
  function grid(tracks, gap, inner, extra) {
    return '<div style="display:grid;grid-template-columns:' + tracks +
             ';gap:' + gap + ';align-items:start;min-width:0' +
             (extra ? ';' + extra : '') + '">' + inner + '</div>';
  }
  function stack(gap, inner) {
    return '<div style="display:grid;gap:' + gap +
             'px;align-content:start;min-width:0">' + inner + '</div>';
  }
  function eb(text) { return '<p class="eyebrow">' + esc(text) + '</p>'; }

  /* The practitioner and the client used across these five frames. Both are
     fictional and both already exist elsewhere on the board, so the invitation
     story and the audit tail name the same people the roster does. */
  /* Looked up rather than written down, so the invitation and the audit tail
     name whoever the roster names. The fallbacks exist because this document
     is opened from file://, where one blocked script would otherwise leave an
     email addressed to nobody. */
  function pracName(id, fallback) {
    var list = (ART.db && ART.db.practitioners) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return fallback;
  }
  function centreName(id, fallback) {
    var list = (ART.db && ART.db.centres) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return fallback;
  }
  function practiceShape() {
    var c = ART.metrics && ART.metrics.counts ? ART.metrics.counts() : null;
    return {
      practitioners: (c && c.practitioners) || (ART.db && ART.db.practitioners || []).length,
      centres: (c && c.centres) || (ART.db && ART.db.centres || []).length
    };
  }

  /* The invited household. It is deliberately NOT one of the 64 seeded clients:
     an invitation is what CREATES the client row, so a family that already has
     a plan cannot be the subject of one. First name + last initial, per §1.12. */
  var INVITED = 'Harper V.';
  var INVITE_PRAC = 'p-ren';
  var INVITE_DAYS = 7;
  var INVITE_AGO = -1;   /* the live invitation went out yesterday  */
  var EXPIRED_AGO = -12; /* the dead one went out twelve days ago, so it really
                            HAS expired against store.today — a screen claiming
                            an expiry that has not happened yet is a defect */

  function today() { return ART.store.state.today; }

  /* The first dose the invited family will ever see — read out of the real
     published egg library rather than written here, so the invitation and the
     protocol library can never disagree about what week one is. */
  function firstEggStep() {
    var list = (ART.db && ART.db.protocols) || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.id !== 'egg') continue;
      var ph = (p.phases || [])[0];
      var st = ph && (ph.steps || [])[0];
      if (!ph || !st) break;
      return {
        display: st.display + ' ' + ph.unit,
        phase: ph.label,
        weeks: p.weeks,
        version: p.version
      };
    }
    return { display: '1/32 tender', phase: 'Chicken tenders', weeks: 12, version: 'v3' };
  }

  /* ========================================================================
     1 · roles — the permissions matrix
     ------------------------------------------------------------------------
     A permissions matrix read wrong is a security misunderstanding, so there
     are exactly three marks and none of them is an absence: a filled disc, a
     hollow disc, and a periwinkle ring that ALWAYS carries its limit in words.
     Every cell is drawn, so an empty cell is impossible.

     The three facts underneath it, which the matrix alone cannot say, sit in
     hairline columns below: ownership is responsibility, visibility is open
     (NOTES §A6), and every write is attributed.
     ===================================================================== */

  /* v: 'yes' | 'no' | 'scoped'. qual is the words that make a limit honest —
     mandatory on 'scoped', and used on 'no' only where "no, but" is the truth. */
  function mark(v, qual) {
    return '<td>' +
             '<span class="mark" data-v="' + v + '"></span>' +
             (qual ? '<span class="mark__qual">' + esc(qual) + '</span>' : '') +
           '</td>';
  }
  function capRow(name, note, cells) {
    return '<tr>' +
             '<th scope="row">' + esc(name) +
               (note ? '<span class="meta">' + esc(note) + '</span>' : '') +
             '</th>' + cells +
           '</tr>';
  }

  var PRINCIPLES = [
    ['Ownership', 'Every client has one owning practitioner. That is who the ' +
      'roster sorts by and who is answerable for the plan — not who is allowed ' +
      'to look at it. A practitioner who leaves is deactivated, and their ' +
      'clients are reassigned in one action.'],
    ['Visibility', 'Any practitioner can open any client, at either centre or ' +
      'in the independent network. They cover for each other, so the read is ' +
      'never gated. An independent practitioner reads exactly what staff read, ' +
      'scoped to the organisation that invited them.'],
    ['Attribution', 'Every write is stamped with the actor into audit_log, with ' +
      'the row before and after. Covering for a colleague is visible, never ' +
      'invisible — and because the log is insert-only, a departing account ' +
      'cannot tidy its own history away.']
  ];

  function roles(root) {
    var c = practiceShape();

    var matrix =
      '<table class="matrix" aria-label="What each role can do">' +
        '<thead><tr>' +
          '<th>Capability</th>' +
          '<th data-role="owner">Owner' +
            '<span class="meta">management · the practice</span></th>' +
          '<th data-role="practitioner">Practitioner' +
            '<span class="meta">' + c.practitioners + ' across ' + c.centres +
            ' centres</span></th>' +
          '<th data-role="family">Family' +
            '<span class="meta">a guardian, one child</span></th>' +
        '</tr></thead>' +
        '<tbody>' +
          capRow('Read a client record', 'plans, logs, history, messages',
            mark('yes') +
            mark('yes', 'every client, every centre') +
            mark('scoped', 'own child only')) +
          capRow('Write', 'a published week, a logged dose, a message',
            mark('yes') +
            mark('yes', 'any client; covering is attributed') +
            mark('scoped', 'own child’s log and messages')) +
          capRow('Publish a protocol version', 'the library the practice clones from',
            mark('yes') +
            mark('no', 'can propose a candidate') +
            mark('no')) +
          capRow('Review community content', 'promote a family’s meal idea to everyone',
            mark('yes') +
            mark('yes', 'submissions from any client') +
            mark('no', 'can submit and withdraw')) +
          capRow('See other practitioners’ clients', 'and their dashboards',
            mark('yes') +
            mark('yes') +
            mark('no')) +
          capRow('Export', 'CSV of a client, a cohort, the practice',
            mark('yes') +
            mark('scoped', 'own clients') +
            mark('scoped', 'own child’s history')) +
        '</tbody>' +
        '<tfoot><tr><td colspan="4">' +
          '<strong>Nobody self-registers.</strong> Owner, practitioner and ' +
          'guardian accounts are all created by invitation and verified by ' +
          'email. There is no public sign-up page to find.' +
        '</td></tr></tfoot>' +
      '</table>';

    var legend =
      '<ul class="legend">' +
        '<li class="legend__item">' +
          '<span class="mark mark--sm" data-v="yes"></span>full access</li>' +
        '<li class="legend__item">' +
          '<span class="mark mark--sm" data-v="scoped"></span>' +
          'limited, and the limit is named</li>' +
        '<li class="legend__item">' +
          '<span class="mark mark--sm" data-v="no"></span>no access</li>' +
      '</ul>';

    var principles = PRINCIPLES.map(function (p) {
      return '<div class="kpi">' +
               '<p class="kpi__label">' + esc(p[0]) + '</p>' +
               '<p style="margin-top:8px">' + esc(p[1]) + '</p>' +
             '</div>';
    }).join('');

    /* The grid is the document and the three principles are its footing, so
       the body is space-between rather than a fixed gap: the slack lands
       between them at any height instead of pooling under the last line. */
    root.innerHTML =
      head('Invite only', 'Who sees what',
        'Three roles, six capabilities. Practitioners read everything; writing follows ownership.') +
      '<div class="zone__body" style="justify-content:space-between;row-gap:30px">' +
        stack(16, matrix + legend) +
        '<div class="kpirow">' + principles + '</div>' +
      '</div>';
  }

  /* ========================================================================
     2 · auth — the real surfaces, and the policy
     ------------------------------------------------------------------------
     Three surfaces on the left, because "we have two-factor" is a claim and a
     screenshot of the code prompt is a fact: the staff sign-in, the TOTP
     prompt, and the recovery codes on paper — the one thing in this product a
     person is told to print, so it is drawn as something printable.
     The policy sits beside them as hairline rows, and then the only test that
     matters to a practice owner: what a lost laptop actually costs them.
     ===================================================================== */

  /* A browser surface. `--win-h:auto` lets the window size to its content —
     three stacked fixed-height windows would clip the moment a font metric
     moved, and .window__body is overflow:hidden, so the clip would be silent. */
  function win(url, inner, pad) {
    return '<section class="window' + (url ? '' : ' window--bare') +
             '" style="--win-h:auto;flex:0 0 auto">' +
             (url
               ? '<div class="window__bar">' +
                   '<span class="window__dots">' +
                     '<span></span><span></span><span></span></span>' +
                   '<p class="window__url">' + url + '</p>' +
                 '</div>'
               : '') +
             '<div class="window__body">' +
               '<div style="padding:' + (pad || '14px 16px 15px') + '">' + inner + '</div>' +
             '</div>' +
           '</section>';
  }
  function urlbar(path) {
    return '<b>art-practice.app</b>' + esc(path);
  }

  /* A labelled field. Readonly and data-static: it is a faithful rendering of a
     control, and §7 does not wire it. type=text, because app.css styles text /
     time / select / textarea and an unstyled password box in the middle of a
     styled form would read as a broken frame. The password is shown masked. */
  function field(id, label, value, note) {
    return '<p style="margin-top:11px">' +
             '<label class="meta" for="' + id + '" style="display:block">' +
               esc(label) + '</label>' +
             '<input id="' + id + '" type="text" readonly data-static value="' +
               esc(value) + '" style="margin-top:4px;width:100%">' +
             (note ? '<span class="meta" style="display:block;margin-top:4px">' +
               esc(note) + '</span>' : '') +
           '</p>';
  }

  var RECOVERY = [
    ['4XQ7-2M9D', 1], ['8HJ3-5RT6', 0], ['9WZ2-7KP4', 0],
    ['3VN8-6LC5', 0], ['7BQ4-1XS9', 0], ['2FD6-8MH3', 0]
  ];

  var POLICY = [
    ['Session', '8 hours',
      'Then re-authenticate. A practice machine is often a shared one.'],
    ['Password', '12 characters, breach-checked',
      /* Says what the rule is and why, without characterising the scheduled
         password expiry many clinics are required to run — this frame is
         read by the people who run it. */
      'Rejected if the string appears in a public breach corpus. No scheduled ' +
      'expiry — forcing a change on a timer pushes people towards weaker ' +
      'passwords.'],
    ['Second factor', 'TOTP, at first login',
      'Mandatory on every owner and practitioner account, and enrolled by the ' +
      'family on the same screen. Any authenticator app.'],
    ['Device trust', '30 days, per device',
      'Skips the code, never the password. Revocable from the account page, ' +
      'and revoked automatically on a password change.'],
    ['Audit log', 'every write, before and after',
      'Who changed what, on which client, from where, and when. Insert-only: ' +
      'there is no interface that can edit it.'],
    ['Row-level security', 'in Postgres, not in the app',
      'The policies live with the data. Section 6 lists them table by table.']
  ];

  /* Three writes this document itself can prove: the assignment and the
     invitation that the frame to the right draws, and the week that is sitting
     on the phone in section 3. Dates are derived, so the tail can never claim
     a write that the dataset does not actually contain. */
  function auditTail() {
    var mara = ART.store.client ? ART.store.client('c-mara') : null;
    var published = (mara && mara.planPublishedForWeek) || ui.weekStart(today());
    var sent = ui.addDays(today(), INVITE_AGO);
    return [
      [sent, '09:14', 'ren.o', 'client.assign', 'clients / ' + INVITED],
      [sent, '09:14', 'send-invite', 'invite.send', 'invites / ' + INVITED],
      [published, '16:48', 'ren.o', 'plan.publish', 'weekly_plans / Mara R.']
    ];
  }

  function auth(root) {
    var signin = win(urlbar('/sign-in'),
      eb('A.R.T. Practice') +
      '<h3 class="h3" style="margin-top:7px">Sign in</h3>' +
      field('plat-auth-email', 'Email', 'ren.o@art-practice.app') +
      field('plat-auth-pass', 'Password', '••••••••••••') +
      '<p style="margin-top:13px">' +
        '<button class="btn btn--primary" type="button" data-static>Sign in</button>' +
      '</p>' +
      '<p class="meta" style="margin-top:10px">' +
        'Created by invitation. There is no sign-up link to find.' +
      '</p>');

    var code = '482019';
    var digits = code.split('').map(function (d) {
      return '<span class="ramp__step">' + d + '</span>';
    }).join('');

    var twofa = win(urlbar('/sign-in/verify'),
      eb('Step 2 of 2') +
      '<h3 class="h3" style="margin-top:7px">Two-factor code</h3>' +
      '<p class="meta" style="margin-top:5px">' +
        'Six digits from the authenticator app on your phone.' +
      '</p>' +
      '<div class="ramp" style="margin-top:8px" role="group" ' +
        'aria-label="Six-digit code">' + digits + '</div>' +
      '<p style="margin-top:12px;display:flex;align-items:center;gap:8px">' +
        '<input id="plat-auth-trust" type="checkbox" data-static>' +
        '<label class="meta" for="plat-auth-trust">' +
          'Trust this device for 30 days</label>' +
      '</p>' +
      '<p style="margin-top:12px;display:flex;align-items:center;gap:10px">' +
        '<button class="btn btn--primary" type="button" data-static>Verify</button>' +
        '<span class="meta">Lost the phone? Use a recovery code.</span>' +
      '</p>');

    var codes =
      '<section class="card--paper" style="flex:0 0 auto">' +
        eb('Recovery codes') +
        '<ul class="keygrid" style="margin-top:8px">' +
          RECOVERY.map(function (r) {
            return '<li' + (r[1] ? ' data-used' : '') + '>' + r[0] + '</li>';
          }).join('') +
        '</ul>' +
        '<p class="meta" style="margin-top:8px">' +
          'Shown once, at enrolment. Each works once, then strikes itself out.' +
        '</p>' +
      '</section>';

    var policy =
      '<ul class="list">' +
        POLICY.map(function (p) {
          return '<li class="list__item">' +
                   '<span style="display:flex;align-items:baseline;' +
                     'justify-content:space-between;gap:16px">' +
                     '<span class="h3">' + esc(p[0]) + '</span>' +
                     '<span class="mono">' + esc(p[1]) + '</span>' +
                   '</span>' +
                   '<span class="meta" style="display:block;margin-top:4px">' +
                     esc(p[2]) + '</span>' +
                 '</li>';
        }).join('') +
      '</ul>';

    var lost =
      '<section class="card">' +
        eb('If a practitioner’s laptop is stolen') +
        '<p style="margin-top:8px">' +
          'The session on it is eight hours old at most. The next sign-in needs ' +
          'the phone in their pocket, and the trusted device can be revoked ' +
          'from any other machine in the practice. Nothing of substance is on ' +
          'the laptop: the records are in Postgres, behind policies that travel ' +
          'with the rows and not with the app.' +
        '</p>' +
      '</section>';

    var tail =
      '<section class="card--quiet">' +
        eb('audit_log · the last three writes') +
        '<div style="display:grid;grid-template-columns:auto auto minmax(0,1fr);' +
          'column-gap:16px;row-gap:4px;margin-top:8px">' +
          auditTail().map(function (a) {
            return '<span class="mono">' + esc(ui.md(a[0])) + '</span>' +
                   '<span class="mono">' + esc(ui.clock(a[1])) + '</span>' +
                   '<span class="mono">' + esc(a[2]) + ' &middot; ' + esc(a[3]) +
                     ' &middot; ' + esc(a[4]) + '</span>';
          }).join('') +
        '</div>' +
      '</section>';

    root.innerHTML =
      head('Sign-in', 'Sign-in and 2FA',
        'Email and password, then six digits from an authenticator app.') +
      zbody(grid('minmax(0,1fr) minmax(0,1fr)', '30px',
        stack(14, signin + twofa + codes) +
        stack(18, eb('Policy') + policy + lost + tail)));
  }

  /* ========================================================================
     3 · invite — assign, email, accept, enrol, install, first login
     ------------------------------------------------------------------------
     A numbered rail down the left, because this is a procedure; three real
     artefacts to the right, because a procedure nobody can picture is a
     promise. The three artefacts are the two ends of the sequence and the one
     state every invitation system gets wrong: an expired link.
     The branch off step 2 is the whole reason .flow exists — a happy path with
     no expiry and no "who can see it now" is a diagram that lies.
     ===================================================================== */

  function step(by, actor, title, body, see) {
    return '<li class="flow__step" data-by="' + by + '">' +
             '<p class="flow__actor">' + esc(actor) + '</p>' +
             '<p class="flow__title">' + title + '</p>' +
             '<p class="flow__body">' + body + '</p>' +
             (see ? '<p class="flow__see">' + see + '</p>' : '') +
           '</li>';
  }

  function invite(root) {
    var prac = pracName(INVITE_PRAC, 'Ren O.');
    var centre = centreName('ct-burl', 'A.R.T. Burlington');
    var sent = ui.addDays(today(), INVITE_AGO);
    var expires = ui.addDays(sent, INVITE_DAYS);
    var deadSent = ui.addDays(today(), EXPIRED_AGO);
    var deadOn = ui.addDays(deadSent, INVITE_DAYS);
    var egg = firstEggStep();

    /* --- the sequence ------------------------------------------------- */
    var flow =
      '<ol class="flow">' +
        step('practitioner', 'Practitioner or management',
          'Assign the child to a practitioner',
          'A client row, an owning practitioner, and the guardian’s email ' +
          'address. That is the whole form.') +
        step('system', 'System',
          'send-invite mints a one-time link',
          '<span class="mono">invites</span> stores a hash of the token and ' +
          'never the token itself. It expires in seven days.',
          '<strong>Visible to</strong> the owning practitioner and the owner. ' +
          'The family has no account yet, so there is nothing for them to see.') +
        '<li class="flow__branch" data-kind="expire" data-loop>' +
          '<b>Expired</b>' +
          'After seven days the link is dead. The practitioner re-issues it from ' +
          'the client record, which mints a new token and voids the old one. An ' +
          'accepted invitation cannot be replayed either.' +
        '</li>' +
        step('family', 'Family',
          'Accept, set a password, enrol 2FA',
          'One screen each. The email address is fixed by the invitation and the ' +
          'role cannot be changed on it.') +
        step('family', 'Family',
          'Install the app',
          'The same credentials on iOS and Android. The link in the email opens ' +
          'the right store for the phone that taps it.') +
        step('system', 'System',
          'accept-invite links the account',
          'A <span class="mono">client_guardians</span> row is written, the ' +
          'invitation is marked accepted, and the token is burned.',
          '<strong>Visible to</strong> the household, one child. Every ' +
          'practitioner, the client. The owner, the practice.') +
        step('family', 'Family',
          'First login lands on the plan',
          'Already linked to the assigned practitioner, with week one of egg ' +
          'already on the screen. Nothing to choose, nothing to type.') +
      '</ol>';

    /* --- the practitioner's assignment screen ------------------------- */
    /* Deliberately chrome-less: the practitioner console already appears in a
       full browser window in section 3, and the ONE url bar this frame can
       afford is better spent on the expired link, where the dead token in the
       address is the whole point. */
    var assign = win('',
      eb('Assign a client · practitioner web') +
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);' +
        'column-gap:14px">' +
        field('plat-inv-name', 'Child’s display name', INVITED) +
        field('plat-inv-mail', 'Guardian email', 'guardian@example.com') +
        field('plat-inv-prac', 'Owning practitioner', prac) +
        field('plat-inv-proto', 'Start on', 'Egg · ' + egg.version + ' (published)') +
      '</div>' +
      '<p style="margin-top:14px;display:flex;align-items:center;gap:12px">' +
        '<button class="btn btn--primary" type="button" data-static>' +
          'Assign and invite</button>' +
        '<span class="meta">One action. The invitation goes out with it.</span>' +
      '</p>');

    /* --- the invitation itself ---------------------------------------- */
    /* Structure by .panel hairlines, not by nested boxes: an email client's
       header block, the message, then the install line. */
    var email =
      '<article class="card" style="padding:0" aria-label="The invitation email">' +
        '<div class="panel panel--inset">' +
          '<div class="panel__body" style="padding:12px 18px 13px;' +
            'display:grid;grid-template-columns:auto minmax(0,1fr);' +
            'column-gap:14px;row-gap:5px">' +
            '<span class="meta">From</span>' +
            '<span class="mono">A.R.T. Practice · invites@art-practice.app</span>' +
            '<span class="meta">To</span>' +
            '<span class="mono">guardian@example.com</span>' +
            '<span class="meta">Subject</span>' +
            '<span class="mono">' + esc(INVITED) + '’s plan is ready</span>' +
          '</div>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel__body" style="padding:15px 18px 17px">' +
            '<h3 class="h3">Your practitioner has set up ' +
              esc(INVITED.split(' ')[0]) + '’s plan</h3>' +
            '<p style="margin-top:8px">' +
              esc(prac) + ' at ' + esc(centre) + ' will see ' +
              esc(INVITED.split(' ')[0]) + ' once a week. Accept the invitation ' +
              'to set a password, then install the app and tick off each day as ' +
              'you go.' +
            '</p>' +
            '<p style="margin-top:14px">' +
              '<button class="btn btn--primary" type="button" data-static>' +
                'Accept the invitation</button>' +
            '</p>' +
            '<p class="meta" style="margin-top:10px">' +
              'This link works once and expires on ' +
              esc(ui.dayLabel(expires)) + '.' +
            '</p>' +
            '<p class="meta" style="margin-top:5px">' +
              'Then install the app — App Store · Google Play. Same email, ' +
              'same password, same second factor.' +
            '</p>' +
          '</div>' +
        '</div>' +
      '</article>';

    /* --- what the family sees if they are late ------------------------ */
    var expired = win(urlbar('/invite/8f3c…4d1a'),
      '<h3 class="h3">This invitation has expired</h3>' +
      '<p style="margin-top:8px">' +
        'It was sent on ' + esc(ui.dayLabel(deadSent)) + ' and expired on ' +
        esc(ui.dayLabel(deadOn)) + '.' +
      '</p>' +
      '<p class="meta" style="margin-top:8px">' +
        'Ask ' + esc(prac) + ' for a new one. This link will not work again.' +
      '</p>' +
      '<p style="margin-top:12px">' +
        '<button class="btn" type="button" data-static>Request a new invitation</button>' +
      '</p>');

    /* --- the first login --------------------------------------------- */
    var screen =
      '<div style="padding:15px 14px 0">' +
        eb('First open') +
        '<h3 class="h3" style="margin-top:7px">' + esc(INVITED) + '</h3>' +
        '<p class="meta" style="margin-top:4px">Linked to ' + esc(prac) +
          ' · ' + esc(centre) + '</p>' +
      '</div>' +
      '<div class="panel" style="margin-top:14px">' +
        '<div class="panel__body" style="padding:12px 14px 13px">' +
          '<p class="eyebrow">Week 1 of ' + esc(egg.weeks) + ' · Egg</p>' +
          '<p class="meta" style="margin-top:5px">' + esc(egg.phase) + '</p>' +
        '</div>' +
      '</div>' +
      '<div style="padding:13px 14px 0">' +
        '<article class="card--lift">' +
          '<p class="eyebrow">' + esc(ui.dayLabel(ui.addDays(today(), 5))) +
            ' · ' + esc(ui.clock('08:00')) + '</p>' +
          '<p class="dose" data-size="lg" style="margin-top:7px">' +
            esc(egg.display) + '</p>' +
          '<p class="meta" style="margin-top:6px">First dose of the ramp</p>' +
        '</article>' +
      '</div>' +
      '<div style="padding:12px 14px 0;display:grid;gap:8px">' +
        '<div class="drop">' +
          '<span class="drop__glyph" data-size="sm"></span>' +
          '<span class="drop__main">' +
            '<span class="drop__title">Water drops</span>' +
            '<span class="drop__cadence">Daily · ' + esc(ui.clock('08:00')) +
              '</span>' +
          '</span>' +
          '<span class="drop__side"><span class="dose" data-size="sm">3 drops</span></span>' +
        '</div>' +
        '<div class="tap">' +
          '<span class="tap__glyph" data-size="sm"></span>' +
          '<span class="tap__main">' +
            '<span class="tap__title">Spine tap</span>' +
            '<span class="tap__cadence">Mon &amp; Thu · ' +
              esc(ui.clock('19:00')) + '</span>' +
          '</span>' +
          '<span class="tap__side"><span class="dose" data-size="sm">2 min</span></span>' +
        '</div>' +
      '</div>' +
      /* A phone screen, so the eight-word rule applies here too: what used to
         be a twenty-one-word paragraph is three chips a parent can take in
         without reading. the UX brief §1. */
      '<div style="padding:14px 14px 10px">' +
        '<p class="eyebrow">What happens next</p>' +
        '<div class="chiprow" style="margin-top:8px">' +
          '<span class="chip chip--neutral">Tick off each day</span>' +
          '<span class="chip chip--neutral">' + esc(prac) + ' sees it</span>' +
          '<span class="chip chip--neutral">New week each visit</span>' +
        '</div>' +
        '<p style="margin-top:12px">' +
          '<button class="btn btn--primary" type="button" data-static>' +
            'Open today</button>' +
        '</p>' +
      '</div>';

    /* Sized to its own content, not to the column: a first-run screen with a
       hundred pixels of empty stock under its primary button reads as a screen
       somebody forgot to finish. 632 leaves about ten pixels of air under the
       `what happens next` chips. */
    var phone =
      '<div class="phone" style="--phone-h:632px">' +
        '<div class="phone__bar"><b>' + esc(ui.clock('09:41')) +
          '</b><span>LTE 100%</span></div>' +
        '<div class="phone__screen">' + screen + '</div>' +
        '<div class="phone__home"></div>' +
      '</div>';

    root.innerHTML =
      head('Onboarding', 'The invitation',
        'A family cannot create an account. The invitation does the rest.') +
      zbody(grid('560px minmax(0,1fr) 300px', '30px',
        stack(22, eb('The sequence') + flow) +
        stack(18, assign + email + expired) +
        stack(13,
          eb('First login · the family app') + phone +
          '<p class="meta">Already linked. No practitioner code to type and no ' +
          'plan to choose — the first screen is the plan. The drops and the ' +
          'spine tap are on it from day one, because they are prescribed too, ' +
          'and nothing today records them.</p>')));
  }

  /* ========================================================================
     4 · erd — twenty-two tables on Supabase Postgres
     ------------------------------------------------------------------------
     TWO READINGS, ONE FRAME. The chain across the top is for the person who
     has to approve this: six tables, five arrows, and the sentence the data
     model actually makes. The six grouped columns below it are for whoever
     builds it: every table in SPEC §6.6 with its key columns and types.

     RELATIONSHIPS ARE NAMED, NOT GUESSED. Every foreign key prints its target
     in words (`-> clients.id`) in the type slot rather than relying on a tint,
     which is the only convention that survives twenty-two tables at the 0.7
     camera clamp — thirty splines across six columns would be spaghetti at any
     zoom. The chain on top carries the relationships that matter, drawn.

     Coral is spent on exactly three things, per §6.6: protocol_versions,
     phase_runs, and the one COLUMN client_protocols.ramp_override. Each gets a
     reason of twelve words or fewer.
     ===================================================================== */

  /* The band is sized against the node, not guessed: .erd__node stands 56px
     (8px padding, a 13px name, a 12px meta) so the band is NODE_Y + 56 + 2. The
     edge runs through the node's middle and the labels ride clear ABOVE the
     node tops, in the gaps, where they cannot cross a box. */
  var BAND_W = 2540;
  var NODE_Y = 30;
  var BAND_H = 88;
  var EDGE_Y = 58;
  var LABEL_Y = 17;

  var SPINE = [
    { name: 'profiles',         meta: 'identity · one per account',      x:    0, w: 200 },
    { name: 'clients',          meta: 'practice · one owning practitioner', x: 466, w: 230 },
    { name: 'client_protocols', meta: 'plan · cloned from a version',    x:  962, w: 205 },
    { name: 'weekly_plans',     meta: 'plan · the handoff object',       x: 1433, w: 175 },
    { name: 'day_entries',      meta: 'engagement · dose, drops, tap',   x: 1874, w: 200 },
    { name: 'phase_runs',       meta: 'analytics · planned vs actual',   x: 2340, w: 200 }
  ];

  /* label order matches the five gaps between the six nodes */
  var SPINE_LABELS = [
    'guardian of', 'assigned a protocol', 'published weekly', '7 days of',
    'rolls up into'
  ];
  /* the publish is the board's hero relationship, so it is the coral one */
  var SPINE_HERO = 2;

  function arrow(x, y) {
    return svg('path', {
      'class': 'erd__edge',
      d: 'M ' + (x - 7) + ' ' + (y - 4.5) + ' L ' + x + ' ' + y +
         ' L ' + (x - 7) + ' ' + (y + 4.5)
    });
  }

  function spine() {
    var paths = '';
    var labels = [];

    for (var i = 0; i < SPINE.length - 1; i++) {
      var a = SPINE[i];
      var b = SPINE[i + 1];
      var x1 = a.x + a.w + 4;
      var x2 = b.x - 4;
      paths += svg('path', {
        'class': 'erd__edge',
        'data-kind': i === SPINE_HERO ? 'hero' : false,
        d: 'M ' + x1 + ' ' + EDGE_Y +
           ' C ' + (x1 + 44) + ' ' + (EDGE_Y - 3) +
           ' ' + (x2 - 44) + ' ' + (EDGE_Y + 3) +
           ' ' + (x2 - 4) + ' ' + EDGE_Y
      });
      paths += arrow(x2, EDGE_Y);
      labels[i] = '<span class="erd__label" style="left:' +
                  Math.round((x1 + x2) / 2) + 'px;top:' + LABEL_Y + 'px">' +
                  esc(SPINE_LABELS[i]) + '</span>';
    }

    /* node, then the label of the edge leaving it. The boxes are positioned, so
       DOM order costs nothing on screen and is the only reading order a screen
       reader gets: "profiles — guardian of — clients — assigned a protocol…" */
    var chain = SPINE.map(function (n, i) {
      return '<div class="erd__node" style="left:' + n.x + 'px;top:' + NODE_Y +
               'px;width:' + n.w + 'px">' +
               '<span class="mono">' + esc(n.name) + '</span>' +
               '<span class="meta">' + n.meta + '</span>' +
             '</div>' + (labels[i] || '');
    }).join('');

    return '<div class="erd" style="height:' + BAND_H + 'px">' +
             svg('svg', {
               viewBox: '0 0 ' + BAND_W + ' ' + BAND_H,
               'aria-hidden': 'true',
               focusable: 'false'
             }, paths) +
             chain +
           '</div>';
  }

  /* --- the tables ------------------------------------------------------ */
  /* [name, type, key]  key: 'pk' | 'fk' | '' ; a type beginning with '->' is
     rendered as a target and the row is marked fk so app.css inks it.        */

  var SCHEMA = [
    {
      domain: 'Identity',
      tables: [
        { name: 'auth.users', chip: ['peri', 'Supabase Auth'], cols: [
          ['id', 'uuid', 'pk'],
          ['email', 'citext', '']
        ] },
        { name: 'profiles', cols: [
          ['id', '→ auth.users.id', 'pk'],
          ['role', 'enum', ''],
          ['full_name', 'text', ''],
          ['email', 'citext', ''],
          ['mfa_enrolled', 'bool', ''],
          ['last_seen_at', 'timestamptz', '']
        ] },
        { name: 'client_guardians', cols: [
          ['client_id', '→ clients.id', 'pk'],
          ['profile_id', '→ profiles.id', 'pk'],
          ['relationship', 'text', ''],
          ['is_primary', 'bool', '']
        ] },
        { name: 'invites', cols: [
          ['id', 'uuid', 'pk'],
          ['email', 'citext', ''],
          ['role', 'enum', ''],
          ['client_id', '→ clients.id', 'fk'],
          ['practitioner_id', '→ practitioners.id', 'fk'],
          ['token_hash', 'text', ''],
          ['expires_at', 'timestamptz', ''],
          ['accepted_at', 'timestamptz', '']
        ] },
        { name: 'audit_log', cols: [
          ['id', 'bigint', 'pk'],
          ['actor_profile_id', '→ profiles.id', 'fk'],
          ['action', 'text', ''],
          ['entity', 'text', ''],
          ['entity_id', 'uuid', ''],
          ['before', 'jsonb', ''],
          ['after', 'jsonb', ''],
          ['at', 'timestamptz', '']
        ] }
      ]
    },
    {
      domain: 'Practice',
      tables: [
        { name: 'organizations', cols: [
          ['id', 'uuid', 'pk'],
          ['name', 'text', '']
        ] },
        { name: 'centres', cols: [
          ['id', 'uuid', 'pk'],
          ['org_id', '→ organizations.id', 'fk'],
          ['name', 'text', ''],
          ['city', 'text', ''],
          ['timezone', 'text', '']
        ] },
        { name: 'practitioners', cols: [
          ['id', 'uuid', 'pk'],
          ['profile_id', '→ profiles.id', 'fk'],
          ['centre_id', '→ centres.id', 'fk'],
          ['kind', 'staff | independent', ''],
          ['active', 'bool', '']
        ] },
        { name: 'clients', cols: [
          ['id', 'uuid', 'pk'],
          ['org_id', '→ organizations.id', 'fk'],
          ['display_name', 'text', ''],
          ['dob', 'date', ''],
          ['owning_practitioner_id', '→ practitioners.id', 'fk'],
          ['status', 'enum', ''],
          ['started_on', 'date', '']
        ] }
      ]
    },
    {
      domain: 'Protocol',
      tables: [
        { name: 'protocols', cols: [
          ['id', 'uuid', 'pk'],
          ['org_id', '→ organizations.id', 'fk'],
          ['allergen', 'text', ''],
          ['slug', 'text', ''],
          ['current_version_id', '→ protocol_versions.id', 'fk']
        ] },
        { name: 'protocol_versions', isNew: true,
          why: 'A template is versioned, so changing it never rewrites a live plan.',
          cols: [
            ['id', 'uuid', 'pk'],
            ['protocol_id', '→ protocols.id', 'fk'],
            ['version', 'int', ''],
            ['state', 'draft | review | published', ''],
            ['published_by', '→ profiles.id', 'fk'],
            ['published_at', 'timestamptz', '']
          ] },
        { name: 'phases', cols: [
          ['id', 'uuid', 'pk'],
          ['protocol_version_id', '→ protocol_versions.id', 'fk'],
          ['n', 'int', ''],
          ['label', 'text', ''],
          ['food_form', 'text', ''],
          ['unit', 'text', ''],
          ['grams_per_unit', 'numeric', ''],
          ['planned_days', 'int', '']
        ] },
        { name: 'ramp_steps', cols: [
          ['id', 'uuid', 'pk'],
          ['phase_id', '→ phases.id', 'fk'],
          ['idx', 'int', ''],
          ['display', 'text', ''],
          ['value', 'numeric', ''],
          ['planned_days', 'int', '']
        ] },
        { name: 'conditions', cols: [
          ['id', 'uuid', 'pk'],
          ['protocol_version_id', '→ protocol_versions.id', 'fk'],
          ['trigger', 'text', ''],
          ['action', 'text', '']
        ] }
      ]
    },
    {
      domain: 'Plan',
      tables: [
        { name: 'client_protocols',
          why: 'One child’s own ramp, kept beside the template instead of editing it.',
          cols: [
            ['id', 'uuid', 'pk'],
            ['client_id', '→ clients.id', 'fk'],
            ['protocol_version_id', '→ protocol_versions.id', 'fk'],
            ['state', 'enum', ''],
            ['current_phase_id', '→ phases.id', 'fk'],
            ['current_step_idx', 'int', ''],
            ['ramp_override', 'jsonb', '', true],
            ['held_since', 'date', '']
          ] },
        { name: 'protocol_items', chip: ['neutral', 'drops · spine tap'], cols: [
          ['id', 'uuid', 'pk'],
          ['client_id', '→ clients.id', 'fk'],
          ['kind', 'drops | tapping', ''],
          ['cadence', 'text', ''],
          ['dose_value', 'numeric', ''],
          ['dose_unit', 'text', ''],
          ['timing', 'time', '']
        ] },
        { name: 'weekly_plans', cols: [
          ['id', 'uuid', 'pk'],
          ['client_protocol_id', '→ client_protocols.id', 'fk'],
          ['week_start', 'date', ''],
          ['published_by', '→ profiles.id', 'fk'],
          ['published_at', 'timestamptz', '']
        ] }
      ]
    },
    {
      domain: 'Engagement',
      tables: [
        { name: 'day_entries', chip: ['neutral', 'the booklet line'], cols: [
          ['id', 'uuid', 'pk'],
          ['weekly_plan_id', '→ weekly_plans.id', 'fk'],
          ['client_id', '→ clients.id', 'fk'],
          ['date', 'date', ''],
          ['item_type', 'dose | drops | tapping', ''],
          ['ramp_step_id', '→ ramp_steps.id', 'fk'],
          ['dose_value', 'numeric', ''],
          ['dose_unit', 'text', ''],
          ['timing', 'time', ''],
          ['wait_level', 'int', ''],
          ['status', 'enum', ''],
          ['reason', 'text', ''],
          ['note', 'text', ''],
          ['photo_path', 'text', ''],
          ['logged_by', '→ profiles.id', 'fk'],
          ['logged_at', 'timestamptz', '']
        ] },
        { name: 'meal_ideas', cols: [
          ['id', 'uuid', 'pk'],
          ['allergen', 'text', ''],
          ['title', 'text', ''],
          ['body', 'text', ''],
          ['minutes', 'int', ''],
          ['source', 'curated | family', ''],
          ['submitted_by', '→ profiles.id', 'fk'],
          ['status', 'enum', ''],
          ['reviewed_by', '→ profiles.id', 'fk'],
          ['reviewed_at', 'timestamptz', ''],
          ['is_communal', 'bool', '']
        ] },
        { name: 'meal_idea_saves', cols: [
          ['profile_id', '→ profiles.id', 'pk'],
          ['meal_idea_id', '→ meal_ideas.id', 'pk']
        ] },
        { name: 'messages', cols: [
          ['id', 'uuid', 'pk'],
          ['client_id', '→ clients.id', 'fk'],
          ['sender_profile_id', '→ profiles.id', 'fk'],
          ['body', 'text', ''],
          ['anchor_day_entry_id', '→ day_entries.id', 'fk'],
          ['read_at', 'timestamptz', '']
        ] }
      ]
    },
    {
      domain: 'Analytics',
      tables: [
        { name: 'phase_runs', isNew: true,
          why: 'Planned against actual, so overrun is a column and not a guess.',
          cols: [
            ['id', 'uuid', 'pk'],
            ['client_protocol_id', '→ client_protocols.id', 'fk'],
            ['phase_id', '→ phases.id', 'fk'],
            ['started_on', 'date', ''],
            ['completed_on', 'date', ''],
            ['planned_days', 'int', ''],
            ['actual_days', 'int', ''],
            ['repeat_days', 'int', '']
          ] }
      ]
    }
  ];

  function schemaCol(c) {
    var name = c[0];
    var type = c[1];
    var k = c[2];
    var isNewCol = c[3];
    var target = type.indexOf('→') === 0;
    /* the key slot is ALWAYS emitted: .schema__col is a three-column grid and
       an omitted <i> pushes the column name into the key column */
    return '<li class="schema__col"' +
             (k ? ' data-key="' + (target ? 'fk' : k) + '"' : (target ? ' data-key="fk"' : '')) +
             (isNewCol ? ' data-new' : '') + '>' +
             '<i class="schema__key"' + (k ? ' data-k="' + k + '"' : '') + '></i>' +
             '<span class="schema__colname">' + esc(name) + '</span>' +
             '<span class="schema__type">' + esc(type) + '</span>' +
           '</li>';
  }

  function schemaTable(t) {
    return '<div class="schema__table"' + (t.isNew ? ' data-new' : '') + '>' +
             '<p class="schema__name">' + esc(t.name) +
               (t.chip ? '<span class="chip chip--' + t.chip[0] + '">' +
                 t.chip[1] + '</span>' : '') +
             '</p>' +
             '<ul class="schema__cols">' +
               t.cols.map(schemaCol).join('') +
             '</ul>' +
             (t.why ? '<p class="schema__why">' + t.why + '</p>' : '') +
           '</div>';
  }

  function erd(root) {
    var total = 0;
    var groups = SCHEMA.map(function (g) {
      total += g.tables.length;
      var extra = '';
      /* The analytics domain is one table by nature, so the column it would
         otherwise leave empty carries the two things the diagram needs next to
         it: how that table gets written, and the key to the whole drawing. */
      if (g.domain === 'Analytics') {
        extra =
          '<section class="card--quiet">' +
            eb('How it is written') +
            '<p class="meta" style="margin-top:7px">' +
              'nightly-rollup closes a run when a phase advances. Nothing in ' +
              'here is typed by hand, and nothing on the practice dashboard is ' +
              'entered twice.' +
            '</p>' +
          '</section>' +
          eb('How to read it') +
          '<ul class="schema__legend">' +
            '<li><i class="schema__key" data-k="pk"></i>primary key</li>' +
            '<li><i class="schema__key" data-k="fk"></i>foreign key, target named</li>' +
            '<li><i class="schema__key"></i>column</li>' +
            '<li><span class="chip chip--coral">new</span>' +
              'the three tables behind what you asked for</li>' +
          '</ul>';
      }
      return '<div class="schema__group">' +
               '<p class="schema__domain">' + esc(g.domain) +
                 '<span class="mono">' + g.tables.length + '</span></p>' +
               g.tables.map(schemaTable).join('') +
               extra +
             '</div>';
    }).join('');

    root.innerHTML =
      head('Supabase · Postgres', 'The schema',
        '<strong>' + total + ' tables</strong>, grouped the way the data moves. Every key names its target.') +
      zbody(stack(18,
        spine() +
        '<div class="schema">' +
          '<div class="schema__grid" style="--schema-cols:6">' + groups + '</div>' +
        '</div>'));
  }

  /* ========================================================================
     5 · rls — what makes it safe
     ------------------------------------------------------------------------
     Specifics, not reassurance. The policy table is the frame: every row is a
     sentence a practice owner can read and an engineer can implement, because
     "who reads" and "who writes" are the only two questions a policy answers.
     Below it the four things that are not policies — buckets, channels,
     functions, backups — and the views every figure on section 4 is read from.
     ===================================================================== */

  var POLICIES = [
    ['clients',
      'Every practitioner, and the owner.',
      'The owning practitioner, or a colleague covering for them.'],
    ['client_protocols',
      'Every practitioner; the guardian, for their own child.',
      'Practitioners. A family never edits its own prescription.'],
    ['weekly_plans',
      'Every practitioner; the guardian of that client.',
      'Practitioners only — a family cannot publish a week.'],
    ['day_entries',
      'Every practitioner; the guardian of that client.',
      'The guardian, and the practitioner on their behalf.'],
    ['protocol_versions',
      'Every practitioner reads a published version.',
      'The owner publishes. A practitioner may insert a draft candidate.'],
    ['protocol_items',
      'Every practitioner; the guardian of that client.',
      'Practitioners. Drops and the spine tap are prescribed, not chosen.'],
    ['meal_ideas',
      'Curated and communal ideas to everyone; a family’s own draft to that family alone.',
      'The family that wrote it; the reviewer sets the status.'],
    ['messages',
      'The two parties to the thread, and the owner.',
      'The two parties to the thread.'],
    ['invites',
      'The issuing practitioner, and the owner.',
      'send-invite only, with the service key. Never the browser.'],
    ['audit_log',
      'The owner.',
      'Nobody. Insert-only, by trigger — there is no interface that edits it.'],
    ['phase_runs',
      'Every practitioner, and the owner.',
      'nightly-rollup only.'],
    ['profiles',
      'Yourself, always. Staff profiles to every practitioner.',
      'Yourself: name and password. The owner sets the role.'],
    ['client_guardians',
      'The practitioners, and the guardians of that one client.',
      'accept-invite writes it; the owner or the practitioner revokes it.'],
    ['meal_idea_saves',
      'Yourself. A save count, to everyone — never who saved it.',
      'Yourself, on an idea you are already allowed to see.']
  ];

  var BUCKETS = [
    ['reaction-photos', 'Private. Read through a 60-second signed URL, and ' +
      'only by that client’s practitioner or guardian.'],
    ['meal-images', 'Signed. Readable by whoever the idea itself is visible ' +
      'to, which is the policy above and nothing else.']
  ];

  var CHANNELS = [
    ['weekly_plans', 'A published week appears on the phone without a refresh.'],
    ['day_entries', 'A logged dose moves the roster while the practitioner watches.'],
    ['messages', 'One thread per client, delivered live.']
  ];

  var FUNCTIONS = [
    ['send-invite', 'Mints the token, stores only its hash, sends the email.'],
    ['accept-invite', 'Verifies, writes the guardian link, burns the token.'],
    ['nightly-rollup', 'Closes phase runs and refreshes the views below.']
  ];

  var BACKUPS = [
    ['Daily backup', 'Retained, and restorable to a fresh project without us.'],
    ['Point-in-time recovery', 'Any second in the retention window — which ' +
      'is what covers a bad bulk edit, not just a lost server.']
  ];

  var VIEWS = [
    ['v_adherence', 'Logged over planned, per client and per practitioner.'],
    ['v_phase_duration', 'Planned days against median actual, with the spread.'],
    ['v_overrun_by_age', 'The same phase, cut by age band.'],
    ['v_time_to_freedom', 'Weeks from first dose to graduation, per allergen.']
  ];

  function specRows(rows) {
    return '<div style="display:grid;gap:8px;margin-top:8px">' +
             rows.map(function (r) {
               return '<div>' +
                        '<p class="mono">' + esc(r[0]) + '</p>' +
                        '<p class="meta" style="margin-top:2px">' + esc(r[1]) + '</p>' +
                      '</div>';
             }).join('') +
           '</div>';
  }
  function block(label, rows) {
    return '<section>' + eb(label) + specRows(rows) + '</section>';
  }

  function rls(root) {
    var table =
      '<div class="tblwrap">' +
        /* .tbl--dense, not .tbl. Measured three treatments of one object board-wide:
   .tbl--dense (roster, macro, ugc) at th 0 8px / td 4px 8px / row 36, .tbl
   here and ONLY here at th 0 12px / td 8px 12px / row 44, and .matrix in
   roles, which is a capability grid rather than a lookup table and keeps its
   own treatment. The RLS policy table and the roster are the same object. */
        '<table class="tbl tbl--dense" aria-label="Row-level security, table by table">' +
          '<colgroup>' +
            '<col style="width:19%"><col style="width:40%"><col style="width:41%">' +
          '</colgroup>' +
          '<thead><tr>' +
            '<th>Table</th><th>Who reads</th><th>Who writes</th>' +
          '</tr></thead>' +
          '<tbody>' +
            POLICIES.map(function (p) {
              return '<tr>' +
                       '<td data-key><span class="mono">' + esc(p[0]) + '</span></td>' +
                       '<td>' + esc(p[1]) + '</td>' +
                       '<td>' + esc(p[2]) + '</td>' +
                     '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
      /* The schema declares 22 tables and the policy list names 14. Seven of
         the remaining eight are stated here — the protocol library and the
         practice itself, where one rule covers all seven — and the eighth,
         auth.users, is named after them because it is not ours to police. */
      /* "The other eight" followed by seven names, with auth.users accounted
         for in a separate sentence after it — so a reader counts seven and
         stops. Seven is the number of tables WE police here; auth.users is
         named on its own because it is not ours. */
      '<p class="meta" style="margin-top:7px"><strong>The other seven:</strong> ' +
        '<span class="mono">organizations &middot; centres &middot; practitioners ' +
        '&middot; protocols &middot; phases &middot; ramp_steps &middot; ' +
        'conditions</span> &mdash; read by every practitioner, written by the ' +
        'owner. <span class="mono">auth.users</span> is Supabase Auth&rsquo;s own.</p>';

    var blocks = grid('minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', '22px 26px',
      block('Storage buckets', BUCKETS) +
      block('Realtime channels', CHANNELS) +
      block('Edge functions', FUNCTIONS) +
      block('Backups and recovery', BACKUPS) +
      '<section style="grid-column:span 2">' +
        eb('Derived views · nothing is entered twice') +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);' +
          'gap:8px 24px;margin-top:8px">' +
          VIEWS.map(function (v) {
            return '<div>' +
                     '<p class="mono">' + esc(v[0]) + '</p>' +
                     '<p class="meta" style="margin-top:2px">' + esc(v[1]) + '</p>' +
                   '</div>';
          }).join('') +
        '</div>' +
      '</section>');

    /* Two closing cards, side by side: the one a clinic owner asks about, and
       the one an engineer asks about. Neither is reassurance — the first traces
       a single file through the policies above, the second says who can change
       the method. */
    var closing = grid('minmax(0,1fr) minmax(0,1fr)', '22px',
      '<section class="card">' +
        eb('Who can open a reaction photo') +
        '<p style="margin-top:8px">' +
          'The guardian who uploaded it, and a practitioner. Not anyone holding ' +
          'a link: the bucket is private, the URL is signed for sixty seconds, ' +
          'and the signature is only issued after the row policy above has ' +
          'already said yes. There is no public path to the file.' +
        '</p>' +
      '</section>' +
      '<section class="card">' +
        eb('The protocol library is the asset') +
        '<p style="margin-top:8px">' +
          'A published version is readable by every practitioner and writable by ' +
          'nobody but the owner. An independent practitioner can run the method ' +
          'exactly as published without being able to change it, and every change ' +
          'is a new version with a name and a timestamp against it. That is how ' +
          'twenty years of method reaches a new centre without drifting.' +
        '</p>' +
      '</section>');

    root.innerHTML =
      head('Enforced in the database', 'What makes it safe',
        'Each rule is a policy in Postgres, not a check in the app.') +
      zbody(stack(26, table + blocks + closing));
  }

  /* ===================================================================== */

  ART.zones = ART.zones || {};
  ART.zones.platform = {
    roles: roles,
    auth: auth,
    invite: invite,
    erd: erd,
    rls: rls
  };
}());
