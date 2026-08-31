import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { domainAPI } from '../../services/api';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  ExternalLink,
  Save,
  RefreshCw,
  Sparkles,
  Shield,
  Layers,
  Palette,
  Mail,
  UserPlus,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react';

export default function DomainSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  const [form, setForm] = useState({
    customDomain: '',
    subdomain: '',
    allowUserRegistration: true,
    branding: {
      brandName: '',
      tagline: '',
      logoUrl: '',
      faviconUrl: '',
      primaryColor: '#2563eb',
      supportEmail: '',
      copyrightText: '',
    },
  });

  const [domainVerified, setDomainVerified] = useState(false);
  const [agencyName, setAgencyName] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await domainAPI.getDomainConfig();
      const data = res.data?.domainConfig || {};
      setForm({
        customDomain: data.customDomain || '',
        subdomain: data.subdomain || '',
        allowUserRegistration: data.allowUserRegistration !== false,
        branding: {
          brandName: data.branding?.brandName || data.agencyName || '',
          tagline: data.branding?.tagline || 'AI & Multi-channel Marketing Workspace',
          logoUrl: data.branding?.logoUrl || '',
          faviconUrl: data.branding?.faviconUrl || '',
          primaryColor: data.branding?.primaryColor || '#2563eb',
          supportEmail: data.branding?.supportEmail || '',
          copyrightText: data.branding?.copyrightText || '',
        },
      });
      setDomainVerified(Boolean(data.domainVerified));
      setAgencyName(data.agencyName || 'Your Agency');
    } catch (err) {
      console.error(err);
      showToast('Failed to load custom domain configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await domainAPI.updateDomainConfig(form);
      showToast(res.data?.message || 'Domain & branding saved successfully!');
      setDomainVerified(Boolean(res.data?.domainVerified));
      loadConfig();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to save domain configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyDNS = async () => {
    if (!form.customDomain) {
      showToast('Please enter and save a custom domain first', 'error');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await domainAPI.verifyDomain();
      setVerifyResult(res.data);
      if (res.data?.isVerified) {
        setDomainVerified(true);
        showToast('🎉 Domain DNS verified successfully!');
      } else {
        showToast(res.data?.message || 'DNS not propagated yet', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Verification failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const currentHost = window.location.host;
  const activeDomain = form.customDomain || (form.subdomain ? `${form.subdomain}.${currentHost.replace(/:\d+$/, '')}` : currentHost);
  const signupUrl = form.customDomain
    ? `https://${form.customDomain}/register`
    : `${window.location.origin}/register?domain=${encodeURIComponent(activeDomain)}`;

  return (
    <AppLayout>
      <div className="domain-settings-page" style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.84rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Page Header */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} />
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Custom Domain & White-label Branding
              </h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
              Connect your own custom domain or subdomain. Users registering on your domain will automatically become users under your workspace.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: '0.76rem',
                fontWeight: 700,
                background: domainVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: domainVerified ? '#059669' : '#d97706',
                border: `1px solid ${domainVerified ? '#a7f3d0' : '#fde68a'}`,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: domainVerified ? '#10b981' : '#f59e0b' }} />
              {domainVerified ? 'DNS Active & Verified' : 'DNS Pending / Custom Setup'}
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading domain configurations...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* ── 1. Custom Domain & DNS Card ── */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={17} color="#2563eb" /> 1. Domain Configuration
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Custom Domain (FQDN)
                  </label>
                  <input
                    type="text"
                    className="form-input w-full"
                    placeholder="e.g. chat.mybrand.com"
                    value={form.customDomain}
                    onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    Enter your root domain or subdomain (without http://).
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Alternative Subdomain Slug
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. mybrand"
                      value={form.subdomain}
                      onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, flex: 1 }}
                    />
                    <span style={{ padding: '0 10px', height: 38, display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', border: '1px solid #cbd5e1', borderLeft: 0, borderTopRightRadius: 8, borderBottomRightRadius: 8, fontSize: '0.75rem', color: '#64748b' }}>
                      .{currentHost.replace(/:\d+$/, '')}
                    </span>
                  </div>
                </div>
              </div>

              {/* DNS Instructions Box */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={15} color="#2563eb" /> DNS Setup Instructions for your Registrar (Cloudflare, GoDaddy, Namecheap):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr auto', gap: 10, background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', alignItems: 'center', fontSize: '0.78rem' }}>
                  <div><strong>Type:</strong> CNAME</div>
                  <div><strong>Host / Name:</strong> {form.customDomain ? form.customDomain.split('.')[0] : 'chat'}</div>
                  <div style={{ color: '#2563eb', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>Points to:</strong> {currentHost.replace(/:\d+$/, '')}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentHost.replace(/:\d+$/, ''));
                      showToast('Target host copied to clipboard!');
                    }}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Copy size={11} /> Copy
                  </button>
                </div>
              </div>

              {/* Verify DNS Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleVerifyDNS}
                  disabled={verifying || !form.customDomain}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: verifying || !form.customDomain ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw size={13} className={verifying ? 'animate-spin' : ''} />
                  {verifying ? 'Verifying DNS...' : 'Verify Domain DNS'}
                </button>

                {verifyResult && (
                  <span style={{ fontSize: '0.76rem', color: verifyResult.isVerified ? '#059669' : '#dc2626', fontWeight: 600 }}>
                    {verifyResult.message}
                  </span>
                )}
              </div>
            </div>

            {/* ── 2. White-Label Branding Card ── */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Palette size={17} color="#2563eb" /> 2. White-Label Workspace Branding
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    Brand / Workspace Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input w-full"
                    placeholder="e.g. Dynasty AI"
                    value={form.branding.brandName}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, brandName: e.target.value } })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    className="form-input w-full"
                    placeholder="e.g. AI & Live Chat Suite"
                    value={form.branding.tagline}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, tagline: e.target.value } })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    Logo URL
                  </label>
                  <input
                    type="url"
                    className="form-input w-full"
                    placeholder="https://mybrand.com/logo.png"
                    value={form.branding.logoUrl}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, logoUrl: e.target.value } })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    Support Contact Email
                  </label>
                  <input
                    type="email"
                    className="form-input w-full"
                    placeholder="support@mybrand.com"
                    value={form.branding.supportEmail}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, supportEmail: e.target.value } })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    Primary Theme Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="color"
                      value={form.branding.primaryColor}
                      onChange={(e) => setForm({ ...form, branding: { ...form.branding, primaryColor: e.target.value } })}
                      style={{ width: 40, height: 38, borderRadius: 8, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={form.branding.primaryColor}
                      onChange={(e) => setForm({ ...form, branding: { ...form.branding, primaryColor: e.target.value } })}
                      style={{ width: 120 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.allowUserRegistration}
                      onChange={(e) => setForm({ ...form, allowUserRegistration: e.target.checked })}
                    />
                    Allow New Users to Self-Register on this Domain
                  </label>
                </div>
              </div>
            </div>

            {/* ── 3. Direct Signup & Shareable Link Card ── */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={17} color="#2563eb" /> 3. Dedicated User Signup Link
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px 0' }}>
                Share this signup link with your users or agents. Anyone who creates an account via this link will automatically be created under <strong>{form.branding.brandName || agencyName}</strong>.
              </p>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="text"
                  readOnly
                  value={signupUrl}
                  className="form-input"
                  style={{ flex: 1, background: '#f8fafc', color: '#2563eb', fontWeight: 600 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(signupUrl);
                    showToast('Signup link copied to clipboard!');
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Copy size={13} /> Copy Link
                </button>
              </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 28px',
                  borderRadius: 10,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Save size={16} />
                {saving ? 'Saving Settings...' : 'Save Domain & Branding'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
