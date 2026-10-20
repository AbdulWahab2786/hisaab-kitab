# Hisaab Kitab — Partner payment tracker

An early, single-device MVP for a water-purifier service partner to reconcile UC job payments and incentives. The web interface is responsive and can be installed as a Progressive Web App (PWA) when hosted over HTTPS.

## Open the prototype

For a quick preview, open `index.html` in a modern browser. No account is required.

For Android installation and offline app-shell support, host this folder on an HTTPS website, open the website in Chrome on the phone, and choose **Install app** or **Add to Home screen** from the browser menu. The service worker caches the app interface after it is first opened. Opening the file directly from disk does not enable PWA installation or service-worker caching.

## Current workflow

1. Add an incoming job with the customer name shown in UC, optional mobile number, job type, category (Installation, Repair, or Refresh install for regular jobs), location type, and the date it must be completed by. My Schedule groups jobs by deadline and lets the partner reschedule, move them between Upcoming/Pending/Follow-up, or slide to mark them complete. Completion stores the actual completion date separately for payment matching.
2. Regular jobs include the fixed ₹354 net job value, the ₹250 on-time incentive when expected, and the ₹150 rating reward when expected. Local jobs do not ask for extra-mile. Non-local jobs remain pending until an extra-mile payment is recorded; enter an expected amount when known to track a rupee balance. Referral jobs expect only the referral amount entered for that job; they do not include the ₹354 job value, on-time incentive, rating reward, extra-mile, or commission.
3. When credits appear in UC Money, select the payment parts received for that job/date. For non-local regular jobs, enter extra-mile manually; UC commission can be entered manually for regular jobs. The agreed Referral job payout stays separate from optional Goodwill: after a completed job, select Goodwill and enter the amount the customer gave. Goodwill has no expected or pending balance, counts in total Received, and is also shown in its own dashboard card. The job picker shows pending parts and settled jobs; already received fixed parts cannot be selected again. If the job is not clear yet, leave it unmatched and match it later. Payment history is grouped by received date.
4. Open Customers to create a customer profile or open an existing one. The green dot means all completed-job payments are settled; a breathing red dot means money is pending or needs matching. Add a mobile number to show a call link on the customer's profile and list. Each profile has an editable Customer ID and a three-dot menu for editing or deleting the profile. Deleting a profile hides it from Customers but keeps its jobs and payment records in the ledger; adding the customer again restores the profile. Profiles also appear automatically for customer names on jobs or unmatched payments. Each profile shows expected parts, amounts received, pending parts, payment history, and unmatched credits.
5. The Jobs screen defaults to Regular jobs and the last month. Filter by Regular/Referral/All, the last 7 days, 15 days, 1 month, all dates, or a custom date range. Edit jobs as needed. Delete removes a job but keeps its linked payment records as unmatched entries with the customer name.
6. Edit a payment to correct its amount, payment part, date, customer name, or job match. Use Unmatch to keep it for matching later. Delete removes that payment line from the tracker after confirmation.
7. Open **Backup** in the top bar to export a JSON backup or restore one. Restoring a backup replaces the records currently on this device after confirmation.

## Scope and data

- This version does not connect to Urban Company or read UC account data. Entries are manual.
- Data is stored in this browser's local storage on this device. The installed PWA uses the website's browser storage for its origin; it does not sync with another browser, website, or device. Export backups regularly. Clearing browser/site data can remove the records.
- For non-local jobs without an expected extra-mile figure, the app shows an extra-mile payment as pending until an amount is recorded. This pending state does not add an estimated rupee amount to the dashboard.
- Commission entries are recorded as received credits. The app does not estimate commission due.
- Goodwill is an optional customer-given amount; it is manually entered only when received and does not create a pending balance.
- This prototype has no sign-in, cloud sync, Play Store package, or multi-device access. An Android package with a separate app-private database is a later release step.

## Suggested next product milestones

1. Try the entry flow with a partner's real jobs and payment batches; refine the labels and matching flow.
2. Try the installable PWA with partners on Android and improve the entry flow from their feedback.
3. Prepare a Capacitor Android package with app-private phone storage and test backup/restore on the phone.
4. Decide whether sign-in and cross-device sync are needed before adding a backend.
