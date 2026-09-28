import { useCallback, useEffect, useState } from 'react';
import { Plus, Mail, Loader2, CheckCircle2, AlertTriangle, Pencil, Trash2, RefreshCw, X, Info } from 'lucide-react';
import { autoResponderAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Bot Settings → Auto Responder: the workspace's email-marketing connections
 * (Mailchimp, Brevo, ActiveCampaign, Mautic — chatbot_api/utils/autoResponders.js).
 * Keys are tested by the server before they are saved and only ever come back
 * masked. A User Input Flow's Start element picks one of these + a list, and
 * the email it collects is added there when the form is completed.
 */

const PROVIDER_COLORS = {
  mailchimp: '#ca8a04',
  brevo: '#0b996e',
  activecampaign: '#356ae6',
  mautic: '#4e5e9e',
};

const cardStyle = {
  background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px',
  marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

function ProviderBadge({ provider, label }) {
  const color = PROVIDER_COLORS[provider] || '#64748b';
  return (
    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: '0.9rem' }}>
      {(label || provider || '?').charAt(0)}
    </div>
  );
}

function StatusChip({ status }) {
  const ok = status !== 'ERROR';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: ok ? '#ecfdf5' : '#fef2f2', color: ok ? '#047857' : '#b91c1c', border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
    }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {ok ? 'Connected' : 'Error'}
    </span>
  );
}

function ConnectDialog({ providers, editing, onClose, onSaved }) {
  const [providerId, setProviderId] = useState(editing?.provider || null);
  const provider = providers.find((p) => p.id === providerId) || null;
  const [name, setName] = useState(editing?.name || '');
  const [values, setValues] = useState(editing?.credentials || {});
  const [options, setOptions] = useState(editing?.settings || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const missing = provider ? provider.fields.filter((f) => f.required && !String(values[f.key] || '').trim() && !(editing && f.secret)) : [];

  const submit = async (e) => {
    e.preventDefault();
    if (!provider || missing.length) return;
    setBusy(true);
    setError('');
    try {
      const payload = { name: name.trim() || provider.label, credentials: values, settings: options };
      const res = editing
        ? await autoResponderAPI.update(editing.id, payload)
        : await autoResponderAPI.create({ ...payload, provider: provider.id });
      notify.success(res.data?.message || 'Connected');
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not connect');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Auto responder" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              {editing ? `Edit ${editing.providerLabel}` : provider ? `Connect ${provider.label}` : 'Add Auto Responder Integration'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              {provider ? provider.help : 'Choose where collected emails should go.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>

        {!provider ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {providers.map((p) => (
              <button key={p.id} type="button" onClick={() => setProviderId(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <ProviderBadge provider={p.id} label={p.label} />
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>{p.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fb-field">
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Connection name</label>
              <input className="form-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={provider.label} style={{ width: '100%', height: 34 }} />
            </div>
            {provider.fields.map((f) => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                  {f.label}{f.required ? ' *' : ''}
                </label>
                <input
                  className="form-input"
                  type={f.secret ? 'password' : 'text'}
                  autoComplete="off"
                  value={values[f.key] || ''}
                  placeholder={editing && f.secret ? 'Leave as is to keep the saved one' : (f.placeholder || '')}
                  onFocus={(e) => { if (f.secret && String(e.target.value).includes('•')) setValues((v) => ({ ...v, [f.key]: '' })); }}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  style={{ width: '100%', height: 34 }}
                />
              </div>
            ))}
            {(provider.options || []).map((o) => (
              <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#334155' }}>
                <input type="checkbox" checked={Boolean(options[o.key])} onChange={(e) => setOptions((v) => ({ ...v, [o.key]: e.target.checked }))} />
                {o.label}
              </label>
            ))}
            <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', gap: 6 }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} /> We test the key with {provider.label} before saving. It is stored encrypted and is never shown again in full.
            </div>
            {error && <div style={{ fontSize: '0.8rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 10px', borderRadius: 8 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
              {!editing ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProviderId(null)}>Back</button> : <span />}
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || missing.length > 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {busy ? 'Testing…' : editing ? 'Save & test' : 'Connect'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default function AutoRespondersPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // { editing } | null
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError('');
    autoResponderAPI.getAll()
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Could not load auto responders'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (item) => {
    const ok = await showAlert.confirm({
      title: `Disconnect ${item.name}?`,
      text: 'User Input Flows that send emails to it will stop doing so. Contacts already in your list stay there.',
      confirmButtonText: 'Disconnect',
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await autoResponderAPI.delete(item.id);
      notify.success('Disconnected');
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not disconnect');
    } finally {
      setBusyId(null);
    }
  };

  const test = async (item) => {
    setBusyId(item.id);
    try {
      await autoResponderAPI.test(item.id);
      notify.success('Connection works');
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Connection failed');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const list = data?.integrations || [];

  return (
    <>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>Auto Responder integrations</div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0', lineHeight: 1.45 }}>
              Send emails collected by a <b>User Input Flow</b> to your email-marketing tool. Connect it here, then open the User
              Input Flow, select its <b>Start</b> element and choose the auto responder and list. Connections are shared by all bots in this workspace.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!data} onClick={() => setDialog({ editing: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Add Auto Responder Integration
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, color: '#b91c1c', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={15} /> {error}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Retry</button>
        </div>
      )}
      {!data && !error && (
        <div style={{ ...cardStyle, color: '#94a3b8', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading…
        </div>
      )}
      {data && list.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '30px 20px', color: '#64748b', fontSize: '0.84rem' }}>
          No auto responder connected yet. Supported: {(data.providers || []).map((p) => p.label).join(', ')}.
        </div>
      )}
      {list.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {list.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: i ? '1px solid #f1f5f9' : 'none', flexWrap: 'wrap' }}>
              <ProviderBadge provider={item.provider} label={item.providerLabel} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>{item.name}</span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.providerLabel}</span>
                  <StatusChip status={item.status} />
                </div>
                <div style={{ fontSize: '0.74rem', color: item.status === 'ERROR' ? '#b91c1c' : '#94a3b8', marginTop: 3 }}>
                  {item.status === 'ERROR' && item.lastError
                    ? item.lastError
                    : item.lastSuccessAt ? `Last email sent ${new Date(item.lastSuccessAt).toLocaleString()}` : 'No emails sent yet'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => test(item)} title="Test connection" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {busyId === item.id ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={12} />} Test
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ editing: item })} title="Edit" aria-label={`Edit ${item.name}`}><Pencil size={12} /></button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => remove(item)} title="Disconnect" aria-label={`Disconnect ${item.name}`} style={{ color: '#dc2626' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && data && (
        <ConnectDialog
          providers={data.providers || []}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); load(); }}
        />
      )}
    </>
  );
}
