const PDFDocument = require("pdfkit");

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function formatMYR(n) {
  const v = Number(n || 0);
  try { return `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  catch { return `RM ${v.toFixed(2)}`; }
}
function monthLabel(yy, mm) {
  const d = new Date(yy, mm - 1, 1);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function drawPill(doc, x, y, text, opts = {}) {
  const { bg="#0b1220", border="#334155", color="#fde68a", padX=10, h=20, r=10, fontSize=9 } = opts;
  const w = doc.widthOfString(text, { fontSize }) + padX * 2;
  doc.roundedRect(x, y, w, h, r).fill(bg);
  doc.roundedRect(x, y, w, h, r).lineWidth(1).stroke(border);
  doc.fillColor(color).fontSize(fontSize).text(text, x + padX, y + 5, { lineBreak: false });
  return w;
}

function watermark(doc) {
  doc.save();
  doc.opacity(0.04);
  doc.fillColor("#ffffff").fontSize(42).font("Helvetica-Bold");
  const w = doc.page.width, h = doc.page.height;
  for (let y = 120; y < h; y += 130) {
    for (let x = -40; x < w; x += 260) {
      doc.rotate(-20, { origin: [x, y] });
      doc.text("CarTime • FINANCE", x, y, { lineBreak: false });
      doc.rotate(20, { origin: [x, y] });
    }
  }
  doc.opacity(1);
  doc.restore();
}

function header(doc, { title, subtitle, tag }) {
  const W = doc.page.width;
  const margin = 40;

  doc.save();
  // Deep base
  doc.rect(0, 0, W, 140).fill("#050816");
  // Accent layers (fake gradient)
  doc.opacity(0.22).rect(0, 0, W, 140).fill("#fbbf24");
  doc.opacity(0.10).rect(0, 70, W, 70).fill("#60a5fa");
  doc.opacity(1);

  // Glow orbs
  doc.opacity(0.22).circle(90, 38, 92).fill("#fbbf24");
  doc.opacity(0.14).circle(W - 110, 50, 110).fill("#60a5fa");
  doc.opacity(1);

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(18).text("CarTime", margin, 30);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(10).text("Finance • Admin Reports", margin, 54);

  doc.fillColor("#f8fafc").font("Helvetica-Bold").fontSize(16).text(title, margin, 84);
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(9).text(subtitle, margin, 106);

  // Right badge
  drawPill(doc, W - margin - 155, 36, tag || "FINANCE", { bg:"#0b1220", border:"#334155", color:"#fde68a" });

  doc.fillColor("#94a3b8").fontSize(8).text(
    `Generated: ${new Date().toLocaleString("en-MY")}`,
    W - margin - 260, 62, { width: 260, align: "right" }
  );

  doc.restore();
  doc.y = 155;
}

function kpiCard(doc, x, y, w, h, { title, value, sub, accent }) {
  doc.save();
  doc.roundedRect(x, y, w, h, 16).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 16).lineWidth(1).stroke("#1f2a3d");
  doc.roundedRect(x, y, 7, h, 16).fill(accent || "#fbbf24");

  doc.fillColor("#94a3b8").fontSize(9).text(title, x + 16, y + 10);
  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(16).text(value, x + 16, y + 28);
  doc.font("Helvetica").fillColor("#64748b").fontSize(9).text(sub || "", x + 16, y + 50);

  doc.restore();
}

function panel(doc, x, y, w, h, title, subtitle) {
  doc.save();
  doc.roundedRect(x, y, w, h, 16).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 16).lineWidth(1).stroke("#1f2a3d");
  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text(title, x + 14, y + 12);
  doc.fillColor("#64748b").font("Helvetica").fontSize(9).text(subtitle || "", x + 14, y + 28);
  doc.restore();
}

function barChart(doc, x, y, w, h, series) {
  panel(doc, x, y, w, h, "Revenue Trend", "Confirmed bookings only");
  const maxV = Math.max(...series.map(s => Number(s.value || 0)), 1);

  const innerX = x + 14;
  const innerY = y + 48;
  const innerW = w - 28;
  const innerH = h - 70;

  const n = series.length || 1;
  const gap = 4;
  const barW = clamp((innerW - gap * (n - 1)) / n, 6, 16);

  doc.save();
  doc.moveTo(innerX, innerY + innerH).lineTo(innerX + innerW, innerY + innerH).lineWidth(1).stroke("#122033");

  series.forEach((s, i) => {
    const v = Number(s.value || 0);
    const bh = (v / maxV) * innerH;
    const bx = innerX + i * (barW + gap);
    const by = innerY + innerH - bh;

    doc.roundedRect(bx, by, barW, bh, 4).fill("#fbbf24");
    doc.opacity(0.25).roundedRect(bx, by, barW, bh * 0.35, 4).fill("#60a5fa").opacity(1);

    if (n <= 16 || i % 3 === 0) {
      doc.fillColor("#64748b").fontSize(7).text(String(s.label), bx - 2, innerY + innerH + 6, {
        width: barW + 4, align: "center",
      });
    }
  });

  doc.restore();
}

function table(doc, x, y, w, rows, { title, cols }) {
  const h = 46 + rows.length * 22 + 16;
  panel(doc, x, y, w, h, title || "Top Cars", "Sorted by revenue");

  const headerY = y + 46;
  doc.roundedRect(x + 12, headerY, w - 24, 22, 10).fill("#0a1628");
  doc.fillColor("#94a3b8").fontSize(8);

  let cx = x + 18;
  const colXs = [];
  cols.forEach(c => {
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
      doc.text(String(r[c.key] ?? "—"), colXs[i], rowY + 3, { width: c.w, align: c.align || "left" });
    });
    rowY += 22;
  });

  return y + h;
}

function footer(doc, page, total) {
  const margin = 40;
  const y = doc.page.height - 34;

  doc.save();
  doc.fillColor("#64748b").fontSize(8);
  doc.text("CarTime • Monthly Revenue Summary", margin, y, { continued: true });
  doc.text(" • Internal use only", { continued: false });

  doc.fillColor("#94a3b8").fontSize(8).text(`Page ${page} of ${total}`, doc.page.width - margin - 80, y, {
    width: 80, align: "right",
  });
  doc.restore();
}

async function buildMonthlyRevenuePdfBuffer(payload) {
  const {
    month, yy, mm,
    totals, // { revenue, bookings }
    platformPct, platformCut, ownerCut,
    series, // [{label,value}]
    topCarsRows, // [{car,bookings,revenue}]
  } = payload;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, left: 40, right: 40, bottom: 50 },
    info: { Title: `CarTime Monthly Revenue Summary - ${month}`, Author: "CarTime Admin" },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Page 1
  watermark(doc);
  header(doc, {
    title: "Monthly Revenue Summary",
    subtitle: `${monthLabel(yy, mm)} • Confirmed bookings (created in month)`,
    tag: "MONTHLY CLOSE",
  });

  const marginX = 40, gap = 12;
  const cardW = (doc.page.width - marginX * 2 - gap * 3) / 4;
  const y0 = doc.y;

  kpiCard(doc, marginX + 0 * (cardW + gap), y0, cardW, 74, {
    title: "Total revenue",
    value: formatMYR(totals.revenue),
    sub: `Month: ${month}`,
    accent: "#fbbf24",
  });
  kpiCard(doc, marginX + 1 * (cardW + gap), y0, cardW, 74, {
    title: "Bookings",
    value: String(totals.bookings),
    sub: totals.bookings ? `Avg/booking: ${formatMYR(totals.revenue / totals.bookings)}` : "Avg/booking: RM 0.00",
    accent: "#60a5fa",
  });
  // Optional “peak day” can be injected if you want; keep it clean here
  kpiCard(doc, marginX + 2 * (cardW + gap), y0, cardW, 74, {
    title: "Platform cut",
    value: formatMYR(platformCut),
    sub: `Rate: ${(platformPct * 100).toFixed(1)}%`,
    accent: "#22c55e",
  });
  kpiCard(doc, marginX + 3 * (cardW + gap), y0, cardW, 74, {
    title: "Owner payout",
    value: formatMYR(ownerCut),
    sub: "Estimated",
    accent: "#fb7185",
  });

  doc.y = y0 + 90;

  const panelGap = 12;
  const leftW = (doc.page.width - marginX * 2 - panelGap) * 0.60;
  const rightW = (doc.page.width - marginX * 2 - panelGap) - leftW;

  barChart(doc, marginX, doc.y, leftW, 250, series);

  table(doc, marginX + leftW + panelGap, doc.y, rightW,
    topCarsRows?.length ? topCarsRows : [{ car: "—", bookings: "—", revenue: "—" }],
    {
      title: "Top Cars",
      cols: [
        { key: "car", label: "Car", w: rightW - 24 - 54 - 84, align: "left" },
        { key: "bookings", label: "Bk", w: 54, align: "right" },
        { key: "revenue", label: "Revenue", w: 84, align: "right" },
      ],
    }
  );

  // Notes
  doc.y += 270;
  panel(doc, marginX, doc.y, doc.page.width - marginX * 2, 96, "Notes", "");
  doc.fillColor("#94a3b8").fontSize(9).text(
    "• Data source: Confirmed bookings in selected month\n" +
    "• Totals computed from Booking.totalPrice\n" +
    "• Platform/Owner split shown is an estimate (adjust to your real policy)\n" +
    "• Reconcile line items using the CSV export from Invoices",
    marginX + 14, doc.y + 34
  );

  footer(doc, 1, 2);

  // Page 2 (more “fancy” detail page)
  doc.addPage();
  watermark(doc);
  header(doc, {
    title: "Detailed Breakdown",
    subtitle: `${monthLabel(yy, mm)} • Top cars (by revenue)`,
    tag: "DETAILS",
  });

  // Bigger table
  const w = doc.page.width - marginX * 2;
  const rows = topCarsRows?.length ? topCarsRows : [];
  const top = rows.slice(0, 20).map((r, i) => ({ idx: i + 1, ...r }));
  table(doc, marginX, doc.y, w, top.length ? top : [{ idx: 1, car: "—", bookings: "—", revenue: "—" }], {
    title: "Top Cars (Top 20)",
    cols: [
      { key: "idx", label: "#", w: 30, align: "right" },
      { key: "car", label: "Car", w: w - 24 - 30 - 80 - 110, align: "left" },
      { key: "bookings", label: "Bookings", w: 80, align: "right" },
      { key: "revenue", label: "Revenue", w: 110, align: "right" },
    ],
  });

  doc.y += 18;
  panel(doc, marginX, doc.y, w, 110, "Notes & Sign-off", "");
  doc.fillColor("#94a3b8").fontSize(9).text(
    "• This report is for internal use only\n" +
    "• Adjust platform/owner split logic to match policy\n" +
    "Prepared by: ______________________    Approved by: ______________________",
    marginX + 14, doc.y + 34
  );

  footer(doc, 2, 2);

  doc.end();
  return done;
}

module.exports = { buildMonthlyRevenuePdfBuffer };