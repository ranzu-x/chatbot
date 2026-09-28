import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShoppingBag, X, CheckCircle2, Clock, XCircle, Plus } from 'lucide-react';
import { storeTemplateAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Bot Manager → Message Templates → Store templates (chatbot_api/utils/storeTemplatePresets.js).
 * Ready-made WhatsApp templates for store automation — order confirmation, COD
 * verification, abandoned cart, payment / shipping / delivery / cancel / refund —
 * created and sent to Meta for review in one click. Their variables are named
 * after the store values, so a Commerce campaign maps them by itself.
 */
const STATUS = {
  APPROVED: { label: 'Approved', color: '#15803d', bg: 'rgba(22, 163, 74, 0.1)', Icon: CheckCircle2 },
  PENDING: { label: 'In review', color: '#b45309', bg: 'rgba(245, 158, 11, 0.12)', Icon: Clock },
  IN_APPEAL: { label: 'In appeal', color: '#b45309', bg: 'rgba(245, 158, 11, 0.12)', Icon: Clock },
  REJECTED: { label: 'Rejected', color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.1)', Icon: XCircle },
  PAUSED: { label: 'Paused', color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.1)', Icon: XCircle },
  DISABLED: { label: 'Disabled', color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.1)', Icon: XCircle },
};

function StatusChip({ template }) {
  if (!template) return <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Not created</span>;
  const s = STATUS[template.status] || STATUS.PENDING;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, color: s.color, background: s.bg, borderRadius: 999, padding: '2px 8px' }}>
      <s.Icon size={11} /> {s.label}
    </span>
  );
}

/** WhatsApp-style preview with the review sample values. */
function Preview({ preset }) {
  return (
    <div style={{ background: '#e7ddd3', borderRadius: 10, padding: 10 }}>
      <div style={{ background: '#ffffff', borderRadius: 8, padding: '8px 10px', fontSize: '0.78rem', color: '#111b21', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
        {preset.headerText && <div style={{ fontWeight: 700, marginBottom: 4 }}>{preset.headerText}</div>}
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{preset.sample.replace(/\*([^*]+)\*/g, '$1')}</div>
        {preset.footer && <div style={{ fontSize: '0.7rem', color: '#667781', marginTop: 6 }}>{preset.footer}</div>}
      </div>
      {preset.buttons.map((b) => (
        <div key={b.text} style={{ background: '#ffffff', borderRadius: 8, marginTop: 3, padding: '6px 0', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#0284c7' }}>
          {b.text}
        </div>
      ))}
    </div>
  );
}

export default function StoreTemplatePresets({ integrationId, onClose, onCreated }) {
  const [presets, setPresets] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    storeTemplateAPI.list(integrationId)
      .then((res) => setPresets(res.data.presets))
      .catch((err) => { notify.error(err.response?.data?.message || 'Could not load store templates'); setPresets([]); });
  }, [integrationId]);
  useEffect(() => { load(); }, [load]);

  const create = async (keys) => {
    setBusy(keys.length > 1 ? 'all' : keys[0]);
    try {
      const res = await storeTemplateAPI.create(integrationId, keys);
      setPresets(res.data.presets);
      const results = res.data.results || [];
      const made = results.filter((r) => r.ok && !r.skipped).length;
      const failed = results.filter((r) => !r.ok);
      if (made) notify.success(`${made} template${made === 1 ? '' : 's'} sent to Meta for review. Utility templates are usually approved within minutes.`);
      if (failed.length) notify.error(`${failed.length} not created: ${failed[0].message}`);
      onCreated?.();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Meta refused the template');
      if (err.response?.data?.presets) setPresets(err.response.data.presets);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    try {
      const res = await storeTemplateAPI.refresh(integrationId);
      setPresets(res.data.presets);
      onCreated?.();
      notify.success('Review status updated from Meta');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not reach Meta');
    } finally {
      setBusy(null);
    }
  };

  const missing = (presets || []).filter((p) => !p.template || p.template.status === 'REJECTED').map((p) => p.key);
  const anyCreated = (presets || []).some((p) => p.template);

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 1040, width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><ShoppingBag size={18} /> Store templates</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 720 }}>
              Ready-made WhatsApp templates for your store automation. Create them in one click — they're sent to Meta for review — and every Commerce campaign picks the right one for its trigger and fills in its details automatically.
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!presets || !missing.length || Boolean(busy)} onClick={() => create(missing)}>
            {busy === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {missing.length ? `Create all ${missing.length} missing` : 'All created'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!anyCreated || Boolean(busy)} onClick={refresh}>
            {busy === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check review status
          </button>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: 2 }}>
          {!presets ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              {presets.map((p) => {
                const canCreate = !p.template || p.template.status === 'REJECTED';
                return (
                  <div key={p.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>{p.title}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          <code>{p.name}</code> · {p.category === 'MARKETING' ? 'Marketing' : 'Utility'}
                        </div>
                      </div>
                      <StatusChip template={p.template} />
                    </div>
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0 }}>{p.description}</p>
                    <Preview preset={p} />
                    {p.template?.status === 'REJECTED' && p.template.reason && (
                      <div style={{ fontSize: '0.74rem', color: '#b91c1c' }}>Meta: {p.template.reason}</div>
                    )}
                    {canCreate && (
                      <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 'auto' }} disabled={Boolean(busy)} onClick={() => create([p.key])}>
                        {busy === p.key ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {p.template ? 'Create again' : 'Create template'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
