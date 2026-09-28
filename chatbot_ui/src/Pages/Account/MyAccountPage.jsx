import useUrlState from '../../hooks/useUrlState';
import UserAvatar from '../../Components/Common/UserAvatar';
import AppLayout from '../../Layout/AppLayout';
import { useAuth } from '../../Provider/AuthContext';
import BillingTab from './BillingTab';
import SecurityTab from './SecurityTab';
import { User, CreditCard, ShieldCheck } from 'lucide-react';

import { accountLabel } from '../../utils/accountLabel';

function ProfileTab({ user }) {

  const rows = [
    { label: 'Full Name', value: user?.name || '—' },
    { label: 'Email Address', value: user?.email || '—' },
    { label: 'Account', value: accountLabel(user) },
  ];

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <UserAvatar src={user?.avatar} name={user?.name} size={56} />
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{user?.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{accountLabel(user)}</div>
        </div>
      </div>

      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 700 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * My Account — reachable from the TopBar's user dropdown. Currently two
 * tabs: Profile (basic account info) and Billing (the plan THIS agency is
 * subscribed to — moved here from the old standalone /agency/plan page,
 * since "Packages & Modules" in the sidebar now means the agency's own
 * package-creation page for ITS customers, not this). Billing only applies
 * to an Agency (Admin/Platform has no plan of its own to display; Agents
 * don't have billing access at all).
 */
export default function MyAccountPage() {
  const { user } = useAuth();
  const showBilling = user?.role === 'RESELLER';
  const [activeTab, setTab] = useUrlState('tab', 'profile', { allowed: showBilling ? ['profile', 'security', 'billing'] : ['profile', 'security'] });

  const tabs = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'security', label: 'Security', icon: ShieldCheck },
    ...(showBilling ? [{ key: 'billing', label: 'Billing', icon: CreditCard }] : []),
  ];

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">My Account</h1>
        <p className="page-subtitle">Your account details{showBilling ? ' and the plan your workspace is subscribed to.' : '.'}</p>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px',
                fontSize: '0.85rem', fontWeight: 700,
                color: activeTab === t.key ? '#2563eb' : '#64748b',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === t.key ? '2.5px solid #2563eb' : '2.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && <ProfileTab user={user} />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'billing' && showBilling && <BillingTab />}
      </div>
    </AppLayout>
  );
}
