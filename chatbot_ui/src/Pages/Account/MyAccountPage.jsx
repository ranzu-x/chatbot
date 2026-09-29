import useUrlState from '../../hooks/useUrlState';
import AppLayout from '../../Layout/AppLayout';
import { useAuth } from '../../Provider/AuthContext';
import BillingTab from './BillingTab';
import SecurityTab from './SecurityTab';
import ProfileTab from './ProfileTab';
import { User, CreditCard, ShieldCheck } from 'lucide-react';

/**
 * My Account — reachable from the TopBar's user dropdown. Tabs: Profile
 * (edit your own picture, name, phone, address, email, password — ProfileTab.jsx),
 * Security (two-factor, sign out everywhere) and Billing (the plan THIS agency is
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

        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'billing' && showBilling && <BillingTab />}
      </div>
    </AppLayout>
  );
}
