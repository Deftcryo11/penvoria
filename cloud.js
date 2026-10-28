"use strict";

/* ==========================================
   PENVORIA - SUPABASE CLOUD INTEGRATION
   Reliable synchronization and recovery
   ========================================== */

const config = window.PENVORIA_CONFIG;

const cloud = {
  client: null,
  user: null,
  ready: false,
  pending: Promise.resolve(),
  syncing: false,
  failed: false,
  recoveryError: false,
  versions: {},
  drafts: {},
  conflicts: new Set(),
  retryTimer: null,
  retryCount: 0,
};

window.penvoriaCloud = cloud;

let authMode = "login";
let loadingAccount = false;
let authEpoch = 0;

/* ==========================================
   ONE ACTIVE EDITING TAB PER ACCOUNT
   ========================================== */

let editLockUser = null;
let editLockRelease = null;

function releaseAccountEditLock() {
  const release = editLockRelease;

  editLockRelease = null;
  editLockUser = null;

  if (release) release();
}

async function acquireAccountEditLock(userId) {
  if (
    editLockUser === userId &&
    editLockRelease
  ) {
    return true;
  }

  if (!navigator.locks?.request) {
    throw new Error(
      "Single-tab protection requires HTTPS " +
      "or localhost and Web Locks support."
    );
  }

  let resolveAcquired;
  let reported = false;

  const acquired = new Promise((resolve) => {
    resolveAcquired = (success) => {
      if (!reported) {
        reported = true;
        resolve(success);
      }
    };
  });

  // Hold the lock until logout or tab closure.
  // Do not await its entire lifetime.
  const lifetime = navigator.locks.request(
    "penvoria-editor:" + userId,
    { ifAvailable: true },

    async (lock) => {
      if (!lock) {
        resolveAcquired(false);
        return;
      }

      await new Promise((release) => {
        editLockUser = userId;
        editLockRelease = release;
        resolveAcquired(true);
      });
    }
  );

  void lifetime.catch((error) => {
    console.error(
      "Penvoria editing lock failed:",
      error
    );

    resolveAcquired(false);

    if (editLockUser === userId) {
      // Fail closed if the lock is lost.
      editLockUser = null;
      editLockRelease = null;
      cloud.ready = false;

      document.body.classList.remove(
        "authenticated"
      );

      document.body.classList.add(
        "auth-locked"
      );

      authScreen.hidden = false;
      authForm.hidden = true;
      hideStartupScreen();

      setAuthMessage(
        "Editing lock lost. Preserve this tab " +
        "and export a backup before restarting.",
        true
      );
    }
  });

  return acquired;
}


const authScreen = document.querySelector("#authScreen");
const startupScreen = document.querySelector("#startupScreen");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authSubmit = document.querySelector("#authSubmit");
const cloudStatus = document.querySelector("#cloudStatus");

/* ==========================================
   1. STATUS & SCREEN MANAGEMENT
   ========================================== */

function setCloudStatus(message, error = false) {
  cloudStatus.textContent = message;
  cloudStatus.classList.toggle("sync-error", error);
}

function setAuthMessage(message, error = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("auth-error", error);
}

function hideStartupScreen() {
  if (startupScreen) {
    startupScreen.hidden = true;
  }
}

function clearRetryTimer() {
  if (cloud.retryTimer !== null) {
    clearTimeout(cloud.retryTimer);
    cloud.retryTimer = null;
  }
}

function clearCloudMemory() {
  clearRetryTimer();

  cloud.ready = false;
  cloud.user = null;
  cloud.failed = false;
  cloud.recoveryError = false;

  cloud.versions = {};
  cloud.drafts = {};
  cloud.conflicts = new Set();
  cloud.retryCount = 0;
}

function showLogin() {
  authEpoch += 1;
  releaseAccountEditLock();
  clearCloudMemory();

  // Do not expose another account's budgets.
  state = { months: {} };

  document.body.classList.remove("authenticated", "auth-pending");

  document.body.classList.add("auth-locked");

  authScreen.hidden = false;
  authForm.hidden = false;

  setAuthMessage("");
  hideStartupScreen();
}

