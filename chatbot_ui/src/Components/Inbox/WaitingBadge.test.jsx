import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WaitingBadge from './WaitingBadge';

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

describe('WaitingBadge', () => {
  it('renders nothing when nobody is waiting', () => {
    const { container } = render(<WaitingBadge since={null} slaMinutes={30} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the wait and turns red past the SLA target', () => {
    render(<WaitingBadge since={minutesAgo(45)} slaMinutes={30} />);
    const badge = screen.getByTitle(/Waiting for a reply for 45m/);
    expect(badge.style.color).toBe('rgb(185, 28, 28)');
  });

  it('is amber from 75% of the target and grey without one', () => {
    render(<WaitingBadge since={minutesAgo(24)} slaMinutes={30} />);
    expect(screen.getByTitle(/24m/).style.color).toBe('rgb(180, 83, 9)');
    render(<WaitingBadge since={minutesAgo(90)} />);
    expect(screen.getByTitle(/1h/).style.color).toBe('rgb(100, 116, 139)');
  });
});
