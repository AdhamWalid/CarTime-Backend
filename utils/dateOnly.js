function parseDateOnly(str) {
  // Expect "YYYY-MM-DD"
  const [y, m, d] = (str || "").split("-").map(Number);
  if (!y || !m || !d) return null;

  // Date.UTC avoids timezone shifting issues
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function toDateOnlyString(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

module.exports = { parseDateOnly, toDateOnlyString };