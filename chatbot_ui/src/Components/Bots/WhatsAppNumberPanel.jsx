import { useEffect, useState, useCallback } from 'react';
import { Loader2, AtSign, Gauge, Save, Trash2, RefreshCw } from 'lucide-react';
import { waNumberAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

const QUALITY = {
  GREEN: ['#16a34a', 'High — people like your messages'],
  YELLOW: ['#ca8a04', 'Medium — some people blocked or reported you recently'],
  RED: ['#dc2626', 'Low — sending may soon be limited; send fewer, more relevant messages'],
  UNKNOWN: ['#64748b', 'Not rated yet'],
};

/**
 * Bot Manager → Automation → Number & Username (WhatsApp). The number's
 * health from Meta and its business username (chatbot_api/utils/whatsappNumber.js).
 */
export default function WhatsAppNumberPanel({ account }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setHealth(null);
    setError('');
    waNumberAPI.get(account.id)
      .then((res) => { setHealth(res.data.health); setUsername(res.data.health.username?.username || ''); })
      .catch((err) => setError(err.response?.data?.message || 'Could not read this number from Meta'));
  }, [account.id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await waNumberAPI.setUsername(account.id, username, force);
      setHealth(res.data.health);
      notify.success('Username saved — Meta shows it once it is approved');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save the username');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await showAlert.confirm({ title: 'Remove the username?', text: 'Customers will see the phone number again. Someone else may take the name.', confirmButtonText: 'Remove' });
    if (!ok) return;
    try {
      await waNumberAPI.deleteUsername(account.id);
      notify.success('Username removed');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not remove it');
    }
  };

  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' };
  const [qColor, qText] = QUALITY[health?.qualityRating] || QUALITY.UNKNOWN;

  return (
    <div className="bm-content-card">
      <div className="bm-card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 className="bm-card-title">Number & Username</h3>
          <p className="bm-card-sub">How WhatsApp rates this number, how many people it may message, and its @username.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      {error && <div style={{ ...box, borderColor: '#f59e0b', fontSize: '0.84rem' }}>{error}</div>}
      {!health && !error && <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>}

      {health && (
        <>
          <div style={box}>
            <strong style={{ fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><Gauge size={16} /> Number health</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 12, fontSize: '0.84rem' }}>
              <div><div style={hint}>Number</div><strong>{health.displayPhoneNumber || '—'}</strong><div style={hint}>{health.verifiedName}{health.nameStatus ? ` · name ${String(health.nameStatus).toLowerCase().replace(/_/g, ' ')}` : ''}</div></div>
              <div><div style={hint}>Quality</div><strong style={{ color: qColor }}>{health.qualityRating || 'UNKNOWN'}</strong><div style={hint}>{qText}</div></div>
              <div><div style={hint}>Messaging limit (new people per 24 h)</div><strong>{health.messagingLimitLabel || '—'}</strong><div style={hint}>Grows automatically with good quality. Replies inside a customer's 24-hour window don't count.</div></div>
              <div><div style={hint}>Throughput</div><strong>{health.throughput || '—'}</strong><div style={hint}>{health.throughput === 'HIGH' ? 'Up to 1,000 messages / second' : 'Standard sending speed'}</div></div>
            </div>
          </div>

          <div style={box}>
            <strong style={{ fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><AtSign size={16} /> Business username</strong>
            <p style={hint}>
              Customers can find and message you by @username instead of your number.
              {health.username && <> Current: <strong>@{health.username.username}</strong> ({health.username.status === 'approved' ? 'live' : 'reserved — waiting for Meta'})</>}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>@</span>
              <input className="form-input" style={{ width: 240 }} maxLength={35} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))} placeholder="yourbrand" />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Move it here if another of my numbers has it
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || !username}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save username</button>
              {health.username && <button type="button" className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={13} /> Remove</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
