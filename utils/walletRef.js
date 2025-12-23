function genTopupReference() {
  // 12 chars: CT-XXXX-YYYY
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1
  const pick = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  return `CT-${pick(4)}-${pick(4)}`; // ex: CT-A9F2-7K3D
}

function normalizeRef(ref) {
  return String(ref || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 20);
}

module.exports = { genTopupReference, normalizeRef };