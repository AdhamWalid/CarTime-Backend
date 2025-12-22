// utils/buildMonthlyRevenuePdfBuffer.js
const PDFDocument = require("pdfkit");

async function buildMonthlyRevenuePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ✅ draw everything here using payload...
    doc.fontSize(18).text("Monthly Revenue Summary");
    doc.moveDown();
    doc.fontSize(12).text(`Month: ${payload.month}`);
    doc.text(`Revenue: ${payload.totals?.revenue || 0}`);

    doc.end(); // ✅ MUST be called once at the end
  });
}

module.exports = { buildMonthlyRevenuePdfBuffer };