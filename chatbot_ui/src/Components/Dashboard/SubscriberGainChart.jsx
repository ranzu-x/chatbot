import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

// "Subscriber Gain" chart redesigned to match the blue enterprise dashboard
// theme (--primary: #2563eb). Light, clean blues replace the warm orange/coral
// palette. Keeps the same prop contract: rawData / timeRange / onTimeRangeChange.

const CHANNELS = [
  { key: 'whatsapp',  name: 'WhatsApp',  hue: '#25d366', tint: 'rgba(37,211,102,.12)' },
  { key: 'facebook',  name: 'Facebook',  hue: '#1877f2', tint: 'rgba(24,119,242,.12)' },
  { key: 'instagram', name: 'Instagram', hue: '#e1306c', tint: 'rgba(225,48,108,.12)' },
  { key: 'telegram',  name: 'Telegram',  hue: '#229ed9', tint: 'rgba(34,158,217,.12)' },
  { key: 'webchat',   name: 'Webchat',   hue: '#2563eb', tint: 'rgba(37,99,235,.12)'  },
];

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
      <circle cx={cx} cy={cy} r={18} fill="url(#dotGlow)" />
      <circle cx={cx} cy={cy} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={2.5} />
    </g>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload[0]?.payload?.new_subscribers ?? 0;
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(37,99,235,0.10)',
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        +{total}
      </div>
      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>new subscribers</div>
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
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(37,99,235,0.04), 0 4px 16px rgba(37,99,235,0.06)',
        padding: '24px 28px 20px',
        overflow: 'hidden',
      }}
    >
      {/* Subtle blue glow in the top-right corner */}
      <div
        style={{
          position: 'absolute',
          width: 280,
          height: 280,
          borderRadius: '50%',
          top: -140,
          right: -100,
          background: 'radial-gradient(circle at 50% 50%, rgba(37,99,235,0.07), rgba(37,99,235,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
            Subscriber Growth
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontSize: '2.2rem',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: '#0f172a',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {totalGained.toLocaleString('en-US')}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748b' }}>
              new subscribers
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
            Across WhatsApp, Facebook, Instagram, Telegram and Webchat.
          </div>
        </div>

        {onTimeRangeChange && (
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#475569',
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

      {/* Meta badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: deltaPct >= 0 ? '#059669' : '#ef4444',
            background: deltaPct >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${deltaPct >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            padding: '4px 10px 4px 8px',
            borderRadius: 999,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" style={{ transform: deltaPct < 0 ? 'rotate(180deg)' : 'none' }}>
            <path d="M18 15l-6-6-6 6" />
          </svg>
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct}% vs the {timeRange === 7 ? '3.5' : Math.round(timeRange / 2)} days before
        </span>
        <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          {dailyAvg.toFixed(1)} / day avg
        </span>
      </div>

      {/* Area Chart */}
      <div style={{ height: 240, width: '100%', marginTop: 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#bfdbfe" />
                <stop offset="55%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(37,99,235,0.16)" />
                <stop offset="100%" stopColor="rgba(37,99,235,0)" />
              </linearGradient>
              <radialGradient id="dotGlow">
                <stop offset="0%" stopColor="rgba(37,99,235,0.35)" />
                <stop offset="100%" stopColor="rgba(37,99,235,0)" />
              </radialGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#e2e8f0"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              minTickGap={24}
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis hide domain={[0, 'dataMax + 2']} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="new_subscribers"
              stroke="url(#chartLine)"
              strokeWidth={2.25}
              fill="url(#chartFill)"
              dot={(dotProps) => <CustomDot key={dotProps.index} {...dotProps} dataLength={chartData.length} />}
              activeDot={{ r: 5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2.5 }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Per-channel breakdown row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 16,
          marginTop: 20,
          paddingTop: 18,
          borderTop: '1px solid #f1f5f9',
        }}
      >
        {channelTotals.map((ch) => {
          const path = sparkPath(ch.series.length > 1 ? ch.series : [0, ...ch.series], 100, 18, 2);
          return (
            <div key={ch.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: ch.tint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width={8} height={8} viewBox="0 0 8 8">
                  <circle cx="4" cy="4" r="4" fill={ch.hue} />
                </svg>
              </div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {ch.name}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                +{ch.total}
              </div>
              <div style={{ width: '100%', height: 16 }}>
                <svg viewBox="0 0 100 18" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                  <path d={path} fill="none" stroke={ch.hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
