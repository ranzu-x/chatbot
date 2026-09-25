import { useState, useRef, useMemo, useEffect } from 'react';
import { Link } from 'react-router';
import {
  X, Upload, FileText, CheckCircle2, AlertCircle, Sheet, Bot, Tag, Info, Download,
  UserPlus, UserCheck, Copy, AlertTriangle, Ban, Loader2, FileSpreadsheet,
} from 'lucide-react';
import { integrationAPI, labelAPI, customFieldAPI, googleSheetsAPI } from '../../services/api';
import {
  getPlatform, PLATFORM_IMPORT_EXPORT, sampleImportCsv, downloadBlob,
  parseImportText, tableFromSheetValues, prepareTable, guessMapping, buildImport, columnLabel, labelNameFromFile,
} from './subscriberUtils';

// Subscriber import (CSV or Google Sheet → one bot account). The client parses
// the file and applies the column mapping; POST /contacts/import does the rest:
//   - a number that's already a subscriber is SKIPPED — the person isn't
//     changed; only the file's custom-field values are written onto them
//   - the same number twice in the file: only the first row is imported
//   - numbers are normalised (+, spaces, dashes, leading 00) before matching
// The modal's accent is the app's default button colour (var(--primary)).

// Mirrors the server's cap in POST /contacts/import.
const MAX_ROWS = 50000;

