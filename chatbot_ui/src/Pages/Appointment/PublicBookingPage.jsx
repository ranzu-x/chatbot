import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router";
import toast from "react-hot-toast";
import {
  Calendar,
  Clock,
  CheckCircle2,
  User,
  Phone,
  Mail,
  FileText,
  Briefcase,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Send,
} from "lucide-react";
import {
  fetchPublicServices,
  fetchAvailableDates,
  fetchAvailableSlots,
  bookAppointmentPublic,
} from "../../services/appointmentService";

export default function PublicBookingPage() {
  const { agencyId } = useParams();
  const [searchParams] = useSearchParams();
  const bookingKey = searchParams.get("k"); // required by the public booking API

  const [step, setStep] = useState(1); // 1: Service, 2: Date & Slot, 3: Contact Info, 4: Confirmed
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [services, setServices] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Selections
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Customer Form
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });

  // Confirmed booking response
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [svcRes, datesRes] = await Promise.all([
          fetchPublicServices(agencyId, bookingKey),
          fetchAvailableDates(agencyId, null, null, 30, bookingKey),
        ]);
        setServices(svcRes.services || []);
        setAvailableDates(datesRes.dates || []);
      } catch (err) {
        console.error("Failed to load booking info:", err);
        toast.error("Failed to load available appointments");
      } finally {
        setLoading(false);
      }
    }
    if (agencyId) init();
  }, [agencyId]);

  // When date is selected, load its slots
  const handleSelectDate = async (dateStr) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setSlotsLoading(true);
    try {
      const res = await fetchAvailableSlots(agencyId, dateStr, null, bookingKey);
      setAvailableSlots(res.slots || []);
    } catch (err) {
      toast.error("Failed to load time slots for this date");
    } finally {
      setSlotsLoading(false);
    }
  };

  // Submit booking
  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!customer.name || !customer.phone) {
      toast.error("Please enter your name and phone number");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        agency_id: parseInt(agencyId),
        booking_key: bookingKey,
        service_id: selectedService?.id || null,
        service_name: selectedService?.name || "General Consultation",
        slot_id: selectedSlot?.id || null,
        appointment_date: selectedDate,
        appointment_time: selectedSlot ? selectedSlot.start_time.substring(0, 5) : "10:00",
        duration: selectedService?.duration_minutes || 30,
        fee: selectedService?.price || 0,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email || null,
        notes: customer.notes || null,
        channel: "WEBCHAT",
        booking_source: "WEB_PORTAL",
      };

      const res = await bookAppointmentPublic(payload);
      setConfirmation(res.booking || { id: res.appointmentId, ...payload });
      setStep(4);
      toast.success("Appointment booked successfully!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateDisplay = (dateStr) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
          <p className="text-xs text-slate-500 font-semibold">Loading booking calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50/40 p-4 md:p-8 flex items-center justify-center">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-xl border border-slate-100">
        {/* Step Indicator */}
        {step < 4 && (
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                  step === 1 ? "bg-indigo-600 text-white" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                1
              </span>
              <span className={`font-semibold ${step === 1 ? "text-slate-900" : "text-slate-400"}`}>
                Service
              </span>
            </div>

            <ChevronRight size={14} className="text-slate-300" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                  step === 2
                    ? "bg-indigo-600 text-white"
                    : step > 2
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                2
              </span>
              <span className={`font-semibold ${step === 2 ? "text-slate-900" : "text-slate-400"}`}>
                Date & Time
              </span>
            </div>

            <ChevronRight size={14} className="text-slate-300" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                  step === 3 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                3
              </span>
              <span className={`font-semibold ${step === 3 ? "text-slate-900" : "text-slate-400"}`}>
                Your Details
              </span>
            </div>
          </div>
        )}

        {/* ── STEP 1: SELECT SERVICE ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Select a Service</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose the appointment type that best fits your needs.
              </p>
            </div>

            {services.length === 0 ? (
              <div
                onClick={() => {
                  setSelectedService({ name: "General Consultation", duration_minutes: 30, price: 0 });
                  setStep(2);
                }}
                className="p-4 rounded-2xl border-2 border-indigo-600 bg-indigo-50/30 cursor-pointer hover:bg-indigo-50/60 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm">General Consultation</span>
                  <span className="text-xs font-extrabold text-emerald-600">Free • 30 mins</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Default 1-on-1 consultation appointment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    onClick={() => {
                      setSelectedService(svc);
                      setStep(2);
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                      selectedService?.id === svc.id
                        ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                        : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        {svc.name}
                        {svc.color && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: svc.color }}
                          />
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{svc.description || "Consultation session."}</p>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <span className="font-extrabold text-sm text-slate-900 block">
                        {parseFloat(svc.price) > 0 ? `$${parseFloat(svc.price).toFixed(2)}` : "Free"}
                      </span>
                      <span className="text-[11px] text-slate-400">{svc.duration_minutes} mins</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: SELECT DATE & TIME ─────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Select Date & Time</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Service: <b>{selectedService?.name || "General Consultation"}</b>
                </p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft size={13} /> Change
              </button>
            </div>

            {/* Available Dates */}
            <div>
              <label className="font-bold text-xs text-slate-700 block mb-2">Available Dates</label>
              {availableDates.length === 0 ? (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-800">
                  No upcoming dates have open slots. Please check back later.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableDates.map((d) => {
                    const dStr = typeof d.slot_date === "string" ? d.slot_date : d.slot_date.substring(0, 10);
                    const isSelected = selectedDate === dStr;
                    return (
                      <button
                        key={dStr}
                        type="button"
                        onClick={() => handleSelectDate(dStr)}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                            : "border-slate-200 bg-white hover:border-indigo-300 text-slate-800"
                        }`}
                      >
                        <p className={`font-bold text-xs ${isSelected ? "text-white" : "text-slate-800"}`}>
                          {formatDateDisplay(dStr)}
                        </p>
                        <span className={`text-[10px] ${isSelected ? "text-indigo-200" : "text-slate-400"}`}>
                          {d.available_slots_count || 1} slots open
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Slots for Selected Date */}
            {selectedDate && (
              <div>
                <label className="font-bold text-xs text-slate-700 block mb-2">
                  Available Times for {formatDateDisplay(selectedDate)}
                </label>

                {slotsLoading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading slots...</div>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No slots available for this day.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2.5 rounded-xl border text-center font-bold text-xs transition ${
                            isSelected
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                              : "border-slate-200 bg-white hover:border-indigo-300 text-slate-800"
                          }`}
                        >
                          {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                disabled={!selectedDate || !selectedSlot}
                onClick={() => setStep(3)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: CUSTOMER DETAILS ───────────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={handleBookAppointment} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Your Contact Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirming for <b>{formatDateDisplay(selectedDate)}</b> at{" "}
                  <b>{selectedSlot?.start_time.substring(0, 5)}</b>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft size={13} /> Back
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Your Full Name"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">WhatsApp / Phone Number *</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    placeholder="+1234567890"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Address (optional)</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Special Notes / Reason for Visit</label>
                <textarea
                  rows={2}
                  placeholder="Anything specific you'd like us to know in advance..."
                  value={customer.notes}
                  onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
              >
                {submitting ? "Booking Appointment..." : "Confirm & Book Now"}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 4: CONFIRMATION SUCCESS ───────────────────────────────── */}
        {step === 4 && confirmation && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Appointment Confirmed!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your booking has been received and scheduled in our calendar.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2 max-w-sm mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-400">Booking Ref:</span>
                <span className="font-bold text-slate-800">#APT-{confirmation.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Service:</span>
                <span className="font-bold text-slate-800">{confirmation.service || selectedService?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date:</span>
                <span className="font-bold text-slate-800">{formatDateDisplay(confirmation.date || selectedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Time:</span>
                <span className="font-bold text-slate-800">{confirmation.time || selectedSlot?.start_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Client:</span>
                <span className="font-bold text-slate-800">{confirmation.customerName || customer.name}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              We look forward to meeting you! If you need to make changes, please contact us.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
