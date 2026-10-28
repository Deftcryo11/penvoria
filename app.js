"use strict";

// Penvoria personal finance application
const STORAGE = "velmora-preview-v1";
const THEME = "velmora-theme";

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

      const isOver = categoryRemaining < 0;

      return `
        <div class="allocation-card">
          <div class="allocation-top">
            <div>
              <h3>${escapeHtml(category)}</h3>

              <p class="muted">
                Monthly allocation
              </p>
            </div>

            <span class="allocation-status ${isOver ? "over" : ""}">
              ${isOver ? "Over budget" : "Allocated"}
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
                ${money(
                  isOver ? Math.abs(categoryRemaining) : categoryRemaining,
                )}
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
  const months = Object.keys(state.months).sort().reverse();

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
  const record = data();
  const values = totals(record);

  $("#monthPicker").value = month;
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

  // Decimal keyboard on phones.
  $("#formFields")
    .querySelectorAll('input[type="number"]')
    .forEach((input) => {
      input.inputMode = "decimal";
    });

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

  if (document.activeElement && overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  overlay.classList.add("hidden");

  document.body.classList.remove("modal-open");

  updateMobileModalViewport();

  editing = null;
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

    window.scrollTo({
      top: 0,
      behavior: "instant",
    });
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

// ==========================================
// DARK MODE
// ==========================================

if (localStorage.getItem(THEME) === "dark") {
  document.body.classList.add("dark");
}

$("#themeBtn").onclick = () => {
  document.body.classList.toggle("dark");

  localStorage.setItem(
    THEME,
    document.body.classList.contains("dark") ? "dark" : "light",
  );
};

// ==========================================
// FINANCIAL DATA BACKUP
// ==========================================

async function exportPenvoriaBackup() {
  if (!window.penvoriaCloud?.user) {
    alert("Please sign in before exporting a backup.");
    return;
  }

  const months = state.months || {};

  if (!Object.keys(months).length) {
    alert("There are no monthly budgets to export.");
    return;
  }

  const json = JSON.stringify(
    {
      application: "Penvoria",
      format_version: 1,
      exported_at: new Date().toISOString(),
      month_count: Object.keys(months).length,
      months,
    },
    null,
    2,
  );

  const blob = new Blob([json], {
    type: "application/json",
  });

  const filename = `penvoria-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  // On supported iPhones,
  // use the system Share menu.
  if (
    typeof File !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    const file = new File([blob], filename, {
      type: "application/json",
    });

    if (
      navigator.canShare({
        files: [file],
      })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: "Penvoria Financial Backup",
        });

        return;
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.warn("Share failed, falling back to download:", error);
      }
    }
  }

  // Browser download fallback.
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document
  .getElementById("exportBackupBtn")
  ?.addEventListener("click", exportPenvoriaBackup);

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
