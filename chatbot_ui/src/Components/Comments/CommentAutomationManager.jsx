import React, { useState, useEffect } from 'react';
import { commentAPI, integrationAPI } from '../../services/api';
import {
  MessageSquare,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Power,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  Shield,
  Send,
  ExternalLink,
  Layers,
  FileText,
  Filter,
  Check,
  X,
  Eye,
  EyeOff,
  Radio,
  Sliders,
  ChevronRight,
  ArrowRight,
  Info,
} from 'lucide-react';

export default function CommentAutomationManager({ defaultPlatform = 'FACEBOOK' }) {
  const [activeTab, setActiveTab] = useState('posts'); // 'posts' | 'campaigns'
  const [platform, setPlatform] = useState(defaultPlatform); // 'FACEBOOK' | 'INSTAGRAM'
  const [integrations, setIntegrations] = useState([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  
  const [posts, setPosts] = useState([]);
  const [pageWideRule, setPageWideRule] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Campaign Form State
  const [form, setForm] = useState({
    campaignName: '',
    platform: 'FACEBOOK',
    postId: 'ALL_POSTS',
    postData: null,
    triggerType: 'ALL', // 'ALL' | 'KEYWORDS'
    triggerKeywords: '',
    matchType: 'CONTAINS', // 'CONTAINS' | 'EXACT'
    excludeKeywords: '',
    autoReplyComment: '',
    commentVariations: ['Hi {{name}}, thanks for reaching out! Check your inbox for the details 📩', 'Hey {{first_name}}, sent you a direct message! ✨'],
    enableLikeComment: true,
    autoReplyPrivateMessage: 'Hi {{first_name}}! Thanks for commenting on our post. Here is the link you requested: https://example.com/special-offer',
    offensiveKeywords: 'scam, fake, hate, refund, cheat, fraud, spam',
    offensiveAction: 'HIDE', // 'NONE' | 'HIDE' | 'DELETE'
    offensiveReplyMessage: 'Hi {{first_name}}, please message our support team directly so we can resolve any issues for you.',
    replyMultipleTimes: false,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (selectedIntegrationId) {
      loadPostsAndCampaigns();
    }
  }, [selectedIntegrationId, platform]);

  const loadIntegrations = async () => {
    try {
      const res = await integrationAPI.getAll();
      const list = (res.data?.integrations || []).filter(
        (i) => i.platform === 'FACEBOOK' || i.platform === 'INSTAGRAM'
      );
      setIntegrations(list);
      const matched = list.find((i) => i.platform === platform) || list[0];
      if (matched) {
        setSelectedIntegrationId(matched.id);
        setPlatform(matched.platform);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPostsAndCampaigns = async () => {
    setLoading(true);
    try {
      const [postsRes, campaignsRes] = await Promise.all([
        commentAPI.getPosts({ integrationId: selectedIntegrationId, platform }),
        commentAPI.getCampaigns({ integrationId: selectedIntegrationId, platform }),
      ]);

      setPosts(postsRes.data?.posts || []);
      setPageWideRule(postsRes.data?.pageWideRule || null);
      setCampaigns(campaignsRes.data?.campaigns || []);
    } catch (err) {
      console.error('Failed to load posts & campaigns:', err);
      showToast('Could not load posts from Meta account', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = (targetPost = null) => {
    setEditingCampaignId(null);
    setForm({
      campaignName: targetPost ? `Post Automation: ${targetPost.message?.substring(0, 30)}...` : (platform === 'INSTAGRAM' ? 'Instagram Comment Automation' : 'Facebook Page Comment Automation'),
      platform: platform,
      postId: targetPost ? targetPost.id : 'ALL_POSTS',
      postData: targetPost ? { message: targetPost.message, picture: targetPost.picture, permalink: targetPost.permalink } : null,
      triggerType: 'ALL',
      triggerKeywords: 'price, buy, info, link, details, dm',
      matchType: 'CONTAINS',
      excludeKeywords: 'scam, fake, angry',
      autoReplyComment: 'Hi {{name}}, thanks for checking this out! Check your direct messages 📩',
      commentVariations: [
        'Hi {{name}}, thanks for checking this out! Check your direct messages 📩',
        'Hey {{first_name}}, I just sent the details to your inbox! ✨',
      ],
      enableLikeComment: true,
      autoReplyPrivateMessage: 'Hi {{first_name}}! Thanks for leaving a comment. Here is what you need:\n\n👉 Learn more here: https://example.com',
      offensiveKeywords: 'scam, fake, fraud, hate, refund, cheat, bad',
      offensiveAction: 'HIDE',
      offensiveReplyMessage: 'Hi {{first_name}}, please send us a direct message so our team can assist you directly.',
      replyMultipleTimes: false,
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (campaign) => {
    setEditingCampaignId(campaign.id);
    let variations = [];
    try {
      variations = typeof campaign.comment_variations === 'string'
        ? JSON.parse(campaign.comment_variations || '[]')
        : campaign.comment_variations || [];
    } catch {
      variations = [];
    }
    if (!variations.length && campaign.auto_reply_comment) {
      variations = [campaign.auto_reply_comment];
    }

    setForm({
      campaignName: campaign.campaign_name,
      platform: campaign.platform,
      postId: campaign.post_id,
      postData: typeof campaign.post_data === 'string' ? JSON.parse(campaign.post_data || 'null') : campaign.post_data,
      triggerType: campaign.trigger_type || 'ALL',
      triggerKeywords: campaign.trigger_keywords || '',
      matchType: campaign.match_type || 'CONTAINS',
      excludeKeywords: campaign.exclude_keywords || '',
      autoReplyComment: campaign.auto_reply_comment || '',
      commentVariations: variations.length ? variations : ['Hi {{name}}, thanks for your comment!'],
      enableLikeComment: Boolean(campaign.enable_like_comment),
      autoReplyPrivateMessage: campaign.auto_reply_private_message || '',
      offensiveKeywords: campaign.offensive_keywords || '',
      offensiveAction: campaign.offensive_action || 'NONE',
      offensiveReplyMessage: campaign.offensive_reply_message || '',
      replyMultipleTimes: Boolean(campaign.reply_multiple_times),
    });
    setModalOpen(true);
  };

  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    if (!form.campaignName.trim()) {
      showToast('Please enter a campaign name', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        integrationId: selectedIntegrationId,
        platform: platform,
        autoReplyComment: form.commentVariations[0] || form.autoReplyComment,
      };

      if (editingCampaignId) {
        await commentAPI.updateCampaign(editingCampaignId, payload);
        showToast('Campaign updated successfully!');
      } else {
        await commentAPI.createCampaign(payload);
        showToast('Comment Automation Campaign created!');
      }
      setModalOpen(false);
      loadPostsAndCampaigns();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to save campaign', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCampaign = async (id) => {
    try {
      const res = await commentAPI.toggleCampaign(id);
      showToast(res.data?.message || 'Status updated');
      loadPostsAndCampaigns();
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle campaign', 'error');
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Are you sure you want to delete this comment automation campaign?')) return;
    try {
      await commentAPI.deleteCampaign(id);
      showToast('Campaign deleted successfully');
      loadPostsAndCampaigns();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete campaign', 'error');
    }
  };

  const handleAddVariation = () => {
    setForm({
      ...form,
      commentVariations: [...form.commentVariations, ''],
    });
  };

  const handleRemoveVariation = (idx) => {
    const updated = form.commentVariations.filter((_, i) => i !== idx);
    setForm({
      ...form,
      commentVariations: updated.length ? updated : [''],
    });
  };

  const handleVariationChange = (idx, val) => {
    const updated = [...form.commentVariations];
    updated[idx] = val;
    setForm({
      ...form,
      commentVariations: updated,
    });
  };

  return (
    <div className="comment-automation-container" style={{ background: '#f8fafc', borderRadius: 12, padding: 20 }}>
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

      {/* Top Header: Account Selector & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20, background: '#ffffff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: platform === 'FACEBOOK' ? '#1877f215' : '#e1306c15', color: platform === 'FACEBOOK' ? '#1877f2' : '#e1306c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {platform === 'FACEBOOK' ? 'Facebook Comment Automation' : 'Instagram Comment Automation'}
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              Auto-reply to post comments publicly, send private DMs, auto-like comments, and moderate offensive comments.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Account Selector */}
          <select
            className="form-input"
            value={selectedIntegrationId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedIntegrationId(val);
              const found = integrations.find((i) => String(i.id) === String(val));
              if (found) setPlatform(found.platform);
            }}
            style={{ fontSize: '0.82rem', fontWeight: 600, height: 38, minWidth: 200 }}
          >
            {integrations.map((integ) => (
              <option key={integ.id} value={integ.id}>
                {integ.platform === 'FACEBOOK' ? '📘 ' : '📸 '} {integ.name || `${integ.platform} Account`}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadPostsAndCampaigns}
            disabled={loading}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal(null)}
            style={{ height: 38, padding: '0 16px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)' }}
          >
            <Plus size={15} />
            Create Campaign
          </button>
        </div>
      </div>

      {/* Whole Page / Account-Wide Automation Banner */}
      <div style={{ background: pageWideRule ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#ffffff', border: `1px solid ${pageWideRule ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: pageWideRule ? '#2563eb' : '#f1f5f9', color: pageWideRule ? '#ffffff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sliders size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                Account-Wide / All Posts Automation
              </strong>
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, fontWeight: 700, background: pageWideRule ? '#10b98120' : '#f1f5f9', color: pageWideRule ? '#059669' : '#64748b', border: `1px solid ${pageWideRule ? '#a7f3d0' : '#e2e8f0'}` }}>
                {pageWideRule ? '🟢 Active on All Posts' : '⚪ Not Set'}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#475569', margin: '2px 0 0 0' }}>
              {pageWideRule
                ? `Campaign: "${pageWideRule.campaign_name}" automatically replies to comments on all existing and future posts.`
                : 'Enable a default comment automation rule that automatically triggers on all posts across this account.'}
            </p>
          </div>
        </div>

        <div>
          {pageWideRule ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleOpenEditModal(pageWideRule)}
                style={{ padding: '6px 14px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Edit2 size={12} /> Edit Page Rule
              </button>
              <button
                type="button"
                onClick={() => handleToggleCampaign(pageWideRule.id)}
                style={{ padding: '6px 14px', borderRadius: 6, background: '#fee2e2', border: '1px solid #fecaca', fontSize: '0.78rem', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
              >
                Pause
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenCreateModal(null)}
              style={{ padding: '7px 16px', borderRadius: 8, background: '#0f172a', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={13} /> Set Whole-Page Automation
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Posts View vs Campaigns View */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.82rem',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'posts' ? '#2563eb' : '#ffffff',
            color: activeTab === 'posts' ? '#ffffff' : '#64748b',
            boxShadow: activeTab === 'posts' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Layers size={14} /> Posts & Reels ({posts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('campaigns')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.82rem',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'campaigns' ? '#2563eb' : '#ffffff',
            color: activeTab === 'campaigns' ? '#ffffff' : '#64748b',
            boxShadow: activeTab === 'campaigns' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sliders size={14} /> Created Campaigns ({campaigns.length})
        </button>
      </div>

      {/* ─── TAB 1: POSTS & REELS BROWSER ─── */}
      {activeTab === 'posts' && (
        <div>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', background: '#ffffff', borderRadius: 12 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Fetching latest posts from Meta...</span>
            </div>
          ) : posts.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <MessageSquare size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Posts Found
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: 400, margin: '0 auto 16px' }}>
                We couldn't find any published posts on this account. Make sure your account is connected with valid permissions.
              </p>
              <button
                type="button"
                onClick={() => handleOpenCreateModal(null)}
                className="btn btn-primary btn-sm"
              >
                Create Account-Wide Campaign
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {posts.map((post) => {
                const hasRule = Boolean(post.rule);
                const isInherited = post.rule?.isInherited;

                return (
                  <div
                    key={post.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: 12,
                      border: `1px solid ${hasRule && !isInherited ? '#93c5fd' : '#e2e8f0'}`,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    {/* Post Image Header (if exists) */}
                    {post.picture && (
                      <div style={{ height: 160, background: '#0f172a', overflow: 'hidden', position: 'relative' }}>
                        <img
                          src={post.picture}
                          alt="Post"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.65)',
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          {post.platform}
                        </div>
                      </div>
                    )}

                    {/* Post Content */}
                    <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ fontSize: '0.82rem', color: '#1e293b', margin: '0 0 10px 0', lineHeight: 1.4, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {post.message}
                      </p>

                      {/* Engagement Counters */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.74rem', color: '#64748b', padding: '8px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', marginBottom: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ThumbsUp size={12} color="#2563eb" /> {post.likes_count} likes
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MessageSquare size={12} color="#059669" /> {post.comments_count} comments
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#94a3b8' }}>
                          {post.created_time ? new Date(post.created_time).toLocaleDateString() : ''}
                        </span>
                      </div>

                      {/* Automation Status Badge & Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        {hasRule ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#059669' }}>
                              {isInherited ? 'Page Default Rule' : 'Post Automation'}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                            No Automation
                          </span>
                        )}

                        <div style={{ display: 'flex', gap: 6 }}>
                          {hasRule && !isInherited ? (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(post.rule)}
                              style={{ padding: '5px 10px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Edit2 size={11} /> Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateModal(post)}
                              style={{ padding: '5px 12px', borderRadius: 6, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Plus size={11} /> Set Automation
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: CAMPAIGNS & PRESETS MANAGER ─── */}
      {activeTab === 'campaigns' && (
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {campaigns.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Sliders size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Comment Automation Campaigns
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: 400, margin: '0 auto 16px' }}>
                Create comment automation rules to automatically reply to comments and send private DMs.
              </p>
              <button
                type="button"
                onClick={() => handleOpenCreateModal(null)}
                className="btn btn-primary btn-sm"
              >
                Create First Campaign
              </button>
            </div>
          ) : (
            <table className="table w-full" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Campaign Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Target Post</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Trigger Rule</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Public Reply</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Private DM</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Replies Sent</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((camp) => (
                  <tr key={camp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.85rem' }}>{camp.platform === 'FACEBOOK' ? '📘' : '📸'}</span>
                        {camp.campaign_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {camp.post_id === 'ALL_POSTS' ? (
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', fontWeight: 700, fontSize: '0.72rem', color: '#0f172a' }}>
                          ⚡ All Posts (Page-Wide)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          Post: {camp.post_id.substring(0, 15)}...
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {camp.trigger_type === 'ALL' ? (
                        <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>All Comments</span>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: '#2563eb', fontWeight: 600 }}>
                          Keywords: {camp.trigger_keywords?.substring(0, 20)}...
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {camp.auto_reply_comment ? (
                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={12} /> Yes {camp.enable_like_comment ? '(+Like)' : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {camp.auto_reply_private_message ? (
                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={12} /> Yes (DM)
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {camp.total_comment_replies + camp.total_private_replies}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleCampaign(camp.id)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 20,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          background: camp.is_active ? '#10b98120' : '#f1f5f9',
                          color: camp.is_active ? '#059669' : '#94a3b8',
                        }}
                      >
                        {camp.is_active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(camp)}
                          style={{ padding: '4px 8px', borderRadius: 6, background: '#f1f5f9', border: 'none', color: '#475569', cursor: 'pointer' }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCampaign(camp.id)}
                          style={{ padding: '4px 8px', borderRadius: 6, background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── MODAL: DEDICATED CAMPAIGN BUILDER & SIMULATOR ─── */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 940, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#2563eb15', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {editingCampaignId ? 'Edit Comment Automation Campaign' : 'Create Comment Automation Campaign'}
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {platform === 'FACEBOOK' ? 'Facebook Page' : 'Instagram Business'} • {form.postId === 'ALL_POSTS' ? 'All Posts (Page-Wide)' : 'Specific Post'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: 2 Columns (Form on left, Live Simulator on right) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', flex: 1, overflowY: 'auto' }}>
              {/* Left Column: Form Settings */}
              <form id="campaignForm" onSubmit={handleSaveCampaign} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* 1. Campaign Name & Target */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input w-full"
                    placeholder="e.g. Black Friday Lead Magnet"
                    value={form.campaignName}
                    onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
                  />
                </div>

                {/* 2. Trigger Type & Keywords */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                    Comment Trigger Condition
                  </label>
                  <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="triggerType"
                        checked={form.triggerType === 'ALL'}
                        onChange={() => setForm({ ...form, triggerType: 'ALL' })}
                      />
                      Trigger on All Comments
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="triggerType"
                        checked={form.triggerType === 'KEYWORDS'}
                        onChange={() => setForm({ ...form, triggerType: 'KEYWORDS' })}
                      />
                      Specific Keywords Only
                    </label>
                  </div>

                  {form.triggerType === 'KEYWORDS' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                        Trigger Keywords (comma-separated)
                      </label>
                      <input
                        type="text"
                        className="form-input w-full"
                        placeholder="e.g. price, buy, info, link, dm, send"
                        value={form.triggerKeywords}
                        onChange={(e) => setForm({ ...form, triggerKeywords: e.target.value })}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                      Exclude Keywords (Comments containing these will be ignored)
                    </label>
                    <input
                      type="text"
                      className="form-input w-full"
                      placeholder="e.g. scam, hate, refund, angry"
                      value={form.excludeKeywords}
                      onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })}
                    />
                  </div>
                </div>

                {/* 3. Public Comment Reply Variations */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MessageSquare size={14} color="#2563eb" /> Public Comment Auto-Reply (Rotating Variations)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddVariation}
                      style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Plus size={11} /> Add Variation
                    </button>
                  </div>

                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 10px 0' }}>
                    Rotating multiple replies prevents spam penalties. Available tags: <code>{'{{name}}'}</code>, <code>{'{{first_name}}'}</code>.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.commentVariations.map((variation, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={`Reply Variation ${idx + 1}...`}
                          value={variation}
                          onChange={(e) => handleVariationChange(idx, e.target.value)}
                          style={{ flex: 1, fontSize: '0.8rem' }}
                        />
                        {form.commentVariations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariation(idx)}
                            style={{ padding: '6px 8px', borderRadius: 6, background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.enableLikeComment}
                        onChange={(e) => setForm({ ...form, enableLikeComment: e.target.checked })}
                      />
                      <ThumbsUp size={13} color="#2563eb" /> Automatically Like commenter's comment
                    </label>
                  </div>
                </div>

                {/* 4. Private DM Auto-Reply */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Send size={14} color="#059669" /> Private DM Reply (Direct to Messenger / IG Inbox)
                  </label>
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 8px 0' }}>
                    Sent automatically into the commenter's inbox as soon as they leave a comment.
                  </p>
                  <textarea
                    rows={3}
                    className="form-input w-full"
                    placeholder="Hi {{first_name}}! Thanks for leaving a comment. Here is the link: https://example.com"
                    value={form.autoReplyPrivateMessage}
                    onChange={(e) => setForm({ ...form, autoReplyPrivateMessage: e.target.value })}
                    style={{ fontSize: '0.8rem' }}
                  />
                </div>

                {/* 5. Offensive Comments Moderation */}
                <div style={{ background: '#fff1f2', padding: 14, borderRadius: 10, border: '1px solid #fecdd3' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#9f1239', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={14} color="#e11d48" /> Offensive Comments Moderation
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10, marginTop: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9f1239', marginBottom: 2 }}>
                        Action to Take
                      </label>
                      <select
                        className="form-input w-full"
                        value={form.offensiveAction}
                        onChange={(e) => setForm({ ...form, offensiveAction: e.target.value })}
                        style={{ fontSize: '0.78rem' }}
                      >
                        <option value="NONE">None</option>
                        <option value="HIDE">🛡️ Hide Comment</option>
                        <option value="DELETE">🗑️ Delete Comment</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9f1239', marginBottom: 2 }}>
                        Offensive Keywords List
                      </label>
                      <input
                        type="text"
                        className="form-input w-full"
                        placeholder="scam, fake, fraud, hate, refund"
                        value={form.offensiveKeywords}
                        onChange={(e) => setForm({ ...form, offensiveKeywords: e.target.value })}
                        style={{ fontSize: '0.78rem' }}
                      />
                    </div>
                  </div>
                </div>
              </form>

              {/* Right Column: Live Mobile Mockup Preview */}
              <div style={{ background: '#f1f5f9', padding: 24, borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} color="#2563eb" /> Live Customer Interaction Simulation
                </div>

                {/* Simulated Post & Comment Box */}
                <div style={{ width: '100%', maxWidth: 320, background: '#ffffff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                    💬 Public Post Comment
                  </div>
                  {/* User Comment */}
                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, fontSize: '0.74rem', marginBottom: 8 }}>
                    <strong>Alice:</strong> <em>"How much does this cost? Can I get the link?"</em>
                  </div>
                  {/* Bot Auto-Reply */}
                  <div style={{ background: '#eff6ff', padding: 8, borderRadius: 8, fontSize: '0.74rem', borderLeft: '3px solid #2563eb' }}>
                    <strong>Your Brand:</strong> {form.commentVariations[0]?.replace('{{name}}', 'Alice').replace('{{first_name}}', 'Alice') || 'Hi Alice, check your inbox!'}
                  </div>
                </div>

                {/* Simulated Messenger / IG DM Box */}
                <div style={{ width: '100%', maxWidth: 320, background: '#ffffff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Send size={12} /> Private DM (Direct Message)
                  </div>
                  <div style={{ background: '#ecfdf5', padding: 10, borderRadius: 8, fontSize: '0.74rem', color: '#065f46', whiteSpace: 'pre-line', border: '1px solid #a7f3d0' }}>
                    {form.autoReplyPrivateMessage?.replace('{{name}}', 'Alice').replace('{{first_name}}', 'Alice') || 'Hi Alice! Here is your link...'}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="campaignForm"
                disabled={saving}
                style={{ padding: '8px 22px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.82rem', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
              >
                {saving ? 'Saving Campaign...' : (editingCampaignId ? 'Update Campaign' : 'Save & Activate Campaign')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
