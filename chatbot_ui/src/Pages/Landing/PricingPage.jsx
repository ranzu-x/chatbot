import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Check, Loader2 } from 'lucide-react';
import { billingAPI } from '../../services/api';

const CYCLES = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState('monthly');

  useEffect(() => {
    billingAPI.getPlans()
      .then((res) => setPlans(res.data?.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Public self-signup only — TEAM_MEMBER packages are assigned internally
  // by an agency to its own team, never bought by an outside visitor.
  const publicPlans = useMemo(
    () => plans.filter((p) => p.type === 'AGENCY' || p.type === 'END_USER'),
    [plans]
  );

  const plansForCycle = useMemo(
    () => publicPlans.filter((p) => p.billing_cycle === cycle),
    [publicPlans, cycle]
  );

  const availableCycles = useMemo(
    () => new Set(publicPlans.map((p) => p.billing_cycle)),
    [publicPlans]
  );

  const handleBuyNow = (pkg) => {
    navigate(`/checkout?package=${pkg.id}`);
  };

  return (
    <>
      <style>{`
        .pp-hero { padding: 72px 0 40px; text-align: center; background: radial-gradient(circle at 50% 0%, rgba(99,102,241,0.08), transparent 60%); }
        .pp-cycle-toggle { display: inline-flex; background: #f1f5f9; border-radius: 999px; padding: 4px; gap: 4px; margin-top: 24px; }
        .pp-cycle-btn { padding: 8px 20px; border-radius: 999px; border: none; background: transparent; font-size: 0.86rem; font-weight: 700; color: #64748b; cursor: pointer; }
        .pp-cycle-btn.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 4px rgba(15,23,42,0.12); }
        .pp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 40px 24px 100px; max-width: 1100px; margin: 0 auto; }
        .pp-card { background: #fff; border: 1px solid var(--lp-border); border-radius: 18px; padding: 32px 28px; display: flex; flex-direction: column; box-shadow: 0 2px 12px rgba(15,23,42,0.04); }
        .pp-card.featured { border: 2px solid var(--lp-primary); box-shadow: 0 8px 30px rgba(99,102,241,0.16); position: relative; }
        .pp-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; font-size: 0.68rem; font-weight: 800; padding: 4px 14px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; }
        .pp-price { font-size: 2.4rem; font-weight: 900; color: #0f172a; margin: 12px 0 2px; }
        .pp-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 0.85rem; color: #334155; padding: 6px 0; }
      `}</style>

      <section className="pp-hero">
        <div className="lp-container-narrow">
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Simple, transparent pricing</h1>
          <p style={{ fontSize: '1rem', color: '#64748b', margin: '12px 0 0' }}>
            Pick the plan that fits your team. Cancel anytime.
          </p>

          <div className="pp-cycle-toggle">
            {CYCLES.map((c) => (
              <button
                key={c.id}
                className={`pp-cycle-btn ${cycle === c.id ? 'active' : ''}`}
                onClick={() => setCycle(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={24} className="animate-spin" color="#94a3b8" />
        </div>
      ) : plansForCycle.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#94a3b8' }}>
          {availableCycles.has(cycle)
            ? 'No plans available right now.'
            : `No ${cycle} plans have been published yet — try another billing cycle.`}
        </div>
      ) : (
        <div className="pp-grid">
          {plansForCycle.map((pkg, idx) => {
            const featured = idx === Math.floor(plansForCycle.length / 2) && plansForCycle.length > 1;
            return (
              <div key={pkg.id} className={`pp-card ${featured ? 'featured' : ''}`}>
                {featured && <div className="pp-badge">Most Popular</div>}
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{pkg.name}</div>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '4px 0 0', minHeight: 36 }}>{pkg.description}</p>
                <div className="pp-price">
                  {Number(pkg.price) === 0 ? 'Free' : `$${Number(pkg.price).toFixed(0)}`}
                  {Number(pkg.price) > 0 && <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8' }}> /{pkg.billing_cycle}</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '16px 0 8px', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div className="pp-feature"><Check size={14} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />{pkg.max_bot_accounts === null ? 'Unlimited' : pkg.max_bot_accounts} connected accounts</div>
                  <div className="pp-feature"><Check size={14} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />{pkg.max_subscribers === null ? 'Unlimited' : Number(pkg.max_subscribers).toLocaleString()} subscribers</div>
                  <div className="pp-feature"><Check size={14} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />{pkg.max_team_members === null ? 'Unlimited' : pkg.max_team_members} team members</div>
                  {(pkg.enabledModules || []).slice(0, 5).map((m) => (
                    <div key={m.key} className="pp-feature"><Check size={14} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />{m.displayName}</div>
                  ))}
                </div>

                <button
                  type="button"
                  className={featured ? 'lp-btn-primary' : 'lp-btn-secondary'}
                  onClick={() => handleBuyNow(pkg)}
                  style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                >
                  Buy Now
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
