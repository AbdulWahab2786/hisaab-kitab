# Hisaab Kitab — Partner payment tracker

An early, single-device MVP for a water-purifier service partner to reconcile UC job payments and incentives. The web interface is responsive and can be installed as a Progressive Web App (PWA) when hosted over HTTPS.

## Open the prototype

For a quick preview, open `index.html` in a modern browser. No account is required.

For Android installation and offline app-shell support, host this folder on an HTTPS website, open the website in Chrome on the phone, and choose **Install app** or **Add to Home screen** from the browser menu. The service worker caches the app interface after it is first opened. Opening the file directly from disk does not enable PWA installation or service-worker caching.

To run the accounting checks on a computer with Node.js installed, open this folder in a terminal and run `node --test tests/ledger-core.test.cjs`. The project has no separate build step.

## Current workflow

1. Add an incoming job with the customer name shown in UC, optional mobile number, job type, category (Installation, Repair, or Refresh install for regular jobs), location type, and the date it must be completed by. My Schedule groups jobs by deadline and lets the partner reschedule, move them between Upcoming/Pending/Follow-up, or slide to mark them complete. Completion stores the actual completion date separately for payment matching.
2. Regular jobs include the fixed ₹354 net job value, the ₹250 on-time incentive when expected, and the ₹150 rating reward when expected. Local jobs do not ask for extra-mile. Non-local jobs remain pending until an extra-mile payment is recorded; enter an expected amount when known to track a rupee balance. Referral jobs expect only the referral amount entered for that job; they do not include the ₹354 job value, on-time incentive, rating reward, extra-mile, or commission.
3. When credits appear in UC Money, select the payment parts received for that job/date and enter the actual amount for each part. A payment can arrive in multiple partial transactions on different dates; only the remaining amount stays selectable. For non-local regular jobs, enter extra-mile manually; UC commission can be entered manually for regular jobs. The agreed Referral job payout stays separate from optional Goodwill: after a completed job, select Goodwill and enter the amount the customer gave. Goodwill has no expected or pending balance, counts in total Received, and is also shown in its own dashboard card. The job picker shows pending parts and settled jobs. If the job is not clear yet, leave it unmatched and match it later. Payment history is grouped by received date and can be filtered by category.
4. Open Customers to create a customer profile or open an existing one. The green dot means all completed-job payments are settled; a breathing red dot means money is pending or needs matching. Add a mobile number to show a call link on the customer's profile and list. Each profile has an editable Customer ID and a three-dot menu for editing or deleting the profile. Deleting a profile hides it from Customers but keeps its jobs and payment records in the ledger; adding the customer again restores the profile. Profiles also appear automatically for customer names on jobs or unmatched payments. Each profile shows expected parts, amounts received, pending parts, payment history, and unmatched credits.
5. The Jobs screen defaults to All job types and This month. Filter by Regular/Referral/All, the last 7 days, 15 days, this month, all dates, or a custom date range. Job sorting uses clear latest-date-first and earliest-date-first labels. Edit jobs as needed. Delete removes a job but keeps its linked payment records as unmatched entries with the customer name.
6. Edit a payment to correct its amount, payment part, date, customer name, or job match. Use Unmatch to keep it for matching later. Delete removes that payment line from the tracker after confirmation.
7. Open **Settings** in the top bar to export a JSON backup or restore one. Restoring a backup replaces the records currently on this device after confirmation.

## Home dashboard totals

- Choose **This month**, **Last month**, or **All time** to filter received-payment cards by the date the money arrived, and completed-job totals by the job completion date.
- **Known payments pending** is the current balance across all completed jobs; it is not reduced by Goodwill, commission, or unrelated payments.
- Goodwill, extra-mile, and commission are shown separately. **All payments received** includes every recorded payment once, while the linked job-receipts card excludes payments that have not been matched to a job.
- The Needs attention list points to today’s scheduled jobs, known pending parts, non-local jobs without a recorded extra-mile amount, overdue jobs, and payments that still need matching.

## Google Drive backups

The app can create a **new dated JSON snapshot** in the user's visible Google Drive. It does not continuously sync and does not replace the browser's local working copy. Restoring a Drive backup uses the existing validation and review dialog; records are replaced only after the user confirms.

Before Drive access is available, configure a Google OAuth **Web application client ID** in google-drive-config.js (the client ID is public; never put a client secret in the PWA). In Google Cloud Console:

1. Enable the Google Drive API, configure OAuth branding, and add the drive.file scope under Data Access.
2. Keep the app in Testing mode while developing and add each tester's Google account as a test user.
3. Create a Web application OAuth client. Add https://hisaab-kitab.pages.dev as an authorized JavaScript origin, plus http://localhost and http://localhost:8766 for local development.
4. Copy the client ID into google-drive-config.js, deploy, and test with a non-critical account.

The app requests the narrow drive.file permission. Users grant it from the Google account popup after selecting **Connect Google Drive**. The app only lists and reads Hisaab Kitab backup files it created. The OAuth access token stays in page memory and is not written to localStorage. The browser preview opened as file:// cannot use Drive authorization; use HTTPS or localhost.

For a public production release, Google requires the OAuth app's web domains to be verified and a public homepage/privacy policy on a verified domain. Because pages.dev is a shared hosting domain, Google may require a custom domain you control on Cloudflare Pages before production verification. Testing mode is suitable for initial partner testing.

Each backup filename includes the creation date and time in India Standard Time. A backup contains customer names and phone numbers, jobs, and financial/payment records. Users can disconnect the current page session here and can revoke the app's Drive permission from their Google Account. Because every backup is a separate file, older snapshots remain available; this first version does not merge data or automatically sync devices.
## Scope and data

- This version does not connect to Urban Company or read UC account data. Entries are manual.
- Working records are stored in this browser's local storage on this device. The installed PWA uses the website's browser storage for its origin. A user can create dated JSON backups in their Google Drive and restore one on another device, but changes do not sync automatically. Clearing browser/site data removes the local copy; Drive snapshots remain until the user deletes them.
- For non-local jobs without an expected extra-mile figure, the app shows an extra-mile payment as pending until an amount is recorded. This pending state does not add an estimated rupee amount to the dashboard.
- Commission entries are recorded as received credits. The app does not estimate commission due.
- Goodwill is an optional customer-given amount; it is manually entered only when received and does not create a pending balance.
- This prototype has no Hisaab Kitab account login or automatic cloud sync. Google Drive authorization is separate and only used for user-requested backup/restore. A Play Store package and Android app-private database are later release steps.

## Suggested next product milestones

1. Try the entry flow with a partner's real jobs and payment batches; refine the labels and matching flow.
2. Try the installable PWA with partners on Android and improve the entry flow from their feedback.
3. Prepare a Capacitor Android package with app-private phone storage and test backup/restore on the phone.
4. Decide whether sign-in and cross-device sync are needed before adding a backend.

