import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { integrationAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { showAlert, showLimitModal, notify } from '../../utils/alerts';
import {
  Radio, MessageCircle, Facebook, Instagram, Send, Globe, Video,
  Plus, Search, RefreshCw, Trash2, SlidersHorizontal, ShieldCheck,
} from 'lucide-react';

/**
 * Connect Account — "Channel Hub" layout.
 *
 * Each channel has exactly ONE connect affordance — the card's own button —
 * replacing the old page's three routes to the same place (header modal,
 * metric card, tab) plus a fourth, real Connect button on the embedded
 * channel page. Deep management opens the channel's own standalone route
 * rather than embedding that page here, so its header is the page header
 * rather than a second one stacked under this page's.
 */

const CHANNELS = [
  {
    id: 'WHATSAPP', label: 'WhatsApp', route: '/channels/whatsapp',
    color: '#25d366', tint: 'rgba(37, 211, 102, 0.1)', Icon: MessageCircle,
    one: 'number', many: 'numbers', manage: 'Manage numbers', connect: 'Connect WhatsApp',
    blurb: 'Business numbers, approved templates and catalog.',
  },
  {
    id: 'FACEBOOK', label: 'Facebook Messenger', route: '/channels/facebook',
    color: '#1877f2', tint: 'rgba(24, 119, 242, 0.1)', Icon: Facebook,
    one: 'page', many: 'pages', manage: 'Manage pages', connect: 'Connect Messenger',
    blurb: 'Page inbox, comment automation and private replies.',
  },
  {
    id: 'INSTAGRAM', label: 'Instagram Direct', route: '/channels/instagram',
    color: '#e1306c', tint: 'rgba(225, 48, 108, 0.1)', Icon: Instagram,
    one: 'account', many: 'accounts', manage: 'Manage accounts', connect: 'Connect Instagram',
    blurb: 'Business profile DMs and story replies.',
  },
  {
    id: 'TELEGRAM', label: 'Telegram Bot', route: '/channels/telegram',
    color: '#229ed9', tint: 'rgba(34, 158, 217, 0.1)', Icon: Send,
    one: 'bot', many: 'bots', manage: 'Manage bots', connect: 'Connect Telegram',
    blurb: 'BotFather tokens. No time-window limit.',
  },
  {
    id: 'TIKTOK', label: 'TikTok', route: '/channels/tiktok',
    color: '#FE2C55', tint: 'rgba(254, 44, 85, 0.1)', Icon: Video,
    one: 'account', many: 'accounts', manage: 'Manage accounts', connect: 'Connect TikTok',
    blurb: 'DMs and comment automation. Reply-only, 48 hours.',
  },
  {
    id: 'WEBCHAT', label: 'Live Webchat', route: '/channels/webchat',
    color: '#6366f1', tint: 'rgba(99, 102, 241, 0.1)', Icon: Globe,
    one: 'widget', many: 'widgets', manage: 'Manage widgets', connect: 'Create a widget',
    blurb: 'Embeddable website chat widget.',
  },
];

const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));

function channelOf(platform) {
  return CHANNEL_BY_ID[(platform || '').toUpperCase()] || {
    id: 'OTHER', label: platform || 'Channel', route: '/connect-accounts',
    color: '#64748b', tint: 'rgba(100, 116, 139, 0.1)', Icon: Radio,
    one: 'account', many: 'accounts', manage: 'Manage', connect: 'Connect',
  };
}

/** The human name for one connected account — `integrations.name` is
 * populated for every channel, with the per-platform field as a fallback. */
function displayName(item) {
  const p = (item.platform || '').toUpperCase();
  if (item.name) return item.name;
  if (p === 'WHATSAPP') return item.wa_display_phone || `Number #${item.id}`;
  if (p === 'FACEBOOK') return item.fb_page_name || `Page #${item.id}`;
  if (p === 'INSTAGRAM') return item.ig_username ? `@${item.ig_username}` : `Account #${item.id}`;
  if (p === 'TELEGRAM') return item.tg_bot_username ? `@${item.tg_bot_username}` : `Bot #${item.id}`;
  if (p === 'TIKTOK') return item.tiktok_username ? `@${item.tiktok_username}` : `Account #${item.id}`;
  return `${channelOf(p).label} #${item.id}`;
}

