"use strict";

/*
  Penvoria v1.1 — Cloud Conflict Recovery
  Requires app.js and cloud.js to load first.
*/

(() => {
  const cloud = window.penvoriaCloud;
  const toolbar = document.querySelector(".cloud-toolbar");

  if (!cloud || !toolbar || typeof writeMonth !== "function") {
    return;
  }

  /* ==========================================
     SAFE CLOUD COMPARISON
     ========================================== */

  async function readCloudMonth(key, userId) {
    const { data: row, error } = await cloud.client
      .from("monthly_budgets")
      .select("data,revision")
      .eq("user_id", userId)
      .eq("month", `${key}-01`)
      .maybeSingle();

    if (error) throw error;
    return row;
  }

  function checkSnapshot(snapshot) {
    if (
      !cloud.ready ||
      !cloud.user ||
      !navigator.onLine ||
      cloud.recoveryError ||
      !snapshot ||
      !validMonth(snapshot.month) ||
      cloud.user.id !== snapshot.userId ||
      !cloud.conflicts.has(snapshot.month) ||
      !cloud.drafts[snapshot.month] ||
      cloud.drafts[snapshot.month].token !== snapshot.localToken
    ) {
      throw new Error(
        "This conflict has changed or the connection " +
          "is unavailable. Review it again.",
      );
    }
  }

  async function inspectConflict(key) {
    if (
      !validMonth(key) ||
      !cloud.ready ||
      !cloud.user ||
      !cloud.conflicts.has(key) ||
      cloud.recoveryError ||
      !navigator.onLine
    ) {
      throw new Error("This month is not available for conflict review.");
    }

    await cloud.pending;

    const userId = cloud.user.id;
    const draft = cloud.drafts[key];

    if (!draft) {
      throw new Error("The unsynced local draft is unavailable.");
    }

    const row = await readCloudMonth(key, userId);

    const snapshot = {
      month: key,
      userId,
      localToken: draft.token,
      originalBaseRevision: draft.baseRevision,
      cloudRevision: row?.revision ?? null,
      localData: JSON.parse(JSON.stringify(normalizeMonth(draft.data))),
      cloudData: row
        ? JSON.parse(JSON.stringify(normalizeMonth(row.data)))
        : null,
      inspectedAt: new Date().toISOString(),
    };

    checkSnapshot(snapshot);
    return snapshot;
  }

  /* ==========================================
     EXPLICIT RESOLUTION
     ========================================== */

  async function resolveConflict(snapshot, choice) {
    if (!["local", "cloud"].includes(choice)) {
      throw new Error("Invalid recovery choice.");
    }

    await cloud.pending;
    checkSnapshot(snapshot);

    const key = snapshot.month;
    const userId = snapshot.userId;

    const row = await readCloudMonth(key, userId);

    checkSnapshot(snapshot);

    // Refuse to act on a stale comparison.
    if ((row?.revision ?? null) !== snapshot.cloudRevision) {
      throw new Error(
        "The cloud changed since your comparison. " +
          "Review the versions again before continuing.",
      );
    }

    if (choice === "local") {
      const draft = cloud.drafts[key];

      // Uses cloud.js's existing revision-checked writer.
      const result = await writeMonth(
        key,
        {
          data: JSON.parse(JSON.stringify(normalizeMonth(draft.data))),
          baseRevision: snapshot.cloudRevision,
        },
        userId,
      );

      if (result.conflict) {
        throw new Error(
          "The cloud changed while saving. " +
            "The newer version was not overwritten.",
        );
      }

      cloud.versions[key] = result.revision;

      const newest = cloud.drafts[key];

      if (newest?.token === snapshot.localToken) {
        delete cloud.drafts[key];
      } else if (newest) {
        // Preserve edits made during the request.
        newest.baseRevision = result.revision;
      }

      cloud.conflicts.delete(key);

      if (!storeDrafts()) {
        cloud.recoveryError = true;

        throw new Error(
          "The cloud was updated, but local recovery " +
            "storage failed. Export a backup before closing.",
        );
      }
    } else {
      // First update persistent storage successfully.
      // Only then discard the in-memory local draft.
      const remainingDrafts = {
        ...cloud.drafts,
      };

      delete remainingDrafts[key];

      try {
        const storageKey = draftStorageKey(userId);

        if (Object.keys(remainingDrafts).length) {
          localStorage.setItem(storageKey, JSON.stringify(remainingDrafts));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        throw new Error(
          "Could not update local recovery storage. " +
            "The draft is still preserved: " +
            error.message,
        );
      }

      delete cloud.drafts[key];
      cloud.conflicts.delete(key);

      cloud.versions[key] = row?.revision ?? null;

      if (row) {
        state.months[key] = normalizeMonth(row.data);
      } else {
        delete state.months[key];
      }
    }

    updateSyncStatus();
    render();

    void flushCloudQueue();
  }

  /* ==========================================
     RECOVERY BUTTON AND DIALOG
     ========================================== */

  const reviewButton = document.createElement("button");

  reviewButton.type = "button";
  reviewButton.className = "secondary";
  reviewButton.textContent = "Review sync conflict";
  reviewButton.hidden = true;

  toolbar.appendChild(reviewButton);

  const dialog = document.createElement("dialog");
  dialog.id = "penvoriaConflictDialog";
  dialog.setAttribute("aria-labelledby", "pcr-title");

  dialog.innerHTML = `
    <div class="pcr-wrap">

      <div class="pcr-heading">
        <h2 id="pcr-title">
          Resolve sync conflict
        </h2>

        <button
          type="button"
          class="secondary"
          id="pcr-close"
        >
          Close
        </button>
      </div>

      <p>
        Compare both copies before deciding.
        Penvoria will not merge or replace
        financial records automatically.
      </p>

      <label>
        Conflicted month

        <select
          id="pcr-month"
          aria-label="Conflicted month"
        ></select>
      </label>

      <p
        id="pcr-message"
        role="status"
        aria-live="polite"
      ></p>

      <div id="pcr-compare" hidden>

        <div class="pcr-columns">

          <section>
            <h3>Unsynced local version</h3>

            <div id="pcr-local-summary"></div>

            <details>
              <summary>View all local records</summary>
              <pre id="pcr-local-json"></pre>
            </details>
          </section>

          <section>
            <h3>Current cloud version</h3>

            <div id="pcr-cloud-summary"></div>

            <details>
              <summary>View all cloud records</summary>
              <pre id="pcr-cloud-json"></pre>
            </details>
          </section>

        </div>

        <p class="pcr-warning">
          Download both versions before resolving.
          Keep cloud discards the unsynced local draft.
          Use local replaces the cloud month.
        </p>

        <button
          id="pcr-backup"
          type="button"
          class="secondary"
        >
          Download both copies (JSON)
        </button>

        <label class="pcr-check">
          <input
            type="checkbox"
            id="pcr-saved"
            disabled
          >

          I verified that the backup was saved
          and can be opened.
        </label>

        <div class="pcr-actions">

          <button
            id="pcr-keep-cloud"
            type="button"
            disabled
          >
            Keep cloud version
          </button>

          <button
            id="pcr-keep-local"
            type="button"
            disabled
          >
            Use local version
          </button>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  /* ==========================================
     STYLING
     ========================================== */

  const style = document.createElement("style");

  style.textContent = `
    #penvoriaConflictDialog {
      width: min(95vw, 940px);
      max-height: 90dvh;
      overflow: auto;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel);
      color: var(--text);
    }

    #penvoriaConflictDialog::backdrop {
      background: rgba(0, 0, 0, 0.65);
    }

    .pcr-wrap {
      padding: 20px;
    }

    .pcr-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .pcr-heading h2 {
      margin: 0;
    }

    .pcr-wrap select {
      display: block;
      width: 100%;
      max-width: 300px;
      padding: 9px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      font-size: 16px;
    }

    .pcr-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 16px 0;
    }

    .pcr-columns section {
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .pcr-columns h3 {
      margin: 0 0 10px;
    }

    .pcr-columns pre {
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
    }

    .pcr-warning {
      padding: 10px;
      border: 1px solid #c58a30;
      border-radius: 8px;
    }

    .pcr-check {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 14px 0;
    }

    .pcr-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .pcr-actions button {
      padding: 10px 12px;
    }

    #pcr-message {
      min-height: 1.2em;
    }

    #pcr-message[data-error="true"] {
      color: var(--danger, #d25b58);
    }

    #penvoriaConflictDialog [hidden],
    .cloud-toolbar > button[hidden] {
      display: none !important;
    }

    @media (max-width: 650px) {
      .pcr-columns {
        grid-template-columns: 1fr;
      }

      .pcr-wrap {
        padding: 14px;
      }
    }
  `;

  document.head.appendChild(style);

  /* ==========================================
     UI LOGIC
     ========================================== */

  const el = (id) => dialog.querySelector("#" + id);

  const monthSelect = el("pcr-month");
  const message = el("pcr-message");
  const compare = el("pcr-compare");
  const checkbox = el("pcr-saved");

  const keepCloud = el("pcr-keep-cloud");
  const keepLocal = el("pcr-keep-local");

  let snapshot = null;
  let busy = false;
  let requestId = 0;
  let backupRequested = false;

  function notice(text, error = false) {
    message.textContent = text;
    message.dataset.error = error ? "true" : "false";
  }

  function invalidate() {
    requestId++;

    snapshot = null;
    backupRequested = false;

    checkbox.checked = false;
    checkbox.disabled = true;

    keepCloud.disabled = true;
    keepLocal.disabled = true;

    compare.hidden = true;
  }

  function summary(record) {
    if (!record) {
      return "No month record currently exists in the cloud.";
    }

    return ["income", "needs", "expenses", "savings"]
      .map((type) => {
        const list = Array.isArray(record[type]) ? record[type] : [];

        const total = list.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0,
        );

        return `${type}: ${list.length} entries, ` + `MVR ${total.toFixed(2)}`;
      })
      .join("\n");
  }

  async function loadMonth() {
    invalidate();

    const currentRequest = requestId;

    notice("Reading latest cloud records...");

    try {
      const result = await inspectConflict(monthSelect.value);

      if (requestId !== currentRequest || !dialog.open) {
        return;
      }

      snapshot = result;

      const localSummary = el("pcr-local-summary");
      const cloudSummary = el("pcr-cloud-summary");

      localSummary.textContent = summary(result.localData);

      cloudSummary.textContent = summary(result.cloudData);

      localSummary.style.whiteSpace = "pre-line";
      cloudSummary.style.whiteSpace = "pre-line";

      el("pcr-local-json").textContent = JSON.stringify(
        result.localData,
        null,
        2,
      );

      el("pcr-cloud-json").textContent = JSON.stringify(
        result.cloudData,
        null,
        2,
      );

      compare.hidden = false;

      notice("Compare both versions and save a backup before choosing.");
    } catch (error) {
      if (requestId === currentRequest) {
        notice(error.message, true);
      }
    }
  }

  function updateButtons() {
    const allowed = !!snapshot && checkbox.checked && backupRequested && !busy;

    keepCloud.disabled = !allowed;
    keepLocal.disabled = !allowed;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  async function downloadBackup() {
    if (!snapshot || busy) return;

    const contents = JSON.stringify(
      {
        application: "Penvoria",
        type: "sync-conflict-backup",
        exported_at: new Date().toISOString(),
        snapshot,
      },
      null,
      2,
    );

    const filename =
      `penvoria-conflict-${snapshot.month}-` + `${Date.now()}.json`;

    const blob = new Blob([contents], { type: "application/json" });

    try {
      const isIOS =
        /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      if (
        isIOS &&
        navigator.share &&
        navigator.canShare &&
        typeof File !== "undefined"
      ) {
        const file = new File([blob], filename, { type: blob.type });

        if (
          navigator.canShare({
            files: [file],
          })
        ) {
          await navigator.share({
            files: [file],
            title: "Penvoria conflict backup",
          });
        } else {
          saveBlob(blob, filename);
        }
      } else {
        saveBlob(blob, filename);
      }

      backupRequested = true;
      checkbox.disabled = false;

      notice("Check that the JSON backup was saved and opens correctly.");
    } catch (error) {
      notice("Backup could not be saved: " + error.message, true);
    }
  }

  async function resolve(choice) {
    if (!snapshot || !checkbox.checked || !backupRequested || busy) {
      return;
    }

    const action =
      choice === "local"
        ? "Replace the cloud month with your local version?"
        : "Discard the local draft and keep the cloud version?";

    if (
      !window.confirm(action + "\n\nConfirm that you have saved both versions.")
    ) {
      return;
    }

    busy = true;
    el("pcr-close").disabled = true;
    updateButtons();

    const current = snapshot;

    try {
      await resolveConflict(current, choice);

      if (cloud.user?.id !== current.userId) {
        return;
      }

      invalidate();

      notice("Conflict resolved. Check the sync status before closing.");

      refresh();
    } catch (error) {
      notice(error.message, true);
      invalidate();
    } finally {
      busy = false;
      el("pcr-close").disabled = false;
      updateButtons();
    }
  }

  function refresh() {
    const keys = cloud.ready && cloud.user ? [...cloud.conflicts].sort() : [];

    reviewButton.hidden = keys.length === 0;

    if (!dialog.open) return;

    const previous = monthSelect.value;

    monthSelect.replaceChildren();

    for (const key of keys) {
      const option = document.createElement("option");

      option.value = key;
      option.textContent = key;

      monthSelect.appendChild(option);
    }

    if (keys.includes(previous)) {
      monthSelect.value = previous;
    }

    if (!keys.length) {
      invalidate();

      notice("No unresolved conflicts for this account.");
    }
  }

  /* ==========================================
     EVENT LISTENERS
     ========================================== */

  reviewButton.addEventListener("click", () => {
    dialog.showModal();
    refresh();

    if (monthSelect.value) {
      void loadMonth();
    }
  });

  el("pcr-close").addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", invalidate);

  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });

  monthSelect.addEventListener("change", () => {
    if (!busy) void loadMonth();
  });

  el("pcr-backup").addEventListener("click", () => void downloadBackup());

  checkbox.addEventListener("change", updateButtons);

  keepCloud.addEventListener("click", () => void resolve("cloud"));

  keepLocal.addEventListener("click", () => void resolve("local"));

  // Watch existing status and login changes.
  const status = document.getElementById("cloudStatus");

  if (status) {
    new MutationObserver(refresh).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
  }

  new MutationObserver(refresh).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  refresh();
})();
