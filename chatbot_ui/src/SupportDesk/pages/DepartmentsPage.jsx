import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { departmentAPI } from "../../services/supportDeskApi";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await departmentAPI.list();
      setDepartments(res.data.departments || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await departmentAPI.create({ name, description });
      setName("");
      setDescription("");
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create department");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (departments.find((d) => d.id === id)?.is_default) return;
    await departmentAPI.remove(id);
    load();
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 16 }}>Departments</h1>

      <form onSubmit={handleCreate} className="sd-card sd-card-pad" style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="sd-field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label className="sd-label">Name</label>
          <input className="sd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing" />
        </div>
        <div className="sd-field" style={{ flex: 2, minWidth: 180, marginBottom: 0 }}>
          <label className="sd-label">Description (optional)</label>
          <input className="sd-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button type="submit" className="sd-btn sd-btn-primary" disabled={saving || !name.trim()}>
          {saving ? <Loader2 size={13} className="sd-spinner" /> : <Plus size={13} />} Add
        </button>
      </form>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 11px", borderRadius: 8, fontSize: "0.8rem", marginBottom: 14 }}>{error}</div>}

      <div className="sd-card">
        {loading ? (
          <div className="sd-empty">Loading…</div>
        ) : departments.length === 0 ? (
          <div className="sd-empty">No departments yet.</div>
        ) : (
          departments.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--sd-border)" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{d.name} {d.is_default ? <span style={{ fontSize: "0.68rem", color: "var(--sd-text-faint)" }}>(default)</span> : null}</div>
                {d.description && <div style={{ fontSize: "0.78rem", color: "var(--sd-text-muted)" }}>{d.description}</div>}
              </div>
              {!d.is_default && (
                <button type="button" className="sd-btn sd-btn-danger sd-btn-sm" onClick={() => handleDelete(d.id)}><Trash2 size={12} /></button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
