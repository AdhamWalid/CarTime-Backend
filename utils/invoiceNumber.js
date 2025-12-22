function invoiceNumber(bookingId) {
  // CT-YYYYMMDD-XXXXX (last 5 of booking id)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const tail = String(bookingId).slice(-5).toUpperCase();
  return `CT-${y}${m}${day}-${tail}`;
}

module.exports = { invoiceNumber };