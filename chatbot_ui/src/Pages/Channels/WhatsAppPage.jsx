import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI, metaAppAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { showAlert, notify, handleLimitError } from '../../utils/alerts';
import { getBackendOrigin } from '../../utils/assetUrl';
import {
  MessageCircle,
  Plus,
  CheckCircle2,
  Trash2,
  Zap,
  Key,
  RefreshCw,
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
  Star,
  X,
  BookOpen,
} from 'lucide-react';

// Target of the "Tutorial" button on the Connect WhatsApp screen. Point this
// at the specific post (e.g. '/blog/connect-whatsapp-cloud-api') once it's
// written — until then it lands on the blog index.
const WHATSAPP_TUTORIAL_URL = '/blog';

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

// Numbered heading for the two halves of manual setup — the order matters
// (credentials first, then the webhook that points Meta back at them), so
// the steps are numbered rather than decorated with icons.
function StepHeading({ step, title, subtitle }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: '#0f172a', color: '#fff', fontSize: '0.72rem', fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
      }}>
        {step}
      </span>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.45 }}>{subtitle}</p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge & WA Metric Formatters
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

function formatQuality(rating) {
  const r = (rating || '').toUpperCase();
  if (r === 'GREEN') {
    return { label: 'High', color: '#16a34a', bg: 'rgba(22,163,74,0.1)', border: 'rgba(22,163,74,0.2)' };
  }
  if (r === 'YELLOW') {
    return { label: 'Medium', color: '#d97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.2)' };
  }
  if (r === 'RED') {
    return { label: 'Low', color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.2)' };
  }
  return { label: rating || 'Unrated', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
}

function formatMessagingLimit(tier) {
  if (!tier) return '250 / 24h';
  const t = tier.toUpperCase();
  if (t === 'TIER_50') return '50 / 24h';
  if (t === 'TIER_250') return '250 / 24h';
  if (t === 'TIER_1K') return '1K / 24h';
  if (t === 'TIER_10K') return '10K / 24h';
  if (t === 'TIER_100K') return '100K / 24h';
  if (t === 'TIER_UNLIMITED') return 'Unlimited';
  return t.replace('TIER_', '') + ' / 24h';
}

function formatMMStatus(status) {
  const s = (status || 'ELIGIBLE').toUpperCase();
  if (s === 'ELIGIBLE' || s === 'ACTIVE') {
    return { label: 'Eligible', color: '#059669', bg: 'rgba(5,150,105,0.1)', border: 'rgba(5,150,105,0.2)' };
  }
  if (s === 'PAUSED') {
    return { label: 'Paused', color: '#d97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.2)' };
  }
  if (s === 'RESTRICTED') {
    return { label: 'Restricted', color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.2)' };
  }
  return { label: s, color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)' };
}

function formatLastSync(dateString) {
  if (!dateString) return 'Never';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'Never';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppPage({ embedded = false }) {
  const { user } = useAuth();
  const { fbReady, appId, configId, configIdCatalog } = useFacebookSDK('WHATSAPP');

  // Data
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  // UI flow state
  // 'list' | 'choose_method' | 'manual' | 'embedded_catalog_select' | 'embedded_connecting'
  const [view, setView] = useState('list');
  const [connecting, setConnecting] = useState(false);

  // Embedded signup state
  const [withCatalog, setWithCatalog] = useState(false);
  const [onboardingType, setOnboardingType] = useState('new_number'); // 'new_number' | 'coexistence'
  const metaSessionRef = useRef({ phoneNumberId: null, wabaId: null, code: null });

  // Per Meta's own Embedded Signup guidance, catalog access should come
  // from a SEPARATE Configuration (one that actually has the Catalogs
  // asset/permission granted) rather than a runtime flag layered on top of
  // the plain one — bundling catalog into a shared config makes non-catalog
  // customers hit an unexpected catalog-selection screen. So which
  // Configuration ID gets used depends on the Step 2 choice below.
  const effectiveConfigId = withCatalog ? configIdCatalog : configId;

  // Manual form — only the Business Account ID + Access Token are actually
  // needed; the backend resolves the phone number (and its display name)
  // from Meta's Graph API using those two.
  const [manualForm, setManualForm] = useState({
    waBusinessAccId: '',
    accessToken: '',
    appSecret: '',
    verifyToken: '',
  });
  const [showToken, setShowToken] = useState(false);

  // Edit Credentials modal
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ accessToken: '' });
  const [showEditToken, setShowEditToken] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Activate / Register modal
  const [activateModal, setActivateModal] = useState(null);
  const [activateForm, setActivateForm] = useState({ pin: '', accessToken: '' });
  const [activating, setActivating] = useState(false);
  const pinInputRef = useRef(null);

  // The webhook URL/verify token shown here must match /settings/meta-app's
  // agency-level webhook config exactly — both hit the same
  // POST /api/v1/webhook/:agencyId endpoint, verified against the SAME
  // meta_app_settings.verify_token. Previously this page generated its own
  // random verify token, which almost never matched what was actually saved
  // in Meta's Dashboard, causing every webhook POST to look "unconfigured".
  // The host is taken from the page's own origin when it's already public
  // (https, i.e. served through the tunnel/domain Meta can reach).
  const publicDomain = window.location.protocol === 'https:' ? window.location.origin : getBackendOrigin();
  const [agencyVerifyToken, setAgencyVerifyToken] = useState('');
  // Fallback verify token, generated once per page session and only used when
  // the agency has none configured on /settings/meta-app. Lives here rather
  // than inside ManualView so that view stays hook-free (see its comment).
  const [fallbackVerifyToken] = useState(() => `verify_${user?.agencyId || 'token'}_${Math.random().toString(36).slice(2, 9)}`);
  useEffect(() => {
    metaAppAPI.get()
      .then(res => {
        const token = res.data?.settings?.verify_token || res.data?.generatedVerifyToken;
        if (token) setAgencyVerifyToken(token);
      })
      .catch(() => {});
  }, []);

  // Derived values
  const cleanPublicDomain = publicDomain.trim().replace(/\/+$/, '');
  const webhookUrl = `${cleanPublicDomain}/api/v1/webhook/${user?.agencyId || '{agencyId}'}`;

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

  // ── Sync individual account metrics with Meta Cloud API ───────────────────────
  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      const res = await channelAPI.syncWhatsApp(id);
      if (res.data?.account) {
        setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...res.data.account } : a));
      } else {
        await fetchAccounts();
      }
      notify.success('WhatsApp metrics synced successfully with Meta');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to sync with Meta');
    } finally {
      setSyncingId(null);
    }
  };

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
    if (!appId || !effectiveConfigId) {
      notify.error(
        withCatalog
          ? 'No "With Catalog" Configuration ID is set up yet. Go to App Integrations → WhatsApp App and add one — catalog access needs its own Configuration, separate from the plain one.'
          : 'Meta App ID and Configuration ID are required. Go to App Integrations → WhatsApp App.'
      );
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
                if (!handleLimitError(err, { userRole: user?.role })) {
                  notify.error(err?.response?.data?.message || 'Failed to complete WhatsApp connection.');
                }
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
          // The With/Without Catalog choice is now which Configuration we
          // use, not a runtime flag — see effectiveConfigId above.
          config_id: effectiveConfigId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            sessionInfoVersion: 3,
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
  const handleManualSubmit = async (e, vt) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await channelAPI.addWhatsApp({
        waBusinessAccId: manualForm.waBusinessAccId,
        accessToken: manualForm.accessToken,
        verifyToken: vt || manualForm.verifyToken || agencyVerifyToken || `verify_${Date.now()}`,
      });
      notify.success('WhatsApp account connected successfully!');
      setManualForm({ waBusinessAccId: '', accessToken: '', appSecret: '', verifyToken: '' });
      setView('list');
      fetchAccounts();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        notify.error(err?.response?.data?.message || 'Failed to connect WhatsApp');
      }
    } finally {
      setConnecting(false);
    }
  };

  // ── Edit Credentials Modal ─────────────────────────────────────────────────
  const openEditModal = (acc) => {
    setEditForm({
      accessToken: (acc.access_token && acc.access_token !== 'embedded_token' && acc.access_token !== 'manual_placeholder')
        ? acc.access_token : '',
    });
    setEditModal(acc);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await channelAPI.updateWhatsAppCredentials(editModal.id, {
        accessToken: editForm.accessToken,
      });
      notify.success('WhatsApp Access Token updated successfully!');
      setEditModal(null);
      fetchAccounts();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to update credentials');
    } finally {
      setSavingEdit(false);
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
              For developers who already have a WhatsApp Business Account. Enter your Business Account ID and Access Token — the phone number is detected automatically.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Direct credential entry', 'Pre-configured Webhook URL & Verify Token', 'Works with existing WABA'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#475569' }}>
                  <Check size={13} color="#64748b" /> {f}
                </div>
              ))}
            </div>
          </div>
          {/* stopPropagation on both: the whole card is clickable, and the
              Tutorial link must open the guide without also switching views. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setView('manual'); }}
              style={{
                flex: 1, height: 38, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: '#0f172a', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
              }}
            >
              Manual Setup
            </button>
            <a
              href={WHATSAPP_TUTORIAL_URL}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #cbd5e1',
                background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: 700,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              <BookOpen size={14} /> Tutorial
            </a>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(37,211,102,0.1)', color: '#16a34a', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
              <Star size={11} fill="currentColor" /> Recommended
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
          <div style={{ marginTop: 'auto' }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setView('embedded_catalog_select'); }}
              style={{
                width: '100%', height: 38, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: '#25d366', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
              }}
            >
              Start Embedded Signup
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  // ── VIEW: Manual Setup ──────────────────────────────────────────────────────
  // Invoked as a plain function, never used as a JSX element: a component
  // declared inside another component gets a new identity on every render,
  // so React unmounts and remounts the whole subtree on each keystroke and
  // the focused input goes dead after one character. Calling it inlines the
  // JSX into this component's own output, keeping the inputs mounted.
  const ManualView = () => {
    const vt = agencyVerifyToken || fallbackVerifyToken;

    return (
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <button
          onClick={() => setView('choose_method')}
          style={{
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem',
            fontWeight: 600, marginBottom: 18, padding: 0,
          }}
        >
          <ArrowLeft size={15} /> Back to connection methods
        </button>

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Manual Cloud API Setup
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, maxWidth: 620 }}>
            Connect an existing WhatsApp Business Account in two steps: enter your credentials, then point Meta&apos;s
            webhook back at this workspace. Your phone number is detected automatically.
          </p>
        </div>

        {/* Side-by-side grid: Left = Form, Right = Webhook config */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 24,
          alignItems: 'start',
        }}>
          {/* Left: Credentials Form */}
          <div style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            padding: 24,
          }}>
            <StepHeading
              step={1}
              title="Account credentials"
              subtitle="From Meta App Dashboard → WhatsApp → API Setup."
            />

            <form onSubmit={(e) => handleManualSubmit(e, vt)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  WhatsApp Business Account ID <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  required
                  className="form-input w-full"
                  placeholder="e.g. 987654321012345"
                  value={manualForm.waBusinessAccId}
                  onChange={e => setManualForm(p => ({ ...p, waBusinessAccId: e.target.value }))}
                  style={{ height: 38, fontSize: '0.84rem', fontFamily: 'monospace' }}
                />
                <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                  Found in Meta App Dashboard → WhatsApp → Overview or API Setup.
                </p>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    Access Token <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}
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
                    style={{ height: 38, fontSize: '0.84rem', fontFamily: 'monospace', paddingRight: 38 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                  Paste your Permanent System User Access Token from Meta App Dashboard → WhatsApp → API Setup.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #f1f5f9', marginTop: 4 }}>
                <button type="button" onClick={() => setView('choose_method')} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connecting}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#0f172a', borderColor: '#0f172a', fontWeight: 700, minWidth: 130 }}
                >
                  {connecting ? 'Connecting...' : 'Connect WhatsApp'}
                </button>
              </div>
            </form>
          </div>

          {/* Right: webhook values to paste into Meta */}
          <div style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            padding: 24,
          }}>
            <StepHeading
              step={2}
              title="Point Meta's webhook here"
              subtitle="In Meta App Dashboard → WhatsApp → Configuration → Webhook, click Edit and paste both values below."
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ReadonlyField label="Callback URL" value={webhookUrl} />
              <ReadonlyField label="Verify Token" value={vt} />

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                  Then subscribe to messages
                </p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: 1.6 }}>
                  Still under Configuration, find <strong style={{ color: '#334155' }}>Webhook fields</strong>, click{' '}
                  <strong style={{ color: '#334155' }}>Manage</strong> and tick{' '}
                  <strong style={{ color: '#334155' }}>messages</strong>. Without this Meta verifies the URL but never
                  sends anything to it, so no conversations reach your inbox.
                </p>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12,
                    fontSize: '0.78rem', color: '#334155', textDecoration: 'none', fontWeight: 700,
                    border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 12px',
                  }}
                >
                  Open Meta App Dashboard <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
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
            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              With Catalog
              {!configIdCatalog && (
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#b45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5, padding: '1px 6px' }}>
                  Not set up
                </span>
              )}
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
      {(!appId || !effectiveConfigId) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.78rem', color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            {!appId || !configId ? (
              <>Meta App ID or Configuration ID is missing. Go to{' '}
                <strong>Settings → Meta App Setup</strong> to configure them before using Embedded Signup.</>
            ) : (
              <>The <strong>With Catalog</strong> Configuration ID isn't set up yet — it needs its own Configuration
                (separate from the plain one) in <strong>Settings → Meta App Setup</strong>, or switch to{' '}
                <strong>Without Catalog</strong> above.</>
            )}
          </span>
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={launchEmbeddedSignup}
        disabled={connecting || !appId || !effectiveConfigId}
        style={{
          width: '100%', padding: '13px 18px', borderRadius: 10,
          background: withCatalog ? '#6366f1' : '#25d366',
          color: '#ffffff', border: 'none', fontWeight: 800, fontSize: '0.94rem',
          cursor: (connecting || !appId || !effectiveConfigId) ? 'not-allowed' : 'pointer',
          opacity: (connecting || !appId || !effectiveConfigId) ? 0.6 : 1,
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
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Quality</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Messaging Limit</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>MM Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Last Sync</th>
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
                    {/* Account Info */}
                    <td style={{ padding: '12px 14px', color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(37,211,102,0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MessageCircle size={16} />
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {acc.name || 'WhatsApp Business'}
                            {acc.connection_method === 'EMBEDDED' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(37,211,102,0.1)', color: '#16a34a', padding: '1px 6px', borderRadius: 6 }}>
                                <Zap size={9} /> Embedded
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontWeight: 700, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 6 }}>
                                <Key size={9} /> Manual
                              </span>
                            )}
                            {acc.with_catalog ? (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(99,102,241,0.1)', color: '#4f46e5', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>
                                Catalog
                              </span>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace' }}>
                            <span style={{ fontWeight: 600, color: '#334155' }}>{acc.wa_display_phone || acc.wa_phone_number_id || '—'}</span>
                            {acc.wa_business_acc_id && (
                              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                (WABA: {acc.wa_business_acc_id})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      {acc.is_active ? (
                        <StatusBadge label="Connected" color="#10b981" bg="rgba(16,185,129,0.1)" />
                      ) : (
                        <StatusBadge label="Inactive" color="#ef4444" bg="rgba(239,68,68,0.1)" />
                      )}
                    </td>

                    {/* Quality */}
                    <td style={{ padding: '12px 14px' }}>
                      {(() => {
                        const q = formatQuality(acc.wa_quality_rating);
                        return (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: '0.73rem', fontWeight: 700, color: q.color,
                            background: q.bg, border: `1px solid ${q.border}`,
                            padding: '2px 8px', borderRadius: 10,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: q.color }} />
                            {q.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Messaging Limit */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: '0.73rem', fontWeight: 700, color: '#0f172a',
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace',
                      }}>
                        {formatMessagingLimit(acc.wa_messaging_limit)}
                      </span>
                    </td>

                    {/* MM Status */}
                    <td style={{ padding: '12px 14px' }}>
                      {(() => {
                        const mm = formatMMStatus(acc.wa_mm_status);
                        return (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            fontSize: '0.72rem', fontWeight: 700, color: mm.color,
                            background: mm.bg, border: `1px solid ${mm.border}`,
                            padding: '2px 8px', borderRadius: 10,
                          }}>
                            {mm.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Last Sync */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          {formatLastSync(acc.wa_last_sync_at)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSync(acc.id)}
                          disabled={syncingId === acc.id}
                          style={{
                            border: '1px solid #e2e8f0', background: '#f8fafc',
                            color: syncingId === acc.id ? '#10b981' : '#64748b',
                            borderRadius: 6, padding: '3px 6px',
                            cursor: syncingId === acc.id ? 'default' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          title="Sync metrics with Meta"
                        >
                          <RefreshCw size={11} className={syncingId === acc.id ? 'spin' : ''} />
                        </button>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <a
                          href={acc.wa_business_acc_id
                            ? `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${acc.wa_business_acc_id}`
                            : 'https://business.facebook.com/wa/manage/phone-numbers/'}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: '0.72rem', background: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.3)', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}
                          title="Open this number in WhatsApp Manager — enable Calling, check quality rating, and more"
                        >
                          <ExternalLink size={11} /> Manage
                        </a>
                        <button
                          onClick={() => openEditModal(acc)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: '0.72rem', background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)', color: '#4f46e5', fontWeight: 700 }}
                          title="Update Access Token"
                        >
                          <Key size={11} /> Token
                        </button>
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
          <button onClick={() => setActivateModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleActivateSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', color: '#166534', lineHeight: 1.6 }}>
            <Smartphone size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> <strong>Phone Number ID:</strong>{' '}
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

  // ── Edit Credentials Modal ─────────────────────────────────────────────────
  const EditCredentialsModal = () => (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={20} color="#fff" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Update WhatsApp Access Token</div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{editModal.name}</div>
            </div>
          </div>
          <button onClick={() => setEditModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleEditSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: '0.75rem', color: '#475569' }}>
            <div><strong>Phone Number ID:</strong> <code style={{ fontFamily: 'monospace' }}>{editModal.wa_phone_number_id}</code></div>
            {editModal.wa_business_acc_id && <div style={{ marginTop: 4 }}><strong>WABA ID:</strong> <code style={{ fontFamily: 'monospace' }}>{editModal.wa_business_acc_id}</code></div>}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                Access Token (System User or WhatsApp Token)
              </label>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                Get Token <ExternalLink size={10} />
              </a>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showEditToken ? 'text' : 'password'}
                className="form-input w-full"
                placeholder="EAA... (starts with EAA)"
                value={editForm.accessToken}
                onChange={e => setEditForm(p => ({ ...p, accessToken: e.target.value }))}
                style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace', paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowEditToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
              >
                {showEditToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setEditModal(null)} disabled={savingEdit} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit || !editForm.accessToken}
              className="btn btn-primary btn-sm"
              style={{ background: '#0f172a', borderColor: '#0f172a', fontWeight: 700, minWidth: 120 }}
            >
              {savingEdit ? 'Updating…' : 'Update Token'}
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
      {!embedded && <ChannelBreadcrumb current="WhatsApp" />}
      {view === 'list' && AccountListView()}
      {view === 'choose_method' && ChooseMethodView()}
      {view === 'manual' && ManualView()}
      {view === 'embedded_catalog_select' && EmbeddedCatalogSelectView()}
      {view === 'embedded_connecting' && EmbeddedConnectingView()}

      {/* Edit Credentials Modal */}
      {editModal && EditCredentialsModal()}

      {/* Activate Modal */}
      {activateModal && ActivateModal()}
    </div>
  );

  if (embedded) return pageContent;
  return <AppLayout>{pageContent}</AppLayout>;
}
