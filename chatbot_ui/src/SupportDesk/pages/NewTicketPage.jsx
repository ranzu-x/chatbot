import { useState } from "react";
import { useNavigate } from "react-router";
import { Paperclip, X, Loader2 } from "lucide-react";
import { ticketAPI, supportUploadAPI } from "../../services/supportDeskApi";
import { PRIORITY_OPTIONS } from "../constants";

export default function NewTicketPage({ bootstrap }) {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await supportUploadAPI.uploadFile(formData);
      setAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename, mimeType: res.data.mimeType, size: res.data.size }]);
    } catch {
      setError("Attachment upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await ticketAPI.create({ subject, departmentId: departmentId || null, priority, body, attachments });
      navigate(`/support/tickets/${res.data.ticketId}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 16 }}>New Ticket</h1>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 11px", borderRadius: 8, fontSize: "0.8rem", marginBottom: 14 }}>{error}</div>
      )}

      <form onSubmit={handleSubmit} className="sd-card sd-card-pad">
        <div className="sd-field">
          <label className="sd-label">Subject</label>
          <input className="sd-input" value={subject} onChange={(e) => setSubject(e.target.value)} required autoFocus />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="sd-field" style={{ flex: 1 }}>
            <label className="sd-label">Department</label>
            <select className="sd-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">General</option>
              {(bootstrap?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="sd-field" style={{ flex: 1 }}>
            <label className="sd-label">Priority</label>
            <select className="sd-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="sd-field">
          <label className="sd-label">Message</label>
          <textarea className="sd-textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Describe your issue in detail…" />
        </div>

        <div className="sd-field">
          <label className="sd-label">Attachments</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {attachments.map((a, i) => (
              <span key={i} className="sd-chip">
                {a.filename}
                <X size={12} style={{ cursor: "pointer" }} onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
              </span>
            ))}
          </div>
          <label className="sd-btn sd-btn-secondary sd-btn-sm" style={{ display: "inline-flex", cursor: "pointer" }}>
            {uploading ? <Loader2 size={13} className="sd-spinner" /> : <Paperclip size={13} />} Attach File
            <input type="file" hidden onChange={handleFile} disabled={uploading} />
          </label>
        </div>

        <button type="submit" className="sd-btn sd-btn-primary" disabled={saving || uploading}>
          {saving ? <Loader2 size={14} className="sd-spinner" /> : "Submit Ticket"}
        </button>
      </form>
    </div>
  );
}
