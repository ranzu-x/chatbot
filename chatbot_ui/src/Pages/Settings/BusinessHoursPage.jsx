import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { businessHoursAPI, flowAPI, integrationAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Clock,
  Globe2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Moon,
  Sun,
  Copy,
  Zap,
  Bot,
  Sparkles,
  ArrowLeft,
  Save,
  RotateCcw,
  Sliders,
  ExternalLink,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Globe,
  HelpCircle,
  Check,
  ChevronRight,
} from 'lucide-react';

// ── Curated Comprehensive Timezone List Grouped by Region ────────────────────
const TIMEZONE_REGIONS = [
  {
    region: 'Common & UTC',
    zones: ['UTC'],
  },
  {
    region: 'North & South America',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Bogota',
      'America/Lima',
      'America/Santiago',
      'America/Sao_Paulo',
      'America/Buenos_Aires',
    ],
  },
  {
    region: 'Europe',
    zones: [
      'Europe/London',
      'Europe/Dublin',
      'Europe/Lisbon',
      'Europe/Madrid',
      'Europe/Paris',
      'Europe/Brussels',
      'Europe/Amsterdam',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Vienna',
      'Europe/Stockholm',
      'Europe/Warsaw',
      'Europe/Athens',
      'Europe/Bucharest',
      'Europe/Helsinki',
      'Europe/Kyiv',
      'Europe/Moscow',
      'Europe/Istanbul',
    ],
  },
  {
    region: 'Asia & Middle East',
    zones: [
      'Asia/Dubai',
      'Asia/Riyadh',
      'Asia/Jerusalem',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Asia/Dhaka',
      'Asia/Colombo',
      'Asia/Kathmandu',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Singapore',
      'Asia/Kuala_Lumpur',
      'Asia/Manila',
      'Asia/Hong_Kong',
      'Asia/Shanghai',
      'Asia/Taipei',
      'Asia/Seoul',
      'Asia/Tokyo',
    ],
  },
  {
    region: 'Africa',
    zones: [
      'Africa/Cairo',
      'Africa/Casablanca',
      'Africa/Lagos',
      'Africa/Accra',
      'Africa/Nairobi',
      'Africa/Johannesburg',
    ],
  },
  {
    region: 'Australia & Pacific',
    zones: [
      'Australia/Perth',
      'Australia/Adelaide',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Pacific/Auckland',
      'Pacific/Honolulu',
      'Pacific/Fiji',
    ],
  },
];

const ALL_TIMEZONES = TIMEZONE_REGIONS.flatMap((r) => r.zones);

// Standard Day Order: Monday through Sunday
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Display order starting with Monday (1..6, 0)
const DISPLAY_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Platform metadata
const PLATFORM_CONFIG = {
  WHATSAPP: { name: 'WhatsApp', icon: MessageCircle, color: '#25d366', bg: '#f0fdf4' },
  FACEBOOK: { name: 'Facebook', icon: Facebook, color: '#1877f2', bg: '#eff6ff' },
  INSTAGRAM: { name: 'Instagram', icon: Instagram, color: '#e1306c', bg: '#fdf2f8' },
  TELEGRAM: { name: 'Telegram', icon: Send, color: '#229ed9', bg: '#f0f9ff' },
  WEBCHAT: { name: 'Webchat', icon: Globe, color: '#2563eb', bg: '#f5f3ff' },
};

function getPlatformMeta(platform) {
  const norm = (platform || 'WHATSAPP').toUpperCase();
  return PLATFORM_CONFIG[norm] || { name: norm, icon: Globe, color: '#64748b', bg: '#f8fafc' };
}

