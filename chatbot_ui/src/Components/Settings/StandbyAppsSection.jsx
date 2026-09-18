import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, RefreshCw, ArrowUpCircle, Trash2, CheckCircle2, AlertTriangle, HelpCircle, UserPlus } from 'lucide-react';
import { metaAppPoolAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

const HEALTH_BADGE = {
  HEALTHY: { color: '#16a34a', bg: 'rgba(22,163,74,0.08)', icon: CheckCircle2, label: 'Healthy' },
  DEGRADED: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', icon: AlertTriangle, label: 'Degraded' },
  DISABLED: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', icon: AlertTriangle, label: 'Disabled' },
  UNKNOWN: { color: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: HelpCircle, label: 'Not checked yet' },
};

function HealthBadge({ status }) {
  const b = HEALTH_BADGE[status] || HEALTH_BADGE.UNKNOWN;
  const Icon = b.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: b.color, background: b.bg, border: `1px solid ${b.color}33`, borderRadius: 6, padding: '2px 8px' }}>
      <Icon size={11} /> {b.label}
    </span>
  );
}

const emptyForm = { label: '', businessManagerLabel: '', appId: '', appSecret: '', systemUserToken: '', whatsappConfigId: '', whatsappConfigIdCatalog: '', verifyToken: '' };

/** Manages standby Meta apps for one platform slot (WhatsApp or
 * Messenger+Instagram) — add/edit/promote/delete/test, with health status.
 * A standby only protects against its own app being disabled if it's
 * registered under the SAME Meta Business Manager as the active app
 * (Business-level asset permissions don't cross Businesses) — see the
 * inline warning below. */
