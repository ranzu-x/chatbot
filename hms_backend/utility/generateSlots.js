function generateTimeSlots(startTime, endTime, duration, breakStart, breakEnd) {
    const slots = [];
    let current = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    const breakS = breakStart ? new Date(`1970-01-01T${breakStart}:00`) : null;
    const breakE = breakEnd ? new Date(`1970-01-01T${breakEnd}:00`) : null;

    while (current < end) {
        const next = new Date(current.getTime() + duration * 60000);

        // break time logic
        if (breakS && breakE) {
            if (current >= breakS && next <= breakE) {
                current = next;
                continue;
            }
        }

        if (next > end) break;

        slots.push({
            start_time: current.toTimeString().substring(0, 5),
            end_time: next.toTimeString().substring(0, 5)
        });

        current = next;
    }

    return slots;
}

module.exports = generateTimeSlots;
