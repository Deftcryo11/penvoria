"use strict";

/*
  Penvoria v1.1
  PWA update controls and offline status
*/

(() => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const style = document.createElement("style");

  style.textContent = `
    #pwaNotices {
      position: fixed;
      z-index: 10050;
      top: calc(env(safe-area-inset-top, 0px) + 10px);
      left: 12px;
      right: 12px;
      max-width: 660px;
      margin: auto;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }

    #pwaNotices > div {
      pointer-events: auto;
      background: var(--panel, #fff);
      color: var(--text, #172b35);
      border: 1px solid var(--border, #cdd5db);
      border-radius: 12px;
      box-shadow: 0 10px 28px #0003;
      padding: 12px 14px;
      font-size: 13px;
    }

    #pwaNotices > div[hidden] {
      display: none !important;
    }

    .pwa-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 9px;
    }

    .pwa-actions button {
      min-height: 36px;
      padding: 7px 12px;
    }

    #pwaNoticeMessage {
      margin: 6px 0 0;
    }
  `;

  document.head.appendChild(style);

  const notices = document.createElement("div");

  notices.id = "pwaNotices";
  notices.setAttribute("aria-live", "polite");

  notices.innerHTML = `
    <div
      id="pwaOffline"
      role="status"
      hidden
    ></div>

    <div
      id="pwaUpdate"
      role="status"
      hidden
    >
      <strong>
        Penvoria update available
      </strong>

      <div class="pwa-actions">
        <button
          id="pwaApply"
          type="button"
          class="primary"
        >
          Update now
        </button>

        <button
          id="pwaLater"
          type="button"
          class="secondary"
        >
          Later
        </button>
      </div>

      <p
        id="pwaNoticeMessage"
        role="status"
      ></p>
    </div>
  `;

  document.body.appendChild(notices);

  const offlineBox = notices.querySelector("#pwaOffline");

  const updateBox = notices.querySelector("#pwaUpdate");

  const message = notices.querySelector("#pwaNoticeMessage");

  const applyButton = notices.querySelector("#pwaApply");

  let registration = null;
  let userApprovedUpdate = false;
  let reloading = false;

  /* ==========================================
     CONNECTION STATUS
     ========================================== */

  function showConnection() {
    if (navigator.onLine) {
      offlineBox.hidden = true;
      return;
    }

    const drafts = window.penvoriaCloud?.drafts || {};

    const count = Object.keys(drafts).length;

    offlineBox.textContent = count
      ? `Offline — ${count} month(s) awaiting sync. ` +
        "Keep this page open and reconnect."
      : "Offline — cloud access is unavailable. " + "Reconnect to continue.";

    offlineBox.hidden = false;
  }

  /* ==========================================
     NEW VERSION DETECTION
     ========================================== */

  function updateAvailable() {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      updateBox.hidden = false;
    }
  }

  /* ==========================================
     FINANCIAL SAFETY CHECK
     ========================================== */

  function updateBlocker() {
    if (!navigator.onLine) {
      return "Reconnect before updating.";
    }

    const cloud = window.penvoriaCloud;

    if (document.body.classList.contains("auth-pending")) {
      return "Account loading is still in progress.";
    }

    if (!cloud) {
      return "Financial sync has not initialized.";
    }

    if (cloud.recoveryError) {
      return "Local recovery needs attention " + "before updating.";
    }

    if (cloud.conflicts?.size) {
      return "Resolve sync conflicts before updating.";
    }

    if (cloud.syncing || Object.keys(cloud.drafts || {}).length) {
      return (
        "Unsynced financial changes remain. " + "Wait for 'All changes saved'."
      );
    }

    if (cloud.user && !cloud.ready) {
      return "Wait until your account has loaded.";
    }

    const modal = document.getElementById("overlay");

    if (modal && !modal.classList.contains("hidden")) {
      return "Finish or close the entry form " + "before updating.";
    }

    const recurringEditor = document.getElementById("pr-form");

    if (recurringEditor && !recurringEditor.hidden) {
      return (
        "Finish or close the recurring " + "template form before updating."
      );
    }

    return null;
  }

  /* ==========================================
     APPLY NEW VERSION
     ========================================== */

  async function applyUpdate() {
    if (!registration?.waiting) return;

    applyButton.disabled = true;

    message.textContent = "Checking financial changes before updating...";

    try {
      const cloud = window.penvoriaCloud;

      if (
        cloud?.ready &&
        Object.keys(cloud.drafts || {}).length &&
        typeof flushCloudQueue === "function"
      ) {
        await flushCloudQueue();
      }

      if (cloud?.pending) {
        await cloud.pending;
      }

      const blocker = updateBlocker();

      if (blocker) {
        message.textContent = blocker;
        return;
      }

      if (!registration.waiting) {
        message.textContent =
          "The update is no longer waiting. " + "Reopen Penvoria to check.";

        return;
      }

      userApprovedUpdate = true;

      message.textContent = "Installing the update...";

      registration.waiting.postMessage({
        type: "PENVORIA_APPLY_UPDATE",
      });
    } catch (error) {
      message.textContent =
        "Update paused: " + (error.message || String(error));
    } finally {
      applyButton.disabled = false;
    }
  }

  notices
    .querySelector("#pwaApply")
    .addEventListener("click", () => void applyUpdate());

  notices.querySelector("#pwaLater").addEventListener("click", () => {
    updateBox.hidden = true;
  });

  /* ==========================================
     NETWORK EVENTS
     ========================================== */

  window.addEventListener("offline", showConnection);

  window.addEventListener("online", () => {
    showConnection();

    if (registration) {
      void registration.update().catch(console.warn);
    }
  });

  const cloudStatus = document.getElementById("cloudStatus");

  if (cloudStatus) {
    new MutationObserver(showConnection).observe(cloudStatus, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  showConnection();

  /* ==========================================
     RELOAD ONLY AFTER USER APPROVAL
     ========================================== */

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (userApprovedUpdate && !reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  /* ==========================================
     REGISTER SERVICE WORKER
     ========================================== */

  async function start() {
    try {
      registration = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none",
      });

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;

        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            updateAvailable();
          }
        });
      });

      updateAvailable();

      await registration.update();

      updateAvailable();
    } catch (error) {
      console.warn("Penvoria PWA updates unavailable:", error);
    }
  }

  // Check when returning to the app.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && registration && navigator.onLine) {
      void registration.update().then(updateAvailable).catch(console.warn);
    }
  });

  void start();
})();
