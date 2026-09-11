import { useState } from 'react';
import { useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { useAuth } from '../../Provider/AuthContext';
import BillingTab from './BillingTab';
import { User, CreditCard } from 'lucide-react';

const ROLE_LABELS = { ADMIN: 'Super Admin', RESELLER: 'Reseller', USER: 'User' };

function ProfileTab({ user }) {
  const getInitials = (name = '') => (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const rows = [
    { label: 'Full Name', value: user?.name || '—' },
    { label: 'Email Address', value: user?.email || '—' },
    { label: 'Role', value: ROLE_LABELS[user?.role] || user?.role || '—' },
  ];

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(37,99,235,0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
          {getInitials(user?.name)}
        </div>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{user?.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{ROLE_LABELS[user?.role] || user?.role}</div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const showBilling = user?.role === 'RESELLER';
  const initialTab = showBilling && searchParams.get('tab') === 'billing' ? 'billing' : 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  const setTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'billing' ? { tab: 'billing' } : {});
  };

  const tabs = [
    { key: 'profile', label: 'Profile', icon: User },
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
        {activeTab === 'billing' && showBilling && <BillingTab />}
      </div>
    </AppLayout>
  );
}