function showDashboard() {
  authScreen.hidden = true;

  document.body.classList.remove("auth-pending", "auth-locked");

  document.body.classList.add("authenticated");

  hideStartupScreen();
}

/* ==========================================
   2. MONTHLY DATA HELPERS
   ========================================== */

function normalizeMonth(value) {
  return {
    income: Array.isArray(value?.income) ? value.income : [],

    needs: Array.isArray(value?.needs) ? value.needs : [],

    expenses: Array.isArray(value?.expenses) ? value.expenses : [],

    savings: Array.isArray(value?.savings) ? value.savings : [],
  };
}

function validMonth(key) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

/* ==========================================
   3. LOCAL RECOVERY FOR UNSAVED CHANGES
   ========================================== */

// Each user has a separate pending-save area.
// Only unsynced changes are stored here.
//
// WARNING:
// Pending financial data is stored in readable
// browser storage until successfully synced.

function draftStorageKey(userId) {
  return `penvoria-unsynced-v2:${userId}`;
}

function storeDrafts() {
  if (!cloud.user) return false;

  // Do not overwrite an unreadable recovery record.
  if (cloud.recoveryError) return false;

  try {
    const key = draftStorageKey(cloud.user.id);

    if (Object.keys(cloud.drafts).length) {
      localStorage.setItem(key, JSON.stringify(cloud.drafts));
    } else {
      // Remove temporary records after syncing.
      localStorage.removeItem(key);
    }

    return true;
  } catch (error) {
    console.error("Could not save local recovery draft:", error);

    setCloudStatus("Local backup failed — export a backup now", true);

    return false;
  }
}

function restoreDrafts(userId, serverMonths) {
  cloud.recoveryError = false;
  cloud.drafts = {};
  cloud.conflicts.clear();

  try {
    const stored = JSON.parse(
      localStorage.getItem(draftStorageKey(userId)) || "{}",
    );

    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return;
    }

    for (const [key, draft] of Object.entries(stored)) {
      if (!validMonth(key) || !draft || !draft.data) {
        continue;
      }

      const baseRevision = draft.baseRevision || null;

      cloud.drafts[key] = {
        data: normalizeMonth(draft.data),
        baseRevision,
        token: draft.token || crypto.randomUUID(),
      };

      // Recover locally unsaved edits.
      serverMonths[key] = cloud.drafts[key].data;

      // Detect changes made by another device.
      if ((cloud.versions[key] || null) !== baseRevision) {
        cloud.conflicts.add(key);
      }
    }
  } catch (error) {
    console.error("Could not restore pending changes:", error);

    cloud.recoveryError = true;
    setCloudStatus("Local recovery error ? do not clear browser data", true);
  }
}

/* ==========================================
   4. SYNCHRONIZATION STATUS
   ========================================== */

function updateSyncStatus() {
  const count = Object.keys(cloud.drafts).length;

  if (cloud.recoveryError) {
    setCloudStatus(
      "Local recovery error ? do not clear browser data",
      true
    );
    return;
  }

  if (cloud.conflicts.size) {
    setCloudStatus(
      `Sync conflict (${cloud.conflicts.size} month(s)) — export backup`,
      true,
    );
  } else if (count === 0) {
    cloud.failed = false;
    setCloudStatus("All changes saved");
  } else if (!navigator.onLine) {
    setCloudStatus(`${count} unsynced month(s) — offline`, true);
  } else if (cloud.syncing) {
    setCloudStatus(`Saving ${count} month(s)...`);
  } else {
    setCloudStatus(`${count} month(s) waiting to sync`, cloud.failed);
  }
}

/* ==========================================
   5. SAFE SUPABASE WRITES
   ========================================== */

// The database creates a new revision whenever
// a monthly budget is updated.
//
// Only update when the existing revision matches
// the version previously loaded by this device.

