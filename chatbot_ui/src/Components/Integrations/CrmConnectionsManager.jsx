import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, KeyRound, Loader2, CheckCircle2, AlertTriangle, Save, X, UploadCloud } from 'lucide-react';
import { crmAPI } from '../../services/api';
import { alert, toast } from '../../lib/alerts';

/**
 * Settings → App Integrations → CRM (chatbot_api/routes/crm.js, utils/crm.js).
 * One card per HubSpot / Salesforce / Zoho connection: sync switches, Lead vs
 * Contact, field mapping (subscriber value → CRM field, read live from the
 * CRM), push stats, and the "Sync existing subscribers" backfill. Keys are
 * only ever shown masked; typing a new one replaces it.
 */
const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

const box = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)', padding: 16 };
const muted = { fontSize: '0.78rem', color: 'var(--text-tertiary)' };
const label = { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 };

function CredentialFields({ provider, values, onChange, editing }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {provider.fields.map((f) => (
        <div key={f.key}>
          <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
          {f.options ? (
            <select className="form-input" value={values[f.key] || f.options[0].value} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              className="form-input"
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              value={values[f.key] || ''}
              placeholder={editing && f.secret ? 'Leave as is to keep the saved one' : (f.placeholder || '')}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ConnectForm({ providers, onDone, onCancel }) {
  const [providerId, setProviderId] = useState(providers[0]?.id || 'hubspot');
  const provider = providers.find((p) => p.id === providerId) || providers[0];
  const [name, setName] = useState('');
  const [creds, setCreds] = useState({});
  const [object, setObject] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await crmAPI.create({ provider: providerId, name, credentials: creds, settings: { object: object || provider.objects[0].id } });
      toast.success(res.data.message);
      onDone(res.data.connection);
    } catch (err) {
      toast.error(errMsg(err, 'Could not connect'), { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="crm-connect-form">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setProviderId(p.id); setCreds({}); setObject(''); }}
            className={`btn btn-sm ${p.id === providerId ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p style={{ ...muted, margin: 0, lineHeight: 1.5 }}>{provider.help}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div>
          <label style={label}>Connection name</label>
          <input className="form-input" value={name} placeholder={provider.label} onChange={(e) => setName(e.target.value)} />
        </div>
        {provider.objects.length > 1 && (
          <div>
            <label style={label}>Create subscribers as</label>
            <select className="form-input" value={object || provider.objects[0].id} onChange={(e) => setObject(e.target.value)}>
              {provider.objects.map((o) => <option key={o.id} value={o.id}>{o.label}s</option>)}
            </select>
          </div>
        )}
      </div>
      <CredentialFields provider={provider} values={creds} onChange={setCreds} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Test & connect
        </button>
      </div>
    </form>
  );
}

function ConnectionCard({ connection, provider, sourceFields, onChanged, onRemoved }) {
  const [settings, setSettings] = useState(connection.settings);
  const [name, setName] = useState(connection.name);
  const [crmFields, setCrmFields] = useState(null);
  const [fieldsError, setFieldsError] = useState('');
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [editingKeys, setEditingKeys] = useState(false);
  const [creds, setCreds] = useState(connection.credentials);
  const dirty = JSON.stringify(settings) !== JSON.stringify(connection.settings) || name !== connection.name;

  const loadStats = useCallback(() => {
    crmAPI.stats(connection.id).then((r) => setStats(r.data.stats)).catch(() => {});
  }, [connection.id]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    setCrmFields(null);
    setFieldsError('');
    crmAPI.fields(connection.id, settings.object)
      .then((r) => setCrmFields(r.data.fields || []))
      .catch((err) => { setCrmFields([]); setFieldsError(errMsg(err, 'Could not read the CRM fields')); });
  }, [connection.id, settings.object]);

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const setRow = (i, patch) => set({ fieldMap: settings.fieldMap.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const save = async () => {
    setSaving(true);
    try {
      const res = await crmAPI.update(connection.id, { name, settings, ...(editingKeys ? { credentials: creds } : {}) });
      toast.success(editingKeys ? 'Saved and tested' : 'Saved');
      setEditingKeys(false);
      onChanged(res.data.connection);
    } catch (err) {
      toast.error(errMsg(err, 'Could not save'), { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await crmAPI.test(connection.id);
      toast.success(res.data.message);
      onChanged({ ...connection, status: 'CONNECTED', lastError: null });
    } catch (err) {
      toast.error(errMsg(err, 'The connection failed'), { duration: 10000 });
      onChanged({ ...connection, status: 'ERROR', lastError: errMsg(err, '') });
    } finally {
      setBusy('');
    }
  };

  const syncExisting = async () => {
    const ok = await alert.confirm({
      title: 'Send existing subscribers?',
      text: `Every subscriber with an email or phone number will be created or updated in ${provider.label} (about 100 a minute). Records already there are matched by email, then phone — nothing is deleted.`,
      tone: 'info',
      confirm: 'Start sync',
    });
    if (!ok) return;
    setBusy('sync');
    try {
      const res = await crmAPI.syncExisting(connection.id);
      setStats(res.data.stats);
      toast.success(res.data.message);
      onChanged({ ...connection, syncSince: '2000-01-01T00:00:00.000Z' });
    } catch (err) {
      toast.error(errMsg(err, 'Could not start the sync'));
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    const ok = await alert.confirm({
      title: `Disconnect ${connection.name}?`,
      text: `Subscribers stop being sent to ${provider.label}, and "Send to CRM" steps using it will take their Fail path. Records already in your CRM stay there.`,
      confirm: 'Disconnect',
    });
    if (!ok) return;
    try {
      await crmAPI.delete(connection.id);
      toast.success('Disconnected');
      onRemoved(connection.id);
    } catch (err) {
      toast.error(errMsg(err, 'Could not disconnect'));
    }
  };

  const backfilled = connection.syncSince && new Date(connection.syncSince).getFullYear() <= 2000;

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="crm-connection">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 240, fontWeight: 700 }} aria-label="Connection name" />
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>{provider.label}</span>
        {connection.status === 'CONNECTED' ? (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Connected</span>
        ) : (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Error</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={busy === 'test'}>
            {busy === 'test' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Test
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingKeys((v) => !v)}>
            <KeyRound size={13} /> {editingKeys ? 'Keep keys' : 'Change keys'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={remove} style={{ color: 'var(--danger)' }}>
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      </div>

      {connection.lastError && (
        <div style={{ fontSize: '0.78rem', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '8px 10px' }}>
          {connection.lastError}
        </div>
      )}

      {editingKeys && <CredentialFields provider={provider} values={creds} onChange={setCreds} editing />}

      {stats && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
          <span><strong style={{ color: 'var(--text-primary)' }}>{stats.synced}</strong> in {provider.label}</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{stats.pending}</strong> waiting</span>
          <span style={{ color: stats.failed ? 'var(--danger)' : undefined }}><strong>{stats.failed}</strong> failed</span>
          {stats.lastSyncedAt && <span style={muted}>Last push {new Date(stats.lastSyncedAt).toLocaleString()}</span>}
          {!backfilled && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={syncExisting} disabled={busy === 'sync'} style={{ marginLeft: 'auto' }}>
              {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} Sync existing subscribers
            </button>
          )}
        </div>
      )}
      {stats?.recentErrors?.length > 0 && (
        <details style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          <summary style={{ cursor: 'pointer' }}>Recent failures</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {stats.recentErrors.map((e) => <li key={e.contactId}><strong>{e.name || `#${e.contactId}`}</strong>: {e.error}</li>)}
          </ul>
        </details>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.autoSync} onChange={(e) => set({ autoSync: e.target.checked })} style={{ marginTop: 3 }} />
          <span><strong>Send subscribers automatically</strong><br /><span style={muted}>New and changed subscribers with an email or phone, within a minute.</span></span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.logChats} onChange={(e) => set({ logChats: e.target.checked })} style={{ marginTop: 3 }} />
          <span><strong>Log resolved chats</strong><br /><span style={muted}>The chat transcript is added as a {provider.noteLabel} on the record.</span></span>
        </label>
        {provider.objects.length > 1 && (
          <div>
            <label style={label}>Create subscribers as</label>
            <select className="form-input" value={settings.object} onChange={(e) => set({ object: e.target.value, fieldMap: [] })}>
              {provider.objects.map((o) => <option key={o.id} value={o.id}>{o.label}s</option>)}
            </select>
          </div>
        )}
        {connection.provider === 'salesforce' && settings.object === 'Lead' && (
          <div>
            <label style={label}>Company for new leads</label>
            <input className="form-input" value={settings.company} placeholder="Empty = the subscriber's name" onChange={(e) => set({ company: e.target.value })} />
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Field mapping</span>
          <span style={muted}>Name, email and phone are always sent. Add more fields below.</span>
        </div>
        {fieldsError && <div style={{ ...muted, color: 'var(--danger)', marginBottom: 6 }}>{fieldsError}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {settings.fieldMap.map((m, i) => {
            const isText = m.source.startsWith('text:');
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-input" value={isText ? 'text:' : m.source} onChange={(e) => setRow(i, { source: e.target.value })} aria-label="Subscriber value">
                    {sourceFields.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    <option value="text:">Fixed text…</option>
                  </select>
                  {isText && <input className="form-input" value={m.source.slice(5)} placeholder="Text" onChange={(e) => setRow(i, { source: `text:${e.target.value}` })} />}
                </div>
                <select className="form-input" value={m.target} onChange={(e) => setRow(i, { target: e.target.value })} aria-label={`${provider.label} field`}>
                  <option value="">{crmFields === null ? 'Loading fields…' : `${provider.label} field…`}</option>
                  {m.target && !(crmFields || []).some((f) => f.name === m.target) && <option value={m.target}>{m.target}</option>}
                  {(crmFields || []).map((f) => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove field" onClick={() => set({ fieldMap: settings.fieldMap.filter((_, j) => j !== i) })}>
                  <X size={13} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => set({ fieldMap: [...settings.fieldMap, { source: sourceFields[0]?.id || 'contact.name', target: '' }] })}
            disabled={settings.fieldMap.length >= 50}
          >
            <Plus size={13} /> Add field
          </button>
        </div>
      </div>

      {(dirty || editingKeys) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save changes
          </button>
        </div>
      )}
    </div>
  );
}

export default function CrmConnectionsManager() {
  const [data, setData] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(() => {
    crmAPI.getAll()
      .then((r) => setData(r.data))
      .catch((err) => { setData({ connections: [], providers: [], sourceFields: [] }); toast.error(errMsg(err, 'Could not load CRM connections')); });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div style={{ ...muted, padding: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={14} className="animate-spin" /> Loading…</div>;
  const providerOf = (id) => data.providers.find((p) => p.id === id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.connections.map((c) => providerOf(c.provider) && (
        <ConnectionCard
          key={c.id}
          connection={c}
          provider={providerOf(c.provider)}
          sourceFields={data.sourceFields}
          onChanged={(next) => setData((d) => ({ ...d, connections: d.connections.map((x) => (x.id === next.id ? next : x)) }))}
          onRemoved={(id) => setData((d) => ({ ...d, connections: d.connections.filter((x) => x.id !== id) }))}
        />
      ))}
      {data.connections.length === 0 && !connecting && (
        <div style={{ ...box, textAlign: 'center', ...muted }}>No CRM connected yet.</div>
      )}
      {connecting ? (
        <ConnectForm
          providers={data.providers}
          onCancel={() => setConnecting(false)}
          onDone={(conn) => { setConnecting(false); setData((d) => ({ ...d, connections: [conn, ...d.connections] })); }}
        />
      ) : (
        <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConnecting(true)} data-testid="crm-connect">
          <Plus size={14} /> Connect a CRM
        </button>
      )}
    </div>
  );
}
