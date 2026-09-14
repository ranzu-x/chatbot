import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { cannedResponseAPI } from "../../services/supportDeskApi";

export default function CannedResponsesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cannedResponseAPI.list();
      setItems(res.data.cannedResponses || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await cannedResponseAPI.create({ title, body });
      setTitle("");
      setBody("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await cannedResponseAPI.remove(id);
    load();
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 16 }}>Canned Responses</h1>
      <p style={{ fontSize: "0.8rem", color: "var(--sd-text-muted)", marginBottom: 16 }}>
        Quick-reply snippets your team can reuse when answering tickets.
      </p>

      <form onSubmit={handleCreate} className="sd-card sd-card-pad" style={{ marginBottom: 16 }}>
        <div className="sd-field">
          <label className="sd-label">Title</label>
          <input className="sd-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Password reset steps" />
        </div>
        <div className="sd-field">
          <label className="sd-label">Response</label>
          <textarea className="sd-textarea" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <button type="submit" className="sd-btn sd-btn-primary" disabled={saving || !title.trim() || !body.trim()}>
          {saving ? <Loader2 size={13} className="sd-spinner" /> : <Plus size={13} />} Add
        </button>
      </form>

      <div className="sd-card">
        {loading ? (
          <div className="sd-empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="sd-empty">No canned responses yet.</div>
        ) : (
          items.map((c) => (
            <div key={c.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--sd-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{c.title}</div>
                <button type="button" className="sd-btn sd-btn-danger sd-btn-sm" onClick={() => handleDelete(c.id)}><Trash2 size={12} /></button>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--sd-text-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
