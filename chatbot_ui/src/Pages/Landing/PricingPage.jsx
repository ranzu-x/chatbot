import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Check,
  Loader2,
  Bot,
  Users,
  MessageSquare,
  Sparkles,
  Shield,
  Zap,
  Building2,
  ArrowRight,
  HelpCircle,
  Headphones,
} from 'lucide-react';
import { billingAPI } from '../../services/api';

const CYCLES = [
  { id: 'monthly', label: 'Monthly', discount: null },
  { id: 'quarterly', label: 'Quarterly', discount: 'Save 10%' },
  { id: 'yearly', label: 'Yearly', discount: 'Save 20% (2 Mo Free)' },
];

function getPackageCategory(pkg) {
  const name = (pkg.name || '').toLowerCase();
  const type = (pkg.type || '').toUpperCase();
  const price = Number(pkg.price || 0);

  // Agency or Reseller packages
  if (type === 'AGENCY' || name.includes('reseller') || name.includes('agency')) {
    return 'RESELLER';
  }

  // Basic Free packages (zero cost or explicitly marked free/basic)
  if (price === 0 || pkg.billing_cycle === 'free' || name.includes('free') || name.includes('basic')) {
    return 'FREE';
  }

  // All other paid end-user packages
  return 'PREMIUM';
}

function cleanTierLabel(name) {
  if (!name) return 'Standard';
  return name
    .replace(/(Agency|Premium|End-User|Package)\s*/gi, '')
    .replace(/\s*\((Unlimited|Quarterly|Yearly)\)/gi, '')
    .trim() || name;
}

/**
 * PlanColumnCard
 * Renders one of the 3 main columns: Basic Free, Premium, or Reseller.
 * If multiple packages exist in the group, renders an interactive bar/slider
 * that dynamically updates the active tier, pricing, limits, and checkout target.
 */
