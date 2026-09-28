import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { alert, toast, AlertHost } from './index';

afterEach(() => {
  act(() => { alert.close(); alert.close(); alert.close(); toast.dismiss(); });
  cleanup();
});

const mount = () => render(<AlertHost />);

describe('alert library', () => {
  it('confirm resolves true on the confirm button and false on cancel', async () => {
    mount();
    let p;
    act(() => { p = alert.confirm({ title: 'Delete this flow?', confirm: 'Delete' }); });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));
    await expect(p).resolves.toBe(true);

    act(() => { p = alert.confirm({ title: 'Again?', confirm: 'Delete' }); });
    fireEvent.click(screen.getByText('Cancel'));
    await expect(p).resolves.toBe(false);
  });

  it('Escape dismisses a dialog as cancelled', async () => {
    mount();
    let p;
    act(() => { p = alert.confirm('Sure?'); });
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await expect(p).resolves.toBe(false);
  });

  it('shows dialogs one at a time, in order', async () => {
    mount();
    let a; let b;
    act(() => { a = alert.info('First'); b = alert.info('Second'); });
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
    fireEvent.click(screen.getByText('OK'));
    await expect(a).resolves.toBe(true);
    expect(screen.getByText('Second')).toBeTruthy();
    fireEvent.click(screen.getByText('OK'));
    await expect(b).resolves.toBe(true);
  });

  it('choose returns confirm / deny / null', async () => {
    mount();
    let p;
    act(() => { p = alert.choose({ title: 'Save changes?', confirm: 'Save', deny: 'Discard' }); });
    fireEvent.click(screen.getByText('Discard'));
    await expect(p).resolves.toBe('deny');
  });

  it('prompt validates before resolving and returns the typed value', async () => {
    mount();
    let p;
    act(() => { p = alert.prompt({ title: 'Rename', label: 'Name', required: true }); });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('alert').textContent).toMatch(/empty/);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Spring flow' } });
    fireEvent.click(screen.getByText('Save'));
    await expect(p).resolves.toBe('Spring flow');
  });

  it('select prompt returns the chosen option', async () => {
    mount();
    let p;
    act(() => { p = alert.prompt({ title: 'Mute', label: 'For', input: 'select', options: { 60: '1 hour', 1440: '1 day' }, value: '1440', confirm: 'Mute' }); });
    fireEvent.change(screen.getByLabelText('For'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await expect(p).resolves.toBe('60');
  });

  it('typeToConfirm keeps the button disabled until the name matches', async () => {
    mount();
    let p;
    act(() => { p = alert.confirm({ title: 'Delete reseller?', typeToConfirm: 'Quantum Sails', confirm: 'Delete everything' }); });
    const btn = screen.getByText('Delete everything');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Quantum Sails' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await expect(p).resolves.toBe(true);
  });

  it('a required checkbox blocks confirming until ticked', async () => {
    mount();
    let p;
    act(() => { p = alert.confirm({ title: 'Utility?', check: { label: 'It is personal', required: true }, confirm: 'Continue' }); });
    const btn = screen.getByText('Continue');
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('It is personal'));
    fireEvent.click(btn);
    await expect(p).resolves.toBe(true);
  });

  it('problems lists every item', async () => {
    mount();
    let p;
    act(() => { p = alert.problems({ title: 'Fix these', items: ['Button 1 leads nowhere', 'Text is empty'] }); });
    expect(screen.getByText('Button 1 leads nowhere')).toBeTruthy();
    expect(screen.getByText('Text is empty')).toBeTruthy();
    fireEvent.click(screen.getByText('OK, I will fix it'));
    await expect(p).resolves.toBe(true);
  });

  it('progress stays until closed and updates in place', () => {
    mount();
    let job;
    act(() => { job = alert.progress({ title: 'Importing…', value: 10 }); });
    expect(screen.getByText('10%')).toBeTruthy();
    act(() => job.update({ value: 62 }));
    expect(screen.getByText('62%')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByText('Importing…')).toBeTruthy();
    act(() => job.close());
    expect(screen.queryByText('Importing…')).toBeNull();
  });
});

describe('toasts', () => {
  it('shows, replaces by id and dismisses', () => {
    mount();
    let id;
    act(() => { id = toast.loading('Publishing…'); });
    expect(screen.getByText('Publishing…')).toBeTruthy();
    act(() => { toast.success('Published', { id }); });
    expect(screen.queryByText('Publishing…')).toBeNull();
    expect(screen.getByText('Published')).toBeTruthy();
    act(() => toast.dismiss(id));
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('errors are announced as alerts and accept Error objects', () => {
    mount();
    act(() => { toast.error(new Error('Network down')); });
    expect(screen.getByRole('alert').textContent).toContain('Network down');
  });

  it('keeps at most four toasts', () => {
    mount();
    act(() => { for (let i = 1; i <= 6; i += 1) toast.info(`Note ${i}`); });
    expect(screen.queryByText('Note 1')).toBeNull();
    expect(screen.queryByText('Note 2')).toBeNull();
    expect(screen.getByText('Note 6')).toBeTruthy();
  });
});

describe('alert.ask (plain confirm sentences)', () => {
  const open = (msg) => { let p; act(() => { p = alert.ask(msg); }); return p; };

  it('uses the question as the title and the verb as the button', async () => {
    mount();
    const p = open('Delete this label? It will be removed from every subscriber.');
    expect(screen.getByRole('heading').textContent).toBe('Delete this label?');
    expect(screen.getByText('It will be removed from every subscriber.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(p).resolves.toBe(true);
  });

  it('drops "Are you sure you want to" from the title', async () => {
    mount();
    const p = open('Are you sure you want to remove team member "Sara"? This action cannot be undone.');
    expect(screen.getByRole('heading').textContent).toBe('Remove team member "Sara"?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(p).resolves.toBe(false);
  });

  it('keeps a name with a dot in one title', async () => {
    mount();
    const p = open('Delete J. Smith? This also deletes their workspace.');
    expect(screen.getByRole('heading').textContent).toBe('Delete J. Smith?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(p).resolves.toBe(false);
  });

  it('a "Cancel …" question never shows two Cancel buttons', async () => {
    mount();
    const p = open('Cancel the schedule of "Promo"? It goes back to Draft.');
    expect(screen.getByRole('button', { name: 'Yes, cancel it' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await expect(p).resolves.toBe(false);
  });

  it('non-destructive questions get a neutral Continue', async () => {
    mount();
    const p = open('Generate slots for the next 14 days based on your weekly working hours?');
    expect(screen.getByRole('button', { name: 'Generate' }).className).toContain('aw-btn--primary');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await expect(p).resolves.toBe(true);
  });
});
