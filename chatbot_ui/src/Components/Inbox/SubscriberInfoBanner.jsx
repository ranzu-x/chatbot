import { memo, useEffect, useState } from 'react';
import { Globe2, Clock, Eye, Languages, CalendarDays, User } from 'lucide-react';
import 'flag-icons/css/flag-icons.min.css';
import { formatLocalTime, localWeekdayIfDifferent, offsetLabel, lastSeenLabel, languageName, parseProfile } from './subscriberBannerUtils';

/**
 * Compact strip under the Inbox chat header: who the subscriber is, where they
 * are and what time it is for them. Country / timezone come from the server
 * (GET /conversations/:id → subscriberLocale, chatbot_api/utils/subscriberLocale.js).
 * It keeps its own 30-second clock, so the chat itself never re-renders for it.
 */
function Item({ icon, label, children, title }) {
  const Icon = icon;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', minWidth: 0 }}>
      <Icon size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  );
}

function SubscriberInfoBanner({ name, locale, lastInboundAt, platformProfile, age, subscribedAt }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const tz = locale?.timezone || null;
  const localTime = formatLocalTime(tz, now);
  const weekday = localWeekdayIfDifferent(tz, now);
  const offset = offsetLabel(tz, now);
  const profile = parseProfile(platformProfile);
  const language = languageName(profile.language || profile.language_code || profile.locale);
  const country = locale?.country || null;
  const seen = lastSeenLabel(lastInboundAt, now.getTime());

  return (
    <div
      className="subscriber-info-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', rowGap: 4,
        padding: '6px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        fontSize: '0.74rem', flexShrink: 0, minHeight: 30,
      }}
    >
      <Item icon={User} label="Name">{name || 'Unknown'}</Item>
      <Item icon={Globe2} label="Country" title={country ? `${locale.countryName} (${country})` : 'Not known from this channel'}>
        {country ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className={`fi fi-${country.toLowerCase()}`} role="img" aria-label={locale.countryName} style={{ width: 16, height: 12, borderRadius: 2, backgroundSize: 'cover', boxShadow: '0 0 0 1px #e2e8f0' }} />
            {locale.countryName}
          </span>
        ) : 'Unknown'}
      </Item>
      <Item
        icon={Clock}
        label="Local time"
        title={tz ? `${tz}${locale?.approximate ? ' — estimated from the country; it has several time zones' : ''}` : 'Time zone not known'}
      >
        {localTime ? `${locale?.approximate ? '≈ ' : ''}${localTime}${weekday ? ` (${weekday})` : ''}${offset ? ` · ${offset}` : ''}` : 'Unknown'}
      </Item>
      <Item icon={Eye} label="Last seen" title={lastInboundAt ? new Date(lastInboundAt).toLocaleString() : 'Has not written in yet'}>
        {seen || 'Never'}
      </Item>
      {language && <Item icon={Languages} label="Language">{language}</Item>}
      {age !== null && age !== undefined && age !== '' && <Item icon={User} label="Age">{age}</Item>}
      {subscribedAt && (
        <Item icon={CalendarDays} label="Subscriber since">
          {new Date(subscribedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Item>
      )}
    </div>
  );
}

export default memo(SubscriberInfoBanner);
