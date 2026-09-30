import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { crmAPI } from '../../services/api';

/**
 * Flow Builder → "Send to CRM" element (node type crmSync, chatbot_api/utils/crm.js
 * runCrmFlowStep). Picks one of the workspace's CRM connections; extra CRM
 * fields take {{variables}}; an optional note is added to the record. The
 * element branches Success / Fail and sets {{crm_synced}} (yes/no) and
 * {{crm_record_id}}.
 */
export default function CrmSyncProperties({ data, updateFields }) {
  const [connections, setConnections] = useState(null);
  const [fields, setFields] = useState([]);
  const extraFields = Array.isArray(data.extraFields) ? data.extraFields : [];

  useEffect(() => {
    crmAPI.getAll().then((r) => setConnections(r.data.connections || [])).catch(() => setConnections([]));
  }, []);
  useEffect(() => {
    setFields([]);
    if (!data.connectionId) return;
    crmAPI.fields(data.connectionId).then((r) => setFields(r.data.fields || [])).catch(() => setFields([]));
  }, [data.connectionId]);

  const setRow = (i, patch) => updateFields({ extraFields: extraFields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="fb-field">
        <label>CRM connection *</label>
        <select
          value={data.connectionId || ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : '';
            const conn = (connections || []).find((c) => c.id === id);
            updateFields({ connectionId: id, connectionName: conn ? `${conn.name} (${conn.providerLabel})` : '', extraFields: [] });
          }}
        >
          <option value="">{connections === null ? 'Loading…' : 'Choose a CRM…'}</option>
          {(connections || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.providerLabel})</option>)}
        </select>
        {connections && connections.length === 0 && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => window.open('/settings/apps#crm', '_blank')}>
            Connect a CRM in App Integrations
          </button>
        )}
      </div>

      <div className="fb-field">
        <label>Extra fields</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {extraFields.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
              <select value={f.target || ''} onChange={(e) => setRow(i, { target: e.target.value })} aria-label="CRM field">
                <option value="">CRM field…</option>
                {f.target && !fields.some((x) => x.name === f.target) && <option value={f.target}>{f.target}</option>}
                {fields.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
              </select>
              <input type="text" value={f.value || ''} placeholder="Value or {{variable}}" onChange={(e) => setRow(i, { value: e.target.value })} />
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove field" onClick={() => updateFields({ extraFields: extraFields.filter((_, j) => j !== i) })}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-start' }}
            disabled={!data.connectionId || extraFields.length >= 20}
            onClick={() => updateFields({ extraFields: [...extraFields, { target: '', value: '' }] })}
          >
            <Plus size={12} /> Add field
          </button>
        </div>
      </div>

      <div className="fb-field">
        <label>Note on the record (optional)</label>
        <textarea rows={3} value={data.note || ''} placeholder="e.g. Asked about {{field.product}} via the chatbot" onChange={(e) => updateFields({ note: e.target.value })} />
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        Creates or updates this subscriber in the CRM right now — name, email, phone and the connection's field mapping, plus the fields above. The subscriber needs an email or phone number. Continues on <strong>Success</strong> or <strong>Fail</strong>; sets {'{{crm_synced}}'} (yes / no) and {'{{crm_record_id}}'}.
      </div>
    </div>
  );
}