async function writeMonth(monthKey, draft, userId) {
  const update = {
    data: draft.data,
  };

  // This month does not exist in the cloud yet.
  if (draft.baseRevision === null) {
    const { data: row, error } = await cloud.client
      .from("monthly_budgets")
      .insert({
        user_id: userId,
        month: `${monthKey}-01`,
        ...update,
      })
      .select("revision")
      .single();

    // Another device created this month first.
    if (error?.code === "23505") {
      return { conflict: true };
    }

    if (error) throw error;

    return {
      revision: row.revision,
    };
  }

  // Existing month: save only if it is unchanged.
  const { data: row, error } = await cloud.client
    .from("monthly_budgets")
    .update(update)
    .eq("user_id", userId)
    .eq("month", `${monthKey}-01`)
    .eq("revision", draft.baseRevision)
    .select("revision")
    .maybeSingle();

  if (error) throw error;

  // No matching revision means the record changed
  // since we last loaded it.
  if (!row) {
    return { conflict: true };
  }

  return {
    revision: row.revision,
  };
}

/* ==========================================
   6. AUTOMATIC RETRY
   ========================================== */

function scheduleRetry() {
  if (cloud.retryTimer !== null || !cloud.ready) {
    return;
  }

  // Exponential retry delay, capped at 30 seconds.
  const seconds = Math.min(30, 2 ** Math.min(++cloud.retryCount, 5));

  cloud.retryTimer = setTimeout(() => {
    cloud.retryTimer = null;

    void flushCloudQueue();
  }, seconds * 1000);
}

/* ==========================================
   7. CLOUD SAVE QUEUE
   ========================================== */

function flushCloudQueue() {
  if (cloud.recoveryError) {
    updateSyncStatus();
    return cloud.pending;
  }

  if (!cloud.ready || !cloud.user || cloud.syncing) {
    return cloud.pending;
  }

  if (!navigator.onLine) {
    updateSyncStatus();
    return cloud.pending;
  }

  cloud.syncing = true;

  const userId = cloud.user.id;

  clearRetryTimer();
  updateSyncStatus();

  cloud.pending = (async () => {
    try {
      while (cloud.ready && cloud.user?.id === userId) {
        const next = Object.entries(cloud.drafts).find(([key]) => {
          return !cloud.conflicts.has(key);
        });

        if (!next) break;

        const [key, draft] = next;

        try {
          const result = await writeMonth(key, draft, userId);

          if (cloud.user?.id !== userId) {
            break;
          }

          if (result.conflict) {
            cloud.conflicts.add(key);
            cloud.failed = true;

            console.warn(`Penvoria sync conflict for ${key}`);

            // Preserve the local changes.
            // Never overwrite the newer cloud version.
            continue;
          }

          cloud.versions[key] = result.revision;

          const latest = cloud.drafts[key];

          if (latest?.token === draft.token) {
            // This edit has finished syncing.
            delete cloud.drafts[key];
          } else if (latest) {
            // A newer local edit happened during
            // the previous network request.
            latest.baseRevision = result.revision;
          }

          storeDrafts();

          cloud.retryCount = 0;
        } catch (error) {
          cloud.failed = true;

          console.error("Penvoria sync failed:", error);

          // Keep the unsynced snapshot for retry.
          scheduleRetry();

          break;
        }
      }
    } finally {
      cloud.syncing = false;
      updateSyncStatus();

      if (
        cloud.ready &&
        cloud.user?.id !== userId &&
        navigator.onLine &&
        Object.keys(cloud.drafts).some(
          (key) => !cloud.conflicts.has(key)
        )
      ) {
        void flushCloudQueue();
      }
    }
  })();

  return cloud.pending;
}

// Called by the existing save() in app.js.

