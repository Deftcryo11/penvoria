"use strict";
/* Display-only classification; does not change recurring templates or payments. */
(() => {
  const DEFS = [
    {
      key: "bills", title: "Bills & Payments",
      description: "Monthly bill templates. Record actual payments in the schedule above.",
      empty: "No monthly bill templates yet."
    },
    {
      key: "income", title: "Expected Income",
      description: "Recurring planned income. Record received amounts separately in Planning.",
      empty: "No recurring income plans yet."
    },
    {
      key: "savings", title: "Planned Savings",
      description: "Recurring savings goals. Actual transfers are tracked separately in Planning.",
      empty: "No recurring savings plans yet."
    },
    {
      key: "allocations", title: "Other Allocations",
      description: "Recurring Needs budgets, including bills saved as Needs. Edit a template to Monthly bill (Needs plan) to track payments.",
      empty: "No recurring Needs allocations yet."
    }
  ];
  function groupKey(type) {
    if (type === "expenses") return "bills";
    if (type === "income") return "income";
    if (type === "savings") return "savings";
    return "allocations";
  }
  function groupRecurringTemplates(templates) {
    const groups = DEFS.map(def => ({ ...def, items: [] }));
    const lookup = Object.fromEntries(groups.map(group => [group.key, group]));
    for (const template of Array.isArray(templates) ? templates : []) {
      if (!template || typeof template !== "object") continue;
      lookup[groupKey(template.entry_type)].items.push(template);
    }
    return groups;
  }
  const api = { groupKey, groupRecurringTemplates };
  if (typeof window !== "undefined") window.PenvoriaRecurringGroups = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
