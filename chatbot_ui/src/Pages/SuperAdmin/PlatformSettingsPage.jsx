import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { platformSettingsAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { ShieldCheck, Loader2, Sparkles } from 'lucide-react';

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    platformSettingsAPI.getAll()
      .then((res) => setSettings(res.data?.settings || {}))
      .catch(() => notify.error('Failed to load platform settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const aiForResellers = Boolean(settings.custom_ai_api_for_resellers?.enabled);

  const toggleAiForResellers = () => {
    const next = !aiForResellers;
    setSaving(true);
    platformSettingsAPI.update('custom_ai_api_for_resellers', { enabled: next })
      .then(() => {
        setSettings((s) => ({ ...s, custom_ai_api_for_resellers: { enabled: next } }));
        notify.success(next ? 'Resellers can now enable Custom AI API for their customers' : 'Custom AI API for resellers disabled platform-wide');
      })
      .catch(() => notify.error('Failed to update setting'))
      .finally(() => setSaving(false));
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">Platform Settings</h1>
        <p className="page-subtitle">Global switches that apply across every account on the platform.</p>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <div className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={19} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Custom AI API for Resellers
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  Master switch for reseller-owned AI provider credentials. When ON, a reseller
                  can additionally enable this on its own package (<code>custom_ai_api</code> module) so its
                  customers inherit the reseller's own AI keys instead of needing their own —
                  <strong> both</strong> this switch and the reseller's package flag must be on. Platform-level
                  AI credentials are never exposed to resellers or their customers either way.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAiForResellers}
                disabled={saving}
                title={aiForResellers ? 'Disable' : 'Enable'}
                style={{
                  width: 42, height: 24, borderRadius: 999, border: 'none', cursor: saving ? 'wait' : 'pointer',
                  background: aiForResellers ? 'var(--primary)' : '#cbd5e1', position: 'relative', flexShrink: 0, padding: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: aiForResellers ? 20 : 2, width: 20, height: 20,
                  borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left .15s',
                }} />
              </button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600,
              color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 12,
            }}>
              <ShieldCheck size={13} />
              Enable the per-reseller flag from Packages & Modules — assign the reseller's platform package with the "Reseller Management" module's <code>custom_ai_api</code> feature turned on.
              {saving && <Loader2 size={12} className="animate-spin" style={{ marginLeft: 'auto' }} />}
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
