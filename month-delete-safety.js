"use strict";

/*
 * Fail-closed safeguard for deleting monthly budgets that own savings goals.
 * Goals are stored inside the creation month's JSON. Removing that record
 * would orphan later linked transfers, including transfers to archived goals.
 */
(function monthDeleteSafety() {
  function inspect(months, key) {
    const records = months && typeof months === "object" ? months : {};
    const record = Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null;
    const goals = Array.isArray(record?.goals) ? record.goals : [];
    const ids = new Set(goals.filter(g => g && typeof g.id === "string" && g.id).map(g => g.id));
    const linkedMonths = [];
    let linkedTransfers = 0;
    for (const [month, data] of Object.entries(records)) {
      if (month < key || !Array.isArray(data?.savings)) continue;
      let count = 0;
      for (const saving of data.savings) {
        if (saving && ids.has(saving.goalId)) count++;
      }
      if (count) {
        linkedMonths.push(month);
        linkedTransfers += count;
      }
    }
    return {
      allowed: goals.length === 0,
      goalCount: goals.length,
      linkedTransfers,
      linkedMonths,
    };
  }

  function requireSafe(months, key) {
    const result = inspect(months, key);
    if (!result.allowed) {
      throw new Error(
        "Deletion blocked: this month owns " + result.goalCount +
        " savings goal(s)" + (result.linkedTransfers
          ? " with " + result.linkedTransfers + " linked transfer(s)"
          : "") +
        ". Keep this month to preserve goal definitions and history. " +
        "Archiving a goal does not make its creation month safe to delete."
      );
    }
    return result;
  }

  const api = { inspect, requireSafe };
  if (typeof window !== "undefined") window.PenvoriaMonthDeleteSafety = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
