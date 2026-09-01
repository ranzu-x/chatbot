import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { showAlert, notify } from '../../utils/alerts';
import {
  Facebook, MessageSquare, Heart, EyeOff, Plus, CheckCircle2,
  Trash2, Edit2, RefreshCw, Zap, Shield, Sparkles, Key, ExternalLink,
  MessageCircle, Radio, Tag, Filter, Check, Copy
} from 'lucide-react';

// ─── Facebook Login Button ─────────────────────────────────────────
function FBLoginButton({ onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '11px 22px', borderRadius: 8, border: 'none',
        background: '#1877f2', color: '#fff', fontWeight: 700,
        fontSize: '0.9rem', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, transition: 'all 0.2s',
        boxShadow: '0 4px 14px rgba(24,119,242,0.3)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#0f65d4'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#1877f2'; }}
    >
      {loading ? (
        <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
      ) : (
        <Facebook size={18} />
      )}
      {loading ? 'Connecting…' : 'Continue with Facebook'}
    </button>
  );
}

export default function FacebookPage({ embedded = false }) {
  const [activeTab, setActiveTab] = useState('pages'); // 'pages' or 'comments'

  // Connected Pages State
  const [connected, setConnected] = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [step, setStep] = useState('idle');
  const [fetchedPages, setFetchedPages] = useState([]);
  const [selected, setSelected] = useState([]);
  const [fbUserToken, setFbUserToken] = useState('');
  const [importing, setImporting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', fbPageId: '', fbPageName: '', accessToken: '' });
  const [manualSaving, setManualSaving] = useState(false);

  // Comment Automation State
  const [commentRules, setCommentRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    campaignName: '',
    integrationId: '',
    postId: 'ALL_POSTS',
    triggerType: 'ALL',
    triggerKeywords: '',
    autoReplyComment: '',
    autoReplyPrivateMessage: '',
    enableLikeComment: true,
    enableHideComment: false,
  });

  const [toast, setToast] = useState(null);
  const { fbReady, sdkError } = useFacebookSDK();

  const showToast = (msg, type = 'success') => {
    if (type === 'error') notify.error(msg);
    else notify.success(msg);
  };

  // ── Load Connected Pages ──
  const fetchConnected = async () => {
    setLoadingConnected(true);
    try {
      const res = await channelAPI.getFacebook();
      setConnected(res.data.pages || []);
    } catch {
      showToast('Failed to load Facebook pages', 'error');
    } finally {
      setLoadingConnected(false);
    }
  };

  // ── Load Comment Rules ──
  const fetchCommentRules = async () => {
    setLoadingRules(true);
    try {
      const res = await channelAPI.getFBCommentRules();
      setCommentRules(res.data.rules || []);
    } catch {
      showToast('Failed to load comment automation rules', 'error');
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchConnected();
    fetchCommentRules();
  }, []);

  // ── Facebook SDK Login & Page Fetch ──
  const handleFBLogin = () => {
    if (!window.FB) { showToast('Facebook SDK not loaded yet', 'error'); return; }
    setLoginLoading(true);
    window.FB.login((response) => {
      setLoginLoading(false);
      if (response.authResponse) {
        fetchUserPages(response.authResponse.accessToken);
      } else {
        showToast('Facebook login was cancelled or failed', 'error');
      }
    }, {
      scope: 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,pages_manage_engagement,pages_manage_posts',
      return_scopes: true,
    });
  };

  const fetchUserPages = (userAccessToken) => {
    setFbUserToken(userAccessToken);
    setStep('fetching');
    window.FB.api('/me/accounts', { access_token: userAccessToken, fields: 'id,name,access_token,category,tasks' }, (res) => {
      if (res && !res.error) {
        setFetchedPages(res.data || []);
        setSelected(res.data || []);
        setStep('selecting');
      } else {
        showToast(res?.error?.message || 'Failed to fetch pages', 'error');
        setStep('idle');
      }
    });
  };

  const handleImport = async () => {
    if (!selected.length) return;
    setImporting(true);
    try {
      for (const page of selected) {
        await channelAPI.addFacebook({
          name: page.name,
          accessToken: page.access_token,
          userAccessToken: fbUserToken || null,
          fbPageId: page.id,
          fbPageName: page.name,
        });
      }
      showToast(`Connected ${selected.length} Facebook page(s) with Personal Account!`);
      setStep('done');
      setSelected([]);
      fetchConnected();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect pages', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDeletePage = async (id) => {
    if (!window.confirm('Disconnect this Facebook Page?')) return;
    try {
      await channelAPI.deleteFacebook(id);
      showToast('Page disconnected');
      fetchConnected();
    } catch {
      showToast('Failed to disconnect', 'error');
    }
  };

  // ── Comment Automation CRUD ──
  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    setRuleSaving(true);
    try {
      if (editingRule) {
        await channelAPI.updateFBCommentRule(editingRule.id, ruleForm);
        showToast('Comment campaign updated');
      } else {
        await channelAPI.createFBCommentRule(ruleForm);
        showToast('Comment automation campaign created!');
      }
      setShowRuleModal(false);
      setEditingRule(null);
      setRuleForm({
        campaignName: '',
        integrationId: '',
        postId: 'ALL_POSTS',
        triggerType: 'ALL',
        triggerKeywords: '',
        autoReplyComment: '',
        autoReplyPrivateMessage: '',
        enableLikeComment: true,
        enableHideComment: false,
      });
      fetchCommentRules();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save campaign', 'error');
    } finally {
      setRuleSaving(false);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await channelAPI.toggleFBCommentRule(rule.id);
      setCommentRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: r.is_active ? 0 : 1 } : r));
      showToast(`Campaign ${rule.is_active ? 'disabled' : 'activated'}`);
    } catch {
      showToast('Failed to toggle campaign', 'error');
    }
  };

  const handleDeleteRule = async (id) => {
    const ok = await showAlert.confirm({
      title: 'Delete Campaign?',
      text: 'Are you sure you want to delete this comment automation campaign?',
      confirmButtonText: 'Yes, Delete',
    });
    if (!ok) return;
    try {
      await channelAPI.deleteFBCommentRule(id);
      notify.success('Campaign deleted successfully');
      fetchCommentRules();
    } catch {
      notify.error('Failed to delete campaign');
    }
  };

  const pageContent = (
    <div>
      <style>{`
        .fb-tab-btn {
          padding: 10px 18px;
          font-size: 0.86rem;
          font-weight: 600;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-secondary);
          border-bottom: 2px solid transparent;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fb-tab-btn.active {
          color: #1877f2;
          border-bottom-color: #1877f2;
        }
        .fb-table th {
          padding: 12px 14px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #5c5c80;
          border-bottom: 1px solid #e4e4f0;
          background: #f8f8fc;
          white-space: nowrap;
          text-align: left;
        }
        .fb-table td {
          padding: 13px 14px;
          font-size: 0.83rem;
          border-bottom: 1px solid #e4e4f0;
          vertical-align: middle;
          background: #ffffff;
        }
        .fb-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          cursor: pointer;
        }
        .fb-switch input { opacity: 0; width: 0; height: 0; }
        .fb-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: .22s;
          border-radius: 20px;
        }
        .fb-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .22s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        input:checked + .fb-slider { background-color: #10b981; }
        input:checked + .fb-slider:before { transform: translateX(16px); }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Facebook size={26} color="#1877f2" /> Facebook Marketing & Automation
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
            Connect Facebook Pages, manage Messenger live chat, and automate comment auto-replies & private DMs
          </p>
        </div>

        {activeTab === 'comments' && (
          <button
            onClick={() => {
              setEditingRule(null);
              setRuleForm({
                campaignName: '',
                integrationId: connected[0]?.id || '',
                postId: 'ALL_POSTS',
                triggerType: 'ALL',
                triggerKeywords: '',
                autoReplyComment: '',
                autoReplyPrivateMessage: '',
                enableLikeComment: true,
                enableHideComment: false,
              });
              setShowRuleModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.84rem',
              fontWeight: 600,
              background: '#1877f2',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(24, 119, 242, 0.3)',
            }}
          >
            <Plus size={15} /> Create Comment Campaign
          </button>
        )}
      </div>

      {/* ── Tabs Bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          className={`fb-tab-btn ${activeTab === 'pages' ? 'active' : ''}`}
          onClick={() => setActiveTab('pages')}
        >
          <Facebook size={16} /> Connected Pages ({connected.length})
        </button>
        <button
          className={`fb-tab-btn ${activeTab === 'comments' ? 'active' : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          <MessageSquare size={16} /> Comment Automation ({commentRules.length})
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: CONNECTED PAGES
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pages' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Left Table */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e4e4f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0, color: '#1a1a2e' }}>
                  Connected Pages & Messenger Integrations
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#5c5c80', marginTop: 2 }}>
                  Pages connected to receive incoming messages & comments
                </div>
              </div>
              <button
                onClick={fetchConnected}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e4e4f0',
                  background: '#ffffff',
                  color: '#5c5c80',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="fb-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>PAGE NAME</th>
                    <th>PAGE ID</th>
                    <th>STATUS</th>
                    <th>WEBHOOK SYNC</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConnected ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                        <p style={{ color: '#5c5c80', fontSize: '0.82rem' }}>Loading connected pages...</p>
                      </td>
                    </tr>
                  ) : connected.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 6 }}>📘</div>
                        <h4 style={{ fontSize: '0.92rem', fontWeight: 600, margin: '0 0 4px 0', color: '#1a1a2e' }}>
                          No Facebook Pages connected
                        </h4>
                        <p style={{ color: '#5c5c80', fontSize: '0.8rem', margin: 0 }}>
                          Use the login or permanent token box on the right to link your Facebook Page.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    connected.map((page) => (
                      <tr key={page.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#1877f2', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {page.name?.[0]?.toUpperCase() || 'P'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{page.name}</div>
                              <div style={{ fontSize: '0.72rem', color: '#5c5c80' }}>DB ID: {page.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.78rem', background: '#f8f8fc', padding: '2px 6px', borderRadius: 4 }}>
                            {page.fb_page_id || '—'}
                          </code>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                            ● Active
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={13} /> Subscribed
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleDeletePage(page.id)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid rgba(239,68,68,0.2)',
                              background: 'rgba(239,68,68,0.06)',
                              color: '#ef4444',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Trash2 size={13} /> Disconnect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Connect Tools */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* FB Login Card */}
            <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: 20, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>📘</div>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', marginBottom: 4, color: '#1a1a2e' }}>
                Connect via Facebook Login
              </div>
              <div style={{ fontSize: '0.8rem', color: '#5c5c80', marginBottom: 16, lineHeight: 1.5 }}>
                Log in to select and import pages with <code>pages_messaging</code>, <code>pages_manage_engagement</code>, and <code>pages_manage_posts</code> permissions for full DM & comment automation.
              </div>
              <FBLoginButton onClick={handleFBLogin} loading={loginLoading} disabled={loginLoading} />
            </div>

            {/* 1-Click Permanent Token Generator */}
            <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1.5px solid rgba(99, 102, 241, 0.25)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem', color: '#4f46e5', marginBottom: 6 }}>
                <Zap size={16} /> 1-Click Permanent Token Connect
              </div>
              <p style={{ fontSize: '0.78rem', color: '#5c5c80', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                Paste any token with <code>pages_manage_engagement, pages_manage_posts, pages_messaging</code>. We automatically upgrade it to a <strong>Permanent Never-Expiring Token</strong>.
              </p>
              <textarea
                id="fb-quick-token-input"
                rows={2}
                className="form-input w-full"
                placeholder="Paste Access Token here..."
                style={{ fontSize: '0.8rem', resize: 'vertical', marginBottom: 8 }}
              />
              <button
                type="button"
                onClick={async (e) => {
                  const input = document.getElementById('fb-quick-token-input');
                  const tokenVal = input?.value?.trim();
                  if (!tokenVal) {
                    showToast('Please paste your Access Token first', 'error');
                    return;
                  }
                  const btn = e.currentTarget;
                  btn.disabled = true;
                  btn.innerText = 'Connecting…';
                  try {
                    const res = await channelAPI.quickConnectFacebook(tokenVal);
                    showToast(res.data.message || 'Connected with permanent token!');
                    if (input) input.value = '';
                    fetchConnected();
                  } catch (err) {
                    showToast(err.response?.data?.message || 'Failed to connect', 'error');
                  } finally {
                    btn.disabled = false;
                    btn.innerText = '⚡ Connect & Make Permanent';
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                ⚡ Connect & Make Permanent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: COMMENT AUTOMATION CAMPAIGNS
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'comments' && (
        <div>
          {/* 3 Stat Cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(24,119,242,0.1)', color: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#5c5c80', fontWeight: 600 }}>Active Campaigns</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1a1a2e' }}>
                  {commentRules.filter(r => r.is_active).length}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 180, background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Heart size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#5c5c80', fontWeight: 600 }}>Auto-Like Enabled</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1a1a2e' }}>
                  {commentRules.filter(r => r.enable_like_comment).length}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 180, background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#5c5c80', fontWeight: 600 }}>Private DMs Enabled</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1a1a2e' }}>
                  {commentRules.filter(r => r.auto_reply_private_message).length}
                </div>
              </div>
            </div>
          </div>

          {/* Campaigns Table Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fb-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>CAMPAIGN NAME</th>
                    <th>PAGE</th>
                    <th>TARGET POST</th>
                    <th>TRIGGER CONDITION</th>
                    <th>PUBLIC COMMENT REPLY</th>
                    <th>PRIVATE MESSENGER DM</th>
                    <th>OPTIONS</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRules ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 50, textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                        <p style={{ color: '#5c5c80', fontSize: '0.82rem' }}>Loading comment campaigns...</p>
                      </td>
                    </tr>
                  ) : commentRules.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 50, textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>💬</div>
                        <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 4px 0', color: '#1a1a2e' }}>
                          No Comment Automation Campaigns
                        </h3>
                        <p style={{ color: '#5c5c80', fontSize: '0.82rem', margin: '0 0 14px 0' }}>
                          Automatically reply to user comments on your Facebook posts and send instant private messages via Messenger.
                        </p>
                        <button
                          onClick={() => {
                            setEditingRule(null);
                            setRuleForm({
                              campaignName: '',
                              integrationId: connected[0]?.id || '',
                              postId: 'ALL_POSTS',
                              triggerType: 'ALL',
                              triggerKeywords: '',
                              autoReplyComment: '',
                              autoReplyPrivateMessage: '',
                              enableLikeComment: true,
                              enableHideComment: false,
                            });
                            setShowRuleModal(true);
                          }}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            background: '#1877f2',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          + Create Your First Campaign
                        </button>
                      </td>
                    </tr>
                  ) : (
                    commentRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: '0.86rem' }}>
                            {rule.campaign_name}
                          </div>
                        </td>

                        <td>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1877f2' }}>
                            {rule.page_name || 'All Connected Pages'}
                          </span>
                        </td>

                        <td>
                          <span style={{ fontSize: '0.76rem', color: '#5c5c80', background: '#f8f8fc', padding: '2px 8px', borderRadius: 4 }}>
                            {rule.post_id === 'ALL_POSTS' ? '🌐 All Posts' : `Post #${rule.post_id}`}
                          </span>
                        </td>

                        <td>
                          {rule.trigger_type === 'ALL' ? (
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                              All Comments
                            </span>
                          ) : (
                            <div>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: 8 }}>
                                Keywords
                              </span>
                              <div style={{ fontSize: '0.72rem', color: '#5c5c80', marginTop: 2 }}>
                                {rule.trigger_keywords || '—'}
                              </div>
                            </div>
                          )}
                        </td>

                        <td style={{ maxWidth: 200 }}>
                          <div style={{ fontSize: '0.78rem', color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rule.auto_reply_comment || '—'}
                          </div>
                        </td>

                        <td style={{ maxWidth: 200 }}>
                          <div style={{ fontSize: '0.78rem', color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rule.auto_reply_private_message || '—'}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {rule.enable_like_comment === 1 && (
                              <span title="Auto-Like Enabled" style={{ color: '#ef4444', fontSize: '0.85rem' }}>❤️</span>
                            )}
                            {rule.enable_hide_comment === 1 && (
                              <span title="Auto-Hide Enabled" style={{ color: '#f59e0b', fontSize: '0.85rem' }}>🛡️</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <label className="fb-switch">
                            <input
                              type="checkbox"
                              checked={Boolean(rule.is_active)}
                              onChange={() => handleToggleRule(rule)}
                            />
                            <span className="fb-slider" />
                          </label>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => {
                                setEditingRule(rule);
                                setRuleForm({
                                  campaignName: rule.campaign_name,
                                  integrationId: rule.integration_id || '',
                                  postId: rule.post_id || 'ALL_POSTS',
                                  triggerType: rule.trigger_type || 'ALL',
                                  triggerKeywords: rule.trigger_keywords || '',
                                  autoReplyComment: rule.auto_reply_comment || '',
                                  autoReplyPrivateMessage: rule.auto_reply_private_message || '',
                                  enableLikeComment: Boolean(rule.enable_like_comment),
                                  enableHideComment: Boolean(rule.enable_hide_comment),
                                });
                                setShowRuleModal(true);
                              }}
                              style={{
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: '1px solid #e4e4f0',
                                background: '#ffffff',
                                color: '#5c5c80',
                                cursor: 'pointer',
                              }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              style={{
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: '1px solid rgba(239,68,68,0.2)',
                                background: 'rgba(239,68,68,0.06)',
                                color: '#ef4444',
                                cursor: 'pointer',
                              }}
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
      )}

      {/* ── Create / Edit Comment Campaign Modal ── */}
      {showRuleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 560,
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: 14,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
              border: '1px solid #e4e4f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={18} color="#1877f2" />
                {editingRule ? 'Edit Comment Campaign' : 'Create Facebook Comment Campaign'}
              </h3>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setEditingRule(null);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid #e4e4f0',
                  background: '#f8f8fc',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRuleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Campaign Name
                </label>
                <input
                  required
                  className="form-input w-full"
                  placeholder="e.g. Summer Promo Auto-Reply"
                  value={ruleForm.campaignName}
                  onChange={(e) => setRuleForm({ ...ruleForm, campaignName: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                    Select Facebook Page
                  </label>
                  <select
                    className="form-input w-full"
                    value={ruleForm.integrationId}
                    onChange={(e) => setRuleForm({ ...ruleForm, integrationId: e.target.value })}
                  >
                    <option value="">All Connected Pages</option>
                    {connected.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                    Target Post
                  </label>
                  <select
                    className="form-input w-full"
                    value={ruleForm.postId}
                    onChange={(e) => setRuleForm({ ...ruleForm, postId: e.target.value })}
                  >
                    <option value="ALL_POSTS">All Page Posts</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Reply Trigger Condition
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="triggerType"
                      checked={ruleForm.triggerType === 'ALL'}
                      onChange={() => setRuleForm({ ...ruleForm, triggerType: 'ALL' })}
                    />
                    Reply to all comments
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="triggerType"
                      checked={ruleForm.triggerType === 'KEYWORDS'}
                      onChange={() => setRuleForm({ ...ruleForm, triggerType: 'KEYWORDS' })}
                    />
                    Filter by Keywords
                  </label>
                </div>
              </div>

              {ruleForm.triggerType === 'KEYWORDS' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                    Comma-separated Keywords
                  </label>
                  <input
                    className="form-input w-full"
                    placeholder="price, cost, how much, info, buy, discount"
                    value={ruleForm.triggerKeywords}
                    onChange={(e) => setRuleForm({ ...ruleForm, triggerKeywords: e.target.value })}
                  />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    Public Auto-Reply Comment
                  </label>
                  <button
                    type="button"
                    onClick={() => setRuleForm({ ...ruleForm, autoReplyComment: ruleForm.autoReplyComment + ' {{name}}' })}
                    style={{ fontSize: '0.72rem', color: '#1877f2', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Insert {'{{name}}'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  className="form-input w-full"
                  placeholder="Hi {{name}}, thanks for your comment! We sent you a private message with details."
                  value={ruleForm.autoReplyComment}
                  onChange={(e) => setRuleForm({ ...ruleForm, autoReplyComment: e.target.value })}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    Private Messenger Reply Message
                  </label>
                  <button
                    type="button"
                    onClick={() => setRuleForm({ ...ruleForm, autoReplyPrivateMessage: ruleForm.autoReplyPrivateMessage + ' {{name}}' })}
                    style={{ fontSize: '0.72rem', color: '#1877f2', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Insert {'{{name}}'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  className="form-input w-full"
                  placeholder="Hello {{name}}! Here is the special pricing and product link you requested: https://example.com"
                  value={ruleForm.autoReplyPrivateMessage}
                  onChange={(e) => setRuleForm({ ...ruleForm, autoReplyPrivateMessage: e.target.value })}
                />
              </div>

              {/* Action Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8f8fc', padding: 12, borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ruleForm.enableLikeComment}
                    onChange={(e) => setRuleForm({ ...ruleForm, enableLikeComment: e.target.checked })}
                  />
                  <span>Auto-like user's comment upon replying ❤️</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ruleForm.enableHideComment}
                    onChange={(e) => setRuleForm({ ...ruleForm, enableHideComment: e.target.checked })}
                  />
                  <span>Auto-hide offensive comments 🛡️</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #e4e4f0',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ruleSaving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: '#1877f2',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  {ruleSaving ? 'Saving...' : editingRule ? 'Update Campaign' : 'Create Campaign'}
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
  );

  if (embedded) return pageContent;
  return <AppLayout>{pageContent}</AppLayout>;
}
