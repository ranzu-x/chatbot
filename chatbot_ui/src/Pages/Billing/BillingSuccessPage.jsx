import React, { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { useAuth } from '../../Provider/AuthContext';
import { CheckCircle2, ArrowRight, Sparkles, Zap, Package } from 'lucide-react';

export default function BillingSuccessPage() {
  const { refreshEntitlements } = useAuth();
  const [searchParams] = useSearchParams();
  const isSimulated = searchParams.get('simulated') === 'true';

  useEffect(() => {
    refreshEntitlements();
  }, [refreshEntitlements]);

  return (
    <AppLayout>
      <div style={{ maxWidth: 560, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '36px 28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
              marginBottom: 18,
            }}
          >
            <CheckCircle2 size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', margin: '0 0 8px 0' }}>
            Subscription Activated!
          </h2>

          <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Thank you for your payment. Your new plan limits, unlocked modules, and capacity quotas have been applied to your workspace immediately.
          </p>

          {isSimulated && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.74rem', color: '#2563eb', fontWeight: 700, marginBottom: 20 }}>
              ✨ Dev Mode: Instant test plan activation completed.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              to="/agency/plan"
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Zap size={14} /> View My Plan
            </Link>

            <Link
              to="/bots"
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#475569',
                textDecoration: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Go to Bot Manager <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
