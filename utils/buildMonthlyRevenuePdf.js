const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");

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

function monthLabel(yy, mm) {
  const d = new Date(yy, mm - 1, 1);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

/** UI helpers */
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

  const w = doc.widthOfString(text, { fontSize }) + padX * 2;
  doc.roundedRect(x, y, w, h, radius).fill(bg);
  doc.roundedRect(x, y, w, h, radius).lineWidth(1).stroke(border);
  doc.fillColor(color).fontSize(fontSize).text(text, x + padX, y + 5, { lineBreak: false });
  return w;
}

function drawHeader(doc, { title, subtitle, rightTag }) {
  const pageW = doc.page.width;
  const margin = 40;

  // dark base + glow blobs
  doc.rect(0, 0, pageW, 132).fill("#050816");
  doc.opacity(0.18).rect(0, 0, pageW, 132).fill("#fbbf24").opacity(1);

  doc.opacity(0.22).circle(90, 35, 95).fill("#fbbf24");
  doc.opacity(0.12).circle(pageW - 120, 55, 120).fill("#60a5fa");
  doc.opacity(0.09).circle(pageW * 0.55, 10, 90).fill("#22c55e");
  doc.opacity(1);

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(19).text("CarTime", margin, 30);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(10).text("Finance • Admin Reports", margin, 54);

  doc.fillColor("#f8fafc").font("Helvetica-Bold").fontSize(16).text(title, margin, 86);
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(9).text(subtitle, margin, 106);

  drawPill(doc, pageW - margin - 150, 36, rightTag || "FINANCE", {
    bg: "#0b1220",
    border: "#334155",
    color: "#fde68a",
  });

  doc.fillColor("#94a3b8").fontSize(8).text(
    `Generated: ${new Date().toLocaleString("en-MY")}`,
    pageW - margin - 240,
    62,
    { width: 240, align: "right" }
  );

  doc.y = 150;
}

function divider(doc, y) {
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).lineWidth(1).stroke("#1f2a3d");
}

function card(doc, x, y, w, h, { title, value, sub, accent = "#fbbf24" }) {
  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");
  doc.roundedRect(x, y, 6, h, 12).fill(accent);

  doc.fillColor("#94a3b8").fontSize(9).text(title, x + 16, y + 10);
  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(16).text(value, x + 16, y + 26);
  doc.font("Helvetica").fillColor("#64748b").fontSize(9).text(sub || "", x + 16, y + 48);
}

function addFooter(doc, pageNum, totalPages) {
  const margin = 40;
  const y = doc.page.height - 34;

  doc.fillColor("#64748b").fontSize(8);
  doc.text("CarTime • Monthly Revenue Summary", margin, y, { continued: true });
  doc.text(" • Internal use only", { continued: false });

  doc.fillColor("#94a3b8").fontSize(8).text(`Page ${pageNum} of ${totalPages}`, doc.page.width - margin - 80, y, {
    width: 80,
    align: "right",
  });
}

/** Better chart: if too many days, bucket weekly */
function buildChartSeries(dailyValues) {
  const n = dailyValues.length;
  if (n <= 16) return dailyValues;

  // bucket into ~8 bars (weekly-ish)
  const buckets = 8;
  const size = Math.ceil(n / buckets);
  const out = [];
  for (let i = 0; i < n; i += size) {
    const slice = dailyValues.slice(i, i + size);
    const sum = slice.reduce((a, b) => a + (Number(b.value) || 0), 0);
    const start = i + 1;
    const end = Math.min(n, i + slice.length);
    out.push({ label: `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`, value: sum });
  }
  return out;
}

