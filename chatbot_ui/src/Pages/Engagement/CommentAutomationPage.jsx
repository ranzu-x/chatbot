import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { integrationAPI } from '../../services/api';
import CommentAutomationManager from '../../Components/Comments/CommentAutomationManager';
import { MessageSquare, Facebook, Instagram, Search, Radio } from 'lucide-react';

// Standalone Comment Automation screen — pulled out of Bot Manager →
// Automation → Engagement, where it lived as two platform-locked sub-tabs
// only reachable once a Facebook or Instagram account was already selected
// in Bot Manager's own (all-channels) account rail. Facebook/Instagram
// comment automation doesn't depend on anything else in Bot Manager, so it
// gets its own account rail here — scoped to just those two platforms —
// instead of borrowing one built for six.
export default function CommentAutomationPage() {
  const navigate = useNavigate();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await integrationAPI.getAll();
        const list = (res.data?.integrations || []).filter((i) =>
          ['FACEBOOK', 'INSTAGRAM'].includes((i.platform || '').toUpperCase())
        );
        setIntegrations(list);
        setSelectedId((prev) => prev || list[0]?.id || null);
      } catch (err) {
        console.error('Failed to load Facebook/Instagram accounts:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredIntegrations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return integrations;
    return integrations.filter((acc) => {
      const name = (acc.name || acc.fb_page_name || acc.ig_username || '').toLowerCase();
      const handle = (acc.ig_username || acc.fb_page_name || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [integrations, search]);

  const selectedAccount = integrations.find((i) => i.id === selectedId) || null;

  return (
    <AppLayout>
      {/* AppLayout's .page-wrapper defaults to height:auto/overflow:visible
          (it only switches to a fixed viewport height in Inbox mode), so an
          explicit height here — matching Bot Manager's own root — is what
          makes the rail and panel scroll internally instead of the whole
          page scrolling. */}
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

        {/* Left rail — Facebook/Instagram accounts only */}
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '18px 16px 12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eef2ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageSquare size={16} />
              </div>
              <h1 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>Comment Automation</h1>
            </div>
            <p style={{ margin: '2px 0 12px 0', fontSize: '0.76rem', color: '#64748b' }}>
              Auto-reply to post &amp; reel comments on your Facebook Pages and Instagram accounts.
            </p>
            <div style={{ position: 'relative' }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search accounts…"
                style={{ width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px 0 28px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#0f172a', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>Loading accounts…</div>
            ) : filteredIntegrations.length === 0 ? (
              integrations.length === 0 ? (
                <div style={{ padding: '18px 12px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                    No Facebook Page or Instagram account connected yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/connect-accounts')}
                    style={{ width: '100%', height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Radio size={13} /> Connect an account
                  </button>
                </div>
              ) : (
                <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>No accounts match "{search}"</div>
              )
            ) : (
              filteredIntegrations.map((acc) => {
                const isFb = (acc.platform || '').toUpperCase() === 'FACEBOOK';
                const name = acc.name || acc.fb_page_name || acc.ig_username || `${isFb ? 'Facebook' : 'Instagram'} Account`;
                const handle = isFb ? (acc.fb_page_name || 'Facebook Page') : (acc.ig_username ? `@${acc.ig_username}` : 'Instagram Account');
                const active = acc.id === selectedId;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedId(acc.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8,
                      border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
                      background: active ? '#eff6ff' : 'transparent',
                      boxShadow: active ? 'inset 0 0 0 1px #bfdbfe' : 'none',
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isFb ? 'rgba(24, 119, 242, 0.12)' : 'rgba(225, 48, 108, 0.12)',
                      color: isFb ? '#1877f2' : '#e1306c',
                    }}>
                      {isFb ? <Facebook size={14} /> : <Instagram size={14} />}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      <span style={{ fontSize: '0.71rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{handle}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right panel — Comment Automation for the selected account */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: 20, background: '#f8fafc' }}>
          {selectedAccount ? (
            <CommentAutomationManager
              key={selectedAccount.id}
              lockPlatform={(selectedAccount.platform || '').toUpperCase()}
              presetIntegrationId={selectedAccount.id}
              hideAccountSelector
            />
          ) : !loading && integrations.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.85rem' }}>
              Select an account on the left to manage its comment automation.
            </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
