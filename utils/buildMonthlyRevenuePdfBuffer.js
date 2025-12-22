// utils/buildMonthlyRevenuePdfBuffer.js
const PDFDocument = require("pdfkit");

function formatMYR(n) {
  const v = Number(n || 0);
  try {
    return `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `RM ${v.toFixed(2)}`;
  }
}

function monthName(yy, mm) {
  const d = new Date(yy, mm - 1, 1);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function drawDayTable(doc, payload) {
  const margin = 40;
  const pageW = doc.page.width;
  const usableW = pageW - margin * 2;

  const yy = payload.yy;
  const mm = payload.mm;

  // Title
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text("Daily Breakdown", margin, 40);
  doc.fillColor("#475569").font("Helvetica").fontSize(10).text(monthName(yy, mm), margin, 62);

  // Table settings
  const startY = 90;
  const rowH = 16;

  const cols = [
    { key: "day", label: "Day", w: 40, align: "left" },
    { key: "date", label: "Date", w: 120, align: "left" },
    { key: "count", label: "Bookings", w: 70, align: "right" },
    { key: "revenue", label: "Revenue", w: 120, align: "right" },
    { key: "platform", label: "Platform (12%)", w: 120, align: "right" },
    { key: "owner", label: "Owner (88%)", w: 120, align: "right" },
  ];

  // If you need to fit, reduce widths a bit:
  // (This current layout fits A4 nicely with 40 margin.)

  // Header background
  doc
    .save()
    .roundedRect(margin, startY, usableW, 22, 8)
    .fill("#0b1220")
    .restore();

  // Header text
  doc.fillColor("#cbd5e1").font("Helvetica-Bold").fontSize(9);
  let x = margin + 10;
  cols.forEach((c) => {
    doc.text(c.label, x, startY + 6, { width: c.w, align: c.align });
    x += c.w;
  });

  // Rows
  const rows = (payload.series || []).map((s) => {
    const day = Number(s.day || s.label || 0);
    const dateObj = new Date(yy, mm - 1, day);

    const revenue = Number(s.revenue || s.value || 0);
    const count = Number(s.count || 0);

    const platformCut = revenue * 0.12;
    const ownerCut = revenue - platformCut;

    return {
      day: String(day).padStart(2, "0"),
      date: dateObj.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }),
      count: String(count),
      revenue: formatMYR(revenue),
      platform: formatMYR(platformCut),
      owner: formatMYR(ownerCut),
    };
  });

  let y = startY + 28;

  doc.font("Helvetica").fontSize(9);

  rows.forEach((r, idx) => {
    // zebra striping
    if (idx % 2 === 0) {
      doc.save().rect(margin, y - 2, usableW, rowH).fill("#f8fafc").restore();
    }

    doc.fillColor("#0f172a");

    let cx = margin + 10;
    cols.forEach((c) => {
      doc.text(r[c.key], cx, y, { width: c.w, align: c.align });
      cx += c.w;
    });

    y += rowH;
  });

  // Totals row
  const totalRevenue = rows.reduce((sum, r) => {
    const num = Number(String(r.revenue).replace(/[^\d.]/g, "")) || 0; // quick parse
    return sum + num;
  }, 0);

  doc
    .save()
    .moveTo(margin, y + 6)
    .lineTo(margin + usableW, y + 6)
    .lineWidth(1)
    .stroke("#e2e8f0")
    .restore();

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
  doc.text("TOTAL", margin + 10, y + 10, { width: 160, align: "left" });
  doc.text(formatMYR(payload.totals?.revenue || 0), margin + usableW - 120, y + 10, { width: 120, align: "right" });
}

async function buildMonthlyRevenuePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ✅ PAGE 1 (keep your nice design here)
    doc.fontSize(18).text("Monthly Revenue Summary");
    doc.moveDown();
    doc.fontSize(12).text(`Month: ${payload.month}`);
    doc.text(`Revenue: ${payload.totals?.revenue || 0}`);
    // (your premium header/cards/chart etc can stay here)

    // ✅ PAGE 2 (daily table)
    doc.addPage();
    drawDayTable(doc, payload);

    doc.end();
  });
}

module.exports = { buildMonthlyRevenuePdfBuffer };