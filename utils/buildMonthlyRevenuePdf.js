const PDFDocument = require("pdfkit");

function money(n) {
  return `RM ${Number(n || 0).toFixed(2)}`;
}

function buildMonthlyRevenuePdfBuffer({ monthLabel, totals, dailyRows }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 48 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      // Header
      doc
        .fontSize(20)
        .fillColor("#111827")
        .text("CarTime — Monthly Revenue Summary", { align: "left" });

      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .fillColor("#6b7280")
        .text(`Month: ${monthLabel}`);

      doc.moveDown(1);

      // Totals card
      doc
        .roundedRect(doc.x, doc.y, 500, 110, 12)
        .fillAndStroke("#0b1220", "#1f2937");

      const x = doc.x + 18;
      const y = doc.y + 18;

      doc
        .fillColor("#e5e7eb")
        .fontSize(12)
        .text("Overview", x, y);

      doc
        .fontSize(10)
        .fillColor("#9ca3af")
        .text("Confirmed bookings", x, y + 22);

      doc
        .fontSize(16)
        .fillColor("#ffffff")
        .text(String(totals.confirmedBookings || 0), x, y + 38);

      doc
        .fontSize(10)
        .fillColor("#9ca3af")
        .text("Total revenue", x + 220, y + 22);

      doc
        .fontSize(16)
        .fillColor("#D4AF37")
        .text(money(totals.totalRevenue || 0), x + 220, y + 38);

      doc
        .fontSize(10)
        .fillColor("#9ca3af")
        .text("Avg revenue/day", x, y + 70);

      doc
        .fontSize(13)
        .fillColor("#ffffff")
        .text(money(totals.avgRevenuePerDay || 0), x, y + 86);

      doc
        .fontSize(10)
        .fillColor("#9ca3af")
        .text("Avg bookings/day", x + 220, y + 70);

      doc
        .fontSize(13)
        .fillColor("#ffffff")
        .text(String(totals.avgBookingsPerDay || 0), x + 220, y + 86);

      doc.moveDown(8);

      // Table title
      doc
        .fontSize(12)
        .fillColor("#111827")
        .text("Daily breakdown", { underline: false });

      doc.moveDown(0.5);

      // Table header
      const startY = doc.y;
      const col1 = 60;
      const col2 = 210;
      const col3 = 360;

      doc
        .fontSize(10)
        .fillColor("#6b7280")
        .text("Date", col1, startY)
        .text("Bookings", col2, startY)
        .text("Revenue", col3, startY);

      doc.moveTo(48, startY + 16).lineTo(548, startY + 16).strokeColor("#e5e7eb").stroke();

      let yRow = startY + 26;

      doc.fontSize(10).fillColor("#111827");
      for (const r of dailyRows) {
        if (yRow > 760) {
          doc.addPage();
          yRow = 60;
        }
        doc.text(r.label, col1, yRow);
        doc.text(String(r.count || 0), col2, yRow);
        doc.text(money(r.amount || 0), col3, yRow);
        yRow += 18;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { buildMonthlyRevenuePdfBuffer };