cloud.queueSave = function (monthKey, record) {
  if (!cloud.ready || !cloud.user || !validMonth(monthKey)) {
    return;
  }

  const existing = cloud.drafts[monthKey];

  cloud.drafts[monthKey] = {
    data: JSON.parse(JSON.stringify(normalizeMonth(record))),

    // Preserve the original revision while
    // changes are still pending.
    baseRevision: existing
      ? existing.baseRevision
      : cloud.versions[monthKey] || null,

    token: crypto.randomUUID(),
  };

  // Preserve a copy before starting the request.
  const protectedLocally = storeDrafts();

  if (!protectedLocally) {
    alert(
      "This device could not preserve the pending change. " +
        "Export a backup before closing Penvoria.",
    );
  }

  updateSyncStatus();

  void flushCloudQueue();
};

/* ==========================================
   8. LOAD USER'S CLOUD BUDGETS
   ========================================== */

async function loadAccount() {
  if (loadingAccount) return;

  const thisLoadEpoch = authEpoch;
  loadingAccount = true;
  cloud.ready = false;

  try {
    setCloudStatus("Loading cloud budgets...");

    const { data: userData, error: userError } =
      await cloud.client.auth.getUser();

    if (userError) throw userError;
    if (thisLoadEpoch !== authEpoch) return;

    if (!userData.user) {
      showLogin();
      return;
    }

    const account = userData.user;

    // Protect shared pending financial records.
    const hasEditLock =
      await acquireAccountEditLock(account.id);

    if (thisLoadEpoch !== authEpoch) {
      if (hasEditLock) releaseAccountEditLock();
      return;
    }

    if (!hasEditLock) {
      cloud.ready = false;
      cloud.user = null;
      state = { months: {} };

      document.body.classList.remove(
        "authenticated",
        "auth-pending"
      );

      document.body.classList.add(
        "auth-locked"
      );

      authScreen.hidden = false;
      authForm.hidden = true;

      document.querySelector(
        "#authHeading"
      ).textContent =
        "Penvoria is open in another tab";

      document.querySelector(
        "#authSubtitle"
      ).textContent =
        "Close the other Penvoria tab or window, then reload this one.";

      setAuthMessage(
        "Only one tab can edit this account at a time.",
        true
      );

      setCloudStatus(
        "Another tab is editing ? this tab is locked",
        true
      );

      hideStartupScreen();
      return;
    }

    cloud.user = account;

    const { data: rows, error } = await cloud.client
      .from("monthly_budgets")
      .select("month,data,revision")
      .eq("user_id", account.id)
      .order("month", { ascending: true });

    if (error) throw error;
    if (thisLoadEpoch !== authEpoch) return;

    const months = {};

    cloud.versions = {};

    for (const row of rows || []) {
      const key = row.month.slice(0, 7);

      if (!validMonth(key)) continue;

      months[key] = normalizeMonth(row.data);

      cloud.versions[key] = row.revision;
    }

    // Recover changes saved locally during
    // a previous interrupted session.
    restoreDrafts(account.id, months);

    state = {
      months,
    };

    showDashboard();

    // render() only updates the interface.
    render();

    cloud.ready = true;
    cloud.failed = false;

    updateSyncStatus();

    // Retry any recovered unsynced months.
    void flushCloudQueue();
  } catch (error) {
    releaseAccountEditLock();
    console.error("Cloud loading failed:", error);

    cloud.ready = false;

    document.body.classList.remove("authenticated", "auth-pending");

    document.body.classList.add("auth-locked");

    authScreen.hidden = false;
    hideStartupScreen();

    setAuthMessage("Could not load budgets. " + error.message, true);

    setCloudStatus("Cloud connection failed", true);
  } finally {
    loadingAccount = false;
  }
}

/* ==========================================
   9. AUTHENTICATION
   ========================================== */

function setAuthMode(mode) {
  authMode = mode;

  const signup = mode === "signup";

  document.querySelector("#authHeading").textContent = signup
    ? "Create your account"
    : "Welcome back";

  document.querySelector("#authSubtitle").textContent = signup
    ? "Create an account to save your monthly budgets."
    : "Sign in to access your finances.";

  document.querySelector("#authSwitchText").textContent = signup
    ? "Already have an account?"
    : "Don't have an account?";

  document.querySelector("#authSwitch").textContent = signup
    ? "Sign in"
    : "Create account";

  authSubmit.textContent = signup ? "Create account" : "Sign in";

  document.querySelector("#authPassword").autocomplete = signup
    ? "new-password"
    : "current-password";

  setAuthMessage("");
}

