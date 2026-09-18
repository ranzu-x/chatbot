import { useState, useEffect } from 'react';
import { whatsappFlowRefAPI, whatsappFlowKeyAPI, integrationAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Workflow, Plus, Trash2, KeyRound, Link2, Copy, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

/** One WhatsApp integration's Flow encryption key — generate/regenerate,
 * and shows whether it made it to Meta or needs a manual upload. */
function EncryptionKeyCard({ integration }) {
  const [key, setKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showPem, setShowPem] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);

  const load = () => {
    setLoading(true);
    whatsappFlowKeyAPI.get(integration.id)
      .then((res) => setKey(res.data?.key || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [integration.id]);

  const handleGenerate = () => {
    if (key && !window.confirm(`This replaces the encryption key for ${integration.wa_display_phone || integration.name} — any WhatsApp Flow currently mid-submission for this number will fail until it's retried. Continue?`)) return;
    setGenerating(true);
    whatsappFlowKeyAPI.generate(integration.id)
      .then((res) => {
        setLastGenerated(res.data);
        setShowPem(true);
        if (res.data.uploadedToMeta) notify.success('Key generated and uploaded to Meta');
        else notify.error(res.data.uploadError || 'Key generated, but upload to Meta failed — copy the public key below and upload it manually.');
        load();
      })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to generate key'))
      .finally(() => setGenerating(false));
  };

  const copyPem = () => {
    const pem = lastGenerated?.publicKeyPem || key?.public_key_pem;
    if (!pem) return;
    navigator.clipboard.writeText(pem).then(() => notify.success('Public key copied'));
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{integration.wa_display_phone || integration.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Flow data-exchange encryption key</div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleGenerate} disabled={generating}>
          <RefreshCw size={13} className={generating ? 'animate-spin' : ''} /> {key ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {!loading && key && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          {key.key_uploaded_to_meta ? (
            <><CheckCircle2 size={13} color="var(--success)" /> <span>Uploaded to Meta</span></>
          ) : (
            <><AlertTriangle size={13} color="var(--warning)" /> <span>Not confirmed uploaded — upload the public key manually in Meta Business Manager</span></>
          )}
        </div>
      )}

      {(showPem || (!key?.key_uploaded_to_meta && key)) && (
        <div>
          <button type="button" onClick={() => setShowPem((v) => !v)} className="btn btn-secondary btn-sm" style={{ marginBottom: 6 }}>
            {showPem ? 'Hide' : 'Show'} public key
          </button>
          {showPem && (
            <div style={{ position: 'relative' }}>
              <pre style={{ fontSize: 10.5, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', overflowX: 'auto', margin: 0, maxHeight: 140 }}>
                {lastGenerated?.publicKeyPem || key?.public_key_pem}
              </pre>
              <button type="button" onClick={copyPem} className="btn btn-secondary btn-sm" style={{ position: 'absolute', top: 6, right: 6, padding: '3px 8px' }}>
                <Copy size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Reusable WhatsApp Flows management UI — encryption keys per WhatsApp
 * account, plus reference Flows (name + Meta Flow ID + optional relay
 * webhook) agents can send from the Live Inbox's "+" menu. Embedded in
 * Bot Manager → Data Collection → WhatsApp Flows.
 * ADMIN/RESELLER only — every whatsappFlowRefAPI/whatsappFlowKeyAPI mutating
 * call is role-gated the same way server-side, so a USER team member never
 * reaches this component (see BotManagerPage's dataCollection sub-tab filter). */
export default function WhatsAppFlowManagerList() {
  const [flowRefs, setFlowRefs] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [flowId, setFlowId] = useState('');
  const [saving, setSaving] = useState(false);
  const [relayEdits, setRelayEdits] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      whatsappFlowRefAPI.getAll(),
      integrationAPI.getAll(),
    ])
      .then(([refsRes, integRes]) => {
        setFlowRefs(refsRes.data?.flowRefs || []);
        setIntegrations((integRes.data?.integrations || []).filter((i) => i.platform === 'WHATSAPP' && i.is_active));
      })
      .catch(() => notify.error('Failed to load WhatsApp Flows'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim() || !flowId.trim()) return;
    setSaving(true);
    whatsappFlowRefAPI.create({ name: name.trim(), flowId: flowId.trim() })
      .then(() => { notify.success('Added'); setName(''); setFlowId(''); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to add'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (f) => {
    if (!window.confirm(`Remove "${f.name}"?`)) return;
    whatsappFlowRefAPI.delete(f.id).then(() => load()).catch(() => notify.error('Failed to remove'));
  };

  const handleSaveRelay = (f) => {
    const url = relayEdits[f.id] ?? f.relay_webhook_url ?? '';
    whatsappFlowRefAPI.update(f.id, { relayWebhookUrl: url })
      .then(() => { notify.success('Relay webhook saved'); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to save'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={15} /> Encryption Keys
        </h3>
        {!loading && integrations.length === 0 ? (
          <div className="card" style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Connect a WhatsApp account first.</div>
        ) : (
          <div className="grid-3">
            {integrations.map((i) => <EncryptionKeyCard key={i.id} integration={i} />)}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Flow References</h3>
        <div className="card" style={{ maxWidth: 520, marginBottom: 20 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Display name</label>
              <input className="form-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Book Appointment" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Meta Flow ID</label>
              <input className="form-input w-full" value={flowId} onChange={(e) => setFlowId(e.target.value)} placeholder="e.g. 1234567890123456" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim() || !flowId.trim()} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> {saving ? 'Adding…' : 'Add Flow'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : flowRefs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No WhatsApp Flows referenced yet.</div>
        ) : (
          <div className="grid-3">
            {flowRefs.map((f) => (
              <div key={f.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Workflow size={16} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{f.name}</div>
                  </div>
                  <button className="bs-action-btn delete" onClick={() => handleDelete(f)} title="Remove">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{f.flow_id}</div>

                <div style={{ marginTop: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    <Link2 size={11} /> Relay webhook (your server)
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="form-input w-full" style={{ fontSize: 12 }}
                      placeholder="https://your-server.com/flow-handler"
                      value={relayEdits[f.id] ?? f.relay_webhook_url ?? ''}
                      onChange={(e) => setRelayEdits((prev) => ({ ...prev, [f.id]: e.target.value }))}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleSaveRelay(f)}>Save</button>
                  </div>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Each screen's decrypted {'{action, screen, data, flow_token}'} is POSTed here; your reply becomes the next screen. Left blank, this Flow just completes automatically.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
