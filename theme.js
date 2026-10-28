"use strict";

/* Penvoria v1.1 - Automatic Device Theme */

(() => {
  const KEY = "penvoria-appearance";
  const choices = ["system", "light", "dark"];

  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function readPreference() {
    try {
      const saved = localStorage.getItem(KEY);

      return choices.includes(saved) ? saved : "system";
    } catch {
      return "system";
    }
  }

  let preference = readPreference();

  let cycleOrder = media.matches
    ? ["system", "light", "dark"]
    : ["system", "dark", "light"];

  function isDark() {
    return preference === "dark" || (preference === "system" && media.matches);
  }

  function applyTheme() {
    const dark = isDark();

    // Apply early to HTML and later to BODY.
    document.documentElement.classList.toggle("dark", dark);

    if (document.body) {
      document.body.classList.toggle("dark", dark);
    }

    // Match mobile browser header color.
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = dark ? "#101c25" : "#11796f";
    });

    const button = document.getElementById("themeBtn");

    if (button) {
      const label =
        preference === "system"
          ? "Auto"
          : preference === "light"
            ? "Light"
            : "Dark";

      // SVG icons work without special device fonts.
      const icons = {
        system: `
          <rect x="3" y="4"
                width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        `,

        light: `
          <circle cx="12" cy="12" r="4" />
          <path d="
            M12 2v2
            M12 20v2
            M4.93 4.93l1.42 1.42
            M17.65 17.65l1.42 1.42
            M2 12h2
            M20 12h2
            M4.93 19.07l1.42-1.42
            M17.65 6.35l1.42-1.42
          " />
        `,

        dark: `
          <path d="
            M20.985 12.486
            A9 9 0 0 1 11.514 3.015
            A9 9 0 1 0 20.985 12.486Z
          " />
        `,
      };

      button.innerHTML = `
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${icons[preference]}
        </svg>
      `;

      button.setAttribute(
        "aria-label",
        "Appearance: " + label + ". Click to change.",
      );

      button.title = "Appearance: " + label + " (click to change)";
    }
  }

  function setPreference(value) {
    if (!choices.includes(value)) return;

    preference = value;

    try {
      localStorage.setItem(KEY, value);
    } catch (error) {
      console.warn("Appearance preference not saved:", error);
    }

    applyTheme();
  }

  function attachButton() {
    const button = document.getElementById("themeBtn");

    if (!button || button.dataset.appearanceBound) {
      return;
    }

    button.dataset.appearanceBound = "true";

    button.addEventListener("click", () => {
      // The first click changes the visible theme.
      if (preference === "system") {
        cycleOrder = media.matches
          ? ["system", "light", "dark"]
          : ["system", "dark", "light"];
      }

      const next =
        cycleOrder[(cycleOrder.indexOf(preference) + 1) % cycleOrder.length];

      setPreference(next);
    });

    applyTheme();
  }

  // Apply before the stylesheet paints.
  applyTheme();

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        applyTheme();
        attachButton();
      },
      { once: true },
    );
  } else {
    applyTheme();
    attachButton();
  }

  // Respond to device appearance changes.
  if (media.addEventListener) {
    media.addEventListener("change", applyTheme);
  } else if (media.addListener) {
    media.addListener(applyTheme);
  }

  // Sync appearance between tabs on one origin.
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      preference = readPreference();
      applyTheme();
    }
  });

  window.PenvoriaAppearance = {
    setPreference,
    getPreference: () => preference,
  };
})();
