"use strict";

// Penvoria v1.1: month-scoped CSV/PDF reports.
// JSON backup continues to use the original export.js handler.
(() => {
  const format = document.getElementById("exportFormat");
  const originalButton = document.getElementById("exportReportBtn");
  const container = document.querySelector(".export-controls");
  if (!format || !originalButton || !container) return;

  const scope = document.createElement("div");
  scope.className = "report-range-controls";
  scope.innerHTML = `
    <label class="report-scope-label">
      <span class="sr-only">Report period</span>
      <select id="reportScope" aria-label="Report period">
        <option value="selected">Selected month</option>
        <option value="range">Month range</option>
        <option value="all">All loaded months</option>
      </select>
    </label>
    <label class="report-month-label" id="reportFromLabel" hidden>
      From <input id="reportFrom" type="month" aria-label="From month">
    </label>
    <label class="report-month-label" id="reportToLabel" hidden>
      To <input id="reportTo" type="month" aria-label="To month">
    </label>
  `;
  const reportButton = document.createElement("button");
  reportButton.type = "button";
  reportButton.id = "rangeExportBtn";
  reportButton.className = "secondary backup-btn";
  reportButton.textContent = "Export report";
  container.append(scope, reportButton);

  const period = scope.querySelector("#reportScope");
  const from = scope.querySelector("#reportFrom");
  const to = scope.querySelector("#reportTo");
  const fromLabel = scope.querySelector("#reportFromLabel");
  const toLabel = scope.querySelector("#reportToLabel");
  const validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

  function updateControls() {
    const isReport = format.value !== "json";
    const isRange = isReport && period.value === "range";
    scope.hidden = !isReport;
    reportButton.hidden = !isReport;
    originalButton.hidden = isReport;
    fromLabel.hidden = !isRange;
    toLabel.hidden = !isRange;
  }
  format.addEventListener("change", updateControls);
  period.addEventListener("change", updateControls);
  updateControls();

  const amount = (n) => Number(n || 0).toFixed(2);
  const types = ["income", "needs", "savings", "expenses"];
  const normal = (raw) =>
    Object.fromEntries(
      types.map((type) => [type, Array.isArray(raw?.[type]) ? raw[type] : []]),
    );

  function selectedMonths() {
    const all = Object.entries(state.months || {})
      .filter(
        ([key, raw]) =>
          validMonth(key) &&
          types.some(
            (type) => Array.isArray(raw?.[type]) && raw[type].length > 0,
          ),
      )
      .sort(([a], [b]) => a.localeCompare(b));

    const mode = period.value;
    if (mode === "all") return all;
    if (mode === "selected") return all.filter(([key]) => key === month);

    const start = from.value;
    const end = to.value;
    if (!validMonth(start) || !validMonth(end) || start > end) {
      throw new Error(
        "Choose a valid From and To month (From must be earlier).",
      );
    }
    return all.filter(([key]) => key >= start && key <= end);
  }

  function getReport() {
    const months = selectedMonths();
    if (!months.length) {
      throw new Error("No recorded financial entries for the selected period.");
    }
    const summary = [];
    const entries = [];

    for (const [key, raw] of months) {
      const record = normal(raw);
      const t = totals(record);
      summary.push([
        key,
        t.income,
        t.incomeReceived,
        t.needBudget,
        t.savings,
        t.savingsTransferred,
        t.expenses,
        t.cashRemainder,
      ]);

      for (const item of record.income) {
        entries.push([
          key,
          "Income",
          item.title || "Income",
          "",
          item.date || "",
          item.amount,
          item.received ?? item.amount,
        ]);
      }
      for (const item of record.needs) {
        entries.push([
          key,
          "Needs",
          categoryName(item, "needs"),
          categoryName(item, "needs"),
          "",
          item.amount,
          "",
        ]);
      }
      for (const item of record.savings) {
        entries.push([
          key,
          "Savings",
          item.title || "Savings",
          "",
          item.date || "",
          item.amount,
          item.transferred ?? 0,
        ]);
      }
      for (const item of record.expenses) {
        entries.push([
          key,
          "Expense",
          item.title || "Expense",
          categoryName(item, "expenses"),
          item.date || "",
          "",
          item.amount,
        ]);
      }
    }
    const start = months[0][0];
    const end = months[months.length - 1][0];
    return { summary, entries, start, end };
  }

  function csvCell(value) {
    let text = String(value ?? "");
    // Protect spreadsheet readers against formulas in descriptions/categories.
    if (/^[\s]*[=+@\-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) {
      text = "'" + text;
    }
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function makeCsv(report) {
    const header1 = [
      "Month",
      "Planned income",
      "Income received",
      "Needs planned",
      "Savings planned",
      "Savings transferred",
      "Expenses paid",
      "Cash remainder",
    ];
    const header2 = [
      "Month",
      "Type",
      "Description",
      "Category",
      "Date",
      "Planned",
      "Actual",
    ];
    const lines = [
      ["Penvoria financial summary (MVR)"],
      header1,
      ...report.summary.map((row) => [row[0], ...row.slice(1).map(amount)]),
      [],
      ["Entries (MVR)"],
      header2,
      ...report.entries.map((row) =>
        row.map((value, i) => (i >= 5 && value !== "" ? amount(value) : value)),
      ),
    ];
    return (
      "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n")
    );
  }

  function makePdf(report) {
    const PDF = window.jspdf?.jsPDF;
    if (!PDF)
      throw new Error("PDF library did not load. Try CSV or reload online.");
    const pdf = new PDF({ orientation: "landscape" });
    if (typeof pdf.autoTable !== "function") {
      throw new Error("PDF tables library did not load. Reload while online.");
    }
    pdf.setFontSize(16);
    pdf.text("Penvoria | Financial report", 14, 17);
    pdf.setFontSize(10);
    pdf.text(`${report.start} to ${report.end} | Currency: MVR`, 14, 24);
    pdf.autoTable({
      startY: 30,
      head: [
        [
          "Month",
          "Income planned",
          "Received",
          "Needs",
          "Savings planned",
          "Transferred",
          "Expenses",
          "Cash remaining",
        ],
      ],
      body: report.summary.map((row) => [row[0], ...row.slice(1).map(amount)]),
      styles: { fontSize: 8 },
    });
    let y = pdf.lastAutoTable.finalY + 12;
    if (y > pdf.internal.pageSize.getHeight() - 22) {
      pdf.addPage();
      y = 17;
    }
    pdf.setFontSize(12);
    pdf.text("Recorded and planned entries", 14, y);
    pdf.autoTable({
      startY: y + 5,
      head: [
        [
          "Month",
          "Type",
          "Description",
          "Category",
          "Date",
          "Planned",
          "Actual",
        ],
      ],
      body: report.entries.map((row) =>
        row.map((value, i) =>
          i >= 5 && value !== "" ? amount(value) : String(value ?? ""),
        ),
      ),
      styles: { fontSize: 8, overflow: "linebreak" },
      columnStyles: { 2: { cellWidth: 60 }, 3: { cellWidth: 44 } },
    });
    return pdf.output("blob");
  }

  async function download(blob, filename) {
    const onIOS =
      /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (
      onIOS &&
      typeof File !== "undefined" &&
      navigator.share &&
      navigator.canShare
    ) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Penvoria report" });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
          console.warn("Sharing unavailable; downloading instead.", e);
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  reportButton.addEventListener("click", async () => {
    if (!window.penvoriaCloud?.ready || !window.penvoriaCloud?.user) {
      alert("Please sign in and finish loading your financial records.");
      return;
    }
    const formatName = format.value;
    if (!["csv", "pdf"].includes(formatName)) return;
    reportButton.disabled = true;
    try {
      const report = getReport();
      const filename = `penvoria-report-${report.start}-to-${report.end}.${formatName}`;
      const blob =
        formatName === "csv"
          ? new Blob([makeCsv(report)], { type: "text/csv;charset=utf-8" })
          : makePdf(report);
      await download(blob, filename);
    } catch (error) {
      alert(error.message || "Report export failed.");
      console.error("Penvoria report error:", error);
    } finally {
      reportButton.disabled = false;
    }
  });
})();
