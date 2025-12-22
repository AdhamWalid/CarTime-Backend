// utils/buildMonthlyRevenuePdfBuffer.js
const PDFDocument = require("pdfkit");

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatMYR(n) {
  const v = Number(n || 0);
  try {
    return `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `RM ${v.toFixed(2)}`;
  }
}

function drawPill(doc, x, y, text, opts = {}) {
  const {
    bg = "#0b1220",
    border = "#2b3a55",
    color = "#dbeafe",
    padX = 10,
    h = 20,
    radius = 10,
    fontSize = 9,
  } = opts;

  doc.save();
  const w = doc.widthOfString(text, { fontSize }) + padX * 2;
  doc.roundedRect(x, y, w, h, radius).fill(bg);
  doc.roundedRect(x, y, w, h, radius).lineWidth(1).stroke(border);
  doc.fillColor(color).fontSize(fontSize).text(text, x + padX, y + 5, { lineBreak: false });
  doc.restore();
  return w;
}

function card(doc, x, y, w, h, { title, value, sub, accent = "#fbbf24" }) {
  doc.save();
  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");
  doc.roundedRect(x, y, 6, h, 12).fill(accent);

  doc.fillColor("#94a3b8").fontSize(9).text(title, x + 16, y + 10);
  doc.fillColor("#e5e7eb").fontSize(16).font("Helvetica-Bold").text(value, x + 16, y + 26);
  doc.font("Helvetica").fillColor("#64748b").fontSize(9).text(sub || "", x + 16, y + 48);

  doc.restore();
}

function drawHeader(doc, { title, subtitle, rightTag }) {
  const pageW = doc.page.width;
  const margin = 40;

  doc.save();
  doc.rect(0, 0, pageW, 120).fill("#050816");
  doc.rect(0, 0, pageW, 120).opacity(0.18).fill("#fbbf24").opacity(1);

  doc.opacity(0.22).circle(90, 30, 90).fill("#fbbf24");
  doc.opacity(0.12).circle(pageW - 120, 50, 110).fill("#60a5fa");
  doc.opacity(1);

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(18).text("CarTime", margin, 28);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(10).text("Admin Reports", margin, 50);

  doc.fillColor("#f8fafc").font("Helvetica-Bold").fontSize(16).text(title, margin, 78);
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(9).text(subtitle, margin, 98);

  const tag = rightTag || "CONFIDENTIAL";
  drawPill(doc, pageW - margin - 140, 36, tag, {
    bg: "#0b1220",
    border: "#334155",
    color: "#fde68a",
  });

  doc.fillColor("#94a3b8")
    .fontSize(8)
    .text(`Generated: ${new Date().toLocaleString("en-MY")}`, pageW - margin - 220, 62, {
      width: 220,
      align: "right",
    });

  doc.restore();
  doc.y = 140;
}

function drawBarChart(doc, x, y, w, h, series) {
  doc.save();

  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text("Daily Revenue", x + 14, y + 12);
  doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("Confirmed bookings only", x + 14, y + 28);

  const maxV = Math.max(...(series || []).map((s) => Number(s.value || 0)), 1);
  const innerX = x + 12;
  const innerY = y + 46;
  const innerW = w - 24;
  const innerH = h - 62;

  const n = (series || []).length || 1;
  const gap = 4;
  const barW = clamp((innerW - gap * (n - 1)) / n, 6, 18);

  doc.moveTo(innerX, innerY + innerH).lineTo(innerX + innerW, innerY + innerH).lineWidth(1).stroke("#122033");

  (series || []).forEach((s, i) => {
    const v = Number(s.value || 0);
    const barH = (v / maxV) * innerH;
    const bx = innerX + i * (barW + gap);
    const by = innerY + innerH - barH;

    doc.roundedRect(bx, by, barW, barH, 4).fill("#fbbf24");
    doc.opacity(0.25).roundedRect(bx, by, barW, barH * 0.35, 4).fill("#60a5fa").opacity(1);

    if (n <= 16 || i % 3 === 0) {
      doc.fillColor("#64748b").fontSize(7).text(String(s.label), bx - 2, innerY + innerH + 6, {
        width: barW + 4,
        align: "center",
      });
    }
  });

  doc.restore();
}

function drawTable(doc, x, y, w, rows, opts = {}) {
  const { title = "Top Cars", cols = [] } = opts;
  doc.save();

  const h = 44 + rows.length * 22 + 14;
  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text(title, x + 14, y + 12);
  doc.fillColor("#64748b").fontSize(9).text("Sorted by revenue", x + 14, y + 28);

  const headerY = y + 46;
  doc.roundedRect(x + 12, headerY, w - 24, 22, 10).fill("#0a1628");
  doc.fillColor("#94a3b8").fontSize(8);

  const colXs = [];
  let cx = x + 18;
  cols.forEach((c) => {
    colXs.push(cx);
    doc.text(c.label, cx, headerY + 6, { width: c.w, align: c.align || "left" });
    cx += c.w;
  });

  let rowY = headerY + 26;
  rows.forEach((r, idx) => {
    if (idx % 2 === 0) {
      doc.roundedRect(x + 12, rowY - 2, w - 24, 20, 10).opacity(0.45).fill("#071022").opacity(1);
    }
    doc.fillColor("#e2e8f0").fontSize(9);
    cols.forEach((c, i) => {
      const val = r[c.key] ?? "—";
      doc.text(String(val), colXs[i], rowY + 3, { width: c.w, align: c.align || "left" });
    });
    rowY += 22;
  });

  doc.restore();
  return y + h;
}

function addFooter(doc, pageNum, totalPages) {
  const margin = 40;
  const y = doc.page.height - 34;

  doc.save();
  doc.fillColor("#64748b").fontSize(8);
  doc.text("CarTime • Monthly Revenue Summary", margin, y, { continued: true });
  doc.text(" • Internal use only", { continued: false });

  doc.fillColor("#94a3b8").fontSize(8).text(`Page ${pageNum} of ${totalPages}`, doc.page.width - margin - 80, y, {
    width: 80,
    align: "right",
  });
  doc.restore();
}

async function buildMonthlyRevenuePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const month = payload.month || "—";
    const totals = payload.totals || { revenue: 0, bookings: 0 };
    const platformPct = payload.platformPct ?? 0.12;
    const platformCut = payload.platformCut ?? (Number(totals.revenue || 0) * platformPct);
    const ownerCut = payload.ownerCut ?? (Number(totals.revenue || 0) - platformCut);

    drawHeader(doc, {
      title: "Monthly Revenue Report",
      subtitle: `Month: ${month} • Confirmed bookings report`,
      rightTag: "ADMIN ONLY",
    });

    // KPI cards
    const x = 40;
    const gap = 12;
    const w = (doc.page.width - 80 - gap) / 2;
    const h = 70;

    card(doc, x, 150, w, h, {
      title: "Total Revenue",
      value: formatMYR(totals.revenue || 0),
      sub: `${totals.bookings || 0} booking(s)`,
      accent: "#fbbf24",
    });

    card(doc, x + w + gap, 150, w, h, {
      title: `Platform (${Math.round(platformPct * 100)}%)`,
      value: formatMYR(platformCut),
      sub: "Estimated platform cut",
      accent: "#60a5fa",
    });

    card(doc, x, 150 + h + 10, w, h, {
      title: "Owners",
      value: formatMYR(ownerCut),
      sub: "Estimated owner payout",
      accent: "#22c55e",
    });

    card(doc, x + w + gap, 150 + h + 10, w, h, {
      title: "Avg / booking",
      value: formatMYR((Number(totals.revenue || 0) / Math.max(1, Number(totals.bookings || 0)))),
      sub: "Revenue per booking",
      accent: "#f43f5e",
    });

    // Chart
    drawBarChart(doc, 40, 150 + (h * 2) + 24, doc.page.width - 80, 210, payload.series || []);

    // Table
    const rows = (payload.topCarsRows || []).slice(0, 12);
    drawTable(doc, 40, 150 + (h * 2) + 24 + 210 + 14, doc.page.width - 80, rows, {
      title: "Top Cars",
      cols: [
        { key: "car", label: "Car", w: 300, align: "left" },
        { key: "bookings", label: "Bookings", w: 90, align: "right" },
        { key: "revenue", label: "Revenue", w: 120, align: "right" },
      ],
    });

    // Footer pages
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      addFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = { buildMonthlyRevenuePdfBuffer };