document.querySelector("#authSwitch").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cloud.client?.auth) {
    setAuthMessage("Supabase is not connected. Refresh the page.", true);
    return;
  }

  const email = document.querySelector("#authEmail").value.trim();

  const password = document.querySelector("#authPassword").value;

  authSubmit.disabled = true;

  setAuthMessage("Please wait...");

  try {
    if (authMode === "signup") {
      const { data: result, error } = await cloud.client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });

      if (error) throw error;

      if (result.session) {
        await loadAccount();
      } else {
        setAuthMessage(
          "Check your email for the confirmation link, then sign in.",
        );
      }
    } else {
      const { error } = await cloud.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      await loadAccount();
    }
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    authSubmit.disabled = false;
  }
});

/* ==========================================
   10. SAFE LOGOUT
   ========================================== */

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  if (!cloud.user) return;

  // Never discard unsynced edits during logout.
  if (Object.keys(cloud.drafts).length) {
    await flushCloudQueue();

    if (Object.keys(cloud.drafts).length) {
      alert(
        "Unsynced changes remain. " +
          "Connect to the internet or resolve the conflict " +
          "before logging out. " +
          "You can export a backup now.",
      );

      return;
    }
  }

  await cloud.pending;

  const { error } = await cloud.client.auth.signOut();

  if (error) {
    alert(error.message);
    return;
  }

  showLogin();
});

/* ==========================================
   11. CONNECTION & APP VISIBILITY
   ========================================== */

// Retry when internet returns.
window.addEventListener("online", () => {
  if (cloud.ready) {
    void flushCloudQueue();
  }
});

// Display offline status.
window.addEventListener("offline", updateSyncStatus);

// Retry when returning to the iPhone app.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && cloud.ready) {
    void flushCloudQueue();
  }
});

/* ==========================================
   12. INITIALIZE SUPABASE
   ========================================== */

async function initializeCloud() {
  document.body.classList.add("auth-pending");

  authScreen.hidden = true;
  authSubmit.disabled = true;

  if (startupScreen) {
    startupScreen.hidden = false;
  }

  try {
    if (
      !config?.url ||
      !config?.publishableKey ||
      config.url.includes("YOUR_PROJECT_ID") ||
      config.publishableKey.includes("YOUR_SUPABASE")
    ) {
      throw new Error(
        "Set your Supabase URL and publishable key in config.js.",
      );
    }

    if (typeof window.supabase?.createClient !== "function") {
      throw new Error("Supabase library could not load.");
    }

    cloud.client = window.supabase.createClient(
      config.url,
      config.publishableKey,
    );

    if (!cloud.client?.auth) {
      throw new Error("Supabase authentication failed.");
    }

    cloud.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const hadDrafts =
          Object.keys(cloud.drafts).length > 0;

        showLogin();

        if (hadDrafts) {
          setAuthMessage(
            "Signed out. Sign back in to recover pending changes saved on this device.",
            true
          );
        }
      } else if (
        event === "SIGNED_IN" &&
        cloud.user?.id &&
        session?.user?.id &&
        cloud.user.id !== session.user.id
      ) {
        showLogin();

        setAuthMessage(
          "Account changed in another tab. Refresh to load its budgets.",
          true
        );
      }
    });

    const { data, error } = await cloud.client.auth.getSession();

    if (error) throw error;

    authSubmit.disabled = false;

    if (data.session) {
      await loadAccount();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error("Startup error:", error);

    cloud.ready = false;

    document.body.classList.remove("auth-pending");

    document.body.classList.add("auth-locked");

    authScreen.hidden = false;
    hideStartupScreen();

    authSubmit.disabled = !cloud.client?.auth;

    setAuthMessage(error.message, true);
  }
}

void initializeCloud();
