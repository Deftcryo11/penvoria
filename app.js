"use strict";

// Penvoria personal finance application
const STORAGE = "velmora-preview-v1";

const $ = (selector) => document.querySelector(selector);

const CATEGORIES = [
  "Rent / Housing",
  "Utilities / Bills",
  "Phone / Internet",
  "Groceries",
  "Food / Dining",
  "Transport / Fuel",
  "Gym / Fitness",
  "Subscriptions",
  "Credit Cards",
  "Loans / Repayments",
  "Healthcare",
  "Insurance",
  "Shopping",
  "Entertainment",
  "Family",
  "Education",
  "Travel",
  "Other / Custom",
];

const ESSENTIAL = new Set([
  "Rent / Housing",
  "Utilities / Bills",
  "Phone / Internet",
  "Groceries",
  "Transport / Fuel",
  "Credit Cards",
  "Loans / Repayments",
  "Healthcare",
  "Insurance",
]);

const money = (amount) =>
  "MVR " +
  Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const todayMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const monthNumber = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${monthNumber}`;
};

const monthLabel = (value) =>
  new Date(`${value}-01T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

const total = (items, key = "amount") =>
  items.reduce((sum, item) => sum + Number(item[key] || 0), 0);

const round = (value) => Math.round(Number(value) * 100) / 100;

const makeId = () => crypto.randomUUID();

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE));

    if (stored && stored.months) {
      return stored;
    }
  } catch (error) {
    console.error("Could not read saved data:", error);
  }

  return { months: {} };
}

let state = load();
let month = todayMonth();
let view = "dashboard";
let editing = null;

function save() {
  // Save into the authenticated Supabase account.
  if (window.penvoriaCloud && window.penvoriaCloud.ready) {
    window.penvoriaCloud.queueSave(month, data());
  }
}

function data(selectedMonth = month) {
  if (!state.months[selectedMonth]) {
    state.months[selectedMonth] = {
      income: [],
      needs: [],
      expenses: [],
      savings: [],
    };
  }

  const record = state.months[selectedMonth];

  for (const key of ["income", "needs", "expenses", "savings"]) {
    if (!Array.isArray(record[key])) {
      record[key] = [];
    }
  }

  return record;
}

// ==========================================
// CATEGORY HELPERS
// ==========================================

function categoryOf(item, type) {
  const original =
    type === "needs" ? item.category || item.title : item.category;

  return CATEGORIES.includes(original) ? original : "Other / Custom";
}

function categoryName(item, type) {
  const chosen = categoryOf(item, type);

  if (chosen !== "Other / Custom") {
    return chosen;
  }

  return (
    item.customCategory ||
    (type === "needs" ? item.title : item.category) ||
    "Other / Custom"
  );
}

function isNeed(expense) {
  const expenseCategory = categoryName(expense, "expenses");

  return data().needs.some(
    (need) => categoryName(need, "needs") === expenseCategory,
  );
}

// ==========================================
// FINANCIAL CALCULATIONS
// ==========================================

function totals(record) {
  // Planned amounts.
  const income = total(record.income);
  const needBudget = total(record.needs);
  const savings = total(record.savings);
  const expenses = total(record.expenses);

  // Actual amounts.
  // Legacy income entries default to received.
  const incomeReceived = round(
    record.income.reduce(
      (sum, item) => sum + Number(item.received ?? item.amount ?? 0),
      0,
    ),
  );

  const savingsTransferred = round(
    record.savings.reduce(
      (sum, item) => sum + Number(item.transferred ?? 0),
      0,
    ),
  );

  const cashRemainder = round(incomeReceived - expenses - savingsTransferred);

  const savingsStillToTransfer = round(savings - savingsTransferred);

  // Combine allocations in matching categories.
  const allocations = new Map();

  record.needs.forEach((need) => {
    const category = categoryName(need, "needs");

    allocations.set(
      category,
      round((allocations.get(category) || 0) + Number(need.amount || 0)),
    );
  });

  // Calculate expenses per category.
  const spentByCategory = new Map();

  record.expenses.forEach((expense) => {
    const category = categoryName(expense, "expenses");

    spentByCategory.set(
      category,
      round((spentByCategory.get(category) || 0) + Number(expense.amount || 0)),
    );
  });

  let needsActual = 0;
  let coveredByNeeds = 0;
  let overBudget = 0;

  const categoryBudgets = [];

  allocations.forEach((planned, category) => {
    const spent = round(spentByCategory.get(category) || 0);

    const covered = Math.min(planned, spent);
    const excess = Math.max(0, spent - planned);

    needsActual += spent;
    coveredByNeeds += covered;
    overBudget += excess;

    categoryBudgets.push({
      category,
      planned,
      spent,
      remaining: round(planned - spent),
      covered,
      excess,
    });
  });

  // Unallocated expenses and overspending.
  const otherActual = round(expenses - coveredByNeeds);

  const spendingBudget = round(income - needBudget - savings);

  const remaining = round(spendingBudget - otherActual);

  return {
    income,
    incomeReceived,
    needBudget,
    savings,
    savingsTransferred,
    savingsStillToTransfer,
    cashRemainder,
    expenses,
    needsActual: round(needsActual),
    otherActual,
    overBudget: round(overBudget),
    coveredByNeeds: round(coveredByNeeds),
    spendingBudget,
    remaining,
    needsRemaining: round(needBudget - needsActual),
    plannedFree: spendingBudget,
    categoryBudgets,
  };
}