function drawBarChart(doc, x, y, w, h, series) {
  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text("Revenue Trend", x + 14, y + 12);
  doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("Confirmed bookings only", x + 14, y + 28);

  const maxV = Math.max(...series.map((s) => Number(s.value || 0)), 1);

  const innerX = x + 12;
  const innerY = y + 46;
  const innerW = w - 24;
  const innerH = h - 66;

  const n = series.length || 1;
  const gap = 6;
  const barW = clamp((innerW - gap * (n - 1)) / n, 10, 26);

  doc.moveTo(innerX, innerY + innerH).lineTo(innerX + innerW, innerY + innerH).lineWidth(1).stroke("#122033");

  series.forEach((s, i) => {
    const v = Number(s.value || 0);
    const barH = (v / maxV) * innerH;

    const bx = innerX + i * (barW + gap);
    const by = innerY + innerH - barH;

    doc.roundedRect(bx, by, barW, barH, 5).fill("#fbbf24");
    doc.opacity(0.25).roundedRect(bx, by, barW, barH * 0.35, 5).fill("#60a5fa").opacity(1);

    doc.fillColor("#94a3b8").fontSize(7).text(String(s.label), bx - 2, innerY + innerH + 6, {
      width: barW + 4,
      align: "center",
    });
  });
}

function drawTable(doc, x, y, w, rows, { title, cols }) {
  const h = 44 + rows.length * 22 + 16;

  doc.roundedRect(x, y, w, h, 14).fill("#0b1220");
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).stroke("#1f2a3d");

  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text(title, x + 14, y + 12);
  doc.fillColor("#64748b").fontSize(9).text("Sorted by revenue", x + 14, y + 28);

  const headerY = y + 46;
  doc.roundedRect(x + 12, headerY, w - 24, 22, 10).fill("#0a1628");

  let cx = x + 18;
  const colXs = [];
  doc.fillColor("#94a3b8").fontSize(8);
  cols.forEach((c) => {
    colXs.push(cx);
    doc.text(c.label, cx, headerY + 6, { width: c.w, align: c.align || "left" });
    cx += c.w;
  });

  let rowY = headerY + 26;
  rows.forEach((r, idx) => {
    if (idx % 2 === 0) doc.roundedRect(x + 12, rowY - 2, w - 24, 20, 10).opacity(0.45).fill("#071022").opacity(1);
    doc.fillColor("#e2e8f0").fontSize(9);

    cols.forEach((c, i) => {
      doc.text(String(r[c.key] ?? "—"), colXs[i], rowY + 3, { width: c.w, align: c.align || "left" });
    });

    rowY += 22;
  });

  return y + h;
}

