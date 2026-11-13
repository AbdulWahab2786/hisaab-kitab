const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../ledger-core.js');

const knownComponents = ['jobValue', 'onTime', 'rating', 'referral'];
const fixedAmounts = { jobValue: 354, onTime: 250, rating: 150 };
const completed = job => (job.workStatus || 'completed') === 'completed';
const expectedFor = (job, component) => ledger.expectedFor(job, component, completed(job), fixedAmounts);

function makeRegularJob(overrides = {}) {
  return {
    id: 'job-1', type: 'regular', locality: 'local', workStatus: 'completed',
    onTimeExpected: true, ratingExpected: true, extraMileExpected: 0,
    ...overrides
  };
}

test('component pending sums separate partial transactions against the same expected component', () => {
  const job = makeRegularJob();
  const payments = [
    { id: 'p1', jobId: job.id, component: 'jobValue', amount: 100 },
    { id: 'p2', jobId: job.id, component: 'jobValue', amount: 120 }
  ];

  assert.equal(ledger.knownPendingFor(job, payments, knownComponents, expectedFor), 534);
  payments.push({ id: 'p3', jobId: job.id, component: 'jobValue', amount: 134 });
  assert.equal(ledger.knownPendingFor(job, payments, knownComponents, expectedFor), 400);
  assert.equal(ledger.receivedFor(payments, job.id, 'jobValue'), 354);
});

test('unknown extra-mile stays out of rupee expected and pending amounts but can require follow-up', () => {
  const job = makeRegularJob({ locality: 'nonLocal', extraMileExpected: 0 });
  const payments = [];

  assert.equal(expectedFor(job, 'extraMile'), 0);
  assert.equal(ledger.knownPendingFor(job, payments, knownComponents, expectedFor), 754);
  assert.equal(ledger.needsUnpricedExtraMileFollowUp(job, payments, true, expectedFor), true);
  assert.equal(ledger.needsUnpricedExtraMileFollowUp({ ...job, type: 'referral' }, payments, true, expectedFor), false);
});

test('Goodwill is excluded from job-related received and does not reduce job pending', () => {
  const job = makeRegularJob();
  const payments = [
    { id: 'job-value', jobId: job.id, component: 'jobValue', amount: 354 },
    { id: 'goodwill', jobId: job.id, component: 'goodwill', amount: 100 }
  ];
  const totals = ledger.paymentTotals(payments);

  assert.equal(totals.jobRelated, 354);
  assert.equal(totals.goodwill, 100);
  assert.equal(totals.total, 454);
  assert.equal(ledger.knownPendingFor(job, payments, knownComponents, expectedFor), 400);
});

test('a settled known component cannot accept a duplicate amount or exceed its remaining expected value', () => {
  assert.equal(ledger.canRecordKnownAmount(354, 354, 354), false);
  assert.equal(ledger.canRecordKnownAmount(354, 200, 154), true);
  assert.equal(ledger.canRecordKnownAmount(354, 200, 155), false);
});

test('referral jobs expect only the entered referral payout', () => {
  const job = { id: 'ref-1', type: 'referral', referralExpected: 300, workStatus: 'completed' };
  assert.equal(expectedFor(job, 'referral'), 300);
  assert.equal(expectedFor(job, 'jobValue'), 0);
  assert.equal(expectedFor(job, 'onTime'), 0);
  assert.equal(expectedFor(job, 'rating'), 0);
});

test('payment summary buckets reconcile to the recorded ledger without counting a credit twice', () => {
  const payments = [
    { id: 'j1', jobId: 'job-1', component: 'jobValue', amount: 354 },
    { id: 'em1', jobId: 'job-1', component: 'extraMile', amount: 150 },
    { id: 'c1', jobId: 'job-1', component: 'commission', amount: 75 },
    { id: 'g1', jobId: 'job-1', component: 'goodwill', amount: 100 },
    { id: 'u1', jobId: null, component: 'jobValue', amount: 50 }
  ];
  const totals = ledger.paymentTotals(payments);

  assert.equal(totals.jobRelated, 354);
  assert.equal(totals.extraMile, 150);
  assert.equal(totals.commission, 75);
  assert.equal(totals.goodwill, 100);
  assert.equal(totals.unmatched, 50);
  assert.equal(totals.jobRelated + totals.extraMile + totals.commission + totals.goodwill + totals.unmatched + totals.other, totals.total);
  assert.equal(totals.total, payments.reduce((sum, payment) => sum + payment.amount, 0));
});

