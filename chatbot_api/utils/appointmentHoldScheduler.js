import { lockedJob } from "./jobLock.js";
import { processExpiredHolds } from "./appointmentBookingEngine.js";

// Temporary appointment slot holds (utils/appointmentAvailability.js) stop
// counting against a slot the moment they expire — availability checks
// `expires_at > NOW()` themselves — so this job is not what frees the slot.
// It marks the holds EXPIRED, closes the checkout of a hold that was waiting
// for payment and tells that customer the time was released.
const INTERVAL_MS = 30 * 1000;

export function startAppointmentHoldScheduler() {
  const run = lockedJob("appointment-holds", async () => {
    try {
      const n = await processExpiredHolds();
      if (n) console.log(`⌛ Appointment holds: ${n} expired`);
    } catch (err) {
      console.error("[AppointmentHolds] run failed:", err.message);
    }
  });
  setInterval(run, INTERVAL_MS);
}
