import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import {
  Loader2, Users, Plus, RefreshCw, ArrowLeft, ShieldCheck, AlertTriangle, Crown, UserPlus, Activity as ActivityIcon,
  LayoutDashboard, Hand, Shield, Terminal, Link2, Megaphone, Settings2, Zap,
} from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify } from '../../../utils/alerts';
import { socketAuth, getSocketUrl } from '../../../utils/socketAuth';
import useUrlState from '../../../hooks/useUrlState';
import { box, hint, fmtDate } from './groupUi';
import OverviewTab from './OverviewTab';
import WelcomeTab from './WelcomeTab';
import ProtectionTab from './ProtectionTab';
import CommandsTab from './CommandsTab';
import MembersTab from './MembersTab';
import JoinRequestsTab from './JoinRequestsTab';
import InviteLinksTab from './InviteLinksTab';
import PostsTab from './PostsTab';
import ActivityTab from './ActivityTab';
import GroupSettingsTab from './GroupSettingsTab';

/**
 * Bot Manager → Group Management on a Telegram bot (chatbot_api/utils/telegramGroups.js).
 * The bot is added to groups in Telegram; every group it's in shows here with
 * welcome & captcha, protection filters, commands & auto-replies, members,
 * join requests, invite links, announcements, activity and group settings.
 */
const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'welcome', label: 'Welcome & Captcha', Icon: Hand },
  { id: 'protection', label: 'Protection', Icon: Shield },
  { id: 'commands', label: 'Rules & Replies', Icon: Terminal },
  { id: 'members', label: 'Members', Icon: Users },
  { id: 'requests', label: 'Join Requests', Icon: UserPlus },
  { id: 'links', label: 'Invite Links', Icon: Link2 },
  { id: 'posts', label: 'Announcements', Icon: Megaphone },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'settings', label: 'Group Settings', Icon: Settings2 },
];

// Admin rights the "Add to a group" link asks for (Telegram deep link, startgroup + admin).
const ADMIN_RIGHTS = 'delete_messages+restrict_members+invite_users+pin_messages+change_info';

function useGroupSocket(onEvent) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
    ['tg_group_update', 'tg_group_join_request', 'tg_group_activity', 'tg_group_report'].forEach((evt) => {
      socket.on(evt, (payload) => ref.current(evt, payload || {}));
    });
    return () => socket.disconnect();
  }, []);
}

function BotStatusBadge({ group }) {
  if (group.left_at) return <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>NOT IN GROUP</span>;
  if (group.bot_status === 'administrator') return <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', display: 'inline-flex', gap: 3, alignItems: 'center' }}><Crown size={11} /> ADMIN</span>;
  return <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', display: 'inline-flex', gap: 3, alignItems: 'center' }}><AlertTriangle size={11} /> NOT ADMIN</span>;
}

