/**
 * Generates discrete time slots between start and end times with optional break window.
 * @param {string} startTime - HH:MM format (e.g. "09:00")
 * @param {string} endTime - HH:MM format (e.g. "17:00")
 * @param {number} duration - slot duration in minutes (default: 30)
 * @param {string} [breakStart] - optional break start HH:MM
 * @param {string} [breakEnd] - optional break end HH:MM
 * @returns {Array<{start_time: string, end_time: string}>}
 */
export function generateTimeSlots(startTime, endTime, duration = 30, breakStart = null, breakEnd = null) {
  const slots = [];
  let current = new Date(`1970-01-01T${startTime}:00`);
  const end = new Date(`1970-01-01T${endTime}:00`);
  const breakS = breakStart ? new Date(`1970-01-01T${breakStart}:00`) : null;
  const breakE = breakEnd ? new Date(`1970-01-01T${breakEnd}:00`) : null;

  while (current < end) {
    const next = new Date(current.getTime() + duration * 60000);

    if (breakS && breakE) {
      if (current >= breakS && next <= breakE) {
        current = next;
        continue;
      }
    }

    if (next > end) break;

    slots.push({
      start_time: current.toTimeString().substring(0, 5),
      end_time: next.toTimeString().substring(0, 5),
    });

    current = next;
  }

  return slots;
}

export default generateTimeSlots;
