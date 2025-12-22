// backend/routes/bookings.js
const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const UserEvent = require("../models/UserEvent");
const Invoice = require("../models/invoice")
const sendEmail = require("../utils/sendEmail"); // your util path
const { bookingInvoiceHtml } = require("../utils/invoiceEmail");
const { buildBookingInvoicePdfBuffer } = require("../utils/invoicePdf");
const { invoiceNumber } = require("../utils/invoiceNumber");
const { requireAuth } = require("../middleware/auth");
const { sendExpoPushNotification } = require("../utils/expoPush");
const { parseDateOnly, toDateOnlyString } = require("../utils/dateOnly");

// ---------- helpers ----------
function toUtcStartOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function diffNights(startISO, endISO) {
  const start = toUtcStartOfDay(new Date(startISO));
  const end = toUtcStartOfDay(new Date(endISO));
  const ms = end - start;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ✅ PUBLIC: GET /api/bookings/car/:carId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/car/:carId/calendar", async (req, res) => {
  try {
    const { carId } = req.params;

    const fromStr = String(req.query.from || "");
    const toStr = String(req.query.to || "");

    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "from/to are required (YYYY-MM-DD)" });
    }

    const from = parseDateOnly(fromStr);
    const to = parseDateOnly(toStr);

    if (!from || !to || to <= from) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    const bookings = await Booking.find({
      car: carId, // ✅ correct field
      status: { $in: ["pending", "confirmed"] },
      startDate: { $lt: to },
      endDate: { $gt: from },
    }).select("startDate endDate");

    const blocked = new Set();

    bookings.forEach((b) => {
      let cur = new Date(b.startDate);
      cur.setHours(0, 0, 0, 0);

      const end = new Date(b.endDate);
      end.setHours(0, 0, 0, 0);

      // Block days from start (inclusive) to end (exclusive)
      while (cur < end) {
        blocked.add(toDateOnlyString(cur));
        cur = addDays(cur, 1);
      }
    });

    return res.json({ carId, bookedDates: [...blocked] });
  } catch (err) {
    console.error("Calendar error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Everything below requires login
router.use(requireAuth);

function money(n) {
  return `RM ${Number(n || 0).toFixed(2)}`;
}
function fmtDT(d) {
  return new Date(d).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInvoiceEmailHtml({ renterName, booking, nights }) {
  const inv = invoiceNumber(booking._id);

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #eef0f4; border-radius:16px; overflow:hidden;">
      
      <!-- Header -->
      <div style="padding:18px 20px; background:linear-gradient(135deg,#0b1220,#111827);">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="font-size:14px; letter-spacing:0.4px; color:#cbd5e1; font-weight:700;">CarTime</div>
            <div style="font-size:20px; color:#fff; font-weight:900; margin-top:2px;">Booking Invoice</div>
            <div style="font-size:12px; color:rgba(255,255,255,0.70); margin-top:4px;">Invoice #${inv}</div>
          </div>
          <div style="padding:8px 10px; border-radius:999px; background:rgba(212,175,55,0.18); border:1px solid rgba(212,175,55,0.35); color:#D4AF37; font-weight:800; font-size:12px;">
            Confirmed ✅
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:18px 20px; color:#0f172a;">
        <p style="margin:0 0 12px; color:#334155;">
          Hi <b>${renterName || "Customer"}</b>, your booking is confirmed. Your PDF invoice is attached.
        </p>

        <!-- Trip details card -->
        <div style="border:1px solid #eef0f4; border-radius:14px; padding:14px; margin:12px 0;">
          <div style="font-weight:900; margin-bottom:10px;">Trip details</div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            ${row("Car", booking.carTitle)}
            ${row("Plate", booking.carPlate || "N/A")}
            ${row("Pickup city", booking.pickupCity || "—")}
            ${row("Pickup", fmtDT(booking.startDate))}
            ${row("Return", fmtDT(booking.endDate))}
            ${row("Payment", booking.paymentStatus)}
          </table>
        </div>

        <!-- Pricing card -->
        <div style="border:1px solid #eef0f4; border-radius:14px; padding:14px; margin:12px 0;">
          <div style="font-weight:900; margin-bottom:10px;">Pricing</div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            ${row("Days", String(nights))}
            ${row("Rate / day", money(booking.carPricePerDay))}
            ${row("Subtotal", money(booking.totalPrice))}
            <tr>
              <td style="padding:10px 0; font-weight:900;">Total</td>
              <td style="padding:10px 0; font-weight:900; text-align:right; color:#D4AF37;">${money(booking.totalPrice)}</td>
            </tr>
          </table>
        </div>

        <!-- CTA -->
        <div style="margin-top:14px;">
          <a href="https://cartime.my" style="display:inline-block; padding:12px 16px; border-radius:12px; background:#111827; color:#fff; text-decoration:none; font-weight:900;">
            Open CarTime
          </a>
          <span style="display:inline-block; margin-left:10px; color:#64748b; font-size:12px;">
            Need help? support@cartime.my
          </span>
        </div>

        <div style="margin-top:16px; color:#94a3b8; font-size:11px;">
          Invoice is generated automatically. Please keep this email for your records.
        </div>
      </div>
    </div>
  </div>
  `;
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:6px 0; color:#64748b;">${label}</td>
      <td style="padding:6px 0; font-weight:800; text-align:right; color:#0f172a;">${value}</td>
    </tr>
  `;
}

// ---------- POST /api/bookings ----------
router.post("/", async (req, res) => {
  try {
    const { carId, startDate, endDate, contactPhone } = req.body;

    if (!carId || !startDate || !endDate || !contactPhone) {
      return res.status(400).json({
        message: "carId, startDate, endDate, contactPhone are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!isValidDate(start) || !isValidDate(end) || end <= start) {
      return res.status(400).json({
        message: "Invalid dates. endDate must be after startDate.",
      });
    }

    const car = await Car.findById(carId).lean();
    if (!car || car.status !== "published") {
      return res.status(400).json({ message: "Car not available for booking" });
    }

    const nights = diffNights(start.toISOString(), end.toISOString());
    if (isNaN(nights) || nights < 1) {
      return res.status(400).json({
        message: "Minimum booking is 1 day. Please check your dates.",
      });
    }

    const conflict = await Booking.findOne({
      car: carId,
      status: { $in: ["pending", "confirmed"] },
      startDate: { $lt: end },
      endDate: { $gt: start },
    }).select("_id startDate endDate");

    if (conflict) {
      return res.status(409).json({
        error: "DATES_UNAVAILABLE",
        message: "Selected dates are already booked.",
      });
    }

    const totalPrice = nights * (car.pricePerDay || 0);

    // 1) Create booking
    const booking = await Booking.create({
      user: req.user.id,
      car: carId,

      carPlate: car.plateNumber || "N/A",
      carTitle: car.title || `${car.make || ""} ${car.model || ""}`.trim(),
      carPricePerDay: car.pricePerDay || 0,

      startDate: start,
      endDate: end,

      totalPrice,
      pickupCity: car.locationCity,
      contactPhone,

      status: "confirmed",
      paymentStatus: "pending",
    });

    await UserEvent.create({
      user: req.user.id,
      action: "booking_created",
      targetType: "Booking",
      targetId: booking._id.toString(),
      description: `Booking created for ${booking.carTitle}`,
      meta: {
        carTitle: booking.carTitle,
        carPlate: booking.carPlate,
        totalPrice: booking.totalPrice,
        startDate: booking.startDate,
        endDate: booking.endDate,
        pickupCity: booking.pickupCity,
      },
    });

    const renter = await User.findById(req.user.id).select("name email expoPushToken");

    // 2) Create invoice record FIRST (so it always exists)
    const invNo = invoiceNumber(booking._id);

    let invoiceDoc = await Invoice.create({
      invoiceNumber: invNo,
      booking: booking._id,
      user: req.user.id,
      car: carId,

      renterName: renter?.name || "",
      renterEmail: renter?.email || "",
      contactPhone,

      carTitle: booking.carTitle,
      carPlate: booking.carPlate,
      pickupCity: booking.pickupCity,

      startDate: booking.startDate,
      endDate: booking.endDate,
      nights,

      currency: "MYR",
      subtotal: booking.totalPrice,
      discount: 0,
      promoCode: null,
      amount: booking.totalPrice,

      status: "issued",
      pdf: { storage: "none" },
      email: { sent: false, sentAt: null, error: null },
    });

    // 3) Generate PDF + upload + email (DON’T fail booking if this fails)
    try {
      if (renter?.email) {
        const pdfBuffer = await buildBookingInvoicePdfBuffer({
          renterName: renter.name,
          renterEmail: renter.email,
          booking,
          nights,
          invoiceNumber: invNo, // optional if your pdf util supports it
        });

        // Upload to GridFS (optional but recommended)
        if (req.app.locals.gridfsBucket) {
          const fileId = await uploadPdfToGridFS({
            bucket: req.app.locals.gridfsBucket,
            buffer: pdfBuffer,
            filename: `CarTime-Invoice-${invNo}.pdf`,
            metadata: {
              invoiceNumber: invNo,
              bookingId: booking._id.toString(),
              userId: req.user.id,
            },
          });

          await Invoice.updateOne(
            { _id: invoiceDoc._id },
            {
              $set: {
                "pdf.storage": "gridfs",
                "pdf.fileId": fileId,
                "pdf.filename": `CarTime-Invoice-${invNo}.pdf`,
                "pdf.mime": "application/pdf",
              },
            }
          );
        }

        const html = buildInvoiceEmailHtml({ renterName: renter.name, booking, nights });

        await sendEmail({
          to: renter.email,
          subject: `CarTime Invoice ${invNo} — ${booking.carTitle}`,
          html,
          text: `Your booking is confirmed. Invoice #${invNo} is attached.`,
          attachments: [
            {
              filename: `CarTime-Invoice-${invNo}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
              contentDisposition: "attachment",
            },
          ],
        });

        await Invoice.updateOne(
          { _id: invoiceDoc._id },
          { $set: { "email.sent": true, "email.sentAt": new Date(), "email.error": null } }
        );
      }
    } catch (e) {
      console.error("Invoice PDF/email failed:", e);
      await Invoice.updateOne(
        { _id: invoiceDoc._id },
        { $set: { "email.sent": false, "email.error": String(e?.message || e) } }
      );
    }

    // push notifications (keep your existing logic)
    if (renter?.expoPushToken) {
      await sendExpoPushNotification(renter.expoPushToken, {
        title: "Booking Confirmed ✅",
        body: `Your booking for ${booking.carTitle} is confirmed.`,
        data: { type: "BOOKING_CONFIRMED", bookingId: booking._id.toString() },
      });
    }

    if (car.ownerId) {
      const owner = await User.findById(car.ownerId).select("expoPushToken name");
      if (owner?.expoPushToken) {
        await sendExpoPushNotification(owner.expoPushToken, {
          title: "New booking 📅",
          body: `${renter?.name || "A customer"} booked your ${booking.carTitle}.`,
          data: { type: "NEW_BOOKING", bookingId: booking._id.toString(), carId: carId.toString() },
        });
      }
    }

    return res.status(201).json({ booking, invoiceId: invoiceDoc._id, invoiceNumber: invNo });
  } catch (err) {
    console.error("Create booking error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});
// ---------- GET /api/bookings/my ----------
router.get("/my", async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(bookings);
  } catch (err) {
    console.error("My bookings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;