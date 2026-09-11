import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

// "Subscriber Bloom" — a soft, light-toned redesign of the old stacked bar
// chart, approved by the user from a set of mockups. The line sweeps
// through a "dawn" gradient (cool lavender at the oldest day, warm
// coral-gold at today) — light visually warming toward the present as a
// stand-in for growth — with a soft glow on the most recent point, a serif
// (Fraunces) headline number, and an airy per-channel breakdown row instead
// of boxed stat tiles. Deliberately keeps the exact prop contract the old
// component had (rawData / timeRange / onTimeRangeChange) so nothing else
// in AgencyDashboard.jsx needs to change.

const CHANNELS = [
  { key: 'whatsapp',  name: 'WhatsApp',  hue: '#25d366', tint: 'rgba(37,211,102,.14)' },
  { key: 'facebook',  name: 'Facebook',  hue: '#4c8bf0', tint: 'rgba(76,139,240,.14)' },
  { key: 'instagram', name: 'Instagram', hue: '#e0558a', tint: 'rgba(224,85,138,.14)' },
  { key: 'telegram',  name: 'Telegram',  hue: '#41a8d8', tint: 'rgba(65,168,216,.14)' },
  { key: 'webchat',   name: 'Webchat',   hue: '#7a7ce0', tint: 'rgba(122,124,224,.14)' },
];

// Attractive fallback sample timeline if the workspace has no history yet —
// carried over from the previous chart so a brand-new account still sees a
// populated-looking preview rather than an empty axis.
function generateSampleDays(days = 14) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const wa = Math.floor(Math.random() * 8) + 2;
    const fb = Math.floor(Math.random() * 5) + 1;
    const ig = Math.floor(Math.random() * 6) + 1;
    const tg = Math.floor(Math.random() * 3);
    const web = Math.floor(Math.random() * 4) + 1;
    result.push({
      date: dateStr,
      new_subscribers: wa + fb + ig + tg + web,
      whatsapp: wa,
      facebook: fb,
      instagram: ig,
      telegram: tg,
      webchat: web,
    });
  }
  return result;
}

function sparkPath(data, w, h, pad = 2) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1 || 1);
  return data
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function CustomDot(props) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={20} fill="url(#bloomGlow)" />
      <circle cx={cx} cy={cy} r={5.5} fill="#ff9d6c" stroke="#fffefc" strokeWidth={2.5} />
    </g>
  );
}

function BloomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload[0]?.payload?.new_subscribers ?? 0;
  return (
    <div
      style={{
        background: '#fffefc',
        border: '1px solid #f0eeee',
        borderRadius: 14,
        padding: '11px 14px',
        boxShadow: '0 18px 40px -14px rgba(90, 60, 90, 0.28)',
        minWidth: 150,
      }}
    >
      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontWeight: 440, fontSize: '0.86rem', color: '#5c5566', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 560, fontSize: '1.3rem', color: '#20222c', fontVariantNumeric: 'tabular-nums' }}>
        +{total}
      </div>
      <div style={{ fontSize: '0.68rem', color: '#a39cae', marginTop: 1 }}>new subscribers that day</div>
    </div>
  );
}

