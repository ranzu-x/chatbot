import { describe, it, expect } from 'vitest';
import { prepareArticleHtml } from './sanitizeHtml';

describe('prepareArticleHtml', () => {
  it('strips scripts and handlers', () => {
    const { html } = prepareArticleHtml('<p onclick="x()">Hi</p><script>alert(1)</script><img src="x" onerror="alert(1)">');
    expect(html).not.toMatch(/script|onclick|onerror/);
    expect(html).toContain('<p>Hi</p>');
  });
  it('keeps YouTube embeds only', () => {
    expect(prepareArticleHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>').html).toContain('iframe');
    expect(prepareArticleHtml('<iframe src="https://evil.example/x"></iframe>').html).not.toContain('iframe');
  });
  it('adds unique heading ids and builds the table of contents', () => {
    const { html, toc } = prepareArticleHtml('<h2>Getting started</h2><h3>Setup</h3><h2>Getting started</h2>');
    expect(toc).toEqual([
      { id: 'getting-started', text: 'Getting started', level: 2 },
      { id: 'setup', text: 'Setup', level: 3 },
      { id: 'getting-started-2', text: 'Getting started', level: 2 },
    ]);
    expect(html).toContain('id="getting-started-2"');
  });
  it('opens external links safely in a new tab', () => {
    const { html } = prepareArticleHtml('<a href="https://example.com">x</a>');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
