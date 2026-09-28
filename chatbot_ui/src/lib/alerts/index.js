// The app's own alert + toast library (replaces SweetAlert2 / react-hot-toast).
//
//   import { alert, toast } from '../lib/alerts';
//
//   if (await alert.confirm({ title: 'Delete this flow?', confirm: 'Delete' })) …
//   const name = await alert.prompt({ title: 'Rename flow', value: flow.name });
//   toast.success('Flow saved');
//
// Every dialog returns a Promise. One dialog shows at a time; later calls wait
// in a queue. <AlertHost /> (mounted once in App.jsx) renders everything.
// Styles: ./alerts.css (solid white surfaces, light tinted buttons, dark theme aware).

import { pushDialog, resolveDialog, patchDialog, upsertToast, removeToast, nextId, getSnapshot } from './store';

const asOpts = (optsOrTitle, text) =>
  typeof optsOrTitle === 'string' || optsOrTitle == null
    ? { title: optsOrTitle || '', text }
    : { ...optsOrTitle };

/* ── dialogs ──────────────────────────────────────────────────────────────
 * Common options: title, text, content (a React node under the text), tone
 * ('primary'|'danger'|'warning'|'success'|'info'|'neutral'), icon (a
 * lucide-react component, or false for none), facts [{label, value}],
 * steps [string], details (string shown in a mono block), dismissible.
 */

/** Yes/no question. Resolves true on confirm. Danger tone by default. */
function confirm(optsOrTitle, text, confirmLabel) {
  const o = asOpts(optsOrTitle, text);
  return pushDialog({
    kind: 'confirm',
    tone: 'danger',
    ...o,
    confirm: o.confirm || confirmLabel || 'Yes, continue',
    cancel: o.cancel === undefined ? 'Cancel' : o.cancel,
  }).then((r) => r === 'confirm');
}

const VERBS = [
  ['clean up', 'Clean up', 'danger'], ['delete', 'Delete', 'danger'], ['remove', 'Remove', 'danger'],
  ['disconnect', 'Disconnect', 'danger'], ['clear', 'Clear', 'danger'], ['void', 'Void', 'danger'],
  ['reset', 'Reset', 'danger'], ['unsubscribe', 'Unsubscribe', 'danger'], ['cancel', 'Yes, cancel it', 'danger'],
  ['generate', 'Generate', 'primary'],
];

/** Plain confirm sentence (what `window.confirm` took) → a proper dialog.
 *  The first sentence becomes the title (when short), the rest the text,
 *  and the leading verb ("Delete …", "Are you sure you want to remove …")
 *  picks the button label and tone. Resolves true on confirm. */
function ask(message, opts = {}) {
  const msg = String(message ?? '').trim();
  // Prefer the question as the title; a "." inside a name ("J. Smith") must not split it.
  const m = msg.match(/^([^?]+?\?)(\s+|$)([\s\S]*)$/) || msg.match(/^(.+?[.!])(\s+|$)([\s\S]*)$/);
  let title = m ? m[1] : msg;
  let text = m ? m[3].trim() : '';
  if (title.length > 90) { text = msg; title = 'Are you sure?'; }
  const lead = msg.replace(/^are you sure you want to\s+/i, '').toLowerCase();
  const verb = VERBS.find(([v]) => lead.startsWith(`${v} `) || lead.startsWith(`${v}?`));
  const cancelsSomething = verb && verb[0] === 'cancel';
  if (/^are you sure you want to /i.test(title)) {
    title = `${title.replace(/^are you sure you want to\s+/i, '').replace(/^\w/, (c) => c.toUpperCase())}`;
  }
  return confirm({
    title,
    text,
    tone: verb ? verb[2] : 'primary',
    confirm: verb ? verb[1] : 'Continue',
    cancel: cancelsSomething ? 'Keep it' : 'Cancel',
    ...opts,
  });
}

/** Three-way choice. Resolves 'confirm' | 'deny' | null (cancelled). */
function choose(opts) {
  return pushDialog({
    kind: 'confirm',
    tone: 'primary',
    cancel: 'Cancel',
    ...opts,
  }).then((r) => (r === 'confirm' || r === 'deny' ? r : null));
}

/** A message with one button (and an optional second `cancel` button).
 *  Resolves true when the main button is pressed. */
function notice(kind) {
  return (optsOrTitle, text) => {
    const o = asOpts(optsOrTitle, text);
    return pushDialog({
      kind: 'notice',
      tone: kind,
      ...o,
      confirm: o.confirm || 'OK',
      cancel: o.cancel || null,
    }).then((r) => r === 'confirm');
  };
}

