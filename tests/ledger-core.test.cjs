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
