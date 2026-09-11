import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { aiProviderAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Sparkles, KeyRound, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, Shield,
} from 'lucide-react';

const CAPABILITY_LABELS = {
  text_generation: 'Text',
  vision: 'Vision',
  audio_transcription: 'Audio',
  video_understanding: 'Video',
  embeddings: 'Embeddings',
  tool_calling: 'Actions',
};
const CAPABILITY_ORDER = ['text_generation', 'vision', 'audio_transcription', 'video_understanding', 'embeddings'];

const PROVIDER_MARK_COLOR = {
  openai: '#10a37f',
  anthropic: '#d97757',
  gemini: 'linear-gradient(135deg,#4285f4,#9b72cb,#d96570)',
  deepseek: '#4d6bfe',
  mimo: '#ff6900',
  grok: '#0f172a',
};

function ProviderCard({ provider, onSave, onTest, onDisconnect, saving, testing }) {
  const [editingKey, setEditingKey] = useState(!provider.connected);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState(provider.defaultModel);

  useEffect(() => {
    setModel(provider.defaultModel);
    if (provider.connected) setEditingKey(false);
  }, [provider.defaultModel, provider.connected]);

  const statusInfo = !provider.connected
    ? { label: 'Not connected', color: 'var(--text-muted)', Icon: null }
    : provider.lastVerifyStatus === 'error'
    ? { label: provider.lastVerifyError || 'Key rejected — check & retry', color: 'var(--danger)', Icon: XCircle }
    : provider.lastVerifyStatus === 'ok'
    ? { label: `Connected · verified ${timeAgo(provider.lastVerifiedAt)}`, color: 'var(--success)', Icon: CheckCircle2 }
    : { label: 'Connected · not yet tested', color: 'var(--warning)', Icon: AlertTriangle };

  const handleToggle = () => onSave(provider.id, { enabled: !provider.enabled });

  const handleSaveKey = () => {
    if (!keyInput.trim()) return;
    onSave(provider.id, { apiKey: keyInput.trim(), defaultModel: model }).then(() => {
      setKeyInput('');
      setEditingKey(false);
    });
  };

  const handleModelChange = (e) => {
    const next = e.target.value;
    setModel(next);
    if (provider.connected) onSave(provider.id, { defaultModel: next });
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderColor: provider.connected ? 'rgba(37,99,235,0.25)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: PROVIDER_MARK_COLOR[provider.id] || '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>{provider.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{provider.models[0]}{provider.models.length > 1 ? ` +${provider.models.length - 1} more` : ''}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          title={provider.enabled ? 'Disable' : 'Enable'}
          style={{
            width: 38, height: 22, borderRadius: 999, border: 'none', cursor: saving ? 'wait' : 'pointer',
            background: provider.enabled ? 'var(--primary)' : '#cbd5e1', position: 'relative', flexShrink: 0, padding: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: provider.enabled ? 18 : 2, width: 18, height: 18,
            borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left .15s',
          }} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: statusInfo.color }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusInfo.color, flexShrink: 0 }} />
        {statusInfo.label}
      </div>

      <div>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          API Key
        </label>
        {editingKey ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your API key"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveKey} disabled={saving || !keyInput.trim()}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
            </button>
            {provider.connected && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingKey(false); setKeyInput(''); }}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)',
            border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px',
          }}>
            <KeyRound size={13} color="var(--text-muted)" />
            <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, letterSpacing: 0.5 }}>
              {provider.maskedKey || '—'}
            </span>
            <span
              onClick={() => setEditingKey(true)}
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }}
            >
              Update
            </span>
          </div>
        )}
      </div>

      <div>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          Default model
        </label>
        <select className="form-input" value={model} onChange={handleModelChange} disabled={!provider.connected}>
          {provider.models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CAPABILITY_ORDER.map((cap) => {
          const has = provider.capabilities.includes(cap);
          return (
            <span
              key={cap}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: has ? 'rgba(37,99,235,0.08)' : 'var(--bg-hover)',
                color: has ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${has ? 'rgba(37,99,235,0.18)' : 'var(--border)'}`,
              }}
            >
              {CAPABILITY_LABELS[cap]}
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onTest(provider.id)}
          disabled={!provider.connected || testing}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Test connection
        </button>
        {provider.connected && (
          <span
            onClick={() => onDisconnect(provider.id)}
            style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            Disconnect
          </span>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function AIProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [testingId, setTestingId] = useState(null);

  const fetchProviders = () => {
    setLoading(true);
    aiProviderAPI.getAll()
      .then((res) => setProviders(res.data?.providers || []))
      .catch(() => notify.error('Failed to load AI providers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProviders(); }, []);

  const handleSave = (providerId, data) => {
    setSavingId(providerId);
    return aiProviderAPI.save(providerId, data)
      .then(() => {
        notify.success('Saved');
        fetchProviders();
      })
      .catch((err) => {
        notify.error(err?.response?.data?.message || 'Failed to save');
        throw err;
      })
      .finally(() => setSavingId(null));
  };

  const handleTest = (providerId) => {
    setTestingId(providerId);
    aiProviderAPI.test(providerId)
      .then((res) => notify.success(res.data?.message || 'Connection verified'))
      .catch((err) => notify.error(err?.response?.data?.message || 'Connection test failed'))
      .finally(() => { setTestingId(null); fetchProviders(); });
  };

  const handleDisconnect = (providerId) => {
    if (!window.confirm('Remove this provider\'s saved API key? Agents relying on it as their only option will stop replying until another provider is connected.')) return;
    aiProviderAPI.remove(providerId)
      .then(() => { notify.success('Disconnected'); fetchProviders(); })
      .catch(() => notify.error('Failed to disconnect'));
  };

  return (
    <AppLayout>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h1 className="page-title">AI Providers</h1>
            <p className="page-subtitle">Connect the AI models your Agents draw on. Keys are encrypted and never shown again after you save them.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
              background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: '7px 13px', borderRadius: 999,
            }}>
              <Shield size={13} /> Stored with AES-256 encryption
            </span>
            <button className="btn btn-secondary btn-sm" onClick={fetchProviders} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <div className="grid-3">
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onSave={handleSave}
                onTest={handleTest}
                onDisconnect={handleDisconnect}
                saving={savingId === p.id}
                testing={testingId === p.id}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
