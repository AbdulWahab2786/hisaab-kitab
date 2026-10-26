(function (root) {
  "use strict";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const QUERY = "appProperties has { key='hisaabKitabBackup' and value='true' } and trashed = false";
  const API = "https://www.googleapis.com/drive/v3";
  let settings = {}, clientId = "", accessToken = "", tokenExpiresAt = 0;
  let googleScriptPromise = null, busy = false, initialized = false;

  function el(id) { return document.getElementById(id); }
  function hasAccess() {
    if (accessToken && Date.now() < tokenExpiresAt) return true;
    accessToken = ""; tokenExpiresAt = 0; updateControls(); return false;
  }
  function status(message, kind) {
    const node = el("driveStatus");
    if (node) { node.textContent = message; node.dataset.kind = kind || "info"; }
  }
  function clearList() {
    const list = el("driveBackupList");
    const section = el("driveBackupSection");
    if (list) list.replaceChildren();
    if (section) section.hidden = true;
  }
  function updateControls() {
    const connected = Boolean(accessToken && Date.now() < tokenExpiresAt);
    const connect = el("driveConnectButton");
    const actions = el("driveActions");
    const disconnect = el("driveDisconnectButton");
    if (connect) {
      connect.textContent = connected ? "Google Drive connected" : "Connect Google Drive";
      connect.disabled = busy || !clientId || !root.google || !root.google.accounts || !root.google.accounts.oauth2 || connected;
    }
    if (actions) actions.hidden = !connected;
    if (disconnect) { disconnect.hidden = !connected; disconnect.disabled = busy; }
    ["driveSaveButton", "driveRefreshButton"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = busy || !connected;
    });
    document.querySelectorAll("[data-drive-restore]").forEach(function (button) { button.disabled = busy || !connected; });
  }
  function secureOrigin() {
    return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }
  function loadGoogleIdentity() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = function () {
        if (root.google && root.google.accounts && root.google.accounts.oauth2) resolve();
        else reject(new Error("Google sign-in could not be initialized."));
      };
      script.onerror = function () { googleScriptPromise = null; reject(new Error("Google sign-in could not load. Check your connection.")); };
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }
  function requestToken() {
    return new Promise(function (resolve, reject) {
      if (!root.google || !root.google.accounts || !root.google.accounts.oauth2) {
        reject(new Error("Google sign-in is not ready. Close this window and try again.")); return;
      }
      try {
        const tokenClient = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: SCOPE, include_granted_scopes: true,
          callback: function (response) {
            if (!response || response.error || !response.access_token) {
              reject(new Error(response && response.error === "access_denied"
                ? "Drive access was not granted. You can try again whenever you are ready."
                : "Google Drive access could not be authorized. Please try again."));
              return;
            }
            accessToken = response.access_token;
            tokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000 - 30000;
            updateControls(); resolve(accessToken);
          },
          error_callback: function (error) {
            reject(new Error(error && error.type === "popup_closed"
              ? "Google sign-in was closed before access was granted."
              : "Google sign-in could not open. Allow pop-ups and try again."));
          }
        });
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (_) { reject(new Error("Google Drive access could not start. Check the OAuth setup.")); }
    });
  }
  function filenameTimestamp() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).reduce(function (result, part) {
      result[part.type] = part.value; return result;
    }, {});
    return parts.year + "-" + parts.month + "-" + parts.day + "_" + parts.hour + "-" + parts.minute + "-" + parts.second + "-" + String(new Date().getMilliseconds()).padStart(3, "0");
  }
  async function driveRequest(url, token, options) {
    const requestOptions = Object.assign({}, options || {});
    requestOptions.headers = Object.assign({}, requestOptions.headers || {}, { Authorization: "Bearer " + token });
    let response;
    try { response = await fetch(url, requestOptions); }
    catch (_) { throw new Error("Could not reach Google Drive. Check your internet connection."); }
    if (!response.ok) {
      if (response.status === 401) {
        accessToken = ""; tokenExpiresAt = 0; updateControls();
        throw new Error("Google Drive access expired. Connect again and retry.");
      }
      if (response.status === 403) throw new Error("Google Drive refused this request. Check that Drive API is enabled and permission was granted.");
      throw new Error("Google Drive could not complete the request (error " + response.status + "). Please retry.");
    }
    return response;
  }
  async function listBackups(token) {
    const url = new URL(API + "/files");
    url.searchParams.set("q", QUERY);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("orderBy", "createdTime desc");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields", "files(id,name,mimeType,createdTime,webViewLink)");
    const response = await driveRequest(url.toString(), token);
    const result = await response.json();
    const files = Array.isArray(result.files) ? result.files.filter(function (file) {
      return file && file.id && file.mimeType === "application/json";
    }) : [];
    renderBackups(files); return files;
  }
  function driveDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "numeric",
      minute: "2-digit", timeZone: "Asia/Kolkata"
    }).format(date) + " IST";
  }
  function renderBackups(files) {
    const list = el("driveBackupList"), section = el("driveBackupSection");
    if (!list || !section) return;
    list.replaceChildren(); section.hidden = false;
    if (!files.length) {
      const empty = document.createElement("p");
      empty.className = "drive-empty";
      empty.textContent = "No Hisaab Kitab backups found in this Google account yet.";
      list.appendChild(empty); updateControls(); return;
    }
    files.forEach(function (file) {
      const row = document.createElement("article"); row.className = "drive-backup-row";
      const details = document.createElement("div"); details.className = "drive-backup-meta";
      const name = document.createElement("strong"); name.textContent = file.name;
      const date = document.createElement("span"); date.textContent = driveDate(file.createdTime);
      details.append(name, date);
      const actions = document.createElement("div"); actions.className = "drive-backup-actions";
      const restore = document.createElement("button");
      restore.type = "button"; restore.className = "button button-primary button-small";
      restore.textContent = "Review & restore"; restore.setAttribute("data-drive-restore", file.id);
      restore.addEventListener("click", function () {
        runAction("Opening backup for review…", async function (token) {
          const response = await driveRequest(API + "/files/" + encodeURIComponent(file.id) + "?alt=media", token);
          let payload;
          try { payload = await response.json(); }
          catch (_) { throw new Error("This Drive file is not a readable JSON backup."); }
          settings.previewBackup(payload, file.name);
          status("Review the backup details before replacing records on this device.", "success");
        });
      });
      const openLink = document.createElement("a");
      openLink.className = "button button-small"; openLink.textContent = "Open in Drive";
      openLink.href = file.webViewLink || ("https://drive.google.com/file/d/" + encodeURIComponent(file.id) + "/view");
      openLink.target = "_blank"; openLink.rel = "noopener noreferrer";
      actions.append(restore, openLink); row.append(details, actions); list.appendChild(row);
    });
    updateControls();
  }
  function runAction(message, action) {
    if (busy) return;
    busy = true; status(message, "info"); updateControls();
    const tokenPromise = hasAccess() ? Promise.resolve(accessToken) : requestToken();
    tokenPromise.then(function (token) { return action(token); })
      .catch(function (error) { status(error && error.message ? error.message : "Google Drive action failed. Please retry.", "error"); })
      .finally(function () { busy = false; updateControls(); });
  }
  async function createBackup(token) {
    const payload = settings.getBackupPayload();
    const name = "hisaab-kitab-backup-" + filenameTimestamp() + ".json";
    const metadata = {
      name: name, mimeType: "application/json",
      description: "Hisaab Kitab snapshot containing customer, job, and payment records.",
      appProperties: { hisaabKitabBackup: "true", backupFormat: "1" }
    };
    const boundary = "hisaabKitabBoundary" + Date.now() + Math.random().toString(16).slice(2);
    const body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(payload, null, 2) + "\r\n--" + boundary + "--";
    const response = await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,webViewLink", token, {
      method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: body
    });
    const file = await response.json();
    status("Backup saved as " + file.name + ".", "success");
    if (settings.onToast) settings.onToast("Dated backup saved to Google Drive");
    try { await listBackups(token); }
    catch (_) { status("Backup was saved, but the list could not refresh. Reopen this screen and refresh backups.", "success"); }
  }
  async function refreshBackups(token) {
    const files = await listBackups(token);
    status(files.length
      ? "Showing " + files.length + " recent Hisaab Kitab backup" + (files.length === 1 ? "" : "s") + "."
      : "No Hisaab Kitab backups found in this Google account yet.", "success");
  }
  function open() {
    const dialog = el("googleDriveDialog");
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    if (!clientId) {
      status("Google Drive is not configured yet. Add the OAuth web client ID in google-drive-config.js.", "error");
      updateControls(); return;
    }
    if (!secureOrigin()) {
      status("Open Hisaab Kitab from its HTTPS website to connect Google Drive. A file:// preview cannot authorize Google access.", "error");
      updateControls(); return;
    }
    if (hasAccess()) {
      status("Google Drive access is ready for this browser session. Backups are created only when you choose Save a dated backup.", "success");
      updateControls(); return;
    }
    const connect = el("driveConnectButton");
    if (connect) connect.disabled = true;
    status("Preparing Google sign-in…", "info");
    loadGoogleIdentity().then(function () {
      status("Choose a Google account and allow access to Hisaab Kitab backup files.", "info");
      updateControls();
    }).catch(function (error) { status(error.message, "error"); updateControls(); });
  }
  function disconnect() {
    accessToken = ""; tokenExpiresAt = 0; clearList();
    status("Disconnected for this browser session. You can also revoke access in your Google Account settings.", "info");
    updateControls();
  }
  function init(options) {
    if (initialized) return;
    initialized = true; settings = options || {}; clientId = String(settings.clientId || "").trim();
    el("driveConnectButton").addEventListener("click", function () {
      if (busy || !clientId || !root.google || !root.google.accounts || !root.google.accounts.oauth2) return;
      if (hasAccess()) return;
      busy = true; status("Choose your Google account and review the requested Drive permission…", "info"); updateControls();
      requestToken().then(async function (token) {
        status("Google Drive access is ready. Looking for existing backups…", "success");
        try {
          const files = await listBackups(token);
          status(files.length
            ? "Google Drive is connected for this session. " + files.length + " backup" + (files.length === 1 ? "" : "s") + " found."
            : "Google Drive is connected for this session. Save a dated backup when ready.", "success");
        } catch (error) { status(error.message, "error"); }
      }).catch(function (error) { status(error.message, "error"); })
        .finally(function () { busy = false; updateControls(); });
    });
    el("driveSaveButton").addEventListener("click", function () { runAction("Creating a new dated backup…", createBackup); });
    el("driveRefreshButton").addEventListener("click", function () { runAction("Finding Hisaab Kitab backups…", refreshBackups); });
    el("driveDisconnectButton").addEventListener("click", disconnect);
    document.addEventListener("visibilitychange", updateControls);
    updateControls();
  }
  root.HisaabKitabDriveBackup = { init: init, open: open };
})(window);
