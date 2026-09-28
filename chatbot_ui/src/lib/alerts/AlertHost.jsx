// Renders the alert library's dialogs (one at a time) and toast stack.
// Mounted once in App.jsx. See ./index.js for the API.
import React, { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Check, CircleHelp, Info, Loader2, OctagonAlert, Trash2, X, Zap,
} from 'lucide-react';
import { subscribe, getSnapshot, resolveDialog, removeToast } from './store';
import './alerts.css';

const TONE_ICON = {
  danger: AlertTriangle,
  primary: CircleHelp,
  warning: AlertTriangle,
  success: Check,
  info: Info,
  limit: Zap,
  neutral: Info,
};

const DELETE_RE = /\b(delete|remove|clear|discard)\b/i;

function iconFor(spec) {
  if (spec.icon === false) return null;
  if (spec.icon) return spec.icon;
  if (spec.kind === 'progress') return Loader2;
  if (spec.kind === 'notice' && spec.tone === 'danger') return OctagonAlert;
  if (spec.kind === 'confirm' && spec.tone === 'danger' && DELETE_RE.test(`${spec.title} ${spec.confirm}`)) return Trash2;
  return TONE_ICON[spec.tone] || Info;
}

function confirmToneFor(spec) {
  if (spec.confirmTone) return spec.confirmTone;
  if (spec.kind === 'confirm' && spec.tone === 'danger') return 'danger';
  if (spec.tone === 'success') return 'success';
  if (spec.tone === 'warning' && spec.kind === 'confirm') return 'warning';
  return 'primary';
}

const normalizeOptions = (options) => {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label ?? String(o.value) } : { value: String(o), label: String(o) }));
  }
  return Object.entries(options).map(([value, label]) => ({ value, label: String(label) }));
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ───────────────────────────── dialog ───────────────────────────── */

