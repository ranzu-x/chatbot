import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI, botAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import {
  MessageCircle,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Settings,
  ShoppingBag,
  Bot,
  Zap,
  Key,
  RefreshCw,
  ExternalLink,
  Shield,
  Copy,
  Check,
  Eye,
  Sliders,
  Sparkles,
  ArrowRight,
  HelpCircle,
  ChevronDown,
  Info,
  Layers,
  Package,
  ArrowLeft,
  Building2,
  Smartphone,
  Repeat,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

export default function WhatsAppPage({ embedded = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fbReady, appId, configId, sdkError } = useFacebookSDK();

  const [accounts, setAccounts] = useState([]);
  const [availableBots, setAvailableBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState(null);

  // Embedded Signup Modal & Step State
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [withCatalog, setWithCatalog] = useState(false);
  
  // Wizard steps: 'choose_mode' | 'fetching' | 'selecting_discovered' | 'setup_number'
  const [modalStep, setModalStep] = useState('choose_mode'); 
  const [onboardingType, setOnboardingType] = useState('new_number'); // 'new_number' | 'coexistence'

  const [discoveredNumbers, setDiscoveredNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [metaUserToken, setMetaUserToken] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Form State
  const [embeddedForm, setEmbeddedForm] = useState({
    name: '',
    phoneNumber: '',
    wabaId: '',
    phoneNumberId: '',
    businessPortfolio: '',
  });

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    name: '',
    waPhoneNumberId: '',
    waBusinessAccId: '',
    accessToken: '',
    verifyToken: 'my_chatbot_verify_token_2024',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await channelAPI.getWhatsApp();
      setAccounts(res.data.accounts || []);
    } catch {
      showToast('Failed to load WhatsApp accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const res = await botAPI.getAll();
      setAvailableBots(res.data.bots || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchBots();
  }, []);

  // ─── 1. Listen for Official Meta Embedded Signup Window Messages ──────────
  useEffect(() => {
    const handleMetaMessage = async (event) => {
      if (event.origin !== 'https://www.facebook.com' && !event.origin.includes('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && (data.type === 'WA_EMBEDDED_SIGNUP' || data.event === 'WA_EMBEDDED_SIGNUP')) {
          console.log('[Meta Embedded Signup Event Received]:', data);
          const { phone_number_id, waba_id } = data.data || {};
          if (phone_number_id || waba_id) {
            setConnecting(true);
            await channelAPI.addWhatsAppEmbedded({
              phoneNumberId: phone_number_id,
              wabaId: waba_id,
              name: withCatalog ? 'WhatsApp Commerce Account' : 'WhatsApp Business Number',
              withCatalog,
            });
            showToast(`WhatsApp ${withCatalog ? '(With Catalog)' : '(Without Catalog)'} connected via Embedded Signup!`);
            setShowEmbeddedModal(false);
            fetchAccounts();
          }
        }
      } catch (err) {
        // Not a JSON message
      }
    };

    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, [withCatalog]);

  const openEmbeddedModal = (catalogMode = false) => {
    setWithCatalog(catalogMode);
    setModalStep('choose_mode');
    setOnboardingType('new_number');
    setDiscoveredNumbers([]);
    setSelectedNumber(null);
    setShowEmbeddedModal(true);
  };

  // ─── 2. Launch Meta Embedded Signup Popup with Session Config ────────────
  const launchMetaEmbeddedSignupPopup = () => {
    if (window.FB && appId) {
      setConnecting(true);

      const safetyTimeout = setTimeout(() => {
        setConnecting(false);
      }, 30000);

      const loginOptions = {
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          feature: 'whatsapp_embedded_signup',
          version: 2,
          sessionInfoVersion: 2,
        },
      };

      if (configId) {
        loginOptions.config_id = configId;
      } else {
        loginOptions.scope = withCatalog
          ? 'whatsapp_business_management,whatsapp_business_messaging,catalog_management,business_management'
          : 'whatsapp_business_management,whatsapp_business_messaging';
      }

      try {
        window.FB.login((response) => {
          clearTimeout(safetyTimeout);
          setConnecting(false);

          if (response && response.authResponse) {
            const token = response.authResponse.accessToken;
            setMetaUserToken(token);
            setModalStep('fetching');

            channelAPI.discoverWhatsAppAccounts(token)
              .then((discRes) => {
                const found = discRes.data.accounts || [];
                if (found.length > 0) {
                  setDiscoveredNumbers(found);
                  setSelectedNumber(found[0]);
                  setModalStep('selecting_discovered');
                } else {
                  setModalStep('setup_number');
                  showToast('Meta account verified! Select your setup mode below to finish.');
                }
              })
              .catch(() => {
                setModalStep('setup_number');
                showToast('Meta verified! Choose coexistence or new number below.', 'info');
              });
          } else {
            showToast('Meta Embedded Signup window was closed or cancelled', 'warning');
          }
        }, loginOptions);
      } catch (err) {
        clearTimeout(safetyTimeout);
        setConnecting(false);
        setModalStep('setup_number');
        showToast('You can configure your business and number details below.', 'info');
      }
    } else {
      setModalStep('setup_number');
    }
  };

  // ─── 3. Connect Selected Discovered Number ──────────────────────────────
  const handleConnectSelectedNumber = async () => {
    if (!selectedNumber) return;
    setConnecting(true);
    try {
      await channelAPI.addWhatsAppEmbedded({
        name: selectedNumber.verifiedName || selectedNumber.wabaName || 'WhatsApp Official',
        phoneNumber: selectedNumber.displayPhoneNumber,
        phoneNumberId: selectedNumber.phoneNumberId || `wa_${Date.now()}`,
        wabaId: selectedNumber.wabaId,
        accessToken: metaUserToken,
        withCatalog,
      });
      showToast(`Connected ${selectedNumber.displayPhoneNumber} successfully!`);
      setShowEmbeddedModal(false);
      fetchAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect number', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // ─── 4. Connect Number Wizard Submit ─────────────────────────────────────
  const handleSetupNumberSubmit = async (e) => {
    e?.preventDefault();
    if (!embeddedForm.phoneNumber && !embeddedForm.name) {
      showToast('Please enter your WhatsApp Phone Number or Business Name', 'error');
      return;
    }

    setConnecting(true);
    try {
      const modeLabel = onboardingType === 'coexistence' ? ' [Coexistence]' : '';
      await channelAPI.addWhatsAppEmbedded({
        name: `${embeddedForm.name || 'WhatsApp Business'}${modeLabel}`,
        phoneNumber: embeddedForm.phoneNumber,
        phoneNumberId: embeddedForm.phoneNumberId || `wa_${Date.now()}`,
        wabaId: embeddedForm.wabaId,
        accessToken: metaUserToken || undefined,
        withCatalog,
      });
      showToast(`WhatsApp ${onboardingType === 'coexistence' ? '(Coexistence)' : ''} connected successfully!`);
      setShowEmbeddedModal(false);
      setEmbeddedForm({ name: '', phoneNumber: '', wabaId: '', phoneNumberId: '', businessPortfolio: '' });
      fetchAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect WhatsApp account', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await channelAPI.addWhatsApp(manualForm);
      showToast('WhatsApp account connected successfully!');
      setShowManualModal(false);
      setManualForm({
        name: '',
        waPhoneNumberId: '',
        waBusinessAccId: '',
        accessToken: '',
        verifyToken: 'my_chatbot_verify_token_2024',
      });
      fetchAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect WhatsApp', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this WhatsApp account?')) return;
    try {
      await channelAPI.deleteWhatsApp(id);
      showToast('Account removed');
      fetchAccounts();
    } catch {
      showToast('Failed to remove account', 'error');
    }
  };

  const copyWebhookUrl = (accId) => {
    const url = `${BACKEND_URL}/api/v1/webhook/${user?.agencyId || '{agencyId}'}/${accId || '{integrationId}'}`;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
    showToast('Webhook URL copied to clipboard');
  };

  const LayoutWrapper = embedded ? ({ children }) => <div>{children}</div> : AppLayout;

  return (
    <LayoutWrapper>
      <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: 'rgba(37, 211, 102, 0.1)',
                  color: '#25d366',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MessageCircle size={20} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                WhatsApp Cloud API (Embedded Signup)
              </h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
              Official Meta Embedded Signup: Select Business Portfolio, add New Number or Coexistence, and connect with or without Catalog
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={fetchAccounts}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* ── 2 DEDICATED EMBEDDED SIGNUP OPTION CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 16 }}>
          {/* OPTION 1: Connect WITHOUT Catalog */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #bbf7d0',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(37, 211, 102, 0.05)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: 'rgba(37, 211, 102, 0.12)',
                    color: '#25d366',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Zap size={22} />
                </div>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 10,
                    background: 'rgba(37, 211, 102, 0.1)',
                    color: '#16a34a',
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Option 1: Standard Messaging
                </span>
              </div>

              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Connect Without Catalog
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.45 }}>
                Meta Embedded Signup for customer support, bot flows, automated sequences, and live inbox chatting. Supports New Number and Coexistence.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#475569' }}>
                  <Check size={14} color="#16a34a" /> Meta Business Portfolio & WABA selection
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#16a34a' }}>
                  <Check size={14} color="#16a34a" /> Support for New Number or Coexistence mode
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#16a34a' }}>
                  <Check size={14} color="#16a34a" /> Auto-configured webhook delivery
                </div>
              </div>
            </div>

            <button
              onClick={() => openEmbeddedModal(false)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                background: '#25d366',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)',
              }}
            >
              <Zap size={15} /> Connect Without Catalog <ArrowRight size={14} />
            </button>
          </div>

          {/* OPTION 2: Connect WITH Catalog */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #c7d2fe',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.05)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShoppingBag size={22} />
                </div>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: '#4f46e5',
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Option 2: Commerce & Catalog
                </span>
              </div>

              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Connect With Catalog
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.45 }}>
                Includes Meta Commerce & Catalog permissions to send interactive product lists, single product messages, and cart checkout.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#475569' }}>
                  <Check size={14} color="#6366f1" /> WhatsApp Product Catalog & sets sync
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#6366f1' }}>
                  <Check size={14} color="#6366f1" /> Interactive product cards & direct cart
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#6366f1' }}>
                  <Check size={14} color="#6366f1" /> Full support for e-commerce order bots
                </div>
              </div>
            </div>

            <button
              onClick={() => openEmbeddedModal(true)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                background: '#6366f1',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
              }}
            >
              <ShoppingBag size={15} /> Connect With Catalog <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* ── Connected Numbers Table ── */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            marginBottom: 16,
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Connected WhatsApp Numbers
              </h2>
              <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                All active WhatsApp Cloud API accounts integrated with Nexa Chatbot
              </p>
            </div>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(37, 211, 102, 0.1)', color: '#25d366' }}>
              {accounts.length} Active Number{accounts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account Name</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Phone Number ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>WABA ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Webhook Endpoint</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                      Loading WhatsApp accounts...
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      <MessageCircle size={36} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
                      <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 2px 0' }}>
                        No WhatsApp Accounts Connected
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 12px 0' }}>
                        Choose an option above to connect WhatsApp with or without Catalog.
                      </p>
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => (
                    <tr
                      key={acc.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfe')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,211,102,0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessageCircle size={15} />
                          </span>
                          <span>{acc.name || 'WhatsApp Business'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {acc.wa_phone_number_id || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {acc.wa_business_acc_id || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => copyWebhookUrl(acc.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: '0.72rem' }}
                        >
                          <Copy size={11} /> Copy Webhook
                        </button>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                          Connected
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #fee2e2',
                            background: '#fef2f2',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                          title="Disconnect Number"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Developer Manual Fallback Link ── */}
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <button
            onClick={() => setShowManualModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '0.76rem',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Developer Mode: Enter manual credentials & tokens instead
          </button>
        </div>

        {/* ── OFFICIAL META EMBEDDED SIGNUP WIZARD MODAL ── */}
        {showEmbeddedModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => {
              if (!connecting) setShowEmbeddedModal(false);
            }}
          >
            <div
              style={{
                width: 530,
                maxWidth: '94vw',
                background: '#ffffff',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: withCatalog ? 'rgba(99, 102, 241, 0.1)' : 'rgba(37, 211, 102, 0.1)',
                      color: withCatalog ? '#6366f1' : '#25d366',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {withCatalog ? <ShoppingBag size={20} /> : <Zap size={20} />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                      Meta Embedded Signup {withCatalog ? '(With Catalog)' : '(Without Catalog)'}
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Official WhatsApp Business Cloud API Onboarding Flow
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowEmbeddedModal(false)}
                  disabled={connecting}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              {/* Mode Toggle Switcher */}
              <div
                style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  padding: 3,
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  onClick={() => setWithCatalog(false)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: !withCatalog ? 700 : 500,
                    border: 'none',
                    background: !withCatalog ? '#ffffff' : 'transparent',
                    color: !withCatalog ? '#16a34a' : '#64748b',
                    boxShadow: !withCatalog ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Zap size={13} /> Without Catalog
                </button>
                <button
                  type="button"
                  onClick={() => setWithCatalog(true)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: withCatalog ? 700 : 500,
                    border: 'none',
                    background: withCatalog ? '#ffffff' : 'transparent',
                    color: withCatalog ? '#4f46e5' : '#64748b',
                    boxShadow: withCatalog ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <ShoppingBag size={13} /> With Catalog
                </button>
              </div>

              {/* ── STEP 1: CHOOSE EMBEDDED MODE ── */}
              {modalStep === 'choose_mode' && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                      Select WhatsApp Onboarding Type:
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {/* New Number */}
                      <div
                        onClick={() => setOnboardingType('new_number')}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: onboardingType === 'new_number' ? '2px solid #25d366' : '1px solid #e2e8f0',
                          background: onboardingType === 'new_number' ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                          <Smartphone size={15} color="#16a34a" /> New Phone Number
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.35 }}>
                          Dedicated Cloud API number for automated bot flows and high-volume live chat.
                        </span>
                      </div>

                      {/* Coexistence */}
                      <div
                        onClick={() => setOnboardingType('coexistence')}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: onboardingType === 'coexistence' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                          background: onboardingType === 'coexistence' ? '#eef2ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                          <Repeat size={15} color="#4f46e5" /> WhatsApp Coexistence
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.35 }}>
                          Keep existing WhatsApp Business phone app active while running chatbot automation.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <button
                      onClick={launchMetaEmbeddedSignupPopup}
                      disabled={connecting}
                      style={{
                        width: '100%',
                        padding: '12px 18px',
                        borderRadius: 10,
                        background: withCatalog ? '#6366f1' : '#25d366',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        cursor: connecting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        boxShadow: withCatalog
                          ? '0 4px 14px rgba(99, 102, 241, 0.35)'
                          : '0 4px 14px rgba(37, 211, 102, 0.35)',
                      }}
                    >
                      {connecting ? (
                        <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }} />
                      ) : (
                        <Building2 size={18} />
                      )}
                      {connecting ? 'Launching Meta Embedded Signup...' : 'Launch Meta Embedded Signup'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: '#94a3b8', fontSize: '0.74rem' }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    <span>OR CONFIGURE DETAILS DIRECTLY</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalStep('setup_number')}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#475569',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Enter Business & Phone Number Details
                  </button>
                </div>
              )}

              {/* ── STEP 2: FETCHING ACCOUNTS ── */}
              {modalStep === 'fetching' && (
                <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                    Discovering Business Portfolios & Numbers...
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                    Connecting to Meta Graph API to sync WABAs and phone numbers.
                  </p>
                </div>
              )}

              {/* ── STEP 3: SELECT DISCOVERED BUSINESS NUMBER ── */}
              {modalStep === 'selecting_discovered' && (
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                    Discovered WhatsApp Numbers in your Meta Portfolio:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 14 }}>
                    {discoveredNumbers.map((num, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedNumber(num)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: selectedNumber === num ? '2px solid #25d366' : '1px solid #e2e8f0',
                          background: selectedNumber === num ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,211,102,0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessageCircle size={14} />
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                              {num.displayPhoneNumber}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {num.verifiedName} • Portfolio: {num.wabaName}
                            </div>
                          </div>
                        </div>
                        {selectedNumber === num && <Check size={16} color="#16a34a" />}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setModalStep('setup_number')}
                      className="btn btn-secondary btn-sm"
                    >
                      Different Number
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectSelectedNumber}
                      disabled={connecting || !selectedNumber}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#25d366', borderColor: '#25d366', fontWeight: 700 }}
                    >
                      {connecting ? 'Connecting...' : 'Connect Selected Number'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: ENTER BUSINESS & NUMBER DETAILS ── */}
              {modalStep === 'setup_number' && (
                <form onSubmit={handleSetupNumberSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <button
                      type="button"
                      onClick={() => setModalStep('choose_mode')}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: 0 }}
                    >
                      <ArrowLeft size={13} /> Back to Options
                    </button>
                  </div>

                  {/* Onboarding Mode Selection */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <button
                      type="button"
                      onClick={() => setOnboardingType('new_number')}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: onboardingType === 'new_number' ? '2px solid #25d366' : '1px solid #e2e8f0',
                        background: onboardingType === 'new_number' ? '#f0fdf4' : '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: onboardingType === 'new_number' ? '#16a34a' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      📱 New Number
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnboardingType('coexistence')}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: onboardingType === 'coexistence' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                        background: onboardingType === 'coexistence' ? '#eef2ff' : '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: onboardingType === 'coexistence' ? '#4f46e5' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      🔄 Coexistence Mode
                    </button>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      WhatsApp Business Name *
                    </label>
                    <input
                      required
                      className="form-input w-full"
                      placeholder="e.g. Acme Customer Support"
                      value={embeddedForm.name}
                      onChange={(e) => setEmbeddedForm({ ...embeddedForm, name: e.target.value })}
                      style={{ height: 34, fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      WhatsApp Phone Number (with Country Code) *
                    </label>
                    <input
                      required
                      className="form-input w-full"
                      placeholder="e.g. +14155552671"
                      value={embeddedForm.phoneNumber}
                      onChange={(e) => setEmbeddedForm({ ...embeddedForm, phoneNumber: e.target.value })}
                      style={{ height: 34, fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Meta Business Portfolio / WABA ID (Optional)
                    </label>
                    <input
                      className="form-input w-full"
                      placeholder="e.g. 987654321012345"
                      value={embeddedForm.wabaId}
                      onChange={(e) => setEmbeddedForm({ ...embeddedForm, wabaId: e.target.value })}
                      style={{ height: 34, fontSize: '0.82rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => setShowEmbeddedModal(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={connecting}
                      className="btn btn-primary btn-sm"
                      style={{
                        background: withCatalog ? '#6366f1' : '#25d366',
                        borderColor: withCatalog ? '#6366f1' : '#25d366',
                        fontWeight: 700,
                      }}
                    >
                      {connecting ? 'Connecting...' : `Connect ${onboardingType === 'coexistence' ? 'Coexistence' : 'New'} Number`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ── Manual Fallback Modal ── */}
        {showManualModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setShowManualModal(false)}
          >
            <div
              style={{
                width: 480,
                maxWidth: '92vw',
                background: '#ffffff',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key size={16} color="#25d366" /> Manual Cloud API Credentials
                </h3>
                <button
                  onClick={() => setShowManualModal(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitManual} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Account Name *
                  </label>
                  <input
                    required
                    className="form-input w-full"
                    placeholder="e.g. Sales WhatsApp"
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Phone Number ID *
                  </label>
                  <input
                    required
                    className="form-input w-full"
                    placeholder="e.g. 109283746501928"
                    value={manualForm.waPhoneNumberId}
                    onChange={(e) => setManualForm({ ...manualForm, waPhoneNumberId: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    WABA ID
                  </label>
                  <input
                    className="form-input w-full"
                    placeholder="e.g. 987654321012345"
                    value={manualForm.waBusinessAccId}
                    onChange={(e) => setManualForm({ ...manualForm, waBusinessAccId: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Access Token *
                  </label>
                  <textarea
                    required
                    rows={2}
                    className="form-input w-full"
                    placeholder="EAAG..."
                    value={manualForm.accessToken}
                    onChange={(e) => setManualForm({ ...manualForm, accessToken: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={connecting}
                    className="btn btn-primary btn-sm"
                  >
                    {connecting ? 'Saving...' : 'Connect'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Toast Notification ── */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 9999,
              padding: '12px 20px',
              borderRadius: 8,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </LayoutWrapper>
  );
}