test('normalizeMapsUrl accepts optional empty or safe http/https Maps URLs and rejects unsafe inputs', () => {
  assert.deepEqual(ledger.normalizeMapsUrl(''), { ok: true, url: '', error: '' });
  assert.deepEqual(ledger.normalizeMapsUrl('   '), { ok: true, url: '', error: '' });
  assert.deepEqual(ledger.normalizeMapsUrl(null), { ok: true, url: '', error: '' });

  const shortUrl = ledger.normalizeMapsUrl('  https://maps.app.goo.gl/TestPlace123  ');
  assert.equal(shortUrl.ok, true);
  assert.equal(shortUrl.url, 'https://maps.app.goo.gl/TestPlace123');

  const queryUrl = ledger.normalizeMapsUrl('http://maps.google.com/?q=17.385,78.4867');
  assert.equal(queryUrl.ok, true);
  assert.equal(queryUrl.url, 'http://maps.google.com/?q=17.385,78.4867');

  for (const unsafe of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'tel:+919876543210',
    '//maps.google.com/?q=1',
    'https://user:pass@maps.google.com/?q=1',
    'https://maps.google.com/with space',
    'not a url',
    'https://localhost/maps',
    'https://maps.google.com/?q=' + 'a'.repeat(1000)
  ]) {
    const result = ledger.normalizeMapsUrl(unsafe);
    assert.equal(result.ok, false, `expected unsafe URL to be rejected: ${unsafe}`);
    assert.equal(ledger.safeMapsUrl(unsafe), '');
  }
});

test('normalizeNoteText and safeNoteText trim, strip control characters, preserve newlines, and enforce length limits', () => {
  assert.deepEqual(ledger.normalizeNoteText(''), { ok: true, text: '', error: '' });
  assert.deepEqual(ledger.normalizeNoteText('   \n\t  '), { ok: true, text: '', error: '' });
  assert.deepEqual(ledger.normalizeNoteText(null), { ok: true, text: '', error: '' });

  const multiLine = ledger.normalizeNoteText('  Gate code: 1234\r\nKitchen sink purifier\u0000\u0007  ');
  assert.equal(multiLine.ok, true);
  assert.equal(multiLine.text, 'Gate code: 1234\nKitchen sink purifier');

  const tooLong = ledger.normalizeNoteText('x'.repeat(1001));
  assert.equal(tooLong.ok, false);
  assert.equal(ledger.safeNoteText('x'.repeat(1005)).length, 1000);
  assert.equal(ledger.safeNoteText('Line 1\u0000\nLine 2'), 'Line 1\nLine 2');
});