// ==========================================
// DISPLAY HELPERS
// ==========================================

function stat(label, value, description, symbol = "◈", css = "") {
  return `
    <article class="stat">
      <div class="stat-top">
        <span>${escapeHtml(label)}</span>
        <span class="stat-icon">${symbol}</span>
      </div>

      <div class="stat-value ${css}">
        ${money(value)}
      </div>

      <div class="stat-foot">
        ${escapeHtml(description)}
      </div>
    </article>
  `;
}

function actionButtons(type, item) {
  return `
    <button
      class="mini-btn"
      data-edit="${type}"
      data-id="${escapeHtml(item.id)}"
    >
      Edit
    </button>

    <button
      class="mini-btn danger"
      data-delete="${type}"
      data-id="${escapeHtml(item.id)}"
    >
      Delete
    </button>
  `;
}

function entryTable(items, type) {
  if (!items.length) {
    return `
      <div class="empty">
        <strong>No entries yet</strong>
        Add your first entry for this month.
      </div>
    `;
  }

  const headings =
    type === "needs"
      ? ["Category", "Monthly plan", "Actions"]
      : ["Description", "Category / date", "Amount", "Actions"];

  const rows = items
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => {
      if (type === "needs") {
        return `
          <tr>
            <td>
              <b>${escapeHtml(categoryName(item, type))}</b>
            </td>

            <td class="amount">
              ${money(item.amount)}
            </td>

            <td>${actionButtons(type, item)}</td>
          </tr>
        `;
      }

      const meta =
        type === "expenses"
          ? `${escapeHtml(categoryName(item, type))}
             · ${escapeHtml(item.date || "")}
             · ${isNeed(item) ? "Essential" : "Other"}`
          : escapeHtml(item.date || "");

      return `
        <tr>
          <td>
            <b>${escapeHtml(item.title)}</b>
          </td>

          <td>${meta}</td>

          <td class="amount">
            ${money(item.amount)}
          </td>

          <td>${actionButtons(type, item)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            ${headings.map((heading) => `<th>${heading}</th>`).join("")}
          </tr>
        </thead>

        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function compactEntries(items, type) {
  if (!items.length) {
    return `
      <div class="empty">
        No entries yet. Use the Add button to get started.
      </div>
    `;
  }

  const sorted = [...items].sort((a, b) =>
    (b.date || "").localeCompare(a.date || ""),
  );

  return `
    <div class="compact-list">
      ${sorted
        .map((item) => {
          const heading =
            type === "needs"
              ? categoryName(item, "needs")
              : item.title || categoryName(item, type);

          const subtitle =
            type === "needs"
              ? "Monthly allocation"
              : type === "expenses"
                ? `${categoryName(item, "expenses")} · ${item.date || ""}`
                : item.date || "Monthly entry";

          return `
            <div class="compact-entry">
              <div class="compact-entry-info">
                <strong>${escapeHtml(heading)}</strong>
                <small>${escapeHtml(subtitle)}</small>
              </div>

              <div class="compact-entry-side">
                <strong class="compact-amount">
                  ${money(item.amount)}
                </strong>

                <div class="compact-actions">
                  <button
                    class="mini-btn"
                    data-edit="${type}"
                    data-id="${escapeHtml(item.id)}"
                    type="button"
                  >
                    Edit
                  </button>

                  <button
                    class="mini-btn danger"
                    data-delete="${type}"
                    data-id="${escapeHtml(item.id)}"
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// ==========================================
// OVERVIEW
// ==========================================

function overview(record, values) {
  const {
    income,
    incomeReceived,
    needBudget,
    savings,
    savingsTransferred,
    cashRemainder,
    spendingBudget,
    otherActual,
    remaining,
    needsActual,
  } = values;

  const allocated = needBudget + savings;

  const allocatedPercent =
    income > 0 ? Math.min(100, (allocated / income) * 100) : 0;

  const spentPercent =
    spendingBudget > 0
      ? Math.min(100, (otherActual / spendingBudget) * 100)
      : 0;

  const latestExpenses = record.expenses.slice();

  return `
    <div class="cards">
      ${stat("Monthly income", income, "Total income recorded", "↗")}

      ${stat("Planned needs", needBudget, "Money reserved for essentials", "▤")}

      ${stat("Planned savings", savings, "Savings allocations", "◇")}

      ${stat(
        "General budget left",
        remaining,
        "After allocations and other spending",
        "◈",
        remaining < 0 ? "negative" : "positive",
      )}
    </div>

    <!-- Planned vs Actual -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Planned vs. actual</h2>

          <p class="panel-sub">
            Compare allocations with money actually
            received, paid, or transferred.
          </p>
        </div>
      </div>

      <div class="history-list">
        <div class="history-row">
          <span>Planned income</span>
          <b>${money(income)}</b>
        </div>

        <div class="history-row">
          <span>Income actually received</span>
          <b>${money(incomeReceived)}</b>
        </div>

        <div class="history-row">
          <span>
            Needs allocated / expenses paid
            in matching categories
          </span>

          <b>
            ${money(needBudget)} /
            ${money(needsActual)}
          </b>
        </div>

        <div class="history-row">
          <span>
            Savings planned / actually transferred
          </span>

          <b>
            ${money(savings)} /
            ${money(savingsTransferred)}
          </b>
        </div>

        <div class="history-row">
          <span>Total expenses recorded</span>
          <b>${money(values.expenses)}</b>
        </div>

        <div class="history-row balance-row">
          <span>
            <b>Actual monthly cash remainder</b>
          </span>

          <b class="${cashRemainder < 0 ? "negative" : "positive"}">
            ${money(cashRemainder)}
          </b>
        </div>
      </div>

      <p class="hint" style="margin:14px 0 0">
        Received income minus recorded expenses
        and completed savings transfers.
        This excludes opening balances and is not
        your bank-account balance.
      </p>
    </section>

    <div class="dashboard-grid">
      <div>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Monthly budget overview</h2>

              <p class="panel-sub">
                How your income is allocated
              </p>
            </div>
          </div>

          <div class="planning-summary">
            <div class="history-row">
              <span>Monthly income</span>
              <b>${money(income)}</b>
            </div>

            <div class="history-row">
              <span>Needs & monthly budgets</span>
              <b>${money(needBudget)}</b>
            </div>

            <div class="history-row">
              <span>Savings allocation</span>
              <b>${money(savings)}</b>
            </div>

            <div class="history-row">
              <span>Available spending budget</span>
              <b>${money(spendingBudget)}</b>
            </div>

            <div class="history-row">
              <span>Other expenses</span>
              <b>${money(otherActual)}</b>
            </div>

            <div class="history-row balance-row">
              <span>
                <b>General budget remaining</b>
              </span>

              <b class="${remaining < 0 ? "negative" : "positive"}">
                ${money(remaining)}
              </b>
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>Recent spending</h2>

          <p class="panel-sub">
            Your latest non-essential expenses
          </p>

          ${
            latestExpenses.length
              ? `
                <div class="history-list">
                  ${latestExpenses
                    .map(
                      (item) => `
                        <div class="history-row">
                          <span>
                            <b>${escapeHtml(item.title)}</b>

                            <div class="muted">
                              ${escapeHtml(categoryName(item, "expenses"))}

                              · ${escapeHtml(item.date || "")}
                            </div>
                          </span>

                          <b>${money(item.amount)}</b>
                        </div>
                      `,
                    )
                    .join("")}
                </div>
              `
              : `
                <div class="empty">
                  No other expenses recorded this month.
                </div>
              `
          }
        </section>
      </div>

      <div>
        <section class="panel">
          <h2>Income allocation</h2>

          <p class="panel-sub">
            Needs and savings reserved
          </p>

          <div class="kpi">
            ${allocatedPercent.toFixed(1)}%
          </div>

          <div class="progress">
            <div
              class="fill"
              style="width:${allocatedPercent}%"
            ></div>
          </div>

          <div class="flex-between">
            <span class="muted">Reserved</span>
            <b>${money(allocated)}</b>
          </div>
        </section>

        <section class="panel">
          <h2>Spending progress</h2>

          <p class="panel-sub">
            Other expenses versus spending budget
          </p>

          <div class="kpi">
            ${money(otherActual)}
          </div>

          <div class="progress">
            <div
              class="fill"
              style="width:${spentPercent}%"
            ></div>
          </div>

          <div class="flex-between">
            <span class="muted">Budget left</span>

            <b class="${remaining < 0 ? "negative" : "positive"}">
              ${money(remaining)}
            </b>
          </div>
        </section>

        <section class="panel">
          <h2>Needs tracking</h2>

          <p class="panel-sub">
            Actual essential payments recorded previously
          </p>

          <div class="flex-between">
            <span class="muted">Recorded as paid</span>
            <b>${money(needsActual)}</b>
          </div>

          <div class="flex-between">
            <span class="muted">Needs allocation</span>
            <b>${money(needBudget)}</b>
          </div>
        </section>
      </div>
    </div>
  `;
}

// ==========================================
// COPY PREVIOUS MONTH
// ==========================================

function previousMonthKey(targetMonth) {
  const [year, monthNumber] = targetMonth.split("-").map(Number);

  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));

  return previous.toISOString().slice(0, 7);
}

function moveEntryDateToMonth(originalDate, targetMonth) {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(String(originalDate || ""));

  const requestedDay = match ? Number(match[1]) : 1;

  const year = Number(targetMonth.slice(0, 4));
  const monthNumber = Number(targetMonth.slice(5, 7));

  const lastDay = new Date(year, monthNumber, 0).getDate();

  const day = Math.min(Math.max(requestedDay, 1), lastDay);

  return `${targetMonth}-${String(day).padStart(2, "0")}`;
}

function copyPreviousMonthPlanning() {
  if (!window.penvoriaCloud?.ready) {
    alert("Wait for your cloud data to finish loading.");
    return;
  }

  const targetMonth = month;
  const sourceMonth = previousMonthKey(targetMonth);

  const source = state.months[sourceMonth];

  const types = ["income", "needs", "savings"];

  const hasSourcePlanning =
    source &&
    types.some(
      (type) => Array.isArray(source[type]) && source[type].length > 0,
    );

  if (!hasSourcePlanning) {
    alert(
      `There is no planning data to copy from ` + `${monthLabel(sourceMonth)}.`,
    );

    return;
  }

  const target = data(targetMonth);

  if (types.some((type) => target[type].length > 0)) {
    alert(
      `${monthLabel(targetMonth)} already has a plan. ` +
        `Copying is limited to months without income, ` +
        `needs, or savings entries.`,
    );

    return;
  }

  const confirmed = confirm(
    `Copy planning from ${monthLabel(sourceMonth)} ` +
      `to ${monthLabel(targetMonth)}?\n\n` +
      `Income: ${source.income?.length || 0} entries\n` +
      `Needs: ${source.needs?.length || 0} allocations\n` +
      `Savings: ${source.savings?.length || 0} entries\n\n` +
      `Expenses will not be copied. ` +
      `Existing expenses will be preserved.`,
  );

  if (!confirmed) return;

  for (const type of types) {
    target[type] = (source[type] || []).map((item) => {
      const copy = {
        ...item,
        id: makeId(),
      };

      // Copied plans are not confirmed recurring entries.
      delete copy.recurringTemplateId;

      // New month: reset actual activity.
      if (type === "income") {
        copy.received = 0;
      }

      if (type === "savings") {
        copy.transferred = 0;
      }

      if (type !== "needs") {
        copy.date = moveEntryDateToMonth(item.date, targetMonth);
      }

      return copy;
    });
  }

  // Existing expenses are not changed.
  save();
  render();

  alert(
    `Planning copied to ${monthLabel(targetMonth)}. ` +
      `Review all planned amounts.`,
  );
}

// ==========================================
// PLANNING
// ==========================================

function planning(record, values) {
  const { income, needBudget, savings, spendingBudget } = values;

  const paidNeeds = record.expenses.filter(isNeed);

  return `
    <div class="cards">
      ${stat("Total income", income, "Income available this month", "↗")}

      ${stat("Needs allocation", needBudget, "Reserved for essentials", "▤")}

      ${stat("Savings allocation", savings, "Money planned for savings", "◇")}

      ${stat(
        "Available to spend",
        spendingBudget,
        "After needs and savings",
        "◈",
        spendingBudget < 0 ? "negative" : "positive",
      )}
    </div>

    <!-- Copy previous month's plan -->
    <section class="panel copy-month-panel">
      <div class="panel-head">
        <div>
          <h2>Start with last month's plan</h2>

          <p class="panel-sub">
            Copy income, needs and savings from
            ${monthLabel(previousMonthKey(month))}.
            Expenses are never copied.
          </p>
        </div>

        <button
          class="secondary"
          type="button"
          data-copy-previous
        >
          Copy previous month
        </button>
      </div>
    </section>

    <!-- Income -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>1. Monthly income</h2>

          <p class="panel-sub">
            Add your salary, bonuses and other income.
          </p>
        </div>

        <button
          class="secondary"
          data-add="income"
        >
          + Add income
        </button>
      </div>

      ${entryTable(record.income, "income")}
    </section>

    <!-- Needs -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>2. Needs & monthly budgets</h2>

          <p class="panel-sub">
            Allocate money for essential monthly costs.
          </p>
        </div>

        <button
          class="secondary"
          data-add="needs"
        >
          + Add need
        </button>
      </div>

      ${entryTable(record.needs, "needs")}

      <div class="planning-total">
        <span>Total needs allocated</span>
        <strong>${money(needBudget)}</strong>
      </div>

      ${
        paidNeeds.length
          ? `
            <h3 class="comparison-title">
              Previously recorded essential payments
            </h3>

            <p class="panel-sub">
              These payments stay in your history.
              They are not deducted again from
              your discretionary spending budget.
            </p>

            ${entryTable(paidNeeds, "expenses")}
          `
          : ""
      }
    </section>

    <!-- Savings -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>3. Savings allocation</h2>

          <p class="panel-sub">
            Plan how much money to set aside each month.
          </p>
        </div>

        <button
          class="secondary"
          data-add="savings"
        >
          + Add savings
        </button>
      </div>

      ${entryTable(record.savings, "savings")}

      <div class="planning-total">
        <span>Total savings allocated</span>
        <strong>${money(savings)}</strong>
      </div>

      <div class="planning-total">
        <span>Actually transferred to savings</span>
        <strong>
          ${money(values.savingsTransferred)}
        </strong>
      </div>

      <div class="planning-total">
        <span>Still planned for transfer</span>
        <strong>
          ${money(values.savingsStillToTransfer)}
        </strong>
      </div>
    </section>

    <!-- Planning result -->
    <section class="panel plan-result">
      <div class="panel-head">
        <div>
          <h2>Monthly planning result</h2>

          <p class="panel-sub">
            What remains after your allocations
          </p>
        </div>
      </div>

      <div class="planning-summary">
        <div class="history-row">
          <span>Monthly income</span>
          <b>${money(income)}</b>
        </div>

        <div class="history-row">
          <span>Needs & monthly budgets</span>
          <b>− ${money(needBudget)}</b>
        </div>

        <div class="history-row">
          <span>Planned savings</span>
          <b>− ${money(savings)}</b>
        </div>

        <div class="history-row balance-row">
          <span>
            <b>Available spending budget</b>
          </span>

          <b class="${spendingBudget < 0 ? "negative" : "positive"}">
            ${money(spendingBudget)}
          </b>
        </div>
      </div>

      ${
        spendingBudget < 0
          ? `
            <p class="budget-warning">
              Your needs and savings allocations
              exceed your monthly income.
              Review your plan.
            </p>
          `
          : ""
      }
    </section>
  `;
}

// ==========================================
// SPENDING
// ==========================================

function spending(record, values) {
  const {
    spendingBudget,
    otherActual,
    remaining,
    expenses,
    categoryBudgets,
    overBudget,
  } = values;

  const usedPercent =
    spendingBudget > 0
      ? Math.min(100, (otherActual / spendingBudget) * 100)
      : 0;

  const unallocatedExpenses = record.expenses.filter((expense) => {
    const category = categoryName(expense, "expenses");

    return !categoryBudgets.some((budget) => budget.category === category);
  });

  const unallocatedTotal = total(unallocatedExpenses);

  const allocationCards = categoryBudgets
    .map((budget) => {
      const { category, planned, spent, remaining: categoryRemaining } = budget;

      const percentage =
        planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;

      // Budget warning thresholds.
      const isOver = categoryRemaining < 0;

      const isLimit = planned > 0 && spent >= planned && !isOver;

      const isNear =
        planned > 0 && spent >= planned * 0.8 && !isLimit && !isOver;

      const budgetStatus = isOver
        ? "Over budget"
        : isLimit
          ? "Limit reached"
          : isNear
            ? "Approaching limit"
            : "Allocated";

      const budgetClass =
        isOver || isLimit ? "over" : isNear ? "approaching" : "";

      return `
      <div class="allocation-card">

        <div class="allocation-top">
          <div>
            <h3>${escapeHtml(category)}</h3>
            <p class="muted">
              Monthly allocation
            </p>
          </div>

          <span class="allocation-status ${budgetClass}">
            ${budgetStatus}
          </span>
        </div>

        <div class="allocation-amounts">
          <div>
            <span>Allocated</span>
            <strong>${money(planned)}</strong>
          </div>

          <div>
            <span>Spent</span>
            <strong>${money(spent)}</strong>
          </div>

          <div>
            <span>
              ${isOver ? "Over by" : "Remaining"}
            </span>

            <strong class="${isOver ? "negative" : "positive"}">
              ${money(isOver ? Math.abs(categoryRemaining) : categoryRemaining)}
            </strong>
          </div>
        </div>

        <div class="progress">
          <div
            class="fill ${isOver ? "over-fill" : ""}"
            style="width:${percentage}%"
          ></div>
        </div>

        <div class="allocation-bottom">
          <span>
            ${percentage.toFixed(1)}% used
          </span>

          <span>
            ${
              isOver
                ? "Excess charged to general budget"
                : "Available for this category"
            }
          </span>
        </div>

        ${
          isNear || isLimit || isOver
            ? `
              <p class="allocation-inline-alert ${
                isNear ? "approaching" : "critical"
              }">
                ${
                  isOver
                    ? `Over budget by ${money(
                        Math.abs(categoryRemaining),
                      )}. Excess is charged to the general budget.`
                    : isLimit
                      ? "Category budget fully used."
                      : `Approaching your limit. ${money(
                          categoryRemaining,
                        )} remaining.`
                }
              </p>
            `
            : ""
        }

      </div>
    `;
    })
    .join("");

  return `
    <!-- General spending summary -->
    <div class="cards">
      ${stat(
        "General spending budget",
        spendingBudget,
        "After planning allocations",
        "▤",
      )}

      ${stat("Total expenses", expenses, "All recorded payments", "↙")}

      ${stat(
        "General budget used",
        otherActual,
        "Unallocated expenses + overages",
        "◇",
      )}

      ${stat(
        "General balance left",
        remaining,
        "Available discretionary money",
        "◈",
        remaining < 0 ? "negative" : "positive",
      )}
    </div>

    <!-- General budget progress -->
    <section class="panel">
      <h2>General spending budget</h2>

      <p class="panel-sub">
        This budget covers expenses without
        allocations and any category overspending.
      </p>

      <div class="flex-between">
        <b>${money(otherActual)} used</b>

        <span class="muted">
          ${money(spendingBudget)} starting budget
        </span>
      </div>

      <div class="progress">
        <div
          class="fill ${remaining < 0 ? "over-fill" : ""}"
          style="width:${usedPercent}%"
        ></div>
      </div>

      <div class="flex-between">
        <span class="muted">
          General budget remaining
        </span>

        <b class="${remaining < 0 ? "negative" : "positive"}">
          ${money(remaining)}
        </b>
      </div>

      ${
        spendingBudget < 0
          ? `
            <p class="budget-warning">
              Your planned needs and savings
              already exceed your monthly income.
            </p>
          `
          : ""
      }

      ${
        remaining < 0
          ? `
            <p class="budget-warning">
              Your available spending budget
              has been exceeded.
            </p>
          `
          : ""
      }
    </section>

    <!-- Needs allocations -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Planned allocations</h2>

          <p class="panel-sub">
            Expenses automatically reduce their
            matching category budgets.
          </p>
        </div>
      </div>

      ${
        categoryBudgets.length
          ? `
            <div class="allocation-grid">
              ${allocationCards}
            </div>
          `
          : `
            <div class="empty">
              No allocations yet.
              Go to Planning to create your
              monthly category budgets.
            </div>
          `
      }
    </section>

    <!-- Spending breakdown -->
    <section class="panel">
      <h2>General budget deductions</h2>

      <p class="panel-sub">
        These are the amounts deducted from
        your general spending budget.
      </p>

      <div class="history-list">
        <div class="history-row">
          <span>Expenses without allocations</span>
          <b>${money(unallocatedTotal)}</b>
        </div>

        <div class="history-row">
          <span>Over-budget category expenses</span>
          <b>${money(overBudget)}</b>
        </div>

        <div class="history-row balance-row">
          <span>
            <b>Total general budget used</b>
          </span>

          <b>${money(otherActual)}</b>
        </div>
      </div>
    </section>

    <!-- All expense transactions -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>All expenses</h2>

          <p class="panel-sub">
            Record a transaction and choose its
            category. Matching allocations update
            automatically.
          </p>
        </div>

        <button
          class="secondary"
          data-add="expenses"
        >
          + Add expense
        </button>
      </div>

      ${entryTable(record.expenses, "expenses")}
    </section>
  `;
}

function regularSection(type, record, values) {
  const isIncome = type === "income";

  return `
    <div class="cards" style="margin-bottom:18px">
      ${stat(
        isIncome ? "Total income" : "Total savings",
        values[type],
        monthLabel(month),
      )}

      ${stat(
        "Remaining balance",
        values.remaining,
        "After expenses and savings",
      )}
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>
            ${isIncome ? "Income sources" : "Savings contributions"}
          </h2>

          <p class="panel-sub">
            ${
              isIncome
                ? "Record salary, bonuses and other earnings."
                : "Record money actually set aside."
            }
          </p>
        </div>

        <button
          class="secondary"
          data-add="${type}"
        >
          + Add
        </button>
      </div>

      ${entryTable(record[type], type)}
    </section>
  `;
}

// ==========================================
// MONTHLY HISTORY
// ==========================================

function history() {
  const months = Object.keys(state.months)
    .filter((key) => {
      const record = state.months[key];

      return (
        !!window.penvoriaCloud?.versions?.[key] ||
        !!window.penvoriaCloud?.drafts?.[key] ||
        ["income", "needs", "expenses", "savings"].some(
          (type) => Array.isArray(record?.[type]) && record[type].length > 0,
        )
      );
    })
    .sort()
    .reverse();

  return `
    <section class="panel">
      <h2>Monthly history</h2>

      <p class="panel-sub">
        View previously recorded months.
      </p>

      <div class="history-list">
        ${months
          .map((key) => {
            const values = totals(data(key));

            return `
              <div class="history-row">
                <div>
                  <b>${monthLabel(key)}</b>

                  <div class="muted">
                    Income ${money(values.income)}
                    · Expenses ${money(values.expenses)}
                    · Planned savings ${money(values.savings)}
                    · Transferred ${money(values.savingsTransferred)}
                  </div>
                </div>

                <div>
                  <b>${money(values.remaining)}</b>

                  <button
                    class="mini-btn"
                    data-month="${key}"
                  >
                    Open →
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

// ==========================================
// PAGE RENDERING
// ==========================================

const viewNames = {
  dashboard: "Overview",
  planning: "Planning",
  spending: "Spending",
  history: "Monthly history",
};

function render() {
  const record =
    view === "history"
      ? state.months[month] || {
          income: [],
          needs: [],
          expenses: [],
          savings: [],
        }
      : data();

  const values = totals(record);

  $("#monthPicker").value = month;
  window.PenvoriaBudgetMonthPicker?.sync(month);
  $("#pageTitle").textContent = viewNames[view];
  $("#crumb").textContent = viewNames[view];

  $("#pageSubtitle").textContent =
    `Manage your finances for ${monthLabel(month)}.`;

  // Planning and Spending have their own Add buttons.
  $("#addBtn").hidden = view !== "spending";

  if (view === "dashboard") {
    $("#app").innerHTML = overview(record, values);
  } else if (view === "planning") {
    $("#app").innerHTML = planning(record, values);
  } else if (view === "spending") {
    $("#app").innerHTML = spending(record, values);
  } else if (view === "history") {
    $("#app").innerHTML = history();
  }

  // Desktop sidebar.
  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  // iPhone bottom navigation.
  document.querySelectorAll("[data-mobile-view]").forEach((button) => {
    const active = button.dataset.mobileView === view;

    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  // Rendering does not trigger a cloud write.
}

// ==========================================
// FORM HELPERS
// ==========================================

function field(name, label, type, value, extra = "") {
  return `
    <div class="field">
      <label for="f_${name}">
        ${escapeHtml(label)}
      </label>

      <input
        id="f_${name}"
        name="${name}"
        type="${type}"
        value="${escapeHtml(value ?? "")}"
        ${extra}
        required
      >
    </div>
  `;
}

function categoryField(record, type) {
  const selected = record
    ? categoryOf(record, type)
    : type === "needs"
      ? "Groceries"
      : "Other / Custom";

  const custom = record ? categoryName(record, type) : "";

  return `
    <div class="field">
      <label for="f_category">
        Category
      </label>

      <select
        name="category"
        id="f_category"
      >
        ${CATEGORIES.map(
          (category) => `
            <option
              value="${escapeHtml(category)}"
              ${selected === category ? "selected" : ""}
            >
              ${escapeHtml(category)}
            </option>
          `,
        ).join("")}
      </select>
    </div>

    <div
      class="field"
      id="customCategoryRow"
      ${selected === "Other / Custom" ? "" : "hidden"}
    >
      <label for="f_customCategory">
        Custom category
      </label>

      <input
        id="f_customCategory"
        name="customCategory"
        maxlength="60"
        value="${escapeHtml(custom)}"
        placeholder="Enter category"
      >
    </div>
  `;
}

let scrollBeforeEntryModal = null;

// ==========================================
// ADD / EDIT MODAL
// ==========================================

function openModal(type, id = null) {
  const record = id ? data()[type].find((item) => item.id === id) : null;

  if (id && !record) return;

  editing = { type, id };

  $("#modalTitle").textContent =
    (id ? "Edit " : "Add ") +
    {
      income: "income",
      needs: "needs budget",
      expenses: "expense",
      savings: "savings",
    }[type];

  let html = "";

  if (type === "needs") {
    html = categoryField(record, type);
  } else {
    html = field(
      "title",
      type === "income"
        ? "Income source"
        : type === "expenses"
          ? "Expense description"
          : "Savings note",
      "text",
      record?.title || "",
      'maxlength="80"',
    );
  }

  if (type === "expenses") {
    html += categoryField(record, type);
  }

  // Planned amount or transaction amount.
  html += field(
    "amount",
    type === "needs"
      ? "Monthly planned amount (MVR)"
      : type === "income"
        ? "Planned income (MVR)"
        : type === "savings"
          ? "Planned savings (MVR)"
          : "Amount (MVR)",
    "number",
    record?.amount ?? "",
    'min="0.01" step="0.01"',
  );

  // Income actually received.
  if (type === "income") {
    html += field(
      "received",
      "Income received so far (MVR)",
      "number",
      record ? (record.received ?? record.amount) : 0,
      'min="0" step="0.01"',
    );
  }

  // Savings actually transferred.
  if (type === "savings") {
    html += field(
      "transferred",
      "Actually transferred to savings (MVR)",
      "number",
      record?.transferred ?? 0,
      'min="0" step="0.01"',
    );
  }

  if (type !== "needs") {
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));

    const lastDay = new Date(year, monthNumber, 0).getDate();

    const defaultDate =
      todayMonth() === month
        ? `${month}-${String(new Date().getDate()).padStart(2, "0")}`
        : `${month}-01`;

    html += field(
      "date",
      "Date",
      "date",
      record?.date || defaultDate,
      `min="${month}-01" max="${month}-${lastDay}"`,
    );
  }

  $("#formFields").innerHTML = html;

  // Enhance the native date input with the themed calendar.
  window.PenvoriaDatePicker?.mount($("#formFields"));

  // Decimal keyboard on phones.
  $("#formFields")
    .querySelectorAll('input[type="number"]')
    .forEach((input) => {
      input.inputMode = "decimal";
    });

  const standaloneMobile = window.matchMedia(
    "(max-width: 700px) and (display-mode: standalone)",
  ).matches;

  // Remember where the user was before opening the form.
  if (standaloneMobile) {
    const main = document.querySelector(".main");
    scrollBeforeEntryModal = main?.scrollTop ?? 0;
  }

  $("#overlay").classList.remove("hidden");

  document.body.classList.add("modal-open");

  updateMobileModalViewport();

  const modalElement = document.querySelector("#overlay .modal");

  if (modalElement) {
    modalElement.scrollTop = 0;
  }

  if (type === "expenses" && !record) {
    updateSpendingType();
  }

  // Desktop-only autofocus.
  if (!window.matchMedia("(max-width: 700px)").matches) {
    $("#formFields input, #formFields select")?.focus({ preventScroll: true });
  }
}

function updateSpendingType() {
  // Category classification is handled
  // by the existing allocation system.
}

function closeModal() {
  const overlay = $("#overlay");

  if (overlay.classList.contains("hidden")) {
    return;
  }

  const previousScroll = scrollBeforeEntryModal;
  scrollBeforeEntryModal = null;

  // Dismiss the iPhone keyboard first.
  if (document.activeElement && overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  // Hide the form.
  overlay.classList.add("hidden");

  // Unlock background scrolling.
  document.body.classList.remove("modal-open");

  updateMobileModalViewport();

  editing = null;

  // Restore the original page position.
  if (previousScroll !== null) {
    requestAnimationFrame(() => {
      const main = document.querySelector(".main");

      if (main) {
        main.scrollTop = previousScroll;
      }
    });
  }
}

// ==========================================
// IPHONE KEYBOARD / VIEWPORT
// ==========================================

function updateMobileModalViewport() {
  const overlay = document.getElementById("overlay");

  if (!overlay) return;

  const mobile = window.matchMedia("(max-width: 700px)").matches;

  const opened = !overlay.classList.contains("hidden");

  // Clear previous inline positioning.
  for (const property of [
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "height",
    "transform",
  ]) {
    overlay.style.removeProperty(property);
  }

  if (!mobile || !opened || !window.visualViewport) {
    overlay.style.removeProperty("--modal-visual-top");

    overlay.style.removeProperty("--modal-visual-height");

    return;
  }

  const viewport = window.visualViewport;

  overlay.style.setProperty(
    "--modal-visual-top",
    `${Math.max(0, Math.round(viewport.offsetTop))}px`,
  );

  overlay.style.setProperty(
    "--modal-visual-height",
    `${Math.round(viewport.height)}px`,
  );
}

window.visualViewport?.addEventListener("resize", updateMobileModalViewport);

window.addEventListener("resize", updateMobileModalViewport);

window.addEventListener("orientationchange", updateMobileModalViewport);

// ==========================================
// FORM EVENTS
// ==========================================

$("#formFields").addEventListener("change", (event) => {
  if (event.target.id === "f_category") {
    const isCustom = event.target.value === "Other / Custom";

    $("#customCategoryRow").hidden = !isCustom;

    updateSpendingType();
  }
});

$("#entryForm").addEventListener("submit", (event) => {
  event.preventDefault();

  if (!editing) return;

  const formData = new FormData(event.currentTarget);

  const amount = round(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid positive amount.");
    return;
  }

  const { type, id } = editing;

  const record = {
    id: id || makeId(),
    amount,
  };

  // Actual received income.
  if (type === "income") {
    const received = Number(formData.get("received"));

    if (!Number.isFinite(received) || received < 0) {
      alert("Enter a valid received income amount.");
      return;
    }

    record.received = round(received);
  }

  // Actual savings transfers.
  if (type === "savings") {
    const transferred = Number(formData.get("transferred"));

    if (!Number.isFinite(transferred) || transferred < 0) {
      alert("Enter a valid transferred savings amount.");
      return;
    }

    record.transferred = round(transferred);
  }

  if (type === "needs" || type === "expenses") {
    record.category = String(formData.get("category") || "Other / Custom");

    if (record.category === "Other / Custom") {
      record.customCategory = String(
        formData.get("customCategory") || "",
      ).trim();

      if (!record.customCategory) {
        alert("Enter a custom category.");
        return;
      }
    }
  }

  record.title =
    type === "needs"
      ? categoryName(record, "needs")
      : String(formData.get("title") || "").trim();

  if (!record.title) {
    alert("Enter a description.");
    return;
  }

  if (type !== "needs") {
    record.date = String(formData.get("date") || "");

    if (!record.date.startsWith(month + "-")) {
      alert("Select a date within the current month.");
      return;
    }
  }

  if (type === "expenses") {
    const previous = id ? data().expenses.find((item) => item.id === id) : null;

    record.type = previous && isNeed(previous) ? "need" : "other";
  }

  const list = data()[type];

  const index = id ? list.findIndex((item) => item.id === id) : -1;

  if (index >= 0) {
    // Retain recurrence marker when editing the monthly entry.
    if (list[index].recurringTemplateId) {
      record.recurringTemplateId = list[index].recurringTemplateId;
    }
    list[index] = record;
  } else {
    list.push(record);
  }

  // Save only after actual changes.
  save();

  closeModal();
  render();
});

$("#closeModal").onclick = closeModal;
$("#cancelBtn").onclick = closeModal;

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

// ==========================================
// APPLICATION EVENTS
// ==========================================

$("#app").addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) return;

  if (button.hasAttribute("data-copy-previous")) {
    copyPreviousMonthPlanning();
    return;
  }

  if (button.dataset.add) {
    openModal(button.dataset.add);
  }

  if (button.dataset.edit) {
    openModal(button.dataset.edit, button.dataset.id);
  }

  if (button.dataset.delete) {
    if (confirm("Delete this entry?")) {
      const type = button.dataset.delete;

      data()[type] = data()[type].filter(
        (item) => item.id !== button.dataset.id,
      );

      save();
      render();
    }
  }

  if (button.dataset.month) {
    month = button.dataset.month;
    view = "dashboard";
    render();
  }
});

// Desktop navigation.
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () => {
    view = button.dataset.view;

    $("#sidebar").classList.remove("open");

    render();
  };
});

// iPhone bottom navigation.
document.querySelectorAll("[data-mobile-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedView = button.dataset.mobileView;

    view = selectedView;

    $("#sidebar").classList.remove("open");

    render();

    const standaloneMobile = window.matchMedia(
      "(max-width: 700px) and (display-mode: standalone)",
    ).matches;

    if (standaloneMobile) {
      document.querySelector(".main")?.scrollTo({
        top: 0,
        behavior: "instant",
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "instant",
      });
    }
  });
});

$("#addBtn").onclick = () => {
  if (view === "spending") {
    openModal("expenses");
  }
};

$("#monthPicker").onchange = (event) => {
  const selected = event.target.value;

  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
    month = selected;
    render();
  }
};

$("#menuBtn").onclick = () => {
  $("#sidebar").classList.toggle("open");
};

// Theme logic is managed by theme.js.
