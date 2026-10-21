"use strict";

/* ==========================================
   PENVORIA - SUPABASE CLOUD INTEGRATION
   ========================================== */

const config = window.PENVORIA_CONFIG;

const cloud = {
  client: null,
  user: null,
  ready: false,
  pending: Promise.resolve(),
  failed: false,
};

window.penvoriaCloud = cloud;

let authMode = "login";
let loadingAccount = false;

const authScreen = document.querySelector("#authScreen");
const startupScreen = document.querySelector("#startupScreen");

function hideStartupScreen() {
  if (startupScreen) {
    startupScreen.hidden = true;
  }
}
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authSubmit = document.querySelector("#authSubmit");
const cloudStatus = document.querySelector("#cloudStatus");
const importButton = {
  hidden: true,
  disabled: true,
  textContent: "",
};

function setCloudStatus(message, error = false) {
  cloudStatus.textContent = message;
  cloudStatus.classList.toggle("sync-error", error);
}

function setAuthMessage(message, error = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("auth-error", error);
}

function showLogin() {
  cloud.ready = false;
  cloud.user = null;

  // Never leave another account's budgets in memory.
  state = { months: {} };

  document.body.classList.remove("authenticated");
  document.body.classList.remove("auth-pending");
  document.body.classList.add("auth-locked");

  authScreen.hidden = false;
  importButton.hidden = true;
  setAuthMessage("");

  hideStartupScreen();
}

function showDashboard() {
  authScreen.hidden = true;

  document.body.classList.remove("auth-pending");
  document.body.classList.remove("auth-locked");
  document.body.classList.add("authenticated");

  hideStartupScreen();
}

function emptyMonth() {
  return {
    income: [],
    needs: [],
    expenses: [],
    savings: [],
  };
}

function validMonth(key) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

function normalizeMonth(value) {
  return {
    ...emptyMonth(),
    ...(value && typeof value === "object" ? value : {}),
    income: Array.isArray(value?.income) ? value.income : [],
    needs: Array.isArray(value?.needs) ? value.needs : [],
    expenses: Array.isArray(value?.expenses) ? value.expenses : [],
    savings: Array.isArray(value?.savings) ? value.savings : [],
  };
}

function localBackup() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");

    if (saved && saved.months) {
      return Object.fromEntries(
        Object.entries(saved.months).filter(([key]) => validMonth(key)),
      );
    }
  } catch (error) {
    console.warn("Unable to read local backup.", error);
  }

  return {};
}

function updateImportButton() {
  const localMonths = localBackup();
  const cloudMonths = state.months;

  const missing = Object.keys(localMonths).filter(
    (key) => !Object.hasOwn(cloudMonths, key),
  );

  importButton.hidden = missing.length === 0;
  importButton.textContent = `Import local budgets (${missing.length})`;
}

/* ==========================================
   CLOUD READ
   ========================================== */

async function loadAccount() {
  if (loadingAccount) return;

  loadingAccount = true;
  cloud.ready = false;

  try {
    setCloudStatus("Loading cloud budgets...");

    // Check the actual authenticated user.
    const { data: userData, error: userError } =
      await cloud.client.auth.getUser();

    if (userError) throw userError;

    if (!userData.user) {
      showLogin();
      return;
    }

    const activeUser = userData.user;
    cloud.user = activeUser;

    const { data: rows, error } = await cloud.client
      .from("monthly_budgets")
      .select("month,data")
      .eq("user_id", activeUser.id)
      .order("month", { ascending: true });

    if (error) throw error;

    // Do not reuse budgets from a previous account.
    const loaded = {};

    for (const row of rows || []) {
      const key = row.month.slice(0, 7);

      if (validMonth(key)) {
        loaded[key] = normalizeMonth(row.data);
      }
    }

    state = { months: loaded };

    cloud.ready = true;
    cloud.failed = false;

    showDashboard();

    // Render without creating a save operation.
    cloud.ready = false;
    render();
    cloud.ready = true;

    setCloudStatus("Cloud data loaded");
    // Fresh setup: do not offer local budget imports.
    importButton.hidden = true;
  } catch (error) {
    console.error("Cloud loading failed:", error);

    // Do not activate editing with incomplete data.
    cloud.ready = false;

    document.body.classList.remove("authenticated");
    document.body.classList.add("auth-locked");
    authScreen.hidden = false;

    setAuthMessage(
      "Could not load your budgets. Refresh to retry. " + error.message,
      true,
    );

    setCloudStatus("Cloud connection failed", true);
  } finally {
    loadingAccount = false;
  }
}

/* ==========================================
   CLOUD WRITE
   ========================================== */

cloud.queueSave = function (monthKey, record) {
  if (!cloud.ready || !cloud.user) return;

  const userId = cloud.user.id;

  // Capture the month at the time of the edit,
  // even if the user switches months immediately.
  const snapshot = JSON.parse(JSON.stringify(normalizeMonth(record)));

  const row = {
    user_id: userId,
    month: `${monthKey}-01`,
    data: snapshot,
    updated_at: new Date().toISOString(),
  };

  setCloudStatus("Saving...");

  // Keep writes in order so rapid edits do not
  // overwrite newer edits with older requests.
  cloud.pending = cloud.pending
    .catch(() => {})
    .then(async () => {
      if (!cloud.user || cloud.user.id !== userId) {
        throw new Error("Account changed before save.");
      }

      const { error } = await cloud.client.from("monthly_budgets").upsert(row, {
        onConflict: "user_id,month",
      });

      if (error) throw error;

      cloud.failed = false;
      setCloudStatus("All changes saved");
    })
    .catch((error) => {
      cloud.failed = true;
      setCloudStatus("Save failed — do not refresh. Check connection.", true);

      console.error("Budget save failed:", error);
      throw error;
    });
};

/* ==========================================
   AUTHENTICATION
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
    setAuthMessage(
      "Supabase is not connected. " + "Check config.js and refresh the page.",
      true,
    );
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
          "Check your email for the confirmation link. " +
            "After confirming, return and sign in.",
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

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  if (!cloud.user) return;

  setCloudStatus("Finishing saves...");

  // Wait for all previously submitted writes.
  try {
    await cloud.pending;
  } catch (error) {
    alert(
      "A cloud save failed. Please check your connection " +
        "and retry before logging out.",
    );
    return;
  }

  const { error } = await cloud.client.auth.signOut();

  if (error) {
    alert(error.message);
    return;
  }

  showLogin();
});

/* ==========================================
   STARTUP
   ========================================== */

async function initializeCloud() {
  document.body.classList.add("auth-pending");

  // Hide login while checking the existing session.
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
        "Please configure your Supabase credentials in config.js.",
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
      throw new Error("Supabase authentication failed to initialize.");
    }

    const { data, error } = await cloud.client.auth.getSession();

    if (error) throw error;

    authSubmit.disabled = false;

    if (data.session) {
      // Existing login: go straight to dashboard.
      await loadAccount();
    } else {
      // No session: display login screen.
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

initializeCloud();
