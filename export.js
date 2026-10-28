"use strict";

/* ==========================================
   PENVORIA - CSV / PDF / JSON EXPORT
   ========================================== */

(() => {
  const formatSelect = document.getElementById("exportFormat");
  const exportButton = document.getElementById("exportReportBtn");

  if (!formatSelect || !exportButton) return;

  const monthlyTypes = [
    ["income", "Income"],
    ["needs", "Needs budget"],
    ["expenses", "Expense"],
    ["savings", "Savings"],
  ];

  // Format MVR amounts for exported files.
  const amount = (value) => {
    if (value === "" || value === null || value === undefined) {
      return "";
    }

    const number = Number(value);

    return Number.isFinite(number) ? number.toFixed(2) : "";
  };

  // Export all recorded months in chronological order.
  const monthsInOrder = () =>
    Object.entries(state.months || {})
      .filter(([key]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key))
      .sort(([a], [b]) => a.localeCompare(b));

  // Convert Penvoria's records into report rows.
  function getTransactions() {
    const result = [];

    for (const [monthKey, record] of monthsInOrder()) {
      for (const [type, label] of monthlyTypes) {
        const items = Array.isArray(record?.[type]) ? record[type] : [];

        for (const item of items) {
          const category =
            type === "needs" || type === "expenses"
              ? categoryName(item, type)
              : "";

          result.push({
            month: monthKey,
            type: label,

            description: String(item.title || category || ""),

            category,
            date: String(item.date || ""),

            planned:
              type === "income" || type === "needs" || type === "savings"
                ? amount(item.amount)
                : "",

            received:
              type === "income" ? amount(item.received ?? item.amount) : "",

            spent: type === "expenses" ? amount(item.amount) : "",

            transferred:
              type === "savings" ? amount(item.transferred ?? 0) : "",
          });
        }
      }
    }

    return result;
  }

  /* ==========================================
     CSV EXPORT
     ========================================== */

  function csvCell(value) {
    let text = String(value ?? "");

    // Prevent spreadsheet applications from
    // interpreting descriptions as formulas.
    if (/^\s*[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }

  function createCSV(rows) {
    const headers = [
      "Month",
      "Type",
      "Description",
      "Category",
      "Date",
      "Planned (MVR)",
      "Received (MVR)",
      "Spent (MVR)",
      "Transferred (MVR)",
    ];

    const table = [
      headers,

      ...rows.map((row) => [
        row.month,
        row.type,
        row.description,
        row.category,
        row.date,
        row.planned,
        row.received,
        row.spent,
        row.transferred,
      ]),
    ];

    // UTF-8 BOM improves compatibility with Excel.
    return (
      "\uFEFF" + table.map((row) => row.map(csvCell).join(",")).join("\r\n")
    );
  }

  /* ==========================================
     PDF EXPORT
     ========================================== */

  function createPDF(rows) {
    const jsPDF = window.jspdf?.jsPDF;

    if (!jsPDF) {
      throw new Error(
        "PDF library did not load. " + "Check your connection and refresh.",
      );
    }

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    if (typeof pdf.autoTable !== "function") {
      throw new Error(
        "PDF table library did not load. " +
          "Check your connection and refresh.",
      );
    }

    const pageHeight = pdf.internal.pageSize.getHeight();

    const pageWidth = pdf.internal.pageSize.getWidth();

    let y = 18;

    // Report title.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);

    pdf.text("Penvoria - Financial Report", 12, y);

    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    pdf.text(
      `Generated: ${new Date().toLocaleDateString("en-GB")} | Currency: MVR`,
      12,
      y,
    );

    y += 12;

    // Create a section for each month.
    for (const [monthKey, record] of monthsInOrder()) {
      const monthRows = rows.filter((row) => row.month === monthKey);

      if (y > pageHeight - 56) {
        pdf.addPage();
        y = 18;
      }

      const normalized = {
        income: Array.isArray(record?.income) ? record.income : [],

        needs: Array.isArray(record?.needs) ? record.needs : [],

        expenses: Array.isArray(record?.expenses) ? record.expenses : [],

        savings: Array.isArray(record?.savings) ? record.savings : [],
      };

      const figures = totals(normalized);

      // Month heading.
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);

      pdf.text(monthLabel(monthKey), 12, y);

      y += 7;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);

      // Summary: income and expenses.
      pdf.text(
        `Income planned: ${amount(figures.income)}   ` +
          `Received: ${amount(figures.incomeReceived)}   ` +
          `Expenses: ${amount(figures.expenses)}`,
        12,
        y,
      );

      y += 5;

      // Summary: needs and savings.
      pdf.text(
        `Needs planned: ${amount(figures.needBudget)}   ` +
          `Savings planned: ${amount(figures.savings)}   ` +
          `Transferred: ${amount(figures.savingsTransferred)}`,
        12,
        y,
      );

      y += 5;

      pdf.text(
        `Monthly cash remainder: ${amount(figures.cashRemainder)} MVR`,
        12,
        y,
      );

      y += 5;

      if (!monthRows.length) {
        pdf.text("No transactions recorded.", 12, y + 3);

        y += 13;
        continue;
      }

      // A multipage transaction table.
      pdf.autoTable({
        startY: y,

        margin: {
          left: 12,
          right: 12,
          top: 18,
          bottom: 17,
        },

        head: [
          [
            "Date",
            "Type",
            "Description",
            "Category",
            "Planned",
            "Received",
            "Spent",
            "Transferred",
          ],
        ],

        body: monthRows.map((row) => [
          row.date,
          row.type,
          row.description,
          row.category,
          row.planned,
          row.received,
          row.spent,
          row.transferred,
        ]),

        theme: "striped",

        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: "linebreak",
        },

        headStyles: {
          fillColor: [17, 121, 111],
          textColor: 255,
        },

        columnStyles: {
          0: { cellWidth: 23 },
          1: { cellWidth: 26 },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
        },
      });

      y = (pdf.lastAutoTable?.finalY || y) + 12;
    }

    // Add page numbers.
    const pageCount = pdf.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);

      pdf.setFontSize(8);
      pdf.setTextColor(110);

      pdf.text(
        `Penvoria | Page ${page} of ${pageCount}`,
        pageWidth - 12,
        pageHeight - 8,
        {
          align: "right",
        },
      );
    }

    return pdf.output("blob");
  }

  /* ==========================================
     DOWNLOAD / iPHONE SHARE
     ========================================== */

  /* ==========================================
   DOWNLOAD / iPHONE SHARE
   ========================================== */

  async function deliver(blob, filename) {
    // Detect iPhone or iPad.
    const isIOS =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    // Only use the Share menu on iPhone/iPad.
    // Windows and desktop browsers download normally.
    if (
      isIOS &&
      typeof File !== "undefined" &&
      typeof navigator.canShare === "function" &&
      typeof navigator.share === "function"
    ) {
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Penvoria Export",
          });

          return;
        } catch (error) {
          if (error.name === "AbortError") {
            return;
          }

          console.warn("Share failed. Using download instead.", error);
        }
      }
    }

    // Normal browser download.
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    // Release temporary file URL.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  /* ==========================================
     EXPORT BUTTON HANDLER
     ========================================== */

  exportButton.addEventListener("click", async () => {
    if (!window.penvoriaCloud?.ready || !window.penvoriaCloud?.user) {
      alert("Please sign in and wait for " + "cloud data to load.");

      return;
    }

    const months = monthsInOrder();

    if (!months.length) {
      alert("There are no months to export.");

      return;
    }

    const format = formatSelect.value;

    const stamp = new Date().toISOString().slice(0, 10);

    exportButton.disabled = true;

    const oldLabel = exportButton.textContent;

    exportButton.textContent = "Preparing...";

    try {
      if (format === "json") {
        // Preserve the full JSON recovery backup.
        const backup = {
          application: "Penvoria",
          format_version: 1,
          exported_at: new Date().toISOString(),
          month_count: months.length,
          months: state.months,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });

        await deliver(blob, `penvoria-backup-${stamp}.json`);
      } else {
        const rows = getTransactions();

        if (!rows.length) {
          alert("There are no transactions " + "to include in a report.");

          return;
        }

        if (format === "csv") {
          const blob = new Blob([createCSV(rows)], {
            type: "text/csv;charset=utf-8",
          });

          await deliver(blob, `penvoria-transactions-${stamp}.csv`);
        } else if (format === "pdf") {
          const blob = createPDF(rows);

          await deliver(blob, `penvoria-report-${stamp}.pdf`);
        } else {
          throw new Error("Choose a supported export format.");
        }
      }
    } catch (error) {
      console.error("Penvoria export failed:", error);

      alert(`Export failed: ${error.message}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = oldLabel;
    }
  });
})();