function Dialog({ id, spec }) {
  const uid = useId();
  const titleId = `${uid}-t`;
  const descId = `${uid}-d`;
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  const isPrompt = spec.kind === 'prompt';
  const options = normalizeOptions(spec.options);
  const [value, setValue] = useState(() => {
    if (!isPrompt) return '';
    if (spec.value !== undefined && spec.value !== null) return String(spec.value);
    if (spec.input === 'select' && options.length && !spec.placeholder) return options[0].value;
    return '';
  });
  const [toggle, setToggle] = useState(!!spec.toggle?.value);
  const [check, setCheck] = useState(!!spec.check?.value);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);

  const dismissible = spec.dismissible !== false && spec.kind !== 'progress';
  const cancel = (result = null) => resolveDialog(id, result);

  const validationError = () => {
    if (isPrompt) {
      const v = spec.input === 'number' ? value.trim() : value;
      if (spec.required && !String(v).trim()) return spec.requiredMessage || 'This can’t be empty.';
      if (spec.input === 'email' && v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
      if (spec.input === 'number' && v !== '' && !Number.isFinite(Number(v))) return 'Enter a number.';
      if (spec.validate) {
        const msg = spec.validate(spec.input === 'number' && v !== '' ? Number(v) : v);
        if (msg) return msg;
      }
    }
    if (spec.check?.required && !check) return spec.check.requiredMessage || 'Tick the box to confirm.';
    return '';
  };

  const typeOk = !spec.typeToConfirm || typed.trim() === String(spec.typeToConfirm).trim();
  const checkOk = !spec.check?.required || check;

  const submit = () => {
    if (!typeOk) return;
    const msg = validationError();
    setTried(true);
    setError(msg);
    if (msg) {
      (inputRef.current || confirmRef.current)?.focus();
      return;
    }
    if (isPrompt) {
      const out = spec.input === 'number' ? (value.trim() === '' ? null : Number(value)) : value;
      resolveDialog(id, { value: out, toggle, check });
    } else {
      resolveDialog(id, 'confirm');
    }
  };

  // Live re-validation once the person has tried to submit.
  useEffect(() => {
    if (tried) setError(validationError());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, check, tried]);

  // Focus: first field, else the main button; give it back on close.
  useLayoutEffect(() => {
    const before = document.activeElement;
    const target = inputRef.current || (spec.focusCancel && cancelRef.current) || confirmRef.current || boxRef.current;
    target?.focus({ preventScroll: true });
    if (inputRef.current?.select && spec.input !== 'select') inputRef.current.select();
    return () => {
      if (before && typeof before.focus === 'function' && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (dismissible) cancel(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && spec.kind !== 'progress') {
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = [...(boxRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const Icon = iconFor(spec);
  const tone = spec.tone === 'limit' ? 'violet' : spec.tone;
  const confirmTone = confirmToneFor(spec);
  const hasDeny = !!spec.deny;
  const hasCancel = !!spec.cancel;
  const longLabels = hasCancel && String(spec.confirm).length + String(spec.cancel).length > 24;
  const actionsClass = hasDeny ? 'aw-actions aw-actions--stack'
    : !hasCancel ? 'aw-actions aw-actions--one'
    : longLabels ? 'aw-actions aw-actions--long' : 'aw-actions';
  const progressValue = spec.kind === 'progress' && Number.isFinite(Number(spec.value)) && spec.value !== null
    ? Math.max(0, Math.min(100, Number(spec.value))) : null;

  const items = Array.isArray(spec.items) ? spec.items : [];

  return (
    <div className="aw-layer" onKeyDown={onKeyDown}>
      <div className="aw-scrim" onMouseDown={() => dismissible && cancel(null)} aria-hidden="true" />
      <div
        ref={boxRef}
        className={`aw-dialog${spec.wide ? ' aw-dialog--wide' : ''}`}
        role={spec.tone === 'danger' || spec.tone === 'warning' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={spec.title ? titleId : undefined}
        aria-describedby={spec.text ? descId : undefined}
        aria-busy={spec.kind === 'progress' ? true : undefined}
        tabIndex={-1}
      >
        <div className="aw-grabber" aria-hidden="true" />
        {Icon && (
          <div className={`aw-icon aw-tone-${tone}`} aria-hidden="true">
            {React.isValidElement(Icon)
              ? Icon
              : <Icon size={24} strokeWidth={2} className={spec.kind === 'progress' && progressValue === null ? 'aw-spin' : undefined} />}
          </div>
        )}
        {spec.title && <h2 id={titleId} className="aw-title">{spec.title}</h2>}
        {spec.text && <p id={descId} className="aw-text">{spec.text}</p>}
        {spec.content && <div className="aw-content">{spec.content}</div>}

        {Array.isArray(spec.facts) && spec.facts.length > 0 && (
          <div className="aw-facts">
            {spec.facts.map((f, i) => (
              <span key={i} className="aw-fact">
                {f.label && <span className="aw-fact-label">{f.label}</span>}
                <b>{f.value}</b>
              </span>
            ))}
          </div>
        )}

        {Array.isArray(spec.steps) && spec.steps.length > 0 && (
          <ol className="aw-steps">
            {spec.steps.map((s, i) => (
              <li key={i}><span className="aw-num">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
        )}

        {items.length > 0 && (
          <ul className="aw-items">
            {items.map((it, i) => (
              <li key={i}>
                <span className="aw-item-dot" aria-hidden="true" />
                <span>
                  {typeof it === 'object' && it !== null && !React.isValidElement(it)
                    ? <>{it.title && <b>{it.title}</b>}{it.title && it.text ? ' — ' : ''}{it.text}</>
                    : it}
                </span>
              </li>
            ))}
          </ul>
        )}
        {spec.footer && <p className="aw-footer">{spec.footer}</p>}

        {spec.details && <pre className="aw-details">{spec.details}</pre>}

        {spec.meter && (
          <div className="aw-meter">
            <div className="aw-meter-row">
              <span>{spec.meter.label}</span>
              <b className={spec.meter.used >= spec.meter.max ? 'aw-over' : undefined}>
                {Number(spec.meter.used).toLocaleString()} / {Number(spec.meter.max).toLocaleString()}
              </b>
            </div>
            <div className="aw-track">
              <div
                className={`aw-fill ${spec.meter.used >= spec.meter.max ? 'aw-fill--over' : ''}`}
                style={{ width: `${spec.meter.max > 0 ? Math.min(100, (spec.meter.used / spec.meter.max) * 100) : 100}%` }}
              />
            </div>
          </div>
        )}

        {spec.kind === 'progress' && progressValue !== null && (
          <div className="aw-meter">
            <div className="aw-meter-row">
              <span>{spec.label || ''}</span>
              <b>{Math.round(progressValue)}%</b>
            </div>
            <div className="aw-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressValue)}>
              <div className="aw-fill" style={{ width: `${progressValue}%` }} />
            </div>
          </div>
        )}

        {isPrompt && (
          <div className="aw-field">
            {spec.label && <label htmlFor={`${uid}-in`}>{spec.label}</label>}
            {spec.input === 'textarea' ? (
              <textarea
                id={`${uid}-in`}
                ref={inputRef}
                className={`aw-input aw-textarea${error ? ' aw-invalid' : ''}`}
                value={value}
                placeholder={spec.placeholder || ''}
                maxLength={spec.maxLength}
                rows={spec.rows || 4}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={!!error}
              />
            ) : spec.input === 'select' ? (
              <select
                id={`${uid}-in`}
                ref={inputRef}
                className={`aw-input aw-select${error ? ' aw-invalid' : ''}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={!!error}
              >
                {spec.placeholder && <option value="" disabled>{spec.placeholder}</option>}
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                id={`${uid}-in`}
                ref={inputRef}
                className={`aw-input${error ? ' aw-invalid' : ''}`}
                type={spec.input === 'number' ? 'number' : spec.input === 'email' ? 'email' : 'text'}
                value={value}
                placeholder={spec.placeholder || ''}
                maxLength={spec.maxLength}
                min={spec.min}
                max={spec.max}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
                aria-invalid={!!error}
              />
            )}
          </div>
        )}

        {spec.typeToConfirm && (
          <div className="aw-field">
            <label htmlFor={`${uid}-ttc`}>
              Type <b className="aw-strong">{spec.typeToConfirm}</b> to confirm
            </label>
            <input
              id={`${uid}-ttc`}
              ref={inputRef}
              className="aw-input aw-input--danger"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {spec.toggle && (
          <label className="aw-row-toggle">
            <span>{spec.toggle.label}</span>
            <input type="checkbox" className="aw-switch" checked={toggle} onChange={(e) => setToggle(e.target.checked)} />
          </label>
        )}

        {spec.check && (
          <label className="aw-row-check">
            <input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} />
            <span>{spec.check.label}</span>
          </label>
        )}

        {error && <p className="aw-error" role="alert">{error}</p>}

        {spec.kind === 'progress' ? (
          spec.background && (
            <div className="aw-actions aw-actions--one">
              <button type="button" className="aw-btn aw-btn--neutral" onClick={() => cancel('background')}>{spec.background}</button>
            </div>
          )
        ) : (
          <div className={actionsClass}>
            {hasDeny ? (
              <>
                <button ref={confirmRef} type="button" className={`aw-btn aw-btn--${confirmTone}`} onClick={submit} disabled={!typeOk || !checkOk}>
                  {spec.confirm}
                </button>
                <button type="button" className="aw-btn aw-btn--plain-danger" onClick={() => cancel('deny')}>{spec.deny}</button>
                {hasCancel && <button ref={cancelRef} type="button" className="aw-btn aw-btn--neutral" onClick={() => cancel(null)}>{spec.cancel}</button>}
              </>
            ) : (
              <>
                {hasCancel && <button ref={cancelRef} type="button" className="aw-btn aw-btn--neutral" onClick={() => cancel(null)}>{spec.cancel}</button>}
                <button ref={confirmRef} type="button" className={`aw-btn aw-btn--${confirmTone}`} onClick={submit} disabled={!typeOk || !checkOk}>
                  {spec.confirm}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── toasts ───────────────────────────── */

const TOAST_ICON = { success: Check, error: OctagonAlert, warning: AlertTriangle, info: Info, loading: Loader2, neutral: Info };
const TOAST_TONE = { success: 'success', error: 'danger', warning: 'warning', info: 'primary', loading: 'primary', neutral: 'neutral' };

function ToastItem({ t }) {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(() => removeToast(t.id), 160);
  };
  const Icon = t.icon === false ? null : (t.icon || TOAST_ICON[t.type] || Info);
  const timed = t.duration > 0 && t.duration !== Infinity;
  return (
    <div
      className={`aw-toast${leaving ? ' aw-toast--out' : ''}`}
      role={t.type === 'error' ? 'alert' : 'status'}
      aria-busy={t.type === 'loading' ? true : undefined}
    >
      <div className="aw-toast-row">
        {Icon && (
          <span className={`aw-toast-icon aw-tone-${TOAST_TONE[t.type] || 'primary'}`} aria-hidden="true">
            {typeof Icon === 'string' || React.isValidElement(Icon)
              ? Icon
              : <Icon size={17} strokeWidth={2.3} className={t.type === 'loading' ? 'aw-spin' : undefined} />}
          </span>
        )}
        <div className="aw-toast-body">
          <span className="aw-toast-title">{t.title}</span>
          {t.description && <span className="aw-toast-desc">{t.description}</span>}
        </div>
        {t.action && (
          <button
            type="button"
            className="aw-toast-btn"
            onClick={() => { try { t.action.onClick?.(); } finally { close(); } }}
          >
            {t.action.label}
          </button>
        )}
        {t.type !== 'loading' && (
          <button type="button" className="aw-toast-x" aria-label="Close" onClick={close}>
            <X size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {timed && (
        <div className="aw-bar" aria-hidden="true">
          <span
            key={t.updatedAt}
            className={`aw-bar-fill aw-bg-${TOAST_TONE[t.type] || 'primary'}`}
            style={{ animationDuration: `${t.duration}ms` }}
            onAnimationEnd={close}
          />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── host ───────────────────────────── */

export default function AlertHost() {
  const { dialogs, toasts } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const top = dialogs[0];

  // Lock page scroll while a dialog is up.
  useEffect(() => {
    if (!top) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [top]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {top && <Dialog key={top.id} id={top.id} spec={top.spec} />}
      <div className="aw-toasts" aria-live="polite">
        {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
      </div>
    </>,
    document.body,
  );
}
