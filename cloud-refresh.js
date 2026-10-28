"use strict";

/* Penvoria: pull changes made on another device. */

(() => {
  const cloud = window.penvoriaCloud;
  const status = document.getElementById("cloudStatus");

  if (!cloud || !status) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "cloudRefreshBtn";
  button.className = "mini-btn";
  button.textContent = "Refresh";
  button.setAttribute("aria-label", "Refresh monthly budgets from cloud");

  status.insertAdjacentElement("afterend", button);

  let reading = false;
  let labelTimer = null;
  let lastCheck = 0;

  const sameVersions = (a, b) => {
    const keys = Object.keys(a);

    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => a[key] === b[key])
    );
  };

  function blockReason() {
    if (!navigator.onLine) return "You're offline.";

    if (!cloud.ready || !cloud.user) {
      return "Your account is not ready.";
    }

    if (cloud.recoveryError) {
      return "Resolve the local recovery error first.";
    }

    if (
      cloud.syncing ||
      Object.keys(cloud.drafts).length ||
      cloud.conflicts.size
    ) {
      return "Save or resolve pending changes " + "on this device first.";
    }

    const overlay = document.getElementById("overlay");

    if (overlay && !overlay.classList.contains("hidden")) {
      return "Close the entry form before refreshing.";
    }

    if (document.querySelector("dialog[open], #pr-form")) {
      return "Close the open form or dialog before refreshing.";
    }

    if (document.activeElement?.matches("input, select, textarea")) {
      return "Finish editing the current field before refreshing.";
    }

    return null;
  }

  function showButtonLabel(message) {
    clearTimeout(labelTimer);
    button.textContent = message;

    labelTimer = setTimeout(() => {
      if (!reading) button.textContent = "Refresh";
    }, 2500);
  }

  async function pullMonths(manual = false) {
    if (reading || document.hidden) return;

    const blocked = blockReason();

    if (blocked) {
      if (manual) alert(blocked);
      return;
    }

    const account = cloud.user;
    const accountId = account.id;
    const originalVersions = { ...cloud.versions };

    reading = true;
    lastCheck = Date.now();

    button.disabled = true;
    button.textContent = "Checking...";

    try {
      const { data: rows, error } = await cloud.client
        .from("monthly_budgets")
        .select("month,data,revision")
        .eq("user_id", accountId)
        .order("month", { ascending: true });

      if (error) throw error;

      // Never overwrite a newer local change.
      if (
        cloud.user !== account ||
        blockReason() ||
        !sameVersions(originalVersions, cloud.versions)
      ) {
        showButtonLabel("Try again");
        return;
      }

      const remoteMonths = {};
      const remoteVersions = {};

      for (const row of rows || []) {
        const key = String(row.month).slice(0, 7);

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
          continue;
        }

        remoteMonths[key] = {
          income: Array.isArray(row.data?.income) ? row.data.income : [],
          needs: Array.isArray(row.data?.needs) ? row.data.needs : [],
          expenses: Array.isArray(row.data?.expenses) ? row.data.expenses : [],
          savings: Array.isArray(row.data?.savings) ? row.data.savings : [],
        };

        remoteVersions[key] = row.revision;
      }

      if (!sameVersions(cloud.versions, remoteVersions)) {
        const selectedWasDeleted =
          Object.hasOwn(originalVersions, month) &&
          !Object.hasOwn(remoteVersions, month);

        // Update the local view from Supabase.
        cloud.versions = remoteVersions;
        state.months = remoteMonths;

        // If the selected month was deleted elsewhere,
        // move to another available month.
        if (selectedWasDeleted) {
          month = Object.keys(remoteVersions).sort().at(-1) || todayMonth();
        }

        const scrollArea = document.querySelector(".main");

        const previousScroll = scrollArea?.scrollTop ?? 0;

        render();

        if (scrollArea) {
          scrollArea.scrollTop = previousScroll;
        }

        showButtonLabel("Updated");
      } else if (manual) {
        showButtonLabel("Up to date");
      }
    } catch (error) {
      console.warn("Could not refresh Penvoria budgets:", error);

      if (manual) {
        alert("Could not refresh budgets: " + error.message);
      }

      showButtonLabel("Retry");
    } finally {
      reading = false;
      button.disabled = false;

      if (button.textContent === "Checking...") {
        button.textContent = "Refresh";
      }
    }
  }

  // Manual refresh button.
  button.addEventListener("click", () => {
    void pullMonths(true);
  });

  // Automatically check when returning to the app.
  function refreshOnReturn() {
    if (!document.hidden) {
      void pullMonths(false);
    }
  }

  document.addEventListener("visibilitychange", refreshOnReturn);

  window.addEventListener("focus", refreshOnReturn);
  window.addEventListener("online", refreshOnReturn);

  // Check for changes every 30 seconds while open.
  setInterval(() => {
    if (!document.hidden && Date.now() - lastCheck > 30000) {
      void pullMonths(false);
    }
  }, 30000);
})();