const fieldStyle = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.82rem',
};
const labelStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };
const hintStyle = { fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.5 };
const errorBox = { marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#b91c1c', fontSize: '0.8rem', display: 'flex', gap: 8, alignItems: 'flex-start' };

const errMsg = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

// What each column is imported as, encoded for a <select>.
const encode = (m) => (m.kind === 'field' ? `field:${m.fieldId}` : m.kind);
const decode = (v) => (v.startsWith('field:') ? { kind: 'field', fieldId: Number(v.slice(6)) } : { kind: v });

function Step({ n, title, subtitle, children, done }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.74rem', fontWeight: 700,
          background: done ? 'var(--primary)' : 'var(--bg-hover)', color: done ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {done ? <CheckCircle2 size={14} /> : n}
      </span>
      <div style={{ minWidth: 0 }}>
        <h4 style={{ margin: '3px 0 2px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>
        {subtitle && <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

function ResultStat({ icon: Icon, value, label, tone }) {
  const IconCmp = Icon;
  return (
    <div style={{ padding: '14px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: `${tone}14`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <IconCmp size={17} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{Number(value).toLocaleString()}</span>
        <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{label}</span>
      </span>
    </div>
  );
}

export default function ImportModal({ platform, contactAPI, onClose, onImported, showToast }) {
  const pInfo = getPlatform(platform);
  const rules = PLATFORM_IMPORT_EXPORT[platform] || {};
  const idLabel = rules.importLabel || 'Phone Number';
  const isWA = platform === 'WHATSAPP';

  // Destination
  const [bots, setBots] = useState(null); // null = loading
  const [labels, setLabels] = useState([]);
  const [fields, setFields] = useState([]);
  const [botId, setBotId] = useState('');
  const [labelId, setLabelId] = useState(''); // '' = create/reuse a label by name
  const [labelName, setLabelName] = useState('');

  // Source
  const [source, setSource] = useState('csv'); // 'csv' | 'sheet'
  const [table, setTable] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [defaultLabel, setDefaultLabel] = useState(''); // file/sheet name — the label used when none is chosen
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [override, setOverride] = useState(null); // the user's mapping edits; null = use the guess
  const fileRef = useRef(null);

  // Google Sheet source
  const [sheet, setSheet] = useState({ state: 'idle', spreadsheets: [], tabs: [], spreadsheetId: '', tab: '', error: '', loading: false });

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;
    integrationAPI.getAll().then((r) => {
      if (!alive) return;
      const list = (r.data.integrations || []).filter((i) => i.platform === platform && i.is_active !== 0);
      setBots(list);
      if (list.length === 1) setBotId(String(list[0].id));
    }).catch(() => alive && setBots([]));
    labelAPI.getAll().then((r) => alive && setLabels(r.data.labels || [])).catch(() => {});
    customFieldAPI.getAll().then((r) => alive && setFields(r.data.fields || [])).catch(() => {});
    return () => { alive = false; };
  }, [platform]);

  // Esc closes — except while an import is running.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !importing) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [importing, onClose]);

  const prepared = useMemo(() => prepareTable(table, platform), [table, platform]);
  const guessed = useMemo(() => guessMapping(prepared, platform, fields), [prepared, platform, fields]);
  const mapping = override || guessed;
  const built = useMemo(() => (table ? buildImport(prepared, mapping, platform) : null), [table, prepared, mapping, platform]);
  const tooMany = prepared.dataRows.length > MAX_ROWS;

  const bot = (bots || []).find((b) => String(b.id) === botId);
  const botName = (b) => [b.name, b.wa_display_phone].filter(Boolean).join(' · ') || `Account #${b.id}`;
  const effectiveLabelName = labelName.trim() || defaultLabel;
  const chosenLabel = labels.find((l) => String(l.id) === labelId);
  const finalLabelName = chosenLabel ? chosenLabel.name : effectiveLabelName;
  const canImport = Boolean(bot && built && !built.problem && !tooMany && finalLabelName && !importing);

  const loadTable = (rows, name, label) => {
    setResult(null);
    setOverride(null);
    setSourceName(name);
    setDefaultLabel(label);
    setTable(rows);
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileError('');
    setTable(null);
    setSourceName(file.name);
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name)) {
      setFileError("That's an Excel spreadsheet. In Excel choose File → Save As → CSV (Comma delimited), then upload the CSV file — or import straight from Google Sheets.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseImportText(String(e.target.result || ''));
      if (rows.length === 0) { setFileError('The file is empty.'); return; }
      loadTable(rows, file.name, labelNameFromFile(file.name));
    };
    reader.onerror = () => setFileError("Couldn't read that file. Try saving it again as a CSV.");
    reader.readAsText(file);
  };

  // ── Google Sheets ──
  const openSheetSource = async () => {
    setSource('sheet');
    if (sheet.state !== 'idle') return;
    setSheet((s) => ({ ...s, state: 'loading' }));
    try {
      const st = await googleSheetsAPI.getStatus();
      if (!st.data.connected) { setSheet((s) => ({ ...s, state: 'disconnected' })); return; }
      const list = await googleSheetsAPI.listSpreadsheets();
      setSheet((s) => ({ ...s, state: 'ready', spreadsheets: list.data.spreadsheets || [] }));
    } catch (err) {
      setSheet((s) => ({ ...s, state: 'error', error: errMsg(err, "Couldn't reach Google Sheets") }));
    }
  };
  const pickSpreadsheet = async (id) => {
    setSheet((s) => ({ ...s, spreadsheetId: id, tabs: [], tab: '', error: '' }));
    if (!id) return;
    try {
      const r = await googleSheetsAPI.listTabs(id);
      const tabs = r.data.tabs || [];
      setSheet((s) => ({ ...s, tabs, tab: tabs[0]?.title || '' }));
    } catch (err) {
      setSheet((s) => ({ ...s, error: errMsg(err, "Couldn't read that spreadsheet's tabs") }));
    }
  };
  const loadSheet = async () => {
    setSheet((s) => ({ ...s, loading: true, error: '' }));
    try {
      const r = await googleSheetsAPI.getValues(sheet.spreadsheetId, sheet.tab);
      const rows = tableFromSheetValues(r.data.values);
      if (rows.length === 0) { setSheet((s) => ({ ...s, error: 'That tab is empty.' })); return; }
      const file = sheet.spreadsheets.find((s) => s.id === sheet.spreadsheetId);
      const name = sheet.tabs.length > 1 ? `${file?.name || 'Google Sheet'} - ${sheet.tab}` : (file?.name || 'Google Sheet');
      loadTable(rows, name, name);
    } catch (err) {
      setSheet((s) => ({ ...s, error: errMsg(err, "Couldn't read that sheet") }));
    } finally {
      setSheet((s) => ({ ...s, loading: false }));
    }
  };

  // ── Mapping ──
  const setColumn = (col, value) => {
    const next = mapping.map((m) => ({ ...m }));
    const chosen = decode(value);
    // id / name / email / a given custom field can each come from one column only.
    const exclusive = chosen.kind !== 'new' && chosen.kind !== 'skip';
    if (exclusive) {
      next.forEach((m, i) => {
        if (i !== col && encode(m) === value) next[i] = { kind: 'skip' };
      });
    }
    next[col] = chosen;
    setOverride(next);
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    const invalidBeforeSending = built.skipped.length;
    try {
      const res = await contactAPI.import({
        integrationId: Number(botId),
        rows: built.rows,
        customFields: built.customFields,
        ...(chosenLabel ? { labelId: chosenLabel.id } : { labelName: finalLabelName }),
      });
      const data = res.data;
      setResult({ ...data, invalid: (data.invalid || 0) + invalidBeforeSending, clientSkipped: built.skipped });
      if (data.created || data.existingFieldsUpdated) onImported();
      showToast(data.created ? `Imported ${data.created.toLocaleString()} new subscriber(s)` : 'Import finished — no new subscribers');
    } catch (err) {
      showToast(errMsg(err, 'Import failed'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const downloadSample = () => downloadBlob(new Blob([sampleImportCsv(platform)], { type: 'text/csv' }), `${platform.toLowerCase()}-subscribers-sample.csv`);
  const tabBtn = (id, icon, text, onClick) => {
    const active = source === id;
    return (
      <button
        type="button" onClick={onClick} role="tab" aria-selected={active}
        style={{
          flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer',
          fontSize: '0.8rem', fontWeight: 600, borderRadius: 7, border: 'none',
          background: active ? 'var(--bg-surface)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
          boxShadow: active ? 'var(--shadow-sm), 0 0 0 1px var(--border)' : 'none',
        }}
      >{icon}{text}</button>
    );
  };

  const usedFieldNames = built ? built.customFields.map((d) => (d.name ? `${d.name} (new)` : (fields.find((f) => f.id === d.fieldId)?.name || 'field'))) : [];
  const skipped = built?.skipped || [];
  const ready = built && !built.problem && !tooMany;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}
      onClick={() => !importing && onClose()}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="import-modal-title"
        style={{ width: 760, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.2)', border: '1px solid var(--border)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileSpreadsheet size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="import-modal-title" style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
              Import {pInfo.label} subscribers
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '3px 0 0' }}>
              {result ? 'Here’s what happened with your file.' : 'Add subscribers from a CSV file or a Google Sheet to one of your bot accounts.'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: importing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </header>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {!result && (
            <>
              <Step n={1} title="Where should they go?" subtitle="Subscribers are added to one bot account — its flows, sequences and broadcasts are the ones that can reach them." done={Boolean(bot && finalLabelName)}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle} htmlFor="import-bot"><Bot size={13} /> Bot account <span style={{ color: '#dc2626' }}>*</span></label>
                    <select id="import-bot" value={botId} onChange={(e) => setBotId(e.target.value)} style={fieldStyle} disabled={!bots || bots.length === 0}>
                      <option value="">{bots === null ? 'Loading…' : bots.length === 0 ? `No ${pInfo.label} accounts connected` : 'Select a bot account…'}</option>
                      {(bots || []).map((b) => <option key={b.id} value={b.id}>{botName(b)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="import-label"><Tag size={13} /> Label</label>
                    <select id="import-label" value={labelId} onChange={(e) => setLabelId(e.target.value)} style={fieldStyle}>
                      <option value="">New label (named below)</option>
                      {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {!labelId && (
                      <input
                        value={labelName} onChange={(e) => setLabelName(e.target.value)} maxLength={100}
                        aria-label="New label name"
                        placeholder={effectiveLabelName || 'Defaults to the file name'}
                        style={{ ...fieldStyle, marginTop: 6 }}
                      />
                    )}
                    <div style={hintStyle}>
                      {labelId ? 'Added to every newly imported subscriber.' : `Left empty, the ${source === 'sheet' ? 'sheet' : 'file'} name is used.`}
                    </div>
                  </div>
                </div>
              </Step>

              <Step
                n={2}
                title="Choose your file"
                subtitle={(
                  <>
                    One subscriber per row, with a {idLabel.toLowerCase()} column.{' '}
                    <button type="button" onClick={downloadSample} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', fontSize: 'inherit', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Download size={12} /> Download a sample
                    </button>
                  </>
                )}
                done={Boolean(table)}
              >
                <div role="tablist" aria-label="Import source" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'var(--bg-hover)', marginBottom: 12 }}>
                  {tabBtn('csv', <Upload size={14} />, 'CSV file', () => setSource('csv'))}
                  {tabBtn('sheet', <Sheet size={14} />, 'Google Sheet', openSheetSource)}
                </div>

                {source === 'csv' && (
                  <label
                    onDragOver={(e) => { e.preventDefault(); if (bot) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (bot) handleFile(e.dataTransfer.files?.[0]); }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '26px 16px', borderRadius: 12, textAlign: 'center',
                      border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border-light)'}`,
                      background: dragOver ? 'var(--primary-soft)' : 'var(--bg-base)',
                      cursor: bot ? 'pointer' : 'not-allowed', opacity: bot ? 1 : 0.6, transition: 'border-color .15s, background .15s',
                    }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: table ? 'var(--primary)' : 'var(--text-tertiary)' }}>
                      {table ? <FileText size={18} /> : <Upload size={18} />}
                    </span>
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {!bot ? 'Select a bot account first' : table && sourceName ? sourceName : 'Drop a CSV file here, or click to browse'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                      {table ? `${prepared.dataRows.length.toLocaleString()} row(s) · click to choose another file` : `CSV, up to ${MAX_ROWS.toLocaleString()} rows`}
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      disabled={!bot}
                      accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
                      onChange={(e) => {
                        handleFile(e.target.files?.[0]);
                        // Reset so choosing the same file again (after fixing it) still fires onChange.
                        e.target.value = '';
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}

                {source === 'sheet' && (
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                    {(sheet.state === 'idle' || sheet.state === 'loading') && <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="import-spin" /> Connecting to Google Sheets…</div>}
                    {sheet.state === 'disconnected' && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        No Google account is connected yet. <Link to="/settings/google-sheets" style={{ color: 'var(--primary)', fontWeight: 700 }}>Connect Google Sheets</Link> in Settings, then come back.
                      </div>
                    )}
                    {sheet.state === 'error' && <div style={{ fontSize: '0.82rem', color: '#b91c1c' }}>{sheet.error}</div>}
                    {sheet.state === 'ready' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end' }}>
                        <div>
                          <label style={labelStyle} htmlFor="import-sheet">Spreadsheet</label>
                          <select id="import-sheet" value={sheet.spreadsheetId} onChange={(e) => pickSpreadsheet(e.target.value)} style={fieldStyle}>
                            <option value="">{sheet.spreadsheets.length ? 'Select a spreadsheet…' : 'No spreadsheets found'}</option>
                            {sheet.spreadsheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle} htmlFor="import-tab">Tab</label>
                          <select id="import-tab" value={sheet.tab} onChange={(e) => setSheet((s) => ({ ...s, tab: e.target.value }))} style={fieldStyle} disabled={sheet.tabs.length === 0}>
                            {sheet.tabs.length === 0 && <option value="">—</option>}
                            {sheet.tabs.map((t) => <option key={t.id} value={t.title}>{t.title}</option>)}
                          </select>
                        </div>
                        <button type="button" className="btn btn-secondary" disabled={!bot || !sheet.spreadsheetId || !sheet.tab || sheet.loading} onClick={loadSheet} style={{ height: 36 }}>
                          {sheet.loading ? 'Loading…' : bot ? 'Load sheet' : 'Select a bot first'}
                        </button>
                      </div>
                    )}
                    {sheet.state === 'ready' && sheet.error && <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: 8 }}>{sheet.error}</div>}
                    {sheet.state === 'ready' && table && sourceName && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FileText size={13} /> Loaded “{sourceName}” · {prepared.dataRows.length.toLocaleString()} row(s)
                      </div>
                    )}
                  </div>
                )}

                {fileError && (
                  <div style={errorBox} role="alert"><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>{fileError}</span></div>
                )}

                {/* How duplicates + custom fields are handled */}
                <div role="note" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  <Info size={16} style={{ color: 'var(--primary)', marginTop: 1 }} />
                  <div>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Custom Fields:</strong> You can add additional columns to your CSV file to create or update custom fields for each subscriber. The column name will be used as the custom field name, and the corresponding cell value will be saved as that subscriber&apos;s value. If the subscriber already exists, the custom field will be updated when the field already exists or created when it is new. These custom fields can also be used later for targeted broadcasts.
                    </p>
                    <p style={{ margin: '8px 0 0' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Existing subscribers:</strong> {isWA ? 'A number' : 'A chat ID'} that&apos;s already a subscriber isn&apos;t imported again — their name, number, labels and bot account stay exactly as they are. {isWA ? 'Numbers are matched however they’re written (+880…, 880…, spaces or dashes).' : ''} If the same {isWA ? 'number' : 'chat ID'} appears twice in the file, only the first row is used.
                    </p>
                  </div>
                </div>
              </Step>

              {table && (
                <Step n={3} title="Match your columns" subtitle={`Pick the ${idLabel} and Name columns. Every other column becomes a custom field — choose “Don’t import” to leave one out.`} done={Boolean(ready)}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 220px', gap: 10, padding: '8px 12px', background: 'var(--bg-base)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      <span>Column</span><span>Sample values</span><span>Import as</span>
                    </div>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                      {mapping.map((m, c) => {
                        const samples = prepared.dataRows.slice(0, 40).map((r) => String(r[c] ?? '').trim()).filter(Boolean).slice(0, 3);
                        const skippedCol = m.kind === 'skip';
                        return (
                          <div key={c} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 220px', gap: 10, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border)', opacity: skippedCol ? 0.6 : 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={columnLabel(prepared, c)}>
                              {columnLabel(prepared, c)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={samples.join(' · ')}>
                              {samples.join(' · ') || '(empty)'}
                            </div>
                            <select aria-label={`Import column ${columnLabel(prepared, c)} as`} value={encode(m)} onChange={(e) => setColumn(c, e.target.value)} style={{ ...fieldStyle, height: 32, fontSize: '0.78rem' }}>
                              <option value="id">{idLabel}</option>
                              <option value="name">Name</option>
                              <option value="email">Email</option>
                              <option value="new">New custom field “{columnLabel(prepared, c)}”</option>
                              {fields.length > 0 && (
                                <optgroup label="Existing custom field">
                                  {fields.map((f) => <option key={f.id} value={`field:${f.id}`}>{f.name}</option>)}
                                </optgroup>
                              )}
                              <option value="skip">Don’t import</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {built?.problem && (
                    <div style={errorBox} role="alert"><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>{built.problem}</span></div>
                  )}
                  {tooMany && (
                    <div style={errorBox} role="alert">
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>This file has {prepared.dataRows.length.toLocaleString()} rows. Imports are limited to {MAX_ROWS.toLocaleString()} at a time — split it and import in parts.</span>
                    </div>
                  )}

                  {ready && (
                    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--primary-soft)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>{built.rows.length.toLocaleString()}</strong> row(s) ready
                        {bot && <> for <strong style={{ color: 'var(--text-primary)' }}>{botName(bot)}</strong></>}
                        {finalLabelName && <>, labelled <strong style={{ color: 'var(--text-primary)' }}>{finalLabelName}</strong></>}.
                        {' '}Existing subscribers and repeats are skipped when you import.
                      </div>
                      {usedFieldNames.length > 0 && <div>Custom fields: {usedFieldNames.join(', ')}.</div>}
                      {skipped.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                          <summary style={{ cursor: 'pointer', color: '#b45309', fontWeight: 600 }}>{skipped.length.toLocaleString()} invalid row(s) won’t be imported</summary>
                          <div style={{ maxHeight: 96, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', marginTop: 6, background: 'var(--bg-surface)' }}>
                            {skipped.slice(0, 50).map((s, i) => <div key={i}>Row {s.row}: {s.reason}</div>)}
                            {skipped.length > 50 && <div>…and {skipped.length - 50} more</div>}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </Step>
              )}
            </>
          )}

          {/* ── Result ── */}
          {result && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={20} />
                </span>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Import completed</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{result.bot?.name ? `Bot account: ${result.bot.name}` : ''}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <ResultStat icon={UserPlus} value={result.created || 0} label="Successfully imported" tone="#059669" />
                {result.existing > 0 && <ResultStat icon={UserCheck} value={result.existing} label="Skipped — already exists" tone="#2563eb" />}
                {result.duplicateInFile > 0 && <ResultStat icon={Copy} value={result.duplicateInFile} label="Skipped — duplicate in CSV" tone="#8b5cf6" />}
                {result.invalid > 0 && <ResultStat icon={AlertTriangle} value={result.invalid} label="Invalid rows" tone="#b45309" />}
                {result.limitSkipped > 0 && <ResultStat icon={Ban} value={result.limitSkipped} label="Not imported — plan limit reached" tone="#dc2626" />}
              </div>

              <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {result.created > 0 && result.label && (
                  <li>Label <strong>{result.label.name}</strong>{result.label.created ? ' was created and' : ''} added to the {result.created.toLocaleString()} new subscriber(s).</li>
                )}
                {result.existingFieldsUpdated > 0 && (
                  <li>Custom fields were filled in for {result.existingFieldsUpdated.toLocaleString()} existing subscriber(s) — nothing else about them changed.</li>
                )}
                {result.customFieldsCreated > 0 && <li>{result.customFieldsCreated} new custom field(s) created.</li>}
              </ul>

              {(result.errors?.length > 0 || result.clientSkipped?.length > 0) && (
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Row details</summary>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                    {[...(result.clientSkipped || []), ...(result.errors || [])].slice(0, 100).map((e, i) => (
                      <div key={i} style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', gap: 6, padding: '3px 0' }}>
                        <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> Row {e.row}: {e.reason}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <footer style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          {importing && (
            <div style={{ marginBottom: 12 }} aria-live="polite">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                <Loader2 size={13} className="import-spin" /> Importing {built?.rows.length.toLocaleString()} row(s) — large files can take a minute. Please keep this window open.
              </div>
              <div style={{ height: 4, borderRadius: 4, background: 'var(--bg-hover)', overflow: 'hidden', position: 'relative' }}>
                <div className="import-progress-bar" style={{ position: 'absolute', top: 0, bottom: 0, width: '35%', borderRadius: 4, background: 'var(--primary)' }} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            {result ? (
              <button type="button" onClick={onClose} className="btn btn-primary">Done</button>
            ) : (
              <>
                <button type="button" onClick={onClose} disabled={importing} className="btn btn-secondary">Cancel</button>
                <button type="button" disabled={!canImport} onClick={handleImport} className="btn btn-primary">
                  {importing ? <><Loader2 size={14} className="import-spin" /> Importing…</> : (ready ? `Import ${built.rows.length.toLocaleString()} subscriber(s)` : 'Import subscribers')}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
      <style>{`
        @keyframes import-progress { from { left: -35%; } to { left: 100%; } }
        .import-progress-bar { animation: import-progress 1.2s ease-in-out infinite; }
        .import-spin { animation: spin 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .import-progress-bar { animation: none; width: 100% !important; opacity: .5; } .import-spin { animation: none; } }
      `}</style>
    </div>
  );
}