test('validateAndNormalizeBackup preserves single-customer backup records and accepts legacy backups', () => {
  const legacyBackup = {
    app: 'Hisaab Kitab',
    exportedAt: '2026-10-19T13:54:00.000Z',
    jobs: [
      {
        id: 'job-legacy-1',
        customer: 'Synthetic Legacy Customer',
        date: '2026-10-18',
        workStatus: 'completed',
        type: 'regular',
        category: 'repair',
        onTimeExpected: true,
        ratingExpected: false,
        referralExpected: 0
      }
    ],
    payments: [
      { id: 'pay-legacy-1', jobId: 'job-legacy-1', component: 'jobValue', amount: 354, date: '2026-10-19' }
    ],
    customers: [
      { id: 'cust-legacy-1', customerCode: 'C-LEG001', name: 'Synthetic Legacy Customer', phone: '+91 90000 00001' }
    ]
  };

  const restoredLegacy = ledger.validateAndNormalizeBackup(legacyBackup);
  assert.equal(restoredLegacy.jobs[0].locality, 'local');
  assert.equal(restoredLegacy.jobs[0].extraMileExpected, 0);
  assert.equal(restoredLegacy.jobs[0].phone, '');
  assert.equal(restoredLegacy.jobs[0].notes, '');
  assert.equal(restoredLegacy.customers[0].mapsUrl, '');
  assert.equal(restoredLegacy.customers[0].notes, '');
  assert.deepEqual(restoredLegacy.hiddenCustomers, []);

  const currentSingleCustomerBackup = {
    app: 'Hisaab Kitab',
    backupVersion: 1,
    exportedAt: '2026-11-12T15:00:00.000Z',
    jobs: [
      {
        id: 'job-syn-1',
        customer: 'Synthetic Single Customer',
        phone: '+91 90000 00009',
        date: '2026-11-11',
        dueDate: '2026-11-11',
        workStatus: 'completed',
        model: 'M1',
        category: 'installation',
        onTimeExpected: true,
        ratingExpected: true,
        referralExpected: 0,
        locality: 'nonLocal',
        extraMileExpected: 120,
        notes: 'Filter flush completed',
        type: 'regular',
        createdAt: '2026-11-11T09:00:00.000Z'
      }
    ],
    payments: [
      { id: 'pay-syn-1', jobId: 'job-syn-1', customerName: '', date: '2026-11-12', component: 'jobValue', amount: 354, section: 'Job payments' },
      { id: 'pay-syn-2', jobId: 'job-syn-1', customerName: '', date: '2026-11-12', component: 'goodwill', amount: 50, section: 'Manual additions' }
    ],
    customers: [
      {
        id: 'cust-syn-1',
        customerCode: 'C-SYN001',
        name: 'Synthetic Single Customer',
        phone: '+91 90000 00009',
        mapsUrl: 'https://maps.app.goo.gl/SyntheticSingle',
        notes: 'Gate code 4321\nSecond floor',
        createdAt: '2026-11-10T08:00:00.000Z'
      }
    ],
    hiddenCustomers: []
  };

  const restoredCurrent = ledger.validateAndNormalizeBackup(currentSingleCustomerBackup);
  assert.equal(restoredCurrent.customers[0].mapsUrl, 'https://maps.app.goo.gl/SyntheticSingle');
  assert.equal(restoredCurrent.customers[0].notes, 'Gate code 4321\nSecond floor');
  assert.equal(restoredCurrent.jobs[0].notes, 'Filter flush completed');
  assert.equal(ledger.knownPendingFor(restoredCurrent.jobs[0], restoredCurrent.payments, knownComponents, expectedFor), 520);
  assert.throws(() => ledger.validateAndNormalizeBackup({
    jobs: [{ id: 'dup', customer: 'A', date: '' }, { id: 'dup', customer: 'B', date: '' }],
    payments: []
  }), /repeated job IDs/);
});

test('spare parts validation, total calculation, backup preservation, and accounting isolation', () => {
  const validPart = ledger.normalizeSparePartInput('  Sediment   filter\u0000 ', '250', 'part-1');
  assert.deepEqual(validPart, {
    ok: true,
    part: { id: 'part-1', name: 'Sediment filter', amount: 250 },
    error: ''
  });

  assert.equal(ledger.normalizeSparePartInput('   ', '250').ok, false);
  assert.equal(ledger.normalizeSparePartInput('Carbon filter', '0').ok, false);
  assert.equal(ledger.normalizeSparePartInput('Carbon filter', '-50').ok, false);
  assert.equal(ledger.normalizeSparePartInput('Carbon filter', '12.5').ok, false);

  const job = makeRegularJob({
    customer: 'Synthetic Customer',
    date: '2026-11-12',
    spareParts: [
      { id: 'part-1', name: 'Sediment filter', amount: 250 },
      { id: 'part-2', name: 'Carbon filter', amount: 400 }
    ]
  });
  assert.equal(ledger.sparePartsTotal(job), 650);
  assert.equal(ledger.sparePartsTotal({}), 0);

  // Spare parts must not alter UC payment expectations or pending calculations
  assert.equal(ledger.knownExpectedFor(job, knownComponents, expectedFor), 754);
  assert.equal(ledger.knownPendingFor(job, [], knownComponents, expectedFor), 754);

  // Backup validation preserves stable spare part IDs and rejects duplicate/invalid part IDs
  const restored = ledger.validateAndNormalizeBackup({
    jobs: [job],
    payments: []
  });
  assert.deepEqual(restored.jobs[0].spareParts, [
    { id: 'part-1', name: 'Sediment filter', amount: 250 },
    { id: 'part-2', name: 'Carbon filter', amount: 400 }
  ]);

  assert.throws(() => ledger.validateAndNormalizeBackup({
    jobs: [{
      id: 'job-dup-part',
      customer: 'Synthetic Customer',
      date: '2026-11-12',
      spareParts: [
        { id: 'same-id', name: 'Filter A', amount: 100 },
        { id: 'same-id', name: 'Filter B', amount: 200 }
      ]
    }],
    payments: []
  }), /repeated spare part IDs/);
});