export default function SubscriberGainChart({ rawData = [], timeRange = 14, onTimeRangeChange }) {
  const chartData = useMemo(() => {
    if (rawData && rawData.length > 0) {
      return rawData.map((d) => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        new_subscribers: Number(d.new_subscribers || d.count || 0),
        whatsapp: Number(d.whatsapp || 0),
        facebook: Number(d.facebook || 0),
        instagram: Number(d.instagram || 0),
        telegram: Number(d.telegram || 0),
        webchat: Number(d.webchat || 0),
      }));
    }
    return generateSampleDays(timeRange);
  }, [rawData, timeRange]);

  const totalGained = useMemo(
    () => chartData.reduce((acc, curr) => acc + (curr.new_subscribers || 0), 0),
    [chartData]
  );
  const dailyAvg = useMemo(
    () => (chartData.length ? totalGained / chartData.length : 0),
    [chartData, totalGained]
  );
  const deltaPct = useMemo(() => {
    if (chartData.length < 2) return 0;
    const mid = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, mid).reduce((a, c) => a + c.new_subscribers, 0);
    const secondHalf = chartData.slice(mid).reduce((a, c) => a + c.new_subscribers, 0);
    if (!firstHalf) return secondHalf > 0 ? 100 : 0;
    return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
  }, [chartData]);

  const channelTotals = useMemo(
    () =>
      CHANNELS.map((ch) => ({
        ...ch,
        total: chartData.reduce((a, c) => a + (c[ch.key] || 0), 0),
        series: chartData.map((c) => c[ch.key] || 0),
      })),
    [chartData]
  );

  return (
    <div
      style={{
        position: 'relative',
        background: '#fffefc',
        border: '1px solid #efeeee',
        borderRadius: 28,
        boxShadow:
          '0 1px 1px rgba(35,39,51,0.03), 0 30px 60px -30px rgba(90,60,90,0.18), 0 14px 28px -20px rgba(90,60,90,0.10)',
        padding: '40px 40px 36px',
        overflow: 'hidden',
      }}
    >
      {/* one soft bokeh glow tucked in the corner — the card's single flourish */}
      <div
        style={{
          position: 'absolute',
          width: 340,
          height: 340,
          borderRadius: '50%',
          top: -160,
          right: -140,
          background: 'radial-gradient(circle at 50% 50%, rgba(255,157,108,0.20), rgba(255,157,108,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Header row: headline + timeframe control ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', maxWidth: '30ch' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b9a8c9', marginBottom: 10 }}>
            Subscriber Growth
          </div>
          <span
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 560,
              fontSize: '2.6rem',
              letterSpacing: '-0.02em',
              lineHeight: 1.02,
              color: '#20222c',
              fontVariantNumeric: 'tabular-nums',
              backgroundImage: 'linear-gradient(100deg, #3a2f45 0%, #6a4a3f 60%, #b35b2e 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {totalGained.toLocaleString('en-US')}
          </span>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 440, fontStyle: 'italic', fontSize: '1.15rem', color: '#5c5566', marginLeft: 6 }}>
            new subscribers
          </span>
          <div style={{ fontSize: '0.88rem', color: '#8a8695', marginTop: 6, lineHeight: 1.55, maxWidth: '44ch' }}>
            Across WhatsApp, Facebook, Instagram, Telegram and Webchat.
          </div>
        </div>

        {onTimeRangeChange && (
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #efeeee',
              background: '#fffefc',
              color: '#5c5566',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
        )}
      </div>

      {/* ── Meta row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#a2440f',
            background: 'linear-gradient(120deg, rgba(255,157,108,0.16), rgba(255,215,153,0.16))',
            border: '1px solid rgba(255,157,108,0.28)',
            padding: '5px 11px 5px 9px',
            borderRadius: 999,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" style={{ transform: deltaPct < 0 ? 'rotate(180deg)' : 'none' }}>
            <path d="M18 15l-6-6-6 6" />
          </svg>
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct}% vs the {timeRange === 7 ? '3.5' : Math.round(timeRange / 2)} days before
        </span>
        <span style={{ fontSize: '0.78rem', color: '#8a8695', fontVariantNumeric: 'tabular-nums' }}>
          {dailyAvg.toFixed(1)} a day, on average
        </span>
      </div>

      {/* ── Chart ── */}
      <div style={{ height: 280, width: '100%', marginTop: 26 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 14, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bloomLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#b9a8dc" />
                <stop offset="55%" stopColor="#e8a690" />
                <stop offset="100%" stopColor="#ff9d6c" />
              </linearGradient>
              <linearGradient id="bloomFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,157,108,0.30)" />
                <stop offset="100%" stopColor="rgba(255,157,108,0)" />
              </linearGradient>
              <radialGradient id="bloomGlow">
                <stop offset="0%" stopColor="rgba(255,157,108,0.55)" />
                <stop offset="100%" stopColor="rgba(255,157,108,0)" />
              </radialGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#b3aebd"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis hide domain={[0, 'dataMax + 2']} />
            <Tooltip content={<BloomTooltip />} cursor={{ stroke: '#f0eeee', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="new_subscribers"
              stroke="url(#bloomLine)"
              strokeWidth={2.25}
              fill="url(#bloomFill)"
              dot={(dotProps) => <CustomDot key={dotProps.index} {...dotProps} dataLength={chartData.length} />}
              activeDot={{ r: 6, fill: '#ff9d6c', stroke: '#fffefc', strokeWidth: 2.5 }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Channel bloom row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 18,
          marginTop: 34,
          paddingTop: 28,
          borderTop: '1px solid #f1efef',
        }}
      >
        {channelTotals.map((ch) => {
          const path = sparkPath(ch.series.length > 1 ? ch.series : [0, ...ch.series], 100, 18, 2);
          return (
            <div key={ch.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 9 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: ch.tint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.03)',
                }}
              >
                <svg width={8} height={8} viewBox="0 0 8 8">
                  <circle cx="4" cy="4" r="4" fill={ch.hue} />
                </svg>
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9a95a3', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                {ch.name}
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 560, fontSize: '1.28rem', color: '#232733', fontVariantNumeric: 'tabular-nums' }}>
                +{ch.total}
              </div>
              <div style={{ width: '100%', height: 18 }}>
                <svg viewBox="0 0 100 18" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                  <path d={path} fill="none" stroke={ch.hue} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