export default function StandbyAppsSection({ platformGroup, isWhatsAppTab }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busySlotId, setBusySlotId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    metaAppPoolAPI.list(platformGroup)
      .then((res) => setSlots(res.data?.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [platformGroup]);

  useEffect(() => { load(); }, [load]);

  const activeSlot = slots.find((s) => s.slot_role === 'ACTIVE');
  const standbySlots = slots.filter((s) => s.slot_role === 'STANDBY');

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.appId.trim() || !addForm.appSecret.trim()) {
      notify.error('App ID and App Secret are required');
      return;
    }
    setSaving(true);
    try {
      await metaAppPoolAPI.create({ ...addForm, platformGroup });
      notify.success('Standby app added');
      setAddForm(emptyForm);
      setShowAddForm(false);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to add standby app');
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async (id) => {
    setBusySlotId(id);
    try {
      await metaAppPoolAPI.promote(id);
      notify.success('Promoted to active');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to promote');
    } finally {
      setBusySlotId(null);
    }
  };

  const handleTest = async (id) => {
    setBusySlotId(id);
    try {
      const res = await metaAppPoolAPI.test(id);
      notify.success(`Connected — ${res.data?.appName || 'credentials valid'}`);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Connection failed');
    } finally {
      setBusySlotId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this standby app?')) return;
    setBusySlotId(id);
    try {
      await metaAppPoolAPI.remove(id);
      notify.success('Standby app removed');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to remove');
    } finally {
      setBusySlotId(null);
    }
  };

  const handleToggleOnboardingBlock = async () => {
    if (!activeSlot) return;
    const nextBlocked = !activeSlot.new_onboarding_blocked;
    setBusySlotId(activeSlot.id);
    try {
      await metaAppPoolAPI.setOnboardingBlock(activeSlot.id, nextBlocked, nextBlocked ? 'Manually flagged by admin' : undefined);
      notify.success(nextBlocked ? 'New WhatsApp connections will redirect to a standby app' : 'New WhatsApp connections restored to this app');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setBusySlotId(null);
    }
  };

  return (
    <div className="card" style={{ marginTop: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={18} color="var(--primary, #2563eb)" />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Standby Apps</span>
          {activeSlot && <HealthBadge status={activeSlot.health_status} />}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddForm((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Add Standby App
        </button>
      </div>

      {isWhatsAppTab && activeSlot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, padding: '12px 16px', background: activeSlot.new_onboarding_blocked ? 'rgba(220,38,38,0.06)' : 'var(--bg-hover)', border: `1px solid ${activeSlot.new_onboarding_blocked ? 'rgba(220,38,38,0.25)' : 'var(--border)'}`, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <UserPlus size={16} color={activeSlot.new_onboarding_blocked ? '#dc2626' : 'var(--text-secondary)'} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                Redirect new WhatsApp connections to a standby
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                For when Meta suspends Tech Provider status — existing numbers keep working, only new sign-ups get redirected. Standby should be under a <strong>different</strong> Business Manager than this app.
                {activeSlot.new_onboarding_blocked_reason ? ` Reason: ${activeSlot.new_onboarding_blocked_reason}.` : ''}
              </div>
            </div>
          </div>
          <div
            className={`toggle-track ${activeSlot.new_onboarding_blocked ? 'on' : ''}`}
            onClick={() => busySlotId !== activeSlot.id && handleToggleOnboardingBlock()}
            style={{ cursor: busySlotId === activeSlot.id ? 'wait' : 'pointer', flexShrink: 0 }}
          >
            <div className="toggle-thumb" />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.5 }}>
        <strong>Must be under the same Meta Business Manager as your primary app.</strong> Business-level asset permissions don't cross Businesses — a standby under a different Business won't have permission to act on your existing customers' {isWhatsAppTab ? 'WhatsApp numbers' : 'Pages/Instagram accounts'} if this one gets disabled.
      </div>

      {showAddForm && (
        <form onSubmit={handleAddSubmit} style={{ marginBottom: 20, padding: 16, background: 'var(--bg-hover)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>Label</label>
              <input className="form-input" placeholder="e.g. Backup App #1" value={addForm.label} onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>Business Manager (for your reference)</label>
              <input className="form-input" placeholder="e.g. Acme Business Manager" value={addForm.businessManagerLabel} onChange={(e) => setAddForm((f) => ({ ...f, businessManagerLabel: e.target.value }))} />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>App ID</label>
              <input className="form-input" required value={addForm.appId} onChange={(e) => setAddForm((f) => ({ ...f, appId: e.target.value }))} />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>App Secret</label>
              <input className="form-input" type="password" required value={addForm.appSecret} onChange={(e) => setAddForm((f) => ({ ...f, appSecret: e.target.value }))} autoComplete="new-password" />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>System User Access Token</label>
              <input className="form-input" type="password" value={addForm.systemUserToken} onChange={(e) => setAddForm((f) => ({ ...f, systemUserToken: e.target.value }))} autoComplete="new-password" />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>Webhook Verify Token</label>
              <input className="form-input" value={addForm.verifyToken} onChange={(e) => setAddForm((f) => ({ ...f, verifyToken: e.target.value }))} />
            </div>
            {isWhatsAppTab && (
              <>
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Embedded Signup Config ID</label>
                  <input className="form-input" value={addForm.whatsappConfigId} onChange={(e) => setAddForm((f) => ({ ...f, whatsappConfigId: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Config ID (with catalog)</label>
                  <input className="form-input" value={addForm.whatsappConfigIdCatalog} onChange={(e) => setAddForm((f) => ({ ...f, whatsappConfigIdCatalog: e.target.value }))} />
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save Standby App'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddForm(false); setAddForm(emptyForm); }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : standbySlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No standby apps configured yet — if this app gets disabled by Meta, there's nothing to automatically fail over to.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {standbySlots.map((slot) => (
            <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  {slot.label || `App ${slot.app_id}`}
                  <HealthBadge status={slot.health_status} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {slot.business_manager_label ? `Business: ${slot.business_manager_label} · ` : ''}App ID: {slot.app_id}
                  {slot.last_health_check_at ? ` · last checked ${new Date(slot.last_health_check_at).toLocaleString()}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busySlotId === slot.id} onClick={() => handleTest(slot.id)} title="Test credentials">
                <RefreshCw size={13} className={busySlotId === slot.id ? 'animate-spin' : ''} />
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busySlotId === slot.id} onClick={() => handlePromote(slot.id)} title="Promote to active" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpCircle size={13} /> Promote
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busySlotId === slot.id} onClick={() => handleDelete(slot.id)} title="Remove">
                <Trash2 size={13} color="#ef4444" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
