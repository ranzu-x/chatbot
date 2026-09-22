import React from 'react';

/**
 * Modern vector brand icons for supported chatbot platforms.
 * Replaces unicode emojis with crisp, authentic brand SVGs.
 *
 * Every brand color below is a CSS variable (--channel-*, index.css), not a
 * literal hex — change a channel's color once, in one place, and both the
 * icon tile and every getPlatformMeta().color consumer follow. These are
 * deliberately separate from --primary/the accent picker: they're real
 * external brand colors (Webchat excepted — this app's own widget), never
 * affected by a workspace's chosen accent.
 */
export function PlatformIcon({ platform, size = 16, className = '', style = {} }) {
  const p = (platform || 'WEBCHAT').toUpperCase();

  switch (p) {
    case 'WHATSAPP':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <rect width="24" height="24" rx="6" style={{ fill: 'var(--channel-whatsapp)' }} />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12C4.5 13.39 4.88 14.69 5.54 15.8L4.82 18.88C4.73 19.29 5.1 19.65 5.51 19.55L8.54 18.75C9.6 19.36 10.76 19.7 12 19.7C16.14 19.7 19.5 16.34 19.5 12.2C19.5 8.06 16.14 4.5 12 4.5ZM15.65 14.49C15.5 14.41 14.75 14.04 14.61 13.99C14.47 13.94 14.37 13.91 14.26 14.06C14.16 14.22 13.87 14.56 13.78 14.66C13.69 14.77 13.6 14.78 13.45 14.7C13.3 14.63 12.8 14.47 12.22 13.95C11.77 13.55 11.46 13.05 11.37 12.9C11.28 12.75 11.36 12.67 11.44 12.59C11.51 12.52 11.59 12.42 11.67 12.32C11.74 12.23 11.77 12.17 11.82 12.06C11.87 11.96 11.85 11.87 11.81 11.8C11.77 11.72 11.46 10.97 11.34 10.66C11.21 10.36 11.09 10.4 10.99 10.4C10.9 10.4 10.8 10.4 10.7 10.4C10.6 10.4 10.44 10.44 10.3 10.59C10.16 10.74 9.76 11.11 9.76 11.86C9.76 12.61 10.31 13.33 10.39 13.43C10.46 13.54 11.47 15.08 13 15.75C13.37 15.91 13.65 16 13.87 16.08C14.24 16.19 14.58 16.18 14.84 16.14C15.14 16.1 15.76 15.76 15.89 15.4C16.01 15.04 16.01 14.73 15.97 14.66C15.94 14.6 15.83 14.56 15.65 14.49Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'FACEBOOK':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <rect width="24" height="24" rx="6" style={{ fill: 'var(--channel-facebook)' }} />
          <path
            d="M13.5 19V12.7H15.6L15.9 10.3H13.5V8.8C13.5 8.1 13.7 7.6 14.7 7.6H16V5.4C15.4 5.3 14.7 5.2 13.9 5.2C11.8 5.2 10.4 6.5 10.4 8.9V10.3H8.3V12.7H10.4V19H13.5Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'INSTAGRAM':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <defs>
            <linearGradient id={`igGrad_${size}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FD5949" />
              <stop offset="28%" stopColor="#D6249F" />
              <stop offset="100%" stopColor="#285AEB" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill={`url(#igGrad_${size})`} />
          <rect x="5.5" y="5.5" width="13" height="13" rx="3.8" stroke="#FFFFFF" strokeWidth="1.6" fill="none" />
          <circle cx="12" cy="12" r="3.2" stroke="#FFFFFF" strokeWidth="1.6" fill="none" />
          <circle cx="15.8" cy="8.2" r="0.9" fill="#FFFFFF" />
        </svg>
      );

    case 'TELEGRAM':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <rect width="24" height="24" rx="6" style={{ fill: 'var(--channel-telegram)' }} />
          <path
            d="M6.6 11.8L16.4 7.9C16.9 7.7 17.3 8.1 17.1 8.6L15.4 16.5C15.3 17 14.8 17.2 14.4 17L11.7 14.9L10.3 16.2C10.1 16.4 9.8 16.3 9.7 16L8.9 13.4L6.5 12.6C6.1 12.5 6.1 12 6.6 11.8Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'TIKTOK':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <rect width="24" height="24" rx="6" fill="#000000" />
          <path
            d="M16.5 8.1C15.6 8 14.7 7.4 14.3 6.6C14.1 6.3 14 6 14 5.6H11.7V14.8C11.6 15.8 10.7 16.6 9.6 16.5C8.6 16.4 7.8 15.5 7.8 14.5C7.8 13.5 8.7 12.6 9.7 12.6C10 12.6 10.3 12.7 10.6 12.8V10.4C10.3 10.3 9.9 10.3 9.6 10.3C7.2 10.3 5.3 12.2 5.4 14.6C5.5 17 7.4 18.9 9.8 18.9C12.2 18.9 14.1 17 14.1 14.6V10.2C15.2 11 16.5 11.5 17.8 11.6V9.2C17.4 9.1 17 8.8 16.5 8.1Z"
            fill="#FFFFFF"
          />
          <path
            d="M14 5.6C14 6 14.1 6.3 14.3 6.6C14.7 7.4 15.6 8 16.5 8.1V7.6C15.8 7.5 15.1 7.1 14.7 6.4C14.4 6.1 14.2 5.8 14.2 5.4L14 5.6Z"
            fill="#FE2C55"
          />
          <path
            d="M10.6 12.8C10.3 12.7 10 12.6 9.7 12.6C8.7 12.6 7.8 13.5 7.8 14.5C7.8 15.5 8.6 16.4 9.6 16.5C10.7 16.6 11.6 15.8 11.7 14.8V14.3C11.6 15.1 10.9 15.7 10 15.7C9.1 15.7 8.4 15 8.4 14.2C8.4 13.4 9.1 12.7 10 12.7C10.2 12.7 10.4 12.7 10.6 12.8Z"
            fill="#25F4EE"
          />
        </svg>
      );

    case 'WEBCHAT':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <defs>
            <linearGradient id={`wcGrad_${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#4338CA" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill={`url(#wcGrad_${size})`} />
          <path
            d="M12 5.5C8.13 5.5 5 8.23 5 11.6C5 13.06 5.58 14.4 6.55 15.46L5.64 18.2C5.53 18.53 5.84 18.84 6.17 18.73L9.24 17.81C10.12 18.23 11.08 18.45 12 18.45C15.87 18.45 19 15.72 19 12.35C19 8.98 15.87 5.5 12 5.5Z"
            fill="#FFFFFF"
          />
          <circle cx="9" cy="11.9" r="1.1" fill="#6366F1" />
          <circle cx="12" cy="11.9" r="1.1" fill="#6366F1" />
          <circle cx="15" cy="11.9" r="1.1" fill="#6366F1" />
        </svg>
      );

    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
          <rect width="24" height="24" rx="6" style={{ fill: 'var(--text-tertiary)' }} />
          <circle cx="12" cy="12" r="5.5" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
          <ellipse cx="12" cy="12" rx="2.5" ry="5.5" stroke="#FFFFFF" strokeWidth="1.3" fill="none" />
          <line x1="6.5" y1="12" x2="17.5" y2="12" stroke="#FFFFFF" strokeWidth="1.3" />
        </svg>
      );
  }
}

export function getPlatformMeta(platform) {
  const p = (platform || 'WEBCHAT').toUpperCase();
  switch (p) {
    case 'WHATSAPP':
      return { label: 'WhatsApp', color: 'var(--channel-whatsapp)', defaultName: 'WhatsApp Channel' };
    case 'FACEBOOK':
      return { label: 'Facebook', color: 'var(--channel-facebook)', defaultName: 'Facebook Channel' };
    case 'INSTAGRAM':
      return { label: 'Instagram', color: 'var(--channel-instagram)', defaultName: 'Instagram Channel' };
    case 'TELEGRAM':
      return { label: 'Telegram', color: 'var(--channel-telegram)', defaultName: 'Telegram Channel' };
    case 'TIKTOK':
      return { label: 'TikTok', color: 'var(--channel-tiktok)', defaultName: 'TikTok Channel' };
    case 'WEBCHAT':
      return { label: 'Live Webchat', color: 'var(--channel-webchat)', defaultName: 'Live Webchat' };
    default:
      return { label: platform || 'Channel', color: '#64748B', defaultName: `${platform} Channel` };
  }
}

export default PlatformIcon;
