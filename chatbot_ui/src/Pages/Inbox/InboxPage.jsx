import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import {
  conversationAPI,
  uploadAPI,
  cannedResponseAPI,
  contactAPI,
  agencyAPI,
  labelAPI,
  customFieldAPI,
  sequenceAPI,
  followupAPI,
  aiRewriteAPI,
} from '../../services/api';
import SendMenuPanel from '../../Components/Inbox/SendMenuPanel';
import JoinChatModal from '../../Components/Inbox/JoinChatModal';
import CreateCannedModal from '../../Components/Inbox/CreateCannedModal';
import WhatsAppCallPanel from '../../Components/Inbox/WhatsAppCallPanel';
import useWhatsAppCall from '../../hooks/useWhatsAppCall';
import { useAuth } from '../../Provider/AuthContext';
import { useLayout } from '../../Provider/LayoutContext';
import io from 'socket.io-client';
import {
  MessageSquare,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Globe,
  Search,
  SlidersHorizontal,
  Bot,
  User,
  Tag,
  FileText,
  Paperclip,
  Check,
  CheckCheck,
  Zap,
  Sparkles,
  Pause,
  Play,
  Trash2,
  PhoneCall,
  Clock,
  ChevronRight,
  X,
  Plus,
  RefreshCw,
  MoreVertical,
  LogOut,
  RotateCcw,
  BellOff,
  Ban,
  Shield,
  CheckCircle2,
  Smile,
  Image as ImageIcon,
  Film,
  Menu,
  Download,
  ExternalLink,
  Volume2,
  UserCheck,
  ListFilter,
  Layers,
  Calendar,
  Phone,
  Mail,
  Sliders,
  ChevronDown,
  ChevronLeft,
  UserX,
} from 'lucide-react';

/* ─── Platform Map ─── */
const PLATFORM_MAP = {
  WHATSAPP:  { label: 'WhatsApp',  icon: MessageCircle, color: '#25d366', bg: 'rgba(37, 211, 102, 0.12)' },
  FACEBOOK:  { label: 'Facebook',  icon: Facebook,      color: '#1877f2', bg: 'rgba(24, 119, 242, 0.12)' },
  INSTAGRAM: { label: 'Instagram', icon: Instagram,     color: '#e1306c', bg: 'rgba(225, 48, 108, 0.12)' },
  TELEGRAM:  { label: 'Telegram',  icon: Send,          color: '#229ed9', bg: 'rgba(34, 158, 217, 0.12)' },
  WEBCHAT:   { label: 'Webchat',   icon: Globe,         color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
};

function getPlatformInfo(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, icon: MessageSquare, color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' };
}

function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const baseUrl = apiUrl.startsWith('http')
    ? apiUrl.replace('/api/v1', '')
    : '';
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function ContactAvatar({ avatar, name, size = 38, pInfo, style = {} }) {
  const [imgError, setImgError] = useState(false);
  const mediaUrl = resolveMediaUrl(avatar);

  useEffect(() => {
    setImgError(false);
  }, [avatar]);

  const showImg = Boolean(mediaUrl && !imgError);
  const Icon = pInfo?.icon;
  const badgeSize = size <= 36 ? 15 : (size <= 40 ? 16 : 18);
  const iconSize = size <= 36 ? 9 : (size <= 40 ? 10 : 12);
  const fontSize = size <= 32 ? '0.72rem' : (size <= 40 ? '0.85rem' : '1rem');

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      {showImg ? (
        <img
          src={mediaUrl}
          alt={name || 'Avatar'}
          referrerPolicy="no-referrer"
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            border: '1px solid #e2e8f0',
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#f1f5f9',
            color: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize,
            border: '1px solid #e2e8f0',
          }}
        >
          {getInitials(name)}
        </div>
      )}
      {pInfo && Icon && (
        <div
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            zIndex: 1,
          }}
        >
          <Icon size={iconSize} color={pInfo.color} />
        </div>
      )}
    </div>
  );
}

function WhatsAppWindowTimer({ lastInboundAt, onSendTemplate }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const inboundTime = lastInboundAt ? new Date(lastInboundAt).getTime() : null;
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const expiresAt = inboundTime ? inboundTime + WINDOW_MS : null;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const isExpired = !inboundTime || remainingMs <= 0;

  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const percentRemaining = Math.min(100, Math.max(0, (remainingMs / WINDOW_MS) * 100));

  const pad = (n) => String(n).padStart(2, '0');
  const hStr = pad(hours);
  const mStr = pad(minutes);
  const sStr = pad(seconds);

  // Analog Clock angles
  const hourAngle = isExpired ? 0 : ((hours % 12) + minutes / 60) * 30;
  const minuteAngle = isExpired ? 0 : (minutes + seconds / 60) * 6;
  const secondAngle = isExpired ? 0 : seconds * 6;

  // Light pastel color palettes
  let t = {
    cardBg: 'linear-gradient(145deg, #f0fdf4 0%, #ecfdf5 60%, #f0fdfa 100%)',
    cardBorder: '#bbf7d0',
    headerColor: '#065f46',
    badgeBg: '#dcfce7',
    badgeBorder: '#86efac',
    badgeColor: '#166534',
    badgeText: '24h Window Active',
    badgeDot: '#22c55e',
    digitBg: '#ffffff',
    digitBorder: '#cbd5e1',
    digitColor: '#0f172a',
    digitShadow: '0 1px 3px rgba(0,0,0,0.05)',
    colonColor: '#10b981',
    barBg: 'rgba(16, 185, 129, 0.15)',
    barColor: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)',
    clockRing: '#10b981',
    clockFace: '#ffffff',
    clockHands: '#047857',
    secondHand: '#059669',
    subtext: 'Free-form messaging permitted',
  };

  if (isExpired) {
    t = {
      cardBg: 'linear-gradient(145deg, #fef2f2 0%, #fff1f2 60%, #f8fafc 100%)',
      cardBorder: '#fecaca',
      headerColor: '#991b1b',
      badgeBg: '#fee2e2',
      badgeBorder: '#fca5a5',
      badgeColor: '#991b1b',
      badgeText: '24h Window Expired',
      badgeDot: '#ef4444',
      digitBg: '#ffffff',
      digitBorder: '#fecaca',
      digitColor: '#94a3b8',
      digitShadow: '0 1px 2px rgba(0,0,0,0.04)',
      colonColor: '#f87171',
      barBg: 'rgba(239, 68, 68, 0.15)',
      barColor: '#f87171',
      clockRing: '#fca5a5',
      clockFace: '#ffffff',
      clockHands: '#94a3b8',
      secondHand: '#ef4444',
      subtext: 'Only pre-approved templates allowed',
    };
  } else if (hours < 1) {
    t = {
      cardBg: 'linear-gradient(145deg, #fff1f2 0%, #ffe4e6 60%, #fff7ed 100%)',
      cardBorder: '#fecdd3',
      headerColor: '#9f1239',
      badgeBg: '#ffe4e6',
      badgeBorder: '#fda4af',
      badgeColor: '#9f1239',
      badgeText: '< 1 Hour Left',
      badgeDot: '#f43f5e',
      digitBg: '#ffffff',
      digitBorder: '#fecdd3',
      digitColor: '#881337',
      digitShadow: '0 1px 2px rgba(244,63,94,0.08)',
      colonColor: '#f43f5e',
      barBg: 'rgba(244, 63, 94, 0.15)',
      barColor: 'linear-gradient(90deg, #f43f5e 0%, #fb7185 100%)',
      clockRing: '#f43f5e',
      clockFace: '#ffffff',
      clockHands: '#e11d48',
      secondHand: '#e11d48',
      subtext: 'Window closes very soon',
    };
  } else if (hours < 6) {
    t = {
      cardBg: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 60%, #fff7ed 100%)',
      cardBorder: '#fde68a',
      headerColor: '#92400e',
      badgeBg: '#fef3c7',
      badgeBorder: '#fcd34d',
      badgeColor: '#92400e',
      badgeText: 'Expiring Soon',
      badgeDot: '#f59e0b',
      digitBg: '#ffffff',
      digitBorder: '#fde68a',
      digitColor: '#78350f',
      digitShadow: '0 1px 2px rgba(245,158,11,0.08)',
      colonColor: '#f59e0b',
      barBg: 'rgba(245, 158, 11, 0.15)',
      barColor: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
      clockRing: '#f59e0b',
      clockHands: '#d97706',
      secondHand: '#d97706',
      subtext: 'Send follow-up before expiry',
    };
  }

  return (
    <div
      style={{
        margin: '12px 16px',
        padding: '12px 14px',
        borderRadius: 12,
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header Row: Title & Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.73rem', fontWeight: 800, color: t.headerColor, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            24h Messaging Window
          </span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px',
            borderRadius: 12,
            background: t.badgeBg,
            border: `1px solid ${t.badgeBorder}`,
            fontSize: '0.66rem',
            fontWeight: 700,
            color: t.badgeColor,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.badgeDot }} />
          {t.badgeText}
        </div>
      </div>

      {/* Main Body: Analog Clock & Analog-Style Chronometer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* Analog Clock Dial */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="42" height="42" viewBox="0 0 44 44" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.08))' }}>
            <circle cx="22" cy="22" r="20" fill={t.clockFace} stroke={t.clockRing} strokeWidth="2.2" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
              const isMajor = deg % 90 === 0;
              const rad = (deg - 90) * (Math.PI / 180);
              const r1 = isMajor ? 14 : 16.5;
              const r2 = 18.5;
              return (
                <line
                  key={deg}
                  x1={22 + r1 * Math.cos(rad)}
                  y1={22 + r1 * Math.sin(rad)}
                  x2={22 + r2 * Math.cos(rad)}
                  y2={22 + r2 * Math.sin(rad)}
                  stroke={isMajor ? t.clockHands : '#cbd5e1'}
                  strokeWidth={isMajor ? '1.5' : '1'}
                  strokeLinecap="round"
                />
              );
            })}
            <line
              x1="22"
              y1="22"
              x2={22 + 9 * Math.sin(hourAngle * (Math.PI / 180))}
              y2={22 - 9 * Math.cos(hourAngle * (Math.PI / 180))}
              stroke={t.clockHands}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <line
              x1="22"
              y1="22"
              x2={22 + 13 * Math.sin(minuteAngle * (Math.PI / 180))}
              y2={22 - 13 * Math.cos(minuteAngle * (Math.PI / 180))}
              stroke={t.clockHands}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {!isExpired && (
              <line
                x1="22"
                y1="22"
                x2={22 + 14 * Math.sin(secondAngle * (Math.PI / 180))}
                y2={22 - 14 * Math.cos(secondAngle * (Math.PI / 180))}
                stroke={t.secondHand}
                strokeWidth="1"
                strokeLinecap="round"
              />
            )}
            <circle cx="22" cy="22" r="2.5" fill={t.clockHands} />
            <circle cx="22" cy="22" r="1" fill="#ffffff" />
          </svg>
        </div>

        {/* Analog Chronometer Display (HH : MM : SS) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Hours */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                background: t.digitBg,
                border: `1px solid ${t.digitBorder}`,
                borderRadius: 6,
                padding: '4px 6px',
                minWidth: 32,
                textAlign: 'center',
                boxShadow: t.digitShadow,
                fontFamily: '"SF Mono", "Courier New", Courier, monospace',
                fontSize: '1.05rem',
                fontWeight: 800,
                color: t.digitColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {hStr}
            </div>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#94a3b8', marginTop: 2, letterSpacing: '0.5px' }}>
              HRS
            </span>
          </div>

          <span style={{ fontSize: '1rem', fontWeight: 800, color: t.colonColor, fontFamily: 'monospace', marginBottom: 10, opacity: isExpired ? 0.3 : (seconds % 2 === 0 ? 1 : 0.3) }}>
            :
          </span>

          {/* Minutes */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                background: t.digitBg,
                border: `1px solid ${t.digitBorder}`,
                borderRadius: 6,
                padding: '4px 6px',
                minWidth: 32,
                textAlign: 'center',
                boxShadow: t.digitShadow,
                fontFamily: '"SF Mono", "Courier New", Courier, monospace',
                fontSize: '1.05rem',
                fontWeight: 800,
                color: t.digitColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {mStr}
            </div>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#94a3b8', marginTop: 2, letterSpacing: '0.5px' }}>
              MIN
            </span>
          </div>

          <span style={{ fontSize: '1rem', fontWeight: 800, color: t.colonColor, fontFamily: 'monospace', marginBottom: 10, opacity: isExpired ? 0.3 : (seconds % 2 === 0 ? 1 : 0.3) }}>
            :
          </span>

          {/* Seconds */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                background: t.digitBg,
                border: `1px solid ${t.digitBorder}`,
                borderRadius: 6,
                padding: '4px 6px',
                minWidth: 32,
                textAlign: 'center',
                boxShadow: t.digitShadow,
                fontFamily: '"SF Mono", "Courier New", Courier, monospace',
                fontSize: '1.05rem',
                fontWeight: 800,
                color: t.digitColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {sStr}
            </div>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#94a3b8', marginTop: 2, letterSpacing: '0.5px' }}>
              SEC
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: 4, width: '100%', background: t.barBg, borderRadius: 4, overflow: 'hidden', marginTop: 10 }}>
        <div style={{ height: '100%', width: `${percentRemaining}%`, background: t.barColor, transition: 'width 1s linear' }} />
      </div>

      {/* Footer Subtext */}
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t.subtext}</span>
        {lastInboundAt && (
          <span style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
            Last: {formatRelativeTime(lastInboundAt)}
          </span>
        )}
      </div>

      {/* Action Button When Expired */}
      {isExpired && onSendTemplate && (
        <button
          type="button"
          onClick={onSendTemplate}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '7px 12px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 7,
            fontSize: '0.76rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
          }}
        >
          <FileText size={13} /> Send Message Template
        </button>
      )}
    </div>
  );
}

function FailedMessageStatus({ msg }) {
  const [hovered, setHovered] = useState(false);
  const isSendStage = msg.failure_stage === 'SEND';
  const reason = msg.failure_reason || (typeof msg.metadata === 'object' && msg.metadata?.error) || 'Failed to deliver message.';

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); setHovered((p) => !p); }}
    >
      {isSendStage ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
          }}
        >
          <Check size={10} color="#dc2626" strokeWidth={3} />
        </span>
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            padding: '1px 3px',
            borderRadius: 10,
            background: '#fee2e2',
            border: '1px solid #fca5a5',
          }}
        >
          <Check size={10} color="#16a34a" style={{ marginRight: -5 }} strokeWidth={2.6} />
          <Check size={10} color="#dc2626" strokeWidth={3} />
        </span>
      )}

      {hovered && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            right: -6,
            marginBottom: 8,
            width: 270,
            maxWidth: '85vw',
            background: '#ffffff',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '10px 12px',
            boxShadow: '0 10px 25px -4px rgba(0, 0, 0, 0.16), 0 4px 6px -2px rgba(0, 0, 0, 0.06)',
            zIndex: 100,
            textAlign: 'left',
            pointerEvents: 'none',
            display: 'block',
          }}
        >
          {/* Header */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {isSendStage ? 'Message Send Failed' : 'Delivery Failed'}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.62rem',
                fontWeight: 700,
                color: '#dc2626',
                background: '#fee2e2',
                padding: '1px 5px',
                borderRadius: 4,
              }}
            >
              {isSendStage ? 'API Send' : 'Carrier'}
            </span>
          </span>

          {/* Reason text */}
          <span style={{ fontSize: '0.76rem', color: '#334155', lineHeight: 1.35, display: 'block', wordBreak: 'break-word' }}>
            {reason}
          </span>

          {/* Pointer notch */}
          <span
            style={{
              position: 'absolute',
              bottom: -5,
              right: 10,
              width: 8,
              height: 8,
              background: '#ffffff',
              borderRight: '1px solid #fecaca',
              borderBottom: '1px solid #fecaca',
              transform: 'rotate(45deg)',
              display: 'block',
            }}
          />
        </span>
      )}
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Shared style for each row inside the subscriber panel's "⋮" menu.
const subscriberMenuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  background: 'none',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#334155',
  cursor: 'pointer',
  textAlign: 'left',
};

