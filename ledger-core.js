/* Pure ledger calculations shared by the browser app and the Node test suite. */
(function exposeLedger(root, createLedger) {
  const ledger = createLedger();
  root.HisaabLedger = ledger;
  if (typeof module === 'object' && module.exports) module.exports = ledger;
})(typeof globalThis === 'object' ? globalThis : this, function createLedger() {
  const JOB_RELATED_COMPONENTS = ['jobValue', 'onTime', 'rating', 'referral'];
  const MAX_MAPS_URL_LENGTH = 1000;
  const MAX_NOTE_LENGTH = 1000;
  const MAX_WHATSAPP_MESSAGE_LENGTH = 2000;
  const WHATSAPP_DRAFT_TYPES = ['location', 'arrival', 'completion', 'followUp', 'appointment', 'thankYou', 'paymentReminder'];

  function amount(value) { return Number(value || 0); }

  function normalizeTimeString(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { ok: true, time: '', error: '' };
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
    if (!match) {
      return { ok: false, time: '', error: 'Enter a valid local time in HH:MM format.' };
    }
    return { ok: true, time: `${match[1]}:${match[2]}`, error: '' };
  }

  function formatTime12h(hhmm) {
    const check = normalizeTimeString(hhmm);
    if (!check.ok || !check.time) return '';
    const [hStr, mStr] = check.time.split(':');
    const hour24 = Number(hStr);
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${mStr} ${period}`;
  }

  function toLocalDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addLocalDaysISO(isoDate, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    if (!match) return '';
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
    return toLocalDateISO(d);
  }

  function parseLocalJobDateTime(isoDate, hhmm) {
    const dMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    const tCheck = normalizeTimeString(hhmm);
    if (!dMatch || !tCheck.ok || !tCheck.time) return null;
    const [hh, mm] = tCheck.time.split(':').map(Number);
    return new Date(Number(dMatch[1]), Number(dMatch[2]) - 1, Number(dMatch[3]), hh, mm, 0, 0);
  }

  function jobScheduleToken(job) {
    return `${job.id}@${job.dueDate || ''}T${job.dueTime || ''}`;
  }

  function createEmptyReminderState() {
    return { notifiedDaily: {}, dismissedDaily: {}, notifiedPreJob: [], dismissedPreJob: [] };
  }

  function normalizeReminderState(state) {
    const base = createEmptyReminderState();
    if (!state || typeof state !== 'object') return base;
    if (state.notifiedDaily && typeof state.notifiedDaily === 'object') base.notifiedDaily = { ...state.notifiedDaily };
    if (state.dismissedDaily && typeof state.dismissedDaily === 'object') base.dismissedDaily = { ...state.dismissedDaily };
    if (Array.isArray(state.notifiedPreJob)) base.notifiedPreJob = state.notifiedPreJob.filter(x => typeof x === 'string');
    if (Array.isArray(state.dismissedPreJob)) base.dismissedPreJob = state.dismissedPreJob.filter(x => typeof x === 'string');
    return base;
  }

  function evaluateReminders(jobs, nowInput = new Date(), rawState = null) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const state = normalizeReminderState(rawState);
    const todayISO = toLocalDateISO(now);
    const tomorrowISO = addLocalDaysISO(todayISO, 1);
    const nowMs = now.getTime();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const activeJobs = (Array.isArray(jobs) ? jobs : []).filter(job => {
      if (!job || !job.id || !job.dueDate) return false;
      const status = job.workStatus || 'completed';
      return status !== 'completed' && status !== 'cancelled';
    });

    const sortByTimeThenCustomer = (a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99')
      || String(a.customer || '').localeCompare(String(b.customer || ''));

    const todayJobs = activeJobs.filter(job => job.dueDate === todayISO).sort(sortByTimeThenCustomer);
    const tomorrowJobs = activeJobs.filter(job => job.dueDate === tomorrowISO).sort(sortByTimeThenCustomer);

    const active = [];
    const newlyTriggered = [];
    const upcoming = [];
    let nextBoundaryMs = null;

    const considerBoundary = ts => {
      if (Number.isFinite(ts) && ts > nowMs && (nextBoundaryMs === null || ts < nextBoundaryMs)) {
        nextBoundaryMs = ts;
      }
    };

    const eightAmToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0).getTime();
    const eightPmToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0).getTime();
    considerBoundary(eightAmToday);
    considerBoundary(eightPmToday);

    const buildSummaryReminder = (idKey, kind, title, slotJobs, dateISO) => {
      if (!slotJobs.length) return;
      const tokens = slotJobs.map(jobScheduleToken);
      const dismissedSet = new Set(Array.isArray(state.dismissedDaily[idKey]) ? state.dismissedDaily[idKey] : []);
      const notifiedSet = new Set(Array.isArray(state.notifiedDaily[idKey]) ? state.notifiedDaily[idKey] : []);
      const hasUnseenDismissed = tokens.some(token => !dismissedSet.has(token));
      const hasUnnotified = tokens.some(token => !notifiedSet.has(token));
      const preview = slotJobs.slice(0, 3).map(job => `${stripControlChars(job.customer).trim()}${job.dueTime ? ` (${formatTime12h(job.dueTime)})` : ''}`).join(', ');
      const extra = slotJobs.length > 3 ? ` +${slotJobs.length - 3} more` : '';
      const reminder = {
        id: idKey,
        kind,
        title,
        body: `${slotJobs.length} ${slotJobs.length === 1 ? 'job' : 'jobs'} scheduled: ${preview}${extra}`,
        dateISO,
        jobIds: slotJobs.map(job => job.id),
        tokens
      };
      if (hasUnseenDismissed) active.push(reminder);
      if (hasUnnotified) newlyTriggered.push(reminder);
    };

    if (nowMinutes >= 8 * 60) {
      buildSummaryReminder(`dailyToday:${todayISO}`, 'dailyToday', '8:00 AM today summary', todayJobs, todayISO);
    } else if (todayJobs.length) {
      upcoming.push({
        id: `dailyToday:${todayISO}`,
        kind: 'dailyToday',
        title: '8:00 AM today summary',
        body: `${todayJobs.length} ${todayJobs.length === 1 ? 'job' : 'jobs'} due today`,
        triggerAtMs: eightAmToday,
        jobIds: todayJobs.map(j => j.id)
      });
    }

    if (nowMinutes >= 20 * 60) {
      buildSummaryReminder(`dailyTomorrow:${todayISO}`, 'dailyTomorrow', '8:00 PM tomorrow summary', tomorrowJobs, tomorrowISO);
    } else if (tomorrowJobs.length) {
      upcoming.push({
        id: `dailyTomorrow:${todayISO}`,
        kind: 'dailyTomorrow',
        title: '8:00 PM tomorrow summary',
        body: `${tomorrowJobs.length} ${tomorrowJobs.length === 1 ? 'job' : 'jobs'} scheduled for tomorrow`,
        triggerAtMs: eightPmToday,
        jobIds: tomorrowJobs.map(j => j.id)
      });
    }

    activeJobs.forEach(job => {
      if (!job.dueTime) return;
      const startDate = parseLocalJobDateTime(job.dueDate, job.dueTime);
      if (!startDate) return;
      const startMs = startDate.getTime();
      const triggerMs = startMs - 30 * 60 * 1000;
      considerBoundary(triggerMs);
      const token = jobScheduleToken(job);
      const preId = `preJob30m:${token}`;
      const timeLabel = formatTime12h(job.dueTime);
      if (nowMs >= triggerMs && nowMs < startMs) {
        const minsLeft = Math.max(1, Math.ceil((startMs - nowMs) / 60000));
        const reminder = {
          id: preId,
          kind: 'preJob30m',
          title: `Upcoming job in ${minsLeft} min`,
          body: `${stripControlChars(job.customer).trim()} · ${stripControlChars(job.model || 'Purifier').trim()} at ${timeLabel}`,
          dateISO: job.dueDate,
          dueTime: job.dueTime,
          jobIds: [job.id],
          tokens: [token]
        };
        if (!state.dismissedPreJob.includes(preId)) active.push(reminder);
        if (!state.notifiedPreJob.includes(preId)) newlyTriggered.push(reminder);
      } else if (triggerMs > nowMs && triggerMs - nowMs <= 24 * 60 * 60 * 1000) {
        upcoming.push({
          id: preId,
          kind: 'preJob30m',
          title: `30 min before ${stripControlChars(job.customer).trim()}`,
          body: `Job at ${timeLabel} (${job.dueDate === todayISO ? 'Today' : job.dueDate === tomorrowISO ? 'Tomorrow' : job.dueDate})`,
          triggerAtMs: triggerMs,
          jobIds: [job.id]
        });
      }
    });

    upcoming.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
    return { active, newlyTriggered, upcoming, nextBoundaryMs };
  }

  function pruneReminderState(rawState, jobs, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const todayISO = toLocalDateISO(now);
    const state = normalizeReminderState(rawState);
    const activeTokens = new Set(
      (Array.isArray(jobs) ? jobs : [])
        .filter(job => job && job.id && job.dueDate && (job.workStatus || 'completed') !== 'completed' && job.workStatus !== 'cancelled')
        .map(jobScheduleToken)
    );
    const keepDaily = map => Object.fromEntries(
      Object.entries(map).filter(([key]) => key.endsWith(`:${todayISO}`))
    );
    const keepPre = list => list.filter(idKey => idKey.startsWith('preJob30m:') && activeTokens.has(idKey.slice('preJob30m:'.length)));
    return {
      notifiedDaily: keepDaily(state.notifiedDaily),
      dismissedDaily: keepDaily(state.dismissedDaily),
      notifiedPreJob: keepPre(state.notifiedPreJob),
      dismissedPreJob: keepPre(state.dismissedPreJob)
    };
  }

  function stripControlChars(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }

  function normalizeSparePartInput(nameValue, amountValue, existingId = '') {
    const name = stripControlChars(nameValue).replace(/\s+/g, ' ').trim();
    if (!name) return { ok: false, field: 'name', error: 'Enter a spare part name.' };
    if (name.length > 80) return { ok: false, field: 'name', error: 'Spare part name must be 80 characters or fewer.' };
    const rawAmount = String(amountValue ?? '').trim();
    const parsedAmount = Number(rawAmount);
    if (!rawAmount || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      return { ok: false, field: 'amount', error: 'Enter a whole rupee spare part amount greater than zero.' };
    }
    return {
      ok: true,
      part: { id: String(existingId || '').trim(), name, amount: parsedAmount },
      error: ''
    };
  }

  function sparePartsFor(jobOrParts) {
    if (Array.isArray(jobOrParts)) return jobOrParts;
    if (jobOrParts && Array.isArray(jobOrParts.spareParts)) return jobOrParts.spareParts;
    return [];
  }

  function sparePartsTotal(jobOrParts) {
    return sparePartsFor(jobOrParts).reduce((sum, part) => {
      const value = amount(part && part.amount);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
  }

  function normalizeWhatsAppPhone(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { ok: true, digits: '', error: '' };
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = `91${digits.slice(1)}`;
    } else if (digits.length === 10) {
      digits = `91${digits}`;
    }
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, digits: '', error: 'Enter a valid 10-digit mobile number or include country code.' };
    }
    return { ok: true, digits, error: '' };
  }

  function formatRupeesPlain(value) {
    const num = Math.round(Number(value) || 0);
    return `₹${num.toLocaleString('en-IN')}`;
  }

  function buildWhatsAppDraft(type, context = {}) {
    const draftType = WHATSAPP_DRAFT_TYPES.includes(type) ? type : 'followUp';
    const customerName = stripControlChars(context.customerName || '').trim() || 'Customer';
    const model = stripControlChars(context.model || '').trim() || 'water purifier';
    const categoryLabel = stripControlChars(context.categoryLabel || '').trim();
    const serviceDesc = categoryLabel ? `${model} (${categoryLabel.toLowerCase()})` : model;
    const dateLabel = stripControlChars(context.dateText || '').trim();
    const dueDateLabel = stripControlChars(context.dueDateText || '').trim();
    const datePhrase = dateLabel ? ` on ${dateLabel}` : '';
    const duePhrase = dueDateLabel ? ` scheduled for ${dueDateLabel}` : '';
    const pendingAmount = Math.max(amount(context.pendingAmount), 0);
    const parts = sparePartsFor(context.parts);
    const partsTotal = sparePartsTotal(parts);

    if (draftType === 'location') {
      return `Hello ${customerName}, please share your exact location or address for your ${serviceDesc} service${datePhrase || duePhrase} so I can reach on time.`;
    }
    if (draftType === 'arrival') {
      return `Hello ${customerName}, I am on the way for your ${serviceDesc} service${datePhrase || duePhrase} and will arrive shortly in a few minutes. Please let me know if there are any entry instructions.`;
    }
    if (draftType === 'completion') {
      const partsDetail = parts.length
        ? ` Spare parts used: ${parts.map(part => `${stripControlChars(part.name).trim()} (${formatRupeesPlain(part.amount)})`).join(', ')} (Total ${formatRupeesPlain(partsTotal)}).`
        : '';
      return `Hello ${customerName}, your ${serviceDesc} service${datePhrase} is completed.${partsDetail} Please reach out if you need any further help. Thank you!`;
    }
    if (draftType === 'appointment') {
      return `Hello ${customerName}, confirming your ${serviceDesc} service appointment${duePhrase || datePhrase}. Please reply if you need to reschedule.`;
    }
    if (draftType === 'thankYou') {
      return `Hello ${customerName}, thank you for choosing our service for your ${serviceDesc}${datePhrase}. It was a pleasure serving you! Please feel free to reach out anytime.`;
    }
    if (draftType === 'paymentReminder') {
      const pendingPart = pendingAmount > 0 ? ` of ${formatRupeesPlain(pendingAmount)}` : '';
      return `Hello ${customerName}, this is a polite reminder regarding the pending payment${pendingPart} for your ${serviceDesc} service${datePhrase}. Please let me know once it is processed. Thank you!`;
    }
    return `Hello ${customerName}, following up after your ${serviceDesc} service${datePhrase}. Please let me know if everything is working smoothly or if you need any assistance.`;
  }

  function buildWhatsAppUrl(phoneValue, messageValue) {
    const phoneCheck = normalizeWhatsAppPhone(phoneValue);
    if (!phoneCheck.ok) return { ok: false, url: '', error: phoneCheck.error, field: 'phone' };
    const textCheck = normalizeNoteText(messageValue, MAX_WHATSAPP_MESSAGE_LENGTH);
    if (!textCheck.ok || !textCheck.text) {
      return {
        ok: false,
        url: '',
        error: textCheck.ok ? 'Enter a WhatsApp message before opening WhatsApp.' : textCheck.error,
        field: 'message'
      };
    }
    const base = phoneCheck.digits ? `https://wa.me/${phoneCheck.digits}` : 'https://wa.me/';
    return {
      ok: true,
      url: `${base}?text=${encodeURIComponent(textCheck.text)}`,
      digits: phoneCheck.digits,
      text: textCheck.text,
      error: ''
    };
  }

  function normalizeWhatsAppTemplateInput(titleValue, bodyValue, existingId = '') {
    const title = stripControlChars(titleValue).replace(/\s+/g, ' ').trim();
    if (!title) return { ok: false, field: 'title', error: 'Enter a name for this saved WhatsApp draft.' };
    if (title.length > 60) return { ok: false, field: 'title', error: 'Draft name must be 60 characters or fewer.' };
    const bodyCheck = normalizeNoteText(bodyValue, MAX_WHATSAPP_MESSAGE_LENGTH);
    if (!bodyCheck.ok || !bodyCheck.text) {
      return {
        ok: false,
        field: 'body',
        error: bodyCheck.ok ? 'Enter a message before saving this draft.' : bodyCheck.error
      };
    }
    return {
      ok: true,
      template: { id: String(existingId || '').trim(), title, body: bodyCheck.text },
      error: ''
    };
  }

  function renderCustomWhatsAppTemplate(body, context = {}) {
    const text = stripControlChars(body || '').trim();
    if (!text) return '';
    const customerName = stripControlChars(context.customerName || '').trim() || 'Customer';
    const model = stripControlChars(context.model || '').trim() || 'water purifier';
    const category = stripControlChars(context.categoryLabel || '').trim();
    const dateLabel = stripControlChars(context.dateText || '').trim();
    const dueDateLabel = stripControlChars(context.dueDateText || '').trim();
    const pendingAmount = Math.max(amount(context.pendingAmount), 0);
    const partsTotal = sparePartsTotal(context.parts);
    const tokens = {
      '{customer}': customerName,
      '{model}': model,
      '{category}': category,
      '{date}': dateLabel,
      '{dueDate}': dueDateLabel,
      '{pending}': pendingAmount > 0 ? formatRupeesPlain(pendingAmount) : '₹0',
      '{partsTotal}': formatRupeesPlain(partsTotal)
    };
    return text.replace(/\{(customer|model|category|date|dueDate|pending|partsTotal)\}/g, match => tokens[match] ?? match);
  }

  function normalizeNoteText(value, maxLength = MAX_NOTE_LENGTH) {
    const cleaned = stripControlChars(value).trim();
    if (!cleaned) return { ok: true, text: '', error: '' };
    if (cleaned.length > maxLength) {
      return { ok: false, text: '', error: `Notes must be ${maxLength} characters or fewer.` };
    }
    return { ok: true, text: cleaned, error: '' };
  }

  function safeNoteText(value, maxLength = MAX_NOTE_LENGTH) {
    const cleaned = stripControlChars(value).trim();
    return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
  }

  function normalizeMapsUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { ok: true, url: '', error: '' };
    if (raw.length > MAX_MAPS_URL_LENGTH) {
      return { ok: false, url: '', error: 'Maps link is too long (maximum 1000 characters).' };
    }
    if (/[\u0000-\u001F\u007F\s]/.test(raw) || raw.startsWith('//')) {
      return { ok: false, url: '', error: 'Enter a valid http:// or https:// Maps link without spaces.' };
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_) {
      return { ok: false, url: '', error: 'Enter a valid Maps link starting with https:// or http://.' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, url: '', error: 'Maps link must start with https:// or http://.' };
    }
    if (parsed.username || parsed.password || !parsed.hostname || !parsed.hostname.includes('.')) {
      return { ok: false, url: '', error: 'Enter a valid Maps web address.' };
    }
    return { ok: true, url: parsed.href, error: '' };
  }

  function safeMapsUrl(value) {
    const result = normalizeMapsUrl(value);
    return result.ok ? result.url : '';
  }

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
    if (component === 'jobValue') {
      if (job.category === 'refresh' && job.jobValue != null && Number.isFinite(Number(job.jobValue))) {
        return Math.max(amount(job.jobValue), 0);
      }
      return fixedAmounts.jobValue;
    }
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

  function checkUniqueStringIds(records, label) {
    const ids = records.map(record => record && record.id);
    if (ids.some(value => typeof value !== 'string' || !value.trim()) || new Set(ids).size !== ids.length) {
      throw new Error(`The backup has missing or repeated ${label} IDs.`);
    }
  }

  function validateAndNormalizeBackup(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.jobs) || !Array.isArray(payload.payments)) {
      throw new Error('This file is not a Hisaab Kitab backup.');
    }
    const customers = Array.isArray(payload.customers) ? payload.customers : [];
    const hiddenCustomers = Array.isArray(payload.hiddenCustomers)
      ? payload.hiddenCustomers.filter(item => typeof item === 'string')
      : [];
    checkUniqueStringIds(payload.jobs, 'job');
    checkUniqueStringIds(payload.payments, 'payment');
    checkUniqueStringIds(customers, 'customer');

    if (payload.jobs.some(job => !job || typeof job.customer !== 'string' || typeof job.date !== 'string'
      || (job.notes != null && typeof job.notes !== 'string')
      || (job.dueTime != null && typeof job.dueTime !== 'string')
      || (job.spareParts != null && !Array.isArray(job.spareParts)))) {
      throw new Error('The backup contains an incomplete job record.');
    }
    payload.jobs.forEach(job => {
      if (!Array.isArray(job.spareParts)) return;
      checkUniqueStringIds(job.spareParts, 'spare part');
      if (job.spareParts.some(part => !part || typeof part.name !== 'string' || !part.name.trim()
        || !Number.isFinite(Number(part.amount)) || Number(part.amount) < 0)) {
        throw new Error('The backup contains an incomplete or invalid spare part record.');
      }
    });
    if (payload.payments.some(payment => !payment || typeof payment.component !== 'string' || typeof payment.date !== 'string'
      || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0
      || (payment.jobId != null && typeof payment.jobId !== 'string'))) {
      throw new Error('The backup contains an incomplete or invalid payment record.');
    }
    if (customers.some(customer => !customer || typeof customer.name !== 'string'
      || (customer.mapsUrl != null && typeof customer.mapsUrl !== 'string')
      || (customer.notes != null && typeof customer.notes !== 'string'))) {
      throw new Error('The backup contains an incomplete customer record.');
    }
    const rawTemplates = payload.whatsappTemplates == null ? [] : payload.whatsappTemplates;
    if (!Array.isArray(rawTemplates)) {
      throw new Error('The backup contains an invalid saved WhatsApp draft list.');
    }
    checkUniqueStringIds(rawTemplates, 'WhatsApp draft');
    if (rawTemplates.some(tpl => !tpl || typeof tpl.title !== 'string' || !tpl.title.trim()
      || typeof tpl.body !== 'string' || !tpl.body.trim())) {
      throw new Error('The backup contains an incomplete saved WhatsApp draft.');
    }

    const payments = payload.payments.map(payment => ({ ...payment }));
    const jobs = payload.jobs.map(job => {
      const nextJob = { ...job };
      if (!nextJob.locality) {
        nextJob.locality = payments.some(payment => payment.jobId === nextJob.id && payment.component === 'extraMile')
          ? 'nonLocal' : 'local';
      }
      if (nextJob.extraMileExpected == null) nextJob.extraMileExpected = 0;
      if (nextJob.jobValue != null && Number.isFinite(Number(nextJob.jobValue))) {
        nextJob.jobValue = Math.max(0, Math.floor(Number(nextJob.jobValue)));
      }
      if (typeof nextJob.phone !== 'string') nextJob.phone = '';
      if (typeof nextJob.notes !== 'string') nextJob.notes = '';
      const timeCheck = normalizeTimeString(nextJob.dueTime);
      nextJob.dueTime = timeCheck.ok ? timeCheck.time : '';
      nextJob.spareParts = Array.isArray(nextJob.spareParts)
        ? nextJob.spareParts.map(part => ({
          ...part,
          name: stripControlChars(part.name).replace(/\s+/g, ' ').trim(),
          amount: Number(part.amount)
        }))
        : [];
      return nextJob;
    });
    const normalizedCustomers = customers.map(customer => ({
      ...customer,
      mapsUrl: typeof customer.mapsUrl === 'string' ? customer.mapsUrl : '',
      notes: typeof customer.notes === 'string' ? customer.notes : ''
    }));

    const normalizedTemplates = rawTemplates.map(tpl => ({
      ...tpl,
      title: stripControlChars(tpl.title).replace(/\s+/g, ' ').trim(),
      body: stripControlChars(tpl.body).trim()
    }));

    return {
      ...payload,
      jobs,
      payments,
      customers: normalizedCustomers,
      hiddenCustomers,
      whatsappTemplates: normalizedTemplates
    };
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
    paymentTotals,
    normalizeMapsUrl,
    safeMapsUrl,
    normalizeNoteText,
    safeNoteText,
    normalizeSparePartInput,
    sparePartsFor,
    sparePartsTotal,
    WHATSAPP_DRAFT_TYPES,
    normalizeWhatsAppPhone,
    buildWhatsAppDraft,
    buildWhatsAppUrl,
    normalizeWhatsAppTemplateInput,
    renderCustomWhatsAppTemplate,
    normalizeTimeString,
    formatTime12h,
    evaluateReminders,
    pruneReminderState,
    validateAndNormalizeBackup
  };
});
