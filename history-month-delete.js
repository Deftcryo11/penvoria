"use strict";

/*
  Penvoria — revision-safe deletion
  of a full monthly budget from History.
*/

(() => {
  const root = document.getElementById("app");
  const cloud = window.penvoriaCloud;

  if (!root || !cloud) return;

  let selectedKey = null;
  let selectedUser = null;
  let localSnapshot = null;
  let backupStarted = false;
  let busy = false;

  /* ======================================
     CONFIRMATION DIALOG
     ====================================== */

  const dialog = document.createElement("dialog");

  dialog.id = "monthDeleteDialog";
  dialog.setAttribute("aria-labelledby", "md-title");

  dialog.innerHTML = `
    <div class="md-content">
      <h2 id="md-title">Delete monthly budget</h2>

      <p id="md-month"></p>

      <p>
        This permanently deletes all income,
        needs, spending and savings recorded
        for this month. Recurring templates
        are kept.
      </p>

      <p>
        <strong>Save a backup before continuing.</strong>
        The JSON file contains readable financial
        information. Keep it somewhere private.
      </p>

      <button
        type="button"
        class="secondary"
        id="md-backup"
      >
        Save month backup (JSON)
      </button>

      <label class="md-confirm">
        <input
          type="checkbox"
          id="md-confirm"
          disabled
        >

        I saved and checked the backup,
        and understand the month will be deleted.
      </label>

      <p
        id="md-status"
        role="status"
        aria-live="polite"
      ></p>

      <div class="md-actions">
        <button
          type="button"
          class="secondary"
          id="md-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          id="md-delete"
          disabled
        >
          Delete month permanently
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  /* ======================================
     STYLES
     ====================================== */

  const css = document.createElement("style");

  css.textContent = `
    #monthDeleteDialog {
      width: min(92vw, 470px);
      max-height: 85dvh;
      overflow: auto;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel);
      color: var(--text);
    }

    #monthDeleteDialog::backdrop {
      background: #0009;
    }

    #monthDeleteDialog .md-content {
      padding: 20px;
    }

    #monthDeleteDialog .md-confirm {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 16px 0;
    }

    #monthDeleteDialog .md-confirm input {
      flex: none;
      margin-top: 4px;
    }

    #monthDeleteDialog .md-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    #monthDeleteDialog .md-actions button {
      min-height: 42px;
      padding: 9px 12px;
    }

    #md-delete:not(:disabled) {
      background: var(--danger, #c44);
      color: white;
      border: 0;
      border-radius: 8px;
    }

    #md-status {
      overflow-wrap: anywhere;
    }

    .history-row [data-delete-month] {
      margin-left: 8px;
      color: var(--danger, #c44);
    }
  `;

  document.head.appendChild(css);

  const $d = (selector) => dialog.querySelector(selector);

  const checkbox = $d("#md-confirm");
  const deleteButton = $d("#md-delete");
  const backupButton = $d("#md-backup");
  const cancelButton = $d("#md-cancel");
  const status = $d("#md-status");

  /* ======================================
     CLOUD SAFETY CHECK
     ====================================== */

  function assertSafe(key) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || !state.months[key]) {
      throw new Error("The selected month is no longer available.");
    }

    if (
      !cloud.ready ||
      !cloud.user ||
      !navigator.onLine ||
      cloud.recoveryError
    ) {
      throw new Error("Sign in and reconnect before deleting a month.");
    }

    if (
      cloud.syncing ||
      cloud.conflicts.size ||
      Object.keys(cloud.drafts).length
    ) {
      throw new Error(
        "Save or resolve all pending cloud changes " +
          "before deleting a month.",
      );
    }
  }

  function refreshButtons() {
    deleteButton.disabled = busy || !backupStarted || !checkbox.checked;

    backupButton.disabled = busy;
    cancelButton.disabled = busy;
  }

  function beginDelete(key) {
    try {
      assertSafe(key);

      selectedKey = key;
      selectedUser = cloud.user.id;
      localSnapshot = JSON.stringify(state.months[key]);

      backupStarted = false;
      busy = false;

      checkbox.checked = false;
      checkbox.disabled = true;

      status.textContent = "";

      $d("#md-month").textContent = `Month: ${monthLabel(key)}`;

      refreshButtons();
      dialog.showModal();
    } catch (error) {
      alert(error.message);
    }
  }

  /* ======================================
     DOWNLOAD SINGLE-MONTH BACKUP
     ====================================== */

  function downloadViaLink(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function downloadBackup() {
    if (busy || !selectedKey) return;

    const filename = `penvoria-${selectedKey}-before-delete.json`;

    const contents = JSON.stringify(
      {
        application: "Penvoria",
        type: "month-deletion-backup",
        exported_at: new Date().toISOString(),
        month: selectedKey,
        data: JSON.parse(localSnapshot),
      },
      null,
      2,
    );

    const blob = new Blob([contents], { type: "application/json" });

    try {
      if (
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
            title: "Penvoria month backup",
          });
        } else {
          downloadViaLink(blob, filename);
        }
      } else {
        downloadViaLink(blob, filename);
      }

      backupStarted = true;
      checkbox.disabled = false;

      status.textContent =
        "Check the saved JSON file, then " + "tick the confirmation box.";
    } catch (error) {
      status.textContent = "Backup was not completed: " + error.message;
    }

    refreshButtons();
  }

  /* ======================================
     REVISION-CHECKED CLOUD DELETE
     ====================================== */

  async function permanentlyDelete() {
    if (busy || !checkbox.checked || !backupStarted || !selectedKey) {
      return;
    }

    const key = selectedKey;
    const accountId = selectedUser;

    if (
      !confirm(
        `Permanently delete ${monthLabel(key)}?\n\n` +
          "This cannot be undone in Penvoria.",
      )
    ) {
      return;
    }

    busy = true;
    refreshButtons();

    status.textContent = "Checking the cloud revision...";

    try {
      await cloud.pending;

      assertSafe(key);

      if (
        cloud.user.id !== accountId ||
        JSON.stringify(state.months[key]) !== localSnapshot
      ) {
        throw new Error(
          "This account or month's data changed. " +
            "Cancel and review it again.",
        );
      }

      const expectedRevision = cloud.versions[key] ?? null;

      const { data: remote, error: readError } = await cloud.client
        .from("monthly_budgets")
        .select("revision")
        .eq("user_id", accountId)
        .eq("month", `${key}-01`)
        .maybeSingle();

      if (readError) throw readError;

      assertSafe(key);

      if (
        cloud.user.id !== accountId ||
        JSON.stringify(state.months[key]) !== localSnapshot
      ) {
        throw new Error(
          "This account or month's data changed. " +
            "Cancel and review it again.",
        );
      }

      // Reject stale data from another device.
      if ((remote?.revision ?? null) !== expectedRevision) {
        throw new Error(
          "This month changed on another device. " +
            "Reload and review it before deleting.",
        );
      }

      if (remote) {
        status.textContent = "Deleting the selected month from Supabase...";

        const { data: removed, error: deleteError } = await cloud.client
          .from("monthly_budgets")
          .delete()
          .eq("user_id", accountId)
          .eq("month", `${key}-01`)
          .eq("revision", expectedRevision)
          .select("revision");

        if (deleteError) throw deleteError;

        if (!removed || removed.length !== 1) {
          throw new Error(
            "Deletion was not confirmed. The record " +
              "may have changed, or Supabase may need " +
              "a DELETE policy.",
          );
        }
      }

      // Never discard edits made during the request.
      if (
        !cloud.ready ||
        cloud.user?.id !== accountId ||
        cloud.drafts[key] ||
        cloud.conflicts.has(key)
      ) {
        throw new Error(
          "Cloud deletion may have completed, but " +
            "the account or local edits changed. " +
            "Reopen the account to reconcile.",
        );
      }

      delete state.months[key];
      delete cloud.versions[key];

      if (month === key) {
        month = todayMonth();
      }

      dialog.close();
      render();

      alert(
        `${monthLabel(key)} was deleted. ` +
          "Keep your JSON backup for your records.",
      );
    } catch (error) {
      status.textContent = error.message || String(error);
    } finally {
      busy = false;
      refreshButtons();
    }
  }

  /* ======================================
     ADD DELETE BUTTON TO HISTORY
     ====================================== */

  const previousRender = render;

  render = function (...args) {
    const result = previousRender(...args);

    if (view === "history") {
      root
        .querySelectorAll(".history-row button[data-month]")
        .forEach((open) => {
          const key = open.dataset.month;

          if (open.parentElement.querySelector("[data-delete-month]")) {
            return;
          }

          const button = document.createElement("button");

          button.type = "button";
          button.className = "mini-btn";
          button.dataset.deleteMonth = key;
          button.textContent = "Delete month";

          open.insertAdjacentElement("afterend", button);
        });

      if (!root.querySelector(".history-row")) {
        root
          .querySelector(".history-list")
          ?.insertAdjacentHTML(
            "beforeend",
            '<div class="empty">No saved months to display.</div>',
          );
      }
    }

    return result;
  };

  /* ======================================
     EVENTS
     ====================================== */

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete-month]");

    if (button) {
      beginDelete(button.dataset.deleteMonth);
    }
  });

  backupButton.addEventListener("click", () => void downloadBackup());

  checkbox.addEventListener("change", refreshButtons);

  deleteButton.addEventListener("click", () => void permanentlyDelete());

  cancelButton.addEventListener("click", () => dialog.close());

  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
})();
