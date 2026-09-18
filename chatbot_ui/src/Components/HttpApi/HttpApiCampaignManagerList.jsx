import { Fragment, useState, useEffect, useCallback } from 'react';
import { httpApiCampaignAPI, customFieldAPI } from '../../services/api';
import { ChevronDown, ChevronRight, RefreshCw, Plus, Pencil, Trash2, PlayCircle, Globe, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TYPES = [
  { id: 'SEND', label: 'Send Data', hint: 'Posts field values out to an external API' },
  { id: 'COLLECT', label: 'Collect Data', hint: 'Fetches data from an API into custom fields' },
  { id: 'BOTH', label: 'Both', hint: 'Sends data and maps the response back onto fields' },
];

const iconBtn = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
  color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
};

const EMPTY_FORM = {
  name: '', description: '', campaignType: 'SEND', method: 'POST', url: '',
  headers: [{ key: '', value: '' }], bodyTemplate: '', responseMappings: [], timeoutMs: 10000,
};

function fmtDateTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

/** One campaign's expandable "Logs" panel — recent execution history, fetched lazily. */
function CampaignLogs({ campaignId }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    httpApiCampaignAPI.getLogs(campaignId)
      .then((res) => { if (!cancelled) setLogs(res.data?.logs || []); })
      .catch(() => { if (!cancelled) setLogs([]); });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (logs === null) return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>Loading logs...</div>;
  if (!logs.length) return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>No executions yet — use "Test" to try it, or trigger it from a flow.</div>;

  return (
    <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map((l) => (
        <div key={l.id} style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: l.is_success ? '#16a34a' : '#dc2626' }}>
              {l.is_success ? 'Success' : 'Failed'} {l.response_status ? `(HTTP ${l.response_status})` : ''}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtDateTime(l.created_at)} · {l.execution_time_ms}ms</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{l.request_method} {l.request_url}</div>
          {l.error_message && <div style={{ fontSize: '0.74rem', color: '#dc2626', marginTop: 4 }}>{l.error_message}</div>}
        </div>
      ))}
    </div>
  );
}

