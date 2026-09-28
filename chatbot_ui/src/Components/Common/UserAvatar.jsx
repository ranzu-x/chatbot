import { useEffect, useState } from 'react';
import { assetUrl } from '../../services/api';

/**
 * A person's profile picture (users.avatar) — for every kind of user: Super
 * Admin, Reseller, End User, Team Member. Without a picture, or when it
 * fails to load, the default avatar (/default-avatar.svg) is shown — never a
 * broken image or an empty circle.
 */
const DEFAULT_AVATAR = '/default-avatar.svg';

export default function UserAvatar({ src, name, size = 32, style, className }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const url = src && !failed ? assetUrl(src) : DEFAULT_AVATAR;
  return (
    <img
      src={url}
      alt={name ? `${name}'s profile picture` : 'Profile picture'}
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block', background: '#dbe4f3', ...style }}
    />
  );
}
