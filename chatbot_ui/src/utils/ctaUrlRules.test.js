import { describe, it, expect } from 'vitest';
import { ctaUrlProblem } from './ctaUrlRules';

const good = { body: 'Tap below', buttonText: 'View order', url: 'https://shop.example.com/o?id={{order_id}}', headerType: 'none' };

describe('CTA URL element rules (mirror of the server)', () => {
  it('accepts a normal element', () => {
    expect(ctaUrlProblem(good)).toBeNull();
  });
  it('enforces WhatsApp limits', () => {
    expect(ctaUrlProblem({ ...good, buttonText: 'x'.repeat(21) })).toMatch(/20/);
    expect(ctaUrlProblem({ ...good, body: 'x'.repeat(1025) })).toMatch(/1024/);
    expect(ctaUrlProblem({ ...good, headerType: 'text', headerText: 'x'.repeat(61) })).toMatch(/60/);
    expect(ctaUrlProblem({ ...good, footerText: 'x'.repeat(61) })).toMatch(/60/);
  });
  it('checks the URL', () => {
    expect(ctaUrlProblem({ ...good, url: 'https://' })).toMatch(/required/);
    expect(ctaUrlProblem({ ...good, url: 'ftp://x.com' })).toMatch(/https/);
    expect(ctaUrlProblem({ ...good, url: 'https://{{d}}/x' })).toMatch(/after the domain/);
    expect(ctaUrlProblem({ ...good, url: 'https://x.com/a b' })).toMatch(/spaces/);
  });
  it('needs header media when a media header is chosen', () => {
    expect(ctaUrlProblem({ ...good, headerType: 'image' })).toMatch(/image/);
    expect(ctaUrlProblem({ ...good, headerType: 'image', headerMediaUrl: '/uploads/a.png' })).toBeNull();
  });
});