test('WhatsApp phone normalization, 5 draft templates, and safe wa.me URL generation', () => {
  assert.deepEqual(ledger.normalizeWhatsAppPhone(''), { ok: true, digits: '', error: '' });
  assert.deepEqual(ledger.normalizeWhatsAppPhone('98765 43210'), { ok: true, digits: '919876543210', error: '' });
  assert.deepEqual(ledger.normalizeWhatsAppPhone('09876543210'), { ok: true, digits: '919876543210', error: '' });
  assert.deepEqual(ledger.normalizeWhatsAppPhone('+91 98765-43210'), { ok: true, digits: '919876543210', error: '' });
  assert.equal(ledger.normalizeWhatsAppPhone('12345').ok, false);

  const context = {
    customerName: 'Synthetic Customer',
    model: 'M1',
    categoryLabel: 'Installation',
    dateText: '12 Nov 2026',
    dueDateText: '13 Nov 2026',
    pendingAmount: 400,
    parts: [{ id: 'p1', name: 'Sediment filter', amount: 250 }]
  };

  const location = ledger.buildWhatsAppDraft('location', context);
  const arrival = ledger.buildWhatsAppDraft('arrival', context);
  const completion = ledger.buildWhatsAppDraft('completion', context);
  const followUp = ledger.buildWhatsAppDraft('followUp', context);
  const appointment = ledger.buildWhatsAppDraft('appointment', context);
  const thankYou = ledger.buildWhatsAppDraft('thankYou', context);

  assert.match(location, /exact location or address/i);
  assert.match(location, /Synthetic Customer/);
  assert.match(arrival, /on the way/i);
  assert.match(arrival, /few minutes/i);
  assert.match(completion, /Sediment filter \(₹250\)/);
  assert.match(completion, /Total ₹250/);
  assert.match(followUp, /following up/i);
  assert.match(appointment, /13 Nov 2026/);
  assert.match(thankYou, /thank you for choosing our service/i);

  const withPhone = ledger.buildWhatsAppUrl('9876543210', location);
  assert.equal(withPhone.ok, true);
  assert.ok(withPhone.url.startsWith('https://wa.me/919876543210?text='));

  const withoutPhone = ledger.buildWhatsAppUrl('', 'Custom edited message');
  assert.equal(withoutPhone.ok, true);
  assert.equal(withoutPhone.url, 'https://wa.me/?text=Custom%20edited%20message');

  assert.equal(ledger.buildWhatsAppUrl('9876543210', '   ').ok, false);
  assert.equal(ledger.buildWhatsAppUrl('123', 'Hello').ok, false);
});

