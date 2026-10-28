"use strict";

/* ==========================================
   PENVORIA - CATEGORY BUDGET WARNINGS
   Improvement 4
   ========================================== */

(function installBudgetWarnings() {
  if (window.__penvoriaBudgetWarningsInstalled) {
    return;
  }

  window.__penvoriaBudgetWarningsInstalled = true;

  // Preserve your existing page functions.
  const originalOverview = overview;
  const originalSpending = spending;

  // Find categories that reached 80% or more.
  function getBudgetWarnings(values) {
    return (values.categoryBudgets || [])
      .filter((budget) => {
        return (
          Number.isFinite(Number(budget.planned)) && Number(budget.planned) > 0
        );
      })
      .map((budget) => ({
        ...budget,
        usage: Number(budget.spent) / Number(budget.planned),
      }))
      .filter((budget) => budget.usage >= 0.8)
      .sort((a, b) => b.usage - a.usage);
  }

  function warningMessage(budget) {
    if (budget.usage > 1) {
      return "Over budget by " + money(budget.spent - budget.planned);
    }

    if (budget.usage >= 1) {
      return "Monthly allocation fully used";
    }

    return money(budget.planned - budget.spent) + " remaining";
  }

  // Show a compact warning on Overview.
  overview = function (record, values) {
    const warnings = getBudgetWarnings(values);

    const existingPage = originalOverview(record, values);

    if (!warnings.length) {
      return existingPage;
    }

    const critical = warnings.filter((budget) => budget.usage >= 1).length;

    const approaching = warnings.length - critical;

    const message = [
      critical ? `${critical} reached or exceeded their budgets` : "",
      approaching ? `${approaching} approaching their limits` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return `
      <section class="panel penvoria-alert-summary">
        <div class="penvoria-alert-heading">
          <span class="penvoria-alert-symbol">
            !
          </span>

          <div>
            <h2>Category budget alerts</h2>
            <p class="panel-sub">
              ${message}
            </p>
          </div>
        </div>

        <p class="hint">
          Open Spending to review your category
          allocations and remaining balances.
        </p>
      </section>

      ${existingPage}
    `;
  };

  // Show detailed warnings on Spending.
  spending = function (record, values) {
    const warnings = getBudgetWarnings(values);

    const existingPage = originalSpending(record, values);

    if (!warnings.length) {
      return existingPage;
    }

    const warningCards = warnings
      .map((budget) => {
        const critical = budget.usage >= 1;

        const status = critical
          ? budget.usage > 1
            ? "Over budget"
            : "Limit reached"
          : "Approaching limit";

        const percentage = (budget.usage * 100).toFixed(1);

        return `
          <div class="penvoria-budget-alert ${
            critical ? "is-critical" : "is-warning"
          }">

            <div class="penvoria-budget-alert-top">
              <strong>
                ${escapeHtml(budget.category)}
              </strong>

              <span class="penvoria-budget-alert-status">
                ${status}
              </span>
            </div>

            <div class="penvoria-budget-alert-details">
              <span>
                ${money(budget.spent)}
                of
                ${money(budget.planned)}
                spent
              </span>

              <strong>
                ${percentage}% used
              </strong>
            </div>

            <div class="penvoria-budget-alert-progress">
              <div
                style="width:${Math.min(100, budget.usage * 100)}%"
              ></div>
            </div>

            <p class="penvoria-budget-alert-message">
              ${warningMessage(budget)}
            </p>

          </div>
        `;
      })
      .join("");

    return `
      <section class="panel penvoria-alert-panel">

        <div class="panel-head">
          <div>
            <h2>Category budget warnings</h2>

            <p class="panel-sub">
              Categories using 80% or more of
              their monthly allocations.
            </p>
          </div>
        </div>

        <div class="penvoria-budget-alert-list">
          ${warningCards}
        </div>

      </section>

      ${existingPage}
    `;
  };
})();

/* ==========================================
   PENVORIA - MONTHLY FINANCIAL ANALYTICS
   Improvement 5 (append to app.js)
   ========================================== */

(function installPenvoriaAnalytics() {
  if (window.__penvoriaAnalyticsInstalled) return;
  window.__penvoriaAnalyticsInstalled = true;

  // Keep the existing monthly history and Open buttons.
  const previousHistory = history;

  function monthlyAnalyticsRecords() {
    const types = ["income", "needs", "expenses", "savings"];

    return Object.entries(state.months || {})
      .filter(
        ([key, record]) =>
          /^\d{4}-(0[1-9]|1[0-2])$/.test(key) &&
          record &&
          types.some(
            (type) => Array.isArray(record[type]) && record[type].length > 0,
          ),
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, record]) => ({
        key,
        values: totals(
          Object.fromEntries(
            types.map((type) => [
              type,
              Array.isArray(record[type]) ? record[type] : [],
            ]),
          ),
        ),
      }));
  }

  function shortMonth(key) {
    return new Date(`${key}-01T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }

  function trendChart(rows) {
    if (!rows.length) {
      return `<p class="pa-empty">Add financial entries to see your monthly trends.</p>`;
    }

    const scale = Math.max(
      1,
      ...rows
        .flatMap(({ values }) => [
          values.incomeReceived,
          values.expenses,
          values.savingsTransferred,
        ])
        .filter(Number.isFinite),
    );

    const series = [
      ["incomeReceived", "income", "Income received"],
      ["expenses", "expenses", "Expenses"],
      ["savingsTransferred", "savings", "Savings transferred"],
    ];

    const columns = rows
      .map(({ key, values }) => {
        const bars = series
          .map(([field, style, label]) => {
            const value = Math.max(0, Number(values[field]) || 0);
            const height = Math.min(100, (value / scale) * 100);
            const description = `${shortMonth(key)}: ${label}, ${money(value)}`;

            return `
          <div class="pa-bar pa-bar-${style}"
               style="height:${height.toFixed(3)}%"
               role="img"
               aria-label="${escapeHtml(description)}"
               title="${escapeHtml(description)}"></div>
        `;
          })
          .join("");

        return `
        <div class="pa-month-column">
          <div class="pa-bars">${bars}</div>
          <span class="pa-month-name">${escapeHtml(shortMonth(key))}</span>
        </div>
      `;
      })
      .join("");

    return `
      <div class="pa-legend" aria-label="Chart legend">
        <span><i class="pa-key pa-key-income"></i> Income received</span>
        <span><i class="pa-key pa-key-expenses"></i> Expenses</span>
        <span><i class="pa-key pa-key-savings"></i> Savings transferred</span>
      </div>
      <div class="pa-chart-scroll" role="region"
           aria-label="Financial trends by month" tabindex="0">
        <div class="pa-chart" style="--pa-month-count:${rows.length}; min-width:${Math.max(300, rows.length * 72)}px">
          ${columns}
        </div>
      </div>
      <p class="pa-note">Last ${rows.length} month${rows.length === 1 ? "" : "s"} with recorded activity. Bars use a common MVR scale, up to ${money(scale)}.</p>
    `;
  }

  function categoryBreakdown(record) {
    const spending = new Map();

    for (const expense of record.expenses || []) {
      const amount = Number(expense.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const category = categoryName(expense, "expenses");
      spending.set(category, (spending.get(category) || 0) + amount);
    }

    const ranked = [...spending.entries()].sort((a, b) => b[1] - a[1]);

    if (!ranked.length) {
      return `<p class="pa-empty">No expenses recorded for ${escapeHtml(monthLabel(month))}.</p>`;
    }

    const grandTotal = ranked.reduce((sum, [, value]) => sum + value, 0);
    const firstFive = ranked.slice(0, 5);
    const remaining = ranked
      .slice(5)
      .reduce((sum, [, value]) => sum + value, 0);
    const display =
      remaining > 0
        ? [...firstFive, ["Other categories combined", remaining]]
        : firstFive;

    return `
      <div class="pa-category-list">
        ${display
          .map(([category, amount]) => {
            const percent =
              grandTotal > 0
                ? Math.min(100, Math.max(0, (amount / grandTotal) * 100))
                : 0;

            return `
            <div class="pa-category-row">
              <div class="pa-category-header">
                <span>${escapeHtml(category)}</span>
                <strong>${money(amount)} · ${percent.toFixed(1)}%</strong>
              </div>
              <div class="pa-category-track" role="img"
                   aria-label="${escapeHtml(category)}: ${percent.toFixed(1)}% of monthly expenses">
                <div style="width:${percent.toFixed(2)}%"></div>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  // Extend Monthly History without replacing its existing rows.
  history = function () {
    const currentRecord = data(month);
    const current = totals(currentRecord);
    const recent = monthlyAnalyticsRecords().slice(-6);
    const savingsRate =
      current.incomeReceived > 0
        ? (current.savingsTransferred / current.incomeReceived) * 100
        : null;

    const insights = `
      <section class="panel pa-insights-panel">
        <div class="panel-head">
          <div>
            <h2>Financial analytics</h2>
            <p class="panel-sub">Actual money received, spent, and transferred for ${escapeHtml(monthLabel(month))}.</p>
          </div>
        </div>
        <div class="pa-insights-grid">
          <div class="pa-insight"><span>Income received</span><strong>${money(current.incomeReceived)}</strong></div>
          <div class="pa-insight"><span>Total expenses</span><strong>${money(current.expenses)}</strong></div>
          <div class="pa-insight"><span>Savings transferred</span><strong>${money(current.savingsTransferred)}</strong></div>
          <div class="pa-insight"><span>Monthly cash remainder</span><strong class="${current.cashRemainder < 0 ? "negative" : "positive"}">${money(current.cashRemainder)}</strong></div>
          <div class="pa-insight"><span>Actual savings rate</span><strong>${savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`}</strong></div>
        </div>
        <p class="pa-note">Cash remainder excludes balances carried in from other months. Savings rate is transferred savings divided by received income.</p>
      </section>
      <section class="panel pa-insights-panel">
        <h2>Monthly trends</h2>
        <p class="panel-sub">Compare up to six months of actual income, expenses, and savings transfers.</p>
        ${trendChart(recent)}
      </section>
      <section class="panel pa-insights-panel">
        <h2>Spending by category</h2>
        <p class="panel-sub">Expense breakdown for ${escapeHtml(monthLabel(month))}. Change the month at the top of the page to view another.</p>
        ${categoryBreakdown(currentRecord)}
      </section>
    `;

    return insights + previousHistory();
  };
})();

/* ==========================================
   PENVORIA - SEARCH & FILTER EXPENSES
   Improvement 6 - append to app.js
   ========================================== */

(function installExpenseFilters() {
  if (window.__penvoriaExpenseFiltersInstalled) return;
  window.__penvoriaExpenseFiltersInstalled = true;

  const originalRender = render;

  const filters = {
    search: "",
    category: "",
    from: "",
    to: "",
  };

  let filterMonth = month;

  function clearFilterValues() {
    filters.search = "";
    filters.category = "";
    filters.from = "";
    filters.to = "";
  }

  function getMatchingExpenses() {
    const query = filters.search.trim().toLocaleLowerCase();

    return data().expenses.filter((expense) => {
      const category = categoryName(expense, "expenses");

      const title = String(expense.title || "");
      const date = String(expense.date || "");

      const matchesText =
        !query || `${title} ${category}`.toLocaleLowerCase().includes(query);

      return (
        matchesText &&
        (!filters.category || category === filters.category) &&
        (!filters.from || date >= filters.from) &&
        (!filters.to || date <= filters.to)
      );
    });
  }

  function refreshExpenseResults() {
    const results = document.getElementById("pef-results");

    const summary = document.getElementById("pef-summary");

    if (!results || !summary || view !== "spending") {
      return;
    }

    const all = data().expenses;
    const matched = getMatchingExpenses();

    results.innerHTML = matched.length
      ? entryTable(matched, "expenses")
      : `
        <div class="empty">
          <strong>
            ${all.length ? "No matching expenses" : "No expenses yet"}
          </strong>

          ${
            all.length
              ? "Try changing your search or filters."
              : "Add your first expense to get started."
          }
        </div>
      `;

    summary.textContent =
      `Showing ${matched.length} of ${all.length} expenses · ` +
      `Filtered total: ${money(total(matched))}`;
  }

  function mountExpenseFilters() {
    // Reset filters when selecting another month.
    if (month !== filterMonth) {
      filterMonth = month;
      clearFilterValues();
    }

    if (view !== "spending") return;

    // Find the existing All Expenses panel.
    const expensePanel = [...document.querySelectorAll("#app .panel")].find(
      (panel) =>
        panel.querySelector(".panel-head h2")?.textContent.trim() ===
        "All expenses",
    );

    if (!expensePanel) return;

    const heading = expensePanel.querySelector(".panel-head");

    const originalTable = heading?.nextElementSibling;

    if (
      !heading ||
      !originalTable ||
      !originalTable.matches(".table-wrap, .empty")
    ) {
      return;
    }

    // Build categories from actual expense records.
    const categories = [
      ...new Set(data().expenses.map((item) => categoryName(item, "expenses"))),
    ].sort((a, b) => a.localeCompare(b));

    if (filters.category && !categories.includes(filters.category)) {
      filters.category = "";
    }

    const monthParts = month.split("-").map(Number);

    const lastDay = new Date(monthParts[0], monthParts[1], 0).getDate();

    const minDate = `${month}-01`;

    const maxDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const controls = document.createElement("div");

    controls.id = "pef-controls";

    controls.innerHTML = `
      <div class="pef-grid">

        <label class="pef-field pef-search">
          <span>Search expenses</span>

          <input
            id="pef-search"
            type="search"
            placeholder="Description or category"
            autocomplete="off"
            value="${escapeHtml(filters.search)}"
          >
        </label>

        <label class="pef-field pef-category">
          <span>Category</span>

          <select id="pef-category">
            <option value="">
              All categories
            </option>

            ${categories
              .map(
                (category) => `
              <option
                value="${escapeHtml(category)}"
                ${category === filters.category ? "selected" : ""}
              >
                ${escapeHtml(category)}
              </option>
            `,
              )
              .join("")}
          </select>
        </label>

        <label class="pef-field">
          <span>From date</span>

          <input
            id="pef-from"
            type="date"
            min="${minDate}"
            max="${maxDate}"
            value="${escapeHtml(filters.from)}"
          >
        </label>

        <label class="pef-field">
          <span>To date</span>

          <input
            id="pef-to"
            type="date"
            min="${minDate}"
            max="${maxDate}"
            value="${escapeHtml(filters.to)}"
          >
        </label>

      </div>

      <div class="pef-footer">
        <span
          id="pef-summary"
          role="status"
          aria-live="polite"
        ></span>

        <button
          id="pef-clear"
          type="button"
          class="secondary"
        >
          Clear filters
        </button>
      </div>
    `;

    // Insert the controls above the transactions.
    heading.after(controls);

    const results = document.createElement("div");

    results.id = "pef-results";

    controls.after(results);

    // Replace only the visual table.
    // The original financial data remains unchanged.
    originalTable.remove();

    refreshExpenseResults();
  }

  // Preserve the existing page rendering.
  // Filtering only changes the displayed expense list.
  render = function (...args) {
    const result = originalRender(...args);

    mountExpenseFilters();

    return result;
  };

  // Search and date input events.
  document.getElementById("app").addEventListener("input", (event) => {
    if (!event.target.closest("#pef-controls")) {
      return;
    }

    if (event.target.id === "pef-search") {
      filters.search = event.target.value;
    }

    if (event.target.id === "pef-from") {
      filters.from = event.target.value;
    }

    if (event.target.id === "pef-to") {
      filters.to = event.target.value;
    }

    refreshExpenseResults();
  });

  // Category dropdown and date selection.
  document.getElementById("app").addEventListener("change", (event) => {
    if (!event.target.closest("#pef-controls")) {
      return;
    }

    if (event.target.id === "pef-category") {
      filters.category = event.target.value;
    }

    if (event.target.id === "pef-from") {
      filters.from = event.target.value;
    }

    if (event.target.id === "pef-to") {
      filters.to = event.target.value;
    }

    refreshExpenseResults();
  });

  // Clear all filters without reloading the page.
  document.getElementById("app").addEventListener("click", (event) => {
    const clearButton = event.target.closest("#pef-clear");

    if (!clearButton) return;

    clearFilterValues();

    for (const id of ["pef-search", "pef-category", "pef-from", "pef-to"]) {
      const control = document.getElementById(id);

      if (control) {
        control.value = "";
      }
    }

    refreshExpenseResults();
  });
})();

/* ==========================================
   PENVORIA - QUICK EXPENSE ENTRY (iPHONE)
   Improvement 7 - append to app.js
   ========================================== */

(function installQuickExpense() {
  if (window.__penvoriaQuickExpenseInstalled) return;
  window.__penvoriaQuickExpenseInstalled = true;

  // Keep your existing Spending page, warnings and filters.
  const originalSpending = spending;

  function quickExpenseDate(selectedMonth) {
    // Use today for the current month; otherwise use day 1
    // of the selected month. The full Add Expense form
    // remains available when a different date is needed.
    if (selectedMonth === todayMonth()) {
      return `${selectedMonth}-${String(new Date().getDate()).padStart(2, "0")}`;
    }
    return `${selectedMonth}-01`;
  }

  spending = function (record, values) {
    const categoryOptions = CATEGORIES.map(
      (category) => `
      <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
    `,
    ).join("");

    const quickForm = `
      <section class="panel pqe-panel" aria-labelledby="pqe-title">
        <div class="pqe-heading">
          <div>
            <h2 id="pqe-title">Quick expense</h2>
            <p class="panel-sub">Save an expense without opening a popup.</p>
          </div>
          <span class="pqe-bolt" aria-hidden="true">⚡</span>
        </div>

        <form id="pqe-form" autocomplete="off">
          <div class="pqe-grid">
            <label class="pqe-field">
              <span>Amount (MVR)</span>
              <input name="amount" type="text" inputmode="decimal"
                     placeholder="0.00" autocomplete="off" required
                     aria-label="Expense amount in MVR" maxlength="15">
            </label>

            <label class="pqe-field">
              <span>Category</span>
              <select id="pqe-category" name="category" required>
                <option value="" selected disabled>Choose category</option>
                ${categoryOptions}
              </select>
            </label>

            <label class="pqe-field pqe-full" id="pqe-custom-row" hidden>
              <span>Custom category</span>
              <input id="pqe-custom" name="customCategory"
                     type="text" maxlength="60"
                     placeholder="Enter your category">
            </label>

            <label class="pqe-field pqe-full">
              <span>Description (optional)</span>
              <input name="title" type="text" maxlength="80"
                     placeholder="What did you spend on?">
            </label>
          </div>

          <div class="pqe-footer">
            <small>Date: ${quickExpenseDate(month)} · ${escapeHtml(monthLabel(month))}</small>
            <button class="primary" type="submit">Save expense</button>
          </div>
          <p id="pqe-message" class="pqe-message" role="status" aria-live="polite"></p>
        </form>
      </section>
    `;

    return quickForm + originalSpending(record, values);
  };

  // Reveal the custom category field only when needed.
  document.querySelector("#app").addEventListener("change", (event) => {
    if (event.target.id !== "pqe-category") return;

    const row = document.getElementById("pqe-custom-row");
    const input = document.getElementById("pqe-custom");
    const custom = event.target.value === "Other / Custom";

    row.hidden = !custom;
    input.required = custom;
    if (!custom) input.value = "";
  });

  document.querySelector("#app").addEventListener("submit", (event) => {
    if (event.target.id !== "pqe-form") return;
    event.preventDefault();

    const form = event.target;
    const message = form.querySelector("#pqe-message");
    const fail = (text) => {
      message.textContent = text;
      message.classList.add("pqe-error");
    };

    if (!window.penvoriaCloud?.ready) {
      fail("Your cloud data is not ready. Please try again after it loads.");
      return;
    }

    const raw = form.elements
      .namedItem("amount")
      .value.trim()
      .replace(",", ".");
    const amount = Number(raw);

    if (
      !/^\d+(?:\.\d{1,2})?$/.test(raw) ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      fail("Enter a valid amount, for example 125.50.");
      return;
    }

    const category = form.elements.namedItem("category").value;
    if (!CATEGORIES.includes(category)) {
      fail("Choose an expense category.");
      return;
    }

    const customCategory = form.elements
      .namedItem("customCategory")
      .value.trim();
    if (category === "Other / Custom" && !customCategory) {
      fail("Enter the name of your custom category.");
      return;
    }

    const description = form.elements.namedItem("title").value.trim();
    const entry = {
      id: makeId(),
      amount: round(amount),
      category,
      title:
        description ||
        (category === "Other / Custom" ? customCategory : category),
      date: quickExpenseDate(month),
      type: "other",
    };

    if (category === "Other / Custom") {
      entry.customCategory = customCategory;
    }

    // Match the standard expense shape and category allocation logic.
    entry.type = isNeed(entry) ? "need" : "other";
    data().expenses.push(entry);
    save();

    // Remove the form before iOS attempts to reposition its focused input.
    if (form.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    render();

    const confirmation = document.getElementById("pqe-message");
    if (confirmation) {
      confirmation.classList.remove("pqe-error");
      confirmation.textContent = `${money(entry.amount)} added to ${categoryName(entry, "expenses")}.`;
    }
  });
})();

// cloud.js calls render() after
// authentication and account loading.