async function buildMonthlyRevenuePdfBuffer({ month, yy, mm, start, end }) {
  const match = { status: "confirmed", createdAt: { $gte: start, $lt: end } };

  const [totalsAgg] = await Booking.aggregate([
    { $match: match },
    { $group: { _id: null, revenue: { $sum: "$totalPrice" }, bookings: { $sum: 1 }, avg: { $avg: "$totalPrice" } } },
  ]);

  const totals = totalsAgg || { revenue: 0, bookings: 0, avg: 0 };
  const daysInMonth = new Date(yy, mm, 0).getDate();

  const dailyAgg = await Booking.aggregate([
    { $match: match },
    { $group: { _id: { day: { $dayOfMonth: "$createdAt" } }, revenue: { $sum: "$totalPrice" } } },
    { $sort: { "_id.day": 1 } },
  ]);

  const dailyMap = new Map(dailyAgg.map((x) => [x._id.day, x.revenue]));
  const dailySeries = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    return { label: String(day).padStart(2, "0"), value: Number(dailyMap.get(day) || 0) };
  });

  // top cars (for page 1)
  const topCarsAgg = await Booking.aggregate([
    { $match: match },
    { $group: { _id: { carTitle: "$carTitle", carPlate: "$carPlate" }, revenue: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: 6 },
  ]);

  // detailed table (page 2)
  const top20Agg = await Booking.aggregate([
    { $match: match },
    { $group: { _id: { carTitle: "$carTitle", carPlate: "$carPlate" }, revenue: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: 20 },
  ]);

  const topCarsRows = topCarsAgg.map((x) => ({
    car: `${x._id.carTitle || "Car"}${x._id.carPlate ? ` • ${x._id.carPlate}` : ""}`,
    bookings: x.count,
    revenue: formatMYR(x.revenue),
  }));

  const top20Rows = top20Agg.map((x, idx) => ({
    no: idx + 1,
    car: `${x._id.carTitle || "Car"}${x._id.carPlate ? ` • ${x._id.carPlate}` : ""}`,
    bookings: x.count,
    revenue: formatMYR(x.revenue),
  }));

  const peak = dailySeries.reduce((best, cur) => (cur.value > best.value ? cur : best), { label: "—", value: 0 });

  const platformPct = 0.12;
  const platformCut = totals.revenue * platformPct;
  const ownerCut = totals.revenue - platformCut;

  // Build PDF to buffer
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, left: 40, right: 40, bottom: 50 } });
  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  // PAGE 1
  drawHeader(doc, {
    title: "Monthly Revenue Summary",
    subtitle: `${monthLabel(yy, mm)} • Confirmed bookings (created in month)`,
    rightTag: "FINANCE",
  });

  const marginX = 40;
  const gap = 12;
  const cardW = (doc.page.width - marginX * 2 - gap * 3) / 4;
  const y0 = doc.y;

  card(doc, marginX + 0 * (cardW + gap), y0, cardW, 70, {
    title: "Total revenue",
    value: formatMYR(totals.revenue),
    sub: `Month: ${month}`,
    accent: "#fbbf24",
  });
  card(doc, marginX + 1 * (cardW + gap), y0, cardW, 70, {
    title: "Bookings",
    value: String(totals.bookings),
    sub: `Avg/booking: ${formatMYR(totals.avg)}`,
    accent: "#60a5fa",
  });
  card(doc, marginX + 2 * (cardW + gap), y0, cardW, 70, {
    title: "Peak day",
    value: peak.label,
    sub: `Peak rev: ${formatMYR(peak.value)}`,
    accent: "#22c55e",
  });
  card(doc, marginX + 3 * (cardW + gap), y0, cardW, 70, {
    title: "Owner payout",
    value: formatMYR(ownerCut),
    sub: `Platform: ${formatMYR(platformCut)} (${(platformPct * 100).toFixed(1)}%)`,
    accent: "#fb7185",
  });

  doc.y = y0 + 86;
  divider(doc, doc.y);
  doc.y += 14;

  const panelGap = 12;
  const leftW = (doc.page.width - marginX * 2 - panelGap) * 0.58;
  const rightW = (doc.page.width - marginX * 2 - panelGap) - leftW;

  drawBarChart(doc, marginX, doc.y, leftW, 240, buildChartSeries(dailySeries));

  drawTable(doc, marginX + leftW + panelGap, doc.y, rightW, topCarsRows.length ? topCarsRows : [{ car: "—", bookings: "—", revenue: "—" }], {
    title: "Top Cars",
    cols: [
      { key: "car", label: "Car", w: rightW - 24 - 54 - 84, align: "left" },
      { key: "bookings", label: "Bk", w: 54, align: "right" },
      { key: "revenue", label: "Revenue", w: 84, align: "right" },
    ],
  });

  addFooter(doc, 1, 2);

  // PAGE 2
  doc.addPage();
  drawHeader(doc, {
    title: "Detailed Breakdown",
    subtitle: `${monthLabel(yy, mm)} • Top cars (by revenue)`,
    rightTag: "DETAILS",
  });

  const tableW = doc.page.width - marginX * 2;
  const after = drawTable(doc, marginX, doc.y, tableW, top20Rows.length ? top20Rows : [{ no: "—", car: "—", bookings: "—", revenue: "—" }], {
    title: "Top 20 Cars",
    cols: [
      { key: "no", label: "#", w: 34, align: "left" },
      { key: "car", label: "Car", w: tableW - 24 - 34 - 64 - 110, align: "left" },
      { key: "bookings", label: "Bookings", w: 64, align: "right" },
      { key: "revenue", label: "Revenue", w: 110, align: "right" },
    ],
  });

  doc.y = after + 14;

  doc.roundedRect(marginX, doc.y, tableW, 90, 14).fill("#0b1220");
  doc.roundedRect(marginX, doc.y, tableW, 90, 14).lineWidth(1).stroke("#1f2a3d");
  doc.fillColor("#e5e7eb").font("Helvetica-Bold").fontSize(11).text("Notes & Sign-off", marginX + 14, doc.y + 12);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(9).text(
    "• Totals computed from Booking.totalPrice\n• This report is for internal use only\n• Adjust platform/owner split logic to match policy\n\nPrepared by: ______________________     Approved by: ______________________",
    marginX + 14,
    doc.y + 30
  );

  addFooter(doc, 2, 2);

  doc.end();

  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { buildMonthlyRevenuePdfBuffer };