test('saved custom WhatsApp drafts validate, interpolate optional placeholders, and persist in backups', () => {
  const valid = ledger.normalizeWhatsAppTemplateInput('  Evening   reminder ', 'Hello {customer}, balance {pending} for {model}.', 'tpl-1');
  assert.deepEqual(valid, {
    ok: true,
    template: { id: 'tpl-1', title: 'Evening reminder', body: 'Hello {customer}, balance {pending} for {model}.' },
    error: ''
  });
  assert.equal(ledger.normalizeWhatsAppTemplateInput('   ', 'Hi').ok, false);
  assert.equal(ledger.normalizeWhatsAppTemplateInput('Title', '   ').ok, false);

  const rendered = ledger.renderCustomWhatsAppTemplate(valid.template.body, {
    customerName: 'Synthetic Customer',
    model: 'M1',
    pendingAmount: 400
  });
  assert.equal(rendered, 'Hello Synthetic Customer, balance ₹400 for M1.');

  const restored = ledger.validateAndNormalizeBackup({
    jobs: [],
    payments: [],
    whatsappTemplates: [valid.template]
  });
  assert.deepEqual(restored.whatsappTemplates, [valid.template]);

  const legacyRestored = ledger.validateAndNormalizeBackup({ jobs: [], payments: [] });
  assert.deepEqual(legacyRestored.whatsappTemplates, []);
});

