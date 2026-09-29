import { useEffect, useMemo, useState } from "react";
import { CreditCard, Clock, CalendarRange, AlertTriangle, Save } from "lucide-react";
import { toast } from "../../lib/alerts";
import { fetchBookingSettings, saveBookingSettings } from "../../services/appointmentService";

const inputStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: "0.82rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
const cardStyle = {
  background: "var(--bg-surface)",
  borderRadius: 12,
  border: "1px solid var(--border)",
  padding: 20,
  boxShadow: "var(--shadow-sm)",
};
const labelStyle = { fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 };
const hintStyle = { fontSize: "0.74rem", color: "var(--text-muted)", margin: "4px 0 0" };

const PAYMENT_OPTIONS = [
  { id: "NONE", title: "No payment", text: "The booking is confirmed as soon as the subscriber confirms." },
  { id: "REQUIRED", title: "Payment required", text: "The time is held while they pay; the appointment is confirmed only after a successful payment." },
  { id: "PAY_LATER", title: "Pay later", text: "The booking is confirmed right away; a payment link is sent and the payment stays pending until paid." },
];

function timezoneList() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

/**
 * Rules for booking through the chatbot (WhatsApp list flow):
 * payment, how long a picked time is held, how far ahead / how soon people
 * can book, a daily cap and the workspace timezone.
 * Backed by GET/PUT /appointments/settings.
 */
export default function BookingSettingsPanel() {
  const [form, setForm] = useState(null);
  const [providerReady, setProviderReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(timezoneList, []);

  useEffect(() => {
    fetchBookingSettings()
      .then((data) => {
        setForm({ ...data.settings, max_bookings_per_day: data.settings.max_bookings_per_day ?? "" });
        setProviderReady(Boolean(data.paymentProviderReady));
      })
      .catch(() => toast.error("Could not load booking settings"));
  }, []);

  if (!form) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: "0.84rem" }}>Loading booking settings…</div>;
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const holdMinutes = Number(form.hold_minutes) || 0;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        payment_mode: form.payment_mode,
        hold_minutes: Number(form.hold_minutes),
        booking_window_days: Number(form.booking_window_days),
        min_notice_minutes: Number(form.min_notice_minutes),
        max_bookings_per_day: form.max_bookings_per_day === "" ? null : Number(form.max_bookings_per_day),
        timezone: form.timezone || null,
      };
      const data = await saveBookingSettings(payload);
      setForm({ ...data.settings, max_bookings_per_day: data.settings.max_bookings_per_day ?? "" });
      toast.success("Booking settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save booking settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
          <CreditCard size={16} style={{ color: "var(--primary)" }} /> Payment
        </h3>
        <p style={hintStyle}>
          The amount is the price of the booked service (Services Catalog). Free services never ask for payment. A Flow Campaign can override this.
        </p>
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {PAYMENT_OPTIONS.map((o) => (
            <label
              key={o.id}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${form.payment_mode === o.id ? "var(--primary)" : "var(--border)"}`,
                background: form.payment_mode === o.id ? "var(--bg-selected, #eef2ff)" : "transparent",
              }}
            >
              <input type="radio" name="payment_mode" value={o.id} checked={form.payment_mode === o.id} onChange={set("payment_mode")} style={{ marginTop: 3 }} />
              <span>
                <span style={{ fontSize: "0.83rem", fontWeight: 700, color: "var(--text-primary)" }}>{o.title}</span>
                <span style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)" }}>{o.text}</span>
              </span>
            </label>
          ))}
        </div>
        {form.payment_mode !== "NONE" && !providerReady && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: "0.76rem", color: "#92400e" }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            Card payments aren't configured on this server yet (no Stripe keys), so customers would get a test checkout page. Ask the platform administrator to set up Stripe before going live.
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
          <Clock size={16} style={{ color: "var(--primary)" }} /> Holding a picked time
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="bs-hold">Hold for (minutes)</label>
            <input id="bs-hold" type="number" min={1} max={1440} value={form.hold_minutes} onChange={set("hold_minutes")} style={inputStyle} />
            <p style={hintStyle}>
              While a subscriber confirms, nobody else can take that time.
              {form.payment_mode === "REQUIRED" && holdMinutes < 30 && " With card payment the hold lasts at least 30 minutes (Stripe's shortest checkout)."}
            </p>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
          <CalendarRange size={16} style={{ color: "var(--primary)" }} /> Availability
        </h3>
        <p style={hintStyle}>Days, working hours, slot length and breaks come from your Calendar Slots and Weekly Working Hours.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="bs-window">Bookable up to (days ahead)</label>
            <input id="bs-window" type="number" min={1} max={365} value={form.booking_window_days} onChange={set("booking_window_days")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="bs-notice">Minimum notice (minutes)</label>
            <input id="bs-notice" type="number" min={0} max={43200} value={form.min_notice_minutes} onChange={set("min_notice_minutes")} style={inputStyle} />
            <p style={hintStyle}>0 = any time that hasn't started yet.</p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="bs-cap">Maximum appointments per day</label>
            <input id="bs-cap" type="number" min={0} max={10000} placeholder="No limit" value={form.max_bookings_per_day} onChange={set("max_bookings_per_day")} style={inputStyle} />
            <p style={hintStyle}>Empty or 0 = no daily limit (each slot's own capacity still applies).</p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="bs-tz">Timezone of your slots</label>
            <select id="bs-tz" value={form.timezone || ""} onChange={set("timezone")} style={inputStyle}>
              <option value="">Server time (default)</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <p style={hintStyle}>Used to hide times that have already passed.</p>
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px",
            fontWeight: 600, fontSize: "0.83rem", display: "inline-flex", alignItems: "center", gap: 6,
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={14} /> {saving ? "Saving…" : "Save booking settings"}
        </button>
      </div>
    </div>
  );
}
