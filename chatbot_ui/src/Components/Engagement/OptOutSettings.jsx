import { useEffect, useState } from 'react';
import { Save, Loader2, UserMinus } from 'lucide-react';
import { optOutAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Bot Manager → Automation → Opt-out Keywords (chatbot_api/utils/optOut.js).
 * A subscriber who sends exactly one of the opt-out words is unsubscribed
 * from broadcasts and sequences; an opt-in word subscribes them again.
 */
export default function OptOutSettings({ account }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    optOutAPI.get(account.id)
      .then((res) => {
        setData(res.data);
        const s = res.data.settings;
        setForm({ ...s, optOutKeywords: s.optOutKeywords.join(', '), optInKeywords: s.optInKeywords.join(', ') });
      })
      .catch(() => notify.error('Could not load the opt-out settings'));
  }, [account.id]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await optOutAPI.save(account.id, form);
      notify.success('Opt-out settings saved');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;

  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const lbl = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 };
  const hint = { fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 0' };

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">Opt-out Keywords</h3>
        <p className="bm-card-sub">
          Let people stop your automated messages by replying a word like STOP. Unsubscribed people get no broadcasts or sequence messages; you can still chat with them in the Inbox.
        </p>
      </div>

      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong style={{ fontSize: '0.9rem' }}>Keyword opt-out</strong>
          <p style={hint}>Only a message that is exactly one of the words counts ("STOP", "stop!" — not "please stop sending").</p>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> On
        </label>
      </div>

      {form.enabled && (
        <>
          <div style={box}>
            <label style={lbl}>Opt-out words (comma separated)</label>
            <input className="form-input w-full" value={form.optOutKeywords} onChange={(e) => set({ optOutKeywords: e.target.value })} placeholder="STOP, UNSUBSCRIBE" />
            <label style={{ ...lbl, marginTop: 12 }}>Reply when someone opts out (empty = no reply)</label>
            <p style={{ ...hint, marginTop: 0, marginBottom: 6 }}>Used only while the <b>Unsubscribe</b> Quick Action's reply is off — when it's on, that reply (with its Resubscribe button) is sent instead. Same for opting back in and <b>Resubscribe</b>.</p>
            <textarea className="form-input w-full" rows={2} maxLength={1000} value={form.optOutReply} onChange={(e) => set({ optOutReply: e.target.value })} />
          </div>
          <div style={box}>
            <label style={lbl}>Opt-in words — subscribe again (comma separated)</label>
            <input className="form-input w-full" value={form.optInKeywords} onChange={(e) => set({ optInKeywords: e.target.value })} placeholder="START, SUBSCRIBE" />
            <label style={{ ...lbl, marginTop: 12 }}>Reply when someone opts back in (empty = no reply)</label>
            <textarea className="form-input w-full" rows={2} maxLength={1000} value={form.optInReply} onChange={(e) => set({ optInReply: e.target.value })} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <UserMinus size={14} /> {data.unsubscribed} unsubscribed subscriber{data.unsubscribed === 1 ? '' : 's'} on this account
        </span>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
    </div>
  );
}