/** The platform-side id an operator would recognise this account by. */
function identifier(item) {
  const p = (item.platform || '').toUpperCase();
  if (p === 'WHATSAPP') return item.wa_display_phone || item.wa_phone_number_id || `ID ${item.id}`;
  if (p === 'FACEBOOK') return item.fb_page_id || `ID ${item.id}`;
  if (p === 'INSTAGRAM') return item.ig_username ? `@${item.ig_username}` : (item.ig_account_id || `ID ${item.id}`);
  if (p === 'TELEGRAM') return item.tg_bot_username ? `@${item.tg_bot_username}` : `ID ${item.id}`;
  if (p === 'TIKTOK') return item.tiktok_username ? `@${item.tiktok_username}` : (item.tiktok_open_id || `ID ${item.id}`);
  return `ID ${item.id}`;
}

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 16,
  boxShadow: 'var(--shadow)',
  display: 'flex',
  flexDirection: 'column',
  gap: 11,
};

const labelStyle = {
  fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

function StatusPill({ active }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600, color: active ? 'var(--success)' : 'var(--warning)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--success)' : 'var(--warning)' }} />
      {active ? 'Connected' : 'Inactive'}
    </span>
  );
}

function ChannelCard({ channel, accounts, onGo, onMore }) {
  const { Icon } = channel;
  const count = accounts.length;
  const connected = count > 0;
  const shown = accounts.slice(0, 2);
  const extra = count - shown.length;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: channel.tint, color: channel.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{channel.label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {connected ? `${count} ${count === 1 ? channel.one : channel.many} connected` : 'Not connected'}
          </div>
        </div>
      </div>

      {connected ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((a) => (
            <span
              key={a.id}
              title={displayName(a)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', maxWidth: '100%' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.is_active ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(a)}</span>
            </span>
          ))}
          {extra > 0 && (
            <button
              type="button"
              onClick={() => onMore(channel)}
              style={{
                fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary)', alignSelf: 'center',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              +{extra} more
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{channel.blurb}</div>
      )}

      <button
        type="button"
        onClick={() => onGo(channel.route)}
        style={{
          height: 32, borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600,
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, width: '100%', cursor: 'pointer',
          background: connected ? 'var(--bg-surface)' : channel.color,
          color: connected ? 'var(--text-primary)' : '#ffffff',
          border: connected ? '1px solid var(--border)' : `1px solid ${channel.color}`,
          marginTop: 'auto',
        }}
      >
        {connected ? <SlidersHorizontal size={13} /> : <Plus size={14} />}
        {connected ? channel.manage : channel.connect}
      </button>
    </div>
  );
}

export default function ConnectAccountsPage() {
  const navigate = useNavigate();
  const { user, entitlements } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const tableRef = useRef(null);

  const isSuperAdmin = user?.role === 'ADMIN';
  const maxBotAccounts = isSuperAdmin ? null : (entitlements?.limits?.maxBotAccounts ?? null);
  const isAtLimit = !isSuperAdmin && maxBotAccounts !== null && integrations.length >= maxBotAccounts;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await integrationAPI.getAll();
      setIntegrations(res.data?.integrations || []);
    } catch (err) {
      console.error('Failed to load integrations', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byChannel = useMemo(() => {
    const map = Object.fromEntries(CHANNELS.map((c) => [c.id, []]));
    integrations.forEach((item) => {
      const p = (item.platform || '').toUpperCase();
      if (map[p]) map[p].push(item);
    });
    return map;
  }, [integrations]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return integrations;
    return integrations.filter((item) =>
      `${displayName(item)} ${identifier(item)} ${channelOf(item.platform).label}`.toLowerCase().includes(q)
    );
  }, [integrations, search]);

  const handleMore = (channel) => {
    setSearch(channel.label);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleChannelAction = (channel, hasConnected) => {
    if (!hasConnected && isAtLimit) {
      showLimitModal({
        currentUsage: integrations.length,
        maxLimit: maxBotAccounts,
        userRole: user?.role,
      });
      return;
    }
    navigate(channel.route);
  };

  const handleDisconnect = async (item) => {
    const ok = await showAlert.confirm({
      title: `Disconnect ${displayName(item)}?`,
      text: 'Conversations stay intact, but this account will stop sending and receiving messages.',
      confirmButtonText: 'Yes, Disconnect',
    });
    if (!ok) return;

    setDeletingId(item.id);
    try {
      await integrationAPI.delete(item.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== item.id));
      notify.success(`Disconnected "${displayName(item)}"`);
    } catch (err) {
      console.error('Failed to disconnect', err);
      notify.error(err?.response?.data?.message || 'Failed to disconnect this account.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>

        {/* Header — with quota / unlimited status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Radio size={19} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
                Connect Account
              </h1>

              {isSuperAdmin ? (
                <span
                  title="Super Admin has permanent unlimited channel accounts and features"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'rgba(37,99,235,0.08)', color: '#2563eb',
                    border: '1px solid rgba(37,99,235,0.2)',
                    borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700,
                  }}
                >
                  <ShieldCheck size={13} /> Unlimited (Super Admin)
                </span>
              ) : maxBotAccounts !== null ? (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: isAtLimit ? 'rgba(239,68,68,0.1)' : 'var(--bg-surface)',
                    color: isAtLimit ? '#ef4444' : 'var(--text-secondary)',
                    border: `1px solid ${isAtLimit ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: isAtLimit ? '#ef4444' : 'var(--success)' }} />
                  {integrations.length} / {maxBotAccounts} Accounts Connected{isAtLimit ? ' (Plan Limit)' : ''}
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'rgba(37,211,102,0.1)', color: '#16a34a',
                    border: '1px solid rgba(37,211,102,0.25)',
                    borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700,
                  }}
                >
                  Unlimited Accounts
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2, marginLeft: 46 }}>
              Connect and manage all your messaging channels in one centralized hub
            </p>
          </div>

          <button
            onClick={load}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Channels */}
        <div style={{ ...labelStyle, marginBottom: 10 }}>Channels</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
          {CHANNELS.map((channel) => {
            const channelAccounts = byChannel[channel.id] || [];
            return (
              <ChannelCard
                key={channel.id}
                channel={channel}
                accounts={channelAccounts}
                onGo={() => handleChannelAction(channel, channelAccounts.length > 0)}
                onMore={handleMore}
              />
            );
          })}
        </div>

        {/* All connected accounts */}
        <div ref={tableRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={labelStyle}>All connected accounts · {integrations.length}</div>
          <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 30, height: 32, fontSize: '0.82rem' }}
            />
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: "10px 14px", fontWeight: 700, width: 48 }}>#</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Channel</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account name</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Identifier</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                      Loading connected accounts…
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                      {integrations.length === 0
                        ? 'No accounts connected yet — pick a channel above to connect your first one.'
                        : 'No accounts match that search.'}
                    </td>
                  </tr>
                ) : visible.map((item, index) => {
                  const channel = channelOf(item.platform);
                  const { Icon } = channel;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: channel.tint, color: channel.color }}>
                          <Icon size={12} /> {channel.label}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {item.profile_picture_url ? (
                            <img
                              src={item.profile_picture_url}
                              alt=""
                              style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: channel.tint, color: channel.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={14} />
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{displayName(item)}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>ID {item.id}</span>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {identifier(item)}
                      </td>

                      <td style={{ padding: '12px 14px' }}><StatusPill active={!!item.is_active} /></td>

                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => navigate(channel.route)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => handleDisconnect(item)}
                            disabled={deletingId === item.id}
                            title="Disconnect account"
                            style={{
                              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                              border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)',
                              color: '#b91c1c', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
