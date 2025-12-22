// utils/invoiceEmail.js
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
  // short, readable invoice no
  return `CT-${String(bookingId).slice(-8).toUpperCase()}`;
}

function bookingInvoiceHtml({ renterName, renterEmail, booking, nights }) {
  const invNo = invoiceNumber(booking._id);

  const carTitle = booking.carTitle || "Car";
  const plate = booking.carPlate || "N/A";
  const city = booking.pickupCity || "—";
  const start = fmtDT(booking.startDate);
  const end = fmtDT(booking.endDate);

  const pricePerDay = money(booking.carPricePerDay);
  const total = money(booking.totalPrice);

  return `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
      <div style="padding:18px 20px; background:#0b0b0b;">
        <div style="font-size:16px; font-weight:800; color:#D4AF37;">CarTime</div>
        <div style="font-size:12px; color:#9ca3af; margin-top:4px;">Booking Invoice</div>
      </div>

      <div style="padding:20px;">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-size:12px; color:#6b7280;">Billed to</div>
            <div style="font-size:14px; font-weight:800; color:#111827; margin-top:2px;">${renterName || "Customer"}</div>
            <div style="font-size:12px; color:#6b7280;">${renterEmail || ""}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#6b7280;">Invoice</div>
            <div style="font-size:14px; font-weight:900; color:#111827; margin-top:2px;">${invNo}</div>
            <div style="font-size:12px; color:#6b7280;">Issued: ${fmtDT(new Date())}</div>
          </div>
        </div>

        <div style="height:1px; background:#e5e7eb; margin:16px 0;"></div>

        <div style="font-size:13px; font-weight:900; color:#111827; margin-bottom:10px;">Trip details</div>

        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#6b7280;">Car</td>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#111827; font-weight:800;">${carTitle}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#6b7280;">Plate</td>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#111827; font-weight:800;">${plate}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#6b7280;">Pickup city</td>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#111827; font-weight:800;">${city}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#6b7280;">Pickup</td>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#111827; font-weight:800;">${start}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#6b7280;">Return</td>
            <td style="padding:10px; border:1px solid #e5e7eb; color:#111827; font-weight:800;">${end}</td>
          </tr>
        </table>

        <div style="height:1px; background:#e5e7eb; margin:16px 0;"></div>

        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div style="color:#6b7280; font-size:12px;">
            <div>Days: <b style="color:#111827;">${nights}</b></div>
            <div>Rate: <b style="color:#111827;">${pricePerDay} / day</b></div>
            <div>Status: <b style="color:#111827;">${booking.status}</b></div>
            <div>Payment: <b style="color:#111827;">${booking.paymentStatus}</b></div>
          </div>

          <div style="min-width:220px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#6b7280;">
              <span>Subtotal</span>
              <span style="color:#111827; font-weight:900;">${total}</span>
            </div>
            <div style="height:1px; background:#e5e7eb; margin:10px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-size:14px;">
              <span style="font-weight:900; color:#111827;">Total</span>
              <span style="font-weight:900; color:#D4AF37;">${total}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:16px; font-size:11px; color:#6b7280; line-height:16px;">
          This email is your invoice/receipt for the booking created on CarTime. If any details are wrong, contact support.
        </div>

        <div style="margin-top:14px;">
          <a href="mailto:support@cartime.my"
             style="display:inline-block; background:#0b0b0b; color:#ffffff; padding:10px 14px; border-radius:12px; text-decoration:none; font-weight:800; font-size:12px;">
             Contact Support
          </a>
        </div>
      </div>
    </div>
  </div>
  `;
}

module.exports = { bookingInvoiceHtml, invoiceNumber };