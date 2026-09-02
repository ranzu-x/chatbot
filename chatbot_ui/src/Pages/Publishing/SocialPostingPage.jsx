import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { socialPostAPI, integrationAPI } from '../../services/api';
import {
  Send,
  Calendar,
  Image,
  Video,
  Layers,
  Link2,
  FileText,
  Trash2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  X,
  Facebook,
  Instagram,
  ThumbsUp,
  MessageSquare,
  Share2,
  Heart,
  Bookmark,
  Sparkles,
  Filter,
} from 'lucide-react';

export default function SocialPostingPage() {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'history'
  const [integrations, setIntegrations] = useState([]);
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  // Composer Form State
  const [postType, setPostType] = useState('IMAGE'); // 'TEXT' | 'IMAGE' | 'CAROUSEL' | 'VIDEO' | 'LINK'
  const [message, setMessage] = useState('');
  const [mediaUrls, setMediaUrls] = useState(['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800']);
  const [linkUrl, setLinkUrl] = useState('');
  const [previewPlatform, setPreviewPlatform] = useState('FACEBOOK'); // 'FACEBOOK' | 'INSTAGRAM'

  // Scheduling State
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // Publishing & History State
  const [publishing, setPublishing] = useState(false);
  const [historyPosts, setHistoryPosts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    loadIntegrations();
    loadHistory();
  }, []);

  const loadIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const res = await integrationAPI.getAll();
      const list = (res.data?.integrations || []).filter(
        (i) => i.platform === 'FACEBOOK' || i.platform === 'INSTAGRAM'
      );
      setIntegrations(list);
      if (list.length > 0) {
        setSelectedIntegrationIds([list[0].id]);
        setPreviewPlatform(list[0].platform);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await socialPostAPI.getAll({ status: historyFilter });
      setHistoryPosts(res.data?.posts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, historyFilter]);

  const toggleAccountSelection = (id) => {
    setSelectedIntegrationIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]
    );
  };

  const handleAddMediaUrl = () => {
    setMediaUrls([...mediaUrls, '']);
  };

  const handleRemoveMediaUrl = (index) => {
    const updated = mediaUrls.filter((_, idx) => idx !== index);
    setMediaUrls(updated.length ? updated : ['']);
  };

  const handleMediaUrlChange = (index, value) => {
    const updated = [...mediaUrls];
    updated[index] = value;
    setMediaUrls(updated);
  };

  const handlePublishOrSchedule = async (e) => {
    e.preventDefault();
    if (!selectedIntegrationIds.length) {
      showToast('Please select at least one Facebook Page or Instagram account', 'error');
      return;
    }

    const filteredMedia = mediaUrls.filter((u) => u.trim() !== '');

    if (postType === 'IMAGE' && !filteredMedia.length) {
      showToast('Please provide an image URL for photo post', 'error');
      return;
    }
    if (postType === 'VIDEO' && !filteredMedia.length) {
      showToast('Please provide a video URL for video/reel post', 'error');
      return;
    }
    if (postType === 'CAROUSEL' && filteredMedia.length < 2) {
      showToast('Carousel requires at least 2 image URLs', 'error');
      return;
    }
    const hasInstagram = selectedIntegrationIds.some(id => integrations.find(i => i.id === id)?.platform === 'INSTAGRAM');
    if (hasInstagram && (!filteredMedia || !filteredMedia.length)) {
      showToast('Instagram posts require at least one photo or video URL. Please attach media.', 'error');
      return;
    }

    if (postType === 'TEXT' && !message.trim()) {
      showToast('Please write a message caption for your post', 'error');
      return;
    }

    setPublishing(true);
    try {
      if (isScheduling) {
        if (!scheduledAt) {
          showToast('Please select a scheduled date and time', 'error');
          setPublishing(false);
          return;
        }
        const res = await socialPostAPI.schedule({
          integrationIds: selectedIntegrationIds,
          postType,
          message: message.trim(),
          mediaUrls: filteredMedia,
          linkUrl: linkUrl.trim(),
          scheduledAt,
        });
        showToast(res.data?.message || 'Post scheduled successfully!');
      } else {
        const res = await socialPostAPI.publish({
          integrationIds: selectedIntegrationIds,
          postType,
          message: message.trim(),
          mediaUrls: filteredMedia,
          linkUrl: linkUrl.trim(),
        });
        showToast(res.data?.message || 'Post published successfully!');
      }

      // Reset form
      setMessage('');
      setLinkUrl('');
      setIsScheduling(false);
      setScheduledAt('');
      loadHistory();
      setActiveTab('history');
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to publish post';
      showToast(errMsg, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteHistoryPost = async (id) => {
    if (!window.confirm('Are you sure you want to delete this post record?')) return;
    try {
      await socialPostAPI.delete(id);
      showToast('Post record deleted');
      setHistoryPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete post', 'error');
    }
  };

  // Active target accounts for preview
  const primarySelectedAccount = integrations.find((i) => selectedIntegrationIds.includes(i.id)) || integrations[0];

  return (
    <AppLayout>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px', fontFamily: 'inherit' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 24,
              right: 24,
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: 8,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.84rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Page Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
              Social Post Publishing
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
              Create, preview, schedule, and publish posts to your connected Facebook Pages and Instagram accounts.
            </p>
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 8, gap: 4 }}>
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              style={{
                padding: '7px 18px',
                borderRadius: 6,
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'create' ? '#ffffff' : 'transparent',
                color: activeTab === 'create' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'create' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Send size={13} /> Create Post
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              style={{
                padding: '7px 18px',
                borderRadius: 6,
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'history' ? '#ffffff' : 'transparent',
                color: activeTab === 'history' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'history' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Clock size={13} /> Post History & Logs ({historyPosts.length})
            </button>
          </div>
        </div>

        {/* ─── TAB 1: CREATE POST (COMPOSER + LIVE PREVIEW) ─── */}
        {activeTab === 'create' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(320px, 420px)', gap: 24, alignItems: 'start' }}>
            {/* Left Column: Post Composer */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <form onSubmit={handlePublishOrSchedule}>
                {/* 1. Target Account Selector */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                    1. Select Publishing Accounts
                  </label>
                  {loadingIntegrations ? (
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Loading accounts...</div>
                  ) : integrations.length === 0 ? (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.78rem', color: '#64748b' }}>
                      No Facebook Pages or Instagram accounts connected. Please go to <strong>Connect Account</strong> to link your accounts.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {integrations.map((integ) => {
                        const isSelected = selectedIntegrationIds.includes(integ.id);
                        const isFb = integ.platform === 'FACEBOOK';
                        return (
                          <button
                            key={integ.id}
                            type="button"
                            onClick={() => toggleAccountSelection(integ.id)}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: `1px solid ${isSelected ? (isFb ? '#bfdbfe' : '#fbcfe8') : '#e2e8f0'}`,
                              background: isSelected ? (isFb ? '#eff6ff' : '#fdf2f8') : '#ffffff',
                              color: isSelected ? (isFb ? '#1d4ed8' : '#be185d') : '#475569',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.15s',
                            }}
                          >
                            {isFb ? <Facebook size={14} color="#1877f2" /> : <Instagram size={14} color="#e1306c" />}
                            <span>{integ.name || integ.fb_page_name || 'Account'}</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.75, fontWeight: 500 }}>
                              {isFb ? '(Page)' : integ.ig_username ? `(@${integ.ig_username})` : '(Instagram)'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedIntegrationIds.some(id => integrations.find(i => i.id === id)?.platform === 'INSTAGRAM') && ['TEXT', 'LINK'].includes(postType) && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fdf2f8', border: '1px solid #fbcfe8', fontSize: '0.76rem', color: '#be185d', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      <span><strong>Instagram Notice:</strong> Instagram requires an image or video for all posts. Please choose <strong>Photo</strong>, <strong>Carousel</strong>, or <strong>Video</strong> format.</span>
                    </div>
                  )}
                </div>

                {/* 2. Post Format Selector */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                    2. Post Format
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                    {[
                      { id: 'TEXT', label: 'Text Status', icon: FileText },
                      { id: 'IMAGE', label: 'Photo', icon: Image },
                      { id: 'CAROUSEL', label: 'Carousel', icon: Layers },
                      { id: 'VIDEO', label: 'Video / Reel', icon: Video },
                      { id: 'LINK', label: 'Link', icon: Link2 },
                    ].map((item) => {
                      const isActive = postType === item.id;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPostType(item.id)}
                          style={{
                            padding: '10px 8px',
                            borderRadius: 8,
                            border: `1px solid ${isActive ? '#93c5fd' : '#e2e8f0'}`,
                            background: isActive ? '#f0f7ff' : '#ffffff',
                            color: isActive ? '#1d4ed8' : '#64748b',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            transition: 'all 0.15s',
                          }}
                        >
                          <Icon size={16} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Post Content / Caption */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                      3. Post Caption / Message
                    </label>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {message.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    className="form-input w-full"
                    placeholder="Write your post caption, thoughts, hashtags, or announcements..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    style={{ fontSize: '0.82rem', resize: 'vertical' }}
                  />
                </div>

                {/* 4. Media URLs Input (Photo / Carousel / Video) */}
                {(postType === 'IMAGE' || postType === 'CAROUSEL' || postType === 'VIDEO') && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                        4. {postType === 'VIDEO' ? 'Video URL' : postType === 'CAROUSEL' ? 'Carousel Image URLs' : 'Image URL'}
                      </label>
                      {postType === 'CAROUSEL' && (
                        <button
                          type="button"
                          onClick={handleAddMediaUrl}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Plus size={12} /> Add Another Image
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mediaUrls.map((url, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-input w-full"
                            placeholder={postType === 'VIDEO' ? 'https://example.com/sample-video.mp4' : 'https://example.com/photo.jpg'}
                            value={url}
                            onChange={(e) => handleMediaUrlChange(idx, e.target.value)}
                            style={{ fontSize: '0.78rem' }}
                          />
                          {mediaUrls.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMediaUrl(idx)}
                              style={{
                                background: '#fee2e2',
                                border: 'none',
                                borderRadius: 6,
                                width: 32,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#b91c1c',
                                flexShrink: 0,
                              }}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Link URL Input (for Link posts) */}
                {postType === 'LINK' && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      4. Web Link Destination
                    </label>
                    <input
                      type="url"
                      className="form-input w-full"
                      placeholder="https://yourwebsite.com/promotion"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      style={{ fontSize: '0.78rem' }}
                    />
                  </div>
                )}

                {/* 6. Scheduling Option Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={15} color="#475569" />
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                        Schedule for Later Date & Time
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isScheduling}
                      onChange={(e) => setIsScheduling(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </div>

                  {isScheduling && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #cbd5e1' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                        Select Publication Date & Time:
                      </label>
                      <input
                        type="datetime-local"
                        className="form-input w-full"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        style={{ fontSize: '0.78rem' }}
                      />
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="submit"
                    disabled={publishing}
                    style={{
                      padding: '9px 24px',
                      borderRadius: 8,
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: publishing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)',
                    }}
                  >
                    {publishing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> {isScheduling ? 'Scheduling...' : 'Publishing...'}
                      </>
                    ) : isScheduling ? (
                      <>
                        <Clock size={14} /> Schedule Post
                      </>
                    ) : (
                      <>
                        <Send size={14} /> Publish Post Now
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Live Mockup Preview */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>
                  Live Post Preview
                </span>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform('FACEBOOK')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: previewPlatform === 'FACEBOOK' ? '#ffffff' : 'transparent',
                      color: previewPlatform === 'FACEBOOK' ? '#1877f2' : '#64748b',
                    }}
                  >
                    📘 Facebook
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform('INSTAGRAM')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: previewPlatform === 'INSTAGRAM' ? '#ffffff' : 'transparent',
                      color: previewPlatform === 'INSTAGRAM' ? '#e1306c' : '#64748b',
                    }}
                  >
                    📸 Instagram
                  </button>
                </div>
              </div>

              {/* ── Facebook Post Mockup ── */}
              {previewPlatform === 'FACEBOOK' && (
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                  {/* FB Header */}
                  <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1877f220', color: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.86rem' }}>
                      {(primarySelectedAccount?.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                        {primarySelectedAccount?.name || 'Your Facebook Page'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        Just now · 🌐 Public
                      </div>
                    </div>
                  </div>

                  {/* FB Caption */}
                  {message ? (
                    <div style={{ padding: '0 14px 12px', fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                      {message}
                    </div>
                  ) : (
                    <div style={{ padding: '0 14px 12px', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      Your post text will appear here...
                    </div>
                  )}

                  {/* FB Media Display */}
                  {mediaUrls.filter((u) => u.trim()).length > 0 && postType !== 'TEXT' && (
                    <div style={{ width: '100%', maxHeight: 260, overflow: 'hidden', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {postType === 'VIDEO' ? (
                        <video src={mediaUrls[0]} controls style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />
                      ) : (
                        <img src={mediaUrls[0]} alt="Preview" style={{ width: '100%', height: 260, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      )}
                    </div>
                  )}

                  {/* FB Link Card Display */}
                  {postType === 'LINK' && linkUrl && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', padding: 12 }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
                        {linkUrl.replace(/^https?:\/\//, '').split('/')[0]}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', margin: '2px 0' }}>
                        Link Preview Title
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {linkUrl}
                      </div>
                    </div>
                  )}

                  {/* FB Reaction Footer */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-around', fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ThumbsUp size={14} /> Like</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={14} /> Comment</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Share2 size={14} /> Share</span>
                  </div>
                </div>
              )}

              {/* ── Instagram Post Mockup ── */}
              {previewPlatform === 'INSTAGRAM' && (
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                  {/* IG Header */}
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', padding: 2 }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.76rem', color: '#e1306c' }}>
                        {(primarySelectedAccount?.name || 'I').charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                        {(primarySelectedAccount?.name || 'your_brand').toLowerCase().replace(/\s+/g, '_')}
                      </div>
                    </div>
                  </div>

                  {/* IG Image/Video Display */}
                  <div style={{ width: '100%', height: 280, background: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {mediaUrls.filter((u) => u.trim()).length > 0 ? (
                      postType === 'VIDEO' ? (
                        <video src={mediaUrls[0]} controls style={{ width: '100%', height: 280, objectFit: 'contain' }} />
                      ) : (
                        <img src={mediaUrls[0]} alt="IG Post" style={{ width: '100%', height: 280, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      )
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>No image attached</span>
                    )}
                  </div>

                  {/* IG Action Icons */}
                  <div style={{ padding: '10px 14px 6px', display: 'flex', justifyContent: 'space-between', color: '#1e293b' }}>
                    <div style={{ display: 'flex', gap: 14 }}>
                      <Heart size={18} />
                      <MessageSquare size={18} />
                      <Send size={18} />
                    </div>
                    <Bookmark size={18} />
                  </div>

                  {/* IG Caption */}
                  <div style={{ padding: '0 14px 12px', fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.4 }}>
                    <strong style={{ marginRight: 6 }}>
                      {(primarySelectedAccount?.name || 'your_brand').toLowerCase().replace(/\s+/g, '_')}
                    </strong>
                    {message || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Caption will appear here...</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 2: POST HISTORY & LOGS TABLE ─── */}
        {activeTab === 'history' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table Header Filter */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Filter size={15} color="#64748b" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Filter Status:</span>
                <select
                  className="form-input"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  style={{ height: 32, fontSize: '0.78rem', padding: '0 8px' }}
                >
                  <option value="ALL">All Posts</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>

              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {/* Table Content */}
            {loadingHistory ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                Loading post logs...
              </div>
            ) : historyPosts.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <FileText size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                  No Posts Found
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 14px 0' }}>
                  You haven't created or published any posts with this filter yet.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Create Your First Post
                </button>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px' }}>Account</th>
                    <th style={{ padding: '12px 16px' }}>Type</th>
                    <th style={{ padding: '12px 16px' }}>Caption Excerpt</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPosts.map((post) => {
                    const isFb = post.platform === 'FACEBOOK';
                    return (
                      <tr key={post.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {/* Account */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                            {isFb ? <Facebook size={14} color="#1877f2" /> : <Instagram size={14} color="#e1306c" />}
                            {post.account_name || post.platform}
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                            {post.post_type}
                          </span>
                        </td>

                        {/* Caption */}
                        <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#334155' }}>
                            {post.message || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>[Media / Link Only]</span>}
                          </div>
                        </td>

                        {/* Date */}
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.74rem' }}>
                          {post.published_at
                            ? new Date(post.published_at).toLocaleString()
                            : post.scheduled_at
                            ? `Scheduled: ${new Date(post.scheduled_at).toLocaleString()}`
                            : new Date(post.created_at).toLocaleString()}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 16px' }}>
                          {post.status === 'PUBLISHED' && (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#ecfdf5', color: '#059669', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                              🟢 Published
                            </span>
                          )}
                          {post.status === 'SCHEDULED' && (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#eff6ff', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                              ⏰ Scheduled
                            </span>
                          )}
                          {post.status === 'FAILED' && (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#fef2f2', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #fecaca' }}>
                              🔴 Failed
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {post.meta_permalink && (
                              <a
                                href={post.meta_permalink}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  background: '#f8fafc',
                                  border: '1px solid #cbd5e1',
                                  color: '#2563eb',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <ExternalLink size={11} /> View
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteHistoryPost(post.id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: '#fff1f2',
                                border: 'none',
                                color: '#e11d48',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