/** Ask for one value. Resolves the value, or null when cancelled.
 *  input: 'text' (default) | 'textarea' | 'number' | 'email' | 'select'
 *  options (select): [{value, label}] or {value: label}
 *  validate(value) → error string | falsy.  required: true = non-empty.
 *  toggle {label, value} / check {label, required} → resolves
 *  { value, toggle, check } instead of the bare value. */
function prompt(opts) {
  const o = { ...opts };
  return pushDialog({
    kind: 'prompt',
    tone: 'primary',
    input: 'text',
    confirm: 'Save',
    cancel: 'Cancel',
    ...o,
  }).then((r) => (r && typeof r === 'object' && 'value' in r ? (o.toggle || o.check ? r : r.value) : null));
}

/** A list of things to fix (e.g. flow validation). Resolves when closed. */
function problems(opts) {
  return pushDialog({
    kind: 'notice',
    tone: 'warning',
    confirm: 'OK, I will fix it',
    ...opts,
  }).then((r) => r === 'confirm');
}

/** Plan limit reached. Resolves true when "See plans" is pressed. */
function limit(opts) {
  const { used, max, label } = opts;
  const meter = Number.isFinite(Number(max)) && max !== null && max !== undefined
    ? { label: label || 'Usage', used: Number(used) || 0, max: Number(max) }
    : null;
  return pushDialog({
    kind: 'notice',
    tone: 'limit',
    confirm: 'See plans',
    cancel: 'Not now',
    meter,
    ...opts,
  }).then((r) => r === 'confirm');
}

/** A dialog that stays up while work runs. Returns a handle:
 *  { update({title, text, value (0–100) , label}), close() }.
 *  With `background: 'Run in background'` the person can close it early. */
function progress(opts = {}) {
  const id = nextId('dlg');
  pushDialog({ kind: 'progress', tone: 'primary', dismissible: false, ...opts, id });
  return {
    id,
    update: (patch) => patchDialog(id, patch),
    close: () => resolveDialog(id, 'close'),
  };
}

/** Closes the dialog on screen (it resolves as cancelled). */
function close() {
  const top = getSnapshot().dialogs[0];
  if (top) resolveDialog(top.id, null);
}

export const alert = {
  confirm,
  ask,
  choose,
  success: notice('success'),
  error: notice('danger'),
  warning: notice('warning'),
  info: notice('info'),
  prompt,
  problems,
  limit,
  progress,
  close,
};

/* ── toasts ───────────────────────────────────────────────────────────────
 * toast.success(message, { description, action: {label, onClick}, duration, id })
 * Returns the toast id (pass `id` to replace an existing toast in place).
 */
const DURATION = { success: 4000, info: 4000, warning: 6000, error: 8000, loading: 0, neutral: 5000 };

const textOf = (m) => {
  if (m == null) return '';
  if (typeof m === 'string' || typeof m === 'number') return String(m);
  if (m instanceof Error) return m.message;
  if (typeof m === 'object' && typeof m.message === 'string') return m.message;
  return m; // a React node
};

function show(type, message, opts = {}) {
  const id = opts.id || nextId('tst');
  const duration = opts.duration !== undefined ? opts.duration : DURATION[type];
  return upsertToast({
    id,
    type,
    title: textOf(message),
    description: opts.description || null,
    action: opts.action || null,
    icon: opts.icon,
    duration,
  });
}

export const toast = {
  success: (m, o) => show('success', m, o),
  error: (m, o) => show('error', m, o),
  warning: (m, o) => show('warning', m, o),
  info: (m, o) => show('info', m, o),
  loading: (m, o) => show('loading', m, o),
  /** A neutral toast with an Undo button. */
  undo: (m, { onUndo, duration = 6000, ...o } = {}) =>
    show('neutral', m, { ...o, duration, action: { label: 'Undo', onClick: onUndo } }),
  /** Loading → success / error on the same toast. Returns the promise. */
  promise(p, { loading = 'Working…', success = 'Done', error = 'Something went wrong' } = {}, o = {}) {
    const id = show('loading', loading, o);
    Promise.resolve(p).then(
      (v) => show('success', typeof success === 'function' ? success(v) : success, { ...o, id }),
      (e) => show('error', typeof error === 'function' ? error(e) : error, { ...o, id }),
    );
    return p;
  },
  update: (id, { type, message, ...o }) => {
    const current = getSnapshot().toasts.find((t) => t.id === id);
    const t = type || current?.type || 'info';
    return show(t, message ?? current?.title, { ...current, ...o, id, duration: o.duration ?? DURATION[t] });
  },
  dismiss: (id) => removeToast(id),
};

export { default as AlertHost } from './AlertHost';
export default alert;