export default function HttpApiCampaignManagerList() {
  const [campaigns, setCampaigns] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([httpApiCampaignAPI.getAll(), customFieldAPI.getAll()])
      .then(([campRes, fieldRes]) => {
        setCampaigns(campRes.data?.campaigns || []);
        setFields(fieldRes.data?.fields || []);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    const headersArr = Object.entries(c.headers_json || {}).map(([key, value]) => ({ key, value }));
    setForm({
      name: c.name, description: c.description || '', campaignType: c.campaign_type, method: c.method,
      url: c.url, headers: headersArr.length ? headersArr : [{ key: '', value: '' }],
      bodyTemplate: c.body_template || '', responseMappings: c.response_mappings || [], timeoutMs: c.timeout_ms || 10000,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      Swal.fire({ icon: 'error', title: 'Missing fields', text: 'Name and URL are required.' });
      return;
    }
    setSaving(true);
    const headersObj = Object.fromEntries(form.headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]));
    const payload = {
      name: form.name.trim(), description: form.description || null, campaignType: form.campaignType,
      method: form.method, url: form.url.trim(), headers: headersObj, bodyTemplate: form.bodyTemplate || null,
      responseMappings: form.responseMappings.filter((m) => m.fieldId && m.jsonPath), timeoutMs: Number(form.timeoutMs) || 10000,
    };
    try {
      if (editingId) await httpApiCampaignAPI.update(editingId, payload);
      else await httpApiCampaignAPI.create(payload);
      setShowForm(false);
      load();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not save campaign', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    const ok = await Swal.fire({
      title: `Delete "${c.name}"?`, text: 'Any flow node calling this campaign will stop working. This cannot be undone.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;
    try {
      await httpApiCampaignAPI.delete(c.id);
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not delete', text: err?.response?.data?.message || 'Please try again.' });
    }
  };

  const handleTest = async (c) => {
    setTestingId(c.id);
    try {
      const res = await httpApiCampaignAPI.test(c.id);
      const r = res.data?.result;
      Swal.fire({
        icon: r?.success ? 'success' : 'error',
        title: r?.success ? `Success (HTTP ${r.status})` : 'Request failed',
        html: `<pre style="text-align:left;max-height:260px;overflow:auto;font-size:11px;white-space:pre-wrap;">${
          (r?.errorMessage || JSON.stringify(r?.responseBody, null, 2) || '').replace(/</g, '&lt;')
        }</pre>`,
      });
      setExpandedId(c.id);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Test failed', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setTestingId(null);
    }
  };

  const addHeaderRow = () => setForm((f) => ({ ...f, headers: [...f.headers, { key: '', value: '' }] }));
  const updateHeaderRow = (i, key, value) => setForm((f) => ({ ...f, headers: f.headers.map((h, idx) => (idx === i ? { key, value } : h)) }));
  const removeHeaderRow = (i) => setForm((f) => ({ ...f, headers: f.headers.filter((_, idx) => idx !== i) }));

  const addMapping = () => setForm((f) => ({ ...f, responseMappings: [...f.responseMappings, { jsonPath: '', fieldId: '' }] }));
  const updateMapping = (i, patch) => setForm((f) => ({ ...f, responseMappings: f.responseMappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) }));
  const removeMapping = (i) => setForm((f) => ({ ...f, responseMappings: f.responseMappings.filter((_, idx) => idx !== i) }));

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading campaigns...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button onClick={load} title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          <Plus size={14} /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#5c5c80' }}>
          <Globe size={30} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: '0.86rem', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            Create a reusable HTTP API campaign — send custom field values out to an external API, or pull data back
            into a contact's fields. Call it from any flow with an "HTTP API" node.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e4e4f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 14px' }}></th>
                <th style={{ padding: '10px 14px' }}>Campaign</th>
                <th style={{ padding: '10px 14px' }}>Type</th>
                <th style={{ padding: '10px 14px' }}>Request</th>
                <th style={{ padding: '10px 14px' }}>Runs</th>
                <th style={{ padding: '10px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const isOpen = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : c.id)}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : c.id)}>
                        {c.name}
                        {!c.is_active && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>(inactive)</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: '0.7rem', fontWeight: 700 }}>
                          {TYPES.find((t) => t.id === c.campaign_type)?.label || c.campaign_type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                        {c.method} {c.url.length > 40 ? c.url.slice(0, 40) + '…' : c.url}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{c.executionCount || 0}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" title="Test" style={iconBtn} onClick={() => handleTest(c)} disabled={testingId === c.id}>
                            {testingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                          </button>
                          <button type="button" title="Edit" style={iconBtn} onClick={() => openEdit(c)}>
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Delete" style={{ ...iconBtn, color: '#ef4444' }} onClick={() => handleDelete(c)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: '#fafbfc' }}>
                          <CampaignLogs campaignId={c.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{editingId ? 'Edit' : 'New'} HTTP API Campaign</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Campaign Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sync order status" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>What does this campaign do?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {TYPES.map((t) => (
                    <button key={t.id} type="button" onClick={() => setForm((f) => ({ ...f, campaignType: t.id }))}
                      title={t.hint}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: form.campaignType === t.id ? '1.5px solid #0f172a' : '1px solid #e2e8f0', background: form.campaignType === t.id ? '#f8fafc' : '#fff', fontSize: '0.76rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 110 }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Method</label>
                  <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} style={{ width: '100%', padding: '9px 8px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>URL *</label>
                  <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://api.example.com/contacts/{{contact.phone}}" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Headers</label>
                {form.headers.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input value={h.key} onChange={(e) => updateHeaderRow(i, e.target.value, h.value)} placeholder="Header name" style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                    <input value={h.value} onChange={(e) => updateHeaderRow(i, h.key, e.target.value)} placeholder="Value (supports {{field_key}})" style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                    <button type="button" onClick={() => removeHeaderRow(i)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button type="button" onClick={addHeaderRow} style={{ fontSize: '0.74rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>+ Add header</button>
              </div>

              {form.method !== 'GET' && form.method !== 'DELETE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Body (JSON — supports {'{{field_key}}'} and {'{{contact.name/phone/email}}'})</label>
                  <textarea rows={4} value={form.bodyTemplate} onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))} placeholder='{"name": "{{contact.name}}", "order_id": "{{order_id}}"}' style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Save response values into Custom Fields</label>
                {form.responseMappings.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input value={m.jsonPath} onChange={(e) => updateMapping(i, { jsonPath: e.target.value })} placeholder="Response path, e.g. data.name" style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontFamily: 'monospace' }} />
                    <select value={m.fieldId} onChange={(e) => updateMapping(i, { fieldId: e.target.value, fieldKey: fields.find((f) => String(f.id) === e.target.value)?.field_key })} style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                      <option value="">Save into field…</option>
                      {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button type="button" onClick={() => removeMapping(i)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button type="button" onClick={addMapping} style={{ fontSize: '0.74rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>+ Map a response value</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', background: '#f1f5f9', color: '#475569' }}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', background: saving ? '#94a3b8' : '#0f172a', color: '#fff' }}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