function PlanColumnCard({
  categoryKey,
  columnTitle,
  subtitle,
  badgeText,
  packages,
  cycle,
  onBuyNow,
  featured = false,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset or adjust index when package array changes
  useEffect(() => {
    setSelectedIndex((prev) => (prev < packages.length ? prev : 0));
  }, [packages]);

  if (!packages || packages.length === 0) {
    return (
      <div className={`pp-card ${featured ? 'featured' : ''}`}>
        <div className="pp-card-header">
          <div className="pp-col-title">{columnTitle}</div>
          <p className="pp-col-subtitle">{subtitle}</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: '0.88rem' }}>
          No plans currently published for this billing cycle.
        </div>
      </div>
    );
  }

  const currentPkg = packages[selectedIndex] || packages[0];
  const isFree = Number(currentPkg.price) === 0 || currentPkg.billing_cycle === 'free';
  const hasMultipleTiers = packages.length > 1;

  // Calculate monthly equivalent if quarterly or yearly
  const monthlyEquivalent = useMemo(() => {
    const p = Number(currentPkg.price);
    if (isFree || p === 0) return null;
    if (cycle === 'yearly') return Math.round(p / 12);
    if (cycle === 'quarterly') return Math.round(p / 3);
    return null;
  }, [currentPkg.price, cycle, isFree]);

  const cycleDisplay = isFree
    ? 'forever'
    : cycle === 'yearly'
    ? 'year'
    : cycle === 'quarterly'
    ? 'quarter'
    : 'month';

  const progressPercent = hasMultipleTiers
    ? (selectedIndex / (packages.length - 1)) * 100
    : 100;

  return (
    <div className={`pp-card ${featured ? 'featured' : ''} ${categoryKey === 'RESELLER' ? 'reseller-card' : ''}`}>
      {featured && <div className="pp-badge">{badgeText || 'Most Popular'}</div>}
      {categoryKey === 'RESELLER' && !featured && (
        <div className="pp-reseller-badge">{badgeText || 'Agency & White-Label'}</div>
      )}

      <div className="pp-card-header">
        <div className="pp-col-header-row">
          <div>
            <div className="pp-col-title">{columnTitle}</div>
            <div className="pp-active-tier-name">{currentPkg.name}</div>
          </div>
          {categoryKey === 'RESELLER' && <Building2 size={24} color="#6366f1" />}
          {categoryKey === 'PREMIUM' && <Sparkles size={24} color="#4f46e5" />}
          {categoryKey === 'FREE' && <Zap size={22} color="#10b981" />}
        </div>
        <p className="pp-col-subtitle">{currentPkg.description || subtitle}</p>
      </div>

      {/* ── Interactive Tier Bar (Shown when multiple packages exist) ── */}
      {hasMultipleTiers && (
        <div className="pp-tier-bar-wrapper">
          <div className="pp-tier-bar-meta">
            <span className="pp-tier-pill">Tier {selectedIndex + 1} of {packages.length}</span>
            <span className="pp-tier-label-selected">
              {cleanTierLabel(currentPkg.name)}
            </span>
          </div>

          {/* Slider input */}
          <div className="pp-slider-track-wrap">
            <input
              type="range"
              min={0}
              max={packages.length - 1}
              step={1}
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="pp-range-slider"
              style={{
                background: `linear-gradient(to right, ${
                  categoryKey === 'RESELLER' ? '#4f46e5' : '#6366f1'
                } ${progressPercent}%, #e2e8f0 ${progressPercent}%)`,
              }}
              aria-label={`Select tier for ${columnTitle}`}
            />
          </div>

          {/* Clickable step tick buttons */}
          <div className="pp-step-ticks">
            {packages.map((pkg, idx) => (
              <button
                key={pkg.id || idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`pp-step-tick-btn ${idx === selectedIndex ? 'active' : ''}`}
                title={`Switch to ${pkg.name}`}
              >
                <span className="pp-step-dot" />
                <span className="pp-step-name">{cleanTierLabel(pkg.name)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Price Section ── */}
      <div className="pp-price-box">
        <div className="pp-price-row">
          <span className="pp-price-val">
            {isFree ? 'Free' : `$${Number(currentPkg.price).toFixed(0)}`}
          </span>
          <span className="pp-price-cycle">/{cycleDisplay}</span>
        </div>
        {monthlyEquivalent && (
          <div className="pp-monthly-equiv">
            ~${monthlyEquivalent}/mo billed {cycle}
          </div>
        )}
      </div>

      {/* ── Key Resource Limits Metrics ── */}
      <div className="pp-limits-grid">
        <div className="pp-limit-col">
          <Bot size={15} className="pp-limit-icon" />
          <span className="pp-limit-val">
            {currentPkg.max_bot_accounts === null ? 'Unlimited' : currentPkg.max_bot_accounts}
          </span>
          <span className="pp-limit-lbl">Bot Accounts</span>
        </div>
        <div className="pp-limit-col">
          <Users size={15} className="pp-limit-icon" />
          <span className="pp-limit-val">
            {currentPkg.max_subscribers === null ? 'Unlimited' : Number(currentPkg.max_subscribers).toLocaleString()}
          </span>
          <span className="pp-limit-lbl">Subscribers</span>
        </div>
        <div className="pp-limit-col">
          <MessageSquare size={15} className="pp-limit-icon" />
          <span className="pp-limit-val">
            {currentPkg.max_monthly_messages === null || !currentPkg.max_monthly_messages
              ? 'Unlimited'
              : Number(currentPkg.max_monthly_messages).toLocaleString()}
          </span>
          <span className="pp-limit-lbl">Messages/mo</span>
        </div>
      </div>

      {/* ── Features List ── */}
      <div className="pp-features-list">
        <div className="pp-feature-item">
          <Check size={15} className="pp-check-icon" />
          <span>
            {currentPkg.max_team_members === null || currentPkg.max_team_members > 20
              ? 'Unlimited'
              : currentPkg.max_team_members || 1}{' '}
            team seat{(currentPkg.max_team_members === null || currentPkg.max_team_members > 1) ? 's' : ''}
          </span>
        </div>

        {categoryKey === 'FREE' && (
          <>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Visual Drag-and-Drop Flow Builder</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Webchat Widget & Messenger Bot</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Live Chat Inbox with Human Takeover</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Community Support & Documentation</span></div>
          </>
        )}

        {categoryKey === 'PREMIUM' && (
          <>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>WhatsApp Official Meta Cloud API</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Instagram DM & Telegram Automations</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Autonomous AI Chatbot with Knowledge Base</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Broadcasting & Drip Sequence Campaigns</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Social Comment & Story Auto-Reply</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Online Appointment Booking & Reminders</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Priority Support & API Access</span></div>
          </>
        )}

        {categoryKey === 'RESELLER' && (
          <>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Multi-Tenant Client Sub-Accounts Management</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Custom Domain & 100% White-Label Branding</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Create & Sell Your Own Client Packages</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Connect Your Own Payment Gateways (Stripe/SSL)</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>Affiliate Referral Earning Potential</span></div>
            <div className="pp-feature-item"><Check size={15} className="pp-check-icon" /><span>VIP Dedicated Account Manager Support</span></div>
          </>
        )}

        {/* Dynamic enabled modules preview if available */}
        {(currentPkg.enabledModules || [])
          .filter((m) => !m.key.startsWith('channel_') && !m.key.startsWith('feature_live_chat'))
          .slice(0, 3)
          .map((m) => (
            <div key={m.key} className="pp-feature-item">
              <Check size={15} className="pp-check-icon" />
              <span>{m.displayName}</span>
            </div>
          ))}
      </div>

      {/* ── Action Button ── */}
      <button
        type="button"
        className={`pp-cta-btn ${featured ? 'pp-cta-featured' : categoryKey === 'RESELLER' ? 'pp-cta-reseller' : 'pp-cta-secondary'}`}
        onClick={() => onBuyNow(currentPkg)}
      >
        <span>
          {isFree
            ? 'Get Started Free'
            : categoryKey === 'RESELLER'
            ? 'Launch Reseller Agency'
            : 'Get Started with Premium'}
        </span>
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState('monthly');

  useEffect(() => {
    billingAPI
      .getPlans()
      .then((res) => setPlans(res.data?.plans || []))
      .catch((err) => console.error('Failed to load plans:', err))
      .finally(() => setLoading(false));
  }, []);

  // Filter out internal TEAM_MEMBER packages (assigned internally, not bought by visitors)
  const publicPlans = useMemo(
    () => plans.filter((p) => p.type !== 'TEAM_MEMBER'),
    [plans]
  );

  // Group packages for the active cycle into the 3 columns:
  // 1. Basic Free: zero cost or billing_cycle === 'free' (available across all cycles)
  // 2. Premium: END_USER / direct customer packages matching the selected cycle
  // 3. Reseller: AGENCY packages matching the selected cycle
  const { freePlans, premiumPlans, resellerPlans } = useMemo(() => {
    const free = [];
    const premium = [];
    const reseller = [];

    for (const p of publicPlans) {
      const cat = getPackageCategory(p);

      if (cat === 'FREE') {
        // Free packages with billing_cycle 'free' or price 0 show across all cycles
        if (p.billing_cycle === 'free' || Number(p.price) === 0 || p.billing_cycle === cycle) {
          free.push(p);
        }
      } else if (cat === 'PREMIUM') {
        if (p.billing_cycle === cycle) {
          premium.push(p);
        }
      } else if (cat === 'RESELLER') {
        if (p.billing_cycle === cycle) {
          reseller.push(p);
        }
      }
    }

    // Sort by price ascending so the bar ranges from lowest to highest tier
    free.sort((a, b) => Number(a.price) - Number(b.price));
    premium.sort((a, b) => Number(a.price) - Number(b.price));
    reseller.sort((a, b) => Number(a.price) - Number(b.price));

    return {
      freePlans: free,
      premiumPlans: premium,
      resellerPlans: reseller,
    };
  }, [publicPlans, cycle]);

  const handleBuyNow = (pkg) => {
    if (!pkg) return;
    navigate(`/checkout?package=${pkg.id}`);
  };

  return (
    <>
      <style>{`
        .pp-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .pp-hero {
          padding: 72px 20px 48px;
          text-align: center;
          background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12), transparent 70%);
        }

        .pp-hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #eef2ff;
          color: #4f46e5;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          margin-bottom: 16px;
          border: 1px solid #c7d2fe;
        }

        .pp-hero-title {
          font-size: 2.5rem;
          font-weight: 900;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .pp-hero-sub {
          font-size: 1.05rem;
          color: #64748b;
          margin: 14px auto 0;
          max-width: 640px;
          line-height: 1.5;
        }

        /* ── Billing Cycle Selector ── */
        .pp-cycle-bar-wrap {
          margin-top: 32px;
          display: inline-flex;
          background: #f1f5f9;
          border-radius: 999px;
          padding: 5px;
          gap: 6px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .pp-cycle-btn {
          padding: 8px 20px;
          border-radius: 999px;
          border: none;
          background: transparent;
          font-size: 0.88rem;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .pp-cycle-btn.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
        }

        .pp-discount-pill {
          background: #dcfce7;
          color: #16a34a;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
        }

        /* ── 3-Column Pricing Grid ── */
        .pp-grid-3col {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 28px;
          padding: 36px 0 80px;
          align-items: stretch;
        }

        @media (max-width: 1040px) {
          .pp-grid-3col {
            grid-template-columns: 1fr;
            max-width: 540px;
            margin: 0 auto;
          }
        }

        /* ── Column Card ── */
        .pp-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          padding: 34px 28px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }

        .pp-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
        }

        .pp-card.featured {
          border: 2px solid #6366f1;
          box-shadow: 0 10px 36px rgba(99, 102, 241, 0.16);
        }

        .pp-card.reseller-card {
          border: 1px solid #c7d2fe;
          background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
        }

        .pp-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 5px 16px;
          border-radius: 999px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .pp-reseller-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #1e293b, #0f172a);
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 5px 16px;
          border-radius: 999px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
        }

        .pp-col-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .pp-col-title {
          font-size: 1.28rem;
          font-weight: 900;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .pp-active-tier-name {
          font-size: 0.84rem;
          font-weight: 700;
          color: #6366f1;
          margin-top: 3px;
        }

        .pp-col-subtitle {
          font-size: 0.84rem;
          color: #64748b;
          margin: 8px 0 0;
          line-height: 1.45;
          min-height: 38px;
        }

        /* ── Tier Bar & Range Slider ── */
        .pp-tier-bar-wrapper {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px 16px;
          margin: 18px 0 16px;
        }

        .pp-tier-bar-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .pp-tier-pill {
          font-size: 0.72rem;
          font-weight: 800;
          color: #64748b;
          background: #e2e8f0;
          padding: 2px 8px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .pp-tier-label-selected {
          font-size: 0.8rem;
          font-weight: 800;
          color: #0f172a;
        }

        .pp-slider-track-wrap {
          padding: 4px 0;
        }

        .pp-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 999px;
          outline: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .pp-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #6366f1;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transition: transform 0.1s ease;
        }

        .pp-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .pp-range-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #6366f1;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }

        .pp-step-ticks {
          display: flex;
          justify-content: space-between;
          gap: 4px;
          margin-top: 10px;
        }

        .pp-step-tick-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          color: #94a3b8;
          font-size: 0.72rem;
          font-weight: 700;
          transition: all 0.15s ease;
          flex: 1;
        }

        .pp-step-tick-btn:hover {
          color: #4f46e5;
        }

        .pp-step-tick-btn.active {
          color: #0f172a;
          font-weight: 800;
        }

        .pp-step-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #cbd5e1;
          transition: background 0.15s ease;
        }

        .pp-step-tick-btn.active .pp-step-dot {
          background: #6366f1;
          transform: scale(1.3);
        }

        .pp-step-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 75px;
        }

        /* ── Price Section ── */
        .pp-price-box {
          margin: 16px 0 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
        }

        .pp-price-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .pp-price-val {
          font-size: 2.6rem;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.02em;
          line-height: 1;
        }

        .pp-price-cycle {
          font-size: 0.92rem;
          font-weight: 700;
          color: #94a3b8;
        }

        .pp-monthly-equiv {
          font-size: 0.78rem;
          color: #16a34a;
          font-weight: 700;
          margin-top: 4px;
        }

        /* ── Limits Grid ── */
        .pp-limits-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          background: #f8fafc;
          border-radius: 12px;
          padding: 12px 8px;
          margin-bottom: 20px;
          border: 1px solid #f1f5f9;
          text-align: center;
        }

        .pp-limit-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 4px;
        }

        .pp-limit-col:not(:last-child) {
          border-right: 1px solid #e2e8f0;
        }

        .pp-limit-icon {
          color: #6366f1;
          margin-bottom: 4px;
        }

        .pp-limit-val {
          font-size: 0.88rem;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
        }

        .pp-limit-lbl {
          font-size: 0.68rem;
          color: #64748b;
          font-weight: 600;
          margin-top: 2px;
        }

        /* ── Features List ── */
        .pp-features-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 28px;
          flex: 1;
        }

        .pp-feature-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.85rem;
          color: #334155;
          line-height: 1.4;
        }

        .pp-check-icon {
          color: #16a34a;
          margin-top: 2px;
          flex-shrink: 0;
        }

        /* ── CTA Buttons ── */
        .pp-cta-btn {
          width: 100%;
          padding: 13px 20px;
          border-radius: 12px;
          font-size: 0.92rem;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          border: none;
          margin-top: auto;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        }

        .pp-cta-featured {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
        }

        .pp-cta-featured:hover {
          background: linear-gradient(135deg, #4f46e5, #4338ca);
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(79, 70, 229, 0.4);
        }

        .pp-cta-reseller {
          background: #0f172a;
          color: #ffffff;
        }

        .pp-cta-reseller:hover {
          background: #1e293b;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
        }

        .pp-cta-secondary {
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }

        .pp-cta-secondary:hover {
          background: #e2e8f0;
          transform: translateY(-2px);
        }

        /* ── Trust Section ── */
        .pp-trust-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          padding: 40px 0 60px;
          border-top: 1px solid #e2e8f0;
          margin-top: 20px;
        }

        .pp-trust-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pp-trust-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #eef2ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .pp-trust-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }

        .pp-trust-desc {
          font-size: 0.78rem;
          color: #64748b;
          margin: 2px 0 0;
        }
      `}</style>

      {/* ── Hero Section ── */}
      <section className="pp-hero">
        <div className="pp-container">
          <div className="pp-hero-pill">
            <Sparkles size={14} /> Transparent & Scalable Plans
          </div>
          <h1 className="pp-hero-title">Simple, powerful pricing for every scale</h1>
          <p className="pp-hero-sub">
            Whether you are automating your first bot or scaling a full white-label agency,
            pick the perfect plan. Change tiers anytime.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="pp-cycle-bar-wrap">
            {CYCLES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pp-cycle-btn ${cycle === c.id ? 'active' : ''}`}
                onClick={() => setCycle(c.id)}
              >
                <span>{c.label}</span>
                {c.discount && <span className="pp-discount-pill">{c.discount}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main 3-Column Grid ── */}
      <section className="pp-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Loader2 size={32} className="animate-spin" color="#6366f1" style={{ margin: '0 auto 12px' }} />
            <div style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Loading pricing packages…</div>
          </div>
        ) : (
          <div className="pp-grid-3col">
            {/* Column 1: Basic Free */}
            <PlanColumnCard
              categoryKey="FREE"
              columnTitle="Basic Free"
              subtitle="Get started with core automation and test features with zero commitment."
              badgeText="Free Forever"
              packages={freePlans}
              cycle={cycle}
              onBuyNow={handleBuyNow}
              featured={false}
            />

            {/* Column 2: Premium (Featured) */}
            <PlanColumnCard
              categoryKey="PREMIUM"
              columnTitle="Premium"
              subtitle="For growing businesses, creators & teams demanding high automation throughput."
              badgeText="Most Popular"
              packages={premiumPlans}
              cycle={cycle}
              onBuyNow={handleBuyNow}
              featured={true}
            />

            {/* Column 3: Reseller & Agency */}
            <PlanColumnCard
              categoryKey="RESELLER"
              columnTitle="Reseller Agency"
              subtitle="Launch your own AI chatbot SaaS agency with custom branding & sub-accounts."
              badgeText="White-Label Agency"
              packages={resellerPlans}
              cycle={cycle}
              onBuyNow={handleBuyNow}
              featured={false}
            />
          </div>
        )}

        {/* ── Value & Trust Proof ── */}
        <div className="pp-trust-row">
          <div className="pp-trust-box">
            <div className="pp-trust-icon"><Shield size={20} /></div>
            <div>
              <div className="pp-trust-title">No Hidden Fees</div>
              <div className="pp-trust-desc">Transparent pricing with zero setup costs.</div>
            </div>
          </div>
          <div className="pp-trust-box">
            <div className="pp-trust-icon"><Zap size={20} /></div>
            <div>
              <div className="pp-trust-title">Instant Setup</div>
              <div className="pp-trust-desc">Account and bot tools provisioned immediately.</div>
            </div>
          </div>
          <div className="pp-trust-box">
            <div className="pp-trust-icon"><Building2 size={20} /></div>
            <div>
              <div className="pp-trust-title">Flexible Upgrades</div>
              <div className="pp-trust-desc">Slide and switch tiers seamlessly as you grow.</div>
            </div>
          </div>
          <div className="pp-trust-box">
            <div className="pp-trust-icon"><Headphones size={20} /></div>
            <div>
              <div className="pp-trust-title">24/7 Expert Support</div>
              <div className="pp-trust-desc">Dedicated onboarding and technical assistance.</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
