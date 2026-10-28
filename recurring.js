"use strict";

/*
  Penvoria v1.1 — Recurring Transactions

  Recurring bills create monthly Needs allocations.
  Actual payments are recorded separately in Spending.
  Nothing is added automatically.
*/

(() => {
  const root = document.getElementById("app");

  const types = ["income", "needs", "savings", "expenses"];

  const labels = {
    income: "Planned income",
    needs: "Needs allocation",
    savings: "Planned savings",
    expenses: "Monthly bill (Needs plan)",
  };

  let templates = [];
  let loaded = false;
  let errorText = "";
  let busy = false;
  let selectedId = "closed";
  let ownerId = null;
  let generation = 0;

  const hasAccess = () =>
    window.penvoriaCloud?.ready && window.penvoriaCloud?.user?.id === ownerId;

  function reset() {
    generation++;
    ownerId = null;
    templates = [];
    loaded = false;
    errorText = "";
    busy = false;
    selectedId = "closed";

    if (view === "recurring") {
      view = "dashboard";
    }
  }

  function setError(message) {
    errorText = message || "Unexpected recurring-template error.";

    const alert = root.querySelector("#pr-error");

    if (view === "recurring" && alert) {
      alert.textContent = errorText;
      alert.hidden = false;
    } else if (view === "recurring" && hasAccess()) {
      render();
    }
  }

  function clientTable() {
    return window.penvoriaCloud.client.from("recurring_templates");
  }

  async function loadForUser(userId) {
    const token = ++generation;

    ownerId = userId;
    templates = [];
    loaded = false;
    errorText = "";

    if (view === "recurring") {
      render();
    }

    try {
      const { data: rows, error } = await clientTable()
        .select(
          "id,user_id,entry_type,title," +
            "category,custom_category,amount," +
            "day_of_month,start_month,active",
        )
        .eq("user_id", userId)
        .order("created_at", {
          ascending: true,
        });

      if (error) throw error;

      if (token !== generation || !hasAccess()) {
        return;
      }

      templates = rows || [];
      loaded = true;
    } catch (error) {
      if (token !== generation) return;

      loaded = false;

      errorText = "Unable to load recurring templates: " + error.message;

      console.error("Penvoria recurring load error:", error);
    }

    if (view === "recurring" && hasAccess()) {
      render();
    }
  }

  const safe = (value) => escapeHtml(value == null ? "" : value);

  function monthDate(monthKey, dayNumber) {
    const year = Number(monthKey.slice(0, 4));
    const m = Number(monthKey.slice(5, 7));

    const last = new Date(year, m, 0).getDate();

    const day = Math.min(Math.max(1, Number(dayNumber)), last);

    return monthKey + "-" + String(day).padStart(2, "0");
  }

  function categoryRecord(template) {
    return {
      category: template.category,

      customCategory: template.custom_category || template.customCategory || "",

      title: template.title,
    };
  }

  function sameCategory(a, b) {
    return (
      categoryName(a, "needs") === categoryName(categoryRecord(b), "needs")
    );
  }

  /*
    A recurring bill is a planned allocation,
    not an automatically recorded expense.
  */
  function targetTypeFor(template) {
    return template.entry_type === "expenses" ? "needs" : template.entry_type;
  }

  function duplicateReason(template) {
    const targetType = targetTypeFor(template);

    const list = data()[targetType] || [];

    // Includes recurring items from older versions.
    const alreadyAdded = types.some((type) =>
      (data()[type] || []).some(
        (item) => item.recurringTemplateId === template.id,
      ),
    );

    if (alreadyAdded) {
      return "Already added this month";
    }

    /*
      Prevent duplicate category allocations,
      including categories copied from last month.
    */
    if (
      targetType === "needs" &&
      list.some((item) => sameCategory(item, template))
    ) {
      return "Category already allocated";
    }

    /*
      Avoid duplicate planned income/savings
      with matching descriptions.
    */
    if (
      ["income", "savings"].includes(targetType) &&
      list.some(
        (item) =>
          String(item.title || "")
            .trim()
            .toLowerCase() ===
          String(template.title || "")
            .trim()
            .toLowerCase(),
      )
    ) {
      return "Matching plan already exists";
    }

    return "";
  }

  function statusOf(template) {
    const startingMonth = String(template.start_month).slice(0, 7);

    if (month < startingMonth) {
      return "Not started";
    }

    const duplicate = duplicateReason(template);

    if (duplicate) {
      return duplicate;
    }

    if (!template.active) {
      return "Paused";
    }

    return "Ready for review";
  }

  function currentTemplate() {
    return templates.find((template) => template.id === selectedId) || null;
  }

  function categoriesHTML(selected = "Other / Custom") {
    return CATEGORIES.map(
      (category) => `
      <option
        value="${safe(category)}"
        ${category === selected ? "selected" : ""}
      >
        ${safe(category)}
      </option>
    `,
    ).join("");
  }

  function editorHTML() {
    const template = currentTemplate();

    return `
      <form
        id="pr-form"
        class="pr-editor"
        ${selectedId === "closed" ? "hidden" : ""}
      >
        <h3>
          ${template ? "Edit recurring template" : "New recurring template"}
        </h3>

        <div class="pr-fields">
          <label>
            Transaction type

            <select
              name="entry_type"
              id="pr-type"
              required
            >
              ${types
                .map(
                  (type) => `
                <option
                  value="${type}"
                  ${
                    type === (template?.entry_type || "expenses")
                      ? "selected"
                      : ""
                  }
                >
                  ${safe(labels[type])}
                </option>
              `,
                )
                .join("")}
            </select>
          </label>

          <label>
            Description

            <input
              name="title"
              maxlength="80"
              required
              value="${safe(template?.title || "")}"
              placeholder="e.g. Internet bill"
            >
          </label>

          <label>
            Amount (MVR)

            <input
              name="amount"
              type="number"
              inputmode="decimal"
              min="0.01"
              step="0.01"
              required
              value="${safe(template?.amount ?? "")}"
            >
          </label>

          <label>
            Day of month

            <input
              name="day_of_month"
              type="number"
              min="1"
              max="31"
              required
              value="${safe(template?.day_of_month || 1)}"
            >
          </label>

          <label>
            Starting month

            <input
              name="start_month"
              type="month"
              required
              value="${safe(
                String(template?.start_month || month).slice(0, 7),
              )}"
            >
          </label>

          <label
            id="pr-category-field"
            class="pr-category-field"
          >
            Category

            <select
              name="category"
              id="pr-category"
            >
              ${categoriesHTML(template?.category)}
            </select>
          </label>

          <label
            id="pr-custom-field"
            class="pr-custom-field"
          >
            Custom category

            <input
              name="custom_category"
              maxlength="60"
              value="${safe(template?.custom_category || "")}"
              placeholder="Category name"
            >
          </label>
        </div>

        <p class="pr-note">
          Recurring bills are planned under Needs,
          not recorded as paid. Add the actual
          expense in Spending when you pay it.

          Income and savings start with zero
          received/transferred.
        </p>

        <div class="pr-actions">
          <button
            class="primary"
            type="submit"
            ${busy ? "disabled" : ""}
          >
            ${template ? "Save changes" : "Save template"}
          </button>

          <button
            type="button"
            class="secondary"
            data-pr-close
          >
            Cancel
          </button>
        </div>
      </form>
    `;
  }

  function rowHTML(template) {
    const status = statusOf(template);

    const ready = status === "Ready for review";

    const when = monthDate(month, template.day_of_month);

    const category = ["needs", "expenses"].includes(template.entry_type)
      ? ` · ${safe(
          categoryName(categoryRecord(template), template.entry_type),
        )}`
      : "";

    const buttonLabel = ["needs", "expenses"].includes(template.entry_type)
      ? "Add to Planning"
      : "Add plan";

    return `
      <article class="pr-item">
        <div class="pr-item-top">
          <div>
            <strong>
              ${safe(template.title)}
            </strong>

            <p>
              ${safe(labels[template.entry_type])}
              ${category}
            </p>

            <small>
              ${safe(when)} · ${money(template.amount)}
            </small>
          </div>

          <span
            class="pr-status ${ready ? "pr-ready" : ""}"
          >
            ${safe(status)}
          </span>
        </div>

        <div class="pr-actions">
          <button
            class="primary"
            data-pr-post="${safe(template.id)}"
            ${ready && !busy ? "" : "disabled"}
            type="button"
          >
            ${buttonLabel}
          </button>

          <button
            class="secondary"
            data-pr-edit="${safe(template.id)}"
            ${busy ? "disabled" : ""}
            type="button"
          >
            Edit
          </button>

          <button
            class="secondary"
            data-pr-toggle="${safe(template.id)}"
            ${busy ? "disabled" : ""}
            type="button"
          >
            ${template.active ? "Pause" : "Resume"}
          </button>

          <button
            class="mini-btn danger"
            data-pr-delete="${safe(template.id)}"
            ${busy ? "disabled" : ""}
            type="button"
          >
            Delete
          </button>
        </div>
      </article>
    `;
  }

  function recurringHTML() {
    if (!hasAccess()) {
      return `
        <section class="panel">
          <h2>Recurring transactions</h2>

          <p class="panel-sub">
            Sign in to manage your recurring templates.
          </p>
        </section>
      `;
    }

    return `
      <section class="panel pr-panel">
        <div class="panel-head">
          <div>
            <h2>Recurring transactions</h2>

            <p class="panel-sub">
              Review templates for
              ${safe(monthLabel(month))}.

              Nothing is recorded automatically.
            </p>
          </div>

          <div class="pr-actions">
            <button
              type="button"
              class="secondary"
              data-pr-refresh
              ${busy ? "disabled" : ""}
            >
              Refresh
            </button>

            <button
              type="button"
              class="primary"
              data-pr-new
              ${busy ? "disabled" : ""}
            >
              + New template
            </button>
          </div>
        </div>

        <p
          id="pr-error"
          class="pr-error"
          role="alert"
          ${errorText ? "" : "hidden"}
        >
          ${safe(errorText)}
        </p>

        ${
          loaded
            ? `
              <p class="pr-note">
                ${templates.length} saved template(s)
                · Showing selected month:
                ${safe(monthLabel(month))}
              </p>
            `
            : errorText
              ? ""
              : `
                <p class="pr-note">
                  Loading templates…
                </p>
              `
        }

        ${
          loaded
            ? `
              <div class="pr-list">
                ${
                  templates.length
                    ? templates.map(rowHTML).join("")
                    : `
                      <div class="empty">
                        No recurring templates yet.
                        Create your first one.
                      </div>
                    `
                }
              </div>
            `
            : ""
        }

        ${loaded && selectedId !== "closed" ? editorHTML() : ""}
      </section>
    `;
  }

  /*
    Preserve the rendering features installed
    by app.js and features.js.
  */
  const previousRender = render;

  viewNames.recurring = "Recurring transactions";

  render = function (...args) {
    const result = previousRender(...args);

    if (view === "recurring") {
      root.innerHTML = recurringHTML();

      const typeField = root.querySelector("#pr-type");

      if (typeField) {
        updateFields();
      }
    } else if (view === "planning") {
      root.insertAdjacentHTML(
        "afterbegin",
        `
          <section class="panel pr-shortcut">
            <div>
              <h2>Recurring transactions</h2>

              <p class="panel-sub">
                Review monthly bills and allocations.
                Record actual payments later in Spending.
              </p>
            </div>

            <button
              type="button"
              class="secondary"
              data-pr-open
            >
              Review recurring transactions
            </button>
          </section>
        `,
      );
    }

    return result;
  };

  function updateFields() {
    const form = root.querySelector("#pr-form");

    if (!form) return;

    const entryType = form.elements.namedItem("entry_type").value;

    const usesCategory = ["needs", "expenses"].includes(entryType);

    const categoryRow = form.querySelector("#pr-category-field");

    categoryRow.hidden = !usesCategory;

    const isCustom =
      form.elements.namedItem("category").value === "Other / Custom";

    const customRow = form.querySelector("#pr-custom-field");

    customRow.hidden = !usesCategory || !isCustom;

    form.elements.namedItem("custom_category").required =
      usesCategory && isCustom;
  }

  async function refresh() {
    if (!hasAccess() || busy) return;

    await loadForUser(ownerId);
  }

  async function saveTemplate(form) {
    if (!hasAccess() || busy || !navigator.onLine) {
      setError(
        "An internet connection is required " + "to save recurring templates.",
      );
      return;
    }

    const fields = new FormData(form);

    const entryType = String(fields.get("entry_type") || "");

    const title = String(fields.get("title") || "").trim();

    const amountText = String(fields.get("amount") || "").trim();

    const amount = Number(amountText);

    const day = Number(fields.get("day_of_month"));

    const start = String(fields.get("start_month") || "");

    const category = String(fields.get("category") || "Other / Custom");

    const custom = String(fields.get("custom_category") || "").trim();

    const valid =
      types.includes(entryType) &&
      title.length > 0 &&
      title.length <= 80 &&
      Number.isFinite(amount) &&
      amount >= 0.01 &&
      amount <= 999999999999.99 &&
      /^\d+(?:\.\d{1,2})?$/.test(amountText) &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= 31 &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(start) &&
      (!["needs", "expenses"].includes(entryType) ||
        (CATEGORIES.includes(category) &&
          (category !== "Other / Custom" || custom.length > 0)));

    if (!valid) {
      setError(
        "Check the type, amount, category, " + "day and starting month.",
      );
      return;
    }

    const old = currentTemplate();

    const row = {
      entry_type: entryType,

      title,

      amount: Math.round(amount * 100) / 100,

      day_of_month: day,

      start_month: start + "-01",

      category: ["needs", "expenses"].includes(entryType)
        ? category
        : "Other / Custom",

      custom_category:
        ["needs", "expenses"].includes(entryType) &&
        category === "Other / Custom"
          ? custom
          : null,
    };

    const userId = ownerId;
    const token = generation;

    busy = true;
    let saved = false;

    try {
      let result;

      if (old) {
        result = await clientTable()
          .update(row)
          .eq("user_id", userId)
          .eq("id", old.id)
          .select()
          .single();
      } else {
        result = await clientTable()
          .insert({
            ...row,
            user_id: userId,
          })
          .select()
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      if (token !== generation || !hasAccess()) {
        return;
      }

      const item = result.data;

      const index = templates.findIndex((template) => template.id === item.id);

      if (index >= 0) {
        templates[index] = item;
      } else {
        templates.push(item);
      }

      selectedId = "closed";
      errorText = "";
      saved = true;
    } catch (error) {
      if (token === generation) {
        setError("Could not save template: " + error.message);
      }
    } finally {
      if (token === generation) {
        busy = false;

        if (saved && view === "recurring") {
          render();
        } else {
          root
            .querySelector('#pr-form button[type="submit"]')
            ?.removeAttribute("disabled");
        }
      }
    }
  }

  async function modifyTemplate(id, operation) {
    if (!hasAccess() || busy || !navigator.onLine) {
      setError("Connect to the internet " + "before changing templates.");
      return;
    }

    const template = templates.find((item) => item.id === id);

    if (!template) return;

    if (
      operation === "delete" &&
      !confirm(
        `Delete recurring template “${template.title}”? ` +
          "Existing recorded entries will be kept.",
      )
    ) {
      return;
    }

    const token = generation;
    const userId = ownerId;

    busy = true;

    try {
      const result =
        operation === "delete"
          ? await clientTable()
              .delete()
              .eq("user_id", userId)
              .eq("id", id)
              .select("id")
          : await clientTable()
              .update({
                active: !template.active,
              })
              .eq("user_id", userId)
              .eq("id", id)
              .select()
              .single();

      if (result.error) {
        throw result.error;
      }

      if (token !== generation || !hasAccess()) {
        return;
      }

      if (operation === "delete") {
        if (!result.data?.length) {
          throw new Error("Template was not found.");
        }

        templates = templates.filter((item) => item.id !== id);
      } else {
        templates = templates.map((item) =>
          item.id === id ? result.data : item,
        );
      }

      selectedId = "closed";
      errorText = "";
    } catch (error) {
      if (token === generation) {
        errorText = "Could not change template: " + error.message;
      }
    } finally {
      if (token === generation) {
        busy = false;

        if (view === "recurring") {
          render();
        }
      }
    }
  }

  /*
    Confirming an expense-type recurring template
    creates a Needs allocation, not a payment.
  */
  function postTemplate(id) {
    if (!hasAccess() || !loaded || busy) {
      return;
    }

    const template = templates.find((item) => item.id === id);

    if (!template || statusOf(template) !== "Ready for review") {
      return;
    }

    const targetMonth = month;

    const targetType = targetTypeFor(template);

    const dueDate = monthDate(targetMonth, template.day_of_month);

    const isBill = template.entry_type === "expenses";

    const action = isBill
      ? "Plan recurring bill"
      : "Add planned " + labels[template.entry_type].toLowerCase();

    const details = isBill
      ? "This creates a Needs allocation only. " +
        "Record the payment separately " +
        "in Spending when paid."
      : "This creates a planned entry, " + "not an actual payment.";

    const approved = confirm(
      `${action} “${template.title}” ` +
        `for ${monthLabel(targetMonth)}?\n\n` +
        `Amount: ${money(template.amount)}\n` +
        `Scheduled: ${dueDate}\n\n` +
        details,
    );

    if (!approved) return;

    // Recheck after confirmation.
    if (
      !hasAccess() ||
      month !== targetMonth ||
      statusOf(template) !== "Ready for review"
    ) {
      return;
    }

    const record = {
      id: makeId(),

      recurringTemplateId: template.id,

      amount: Number(template.amount),

      title: template.title,
    };

    if (targetType === "needs") {
      record.category = template.category;

      if (template.category === "Other / Custom") {
        record.customCategory = template.custom_category;
      }

      record.title = categoryName(record, "needs");

      if (isBill) {
        record.recurringBillName = template.title;

        record.recurringDueDate = dueDate;
      }
    } else {
      record.date = dueDate;
    }

    if (targetType === "income") {
      record.received = 0;
    }

    if (targetType === "savings") {
      record.transferred = 0;
    }

    /*
      Only add the planned allocation.

      Actual spending is recorded later by
      the user through the Spending page.
    */
    data()[targetType].push(record);

    save();
    render();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button) return;

    if (button.hasAttribute("data-pr-open")) {
      view = "recurring";
      selectedId = "closed";
      render();
      return;
    }

    if (view !== "recurring") return;

    if (button.hasAttribute("data-pr-new")) {
      selectedId = null;
      render();
    } else if (button.hasAttribute("data-pr-close")) {
      selectedId = "closed";
      render();
    } else if (button.hasAttribute("data-pr-refresh")) {
      void refresh();
    } else if (button.dataset.prEdit) {
      selectedId = button.dataset.prEdit;

      render();
    } else if (button.dataset.prPost) {
      postTemplate(button.dataset.prPost);
    } else if (button.dataset.prToggle) {
      void modifyTemplate(button.dataset.prToggle, "toggle");
    } else if (button.dataset.prDelete) {
      void modifyTemplate(button.dataset.prDelete, "delete");
    }
  });

  root.addEventListener("change", (event) => {
    if (
      view === "recurring" &&
      (event.target.id === "pr-type" || event.target.id === "pr-category")
    ) {
      updateFields();
    }
  });

  root.addEventListener("submit", (event) => {
    if (view === "recurring" && event.target.id === "pr-form") {
      event.preventDefault();

      void saveTemplate(event.target);
    }
  });

  window.PenvoriaRecurring = {
    loadForUser,
    reset,
  };
})();
