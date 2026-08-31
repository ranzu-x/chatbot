import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { showAlert, notify } from '../../utils/alerts';
import {
  MessageCircle,
  Plus,
  CheckCircle2,
  Trash2,
  Zap,
  Key,
  RefreshCw,
  Shield,
  Copy,
  Check,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Info,
  Package,
  Building2,
  Smartphone,
  Repeat,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// Small helper: copy-to-clipboard button
// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={doCopy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 6,
        border: '1px solid #e2e8f0', background: copied ? '#f0fdf4' : '#f8fafc',
        color: copied ? '#16a34a' : '#475569',
        fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReadonlyField: shows a value with a copy button
// ─────────────────────────────────────────────────────────────────────────────
function ReadonlyField({ label, value, hint }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{
          flex: 1, padding: '7px 10px', borderRadius: 6,
          border: '1px solid #e2e8f0', background: '#f1f5f9',
          fontFamily: 'monospace', fontSize: '0.78rem', color: '#334155',
          wordBreak: 'break-all',
        }}>
          {value}
        </div>
        <CopyButton value={value} />
      </div>
      {hint && <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#64748b' }}>{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ label, color = '#10b981', bg = 'rgba(16,185,129,0.1)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.72rem', fontWeight: 700, color, background: bg,
      padding: '2px 8px', borderRadius: 10,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppPage({ embedded = false }) {
  const { user } = useAuth();
  const { fbReady, appId, configId } = useFacebookSDK();

  // Data
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI flow state
  // 'list' | 'choose_method' | 'manual' | 'embedded_catalog_select' | 'embedded_connecting'
  const [view, setView] = useState('list');
  const [connecting, setConnecting] = useState(false);

  // Embedded signup state
  const [withCatalog, setWithCatalog] = useState(false);
  const [onboardingType, setOnboardingType] = useState('new_number'); // 'new_number' | 'coexistence'
  const metaSessionRef = useRef({ phoneNumberId: null, wabaId: null, code: null });

  // Manual form
  const [manualForm, setManualForm] = useState({
    name: '',
    waPhoneNumberId: '',
    waDisplayPhone: '',
    waBusinessAccId: '',
    accessToken: '',
    verifyToken: '',
  });
  const [showToken, setShowToken] = useState(false);

  // Activate / Register modal
  const [activateModal, setActivateModal] = useState(null);
  const [activateForm, setActivateForm] = useState({ pin: '', accessToken: '' });
  const [activating, setActivating] = useState(false);
  const pinInputRef = useRef(null);

  // Derived values
  const webhookUrl = `${BACKEND_URL}/api/v1/webhook/${user?.agencyId || '{agencyId}'}`;

  // ── Fetch accounts ──────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await channelAPI.getWhatsApp();
      setAccounts(res.data.accounts || []);
    } catch {
      notify.error('Failed to load WhatsApp accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Focus PIN input when activate modal opens
  useEffect(() => {
    if (activateModal) setTimeout(() => pinInputRef.current?.focus(), 80);
  }, [activateModal]);

  // ── Listen for Meta Embedded Signup postMessage ─────────────────────────────
  useEffect(() => {
    const handleMetaMessage = async (event) => {
      if (!event.origin.includes('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;
        if (data.type === 'WA_EMBEDDED_SIGNUP' || data.event === 'WA_EMBEDDED_SIGNUP') {
          const ev = data.event || data.type;
          if (ev === 'CANCEL') {
            setConnecting(false);
            setView('embedded_catalog_select');
            notify.info('Embedded Signup cancelled.');
            return;
          }
          if (ev === 'ERROR') {
            setConnecting(false);
            setView('embedded_catalog_select');
            notify.error('Embedded Signup error. Please try again.');
            return;
          }
          const { phone_number_id, waba_id, code } = data.data || {};
          if (phone_number_id) metaSessionRef.current.phoneNumberId = phone_number_id;
          if (waba_id) metaSessionRef.current.wabaId = waba_id;
          if (code) metaSessionRef.current.code = code;

          if (metaSessionRef.current.code) {
            setView('embedded_connecting');
            setConnecting(true);
            try {
              await channelAPI.addWhatsAppEmbedded({
                code: metaSessionRef.current.code,
                phoneNumberId: metaSessionRef.current.phoneNumberId,
                wabaId: metaSessionRef.current.wabaId,
                name: withCatalog ? 'WhatsApp Commerce Account' : 'WhatsApp Business Number',
                withCatalog,
              });
              notify.success('WhatsApp connected and activated successfully!');
              setView('list');
              fetchAccounts();
            } catch (err) {
              notify.error(err?.response?.data?.message || 'Failed to save WhatsApp account.');
              setView('embedded_catalog_select');
            } finally {
              setConnecting(false);
            }
          }
        }
      } catch { /* non-JSON messages ignored */ }
    };
    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, [withCatalog, fetchAccounts]);

  // ── Launch Meta Embedded Signup Popup ───────────────────────────────────────
  const launchEmbeddedSignup = () => {
    if (!appId || !configId) {
      notify.error('Meta App ID and Configuration ID are required. Go to Settings → Meta App Setup.');
      return;
    }
    if (!fbReady || !window.FB) {
      notify.error('Facebook SDK is not loaded yet. Please wait a moment and try again.');
      return;
    }

    setConnecting(true);
    setView('embedded_connecting');
    metaSessionRef.current = { phoneNumberId: null, wabaId: null, code: null };

    // Safety timeout: reset state after 2 minutes if nothing happens
    const safetyTimer = setTimeout(() => {
      setConnecting(false);
      setView('embedded_catalog_select');
      notify.info('Signup popup timed out. Please try again.');
    }, 120_000);

    try {
      window.FB.login(
        (response) => {
          clearTimeout(safetyTimer);
          if (response?.authResponse) {
            const code = response.authResponse.code;
            const token = response.authResponse.accessToken;
            metaSessionRef.current.code = code || token;

            setView('embedded_connecting');
            channelAPI.addWhatsAppEmbedded({
              code: code || undefined,
              accessToken: token || undefined,
              phoneNumberId: metaSessionRef.current.phoneNumberId || undefined,
              wabaId: metaSessionRef.current.wabaId || undefined,
              name: withCatalog ? 'WhatsApp Commerce Account' : 'WhatsApp Business Number',
              withCatalog,
            })
              .then(() => {
                notify.success('WhatsApp connected and activated successfully!');
                setView('list');
                fetchAccounts();
              })
              .catch((err) => {
                notify.error(err?.response?.data?.message || 'Failed to complete WhatsApp connection.');
                setView('embedded_catalog_select');
              })
              .finally(() => setConnecting(false));
          } else {
            clearTimeout(safetyTimer);
            setConnecting(false);
            setView('embedded_catalog_select');
            if (response?.status !== 'unknown') notify.info('Embedded Signup was cancelled.');
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            sessionInfoVersion: 3,
            // Catalog mode uses additional commerce permissions
            ...(withCatalog ? { featureType: 'catalog' } : {}),
            // Coexistence mode keeps existing WhatsApp app active
            ...(onboardingType === 'coexistence' ? { featureType: 'coexistence' } : {}),
          },
        }
      );
    } catch (err) {
      clearTimeout(safetyTimer);
      setConnecting(false);
      setView('embedded_catalog_select');
      console.error('FB.login error:', err);
      notify.error('Could not launch Meta signup. Please check your Meta App settings.');
    }
  };

  // ── Manual Form Submit ──────────────────────────────────────────────────────
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await channelAPI.addWhatsApp({
        ...manualForm,
        verifyToken: manualForm.verifyToken || `verify_${Date.now()}`,
      });
      notify.success('WhatsApp account connected successfully!');
      setManualForm({ name: '', waPhoneNumberId: '', waDisplayPhone: '', waBusinessAccId: '', accessToken: '', verifyToken: '' });
      setView('list');
      fetchAccounts();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to connect WhatsApp');
    } finally {
      setConnecting(false);
    }
  };

  // ── Activate (Register) Number ─────────────────────────────────────────────
  const openActivateModal = (acc) => {
    setActivateForm({
      pin: '',
      accessToken: (acc.access_token && acc.access_token !== 'embedded_token' && acc.access_token !== 'manual_placeholder')
        ? acc.access_token : '',
    });
    setActivateModal(acc);
  };

  const handleActivateSubmit = async (e) => {
    e.preventDefault();
    if (activateForm.pin.length < 6) { notify.error('Enter a valid 6-digit PIN.'); return; }
    if (activateForm.accessToken?.trim() && !activateForm.accessToken.trim().startsWith('EAA')) {
      showAlert.error('Invalid Token', 'Meta Access Tokens always start with "EAA...". Copy from Meta App Dashboard → WhatsApp → API Setup.');
      return;
    }
    setActivating(true);
    try {
      const res = await channelAPI.registerWhatsApp(
        activateModal.id,
        activateForm.pin,
        activateForm.accessToken?.trim() || undefined
      );
      showAlert.success('WhatsApp Activated!', res.data?.message || 'Phone number registered and activated!');
      setActivateModal(null);
      fetchAccounts();
    } catch (err) {
      showAlert.error('Activation Failed', err.response?.data?.message || 'Check your access token and PIN.');
    } finally {
      setActivating(false);
    }
  };

  // ── Delete Account ──────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    const ok = await showAlert.confirm({
      title: 'Disconnect WhatsApp Number?',
      text: 'Bot flows and live chat for this number will stop.',
      confirmButtonText: 'Yes, Disconnect',
    });
    if (!ok) return;
    try {
      await channelAPI.deleteWhatsApp(id);
      notify.success('WhatsApp account disconnected');
      fetchAccounts();
    } catch { notify.error('Failed to remove account'); }
  };

  // ── Reset to list view ──────────────────────────────────────────────────────
  const goBack = () => setView('list');

  // ════════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ════════════════════════════════════════════════════════════════════════════

  // ── VIEW: Choose Method ─────────────────────────────────────────────────────
  const ChooseMethodView = () => (
    <div>
      {/* Back */}
      <button onClick={goBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back to Accounts
      </button>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
        Connect WhatsApp
      </h2>
      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 24px' }}>
        Choose how you want to connect your WhatsApp Business number to this workspace.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* Manual / Cloud API */}
        <div
          onClick={() => setView('manual')}
          style={{
            border: '2px solid #e2e8f0', borderRadius: 14, padding: '24px 22px',
            cursor: 'pointer', background: '#fff', transition: 'all 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(100,116,139,0.1)', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Key size={22} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
              Manual / API
            </span>
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Manual Cloud API Setup
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              For developers who already have a WhatsApp Business Account. Enter your Phone Number ID, Business Account ID and Access Token directly.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Direct credential entry', 'Pre-configured Webhook URL & Verify Token', 'Works with existing WABA'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#475569' }}>
                  <Check size={13} color="#64748b" /> {f}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginTop: 'auto' }}>
            Manual Setup <ArrowRight size={14} />
          </div>
        </div>

        {/* Embedded Signup */}
        <div
          onClick={() => setView('embedded_catalog_select')}
          style={{
            border: '2px solid #bbf7d0', borderRadius: 14, padding: '24px 22px',
            cursor: 'pointer', background: '#fff', transition: 'all 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
            boxShadow: '0 2px 8px rgba(37,211,102,0.06)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#25d366'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,211,102,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#bbf7d0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,211,102,0.06)'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(37,211,102,0.12)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(37,211,102,0.1)', color: '#16a34a', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
              ⭐ Recommended
            </span>
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Embedded Signup (Meta OAuth)
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              Official Meta OAuth flow. Connect in minutes — Meta guides you through selecting your Business Portfolio, verifying your number, and granting permissions automatically.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Guided Meta OAuth wizard', 'Auto webhook & token setup', 'Optional: With or Without Catalog'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#16a34a' }}>
                  <Check size={13} color="#25d366" /> {f}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#16a34a', marginTop: 'auto' }}>
            Start Embedded Signup <ArrowRight size={14} />
          </div>
        </div>

      </div>
    </div>
  );

  // ── VIEW: Manual Setup ──────────────────────────────────────────────────────
  const ManualView = () => {
    // Generate a default verify token once for this form session
    const [defaultVerifyToken] = useState(`verify_${user?.agencyId || 'token'}_${Math.random().toString(36).slice(2, 9)}`);
    const vt = manualForm.verifyToken || defaultVerifyToken;

    return (
      <div style={{ maxWidth: 560 }}>
        <button onClick={() => setView('choose_method')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(100,116,139,0.1)', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Manual Cloud API Setup</h2>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>Enter credentials from your Meta WhatsApp Business account</p>
          </div>
        </div>

        {/* Webhook info banner */}
        <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.8rem', color: '#4f46e5', marginBottom: 8 }}>
            <Shield size={14} /> Webhook Configuration — Copy these into your Meta Dashboard
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ReadonlyField
              label="Webhook Callback URL"
              value={webhookUrl}
              hint="Paste this URL in Meta App Dashboard → WhatsApp → Configuration → Webhook"
            />
            <ReadonlyField
              label="Verify Token"
              value={vt}
              hint="Copy this and paste it as the Verify Token in Meta Dashboard. Save it — it must match."
            />
          </div>
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.72rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}
          >
            Open Meta App Dashboard <ExternalLink size={11} />
          </a>
        </div>

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Account Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              required
              className="form-input w-full"
              placeholder="e.g. Sales Support WA"
              value={manualForm.name}
              onChange={e => setManualForm(p => ({ ...p, name: e.target.value }))}
              style={{ height: 36, fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Phone Number ID <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              required
              className="form-input w-full"
              placeholder="e.g. 109283746501928"
              value={manualForm.waPhoneNumberId}
              onChange={e => setManualForm(p => ({ ...p, waPhoneNumberId: e.target.value }))}
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
            />
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
              Found in Meta → WhatsApp → API Setup
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                WhatsApp Number
              </label>
              <input
                className="form-input w-full"
                placeholder="e.g. +8801XXXXXXXXX"
                value={manualForm.waDisplayPhone}
                onChange={e => setManualForm(p => ({ ...p, waDisplayPhone: e.target.value }))}
                style={{ height: 36, fontSize: '0.84rem' }}
              />
              <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
                The actual phone number shown to users
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                WhatsApp Business Account ID
              </label>
              <input
                className="form-input w-full"
                placeholder="e.g. 987654321012345"
                value={manualForm.waBusinessAccId}
                onChange={e => setManualForm(p => ({ ...p, waBusinessAccId: e.target.value }))}
                style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
              />
              <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
                Found in Meta → WhatsApp → Overview
              </p>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                Access Token <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.7rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}
              >
                Get Token <ExternalLink size={10} />
              </a>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                required
                type={showToken ? 'text' : 'password'}
                className="form-input w-full"
                placeholder="EAAG... (starts with EAA)"
                value={manualForm.accessToken}
                onChange={e => setManualForm(p => ({ ...p, accessToken: e.target.value }))}
                style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace', paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
              Paste your Permanent System User Access Token from Meta App Dashboard → WhatsApp → API Setup
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Verify Token
            </label>
            <input
              className="form-input w-full"
              placeholder={defaultVerifyToken}
              value={manualForm.verifyToken}
              onChange={e => setManualForm(p => ({ ...p, verifyToken: e.target.value }))}
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
            />
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
              Leave blank to auto-generate. This must match what you put in Meta Dashboard webhook settings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setView('choose_method')} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="btn btn-primary btn-sm"
              style={{ background: '#0f172a', borderColor: '#0f172a', fontWeight: 700, minWidth: 120 }}
            >
              {connecting ? 'Connecting...' : 'Connect WhatsApp'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  // ── VIEW: Embedded Signup — Choose Catalog mode ─────────────────────────────
  const EmbeddedCatalogSelectView = () => (
    <div style={{ maxWidth: 560 }}>
      <button onClick={() => setView('choose_method')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(37,211,102,0.12)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={18} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Embedded Signup</h2>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>Official Meta OAuth onboarding flow</p>
        </div>
      </div>

      {/* Onboarding type */}
      <div style={{ margin: '20px 0 16px' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          Step 1 — Onboarding Type
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div
            onClick={() => setOnboardingType('new_number')}
            style={{
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: onboardingType === 'new_number' ? '2px solid #25d366' : '1px solid #e2e8f0',
              background: onboardingType === 'new_number' ? '#f0fdf4' : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginBottom: 4 }}>
              <Smartphone size={14} color="#16a34a" /> New Phone Number
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
              Add a new dedicated number for Cloud API.
            </span>
          </div>
          <div
            onClick={() => setOnboardingType('coexistence')}
            style={{
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: onboardingType === 'coexistence' ? '2px solid #6366f1' : '1px solid #e2e8f0',
              background: onboardingType === 'coexistence' ? '#eef2ff' : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginBottom: 4 }}>
              <Repeat size={14} color="#4f46e5" /> WhatsApp Coexistence
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
              Keep the WA app working while running chatbot automation.
            </span>
          </div>
        </div>
      </div>

      {/* Catalog selection */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          Step 2 — Choose Catalog Option
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Without Catalog */}
          <div
            onClick={() => setWithCatalog(false)}
            style={{
              padding: '16px', borderRadius: 10, cursor: 'pointer',
              border: !withCatalog ? '2px solid #25d366' : '1px solid #e2e8f0',
              background: !withCatalog ? '#f0fdf4' : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(37,211,102,0.12)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={15} />
              </div>
              {!withCatalog && <Check size={14} color="#16a34a" />}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginBottom: 4 }}>
              Without Catalog
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
              Customer support, bot flows, live chat. No commerce permissions.
            </p>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {['whatsapp_business_management', 'whatsapp_business_messaging'].map(s => (
                <code key={s} style={{ fontSize: '0.62rem', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, color: '#475569' }}>{s}</code>
              ))}
            </div>
          </div>

          {/* With Catalog */}
          <div
            onClick={() => setWithCatalog(true)}
            style={{
              padding: '16px', borderRadius: 10, cursor: 'pointer',
              border: withCatalog ? '2px solid #6366f1' : '1px solid #e2e8f0',
              background: withCatalog ? '#eef2ff' : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={15} />
              </div>
              {withCatalog && <Check size={14} color="#4f46e5" />}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginBottom: 4 }}>
              With Catalog
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
              Includes product catalog, interactive product cards, and cart checkout.
            </p>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {['whatsapp_business_management', 'whatsapp_business_messaging', 'catalog_management', 'business_management'].map(s => (
                <code key={s} style={{ fontSize: '0.62rem', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, color: withCatalog ? '#4f46e5' : '#475569' }}>{s}</code>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SDK missing warning */}
      {(!appId || !configId) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.78rem', color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            Meta App ID or Configuration ID is missing. Go to{' '}
            <strong>Settings → Meta App Setup</strong> to configure them before using Embedded Signup.
          </span>
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={launchEmbeddedSignup}
        disabled={connecting || !appId || !configId}
        style={{
          width: '100%', padding: '13px 18px', borderRadius: 10,
          background: withCatalog ? '#6366f1' : '#25d366',
          color: '#ffffff', border: 'none', fontWeight: 800, fontSize: '0.94rem',
          cursor: (connecting || !appId || !configId) ? 'not-allowed' : 'pointer',
          opacity: (connecting || !appId || !configId) ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: withCatalog ? '0 4px 14px rgba(99,102,241,0.3)' : '0 4px 14px rgba(37,211,102,0.3)',
        }}
      >
        <Building2 size={18} />
        Launch Meta Embedded Signup
        <ArrowRight size={16} />
      </button>
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
        A secure Meta popup will open. Follow the steps to connect your WhatsApp Business account.
      </p>
    </div>
  );

  // ── VIEW: Embedded Connecting (spinner) ─────────────────────────────────────
  const EmbeddedConnectingView = () => (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div className="loading-spinner" style={{ margin: '0 auto 20px', width: 40, height: 40 }} />
      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
        Completing WhatsApp Connection…
      </h3>
      <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
        Exchanging tokens, discovering your WABA, and subscribing webhooks with Meta. Please wait.
      </p>
    </div>
  );

  // ── VIEW: Account List ──────────────────────────────────────────────────────
  const AccountListView = () => (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(37,211,102,0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={20} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              WhatsApp
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
            Connect WhatsApp Business numbers to receive and send messages via this workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchAccounts} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setView('choose_method')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,211,102,0.25)' }}
          >
            <Plus size={15} /> Connect Number
          </button>
        </div>
      </div>

      {/* Connected Numbers Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Connected WhatsApp Numbers</h2>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0' }}>WhatsApp Cloud API accounts for this workspace</p>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(37,211,102,0.1)', color: '#25d366' }}>
            {accounts.length} Connected
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>WhatsApp Number / ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>WABA ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Method</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Webhook URL</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    Loading accounts...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <MessageCircle size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No WhatsApp Accounts Connected</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Click "Connect Number" to add your first WhatsApp Business number.</p>
                    <button
                      onClick={() => setView('choose_method')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> Connect Now
                    </button>
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr
                    key={acc.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfe')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,211,102,0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MessageCircle size={14} />
                        </span>
                        <div>
                          <div>{acc.name || 'WhatsApp Business'}</div>
                          {acc.with_catalog ? (
                            <span style={{ fontSize: '0.65rem', background: 'rgba(99,102,241,0.1)', color: '#4f46e5', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>
                              With Catalog
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      <div>
                        {acc.wa_display_phone && (
                          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                            {acc.wa_display_phone}
                          </div>
                        )}
                        <div style={{ color: acc.wa_display_phone ? '#94a3b8' : '#64748b', fontSize: acc.wa_display_phone ? '0.7rem' : '0.78rem' }}>
                          {acc.wa_phone_number_id || '—'}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {acc.wa_business_acc_id || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {acc.connection_method === 'EMBEDDED' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(37,211,102,0.1)', color: '#16a34a', padding: '2px 7px', borderRadius: 8 }}>
                          <Zap size={10} /> Embedded
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 8 }}>
                          <Key size={10} /> Manual
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <CopyButton value={webhookUrl} label="Copy Webhook" />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <StatusBadge label="Connected" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => openActivateModal(acc)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: '0.72rem', background: 'rgba(37,211,102,0.08)', borderColor: 'rgba(37,211,102,0.3)', color: '#16a34a', fontWeight: 700 }}
                          title="Register / Activate phone number with Meta"
                        >
                          <Zap size={11} /> Activate
                        </button>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
                          title="Disconnect"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // ACTIVATE MODAL (shared across all views)
  // ════════════════════════════════════════════════════════════════════════════
  const ActivateModal = () => (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={() => !activating && setActivateModal(null)}
    >
      <div
        style={{ width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, boxShadow: '0 24px 48px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ background: 'linear-gradient(135deg,#25d366 0%,#128c7e 100%)', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={20} color="#fff" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Activate WhatsApp Number</div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{activateModal.name}</div>
            </div>
          </div>
          <button onClick={() => setActivateModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleActivateSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', color: '#166534', lineHeight: 1.6 }}>
            📱 <strong>Phone Number ID:</strong>{' '}
            <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>{activateModal.wa_phone_number_id}</code>
            <div style={{ marginTop: 6 }}>
              Enter a <strong>6-digit PIN</strong> of your choice. Meta uses this for 2-step verification — <strong>save it</strong> somewhere safe.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, textAlign: 'center' }}>
              Create a 6-Digit Registration PIN
            </label>
            <input
              ref={pinInputRef}
              className="form-input"
              type="tel"
              inputMode="numeric"
              maxLength={6}
              placeholder="• • • • • •"
              value={activateForm.pin}
              onChange={e => setActivateForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              style={{ fontSize: '1.6rem', letterSpacing: '0.5em', fontWeight: 700, textAlign: 'center', padding: '10px 16px', width: '100%', boxSizing: 'border-box' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#64748b', textAlign: 'center' }}>
              {activateForm.pin.length}/6 digits
            </p>
          </div>

          {/* Show token field only if not yet set */}
          {(!activateModal.access_token || activateModal.access_token === 'embedded_token' || activateModal.access_token === 'manual_placeholder') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                  Meta Access Token <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                  Get Token →
                </a>
              </div>
              <input
                className="form-input"
                type="password"
                placeholder="EAA... (from Meta WhatsApp API Setup)"
                value={activateForm.accessToken}
                onChange={e => setActivateForm(p => ({ ...p, accessToken: e.target.value }))}
                style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                Meta → WhatsApp → API Setup → Access Token. It will be saved for future use.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setActivateModal(null)} disabled={activating} className="btn btn-secondary" style={{ minWidth: 80 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={activating || activateForm.pin.length < 6}
              className="btn btn-primary"
              style={{ minWidth: 140, background: '#25d366', borderColor: '#25d366', fontWeight: 700 }}
            >
              {activating
                ? <><span className="loading-spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', marginRight: 8 }} />Activating…</>
                : <><Zap size={14} style={{ marginRight: 6 }} />Activate Number</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  const pageContent = (
    <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
      {view === 'list' && <AccountListView />}
      {view === 'choose_method' && <ChooseMethodView />}
      {view === 'manual' && <ManualView />}
      {view === 'embedded_catalog_select' && <EmbeddedCatalogSelectView />}
      {view === 'embedded_connecting' && <EmbeddedConnectingView />}

      {/* Activate Modal */}
      {activateModal && <ActivateModal />}
    </div>
  );

  if (embedded) return pageContent;
  return <AppLayout>{pageContent}</AppLayout>;
}
