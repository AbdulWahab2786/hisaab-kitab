/* Pure ledger calculations shared by the browser app and the Node test suite. */
(function exposeLedger(root, createLedger) {
  const ledger = createLedger();
  root.HisaabLedger = ledger;
  if (typeof module === 'object' && module.exports) module.exports = ledger;
})(typeof globalThis === 'object' ? globalThis : this, function createLedger() {
  const JOB_RELATED_COMPONENTS = ['jobValue', 'onTime', 'rating', 'referral'];

  function amount(value) { return Number(value || 0); }

  function paymentsFor(payments, jobId, component, excludedId = '') {
    return payments.filter(item => item.jobId === jobId
      && (!component || item.component === component)
      && item.id !== excludedId);
  }

  function receivedFor(payments, jobId, component, excludedId = '') {
    return paymentsFor(payments, jobId, component, excludedId)
      .reduce((sum, item) => sum + amount(item.amount), 0);
  }

  function componentTotal(payments, component) {
    return payments.filter(item => item.component === component)
      .reduce((sum, item) => sum + amount(item.amount), 0);
  }

  function expectedFor(job, component, isComplete, fixedAmounts) {
    if (!job || !isComplete) return 0;
    if (job.type === 'referral') return component === 'referral' ? amount(job.referralExpected) : 0;
    if (component === 'jobValue') return fixedAmounts.jobValue;
    if (component === 'onTime') return job.onTimeExpected ? fixedAmounts.onTime : 0;
    if (component === 'rating') return job.ratingExpected ? fixedAmounts.rating : 0;
    if (component === 'referral') return amount(job.referralExpected);
    if (component === 'extraMile') return job.locality === 'nonLocal' ? amount(job.extraMileExpected) : 0;
    return 0;
  }

  function knownExpectedFor(job, components, getExpected) {
    return components.reduce((sum, component) => sum + getExpected(job, component), 0)
      + getExpected(job, 'extraMile');
  }

  function knownReceivedFor(job, payments, components) {
    return components.reduce((sum, component) => sum + receivedFor(payments, job.id, component), 0)
      + (job.locality === 'nonLocal' ? receivedFor(payments, job.id, 'extraMile') : 0);
  }

  function knownPendingFor(job, payments, components, getExpected) {
    const pendingKnownComponents = components.reduce((sum, component) => sum + Math.max(
      getExpected(job, component) - receivedFor(payments, job.id, component), 0
    ), 0);
    const pendingKnownExtraMile = Math.max(
      getExpected(job, 'extraMile') - receivedFor(payments, job.id, 'extraMile'), 0
    );
    return pendingKnownComponents + pendingKnownExtraMile;
  }

  function remainingExpected(expected, received) {
    return Math.max(amount(expected) - amount(received), 0);
  }

  function canRecordKnownAmount(expected, received, newAmount) {
    const value = amount(newAmount);
    return Number.isFinite(value) && value > 0 && value <= remainingExpected(expected, received);
  }

  function needsUnpricedExtraMileFollowUp(job, payments, isComplete, getExpected) {
    return Boolean(job && isComplete && job.type !== 'referral' && job.locality === 'nonLocal'
      && getExpected(job, 'extraMile') <= 0
      && receivedFor(payments, job.id, 'extraMile') <= 0);
  }

  function paymentTotals(payments) {
    const totals = { total: 0, jobRelated: 0, extraMile: 0, commission: 0, goodwill: 0, unmatched: 0, other: 0 };
    payments.forEach(item => {
      const value = amount(item.amount);
      totals.total += value;
      if (!item.jobId) {
        totals.unmatched += value;
      } else if (JOB_RELATED_COMPONENTS.includes(item.component)) {
        totals.jobRelated += value;
      } else if (item.component === 'extraMile') {
        totals.extraMile += value;
      } else if (item.component === 'commission') {
        totals.commission += value;
      } else if (item.component === 'goodwill') {
        totals.goodwill += value;
      } else {
        totals.other += value;
      }
    });
    return totals;
  }

  return {
    paymentsFor,
    receivedFor,
    componentTotal,
    expectedFor,
    knownExpectedFor,
    knownReceivedFor,
    knownPendingFor,
    remainingExpected,
    canRecordKnownAmount,
    needsUnpricedExtraMileFollowUp,
    paymentTotals
  };
});