function getInitials(name = '') {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// Small last-message-status tick, used in the conversation list row. Mirrors
// the tick logic already used per-message in the thread view (failed/read/
// delivered/sent) so the same visual language applies at a glance in the list.
function MessageTick({ status, failureStage, isRead, deliveredAt, size = 12 }) {
  if (status === 'FAILED' && failureStage === 'SEND') return <Check size={size} color="#ef4444" />;
  if (status === 'FAILED' && failureStage === 'DELIVERY') return <Check size={size} color="#f59e0b" />;
  if (isRead) return <CheckCheck size={size} color="#2563eb" />;
  if (deliveredAt) return <CheckCheck size={size} color="#94a3b8" />;
  return <Check size={size} color="#94a3b8" />;
}

// Human-readable labels for the read-only "System Fields" pulled from each
// channel's own profile API (Messenger/Instagram/Telegram — see webhook.js).
const SYSTEM_FIELD_LABELS = {
  first_name: 'First Name',
  last_name: 'Last Name',
  locale: 'Locale',
  timezone: 'Timezone (GMT offset)',
  gender: 'Gender',
  username: 'Username',
  is_verified_user: 'Verified Account',
  follower_count: 'Follower Count',
  language_code: 'Language',
  is_premium: 'Telegram Premium',
};

// Labels is deliberately NOT in this tab bar — it's pinned as its own
// always-visible section at the bottom of the drawer instead (see the
// "Labels — pinned bottom section" block below the tabbed content).
const DRAWER_TABS = ['Overview', 'Sequences', 'Follow-ups', 'Custom Fields', 'Notes'];

// Small active-filter chip shown next to the Filter trigger in the
// conversation-list header (see below) — one per currently-applied filter.
function FilterChip({ label, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 5px 3px 8px', borderRadius: 6, background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', fontSize: '0.7rem', fontWeight: 600, height: 22 }}>
      {label}
      <button type="button" onClick={onRemove} title="Remove filter" style={{ display: 'flex', border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 1 }}>
        <X size={11} />
      </button>
    </span>
  );
}
function fmtISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A single-month range calendar (pick a "from", then a "to", in one grid) —
// deliberately not the twin-month strip a lot of pickers use: one flat-fill
// highlight between two solid end-caps, our own blue, our own rhythm.
function InboxRangeCalendar({ month, from, to, onNavigate, onPick }) {
  const year = month.getFullYear();
  const mIdx = month.getMonth();
  const startOffset = new Date(year, mIdx, 1).getDay();
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, mIdx, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + 1 + i;
    cells.push({ day, inMonth: false, dateStr: fmtISODate(new Date(year, mIdx - 1, day)) });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, dateStr: fmtISODate(new Date(year, mIdx, day)) });
  }
  let trailing = 1;
  while (cells.length < 42) {
    cells.push({ day: trailing, inMonth: false, dateStr: fmtISODate(new Date(year, mIdx + 1, trailing)) });
    trailing++;
  }

  const isEdge = (dateStr) => dateStr === from || dateStr === to;
  const inRange = (dateStr) => from && to && dateStr > from && dateStr < to;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => onNavigate(-1)} title="Previous month" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 2 }}>
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => onNavigate(1)} title="Next month" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 2 }}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
        {cells.map((c, i) => {
          const edge = isEdge(c.dateStr);
          const within = inRange(c.dateStr);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(c.dateStr)}
              style={{
                height: 26, border: 'none', cursor: 'pointer', fontSize: '0.72rem',
                fontWeight: edge ? 700 : 500,
                borderRadius: edge ? 99 : 0,
                color: !c.inMonth ? '#cbd5e1' : edge ? '#fff' : within ? '#2563eb' : '#334155',
                background: edge ? '#2563eb' : within ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
              }}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Remembers the selected subscriber across a page refresh (per browser tab).
const SELECTED_CONVERSATION_KEY = 'inbox_selected_conversation_id';

export default function InboxPage() {
  const { user } = useAuth();
  const { openPopupNav } = useLayout();
  const whatsappCall = useWhatsAppCall();

  // Conversations & Messages
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  // Server-side pagination for the conversation list (never loads an
  // agency's entire conversation set — see the approved Live Inbox
  // performance plan).
  const [convPage, setConvPage] = useState(1);
  const [convHasMore, setConvHasMore] = useState(false);
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  // Incremental message history — the server caps the initial load to the
  // most recent 50; older messages load on scroll-up via GET
  // /conversations/:id/messages?before=...
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [statusFilter, setStatusFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState(''); // '' = any, 'unassigned', or an agent_profile id
  // Date range — defaults to the last 7 days server-side too (routes/conversations.js);
  // 'custom' reveals two date inputs, clamped to a 30-day max span server-side regardless.
  const [dateRangePreset, setDateRangePreset] = useState('7d'); // '7d' | '30d' | 'today' | 'custom'
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showSubscriberPanel, setShowSubscriberPanel] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  // Subscriber Details & Extended Panel State
  const [activeDrawerTab, setActiveDrawerTab] = useState('Overview');
  const [botPaused, setBotPaused] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);

  // Structured Labels (agency-wide catalog + per-subscriber attachment) —
  // plain list, no colors (see the pinned Labels section at the bottom of
  // the drawer, and the plain Label filter dropdown at the top of the list).
  const [agencyLabels, setAgencyLabels] = useState([]);
  const [contactLabels, setContactLabels] = useState([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelFilterId, setLabelFilterId] = useState('');

  // One filter panel — Agent + Label + Date Range all visible together
  // (staged locally, committed on Apply) instead of three permanent
  // dropdowns or a pick-one-at-a-time popover.
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const [stagedAgentFilter, setStagedAgentFilter] = useState('');
  const [stagedLabelFilterId, setStagedLabelFilterId] = useState('');
  const [stagedDatePreset, setStagedDatePreset] = useState('7d');
  const [stagedDateFrom, setStagedDateFrom] = useState('');
  const [stagedDateTo, setStagedDateTo] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  useEffect(() => {
    if (!filterMenuOpen) return;
    const handleClickOutside = (e) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterMenuOpen]);

  const openFilterPanel = () => {
    if (!filterMenuOpen) {
      setStagedAgentFilter(agentFilter);
      setStagedLabelFilterId(labelFilterId);
      setStagedDatePreset(dateRangePreset);
      setStagedDateFrom(dateRangePreset === 'custom' ? customDateFrom : '');
      setStagedDateTo(dateRangePreset === 'custom' ? customDateTo : '');
      setCalendarMonth(dateRangePreset === 'custom' && customDateFrom ? new Date(customDateFrom) : new Date());
    }
    setFilterMenuOpen((o) => !o);
  };
  const applyFilterPanel = () => {
    setAgentFilter(stagedAgentFilter);
    setLabelFilterId(stagedLabelFilterId);
    if (stagedDateFrom && stagedDateTo) {
      setDateRangePreset('custom');
      setCustomDateFrom(stagedDateFrom);
      setCustomDateTo(stagedDateTo);
    } else {
      setDateRangePreset(stagedDatePreset === 'custom' ? '7d' : stagedDatePreset);
      setCustomDateFrom('');
      setCustomDateTo('');
    }
    setFilterMenuOpen(false);
  };
  const resetFilterPanel = () => {
    setStagedAgentFilter('');
    setStagedLabelFilterId('');
    setStagedDatePreset('7d');
    setStagedDateFrom('');
    setStagedDateTo('');
    setAgentFilter('');
    setLabelFilterId('');
    setDateRangePreset('7d');
    setCustomDateFrom('');
    setCustomDateTo('');
    setFilterMenuOpen(false);
  };
  const pickCalendarDate = (dateStr) => {
    setStagedDatePreset('custom');
    if (!stagedDateFrom || stagedDateTo) {
      setStagedDateFrom(dateStr);
      setStagedDateTo('');
    } else if (dateStr < stagedDateFrom) {
      setStagedDateTo(stagedDateFrom);
      setStagedDateFrom(dateStr);
    } else {
      setStagedDateTo(dateStr);
    }
  };

  // Custom Fields (agency-defined field types + per-subscriber values)
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({}); // { [fieldId]: value }
  // Completed User Input Flow submissions for the selected subscriber
  const [formResponses, setFormResponses] = useState([]);
  const [expandedResponseId, setExpandedResponseId] = useState(null);
  const [savingFieldId, setSavingFieldId] = useState(null);
  const [showNewFieldForm, setShowNewFieldForm] = useState(false);
  const [newFieldDraft, setNewFieldDraft] = useState({ name: '', fieldType: 'TEXT', options: '' });
  const [savingNewField, setSavingNewField] = useState(false);

  const [contactNotes, setContactNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const agentsListRef = useRef(agentsList);
  useEffect(() => { agentsListRef.current = agentsList; }, [agentsList]);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [convStatus, setConvStatus] = useState('OPEN');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Sequences (drip campaigns) enrolled for the selected subscriber
  const [contactSequences, setContactSequences] = useState([]);
  const [availableSequences, setAvailableSequences] = useState([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [sequenceBusy, setSequenceBusy] = useState(false);

  // Follow-ups for the selected subscriber
  const [contactFollowUps, setContactFollowUps] = useState([]);
  const [showNewFollowUp, setShowNewFollowUp] = useState(false);
  const [newFollowUpDraft, setNewFollowUpDraft] = useState({ date: '', time: '', note: '', assignedToAgentProfileId: '' });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Canned Responses State
  const [cannedResponses, setCannedResponses] = useState([]);

  // Send Menu (Bot Flow / Message Template / WhatsApp Flow) — right-side panel
  const [showSendMenu, setShowSendMenu] = useState(false);
  const [sendMenuSection, setSendMenuSection] = useState('menu');

  const handleOpenTemplatePicker = useCallback(() => {
    setSendMenuSection('template');
    setShowSendMenu(true);
  }, []);

  // Canned Responses "/" picker — shows while the composer's entire content
  // is still just "/" + a partial shortcut/name (no space typed yet).
  // Inserts into the composer only; never sends automatically.
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [showCreateCannedModal, setShowCreateCannedModal] = useState(false);
  const [showQuickCannedMenu, setShowQuickCannedMenu] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');

  // AI Rewrite — inserts into the composer only, never auto-sends.
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  // Auto-resize composer textarea to fit multi-line content as user types
  useEffect(() => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
      const nextHeight = Math.min(Math.max(messageInputRef.current.scrollHeight, 40), 160);
      messageInputRef.current.style.height = `${nextHeight}px`;
    }
  }, [messageText]);

  // Fast subscriber search (GET /contacts/search) — finds ANY subscriber the
  // agency has, even one with no open conversation yet, unlike the plain
  // `search` box above which only filters conversations already loaded on
  // screen. Debounced; scoped by agency server-side; minimal payload.
  const [fastSearchResults, setFastSearchResults] = useState([]);
  const [fastSearching, setFastSearching] = useState(false);
  const fastSearchTimeout = useRef(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const messageInputRef = useRef(null);

  const selectedId = selectedConv?._id || selectedConv?.id;
  const selectedIdRef = useRef(selectedId);
  const selectedContactId = selectedConv?.contact_id || selectedConv?.contactId;
  const selectedContactIdRef = useRef(selectedContactId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedContactIdRef.current = selectedContactId;
  }, [selectedId, selectedContactId]);

  const assignedAgent = useMemo(() => {
    if (!selectedConv?.assigned_to_id) return null;
    return agentsList.find((ag) =>
      String(ag.profileId || ag.agent_profile_id || ag.id) === String(selectedConv.assigned_to_id) ||
      String(ag.userId || ag.id) === String(selectedConv.assigned_to_id)
    );
  }, [selectedConv?.assigned_to_id, agentsList]);

  const currentAgentName = selectedConv?.assignedAgentName || assignedAgent?.name;

  // The logged-in user's own agent_profiles.id — what agentFilter actually
  // compares against (see the Agent <select>'s options below) — so the
  // "Mine" quick-view can set agentFilter to the right value.
  const myProfileId = useMemo(() => {
    const mine = agentsList.find((a) => String(a.id) === String(user?.id));
    return mine ? String(mine.profileId || mine.agent_profile_id || mine.id) : null;
  }, [agentsList, user]);

  // Display labels for the progressive filter popover's chips/rows.
  const DATE_PRESET_LABELS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom range' };
  const agentFilterLabel = useMemo(() => {
    if (!agentFilter) return null;
    if (agentFilter === 'unassigned') return 'Unassigned';
    const ag = agentsList.find((a) => String(a.profileId || a.agent_profile_id || a.id) === String(agentFilter));
    return ag ? (ag.name || ag.email) : 'Agent';
  }, [agentFilter, agentsList]);
  const labelFilterLabel = useMemo(() => {
    if (!labelFilterId) return null;
    return agencyLabels.find((lb) => String(lb.id) === String(labelFilterId))?.name || 'Label';
  }, [labelFilterId, agencyLabels]);
  const dateFilterLabel = dateRangePreset === 'custom' && customDateFrom && customDateTo
    ? `${customDateFrom} → ${customDateTo}`
    : DATE_PRESET_LABELS[dateRangePreset];
  const isDateFilterActive = dateRangePreset !== '7d';

  // Load Canned Responses, Team Agents, Labels & Custom Field definitions
  useEffect(() => {
    cannedResponseAPI.getAll().then((res) => setCannedResponses(res.data?.cannedResponses || [])).catch(() => {});
    if (agencyAPI?.getAgents) {
      agencyAPI.getAgents().then((res) => setAgentsList(res.data?.agents || [])).catch(() => {});
    }
    labelAPI.getAll().then((res) => setAgencyLabels(res.data?.labels || [])).catch(() => {});
    customFieldAPI.getAll().then((res) => setCustomFieldDefs(res.data?.fields || [])).catch(() => {});
    sequenceAPI.getAll().then((res) => setAvailableSequences(res.data?.sequences || [])).catch(() => {});
  }, []);

  // Date-range params for GET /conversations — '7d' (the default) sends
  // nothing at all, letting the backend apply its own last-7-days default
  // (one less thing that can drift out of sync between client and server).
  const buildDateRangeParams = useCallback(() => {
    if (dateRangePreset === 'custom' && customDateFrom && customDateTo) {
      return { dateFrom: new Date(customDateFrom).toISOString(), dateTo: new Date(customDateTo + 'T23:59:59').toISOString() };
    }
    if (dateRangePreset === 'today') {
      const now = new Date();
      return { dateFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), dateTo: now.toISOString() };
    }
    if (dateRangePreset === '30d') {
      return { dateFrom: new Date(Date.now() - 30 * 86400000).toISOString(), dateTo: new Date().toISOString() };
    }
    return {};
  }, [dateRangePreset, customDateFrom, customDateTo]);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try {
      const params = { page: 1, limit: 30, ...buildDateRangeParams() };
      if (statusFilter !== 'All') params.status = statusFilter;
      if (platformFilter) params.platform = platformFilter;
      if (labelFilterId) params.labelId = labelFilterId;
      if (agentFilter) params.assignedToId = agentFilter;
      const res = await conversationAPI.getAll(params);
      setConversations(res.data.conversations || res.data || []);
      const pagination = res.data.pagination;
      setConvPage(1);
      setConvHasMore(pagination ? pagination.page < pagination.totalPages : false);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setConvLoading(false);
    }
  }, [statusFilter, platformFilter, labelFilterId, agentFilter, buildDateRangeParams]);

  // Appends the next page instead of replacing the list — the "Load more"
  // row at the bottom of the conversation list calls this.
  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConvs || !convHasMore) return;
    setLoadingMoreConvs(true);
    try {
      const nextPage = convPage + 1;
      const params = { page: nextPage, limit: 30, ...buildDateRangeParams() };
      if (statusFilter !== 'All') params.status = statusFilter;
      if (platformFilter) params.platform = platformFilter;
      if (labelFilterId) params.labelId = labelFilterId;
      if (agentFilter) params.assignedToId = agentFilter;
      const res = await conversationAPI.getAll(params);
      const newRows = res.data.conversations || [];
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => String(c._id || c.id)));
        return [...prev, ...newRows.filter((c) => !existingIds.has(String(c._id || c.id)))];
      });
      const pagination = res.data.pagination;
      setConvPage(nextPage);
      setConvHasMore(pagination ? pagination.page < pagination.totalPages : false);
    } catch (err) {
      console.error('Failed to load more conversations', err);
    } finally {
      setLoadingMoreConvs(false);
    }
  }, [convPage, convHasMore, loadingMoreConvs, statusFilter, platformFilter, labelFilterId, agentFilter, buildDateRangeParams]);

  useEffect(() => {
    setConvLoading(true);
    loadConversations();
  }, [loadConversations]);

  // Load messages and subscriber info
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setMsgLoading(true);
    try {
      const res = await conversationAPI.getOne(convId);
      const data = res.data;
      setMessages(data.messages || []);
      setHasMoreMessages(Boolean(data.hasMoreMessages));
      const conv = data.conversation || data;
      setSelectedConv(conv);
      setConvStatus(conv.status || 'OPEN');
      setBotPaused(Boolean(conv.bot_paused || conv.botPaused || conv.contactBotPaused));
      setContactLabels(conv.contactLabels || []);
      setContactNotes(data.notes || []);
      try {
        sessionStorage.setItem(SELECTED_CONVERSATION_KEY, String(convId));
      } catch {
        // Storage unavailable (private browsing, etc) — selection just won't survive a refresh
      }

      // Custom field values for this subscriber
      const contactId = conv.contact_id || conv.contactId;
      if (contactId) {
        customFieldAPI.getForContact(contactId).then((cfRes) => {
          const fields = cfRes.data?.fields || [];
          const values = {};
          for (const f of fields) values[f.field_id] = f.value ?? '';
          setCustomFieldValues(values);
        }).catch(() => setCustomFieldValues({}));

        // Completed User Input Flow submissions (the full answer set per run)
        contactAPI.getFormResponses(contactId)
          .then((r) => setFormResponses(r.data?.responses || []))
          .catch(() => setFormResponses([]));

        contactAPI.getSequences(contactId)
          .then((r) => setContactSequences(r.data?.sequences || []))
          .catch(() => setContactSequences([]));

        followupAPI.getAll({ contactId })
          .then((r) => setContactFollowUps(r.data?.followUps || []))
          .catch(() => setContactFollowUps([]));
      }
    } catch (err) {
      console.error('Failed to load conversation details', err);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // Restore the previously selected subscriber after a page refresh (once, on mount).
  useEffect(() => {
    let savedId = null;
    try {
      savedId = sessionStorage.getItem(SELECTED_CONVERSATION_KEY);
    } catch {
      // ignore
    }
    if (savedId) loadMessages(savedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectConversation = (conv) => {
    setSelectedConv(conv);
    setConvStatus(conv.status || 'OPEN');
    setMessages([]);
    loadMessages(conv._id || conv.id);
    // Opening a conversation resets unread_count server-side (GET /conversations/:id) —
    // reflect that in the list item without changing its position in the list.
    const openedId = conv._id || conv.id;
    setConversations((prev) => {
      const idx = prev.findIndex((c) => String(c._id || c.id) === String(openedId));
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], unread_count: 0 };
      return next;
    });
  };

  // Fast subscriber search — debounced (300ms, matching ContactsPage.jsx's
  // existing debounce idiom), hits the new indexed /contacts/search endpoint
  // rather than filtering the (already agency-scoped, already-loaded)
  // conversation list, so it can find a subscriber even with no open
  // conversation, without ever fetching more than `limit` minimal rows.
  useEffect(() => {
    clearTimeout(fastSearchTimeout.current);
    const q = search.trim();
    if (q.length < 2) { setFastSearchResults([]); return; }
    fastSearchTimeout.current = setTimeout(() => {
      setFastSearching(true);
      contactAPI.search(q, 8)
        .then((res) => setFastSearchResults(res.data?.contacts || []))
        .catch(() => setFastSearchResults([]))
        .finally(() => setFastSearching(false));
    }, 300);
    return () => clearTimeout(fastSearchTimeout.current);
  }, [search]);

  const handleJumpToSearchResult = (result) => {
    if (!result.conversationId) return; // no open conversation for this subscriber yet
    const existing = conversations.find((c) => String(c._id || c.id) === String(result.conversationId));
    if (existing) {
      selectConversation(existing);
    } else {
      // Not in the currently-loaded page(s) — fetch just enough to open it directly.
      setSelectedConv({ id: result.conversationId, contact_id: result.id });
      setMessages([]);
      loadMessages(result.conversationId);
    }
    setSearch('');
    setFastSearchResults([]);
  };

  // Socket.io Real-time connection with strict deduplication
  useEffect(() => {
    if (!user) return;

    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      if (apiUrl.startsWith('http')) {
        socketUrl = apiUrl.replace('/api/v1', '');
      } else {
        socketUrl = undefined; // lets socket.io use current origin and Vite proxy
      }
    }

    const socket = io(socketUrl, {
      auth: {
        agencyId: user.agencyId,
        userId: user.id,
        role: user.role,
      },
      transports: ['websocket', 'polling'],
    });

    socket.on('new_message', (data) => {
      const incoming = data.message;
      const isOpenConv = String(data.conversationId) === String(selectedIdRef.current);
      if (isOpenConv && incoming) {
        if (incoming.direction === 'INBOUND') {
          setSelectedConv((prev) => (prev ? { ...prev, lastInboundAt: incoming.created_at, last_inbound_at: incoming.created_at } : prev));
        }
        setMessages((prev) => {
          const isDuplicate = prev.some((m) => {
            if (m.id && incoming.id && String(m.id) === String(incoming.id)) return true;
            if (m._id && incoming._id && String(m._id) === String(incoming._id)) return true;
            if (m.external_msg_id && incoming.external_msg_id && m.external_msg_id === incoming.external_msg_id) return true;
            return false;
          });
          if (isDuplicate) return prev;
          return [...prev, incoming];
        });
      }
      // Targeted list-item patch instead of a full re-fetch (this fires on
      // every single inbound/outbound message — the hottest event in the
      // Inbox, so a full loadConversations() here was the main scalability
      // problem the approved performance plan called out). Updates the
      // preview text, bumps unread count if it's not the open conversation,
      // and re-sorts by last_message_at — everything the payload already carries.
      if (!incoming) return;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c._id || c.id) === String(data.conversationId));
        if (idx === -1) return prev; // not in the currently-loaded page(s) — new_conversation handles brand-new ones
        const patched = {
          ...prev[idx],
          lastMessageBody: incoming.body,
          lastMessageDirection: incoming.direction,
          lastMessageTime: incoming.created_at,
          last_message_at: incoming.created_at,
          ...(incoming.direction === 'INBOUND' ? { lastInboundAt: incoming.created_at, last_inbound_at: incoming.created_at } : {}),
          unread_count: isOpenConv ? 0 : (Number(prev[idx].unread_count) || 0) + (incoming.direction === 'INBOUND' ? 1 : 0),
        };
        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(patched); // most-recently-active conversation floats to the top, matching the list's sort order
        return next;
      });
    });

    // A brand-new contact's very first message — the one case new_message's
    // targeted patch above can't handle (nothing to patch yet), so this is
    // the sole remaining full-list refresh, and only fires for genuinely new
    // conversations, not on every message.
    socket.on('new_conversation', () => {
      loadConversations();
    });

    // Live tick updates: delivered / read / failed status arriving asynchronously
    // (e.g. WhatsApp status webhooks) get patched onto the already-rendered message.
    socket.on('message_status_update', (data) => {
      if (String(data.conversationId) !== String(selectedIdRef.current)) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (String(m.id) !== String(data.messageId)) return m;
          return {
            ...m,
            ...(data.deliveredAt ? { delivered_at: data.deliveredAt } : {}),
            ...(data.readAt ? { read_at: data.readAt, is_read: true } : {}),
            ...(data.status ? { status: data.status, failure_stage: data.failureStage, failure_reason: data.failureReason } : {}),
          };
        })
      );
    });

    socket.on('conversation_updated', (data) => {
      // Patch the currently-open conversation in place (assign/status/bot-pause changed by
      // another team member) instead of only refreshing the list — previously this required
      // a refresh to see reflected in the open detail pane.
      if (data && String(data.conversationId) === String(selectedIdRef.current)) {
        const assignedAg = data.assignedToId !== undefined
          ? agentsListRef.current.find((a) =>
              String(a.profileId || a.agent_profile_id || a.id) === String(data.assignedToId) ||
              String(a.userId || a.id) === String(data.assignedToId)
            )
          : null;
        const resolvedName = data.assignedAgentName || assignedAg?.name;
        setSelectedConv((prev) => (prev ? {
          ...prev,
          ...(data.assignedToId !== undefined ? { assigned_to_id: data.assignedToId } : {}),
          ...(resolvedName !== undefined ? { assignedAgentName: resolvedName } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.botPaused !== undefined ? { bot_paused: data.botPaused, botPaused: data.botPaused } : {}),
          ...(data.pauseReason !== undefined ? { pause_reason: data.pauseReason } : {}),
          ...(data.pausedByName !== undefined ? { pausedByName: data.pausedByName } : {}),
        } : prev));
        if (data.status !== undefined) setConvStatus(data.status);
        if (data.botPaused !== undefined) setBotPaused(Boolean(data.botPaused));
      }
      // Targeted list-item patch (assignment / status / pause changes) — no
      // full re-fetch needed, everything the list row displays is in the payload.
      setConversations((prev) => prev.map((c) => {
        if (String(c._id || c.id) !== String(data.conversationId)) return c;
        const assignedAg = data.assignedToId !== undefined
          ? agentsListRef.current.find((a) =>
              String(a.profileId || a.agent_profile_id || a.id) === String(data.assignedToId) ||
              String(a.userId || a.id) === String(data.assignedToId)
            )
          : null;
        const resolvedName = data.assignedAgentName || assignedAg?.name || (data.assignedToId === null ? null : c.assignedAgentName);
        return {
          ...c,
          ...(data.assignedToId !== undefined ? { assigned_to_id: data.assignedToId, assignedAgentName: resolvedName } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.botPaused !== undefined ? { bot_paused: data.botPaused } : {}),
        };
      }));
    });

    // Structured label attached/detached for a single subscriber — patches
    // the sidebar (if open) and every matching conversation-list row in
    // place instead of refreshing the whole list.
    socket.on('contact_labels_updated', (data) => {
      if (String(data.contactId) === String(selectedContactIdRef.current)) {
        setContactLabels(data.labels || []);
      }
      setConversations((prev) => prev.map((c) => (
        String(c.contact_id) === String(data.contactId) ? { ...c, contactLabels: data.labels || [] } : c
      )));
    });

    // Bulk label attach/detach or a label being deleted entirely — unlike
    // new_message this is a rare, explicit bulk action (not a hot per-message
    // path), and the payload doesn't carry a per-contact label list to patch
    // with, so a full list refresh here is the right tradeoff (simple,
    // correct, and infrequent enough that it doesn't matter for scale).
    socket.on('contacts_bulk_labeled', (data) => {
      const affectsOpenConv = Array.isArray(data.contactIds) &&
        data.contactIds.map(String).includes(String(selectedContactIdRef.current));
      if (affectsOpenConv && selectedIdRef.current) {
        // Re-fetch this subscriber's full detail rather than guessing the new label set client-side
        loadMessages(selectedIdRef.current);
      }
      loadConversations();
    });

    // Custom field catalog changed (field added/renamed/removed) — refresh definitions
    socket.on('custom_fields_updated', () => {
      customFieldAPI.getAll().then((res) => setCustomFieldDefs(res.data?.fields || [])).catch(() => {});
    });

    // A specific subscriber's custom field value changed (by anyone, any tab)
    socket.on('contact_custom_field_updated', (data) => {
      if (String(data.contactId) === String(selectedContactIdRef.current)) {
        setCustomFieldValues((prev) => ({ ...prev, [data.fieldId]: data.value ?? '' }));
      }
    });

    // A subscriber just finished a User Input Flow — pull their submissions again so
    // the panel fills in live, the same way a new message does.
    socket.on('user_input_flow_response_saved', (data) => {
      if (String(data.contactId) === String(selectedContactIdRef.current)) {
        contactAPI.getFormResponses(data.contactId)
          .then((r) => setFormResponses(r.data?.responses || []))
          .catch(() => {});
      }
    });

    return () => socket.disconnect();
    // loadMessages is a stable useCallback([]) reference — safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadConversations]);

  // Keyboard shortcuts: Ctrl/Cmd+K focuses search, "/" focuses the reply box
  // (only when not already typing somewhere), Escape closes the subscriber drawer.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && !isTyping && selectedIdRef.current) {
        e.preventDefault();
        messageInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
        } else {
          setShowSubscriberPanel(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-scroll messages to bottom reliably
  const scrollToBottom = useCallback((instant = false) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
    }
  }, []);

  // Load older message history on scroll-up (GET /conversations/:id/messages
  // cursor pagination) — prepending must NOT trigger the scroll-to-bottom
  // effect below, so it flags isPrependingOlderRef and manually restores the
  // scroll offset instead.
  const isPrependingOlderRef = useRef(false);
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasMoreMessages || !selectedIdRef.current || messages.length === 0) return;
    const container = messagesContainerRef.current;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingOlderMessages(true);
    const prevScrollHeight = container?.scrollHeight || 0;
    const prevScrollTop = container?.scrollTop || 0;
    try {
      const res = await conversationAPI.getMessages(selectedIdRef.current, { before: oldestId, limit: 50 });
      const older = res.data?.messages || [];
      if (older.length) {
        isPrependingOlderRef.current = true;
        setMessages((prev) => [...older, ...prev]);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
        });
      }
      setHasMoreMessages(Boolean(res.data?.hasMore));
    } catch (err) {
      console.error('Failed to load older messages', err);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages, hasMoreMessages, messages]);

  const handleMessagesScroll = useCallback((e) => {
    if (e.target.scrollTop < 80) loadOlderMessages();
  }, [loadOlderMessages]);

  useEffect(() => {
    if (isPrependingOlderRef.current) { isPrependingOlderRef.current = false; return; }
    if (!msgLoading && messages.length > 0) {
      // Immediate scroll
      scrollToBottom(true);
      // Secondary scrolls to handle async DOM layout & image dimension calculations
      const t1 = setTimeout(() => scrollToBottom(true), 40);
      const t2 = setTimeout(() => scrollToBottom(true), 150);
      const t3 = setTimeout(() => scrollToBottom(true), 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [messages, msgLoading, selectedId, scrollToBottom]);

  // Send Message with robust deduplication
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!botPaused) {
      setShowJoinModal(true);
      return;
    }
    if (!messageText.trim() || !selectedId || sending) return;

    // WhatsApp 24-hour messaging window enforcement:
    const isWhatsApp = (selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform || '').toUpperCase() === 'WHATSAPP';
    if (isWhatsApp) {
      const rawInbound = selectedConv?.lastInboundAt || selectedConv?.last_inbound_at;
      const inboundMs = rawInbound ? new Date(rawInbound).getTime() : 0;
      const isExpired = !inboundMs || (Date.now() - inboundMs > 24 * 60 * 60 * 1000);
      if (isExpired) {
        setSendError('Out of 24 hours window, you can only send a message template.');
        setTimeout(() => setSendError(''), 9000);
        return;
      }
    }

    const text = messageText.trim();
    setMessageText('');
    setShowCannedPicker(false);
    setSending(true);

    try {
      const res = await conversationAPI.sendMessage(selectedId, {
        content: text,
        body: text,
        type: 'text',
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        senderName: user?.name || user?.email?.split('@')[0] || 'Admin',
        agentName: user?.name || user?.email?.split('@')[0] || 'Admin',
      });
      const newMsg = res.data.message || res.data;

      // Add to messages only if not already present
      setMessages((prev) => {
        const isDuplicate = prev.some((m) => {
          if (m.id && newMsg.id && String(m.id) === String(newMsg.id)) return true;
          if (m._id && newMsg._id && String(m._id) === String(newMsg._id)) return true;
          return false;
        });
        if (isDuplicate) return prev;
        return [...prev, newMsg];
      });

      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c._id || c.id) === String(selectedId));
        if (idx === -1) return prev;
        const patched = {
          ...prev[idx],
          lastMessageBody: text,
          lastMessageDirection: 'OUTBOUND',
          lastMessageTime: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        };
        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(patched);
        return next;
      });

      loadConversations();
    } catch (err) {
      console.error('Failed to send message', err);
      const errMsg = err?.response?.data?.message || 'Failed to send message. Check your WhatsApp connection settings.';
      setSendError(errMsg);
      // The server still records failed sends as a message (red tick) so the conversation
      // shows what was attempted instead of it just vanishing — add it if present.
      const failedMsg = err?.response?.data?.chatMessage;
      if (failedMsg) {
        setMessages((prev) => (prev.some((m) => String(m.id) === String(failedMsg.id)) ? prev : [...prev, failedMsg]));
      } else {
        // No persisted record came back — restore the typed text so nothing is lost
        setMessageText(text);
      }
      // Auto-clear error after 8 seconds
      setTimeout(() => setSendError(''), 8000);
    } finally {
      setSending(false);
    }
  };

  // Handle File / Media Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    if (!botPaused) {
      setShowJoinModal(true);
      return;
    }

    // WhatsApp 24-hour messaging window enforcement:
    const isWhatsApp = (selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform || '').toUpperCase() === 'WHATSAPP';
    if (isWhatsApp) {
      const rawInbound = selectedConv?.lastInboundAt || selectedConv?.last_inbound_at;
      const inboundMs = rawInbound ? new Date(rawInbound).getTime() : 0;
      const isExpired = !inboundMs || (Date.now() - inboundMs > 24 * 60 * 60 * 1000);
      if (isExpired) {
        setSendError('Out of 24 hours window, you can only send a message template.');
        setTimeout(() => setSendError(''), 9000);
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await uploadAPI.uploadFile(formData);
      const { url, type, filename } = uploadRes.data;

      const res = await conversationAPI.sendMessage(selectedId, {
        type: type || 'IMAGE',
        body: filename || file.name,
        mediaUrl: url,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        senderName: user?.name || user?.email?.split('@')[0] || 'Admin',
        agentName: user?.name || user?.email?.split('@')[0] || 'Admin',
      });

      const newMsg = res.data.message || res.data;
      setMessages((prev) => {
        const isDuplicate = prev.some((m) => {
          if (m.id && newMsg.id && String(m.id) === String(newMsg.id)) return true;
          if (m._id && newMsg._id && String(m._id) === String(newMsg._id)) return true;
          return false;
        });
        if (isDuplicate) return prev;
        return [...prev, newMsg];
      });

      loadConversations();
    } catch (err) {
      console.error('Failed to upload file', err);
      // If the file reached our server and the platform send failed afterwards, the server
      // still records it as a red-tick message so it's visible in the conversation.
      const failedMsg = err?.response?.data?.chatMessage;
      if (failedMsg) {
        setMessages((prev) => (prev.some((m) => String(m.id) === String(failedMsg.id)) ? prev : [...prev, failedMsg]));
        setSendError(err?.response?.data?.message || 'Failed to deliver attachment.');
        setTimeout(() => setSendError(''), 8000);
      } else {
        alert('Failed to upload attachment.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle Bot/AI Pause — conversation-scoped (not the contact-level route)
  // so the pause metadata (who/when/why/auto-resume) this feature added
  // actually gets recorded; conversations.js's toggle-bot route keeps
  // contacts.bot_paused in sync itself.
  const handleToggleBot = async () => {
    if (!selectedId) return;
    setTogglingBot(true);
    try {
      const res = await conversationAPI.toggleBot(selectedId);
      setBotPaused(Boolean(res.data?.botPaused));
      setSelectedConv((prev) => (prev ? { ...prev, pause_reason: res.data?.botPaused ? 'MANUAL' : null } : prev));
    } catch (err) {
      console.error('Failed to toggle bot', err);
    } finally {
      setTogglingBot(false);
    }
  };

  // Human Agent Takeover ("Join Chat") — opens JoinChatModal (below), which
  // itself calls POST /conversations/:id/join (pauses bot+AI, assigns to the
  // caller, schedules the configured auto-resume timer from Bot Manager →
  // AI Reply Settings) and optionally sends the agent's own signature
  // message. This handler just patches local state once the modal reports success.
  const [showJoinModal, setShowJoinModal] = useState(false);
  const handleJoined = (result) => {
    setBotPaused(true);
    const assignedAg = result?.assignedToId
      ? agentsList.find((a) =>
          String(a.profileId || a.agent_profile_id || a.id) === String(result.assignedToId) ||
          String(a.userId || a.id) === String(result.assignedToId)
        )
      : null;
    setSelectedConv((prev) => (prev ? {
      ...prev,
      bot_paused: true,
      pause_reason: 'HUMAN_TAKEOVER',
      pausedByName: result?.pausedByName,
      assigned_to_id: result?.assignedToId ?? prev.assigned_to_id,
      assignedAgentName: result?.assignedAgentName || assignedAg?.name || result?.pausedByName || prev.assignedAgentName,
      status: result?.status || 'ASSIGNED',
    } : prev));
    setConvStatus(result?.status || 'ASSIGNED');
    if (result?.sentMessage) {
      setMessages((prev) => (prev.some((m) => String(m.id) === String(result.sentMessage.id)) ? prev : [...prev, result.sentMessage]));
    }
    loadConversations();
  };

  // Subscriber panel's "⋮" menu — Leave Chat (reverse of Join Chat), Reset
  // User Input Flow, Unsubscribe from Sequences, Clear History. Replaces the
  // old plain "✕ close drawer" button; the drawer itself no longer has a
  // close affordance (stays open by design — see the menu below), it's just
  // where these conversation-management actions live now.
  const [showSubscriberMenu, setShowSubscriberMenu] = useState(false);
  const [subscriberActionBusy, setSubscriberActionBusy] = useState(false);
  const subscriberMenuRef = useRef(null);

  useEffect(() => {
    if (!showSubscriberMenu) return;
    const onClickOutside = (e) => {
      if (subscriberMenuRef.current && !subscriberMenuRef.current.contains(e.target)) {
        setShowSubscriberMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSubscriberMenu]);

  const handleLeaveChat = async () => {
    if (!selectedId || subscriberActionBusy) return;
    setShowSubscriberMenu(false);
    setSubscriberActionBusy(true);
    try {
      const res = await conversationAPI.leave(selectedId);
      setBotPaused(false);
      setSelectedConv((prev) => (prev ? {
        ...prev,
        bot_paused: false,
        pause_reason: null,
        pausedByName: null,
        assigned_to_id: res.data?.assignedToId ?? prev.assigned_to_id,
        assignedAgentName: res.data?.assignedAgentName ?? prev.assignedAgentName,
        status: res.data?.status || 'OPEN',
      } : prev));
      setConvStatus(res.data?.status || 'OPEN');
      loadConversations();
    } catch (err) {
      console.error('Failed to leave chat', err);
      alert(err?.response?.data?.message || 'Failed to leave chat');
    } finally {
      setSubscriberActionBusy(false);
    }
  };

  const handleResetFlow = async () => {
    if (!selectedId || subscriberActionBusy) return;
    setShowSubscriberMenu(false);
    if (!window.confirm('Reset this subscriber\'s current bot flow progress? Their next message will start fresh from the beginning.')) return;
    setSubscriberActionBusy(true);
    try {
      const res = await conversationAPI.resetFlow(selectedId);
      alert(res.data?.reset ? 'Flow progress has been reset.' : 'This subscriber had no active flow to reset.');
    } catch (err) {
      console.error('Failed to reset flow', err);
      alert(err?.response?.data?.message || 'Failed to reset flow');
    } finally {
      setSubscriberActionBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!selectedId || subscriberActionBusy) return;
    setShowSubscriberMenu(false);
    if (!window.confirm('Unsubscribe this contact from all Sequences they are currently enrolled in? This cannot be undone — they would need to be re-enrolled manually.')) return;
    setSubscriberActionBusy(true);
    try {
      const res = await conversationAPI.unsubscribe(selectedId);
      alert(res.data?.sequencesStopped > 0 ? `Unsubscribed from ${res.data.sequencesStopped} sequence(s).` : 'This contact had no active sequence enrollments.');
    } catch (err) {
      console.error('Failed to unsubscribe', err);
      alert(err?.response?.data?.message || 'Failed to unsubscribe');
    } finally {
      setSubscriberActionBusy(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!selectedContactId || subscriberActionBusy) return;
    setShowSubscriberMenu(false);
    const isBlocked = Boolean(selectedConv?.contactIsBlocked);
    try {
      if (isBlocked) {
        await contactAPI.unblock(selectedContactId);
        setSelectedConv((prev) => (prev ? { ...prev, contactIsBlocked: false, contactBlockedReason: null } : prev));
      } else {
        const reason = window.prompt('Block this subscriber — their messages will stop reaching your inbox entirely (bot, AI, and agents). Optional reason:');
        if (reason === null) return; // cancelled
        setSubscriberActionBusy(true);
        await contactAPI.block(selectedContactId, reason);
        setSelectedConv((prev) => (prev ? { ...prev, contactIsBlocked: true, contactBlockedReason: reason || null } : prev));
      }
      loadConversations();
    } catch (err) {
      console.error('Failed to update block status', err);
      alert(err?.response?.data?.message || 'Failed to update block status');
    } finally {
      setSubscriberActionBusy(false);
    }
  };

  const handleClearHistory = async () => {
    if (!selectedId || subscriberActionBusy) return;
    setShowSubscriberMenu(false);
    if (!window.confirm('Clear this conversation\'s entire message history? This cannot be undone.')) return;
    setSubscriberActionBusy(true);
    try {
      await conversationAPI.clearHistory(selectedId);
      setMessages([]);
      loadConversations();
    } catch (err) {
      console.error('Failed to clear history', err);
      alert(err?.response?.data?.message || 'Failed to clear history');
    } finally {
      setSubscriberActionBusy(false);
    }
  };

  // Assign Team Agent
  const handleAssignAgent = async (agentProfileId) => {
    if (!selectedId) return;
    setAssigningAgent(true);
    try {
      const res = await conversationAPI.assign(selectedId, agentProfileId || null);
      const ag = agentsList.find((a) =>
        String(a.profileId || a.agent_profile_id || a.id) === String(agentProfileId) ||
        String(a.userId || a.id) === String(agentProfileId)
      );
      setSelectedConv((prev) => (prev ? {
        ...prev,
        assigned_to_id: agentProfileId || null,
        assignedAgentName: res.data?.assignedAgentName || ag?.name || null,
        status: agentProfileId ? 'ASSIGNED' : prev.status,
      } : prev));
      loadConversations();
    } catch (err) {
      console.error('Failed to assign agent', err);
    } finally {
      setAssigningAgent(false);
    }
  };

  // Update Conversation Status (OPEN, PENDING, RESOLVED)
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedId) return;
    setUpdatingStatus(true);
    try {
      await conversationAPI.updateStatus(selectedId, newStatus);
      setConvStatus(newStatus);
      setSelectedConv((prev) => ({ ...prev, status: newStatus }));
      loadConversations();
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Send Menu result — a bot flow trigger has no message to append (the
  // flow's own reply arrives over the socket like any bot reply); a
  // template/WhatsApp Flow send returns the saved message the same way
  // handleSendMessage does, so append it the same way.
  const handleSendMenuResult = (result) => {
    if (result?.kind === 'flow') {
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
      return;
    }
    if (result?.message) {
      setMessages((prev) => (prev.some((m) => String(m.id) === String(result.message.id)) ? prev : [...prev, result.message]));
    }
    loadConversations();
  };

  // ─── Canned Responses "/" picker ──────────────────────────────────────────
  const cannedQuery = /^\/(\S*)$/.exec(messageText)?.[1] ?? null; // non-null only while composer is exactly "/" + partial text, no space yet
  const cannedMatches = useMemo(() => {
    if (cannedQuery === null) return [];
    const q = cannedQuery.toLowerCase();
    return cannedResponses.filter((c) => (
      (c.shortcut && c.shortcut.toLowerCase().startsWith(q)) || c.title?.toLowerCase().includes(q)
    )).slice(0, 8);
  }, [cannedQuery, cannedResponses]);

  const handleMessageTextChange = (val) => {
    setMessageText(val);
    setShowCannedPicker(/^\/(\S*)$/.test(val));
  };

  const handleSelectCanned = (canned) => {
    setMessageText(canned.body); // inserted only — the agent still presses Send
    setShowCannedPicker(false);
    messageInputRef.current?.focus();
  };

  // ─── AI Rewrite ────────────────────────────────────────────────────────────
  const handleRewrite = async (style) => {
    if (!messageText.trim() || rewriting) return;
    setShowRewriteMenu(false);
    setRewriting(true);
    try {
      const res = await aiRewriteAPI.rewrite(messageText.trim(), style);
      if (res.data?.text) {
        setMessageText(res.data.text); // inserted only — never auto-sent
        messageInputRef.current?.focus();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to rewrite message';
      console.error('AI rewrite failed', err);
      alert(msg);
    } finally {
      setRewriting(false);
    }
  };

  // ─── Sequences (drip campaigns) — reuses the existing sequences backend
  // (enrollContactsInSequence/unsubscribeContactFromSequence in
  // routes/sequences.js) rather than a new enrollment system. ─────────────
  const refreshContactSequences = () => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    contactAPI.getSequences(contactId).then((r) => setContactSequences(r.data?.sequences || [])).catch(() => {});
  };

  const handleStartSequence = async () => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId || !selectedSequenceId || sequenceBusy) return;
    setSequenceBusy(true);
    try {
      await sequenceAPI.subscribe(selectedSequenceId, { contactId, targetPlatform: selectedConv?.platform });
      setSelectedSequenceId('');
      refreshContactSequences();
    } catch (err) {
      console.error('Failed to start sequence', err);
    } finally {
      setSequenceBusy(false);
    }
  };

  const handleStopSequence = async (sequenceId) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId || sequenceBusy) return;
    setSequenceBusy(true);
    try {
      await sequenceAPI.unsubscribe(sequenceId, { contactId });
      refreshContactSequences();
    } catch (err) {
      console.error('Failed to stop sequence', err);
    } finally {
      setSequenceBusy(false);
    }
  };

  // ─── Follow-ups ───────────────────────────────────────────────────────────
  const refreshContactFollowUps = () => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    followupAPI.getAll({ contactId }).then((r) => setContactFollowUps(r.data?.followUps || [])).catch(() => {});
  };

  const handleCreateFollowUp = async () => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId || !newFollowUpDraft.date || !newFollowUpDraft.time || !newFollowUpDraft.note.trim() || savingFollowUp) return;
    setSavingFollowUp(true);
    try {
      const dueAt = new Date(`${newFollowUpDraft.date}T${newFollowUpDraft.time}`).toISOString();
      await followupAPI.create({
        contactId,
        conversationId: selectedId,
        dueAt,
        note: newFollowUpDraft.note.trim(),
        assignedToAgentProfileId: newFollowUpDraft.assignedToAgentProfileId || null,
      });
      setNewFollowUpDraft({ date: '', time: '', note: '', assignedToAgentProfileId: '' });
      setShowNewFollowUp(false);
      refreshContactFollowUps();
    } catch (err) {
      console.error('Failed to create follow-up', err);
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleFollowUpStatus = async (followUpId, status) => {
    try {
      await followupAPI.setStatus(followUpId, status);
      refreshContactFollowUps();
    } catch (err) {
      console.error('Failed to update follow-up', err);
    }
  };

  const handleDeleteFollowUp = async (followUpId) => {
    if (!window.confirm('Delete this follow-up?')) return;
    try {
      await followupAPI.delete(followUpId);
      refreshContactFollowUps();
    } catch (err) {
      console.error('Failed to delete follow-up', err);
    }
  };

  // ─── Structured Labels (unified with the Contacts/Subscriber Manager) ────────
  // Attach an existing agency label to the open subscriber
  const handleAttachLabel = async (labelId) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId || savingLabel) return;
    setSavingLabel(true);
    try {
      const res = await labelAPI.attachToContact(contactId, { labelId });
      setContactLabels(res.data?.labels || []);
    } catch (err) {
      console.error('Failed to attach label', err);
    } finally {
      setSavingLabel(false);
    }
  };

  // Create a brand-new agency label and attach it in one step
  const handleCreateAndAttachLabel = async (e) => {
    e?.preventDefault();
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    const name = newLabelName.trim();
    if (!name || !contactId || savingLabel) return;
    setSavingLabel(true);
    try {
      // The Inbox's own Labels UI is plain/colorless, but `labels.color` is
      // still a real column other surfaces (e.g. Contacts Manager) may show —
      // a fixed neutral default here keeps those surfaces sane without the
      // Inbox needing a color picker.
      const res = await labelAPI.attachToContact(contactId, { name, color: '#64748b' });
      setContactLabels(res.data?.labels || []);
      setNewLabelName('');
      // Refresh the agency-wide label catalog so the new label shows up in the picker/filter
      labelAPI.getAll().then((r) => setAgencyLabels(r.data?.labels || [])).catch(() => {});
    } catch (err) {
      console.error('Failed to create label', err);
    } finally {
      setSavingLabel(false);
    }
  };

  // Detach a label from the open subscriber
  const handleDetachLabel = async (labelId) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    try {
      const res = await labelAPI.detachFromContact(contactId, labelId);
      setContactLabels(res.data?.labels || []);
    } catch (err) {
      console.error('Failed to remove label', err);
    }
  };

  // ─── Custom Fields ────────────────────────────────────────────────────────
  const handleSaveCustomField = async (fieldId, value) => {
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!contactId) return;
    setSavingFieldId(fieldId);
    try {
      await customFieldAPI.setValue(contactId, fieldId, value);
      setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    } catch (err) {
      console.error('Failed to save custom field', err);
    } finally {
      setSavingFieldId(null);
    }
  };

  const handleCreateCustomField = async (e) => {
    e?.preventDefault();
    const name = newFieldDraft.name.trim();
    if (!name || savingNewField) return;
    setSavingNewField(true);
    try {
      const options = newFieldDraft.fieldType === 'SELECT'
        ? newFieldDraft.options.split(',').map((o) => o.trim()).filter(Boolean)
        : [];
      const res = await customFieldAPI.create({ name, fieldType: newFieldDraft.fieldType, options });
      setCustomFieldDefs((prev) => [...prev, res.data.field]);
      setNewFieldDraft({ name: '', fieldType: 'TEXT', options: '' });
      setShowNewFieldForm(false);
    } catch (err) {
      console.error('Failed to create custom field', err);
      alert(err?.response?.data?.message || 'Failed to create custom field');
    } finally {
      setSavingNewField(false);
    }
  };

  // Add Internal Agent Note
  const handleAddNote = async (e) => {
    e?.preventDefault();
    const noteText = newNoteText.trim();
    const contactId = selectedConv?.contact_id || selectedConv?.contactId;
    if (!noteText || !contactId || savingNote) return;

    setSavingNote(true);
    try {
      await contactAPI.addNote(contactId, noteText);
      const res = await contactAPI.getNotes(contactId);
      setContactNotes(res.data.notes || []);
      setNewNoteText('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setSavingNote(false);
    }
  };

  // Filtered Conversations
  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    const name = (c.contactName || c.contact_name || c.external_id || '').toLowerCase();
    const lastMsg = (c.lastMessageBody || c.lastMessage?.content || c.last_message || '').toLowerCase();
    const integName = (c.integrationName || c.integration_name || '').toLowerCase();
    const matchesSearch = name.includes(q) || lastMsg.includes(q) || integName.includes(q);

    const convPlat = (c.platform || c.integrationPlatform || c.contactPlatform || '').toUpperCase();
    const matchesPlatform = !platformFilter || platformFilter === 'ALL' || convPlat === platformFilter.toUpperCase();

    // Match Status
    let matchesStatus = true;
    if (statusFilter && statusFilter !== 'All') {
      const convStatus = (c.status || 'OPEN').toUpperCase();
      if (statusFilter.toUpperCase() === 'OPEN') {
        matchesStatus = ['OPEN', 'ASSIGNED'].includes(convStatus);
      } else if (statusFilter.toUpperCase() === 'RESOLVED') {
        matchesStatus = ['RESOLVED', 'CLOSED'].includes(convStatus);
      } else {
        matchesStatus = convStatus === statusFilter.toUpperCase();
      }
    }

    return matchesSearch && matchesPlatform && matchesStatus;
  });

  const activePlatformInfo = getPlatformInfo(selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform);
  const ActivePlatformIcon = activePlatformInfo.icon || MessageSquare;

  // Read-only "System Fields" the channel's own profile API returned (see webhook.js) —
  // mysql2 auto-parses native JSON columns, but guard against a raw string just in case.
  const platformProfileEntries = useMemo(() => {
    let raw = selectedConv?.contactPlatformProfile;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = null; }
    }
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== '');
  }, [selectedConv?.contactPlatformProfile]);

  return (
    <AppLayout>
      <div className="inbox-layout" style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#f8fafc' }}>
        {/* ── 0. Views & Channels Rail ──────────────────────────────────
            Icon-only — deliberately thin (52px) so the conversation list
            keeps the space. Same statusFilter/agentFilter/platformFilter
            state the header drives below — not a parallel filter system.
            Every button carries a title tooltip since there's no label. */}
        <aside className="inbox-views-rail" style={{ width: 52, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', padding: '12px 0' }}>
          {/* Nav-menu (pop bar) trigger — top of the rail */}
          <button
            onClick={openPopupNav}
            title="Open Navigation Menu (Pop Bar)"
            style={{
              width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', marginBottom: 10,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Menu size={17} />
          </button>

          {/* Views — status chips (All/Open/Pending/Resolved) plus the
              Mine/Unassigned smart views, all as one icon group. There's no
              "Blocked" state here — this app has no block-a-subscriber
              feature yet, so a button for it would filter on nothing. */}
          {[
            { key: 'all', label: 'All', icon: <Layers size={16} />, active: statusFilter === 'All' && !agentFilter, onClick: () => { setStatusFilter('All'); setAgentFilter(''); } },
            { key: 'open', label: 'Open', icon: <MessageSquare size={16} />, active: statusFilter === 'OPEN' && !agentFilter, onClick: () => { setStatusFilter('OPEN'); setAgentFilter(''); } },
            { key: 'pending', label: 'Pending', icon: <Clock size={16} />, active: statusFilter === 'PENDING' && !agentFilter, onClick: () => { setStatusFilter('PENDING'); setAgentFilter(''); } },
            { key: 'resolved', label: 'Resolved', icon: <CheckCircle2 size={16} />, active: statusFilter === 'RESOLVED' && !agentFilter, onClick: () => { setStatusFilter('RESOLVED'); setAgentFilter(''); } },
            { key: 'mine', label: 'Mine', icon: <User size={16} />, active: !!myProfileId && agentFilter === myProfileId, disabled: !myProfileId, onClick: () => { setStatusFilter('All'); setAgentFilter(myProfileId); } },
            { key: 'unassigned', label: 'Unassigned', icon: <UserX size={16} />, active: agentFilter === 'unassigned', onClick: () => { setStatusFilter('All'); setAgentFilter('unassigned'); } },
          ].map(({ key, label, icon, active, disabled, onClick }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              disabled={disabled}
              title={disabled ? "You don't have a team profile on this workspace yet" : label}
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 3,
                border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
                background: active ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                color: disabled ? '#cbd5e1' : (active ? '#2563eb' : '#94a3b8'),
              }}
              onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {icon}
            </button>
          ))}

          <div style={{ width: 24, borderTop: '1px solid #f1f5f9', margin: '8px 0' }} />

          {[
            { key: 'WHATSAPP', label: 'WhatsApp', icon: <MessageCircle size={16} color="#25d366" /> },
            { key: 'FACEBOOK', label: 'Messenger', icon: <Facebook size={16} color="#1877f2" /> },
            { key: 'INSTAGRAM', label: 'Instagram', icon: <Instagram size={16} color="#e1306c" /> },
            { key: 'TELEGRAM', label: 'Telegram', icon: <Send size={16} color="#229ed9" /> },
            { key: 'WEBCHAT', label: 'Webchat', icon: <Globe size={16} color="#6366f1" /> },
          ].map(({ key, label, icon }) => {
            const active = platformFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPlatformFilter(active ? '' : key)}
                title={label}
                style={{
                  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 3,
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: active ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  opacity: active || !platformFilter ? 1 : 0.45,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {icon}
              </button>
            );
          })}
        </aside>

        {/* ── 1. Conversation List Column ── */}
        {/* Widened from 330 — the views rail going icon-only (was 212px)
            and the filter row collapsing to one trigger freed up room,
            reallocated here so the subscriber list gets more space. */}
        <aside className="conversation-list" style={{ width: 380, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
          <div className="conversation-list-header" style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                <MessageSquare size={16} color="#2563eb" /> Conversations
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
                {filteredConversations.length} Active
              </span>
            </div>

            {/* Search + Filter — one row. Search stays narrow (flex-1, not
                full width) so the icon-only Filter trigger fits beside it
                instead of eating a whole row of its own. The search box
                filters the loaded list instantly (client-side) while ALSO
                firing the fast indexed subscriber search below, which can
                find a subscriber the list doesn't have loaded. */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-input"
                  placeholder="Search... (Ctrl+K)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 30, fontSize: '0.8rem', height: 32, width: '100%' }}
                />
                {search.trim().length >= 2 && (fastSearching || fastSearchResults.length > 0) && (
                  <div style={{
                    position: 'absolute', top: 36, left: 0, right: 0,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 25, maxHeight: 260, overflowY: 'auto',
                  }}>
                    <div style={{ padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #f1f5f9' }}>
                      {fastSearching ? 'Searching subscribers…' : `${fastSearchResults.length} subscriber${fastSearchResults.length === 1 ? '' : 's'}`}
                    </div>
                    {fastSearchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleJumpToSearchResult(r)}
                        disabled={!r.conversationId}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                          padding: '8px 12px', border: 'none', background: 'transparent', cursor: r.conversationId ? 'pointer' : 'default',
                        }}
                        onMouseEnter={(e) => { if (r.conversationId) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{r.name || 'Unnamed'}</div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.phone || r.platform}</div>
                        </div>
                        {!r.conversationId && <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>No chat yet</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter panel — Agent, Label and Date Range all visible at
                  once, staged locally and committed on Apply (or discarded
                  by Reset). Channel/status live on the rail, not here. */}
              <div ref={filterMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={openFilterPanel}
                  title="Filter by agent, label or date"
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
                    border: '1px solid #e2e8f0', background: filterMenuOpen ? '#f1f5f9' : '#fff', color: '#475569', cursor: 'pointer',
                  }}
                >
                  <SlidersHorizontal size={14} />
                  {(agentFilterLabel || labelFilterLabel || isDateFilterActive) && (
                    <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 99, background: '#2563eb' }} />
                  )}
                </button>

                {filterMenuOpen && (
                  <div style={{
                    // Anchored to the trigger's RIGHT edge, growing leftward —
                    // the trigger sits at the right end of the search row, so
                    // opening left:0 (growing rightward) pushed this past the
                    // 380px conversation-list panel and under the chat pane.
                    position: 'absolute', top: 36, right: 0, zIndex: 30, width: 268,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.14)', padding: 14,
                    maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
                  }}>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label">Team Member</label>
                      <select className="form-input" value={stagedAgentFilter} onChange={(e) => setStagedAgentFilter(e.target.value)}>
                        <option value="">All Agents</option>
                        <option value="unassigned">Unassigned</option>
                        {agentsList.map((a) => {
                          const pid = String(a.profileId || a.agent_profile_id || a.id);
                          return <option key={pid} value={pid}>{a.name || a.email}</option>;
                        })}
                      </select>
                    </div>

                    {agencyLabels.length > 0 && (
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <label className="form-label">Label</label>
                        <select className="form-input" value={stagedLabelFilterId} onChange={(e) => setStagedLabelFilterId(e.target.value)}>
                          <option value="">All Labels</option>
                          {agencyLabels.map((lb) => (
                            <option key={lb.id} value={lb.id}>{lb.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ marginBottom: 4 }}>
                      <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Date Range</label>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                        {[['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days']].map(([value, label]) => {
                          const active = stagedDatePreset === value && !stagedDateFrom;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => { setStagedDatePreset(value); setStagedDateFrom(''); setStagedDateTo(''); }}
                              style={{
                                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                                border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                                background: active ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                                color: active ? '#2563eb' : '#64748b',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      <InboxRangeCalendar
                        month={calendarMonth}
                        from={stagedDateFrom}
                        to={stagedDateTo}
                        onNavigate={(dir) => setCalendarMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + dir); return d; })}
                        onPick={pickCalendarDate}
                      />

                      {(stagedDateFrom || stagedDateTo) && (
                        <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>
                          {stagedDateFrom || '…'} &rarr; {stagedDateTo || '…'}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={resetFilterPanel}>Reset</button>
                      <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={applyFilterPanel}>Apply</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active filter chips — only takes a row when something is
                actually set, so the default state stays one thin line. */}
            {(agentFilterLabel || labelFilterLabel || isDateFilterActive) && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {agentFilterLabel && <FilterChip label={agentFilterLabel} onRemove={() => setAgentFilter('')} />}
                {labelFilterLabel && <FilterChip label={labelFilterLabel} onRemove={() => setLabelFilterId('')} />}
                {isDateFilterActive && (
                  <FilterChip
                    label={dateFilterLabel}
                    onRemove={() => { setDateRangePreset('7d'); setCustomDateFrom(''); setCustomDateTo(''); }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Conversation List Items */}
          <div className="conversation-list-body" style={{ flex: 1, overflowY: 'auto' }}>
            {convLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Loading chats...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                No conversations found.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const id = conv._id || conv.id;
                const isSelected = String(selectedId) === String(id);
                const pInfo = getPlatformInfo(conv.platform || conv.contactPlatform);
                const PlatformIcon = pInfo.icon;
                const contactName = conv.contactName || conv.contact_name || conv.external_id || 'Visitor';
                const lastMsg = conv.lastMessageBody || conv.lastMessage?.content || conv.last_message || 'Started conversation';
                const time = conv.lastMessageTime || conv.last_message_at || conv.updatedAt || conv.createdAt;
                const assignedAg = agentsList.find((ag) =>
                  String(ag.profileId || ag.agent_profile_id || ag.id) === String(conv.assigned_to_id) ||
                  String(ag.userId || ag.id) === String(conv.assigned_to_id)
                );
                const agentDisplayName = conv.assignedAgentName || assignedAg?.name;

                return (
                  <div
                    key={id}
                    className={`conversation-item ${isSelected ? 'active' : ''}`}
                    onClick={() => selectConversation(conv)}
                    style={{
                      padding: '8px 11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: isSelected ? '#f0f4ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <ContactAvatar
                      avatar={conv.contactAvatar || conv.avatar}
                      name={contactName}
                      size={34}
                      pInfo={pInfo}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contactName}
                        </span>
                        <span style={{ fontSize: '0.67rem', color: '#94a3b8', flexShrink: 0, marginLeft: 4 }}>
                          {formatRelativeTime(time)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 1 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          fontSize: '0.73rem', color: conv.unread_count > 0 ? '#0f172a' : '#64748b',
                          fontWeight: conv.unread_count > 0 ? 700 : 400,
                          overflow: 'hidden', flex: 1, minWidth: 0,
                        }}>
                          {conv.lastMessageDirection === 'OUTBOUND' && (
                            <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                              <MessageTick
                                status={conv.lastMessageStatus}
                                failureStage={conv.lastMessageFailureStage}
                                isRead={Boolean(conv.lastMessageIsRead)}
                                deliveredAt={conv.lastMessageDeliveredAt}
                              />
                            </span>
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg}</span>
                        </div>
                        {conv.unread_count > 0 && (
                          <span style={{
                            flexShrink: 0, minWidth: 17, height: 17, borderRadius: 9, padding: '0 4px',
                            background: '#2563eb', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                      {/* Meta row: Platform Pill, Assigned Agent, and Status */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: pInfo.bg,
                              color: pInfo.color,
                              flexShrink: 0,
                            }}
                          >
                            <PlatformIcon size={9} />
                            {conv.integrationName || conv.integration_name || pInfo.label}
                          </span>
                          {agentDisplayName && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2.5,
                                fontSize: '0.64rem',
                                fontWeight: 600,
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #e2e8f0',
                                maxWidth: 95,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={`Assigned Agent: ${agentDisplayName}`}
                            >
                              <User size={9} color="#64748b" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {agentDisplayName}
                              </span>
                            </span>
                          )}
                        </div>
                        {conv.status && (
                          <span style={{
                            fontSize: '0.62rem',
                            color: conv.status === 'OPEN' ? '#16a34a' : conv.status === 'ASSIGNED' ? '#2563eb' : '#94a3b8',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            flexShrink: 0,
                          }}>
                            {conv.status.toLowerCase()}
                          </span>
                        )}
                      </div>
                      {Array.isArray(conv.contactLabels) && conv.contactLabels.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                          {conv.contactLabels.map((lb) => (
                            <span
                              key={lb.id}
                              style={{
                                fontSize: '0.58rem', fontWeight: 700, padding: '0 4px', borderRadius: 6,
                                background: `${lb.color}18`, color: lb.color,
                              }}
                            >
                              {lb.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {!convLoading && convHasMore && !search && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <button
                  type="button"
                  onClick={loadMoreConversations}
                  disabled={loadingMoreConvs}
                  style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: loadingMoreConvs ? 'wait' : 'pointer' }}
                >
                  {loadingMoreConvs ? 'Loading…' : 'Load more chats'}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── 2. Active Chat Messages Area ── */}
        <main className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>
          {selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="chat-header" style={{ height: 56, padding: '0 20px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ContactAvatar
                    avatar={selectedConv.contactAvatar || selectedConv.avatar}
                    name={selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id}
                    size={36}
                    pInfo={activePlatformInfo}
                  />

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                      {selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id || 'Subscriber'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: activePlatformInfo.color }}>
                        {selectedConv.integrationName || selectedConv.integration_name || activePlatformInfo.label}
                      </span>
                      <span>•</span>
                      <span>{activePlatformInfo.label}</span>
                      {currentAgentName && (
                        <>
                          <span>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: '#334155' }}>
                            <User size={11} color="#64748b" /> {currentAgentName}
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span style={{ color: botPaused ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                        {botPaused ? '🔴 Bot / AI Paused' : '🟢 Bot / AI Active'}
                        {botPaused && selectedConv.pause_reason === 'HUMAN_TAKEOVER' && (
                          <span style={{ fontWeight: 600, color: '#64748b' }}>
                            {' '}— takeover active
                          </span>
                        )}
                        {botPaused && selectedConv.pause_reason === 'OVER_LIMIT' && (
                          <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                            {' '}— over your subscriber limit, upgrade to re-enable
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(selectedConv.platform || selectedConv.integrationPlatform || selectedConv.contactPlatform || '').toUpperCase() === 'WHATSAPP' && (
                    <button
                      onClick={() => whatsappCall.placeCall(
                        selectedConv.contact_id || selectedConv.contactId,
                        selectedId,
                        selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id,
                        selectedConv.integration_id || selectedConv.integrationId
                      )}
                      disabled={whatsappCall.callState !== 'idle'}
                      title="Call this subscriber on WhatsApp"
                      className="transition-all duration-150 hover:brightness-95 active:scale-95"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 11px',
                        height: 28,
                        borderRadius: 16,
                        border: '1px solid #86efac',
                        background: '#dcfce7',
                        color: '#15803d',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: whatsappCall.callState !== 'idle' ? 'default' : 'pointer',
                        opacity: whatsappCall.callState !== 'idle' ? 0.6 : 1,
                        boxShadow: '0 1px 3px rgba(34, 197, 94, 0.12)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <PhoneCall size={12} />
                      <span>Call</span>
                    </button>
                  )}
                  <button
                    onClick={handleToggleBot}
                    disabled={togglingBot}
                    title={botPaused ? 'Click to resume automated Bot & AI replies' : 'Click to pause automated Bot & AI replies'}
                    className="transition-all duration-150 hover:brightness-95 active:scale-95"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 11px',
                      height: 28,
                      borderRadius: 16,
                      border: botPaused ? '1px solid #fca5a5' : '1px solid #86efac',
                      background: botPaused ? '#fee2e2' : '#dcfce7',
                      color: botPaused ? '#b91c1c' : '#15803d',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: togglingBot ? 'default' : 'pointer',
                      opacity: togglingBot ? 0.6 : 1,
                      boxShadow: botPaused ? '0 1px 3px rgba(239, 68, 68, 0.12)' : '0 1px 3px rgba(34, 197, 94, 0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: botPaused ? '#ef4444' : '#22c55e',
                        display: 'inline-block',
                      }}
                    />
                    {botPaused ? <Play size={10} fill="#b91c1c" /> : <Pause size={10} />}
                    <span>{botPaused ? 'Resume Bot/AI' : 'Pause Bot/AI'}</span>
                  </button>

                  <button
                    onClick={() => setShowSubscriberPanel((p) => !p)}
                    className="transition-all duration-150 hover:brightness-95 active:scale-95"
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      border: '1px solid',
                      borderColor: showSubscriberPanel ? '#c7d2fe' : '#e2e8f0',
                      background: showSubscriberPanel ? '#eef2ff' : '#ffffff',
                      color: showSubscriberPanel ? '#4338ca' : '#475569',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'transform 0.12s ease, background 0.12s ease',
                    }}
                  >
                    <SlidersHorizontal size={14} />
                    {showSubscriberPanel ? 'Hide Drawer' : 'Subscriber Info'}
                  </button>
                </div>
              </div>

              {/* Chat Message List */}
              <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {msgLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading conversation messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: '0.84rem' }}>
                    No messages yet in this conversation.
                  </div>
                ) : (
                  <>
                    {loadingOlderMessages && (
                      <div style={{ textAlign: 'center', padding: 8 }}>
                        <div className="loading-spinner" style={{ margin: '0 auto', width: 18, height: 18 }} />
                      </div>
                    )}
                    {!loadingOlderMessages && hasMoreMessages && (
                      <div style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={loadOlderMessages}
                          style={{ fontSize: '0.74rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Load older messages
                        </button>
                      </div>
                    )}
                  </>
                )}
                {!msgLoading && messages.length > 0 && (
                  messages.map((msg, idx) => {
                    const isOutbound = (msg.direction || '').toUpperCase() === 'OUTBOUND';
                    const rawMedia = msg.media_url || msg.mediaUrl || msg.url || (
                      typeof msg.body === 'string' && (msg.body.startsWith('http') || msg.body.startsWith('/uploads')) && msg.body.match(/\.(jpeg|jpg|gif|png|webp|svg|mp4|webm|mov|ogg|mp3|pdf|doc|docx)($|\?)/i)
                        ? msg.body
                        : null
                    );
                    const mediaUrl = resolveMediaUrl(rawMedia);
                    const text = (msg.body || msg.content || msg.message || '').trim();
                    const isMediaOnly = rawMedia && (text === rawMedia || text === '[Attachment]' || text === '[Media]' || text === '[Audio]');

                    const isImage = msg.type === 'IMAGE' || (mediaUrl && mediaUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i));
                    const isVideo = msg.type === 'VIDEO' || (mediaUrl && mediaUrl.match(/\.(mp4|webm|mov|mkv)($|\?)/i));
                    const isAudio = msg.type === 'AUDIO' || (mediaUrl && mediaUrl.match(/\.(mp3|wav|ogg|m4a)($|\?)/i));
                    const isDoc   = msg.type === 'DOCUMENT' || (mediaUrl && mediaUrl.match(/\.(pdf|doc|docx|zip|txt)($|\?)/i));

                    let meta = msg.metadata;
                    if (typeof meta === 'string') {
                      try { meta = JSON.parse(meta); } catch (_) { meta = null; }
                    }
                    const buttons = meta?.buttons || msg.buttons || null;
                    const hasAttachedButtons = isImage && buttons && buttons.length > 0;

                    // Determine sender attribution (Bot vs Admin / Team Member)
                    let isBot = false;
                    let senderDisplayName = '';
                    if (isOutbound) {
                      if (meta?.senderType === 'AGENT' || meta?.senderType === 'ADMIN' || meta?.agentName || meta?.userId) {
                        isBot = false;
                        senderDisplayName = meta?.agentName || meta?.senderName || user?.name || 'Admin';
                      } else if (meta?.senderType === 'BOT' || meta?.senderName === 'Bot') {
                        isBot = true;
                        senderDisplayName = meta?.senderName || 'Bot';
                      } else if (msg.sent_at) {
                        isBot = false;
                        senderDisplayName = meta?.senderName || user?.name || 'Admin';
                      } else {
                        isBot = true;
                        senderDisplayName = 'Bot';
                      }
                    } else {
                      senderDisplayName = selectedConv?.contactName || selectedConv?.contact_name || selectedConv?.name || selectedConv?.external_id || 'Subscriber';
                    }

                    return (
                      <div
                        key={msg.id || msg._id || idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isOutbound ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '72%',
                            padding: (isImage && isMediaOnly && !buttons) ? '4px' : '10px 14px',
                            borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                            background: isOutbound ? '#f1f5f9' : '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.86rem',
                            lineHeight: 1.45,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                          }}
                        >
                          {/* ── Interactive Header (if present) ── */}
                          {meta?.headerText && (
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4, color: '#0f172a' }}>
                              {meta.headerText}
                            </div>
                          )}
                          {meta?.headerMediaUrl && (
                            <div style={{ marginBottom: 8 }}>
                              <img
                                src={resolveMediaUrl(meta.headerMediaUrl)}
                                alt="Header Media"
                                style={{ width: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'cover' }}
                              />
                            </div>
                          )}

                          {/* ── Image Rendering ── */}
                          {isImage && (
                            <div style={{ marginBottom: (isMediaOnly && !buttons) ? 0 : 8 }}>
                              <img
                                src={mediaUrl}
                                alt="Attachment"
                                style={{
                                  width: '100%',
                                  maxHeight: 280,
                                  borderRadius: 10,
                                  cursor: 'pointer',
                                  display: 'block',
                                  objectFit: 'cover',
                                }}
                                onClick={() => setPreviewImage(mediaUrl)}
                              />
                            </div>
                          )}

                          {/* ── Video Rendering ── */}
                          {isVideo && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8 }}>
                              <video
                                src={mediaUrl}
                                controls
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 280,
                                  borderRadius: 10,
                                  display: 'block',
                                }}
                              />
                            </div>
                          )}

                          {/* ── Audio Rendering ── */}
                          {isAudio && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8, minWidth: 220 }}>
                              <audio src={mediaUrl} controls style={{ width: '100%', height: 36 }} />
                            </div>
                          )}

                          {/* ── Document / File Rendering ── */}
                          {isDoc && (
                            <div style={{ marginBottom: isMediaOnly ? 0 : 8 }}>
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  color: '#0f172a',
                                  textDecoration: 'none',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                }}
                              >
                                <FileText size={16} />
                                <span>{text || 'Download Document'}</span>
                                <Download size={14} style={{ marginLeft: 'auto' }} />
                              </a>
                            </div>
                          )}

                          {/* Text message */}
                          {!isMediaOnly && text && (
                            <div>
                              {text}
                            </div>
                          )}

                          {/* ── Interactive Footer (if present) ── */}
                          {meta?.footerText && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                              {meta.footerText}
                            </div>
                          )}

                          {/* Attached Interactive Buttons — matches preview button design */}
                          {buttons && buttons.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                marginTop: 8,
                                width: '100%',
                              }}
                            >
                              {buttons.map((b, bIdx) => {
                                const bTitle = typeof b === 'string' ? b : (b.title || b.text || b.label || b.reply_text || `Option ${bIdx + 1}`);
                                const isUrlButton = typeof b === 'object' && (b.type === 'URL' || b.type === 'web_url') && b.url;
                                const Tag = isUrlButton ? 'a' : 'div';
                                return (
                                  <Tag
                                    key={bIdx}
                                    {...(isUrlButton ? { href: b.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                      width: '100%',
                                      padding: '7px 12px',
                                      borderRadius: 8,
                                      border: '1px solid #cbd5e1',
                                      background: '#ffffff',
                                      color: '#0284c7',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      textDecoration: 'none',
                                      cursor: isUrlButton ? 'pointer' : 'default',
                                      transition: 'all 0.15s ease',
                                      boxSizing: 'border-box',
                                      textAlign: 'center',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = '#f8fafc';
                                      e.currentTarget.style.borderColor = '#94a3b8';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = '#ffffff';
                                      e.currentTarget.style.borderColor = '#cbd5e1';
                                    }}
                                  >
                                    {isUrlButton && <ExternalLink size={12} style={{ color: '#0284c7' }} />}
                                    <span>{bTitle}</span>
                                  </Tag>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Sender info & timestamp */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.68rem',
                            color: '#94a3b8',
                            marginTop: 4,
                            padding: '0 4px',
                          }}
                        >
                          {isOutbound ? (
                            <>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3.5,
                                  fontWeight: 600,
                                  color: isBot ? '#64748b' : '#2563eb',
                                }}
                              >
                                {isBot ? <Bot size={11} /> : <User size={11} />}
                                {senderDisplayName}
                              </span>
                              <span>•</span>
                              <span>{formatTime(msg.created_at || msg.timestamp || msg.createdAt)}</span>
                              {msg.status === 'FAILED' ? (
                                <FailedMessageStatus msg={msg} />
                              ) : msg.is_read ? (
                                <CheckCheck size={12} color="#2563eb" title="Read" />
                              ) : msg.delivered_at ? (
                                <CheckCheck size={12} color="#94a3b8" title="Delivered" />
                              ) : (
                                <Check size={12} color="#94a3b8" title="Sent" />
                              )}
                            </>
                          ) : (
                            <>
                              <span style={{ fontWeight: 600, color: '#64748b' }}>
                                {senderDisplayName}
                              </span>
                              <span>•</span>
                              <span>{formatTime(msg.created_at || msg.timestamp || msg.createdAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Join Chat — one canonical entry point, directly above the
                  composer, opens JoinChatModal instead of acting instantly. */}
              {!botPaused && (
                <div style={{
                  padding: '9px 18px',
                  borderTop: '1px solid #e2e8f0',
                  background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#475569' }}>
                    <Bot size={15} color="#6366f1" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Bot/AI is active:</strong> Join this chat to pause automated replies and type manual messages.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowJoinModal(true)}
                    className="transition-all duration-150 hover:brightness-95 active:scale-95"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 16,
                      border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca',
                      fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(67, 56, 202, 0.12)',
                      flexShrink: 0,
                    }}
                  >
                    <UserCheck size={13} /> Join Chat
                  </button>
                </div>
              )}

              {/* Chat Input Bar */}
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                {/* WhatsApp 24-Hour Messaging Window Notice */}
                {(() => {
                  const isWA = ((selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform || '').toUpperCase() === 'WHATSAPP');
                  const rawInbound = selectedConv?.lastInboundAt || selectedConv?.last_inbound_at;
                  const inboundMs = rawInbound ? new Date(rawInbound).getTime() : 0;
                  const isExpired = isWA && (!inboundMs || (Date.now() - inboundMs > 24 * 60 * 60 * 1000));
                  if (!isExpired) return null;
                  return (
                    <div
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(90deg, #fef2f2 0%, #fff1f2 100%)',
                        borderBottom: '1px solid #fecaca',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: '0.76rem',
                        color: '#991b1b',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color="#ef4444" style={{ flexShrink: 0 }} />
                        <span>
                          <strong>24h Window Expired:</strong> Standard messages cannot be sent. You can only send an approved message template.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenTemplatePicker}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #fca5a5',
                          borderRadius: 6,
                          color: '#b91c1c',
                          padding: '3px 9px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                      >
                        <FileText size={12} /> Send Template
                      </button>
                    </div>
                  );
                })()}

                {/* Send Error Banner */}
                {sendError && (
                  <div style={{
                    padding: '8px 16px',
                    background: '#fef2f2',
                    borderBottom: '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.78rem',
                    color: '#dc2626',
                  }}>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠ Send failed:</span>
                    <span style={{ flex: 1 }}>{sendError}</span>
                    {/24|template/i.test(sendError) ? (
                      <button
                        type="button"
                        onClick={handleOpenTemplatePicker}
                        style={{
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
                        }}
                      >
                        <FileText size={12} /> Send Template →
                      </button>
                    ) : (
                      <a
                        href="/channels/whatsapp"
                        style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap', fontSize: '0.72rem' }}
                      >
                        Fix in Settings →
                      </a>
                    )}
                    <button
                      onClick={() => setSendError('')}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 2px', fontWeight: 700, flexShrink: 0 }}
                    >✕</button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="chat-input-area" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept="image/*,video/*,audio/*,application/pdf"
                  />

                  <button
                    type="button"
                    disabled={!botPaused || uploading}
                    onClick={() => {
                      if (!botPaused) {
                        setShowJoinModal(true);
                        return;
                      }
                      fileInputRef.current?.click();
                    }}
                    title={!botPaused ? 'Join chat to send files' : 'Send image, video, audio or file'}
                    className="transition-all duration-150 hover:bg-slate-100 active:scale-90 disabled:opacity-40"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: (!botPaused || uploading) ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {uploading ? (
                      <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : (
                      <Paperclip size={16} />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSendMenuSection('menu');
                      setShowSendMenu((p) => !p);
                    }}
                    title="Send a Bot Flow, Message Template, or WhatsApp Flow"
                    className="transition-all duration-150 hover:bg-slate-100 active:scale-90"
                    style={{
                      width: 38, height: 38, borderRadius: '50%',
                      border: `1px solid ${showSendMenu ? '#c7d2fe' : '#e2e8f0'}`,
                      background: showSendMenu ? '#eef2ff' : '#f8fafc',
                      color: showSendMenu ? '#4338ca' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
                    }}
                  >
                    <Plus size={17} />
                  </button>

                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowQuickCannedMenu((p) => !p)}
                      title="Canned Messages & Quick Replies (/)"
                      className="transition-all duration-150 hover:bg-slate-100 active:scale-90"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        border: `1px solid ${showQuickCannedMenu ? '#bfdbfe' : '#e2e8f0'}`,
                        background: showQuickCannedMenu ? '#eff6ff' : '#f8fafc',
                        color: showQuickCannedMenu ? '#2563eb' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <Zap size={16} />
                    </button>
                    {showQuickCannedMenu && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 46,
                          left: 0,
                          width: 320,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          boxShadow: '0 12px 28px rgba(0,0,0,0.14)',
                          zIndex: 40,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfc' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                            Canned Replies
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowQuickCannedMenu(false);
                              setShowCreateCannedModal(true);
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#2563eb',
                              borderRadius: 5,
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Plus size={12} /> New Canned
                          </button>
                        </div>
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                          <input
                            type="text"
                            placeholder="Search canned messages..."
                            value={cannedSearch}
                            onChange={(e) => setCannedSearch(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                              fontSize: '0.76rem',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {cannedResponses
                            .filter((c) => !cannedSearch.trim() || c.title?.toLowerCase().includes(cannedSearch.toLowerCase()) || c.shortcut?.toLowerCase().includes(cannedSearch.toLowerCase()) || c.body?.toLowerCase().includes(cannedSearch.toLowerCase()))
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  handleSelectCanned(c);
                                  setShowQuickCannedMenu(false);
                                }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f8fafc',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                  {c.shortcut && <span style={{ color: '#6366f1', fontFamily: 'monospace', marginRight: 5 }}>/{c.shortcut}</span>}
                                  {c.title}
                                </div>
                                <div style={{ fontSize: '0.71rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.body}
                                </div>
                              </button>
                            ))}
                          {cannedResponses.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.74rem', color: '#94a3b8' }}>
                              No canned messages yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    style={{ flex: 1, position: 'relative', cursor: !botPaused ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (!botPaused) setShowJoinModal(true);
                    }}
                  >
                    {showCannedPicker && cannedMatches.length > 0 && (
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: '100%', maxWidth: 380,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 30,
                      }}>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {cannedMatches.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleSelectCanned(c)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                {c.shortcut && <span style={{ color: '#6366f1', fontFamily: 'monospace', marginRight: 6 }}>/{c.shortcut}</span>}
                                {c.title}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.body}</div>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCannedPicker(false);
                            setShowCreateCannedModal(true);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            width: '100%',
                            padding: '8px 12px',
                            background: '#f8fafc',
                            borderTop: '1px solid #e2e8f0',
                            borderLeft: 'none',
                            borderRight: 'none',
                            borderBottom: 'none',
                            color: '#2563eb',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={13} /> Create New Canned Message
                        </button>
                      </div>
                    )}
                    <textarea
                      ref={messageInputRef}
                      rows={1}
                      disabled={!botPaused || sending}
                      className="form-input"
                      placeholder={!botPaused ? 'Join chat to type a reply...' : 'Type a message or reply... (Shift+Enter for new line, / for canned replies)'}
                      value={messageText}
                      onChange={(e) => handleMessageTextChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowCannedPicker(false);
                          setShowQuickCannedMenu(false);
                        } else if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                      style={{
                        width: '100%',
                        minHeight: 40,
                        maxHeight: 160,
                        fontSize: '0.86rem',
                        borderRadius: 16,
                        resize: 'none',
                        padding: '9px 14px',
                        lineHeight: 1.4,
                        overflowY: 'auto',
                        boxSizing: 'border-box',
                        display: 'block',
                        background: !botPaused ? '#f8fafc' : '#ffffff',
                        color: !botPaused ? '#94a3b8' : '#0f172a',
                        cursor: !botPaused ? 'not-allowed' : 'text',
                        border: `1px solid ${!botPaused ? '#e2e8f0' : '#cbd5e1'}`,
                      }}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowRewriteMenu((p) => !p)}
                      disabled={!botPaused || !messageText.trim() || rewriting}
                      title="Rewrite with AI"
                      className="transition-all duration-150 hover:bg-slate-100 active:scale-90"
                      style={{
                        width: 38, height: 38, borderRadius: '50%',
                        border: `1px solid ${showRewriteMenu ? '#c7d2fe' : '#e2e8f0'}`,
                        background: showRewriteMenu ? '#eef2ff' : '#f8fafc',
                        color: showRewriteMenu ? '#4338ca' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        cursor: (!botPaused || !messageText.trim() || rewriting) ? 'default' : 'pointer',
                        opacity: (!botPaused || !messageText.trim()) ? 0.5 : 1,
                      }}
                    >
                      {rewriting ? <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Sparkles size={16} />}
                    </button>
                    {showRewriteMenu && (
                      <div style={{
                        position: 'absolute', bottom: 46, right: 0, width: 190,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 30,
                      }}>
                        {[
                          { id: 'professional', label: 'Professional' },
                          { id: 'friendly', label: 'Friendly' },
                          { id: 'concise', label: 'Concise' },
                          { id: 'fix_grammar', label: 'Fix Grammar' },
                          { id: 'expand', label: 'Expand' },
                          { id: 'simplify', label: 'Simplify' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleRewrite(opt.id)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!botPaused || !messageText.trim() || sending}
                    title={!botPaused ? 'Join chat to send messages' : 'Send message'}
                    className="transition-all duration-150 hover:brightness-110 active:scale-90 disabled:opacity-40"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: 'none',
                      background: activePlatformInfo.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      cursor: (!botPaused || !messageText.trim() || sending) ? 'not-allowed' : 'pointer',
                      boxShadow: (!botPaused || !messageText.trim()) ? 'none' : `0 2px 10px ${activePlatformInfo.color}55`,
                    }}
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>

              <SendMenuPanel
                open={showSendMenu}
                onClose={() => setShowSendMenu(false)}
                conversationId={selectedId}
                integrationId={selectedConv?.integration_id || selectedConv?.integrationId}
                platform={selectedConv?.platform}
                onSent={handleSendMenuResult}
                initialSection={sendMenuSection}
              />
              <JoinChatModal
                open={showJoinModal}
                onClose={() => setShowJoinModal(false)}
                conversationId={selectedId}
                onJoined={handleJoined}
              />
              <CreateCannedModal
                open={showCreateCannedModal}
                onClose={() => setShowCreateCannedModal(false)}
                onCreated={(newCanned) => {
                  setCannedResponses((prev) => [...prev, newCanned]);
                }}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <MessageSquare size={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Select a conversation
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                Choose a subscriber from the left list to start live chatting
              </p>
            </div>
          )}
        </main>

        {/* ── 3. Comprehensive Subscriber Details & Management Drawer ── */}
        {selectedConv && showSubscriberPanel && (
          <aside style={{ width: 330, flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: '#ffffff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Subscriber Header Card */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#fafbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: activePlatformInfo.bg,
                    color: activePlatformInfo.color,
                  }}
                >
                  {activePlatformInfo.label}
                </span>
                {selectedConv?.contactIsBlocked && (
                  <span
                    title={selectedConv?.contactBlockedReason || 'Blocked'}
                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}
                  >
                    <Ban size={11} /> Blocked
                  </span>
                )}
                <div ref={subscriberMenuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
                  <button
                    onClick={() => setShowSubscriberMenu((v) => !v)}
                    disabled={subscriberActionBusy}
                    style={{ color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', padding: 4, borderRadius: 6 }}
                    title="More actions"
                  >
                    <MoreVertical size={17} />
                  </button>

                  {showSubscriberMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        width: 230,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                        zIndex: 20,
                        overflow: 'hidden',
                        padding: 4,
                      }}
                    >
                      <button
                        onClick={handleLeaveChat}
                        disabled={subscriberActionBusy}
                        style={subscriberMenuItemStyle}
                      >
                        <LogOut size={14} color="#2563eb" /> Leave Chat
                      </button>
                      <button
                        onClick={handleResetFlow}
                        disabled={subscriberActionBusy}
                        style={subscriberMenuItemStyle}
                      >
                        <RotateCcw size={14} color="#64748b" /> Reset User Input Flow
                      </button>
                      <button
                        onClick={handleUnsubscribe}
                        disabled={subscriberActionBusy}
                        style={subscriberMenuItemStyle}
                      >
                        <BellOff size={14} color="#d97706" /> Unsubscribe from Sequences
                      </button>
                      <button
                        onClick={handleToggleBlock}
                        disabled={subscriberActionBusy}
                        style={subscriberMenuItemStyle}
                      >
                        <Ban size={14} color="#dc2626" /> {selectedConv?.contactIsBlocked ? 'Unblock Subscriber' : 'Block Subscriber'}
                      </button>
                      <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                      <button
                        onClick={handleClearHistory}
                        disabled={subscriberActionBusy}
                        style={{ ...subscriberMenuItemStyle, color: '#dc2626' }}
                      >
                        <Trash2 size={14} color="#dc2626" /> Clear History
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ContactAvatar
                  avatar={selectedConv.contactAvatar || selectedConv.avatar}
                  name={selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id}
                  size={38}
                  pInfo={activePlatformInfo}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedConv.contactName || selectedConv.contact_name || selectedConv.external_id || 'Subscriber'}
                  </h4>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>
                    ID: <strong>{selectedConv.contact_id || selectedConv.id}</strong>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3.5, marginTop: 3, fontSize: '0.69rem', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, color: '#334155', border: '1px solid #e2e8f0', maxWidth: '100%' }}>
                    <User size={10} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Agent: <strong style={{ color: currentAgentName ? '#0f172a' : '#94a3b8' }}>{currentAgentName || 'Unassigned'}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 24-Hour WhatsApp Messaging Window Timer */}
            {((selectedConv?.platform || selectedConv?.integrationPlatform || selectedConv?.contactPlatform || '').toUpperCase() === 'WHATSAPP') && (
              <WhatsAppWindowTimer
                lastInboundAt={selectedConv.lastInboundAt || selectedConv.last_inbound_at}
                onSendTemplate={handleOpenTemplatePicker}
              />
            )}

            {/* Quick Actions Bar */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 3 }}>
                  Conversation Status
                </label>
                <select
                  value={convStatus}
                  disabled={updatingStatus}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', background: '#ffffff' }}
                >
                  <option value="OPEN">🟢 Open (Active)</option>
                  <option value="ASSIGNED">🔵 Assigned</option>
                  <option value="PENDING">🟡 Pending Follow-up</option>
                  <option value="RESOLVED">⚪ Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 3 }}>
                  Assigned Team Agent
                </label>
                <select
                  value={selectedConv.assigned_to_id || ''}
                  disabled={assigningAgent}
                  onChange={(e) => handleAssignAgent(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', background: '#ffffff' }}
                >
                  <option value="">👤 Unassigned</option>
                  {agentsList.map((ag) => {
                    const pid = ag.profileId || ag.agent_profile_id || ag.id;
                    return (
                      <option key={pid} value={pid}>
                        {ag.name} ({ag.email})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Drawer Tabs Navigation — wraps onto multiple rows instead of
                scrolling horizontally, so every tab is visible at once.
                Labels is deliberately not here — see the pinned section at
                the bottom of the drawer. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', background: '#fafbfe' }}>
              {DRAWER_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveDrawerTab(tab)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: '0.71rem',
                    fontWeight: 700,
                    color: activeDrawerTab === tab ? '#fff' : '#64748b',
                    background: activeDrawerTab === tab ? '#2563eb' : 'transparent',
                    border: '1px solid',
                    borderColor: activeDrawerTab === tab ? '#2563eb' : '#e2e8f0',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab 1: Overview */}
            {activeDrawerTab === 'Overview' && (
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Assigned Agent
                  </span>
                  <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={12} color="#2563eb" /> {currentAgentName || 'Unassigned'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Phone / Identifier
                  </span>
                  <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={12} color="#64748b" /> {selectedConv.contactPhone || selectedConv.external_id || '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Email Address
                  </span>
                  <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={12} color="#64748b" /> {selectedConv.contactEmail || '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Channel Integration
                  </span>
                  <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>
                    {selectedConv.integrationName || activePlatformInfo.label}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Subscribed On
                  </span>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={12} color="#64748b" /> {formatFullDate(selectedConv.createdAt || selectedConv.created_at)}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Bot / AI State
                  </span>
                  <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: botPaused ? '#ef4444' : '#10b981' }}>
                      {botPaused ? '🔴 Paused' : '🟢 Active'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleToggleBot}
                        disabled={togglingBot}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 9px',
                          borderRadius: 6,
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          cursor: togglingBot ? 'default' : 'pointer',
                          border: botPaused ? '1px solid #fca5a5' : '1px solid #86efac',
                          background: botPaused ? '#fee2e2' : '#dcfce7',
                          color: botPaused ? '#b91c1c' : '#15803d',
                        }}
                      >
                        {botPaused ? <Play size={9} fill="#b91c1c" /> : <Pause size={9} />}
                        {botPaused ? 'Resume' : 'Pause'}
                      </button>
                    </div>
                  </div>
                  {/* Show assigned agent name whether left chat or not */}
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={12} color="#64748b" />
                    <span>Assigned: <strong style={{ color: currentAgentName ? '#0f172a' : '#94a3b8' }}>{currentAgentName || 'Unassigned'}</strong></span>
                    {botPaused && selectedConv.pause_reason === 'HUMAN_TAKEOVER' && (
                      <span style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 600 }}> (Takeover active)</span>
                    )}
                  </div>
                  {botPaused && selectedConv.pause_reason === 'OVER_LIMIT' && (
                    <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: 6, fontWeight: 600 }}>
                      Over your subscriber limit — upgrade your plan to re-enable Bot/AI for this subscriber.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sequences — reuses the existing sequences backend
                (sequenceAPI.subscribe/unsubscribe), just newly surfaced here. */}
            {activeDrawerTab === 'Sequences' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                    Start a Sequence
                  </label>
                  <select
                    value={selectedSequenceId}
                    onChange={(e) => setSelectedSequenceId(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#ffffff', marginBottom: 8 }}
                  >
                    <option value="">Select a Sequence...</option>
                    {availableSequences.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.platform})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleStartSequence}
                    disabled={!selectedSequenceId || sequenceBusy}
                    className="btn btn-primary w-full btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <Zap size={13} /> {sequenceBusy ? 'Starting…' : 'Start Sequence'}
                  </button>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Active &amp; Past Sequences ({contactSequences.length})
                  </span>
                  {contactSequences.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8 }}>Not enrolled in any sequence.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {contactSequences.map((s) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{s.sequence_name}</div>
                            <div style={{ fontSize: '0.72rem', color: s.status === 'ACTIVE' ? '#10b981' : '#94a3b8', fontWeight: 600 }}>{s.status}</div>
                          </div>
                          {s.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleStopSequence(s.sequence_id)}
                              disabled={sequenceBusy}
                              style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              Stop
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Follow-ups — new reusable reminder system (utils/followups.js
                backend), "Overdue" derived server-side from due_at, not stored. */}
            {activeDrawerTab === 'Follow-ups' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {!showNewFollowUp ? (
                  <button
                    onClick={() => setShowNewFollowUp(true)}
                    className="btn btn-primary w-full btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <Plus size={13} /> New Follow-up
                  </button>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="date"
                        value={newFollowUpDraft.date}
                        onChange={(e) => setNewFollowUpDraft((d) => ({ ...d, date: e.target.value }))}
                        style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                      />
                      <input
                        type="time"
                        value={newFollowUpDraft.time}
                        onChange={(e) => setNewFollowUpDraft((d) => ({ ...d, time: e.target.value }))}
                        style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                      />
                    </div>
                    <textarea
                      value={newFollowUpDraft.note}
                      onChange={(e) => setNewFollowUpDraft((d) => ({ ...d, note: e.target.value }))}
                      placeholder="What's this follow-up about?"
                      rows={2}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', resize: 'vertical' }}
                    />
                    <select
                      value={newFollowUpDraft.assignedToAgentProfileId}
                      onChange={(e) => setNewFollowUpDraft((d) => ({ ...d, assignedToAgentProfileId: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', background: '#fff' }}
                    >
                      <option value="">Assign to me</option>
                      {agentsList.map((a) => (
                        <option key={a.agent_profile_id || a.id} value={a.agent_profile_id || a.id}>{a.name}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setShowNewFollowUp(false)}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateFollowUp}
                        disabled={!newFollowUpDraft.date || !newFollowUpDraft.time || !newFollowUpDraft.note.trim() || savingFollowUp}
                        className="btn btn-primary btn-sm"
                      >
                        {savingFollowUp ? 'Saving…' : 'Create'}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Follow-ups ({contactFollowUps.length})
                  </span>
                  {contactFollowUps.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8 }}>No follow-ups yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {contactFollowUps.map((f) => {
                        const statusColor = { PENDING: '#2563eb', OVERDUE: '#ef4444', COMPLETED: '#10b981', CANCELLED: '#94a3b8' }[f.status] || '#64748b';
                        return (
                          <div key={f.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: statusColor }}>{f.status}</span>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{new Date(f.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#0f172a' }}>{f.note}</div>
                            {(f.status === 'PENDING' || f.status === 'OVERDUE') && (
                              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                                <button onClick={() => handleFollowUpStatus(f.id, 'COMPLETED')} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer' }}>Mark Done</button>
                                <button onClick={() => handleFollowUpStatus(f.id, 'CANCELLED')} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={() => handleDeleteFollowUp(f.id)} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Custom Fields */}
            {activeDrawerTab === 'Custom Fields' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Subscriber Data
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewFieldForm((p) => !p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
                        border: '1px solid #c7d2fe', background: showNewFieldForm ? '#eef2ff' : '#fff',
                        color: '#4338ca', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} /> New Field
                    </button>
                  </div>

                  {customFieldDefs.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px 0' }}>
                      No custom fields defined yet for your agency. Create one to start collecting structured data per subscriber (e.g. Order ID, Plan Tier, Renewal Date).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {customFieldDefs.map((field) => (
                        <div key={field.id}>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                            {field.name}
                          </label>
                          {field.field_type === 'SELECT' ? (
                            <select
                              value={customFieldValues[field.id] ?? ''}
                              onChange={(e) => handleSaveCustomField(field.id, e.target.value)}
                              disabled={savingFieldId === field.id}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#fff' }}
                            >
                              <option value="">—</option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.field_type === 'NUMBER' ? 'number' : field.field_type === 'DATE' ? 'date' : 'text'}
                              className="form-input"
                              value={customFieldValues[field.id] ?? ''}
                              onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                              onBlur={(e) => handleSaveCustomField(field.id, e.target.value)}
                              disabled={savingFieldId === field.id}
                              style={{ width: '100%', height: 32, fontSize: '0.82rem' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {showNewFieldForm && (
                    <form onSubmit={handleCreateCustomField} style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Field name (e.g. Order ID)"
                        value={newFieldDraft.name}
                        onChange={(e) => setNewFieldDraft((f) => ({ ...f, name: e.target.value }))}
                        style={{ height: 30, fontSize: '0.8rem' }}
                      />
                      <select
                        value={newFieldDraft.fieldType}
                        onChange={(e) => setNewFieldDraft((f) => ({ ...f, fieldType: e.target.value }))}
                        style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', background: '#fff' }}
                      >
                        <option value="TEXT">Text</option>
                        <option value="NUMBER">Number</option>
                        <option value="DATE">Date</option>
                        <option value="SELECT">Dropdown</option>
                      </select>
                      {newFieldDraft.fieldType === 'SELECT' && (
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Options, comma-separated (e.g. Gold, Silver, Bronze)"
                          value={newFieldDraft.options}
                          onChange={(e) => setNewFieldDraft((f) => ({ ...f, options: e.target.value }))}
                          style={{ height: 30, fontSize: '0.8rem' }}
                        />
                      )}
                      <button type="submit" disabled={savingNewField || !newFieldDraft.name.trim()} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                        {savingNewField ? 'Creating...' : 'Create Field'}
                      </button>
                    </form>
                  )}
                </div>

                {/* Completed User Input Flow submissions — the full answer set from
                    each form this subscriber finished, newest first. */}
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Form Submissions
                  </span>
                  {formResponses.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '8px 0 0' }}>
                      This subscriber hasn't completed any User Input Flow yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {formResponses.map((resp) => {
                        const answers = Array.isArray(resp.answers)
                          ? resp.answers
                          : (() => { try { return JSON.parse(resp.answers || '[]'); } catch { return []; } })();
                        const open = expandedResponseId === resp.id;
                        return (
                          <div
                            key={resp.id}
                            style={{ border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', overflow: 'hidden' }}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedResponseId(open ? null : resp.id)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 8, padding: '9px 11px', border: 'none', background: open ? '#f8fafc' : '#fff',
                                cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {resp.user_input_flow_name || 'Form'}
                                </span>
                                <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginTop: 1 }}>
                                  {new Date(resp.created_at).toLocaleString()} · {answers.length} answer{answers.length === 1 ? '' : 's'}
                                </span>
                              </span>
                              <ChevronDown
                                size={14}
                                color="#94a3b8"
                                style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                              />
                            </button>
                            {open && (
                              <div style={{ padding: '4px 11px 10px', borderTop: '1px solid #f1f5f9' }}>
                                {answers.length === 0 ? (
                                  <div style={{ fontSize: '0.76rem', color: '#94a3b8', paddingTop: 8 }}>No answers recorded.</div>
                                ) : answers.map((a, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: 8 }}>
                                    <strong style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, flexShrink: 0 }}>
                                      {a.label || `Answer ${i + 1}`}
                                    </strong>
                                    <span style={{ fontSize: '0.78rem', color: '#0f172a', textAlign: 'right', wordBreak: 'break-word' }}>
                                      {String(a.value ?? '—')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    System Variables (read-only)
                  </span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ color: '#0f172a' }}>Platform:</strong>
                      <span>{activePlatformInfo.label}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ color: '#0f172a' }}>External ID:</strong>
                      <span>{selectedConv.external_id || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: platformProfileEntries.length ? 6 : 0 }}>
                      <strong style={{ color: '#0f172a' }}>Bot Session:</strong>
                      <span>{botPaused ? 'Agent Handled' : 'Active'}</span>
                    </div>
                    {platformProfileEntries.map(([key, value], idx) => (
                      <div
                        key={key}
                        style={{ display: 'flex', justifyContent: 'space-between', marginTop: idx === 0 ? 0 : 6 }}
                      >
                        <strong style={{ color: '#0f172a' }}>{SYSTEM_FIELD_LABELS[key] || key}:</strong>
                        <span>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>
                      </div>
                    ))}
                  </div>
                  {platformProfileEntries.length > 0 && (
                    <span className="fb-hint" style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginTop: 6 }}>
                      Pulled automatically from {activePlatformInfo.label}'s own profile API — not editable.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Internal Notes */}
            {activeDrawerTab === 'Notes' && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="Write an internal note for this subscriber..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    style={{ fontSize: '0.82rem', resize: 'none' }}
                  />
                  <button type="submit" disabled={savingNote || !newNoteText.trim()} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                    <Plus size={13} /> Save Note
                  </button>
                </form>

                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                    Notes Log ({contactNotes.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {contactNotes.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No internal notes added.</span>
                    ) : (
                      contactNotes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: '10px 12px',
                            fontSize: '0.82rem',
                          }}
                        >
                          <div style={{ color: '#0f172a', lineHeight: 1.4 }}>{n.note}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                            <span>By: {n.userName || 'Agent'}</span>
                            <span>{formatRelativeTime(n.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Labels — pinned as its own always-visible section at the
                bottom of the drawer (not a tab), plain list + dropdown,
                no colors, per the layout requirement. Fills the empty
                space below short tab contents and keeps labels reachable
                no matter which tab is open. */}
            <div style={{ padding: '14px 18px', borderTop: '1px solid #e2e8f0', marginTop: 'auto', background: '#fafbfe' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Labels ({contactLabels.length})
                </span>
              </div>

              {contactLabels.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 8 }}>No labels attached.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {contactLabels.map((lb) => (
                    <div key={lb.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.78rem', color: '#0f172a' }}>{lb.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDetachLabel(lb.id)}
                        title="Remove label"
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <select
                value=""
                onChange={(e) => { if (e.target.value) handleAttachLabel(e.target.value); }}
                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.78rem', background: '#fff', color: '#475569', marginBottom: 6 }}
              >
                <option value="">+ Attach a label...</option>
                {agencyLabels.filter((al) => !contactLabels.some((cl) => cl.id === al.id)).map((lb) => (
                  <option key={lb.id} value={lb.id}>{lb.name}</option>
                ))}
              </select>

              <form onSubmit={handleCreateAndAttachLabel} style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="New label name..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  style={{ flex: 1, height: 28, fontSize: '0.76rem' }}
                />
                <button type="submit" disabled={savingLabel || !newLabelName.trim()} className="btn btn-primary btn-sm" style={{ height: 28, fontSize: '0.74rem' }}>
                  Create
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* ── Image Lightbox Modal ── */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: -36,
                right: 0,
                color: '#ffffff',
                fontSize: '1.2rem',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              ✕ Close
            </button>
            <img
              src={previewImage}
              alt="Enlarged preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
          </div>
        </div>
      )}

      <WhatsAppCallPanel
        contactName={whatsappCall.calleeName}
        callState={whatsappCall.callState}
        errorMessage={whatsappCall.errorMessage}
        duration={whatsappCall.duration}
        muted={whatsappCall.muted}
        remoteAudioRef={whatsappCall.remoteAudioRef}
        onHangUp={whatsappCall.hangUp}
        onToggleMute={whatsappCall.toggleMute}
        onRequestPermission={(note) => whatsappCall.requestPermission(whatsappCall.calleeContactId, whatsappCall.calleeIntegrationId, note)}
        onClose={whatsappCall.reset}
        onRetry={() => whatsappCall.placeCall(whatsappCall.calleeContactId, selectedId, whatsappCall.calleeName, whatsappCall.calleeIntegrationId)}
      />
    </AppLayout>
  );
}