// Convert "HH:MM" to minutes from midnight
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Format minutes from midnight to "HH:MM AM/PM" or 24h
function formatMinutes(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Checks if current time is within [open, close)
function isTimeWithinWindow(nowMinutes, openMinutes, closeMinutes) {
  if (openMinutes === closeMinutes) return true; // Open 24h
  if (closeMinutes > openMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  // Overnight shift (e.g. 22:00 to 06:00)
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

// ── Custom iOS-Style Toggle ──────────────────────────────────────────────────
function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: 'none',
        background: checked ? '#10b981' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        padding: 0,
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 0.2s ease',
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}

export default function BusinessHoursPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [integrations, setIntegrations] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);

  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [days, setDays] = useState([]);
  const [flows, setFlows] = useState([]);

  // Unsaved changes tracker
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [currentTimeInZone, setCurrentTimeInZone] = useState('');
  const [currentDayIndexInZone, setCurrentDayIndexInZone] = useState(null);
  const [currentMinutesInZone, setCurrentMinutesInZone] = useState(0);

  // Simulator test tool
  const [simDay, setSimDay] = useState(1);
  const [simTime, setSimTime] = useState('10:00');

  // Load all available bot accounts / integrations
  useEffect(() => {
    setLoadingIntegrations(true);
    integrationAPI
      .getAll()
      .then((res) => {
        const list = res.data?.integrations || [];
        setIntegrations(list);

        // Determine pre-selected account from state, search params, or first in list
        const paramId = searchParams.get('bot');
        const stateId = location.state?.selectedAccountId;
        const initial =
          list.find((i) => String(i.id) === String(paramId || stateId)) ||
          list[0] ||
          null;

        if (initial) {
          setSelectedBotId(initial.id);
        }
      })
      .catch((err) => {
        console.error('Failed to load bot accounts', err);
        notify.error('Could not load bot accounts');
      })
      .finally(() => setLoadingIntegrations(false));
  }, []);

  // Sync selected bot to searchParams
  const handleSelectBot = (id) => {
    setSelectedBotId(id);
    setSearchParams({ bot: id });
  };

  // Load business hours & flows for the selected bot
  const loadScheduleForBot = useCallback(async (botId) => {
    if (!botId) return;
    setLoadingSchedule(true);
    try {
      const [bhRes, flowsRes] = await Promise.all([
        businessHoursAPI.getForIntegration(botId),
        flowAPI.getAll({ integrationId: botId }),
      ]);

      const loadedSettings = bhRes.data?.settings || {
        enabled: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        sameEveryDay: true,
        botRepliesOffHours: true,
        aiRepliesOffHours: true,
        offHoursFlowId: null,
      };

      const loadedDays =
        bhRes.data?.days && bhRes.data.days.length === 7
          ? bhRes.data.days
          : DISPLAY_DAY_ORDER.map((dow) => ({
              dayOfWeek: dow,
              label: DAY_LABELS[dow],
              isOff: dow === 0 || dow === 6,
              openTime: '09:00',
              closeTime: '17:00',
            }));

      setSettings(loadedSettings);
      setDays(loadedDays);
      setFlows(flowsRes.data?.flows || []);

      // Snapshot for dirty-check
      setInitialSnapshot(JSON.stringify({ settings: loadedSettings, days: loadedDays }));
    } catch (err) {
      console.error('Failed to load business hours for bot', err);
      notify.error('Failed to load business hours');
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBotId) {
      loadScheduleForBot(selectedBotId);
    }
  }, [selectedBotId, loadScheduleForBot]);

  // Real-time clock calculation in the chosen timezone
  useEffect(() => {
    const tz = settings?.timezone || 'UTC';
    const updateTime = () => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        setCurrentTimeInZone(formatter.format(now));

        // Get parts to calculate minutes & weekday
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(now);

        const getPart = (type) => parts.find((p) => p.type === type)?.value;
        const wStr = getPart('weekday');
        const h = Number(getPart('hour')) % 24;
        const m = Number(getPart('minute'));

        const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        setCurrentDayIndexInZone(dowMap[wStr] ?? 1);
        setCurrentMinutesInZone(h * 60 + m);
      } catch (e) {
        setCurrentTimeInZone(new Date().toLocaleTimeString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings?.timezone]);

  // Patching helpers
  const patchSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const patchDay = (dayOfWeek, patch) =>
    setDays((ds) => ds.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  const patchAllDays = (patch) => setDays((ds) => ds.map((d) => ({ ...d, ...patch })));

  // Check if dirty
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return initialSnapshot !== JSON.stringify({ settings, days });
  }, [initialSnapshot, settings, days]);

  // Save changes to API
  const handleSave = async () => {
    if (!selectedBotId) return;
    setSaving(true);
    try {
      await businessHoursAPI.save(selectedBotId, {
        enabled: !!settings?.enabled,
        timezone: settings?.timezone || 'UTC',
        sameEveryDay: !!settings?.sameEveryDay,
        botRepliesOffHours: !!settings?.botRepliesOffHours,
        aiRepliesOffHours: !!settings?.aiRepliesOffHours,
        offHoursFlowId: settings?.offHoursFlowId || null,
        days: days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          isOff: !!d.isOff,
          openTime: d.openTime || '09:00',
          closeTime: d.closeTime || '17:00',
        })),
      });

      setInitialSnapshot(JSON.stringify({ settings, days }));
      notify.success('Business hours saved successfully');
    } catch (err) {
      console.error('Failed to save business hours', err);
      notify.error(err?.response?.data?.message || 'Failed to save business hours');
    } finally {
      setSaving(false);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (!initialSnapshot) return;
    const parsed = JSON.parse(initialSnapshot);
    setSettings(parsed.settings);
    setDays(parsed.days);
    notify.info('Changes discarded');
  };

  // Quick Preset Handlers
  const applyPreset = (presetKey) => {
    if (presetKey === 'standard') {
      // Mon-Fri 09:00 - 17:00, Sat & Sun Off
      setDays((ds) =>
        ds.map((d) => ({
          ...d,
          isOff: d.dayOfWeek === 0 || d.dayOfWeek === 6,
          openTime: '09:00',
          closeTime: '17:00',
        }))
      );
      patchSettings({ sameEveryDay: false });
    } else if (presetKey === 'extended') {
      // Mon-Fri 08:00 - 20:00, Sat 10:00 - 16:00, Sun Off
      setDays((ds) =>
        ds.map((d) => {
          if (d.dayOfWeek === 0) return { ...d, isOff: true };
          if (d.dayOfWeek === 6) return { ...d, isOff: false, openTime: '10:00', closeTime: '16:00' };
          return { ...d, isOff: false, openTime: '08:00', closeTime: '20:00' };
        })
      );
      patchSettings({ sameEveryDay: false });
    } else if (presetKey === 'alwaysOpen') {
      // 24/7 All Open
      setDays((ds) =>
        ds.map((d) => ({
          ...d,
          isOff: false,
          openTime: '00:00',
          closeTime: '00:00',
        }))
      );
      patchSettings({ sameEveryDay: true });
    }
    notify.success('Preset applied');
  };

  // Calculate live operating status right now
  const liveStatus = useMemo(() => {
    if (!settings?.enabled) {
      return {
        isOpen: true,
        isGated: false,
        label: 'BUSINESS HOURS DISABLED',
        color: '#64748b',
        bg: '#f8fafc',
        border: '#e2e8f0',
        sub: 'Automation replies to customers 24/7 without schedule gating',
      };
    }

    if (currentDayIndexInZone === null) {
      return {
        isOpen: true,
        isGated: true,
        label: 'ACTIVE',
        color: '#10b981',
        bg: '#ecfdf5',
        border: '#a7f3d0',
        sub: 'Calculating schedule...',
      };
    }

    const todayConfig = days.find((d) => d.dayOfWeek === currentDayIndexInZone);
    if (!todayConfig || todayConfig.isOff) {
      return {
        isOpen: false,
        isGated: true,
        label: 'CURRENTLY CLOSED (OFF-HOURS)',
        color: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
        sub: `Closed today (${FULL_DAY_NAMES[currentDayIndexInZone]}). Off-hours rules are in effect.`,
      };
    }

    const openMin = timeToMinutes(todayConfig.openTime || '09:00');
    const closeMin = timeToMinutes(todayConfig.closeTime || '17:00');
    const inside = isTimeWithinWindow(currentMinutesInZone, openMin, closeMin);

    if (inside) {
      return {
        isOpen: true,
        isGated: true,
        label: 'CURRENTLY OPEN (WITHIN HOURS)',
        color: '#059669',
        bg: '#ecfdf5',
        border: '#a7f3d0',
        sub: `Open until ${formatMinutes(closeMin)} in ${settings?.timezone}`,
      };
    } else {
      return {
        isOpen: false,
        isGated: true,
        label: 'CURRENTLY CLOSED (OFF-HOURS)',
        color: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
        sub: `Closed now. Will open at ${formatMinutes(openMin)}. Off-hours rules in effect.`,
      };
    }
  }, [settings?.enabled, settings?.timezone, days, currentDayIndexInZone, currentMinutesInZone]);

  // Total weekly operating hours calculation
  const totalWeeklyHours = useMemo(() => {
    let totalMinutes = 0;
    days.forEach((d) => {
      if (d.isOff) return;
      const o = timeToMinutes(d.openTime || '09:00');
      const c = timeToMinutes(d.closeTime || '17:00');
      if (o === c) {
        totalMinutes += 24 * 60; // 24 hours
      } else if (c > o) {
        totalMinutes += c - o;
      } else {
        totalMinutes += 24 * 60 - o + c; // Overnight
      }
    });
    return (totalMinutes / 60).toFixed(1);
  }, [days]);

  // Current selected bot object
  const currentBot = useMemo(() => {
    return integrations.find((i) => i.id === selectedBotId) || null;
  }, [integrations, selectedBotId]);

  const enabled = !!settings?.enabled;
  const sameEveryDay = !!settings?.sameEveryDay;
  const sharedDay = days.find((d) => !d.isOff) || days[0] || {};

  return (
    <AppLayout>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 20px 80px' }}>
        {/* ── BREADCRUMBS & TOP NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#64748b' }}>
            <button
              onClick={() => navigate('/bots')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: '#64748b',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              <ArrowLeft size={14} /> Back to Bot Manager
            </button>
            <ChevronRight size={13} color="#cbd5e1" />
            <span>Automation</span>
            <ChevronRight size={13} color="#cbd5e1" />
            <span style={{ color: '#0f172a', fontWeight: 700 }}>Business Hours</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#64748b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} /> Discard
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedBotId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 18px',
                borderRadius: 8,
                border: 'none',
                background: isDirty ? '#2563eb' : '#0f172a',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: isDirty ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Save size={14} />
              {saving ? 'Saving Changes...' : isDirty ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>

        {/* ── PAGE TITLE BAR ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={20} />
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Business Hours & Availability Schedule
              </h1>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 48px' }}>
              Define when your bot channels are active, gate automated flow replies, and trigger specialized off-hours responses.
            </p>
          </div>
        </div>

        {/* ── BOT ACCOUNT PICKER BAR ── */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>
                Target Bot Account
              </span>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                Select which bot channel schedule you are configuring
              </div>
            </div>

            <button
              onClick={() => navigate('/connect-accounts')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#2563eb',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Manage Connected Channels <ExternalLink size={12} />
            </button>
          </div>

          {loadingIntegrations ? (
            <div style={{ padding: '14px 0', fontSize: '0.84rem', color: '#94a3b8' }}>Loading bot channels...</div>
          ) : integrations.length === 0 ? (
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 10, textAlign: 'center' }}>
              <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0 }}>
                No active bot channels found. Connect a WhatsApp, Facebook, Instagram, Telegram, or Webchat channel first.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {integrations.map((bot) => {
                const isSelected = selectedBotId === bot.id;
                const meta = getPlatformMeta(bot.platform);
                const Icon = meta.icon;
                const botName = bot.name || bot.phone_number || bot.page_name || `${meta.name} Bot`;

                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => handleSelectBot(bot.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: isSelected ? `2px solid ${meta.color}` : '1px solid #e2e8f0',
                      background: isSelected ? meta.bg : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        background: meta.bg,
                        color: meta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={14} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{botName}</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{meta.name}</div>
                    </div>
                    {isSelected && <Check size={14} color={meta.color} style={{ marginLeft: 4 }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── REAL-TIME OPERATING STATUS BANNER ── */}
        <div
          style={{
            background: liveStatus.bg,
            border: `1px solid ${liveStatus.border}`,
            borderRadius: 14,
            padding: '16px 22px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#ffffff',
                border: `1.5px solid ${liveStatus.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: liveStatus.color,
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              {liveStatus.isOpen ? <Sun size={20} /> : <Moon size={20} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: liveStatus.color,
                    textTransform: 'uppercase',
                  }}
                >
                  {liveStatus.label}
                </span>
                <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>•</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {currentTimeInZone || 'Loading clock...'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>{liveStatus.sub}</div>
            </div>
          </div>

          {/* Master Switch on the status bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                Enforce Business Hours
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                {enabled ? 'Active on this bot' : 'Disabled (Always 24/7)'}
              </div>
            </div>
            <Switch
              checked={enabled}
              onChange={(next) => patchSettings({ enabled: next })}
              disabled={saving || !selectedBotId}
            />
          </div>
        </div>

        {/* ── MAIN CONFIGURATION GRID ── */}
        {loadingSchedule ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <Clock size={24} style={{ animation: 'spin 1.5s linear infinite', marginBottom: 12 }} />
            <div>Loading business hours schedule...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── CARD 1: TIMEZONE & PRESETS ── */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Timezone & Quick Presets
                  </h3>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    All operating windows are calculated against this reference timezone.
                  </p>
                </div>

                {/* Auto-detect button */}
                <button
                  type="button"
                  onClick={() => {
                    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    patchSettings({ timezone: detected });
                    notify.success(`Timezone set to ${detected}`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Globe2 size={13} color="#2563eb" /> Auto-Detect My Timezone
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Operating Timezone
                  </label>
                  <select
                    value={settings?.timezone || 'UTC'}
                    onChange={(e) => patchSettings({ timezone: e.target.value })}
                    disabled={saving}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  >
                    {TIMEZONE_REGIONS.map((group) => (
                      <optgroup key={group.region} label={group.region}>
                        {group.zones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Preset Chips */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Quick Schedule Presets
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => applyPreset('standard')}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      Mon-Fri 9-5
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('extended')}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      Mon-Fri 8-8 + Sat
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('alwaysOpen')}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      24/7 Always Open
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── CARD 2: WEEKLY SCHEDULE BUILDER ── */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Weekly Operating Schedule
                  </h3>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Total active window: <strong>{totalWeeklyHours} hours / week</strong>
                  </p>
                </div>

                {/* Same every day switch */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#f8fafc',
                    padding: '6px 12px',
                    borderRadius: 9,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Switch
                    checked={sameEveryDay}
                    disabled={saving}
                    onChange={(next) => {
                      patchSettings({ sameEveryDay: next });
                      if (next) {
                        patchAllDays({
                          openTime: sharedDay.openTime || '09:00',
                          closeTime: sharedDay.closeTime || '17:00',
                        });
                      }
                    }}
                  />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                    Use same hours every day
                  </span>
                </div>
              </div>

              {/* Same hours every day layout */}
              {sameEveryDay ? (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      alignItems: 'center',
                      background: '#f8fafc',
                      padding: '14px 18px',
                      borderRadius: 10,
                      marginBottom: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                        Open Time
                      </label>
                      <input
                        type="time"
                        value={sharedDay.openTime || '09:00'}
                        disabled={saving}
                        onChange={(e) => patchAllDays({ openTime: e.target.value })}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                        }}
                      />
                    </div>

                    <span style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: 18 }}>to</span>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                        Close Time
                      </label>
                      <input
                        type="time"
                        value={sharedDay.closeTime || '17:00'}
                        disabled={saving}
                        onChange={(e) => patchAllDays({ closeTime: e.target.value })}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                        }}
                      />
                    </div>

                    {sharedDay.closeTime && sharedDay.openTime && timeToMinutes(sharedDay.closeTime) <= timeToMinutes(sharedDay.openTime) && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#7c3aed',
                          background: '#f5f3ff',
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid #ede9fe',
                          marginTop: 18,
                        }}
                      >
                        <Moon size={11} /> Overnight Shift (crosses midnight)
                      </span>
                    )}
                  </div>

                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                    Closed All Day On:
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {DISPLAY_DAY_ORDER.map((dow) => {
                      const d = days.find((item) => item.dayOfWeek === dow);
                      if (!d) return null;
                      return (
                        <button
                          key={d.dayOfWeek}
                          type="button"
                          disabled={saving}
                          onClick={() => patchDay(d.dayOfWeek, { isOff: !d.isOff })}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: `1.5px solid ${d.isOff ? '#fecdd3' : '#e2e8f0'}`,
                            background: d.isOff ? '#fff1f2' : '#ffffff',
                            color: d.isOff ? '#e11d48' : '#0f172a',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {FULL_DAY_NAMES[d.dayOfWeek]} {d.isOff ? '(Closed)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Custom Daily Schedule rows (Monday through Sunday) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {DISPLAY_DAY_ORDER.map((dow) => {
                    const d = days.find((item) => item.dayOfWeek === dow);
                    if (!d) return null;

                    const isCurrentDay = currentDayIndexInZone === d.dayOfWeek;
                    const isOvernight =
                      !d.isOff &&
                      d.openTime &&
                      d.closeTime &&
                      timeToMinutes(d.closeTime) <= timeToMinutes(d.openTime);

                    return (
                      <div
                        key={d.dayOfWeek}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: isCurrentDay ? '1.5px solid #bfdbfe' : '1px solid #f1f5f9',
                          background: isCurrentDay ? '#f8fafc' : '#ffffff',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        {/* Day name & Current Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 800, color: d.isOff ? '#94a3b8' : '#0f172a' }}>
                            {FULL_DAY_NAMES[d.dayOfWeek]}
                          </span>
                          {isCurrentDay && (
                            <span
                              style={{
                                fontSize: '0.64rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                color: '#2563eb',
                                background: '#eff6ff',
                                padding: '1px 6px',
                                borderRadius: 999,
                                border: '1px solid #dbeafe',
                              }}
                            >
                              Today
                            </span>
                          )}
                        </div>

                        {/* Open vs Closed Switch */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Switch
                            checked={!d.isOff}
                            onChange={(open) => patchDay(d.dayOfWeek, { isOff: !open })}
                            disabled={saving}
                          />
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: d.isOff ? '#94a3b8' : '#059669',
                              width: 50,
                            }}
                          >
                            {d.isOff ? 'Closed' : 'Open'}
                          </span>
                        </div>

                        {/* Time Inputs */}
                        {!d.isOff ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="time"
                              value={d.openTime || '09:00'}
                              disabled={saving || d.isOff}
                              onChange={(e) => patchDay(d.dayOfWeek, { openTime: e.target.value })}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 7,
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                              }}
                            />
                            <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>to</span>
                            <input
                              type="time"
                              value={d.closeTime || '17:00'}
                              disabled={saving || d.isOff}
                              onChange={(e) => patchDay(d.dayOfWeek, { closeTime: e.target.value })}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 7,
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                              }}
                            />
                            {isOvernight && (
                              <span
                                title="Closes past midnight"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: '0.68rem',
                                  color: '#7c3aed',
                                  background: '#f5f3ff',
                                  padding: '3px 6px',
                                  borderRadius: 5,
                                }}
                              >
                                <Moon size={11} /> Overnight
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            Closed all day
                          </span>
                        )}

                        {/* Copy Hours to All Days */}
                        {!d.isOff && (
                          <button
                            type="button"
                            onClick={() => {
                              patchAllDays({ openTime: d.openTime, closeTime: d.closeTime });
                              notify.success(`Copied ${d.openTime} - ${d.closeTime} to all days`);
                            }}
                            title="Copy this day's hours to all other days"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Copy size={11} /> Copy to all
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── CARD 3: OFF-HOURS AUTOMATED BEHAVIOR ── */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Automated Behavior Outside Business Hours
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Choose how automated replies behave when a customer messages during closed hours.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
                {/* AI Replies toggle */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <Switch
                    checked={!!settings?.aiRepliesOffHours}
                    disabled={saving}
                    onChange={(next) => patchSettings({ aiRepliesOffHours: next })}
                  />
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} color="#7c3aed" /> Allow AI Agent Replies
                    </div>
                    <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '3px 0 0 0', lineHeight: 1.45 }}>
                      When enabled, your AI Agent continues to automatically answer customer inquiries 24/7 even outside business hours.
                    </p>
                  </div>
                </div>

                {/* Bot / Flow replies toggle */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <Switch
                    checked={!!settings?.botRepliesOffHours}
                    disabled={saving}
                    onChange={(next) => patchSettings({ botRepliesOffHours: next })}
                  />
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Bot size={14} color="#2563eb" /> Allow Standard Bot / Flow Replies
                    </div>
                    <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '3px 0 0 0', lineHeight: 1.45 }}>
                      When enabled, keyword triggers and normal automated bot flows remain active outside working hours.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dedicated Off-Hours Auto-Response Flow */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '16px 18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={14} color="#d97706" /> Dedicated Off-Hours Flow (Away Message / Auto-Reply)
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate('/flows/new')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Create New Flow in Builder <ExternalLink size={12} />
                  </button>
                </div>

                <select
                  value={settings?.offHoursFlowId || ''}
                  disabled={saving}
                  onChange={(e) =>
                    patchSettings({ offHoursFlowId: e.target.value ? Number(e.target.value) : null })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                  }}
                >
                  <option value="">None (Standard behavior)</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.is_active === 0 ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>

                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '8px 0 0 0', lineHeight: 1.5 }}>
                  This flow triggers automatically when a customer begins a new conversation outside operating hours. It sends an away message (e.g. "We're currently closed, our team will reply tomorrow at 9 AM"). It will never interrupt an ongoing conversation.
                </p>
              </div>
            </div>

            {/* ── CARD 4: LIVE SIMULATOR / TESTER ── */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <HelpCircle size={15} color="#2563eb" /> Schedule Simulator & Verification Tool
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Test any day and time to see how the bot will evaluate customer inquiries.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Test Day
                  </label>
                  <select
                    value={simDay}
                    onChange={(e) => setSimDay(Number(e.target.value))}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {DISPLAY_DAY_ORDER.map((dow) => (
                      <option key={dow} value={dow}>
                        {FULL_DAY_NAMES[dow]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Test Time
                  </label>
                  <input
                    type="time"
                    value={simTime}
                    onChange={(e) => setSimTime(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Simulation Result Callout */}
                {(() => {
                  if (!settings?.enabled) {
                    return (
                      <div style={{ padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', color: '#475569', fontSize: '0.8rem', fontWeight: 600, marginTop: 18 }}>
                        Result: <strong>OPEN</strong> (Business Hours disabled)
                      </div>
                    );
                  }
                  const testDayConfig = days.find((d) => d.dayOfWeek === simDay);
                  const isOff = !testDayConfig || testDayConfig.isOff;
                  const inside =
                    !isOff &&
                    isTimeWithinWindow(
                      timeToMinutes(simTime),
                      timeToMinutes(testDayConfig.openTime || '09:00'),
                      timeToMinutes(testDayConfig.closeTime || '17:00')
                    );

                  return (
                    <div
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        background: inside ? '#ecfdf5' : '#fff1f2',
                        border: `1px solid ${inside ? '#a7f3d0' : '#fecdd3'}`,
                        color: inside ? '#059669' : '#e11d48',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        marginTop: 18,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {inside ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      Result: {inside ? 'WITHIN BUSINESS HOURS' : 'OUTSIDE HOURS (CLOSED)'}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