function GroupDetail({ groupId, bot, onBack, onGone }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useUrlState('tgTab', 'overview', { allowed: TABS.map((t) => t.id) });
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => tgGroupsAPI.get(groupId)
    .then((res) => setDetail(res.data))
    .catch((err) => { notify.error(err.response?.data?.message || 'Could not load the group'); if (err.response?.status === 404) onGone(); }), [groupId, onGone]);
  useEffect(() => { load(); }, [load]);

  useGroupSocket((evt, p) => {
    if (String(p.groupId) !== String(groupId)) return;
    setTick((t) => t + 1);
    if (evt === 'tg_group_update') load();
    if (evt === 'tg_group_report') notify.info(`🚩 New report in ${p.title || 'the group'}`);
  });

  const refresh = async () => {
    setRefreshing(true);
    try { const res = await tgGroupsAPI.refresh(groupId); setDetail(res.data); notify.success('Updated from Telegram'); } catch (err) { notify.error(err.response?.data?.message || 'Could not reach the group'); load(); } finally { setRefreshing(false); }
  };

  const saveSettings = async (partial) => {
    try {
      const res = await tgGroupsAPI.saveSettings(groupId, partial);
      setDetail((d) => ({ ...d, group: { ...d.group, settings: res.data.settings } }));
      notify.success('Saved — the bot uses the new settings right away');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
      throw err;
    }
  };

  if (!detail) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div>;
  const { group } = detail;

  return (
    <div>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', display: 'flex', gap: 4, alignItems: 'center', marginBottom: 10, padding: 0 }}>
        <ArrowLeft size={14} /> All groups
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{group.title || 'Untitled group'}</h4>
            <BotStatusBadge group={group} />
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {group.type === 'supergroup' ? 'Supergroup' : 'Group'}{group.username ? ` · @${group.username}` : ''}{group.member_count != null ? ` · ${group.member_count} members` : ''}
            {group.added_by_name ? ` · added by ${group.added_by_name}` : ''} · since {fmtDate(group.joined_at)}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing || Boolean(group.left_at)}>
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh from Telegram
        </button>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--border)', marginBottom: 16, paddingBottom: 1 }}>
        {TABS.map(({ id, label, Icon }) => {
          const TabIcon = Icon;
          const active = tab === id;
          const badge = id === 'requests' && detail.counts?.pending_requests > 0 ? detail.counts.pending_requests : null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: active ? 700 : 600, whiteSpace: 'nowrap',
                color: active ? 'var(--primary)' : 'var(--text-secondary)', borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`, marginBottom: -1,
              }}
            >
              <TabIcon size={14} /> {label}
              {badge && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, fontSize: '0.66rem', padding: '0 6px', fontWeight: 800 }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab detail={detail} bot={bot} />}
      {tab === 'welcome' && <WelcomeTab settings={group.settings} onSave={saveSettings} />}
      {tab === 'protection' && <ProtectionTab settings={group.settings} onSave={saveSettings} />}
      {tab === 'commands' && <CommandsTab settings={group.settings} onSave={saveSettings} commands={detail.commands} />}
      {tab === 'members' && <MembersTab groupId={group.id} warnLimit={group.settings.warnings.limit} />}
      {tab === 'requests' && <JoinRequestsTab groupId={group.id} refreshKey={tick} onChanged={load} />}
      {tab === 'links' && <InviteLinksTab groupId={group.id} />}
      {tab === 'posts' && <PostsTab groupId={group.id} refreshKey={tick} />}
      {tab === 'activity' && <ActivityTab groupId={group.id} refreshKey={tick} />}
      {tab === 'settings' && <GroupSettingsTab group={group} onChanged={load} onGone={onGone} />}
    </div>
  );
}

export default function TelegramGroupsPanel({ account }) {
  const [data, setData] = useState(null);
  const [groupId, setGroupId] = useUrlState('tgGroup', 0, { type: 'number' });
  const [, setTab] = useUrlState('tgTab', 'overview');
  const [settingUp, setSettingUp] = useState(false);

  const load = useCallback(() => tgGroupsAPI.list(account.id)
    .then((res) => setData(res.data))
    .catch((err) => { notify.error(err.response?.data?.message || 'Could not load groups'); setData({ groups: [], bot: null }); }), [account.id]);
  useEffect(() => { load(); }, [load]);

  useGroupSocket((evt, p) => {
    if (evt === 'tg_group_activity') return; // too chatty for the list
    if (!p.integrationId || String(p.integrationId) === String(account.id)) load();
  });

  const setup = async () => {
    setSettingUp(true);
    try {
      const res = await tgGroupsAPI.setup(account.id);
      notify.success(res.data.webhook === 'webhook-failed'
        ? 'Commands published, but Telegram refused the webhook update — check the bot connection.'
        : 'Done — Telegram now sends member updates, and the group commands show in the "/" menu.');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not update the bot');
    } finally {
      setSettingUp(false);
    }
  };

  const openGroup = (id) => { setTab('overview'); setGroupId(id); };
  const closeGroup = useCallback(() => { setTab('overview'); setGroupId(0); load(); }, [setGroupId, setTab, load]);

  const bot = data?.bot && !data.bot.error ? data.bot : null;
  const addLink = bot?.username ? `https://t.me/${bot.username}?startgroup=true&admin=${ADMIN_RIGHTS}` : null;

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">Group Management</h3>
        <p className="bm-card-sub">
          Add this bot to your Telegram groups and let it welcome members, stop spam with captcha and filters, enforce rules with warnings, handle join requests and post announcements.
        </p>
      </div>

      {groupId ? (
        <GroupDetail groupId={groupId} bot={bot} onBack={closeGroup} onGone={closeGroup} />
      ) : !data ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div>
      ) : (
        <>
          <div style={{ ...box, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0, flex: '1 1 320px' }}>
              <ShieldCheck size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong style={{ fontSize: '0.88rem' }}>Add {bot?.username ? `@${bot.username}` : 'the bot'} to a group as an admin</strong>
                <p style={hint}>
                  The button opens Telegram, lets you pick a group and asks for the admin rights the bot needs (delete messages, ban users, invite users, pin, change info). The group shows up here a moment later.
                  {bot && bot.canJoinGroups === false && <><br /><b style={{ color: '#dc2626' }}>This bot can't be added to groups — turn on "Allow Groups" for it in @BotFather.</b></>}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {addLink && <a className="btn btn-primary btn-sm" href={addLink} target="_blank" rel="noreferrer"><Plus size={13} /> Add to a group</a>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={setup} disabled={settingUp} title="Ask Telegram for member updates and publish the group commands">
                {settingUp ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Enable group updates
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={load} aria-label="Reload groups"><RefreshCw size={13} /></button>
            </div>
          </div>
          {data.bot?.error && <p style={{ ...hint, color: '#dc2626', marginBottom: 12 }}>Couldn't reach the bot: {data.bot.error}</p>}

          {data.groups.length === 0 ? (
            <div style={{ ...box, textAlign: 'center', padding: 36 }}>
              <Users size={34} style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
              <h4 style={{ margin: '8px 0 4px', fontSize: '1rem', fontWeight: 800 }}>No groups yet</h4>
              <p style={{ ...hint, maxWidth: 440, margin: '0 auto' }}>
                Add the bot to a Telegram group with the button above. If it's already in a group, send any message there (or remove and add it again) and it will appear.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              {data.groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => openGroup(g.id)}
                  style={{ ...box, marginBottom: 0, textAlign: 'left', cursor: 'pointer', opacity: g.left_at ? 0.65 : 1, color: 'var(--text-primary)', font: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title || 'Untitled group'}</strong>
                    <BotStatusBadge group={g} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {g.member_count != null ? `${g.member_count} members · ` : ''}{Number(g.messages_7d)} messages · {Number(g.actions_7d)} moderation actions (7 days)
                  </div>
                  {Number(g.pending_requests) > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700, marginTop: 6 }}>{g.pending_requests} join request{Number(g.pending_requests) === 1 ? '' : 's'} waiting</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
