/**
 * Appearance system — one place that controls the app's typeface, accent
 * colour and UI density.
 *
 * Everything is driven by CSS variables declared in index.css, so changing a
 * value here restyles every page at once — no component needs to know about
 * it. Three ways to change the font:
 *
 *   1. UI          — Settings → Appearance (live preview, saved per browser).
 *   2. Whole app   — edit `--font-sans` in index.css to change the default
 *                    everyone sees before they pick anything.
 *   3. Code        — setAppearance({ font: 'manrope' }) from anywhere.
 *
 * Google fonts are loaded lazily, only when a font that needs one is picked.
 */

const STORAGE_KEY = 'appearance';

export const FONTS = [
  {
    id: 'inter', label: 'Inter', note: 'Default · neutral UI sans',
    stack: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    google: 'Inter:wght@300;400;500;600;700;800',
  },
  {
    id: 'jakarta', label: 'Plus Jakarta Sans', note: 'Geometric · friendly',
    stack: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    google: 'Plus+Jakarta+Sans:wght@300;400;500;600;700;800',
  },
  {
    id: 'dmsans', label: 'DM Sans', note: 'Low contrast · compact',
    stack: "'DM Sans', 'Inter', system-ui, sans-serif",
    google: 'DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700',
  },
  {
    id: 'manrope', label: 'Manrope', note: 'Modern · slightly technical',
    stack: "'Manrope', 'Inter', system-ui, sans-serif",
    google: 'Manrope:wght@300;400;500;600;700;800',
  },
  {
    id: 'outfit', label: 'Outfit', note: 'Rounded · marketing-friendly',
    stack: "'Outfit', 'Inter', system-ui, sans-serif",
    google: 'Outfit:wght@300;400;500;600;700;800',
  },
  {
    id: 'publicsans', label: 'Public Sans', note: 'Clear · government-grade',
    stack: "'Public Sans', 'Inter', system-ui, sans-serif",
    google: 'Public+Sans:wght@300;400;500;600;700;800',
  },
  {
    id: 'sora', label: 'Sora', note: 'Distinctive · product/tech',
    stack: "'Sora', 'Inter', system-ui, sans-serif",
    google: 'Sora:wght@300;400;500;600;700;800',
  },
  {
    id: 'system', label: 'System Default', note: 'No web font · fastest',
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    google: null,
  },
];

export const ACCENTS = [
  { id: 'graphite', label: 'Graphite', base: '#18181b', dark: '#000000', light: '#3f3f46' },
  { id: 'blue',    label: 'Blue',    base: '#2563eb', dark: '#1d4ed8', light: '#3b82f6' },
  { id: 'indigo',  label: 'Indigo',  base: '#4f46e5', dark: '#4338ca', light: '#6366f1' },
  { id: 'violet',  label: 'Violet',  base: '#7c3aed', dark: '#6d28d9', light: '#8b5cf6' },
  { id: 'teal',    label: 'Teal',    base: '#0d9488', dark: '#0f766e', light: '#14b8a6' },
  { id: 'emerald', label: 'Emerald', base: '#059669', dark: '#047857', light: '#10b981' },
  { id: 'amber',   label: 'Amber',   base: '#d97706', dark: '#b45309', light: '#f59e0b' },
  { id: 'rose',    label: 'Rose',    base: '#e11d48', dark: '#be123c', light: '#f43f5e' },
];

export const DENSITIES = [
  { id: 'compact',     label: 'Compact',     note: 'More on screen',  rootSize: '15px' },
  { id: 'default',     label: 'Default',     note: 'Balanced',        rootSize: '16px' },
  { id: 'comfortable', label: 'Comfortable', note: 'Easier to read',  rootSize: '17px' },
];

// Matches the ManyChat reference look's near-black primary buttons/text — see index.css's :root for why.
export const DEFAULT_APPEARANCE = { font: 'inter', accent: 'graphite', density: 'default' };

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function ensureGoogleFont(font) {
  if (!font?.google || typeof document === 'undefined') return;
  const id = `appearance-font-${font.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

export function getAppearance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** Writes the chosen appearance onto :root as CSS variables. */
export function applyAppearance(appearance = getAppearance()) {
  if (typeof document === 'undefined') return appearance;
  const root = document.documentElement;

  const font = FONTS.find((f) => f.id === appearance.font) || FONTS[0];
  ensureGoogleFont(font);
  root.style.setProperty('--font-sans', font.stack);

  const accent = ACCENTS.find((a) => a.id === appearance.accent) || ACCENTS[0];
  root.style.setProperty('--primary', accent.base);
  root.style.setProperty('--primary-dark', accent.dark);
  root.style.setProperty('--primary-light', accent.light);
  root.style.setProperty('--accent', accent.base);
  root.style.setProperty('--primary-soft', hexToRgba(accent.base, 0.09));
  root.style.setProperty('--primary-ring', hexToRgba(accent.base, 0.16));

  const density = DENSITIES.find((d) => d.id === appearance.density) || DENSITIES[1];
  root.style.fontSize = density.rootSize;

  return appearance;
}

/** Merge + persist + apply. Returns the resulting appearance. */
export function setAppearance(partial) {
  const next = { ...getAppearance(), ...partial };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  applyAppearance(next);
  window.dispatchEvent(new CustomEvent('appearance:change', { detail: next }));
  return next;
}

export function resetAppearance() {
  return setAppearance(DEFAULT_APPEARANCE);
}