test('local reminders trigger 8 AM today summary, 8 PM tomorrow summary, and 30-min pre-job alerts with reschedule and cancel/complete suppression', () => {
  assert.deepEqual(ledger.normalizeTimeString(''), { ok: true, time: '', error: '' });
  assert.deepEqual(ledger.normalizeTimeString('14:30'), { ok: true, time: '14:30', error: '' });
  assert.equal(ledger.normalizeTimeString('25:00').ok, false);
  assert.equal(ledger.formatTime12h('14:30'), '2:30 PM');
  assert.equal(ledger.formatTime12h('08:05'), '8:05 AM');

  const jobs = [
    { id: 'j1', customer: 'Synthetic One', model: 'M1', workStatus: 'pending', dueDate: '2026-11-12', dueTime: '14:30' },
    { id: 'j2', customer: 'Synthetic Two', model: 'M2', workStatus: 'pending', dueDate: '2026-11-13', dueTime: '09:00' },
    { id: 'jDone', customer: 'Done Cust', model: 'M3', workStatus: 'completed', dueDate: '2026-11-12', dueTime: '14:30' },
    { id: 'jCancel', customer: 'Cancel Cust', model: 'M4', workStatus: 'cancelled', dueDate: '2026-11-12', dueTime: '14:30' }
  ];

  // Before 8:00 AM local: no active daily/pre-job yet, but upcoming queue includes 8 AM, 8 PM, and pre-job.
  const at745am = new Date(2026, 10, 12, 7, 45, 0, 0);
  const res745 = ledger.evaluateReminders(jobs, at745am, null);
  assert.equal(res745.active.length, 0);
  assert.ok(res745.upcoming.some(r => r.kind === 'dailyToday'));
  assert.ok(res745.upcoming.some(r => r.kind === 'dailyTomorrow'));

  // At 8:00 AM local: 8 AM today summary triggers, completed/cancelled excluded.
  const at800am = new Date(2026, 10, 12, 8, 0, 0, 0);
  const res800 = ledger.evaluateReminders(jobs, at800am, null);
  assert.equal(res800.active.length, 1);
  assert.equal(res800.active[0].kind, 'dailyToday');
  assert.deepEqual(res800.active[0].jobIds, ['j1']);

  // Duplicate suppression once notified & dismissed; rescheduling re-triggers cleanly.
  const stateAfter800 = {
    notifiedDaily: { [res800.active[0].id]: res800.active[0].tokens },
    dismissedDaily: { [res800.active[0].id]: res800.active[0].tokens },
    notifiedPreJob: [],
    dismissedPreJob: []
  };
  const suppressed805 = ledger.evaluateReminders(jobs, new Date(2026, 10, 12, 8, 5, 0, 0), stateAfter800);
  assert.equal(suppressed805.active.length, 0);
  assert.equal(suppressed805.newlyTriggered.length, 0);

  // At 2:10 PM local (20 min before 14:30): pre-job 30-min reminder triggers for j1 only.
  const at210pm = new Date(2026, 10, 12, 14, 10, 0, 0);
  const res210 = ledger.evaluateReminders(jobs, at210pm, stateAfter800);
  assert.equal(res210.active.length, 1);
  assert.equal(res210.active[0].kind, 'preJob30m');
  assert.deepEqual(res210.active[0].jobIds, ['j1']);

  // Reschedule j1 from 14:30 to 16:00: old preJob dismissed/notified token suppresses, new token triggers in [15:30, 16:00).
  const stateWithOldPre = {
    ...stateAfter800,
    notifiedPreJob: [res210.active[0].id],
    dismissedPreJob: [res210.active[0].id]
  };
  const rescheduledJobs = jobs.map(j => (j.id === 'j1' ? { ...j, dueTime: '16:00' } : j));
  const at340pm = new Date(2026, 10, 12, 15, 40, 0, 0);
  const resRescheduled = ledger.evaluateReminders(rescheduledJobs, at340pm, stateWithOldPre);
  assert.ok(resRescheduled.active.some(r => r.kind === 'dailyToday'), 'rescheduled today job creates fresh schedule token for daily summary');
  assert.ok(resRescheduled.active.some(r => r.kind === 'preJob30m' && r.id === 'preJob30m:j1@2026-11-12T16:00'));

  // At 8:00 PM local: tomorrow summary triggers for j2.
  const at800pm = new Date(2026, 10, 12, 20, 0, 0, 0);
  const res800pm = ledger.evaluateReminders(rescheduledJobs, at800pm, stateWithOldPre);
  assert.ok(res800pm.active.some(r => r.kind === 'dailyTomorrow' && r.jobIds.length === 1 && r.jobIds[0] === 'j2'));

  // Cancelling or completing j1 & j2 suppresses all reminders and prunes stale pre-job state.
  const closedJobs = rescheduledJobs.map(j => ({ ...j, workStatus: j.id === 'j1' ? 'cancelled' : 'completed' }));
  const resClosed = ledger.evaluateReminders(closedJobs, at800pm, stateWithOldPre);
  assert.equal(resClosed.active.length, 0);
  assert.equal(resClosed.newlyTriggered.length, 0);
  const pruned = ledger.pruneReminderState(stateWithOldPre, closedJobs, at800pm);
  assert.deepEqual(pruned.dismissedPreJob, []);

  // Backup compatibility preserves dueTime and cancelled workStatus, while legacy jobs default dueTime to ''.
  const restored = ledger.validateAndNormalizeBackup({
    jobs: [
      { id: 'legacy1', customer: 'Legacy', date: '2026-11-10', workStatus: 'pending', dueDate: '2026-11-12', jobValue: 500, onTime: 0, rating: 0, referral: 0 },
      { id: 'timed1', customer: 'Timed', date: '2026-11-10', workStatus: 'cancelled', dueDate: '2026-11-12', dueTime: '14:30', jobValue: 0, onTime: 0, rating: 0, referral: 0 }
    ],
    payments: []
  });
  assert.equal(restored.jobs[0].dueTime, '');
  assert.equal(restored.jobs[1].dueTime, '14:30');
  assert.equal(restored.jobs[1].workStatus, 'cancelled');
});

test('refresh install jobs allow custom net job value while installation/repair remain fixed 354', () => {
  const refreshCustom = {
    id: 'j-refresh',
    category: 'refresh',
    workStatus: 'completed',
    jobValue: 450,
    onTimeExpected: true,
    ratingExpected: true
  };
  assert.equal(expectedFor(refreshCustom, 'jobValue'), 450);
  assert.equal(expectedFor(refreshCustom, 'onTime'), 250);
  assert.equal(expectedFor(refreshCustom, 'rating'), 150);
  assert.equal(ledger.knownExpectedFor(refreshCustom, knownComponents, expectedFor), 850);

  const installJob = {
    id: 'j-install',
    category: 'installation',
    workStatus: 'completed',
    jobValue: 999, // Should be ignored in favor of fixed 354
    onTimeExpected: false,
    ratingExpected: false
  };
  assert.equal(expectedFor(installJob, 'jobValue'), 354);

  const repairJob = {
    id: 'j-repair',
    category: 'repair',
    workStatus: 'completed',
    jobValue: null
  };
  assert.equal(expectedFor(repairJob, 'jobValue'), 354);
});
