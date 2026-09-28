import { useRef, useState } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2, FileJson } from 'lucide-react';
import { flowAPI } from '../../services/api';
import { readFlowFile } from '../../utils/flowFile';

/**
 * Bot Manager → Keyword Based Bots → Import. The file is pre-checked in the
 * browser, then the server validates it again, creates a NEW flow on the chosen
 * bot account (switched off) and reports what it couldn't link.
 */
export default function ImportFlowDialog({ integrations, defaultIntegrationId, onClose, onImported, onOpenBuilder }) {
  const inputRef = useRef(null);
  const usable = (integrations || []).filter((i) => String(i.platform || '').toUpperCase() !== 'TIKTOK');
  const [picked, setPicked] = useState(null); // { file, summary }
  const [fileError, setFileError] = useState('');
  const [integrationId, setIntegrationId] = useState(
    usable.some((i) => String(i.id) === String(defaultIntegrationId)) ? String(defaultIntegrationId) : String(usable[0]?.id || '')
  );
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const choose = async (fileObj) => {
    setFileError('');
    setPicked(null);
    setError('');
    try {
      const read = await readFlowFile(fileObj);
      setPicked(read);
      setName(read.summary.name);
    } catch (err) {
      setFileError(err.message);
    }
  };

  const submit = async () => {
    if (!picked || !integrationId) return;
    setBusy(true);
    setError('');
    try {
      const res = await flowAPI.importFile({ file: picked.file, integrationId: Number(integrationId), name: name.trim() || undefined });
      setResult(res.data);
      onImported?.(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const target = usable.find((i) => String(i.id) === integrationId);
  const platformMismatch = picked && target && picked.summary.platform && picked.summary.platform !== String(target.platform || '').toUpperCase();

  return (
    <div role="dialog" aria-modal="true" aria-label="Import bot" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 540, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-surface, #fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Import a bot</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              From a <code>.bot.json</code> file exported from this app. A new bot is created — nothing existing is changed.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {result ? (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#047857', fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>
              <CheckCircle2 size={18} /> {result.flow?.name} was imported
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              It&apos;s switched <b>off</b>, so it won&apos;t answer anyone until you review it and turn it on.
            </p>
            {(result.warnings || []).length > 0 && (
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: '0.78rem', color: '#92400e', lineHeight: 1.5 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenBuilder?.(result.flowId)}>Open in builder</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => inputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: '1.5px dashed var(--border)', borderRadius: 10, background: 'var(--bg-base)', cursor: 'pointer', textAlign: 'left' }}>
              {picked ? <FileJson size={20} color="#2563eb" /> : <Upload size={20} color="var(--text-muted)" />}
              <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                {picked
                  ? <><b>{picked.summary.name}</b> · {picked.summary.platform || 'any channel'} · {picked.summary.elements} elements{picked.summary.forms ? ` · ${picked.summary.forms} form(s)` : ''}</>
                  : 'Choose an export file…'}
              </span>
            </button>
            {fileError && <div style={{ fontSize: '0.78rem', color: '#b91c1c' }}>{fileError}</div>}

            {usable.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#b45309' }}>Connect a bot account first — a bot is always imported into one.</div>
            ) : (
              <>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Import into bot account
                  <select className="form-input" value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} style={{ width: '100%', height: 34, marginTop: 5 }}>
                    {usable.map((i) => (
                      <option key={i.id} value={i.id}>{i.name || i.fb_page_name || i.ig_username || `Bot #${i.id}`} ({i.platform})</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Name of the new bot
                  <input className="form-input" value={name} maxLength={180} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 34, marginTop: 5 }} />
                </label>
              </>
            )}
            {platformMismatch && (
              <div style={{ fontSize: '0.76rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 6 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                This bot was made for {picked.summary.platform}. Some elements may not work on {target.platform}.
              </div>
            )}
            {error && <div style={{ fontSize: '0.8rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!picked || !integrationId || busy} onClick={submit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />} {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
