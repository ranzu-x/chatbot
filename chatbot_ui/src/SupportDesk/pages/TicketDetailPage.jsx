import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Paperclip, X, Loader2, Send, StickyNote, RotateCcw, Star } from "lucide-react";
import { ticketAPI, departmentAPI, agentsAPI, supportUploadAPI } from "../../services/supportDeskApi";
import { StatusBadge, PriorityBadge } from "../components/Badges";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "../constants";
import { useSupportSocket } from "../hooks/useSupportSocket";

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const threadEndRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await ticketAPI.getOne(id);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const { joinTicket, leaveTicket } = useSupportSocket((evt, payload) => {
    if (payload?.ticketId === Number(id)) load();
  });
  useEffect(() => {
    joinTicket(id);
    return () => leaveTicket(id);
  }, [id, joinTicket, leaveTicket]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  useEffect(() => {
    if (data?.canManage) {
      departmentAPI.list().then((r) => setDepartments(r.data.departments || [])).catch(() => {});
      agentsAPI.list().then((r) => setAgents(r.data.agents || [])).catch(() => {});
    }
  }, [data?.canManage]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await supportUploadAPI.uploadFile(formData);
      setAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename, mimeType: res.data.mimeType, size: res.data.size }]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await ticketAPI.reply(id, { body: reply, attachments, isInternalNote: isNote });
      setReply("");
      setAttachments([]);
      setIsNote(false);
      load();
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (status) => { await ticketAPI.setStatus(id, status); load(); };
  const handlePriority = async (priority) => { await ticketAPI.setPriority(id, priority); load(); };
  const handleDepartment = async (departmentId) => { await ticketAPI.setDepartment(id, departmentId || null); load(); };
  const handleAssign = async (assignedTo) => { await ticketAPI.assign(id, assignedTo || null); load(); };
  const handleReopen = async () => { await ticketAPI.reopen(id); load(); };
  const handleRate = async () => {
    if (!rating) return;
    await ticketAPI.rate(id, { rating, comment: ratingComment });
    load();
  };

  if (loading) return <div className="sd-empty">Loading…</div>;
  if (!data) return <div className="sd-empty">Ticket not found, or you don't have access to it.</div>;

  const { ticket, requester, messages, activity, isStaffViewer, canManage } = data;
  const canReply = ticket.status !== "CLOSED";
  const showRating = !isStaffViewer && ["SOLVED", "CLOSED"].includes(ticket.status) && !ticket.rating;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 2, minWidth: 320 }}>
        <button type="button" className="sd-btn sd-btn-secondary sd-btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>
          <ArrowLeft size={13} /> Back
        </button>

        <div className="sd-card sd-card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>{ticket.subject}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--sd-text-muted)" }}>
            {ticket.ticket_number} · Opened by {requester?.name} ({requester?.email})
          </div>
        </div>

        <div className="sd-card sd-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 260 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.sender_type === "REQUESTER" ? "flex-start" : "flex-end" }}>
              <div className={`sd-bubble ${m.is_internal_note ? "sd-bubble-note" : m.sender_type === "REQUESTER" ? "sd-bubble-requester" : "sd-bubble-agent"}`}>
                {m.is_internal_note && <div style={{ fontWeight: 800, fontSize: "0.68rem", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}><StickyNote size={11} /> INTERNAL NOTE</div>}
                {m.body}
                {m.attachments?.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {m.attachments.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.76rem", color: "inherit", opacity: 0.85, display: "flex", alignItems: "center", gap: 4 }}>
                        <Paperclip size={11} /> {a.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--sd-text-faint)", marginTop: 3 }}>
                {m.sender_name} · {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          ))}
          <div ref={threadEndRef} />
        </div>

        {canReply ? (
          <div className="sd-card sd-card-pad" style={{ marginTop: 12 }}>
            <textarea className="sd-textarea" rows={3} placeholder={isNote ? "Write an internal note (staff only)…" : "Write a reply…"} value={reply} onChange={(e) => setReply(e.target.value)} />
            {attachments.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                {attachments.map((a, i) => (
                  <span key={i} className="sd-chip">{a.filename} <X size={11} style={{ cursor: "pointer" }} onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))} /></span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label className="sd-btn sd-btn-secondary sd-btn-sm" style={{ cursor: "pointer" }}>
                  {uploading ? <Loader2 size={12} className="sd-spinner" /> : <Paperclip size={12} />}
                  <input type="file" hidden onChange={handleFile} disabled={uploading} />
                </label>
                {isStaffViewer && canManage && (
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--sd-text-muted)", cursor: "pointer" }}>
                    <input type="checkbox" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} /> Internal note
                  </label>
                )}
              </div>
              <button type="button" className="sd-btn sd-btn-primary" onClick={handleSend} disabled={sending || !reply.trim()}>
                {sending ? <Loader2 size={13} className="sd-spinner" /> : <Send size={13} />} {isNote ? "Add Note" : "Send Reply"}
              </button>
            </div>
          </div>
        ) : (
          <div className="sd-card sd-card-pad" style={{ marginTop: 12, textAlign: "center" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--sd-text-muted)", marginBottom: 10 }}>This ticket is closed.</p>
            {!isStaffViewer && (
              <button type="button" className="sd-btn sd-btn-secondary" onClick={handleReopen}><RotateCcw size={13} /> Reopen Ticket</button>
            )}
          </div>
        )}

        {showRating && (
          <div className="sd-card sd-card-pad" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: 8 }}>How did we do?</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={22} fill={n <= rating ? "#f59e0b" : "none"} color={n <= rating ? "#f59e0b" : "var(--sd-border)"} style={{ cursor: "pointer" }} onClick={() => setRating(n)} />
              ))}
            </div>
            <textarea className="sd-textarea" rows={2} placeholder="Optional comment…" value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} style={{ marginBottom: 8 }} />
            <button type="button" className="sd-btn sd-btn-primary sd-btn-sm" onClick={handleRate} disabled={!rating}>Submit Rating</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 240 }}>
        {isStaffViewer && canManage && (
          <div className="sd-card sd-card-pad" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: 10 }}>Ticket Details</div>
            <div className="sd-field">
              <label className="sd-label">Status</label>
              <select className="sd-select" value={ticket.status} onChange={(e) => handleStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sd-field">
              <label className="sd-label">Priority</label>
              <select className="sd-select" value={ticket.priority} onChange={(e) => handlePriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="sd-field">
              <label className="sd-label">Department</label>
              <select className="sd-select" value={ticket.department_id || ""} onChange={(e) => handleDepartment(e.target.value)}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="sd-field">
              <label className="sd-label">Assigned To</label>
              <select className="sd-select" value={ticket.assigned_to || ""} onChange={(e) => handleAssign(e.target.value)}>
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {ticket.rating && (
              <div className="sd-field">
                <label className="sd-label">Customer Rating</label>
                <div>{"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}</div>
                {ticket.rating_comment && <div style={{ fontSize: "0.78rem", color: "var(--sd-text-muted)", marginTop: 4 }}>{ticket.rating_comment}</div>}
              </div>
            )}
          </div>
        )}

        {activity?.length > 0 && (
          <div className="sd-card sd-card-pad">
            <div style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: 10 }}>Activity</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activity.map((a) => (
                <div key={a.id} style={{ fontSize: "0.76rem", color: "var(--sd-text-muted)" }}>
                  <strong>{a.actor_name || "System"}</strong> {describeActivity(a)} · {new Date(a.created_at).toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function describeActivity(a) {
  switch (a.event_type) {
    case "STATUS_CHANGED": return `changed status ${a.from_value} → ${a.to_value}`;
    case "PRIORITY_CHANGED": return `changed priority ${a.from_value} → ${a.to_value}`;
    case "DEPARTMENT_CHANGED": return "changed department";
    case "ASSIGNED": return "changed assignee";
    case "REOPENED": return "reopened the ticket";
    default: return a.event_type;
  }
}
