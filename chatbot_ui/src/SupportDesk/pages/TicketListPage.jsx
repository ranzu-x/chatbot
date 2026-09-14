import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { Search, Plus, Ticket as TicketIcon } from "lucide-react";
import { ticketAPI } from "../../services/supportDeskApi";
import { StatusBadge, PriorityBadge } from "../components/Badges";
import { STATUS_OPTIONS } from "../constants";
import { useSupportSocket } from "../hooks/useSupportSocket";

function relativeTime(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TicketListPage({ mode }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = status ? { status } : {};
      if (mode === "queue" && search) params.search = search;
      const res = mode === "queue" ? await ticketAPI.queue(params) : await ticketAPI.myTickets(params);
      setTickets(res.data.tickets || []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [mode, status, search]);

  useEffect(() => { load(); }, [load]);
  useSupportSocket((evt) => {
    if (evt === "support_ticket:new" || evt === "support_ticket:updated") load();
  });

  const title = mode === "queue" ? "Support Queue" : "My Tickets";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>{title}</h1>
        {mode !== "queue" && (
          <Link to="/support/new" className="sd-btn sd-btn-primary">
            <Plus size={14} /> New Ticket
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={`sd-chip ${status === "" ? "active" : ""}`} onClick={() => setStatus("")}>All</button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" className={`sd-chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
            <StatusBadgeInline status={s} />
          </button>
        ))}
        {mode === "queue" && (
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: 9, color: "var(--sd-text-faint)" }} />
            <input className="sd-input" style={{ paddingLeft: 30, width: 220 }} placeholder="Search subject, #, requester…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      <div className="sd-card">
        {loading ? (
          <div className="sd-empty">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="sd-empty">
            <TicketIcon size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>No tickets here yet.</div>
          </div>
        ) : (
          tickets.map((t) => (
            <Link key={t.id} to={`/support/tickets/${t.id}`} className="sd-ticket-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{t.subject}</span>
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--sd-text-muted)" }}>
                  {t.ticket_number} {t.department_name ? `· ${t.department_name}` : ""} {mode === "queue" && t.requester_name ? `· ${t.requester_name}` : ""}
                  {mode === "queue" && t.requester_agency_name ? ` (${t.requester_agency_name})` : ""}
                </div>
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--sd-text-faint)", flexShrink: 0 }}>{relativeTime(t.last_activity_at || t.created_at)}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadgeInline({ status }) {
  const labels = { PENDING: "Pending", ANSWERED: "Answered", ON_HOLD: "On Hold", SOLVED: "Solved", CLOSED: "Closed" };
  return <>{labels[status] || status}</>;
}
