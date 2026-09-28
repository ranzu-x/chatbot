import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const fmt = (mins) => (mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`);

/**
 * How long the customer has been waiting for a reply
 * (conversations.awaiting_reply_since, kept by a DB trigger). Red past the
 * workspace's SLA target, amber from 75% of it; grey when no target is set.
 * Ticks on its own every 30 s so the Inbox list doesn't re-render.
 */
export default function WaitingBadge({ since, slaMinutes }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  let color = '#64748b';
  let bg = '#f1f5f9';
  if (slaMinutes) {
    if (mins >= slaMinutes) { color = '#b91c1c'; bg = '#fee2e2'; }
    else if (mins >= slaMinutes * 0.75) { color = '#b45309'; bg = '#fef3c7'; }
  }
  return (
    <span
      title={`Waiting for a reply for ${fmt(mins)}${slaMinutes ? ` (target ${slaMinutes} min)` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.63rem', fontWeight: 700, color, background: bg, borderRadius: 8, padding: '1px 5px', flexShrink: 0, marginLeft: 4 }}
    >
      <Clock size={9} /> {fmt(mins)}
    </span>
  );
}
