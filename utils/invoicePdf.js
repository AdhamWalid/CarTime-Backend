// utils/invoicePdf.js
const PDFDocument = require("pdfkit");

function money(n) {
  const x = Number(n || 0);
  return `RM ${x.toFixed(2)}`;
}

function fmtDT(d) {
  try {
    return new Date(d).toLocaleString("en-MY", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

function invoiceNumber(bookingId) {
  return `CT-${String(bookingId).slice(-8).toUpperCase()}`;
}

function buildBookingInvoicePdfBuffer({ renterName, renterEmail, booking, nights }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const invNo = invoiceNumber(booking._id);

      // ===== Header =====
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .text("CarTime", { continued: true })
        .fillColor("#D4AF37")
        .text("  Invoice", { continued: false });

      doc.fillColor("#111111").fontSize(10).font("Helvetica");
      doc.text(`Invoice No: ${invNo}`, { align: "right" });
      doc.text(`Issued: ${fmtDT(new Date())}`, { align: "right" });

      doc.moveDown(1.2);
      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .strokeColor("#E5E7EB")
        .stroke();

      // ===== Customer =====
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Billed To");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11).fillColor("#374151");
      doc.text(renterName || "Customer");
      if (renterEmail) doc.text(renterEmail);

      // ===== Booking details =====
      doc.moveDown(1.2);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Trip Details");
      doc.moveDown(0.6);

      const rows = [
        ["Car", booking.carTitle || "Car"],
        ["Plate", booking.carPlate || "N/A"],
        ["Pickup City", booking.pickupCity || "—"],
        ["Pickup", fmtDT(booking.startDate)],
        ["Return", fmtDT(booking.endDate)],
        ["Status", booking.status || "—"],
        ["Payment", booking.paymentStatus || "—"],
      ];

      const leftX = 50;
      const rightX = 220;
      const rowH = 18;

      rows.forEach(([k, v]) => {
        doc.font("Helvetica").fontSize(10).fillColor("#6B7280").text(k, leftX, doc.y);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(v, rightX, doc.y - 12);
        doc.moveDown(0.7);
      });

      doc.moveDown(0.6);
      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .strokeColor("#E5E7EB")
        .stroke();

      // ===== Pricing =====
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Pricing");

      doc.moveDown(0.7);

      const rate = booking.carPricePerDay || 0;
      const total = booking.totalPrice || 0;

      const priceRows = [
        ["Days", String(nights)],
        ["Rate / day", money(rate)],
        ["Subtotal", money(total)],
      ];

      priceRows.forEach(([k, v]) => {
        doc.font("Helvetica").fontSize(11).fillColor("#374151").text(k, 50, doc.y, { continued: true });
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(v, { align: "right" });
        doc.moveDown(0.4);
      });

      doc.moveDown(0.6);
      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .strokeColor("#E5E7EB")
        .stroke();

      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#111111").text("Total", 50, doc.y, { continued: true });
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#D4AF37").text(money(total), { align: "right" });

      // ===== Footer =====
      doc.moveDown(2);
      doc.font("Helvetica").fontSize(9).fillColor("#6B7280");
      doc.text(
        "This invoice confirms your booking on CarTime. If any details are incorrect, contact support at support@cartime.my.",
        { align: "left" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildBookingInvoicePdfBuffer, invoiceNumber };