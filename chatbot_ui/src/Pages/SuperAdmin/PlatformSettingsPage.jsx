import { Link } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { Sparkles, KeyRound, ArrowRight } from 'lucide-react';

/**
 * Platform Settings. The old "Custom AI API for Resellers" switch
 * (custom_ai_api_for_resellers) is gone: every account now runs on the
 * platform's AI providers and spends AI credits (decided with the user —
 * no reseller-owned or customer-owned AI keys in this release; the setting
 * row is kept in platform_settings but nothing reads it).
 */
export default function PlatformSettingsPage() {
  const row = { display: 'flex', alignItems: 'flex-start', gap: 14 };
  const icon = {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'var(--primary-soft)', color: 'var(--primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">Platform Settings</h1>
        <p className="page-subtitle">Global switches that apply across every account on the platform.</p>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={row}>
            <div style={icon}><Sparkles size={19} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>AI for every account</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 8px', lineHeight: 1.5 }}>
                End users, resellers and resellers' customers all use the platform's AI providers and spend AI credits:
                their plan's monthly credits first, then add-on credits they bought (those never expire). When the platform pool runs out, AI stops for everyone.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/admin/ai-credits" className="btn btn-primary btn-sm">AI Credits <ArrowRight size={13} /></Link>
                <Link to="/settings/ai-providers" className="btn btn-secondary btn-sm"><KeyRound size={13} /> AI Providers (platform keys)</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
