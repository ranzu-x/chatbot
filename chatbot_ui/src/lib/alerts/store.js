// State behind the alert library: a queue of dialogs (one shown at a time)
// and a list of toasts. Plain module state + subscribers — no React context,
// so `alert.*` / `toast.*` can be called from anywhere (event handlers,
// utilities, non-component modules). <AlertHost /> renders it.

let dialogs = []; // [{ id, spec, resolve }]
let toasts = [];  // [{ id, ...spec, createdAt }]
const listeners = new Set();
let seq = 0;

export const nextId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(seq += 1)}`;

const emit = () => listeners.forEach((fn) => fn());

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let snapshot = { dialogs, toasts };
export const getSnapshot = () => snapshot;
function commit() {
  snapshot = { dialogs, toasts };
  emit();
}

// ── dialogs ─────────────────────────────────────────────────────────────
export function pushDialog(spec) {
  return new Promise((resolve) => {
    const id = spec.id || nextId('dlg');
    dialogs = [...dialogs, { id, spec: { ...spec, id }, resolve }];
    commit();
  });
}

/** Closes a dialog and hands `result` to whoever awaited it. */
export function resolveDialog(id, result) {
  const entry = dialogs.find((d) => d.id === id);
  if (!entry) return;
  dialogs = dialogs.filter((d) => d.id !== id);
  commit();
  entry.resolve(result);
}

export function patchDialog(id, patch) {
  let changed = false;
  dialogs = dialogs.map((d) => {
    if (d.id !== id) return d;
    changed = true;
    return { ...d, spec: { ...d.spec, ...patch } };
  });
  if (changed) commit();
}

// ── toasts ──────────────────────────────────────────────────────────────
const MAX_TOASTS = 4;

export function upsertToast(spec) {
  const existing = toasts.find((t) => t.id === spec.id);
  if (existing) {
    toasts = toasts.map((t) => (t.id === spec.id ? { ...t, ...spec, updatedAt: Date.now() } : t));
  } else {
    toasts = [...toasts, { ...spec, createdAt: Date.now(), updatedAt: Date.now() }];
    // Oldest go first once the stack is full (loading toasts are kept).
    while (toasts.length > MAX_TOASTS) {
      const drop = toasts.find((t) => t.type !== 'loading') || toasts[0];
      toasts = toasts.filter((t) => t !== drop);
    }
  }
  commit();
  return spec.id;
}

export function removeToast(id) {
  if (id === undefined) toasts = [];
  else toasts = toasts.filter((t) => t.id !== id);
  commit();
}
