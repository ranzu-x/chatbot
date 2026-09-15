import { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { getPlatform, PLATFORM_IMPORT_EXPORT, parseCSV, csvRowsToObjects } from './subscriberUtils';

/** Maps a parsed CSV object row (arbitrary header spelling) into the shape
 * POST /contacts/import expects for the given platform. */
function mapRow(obj, platform) {
  const pick = (...keys) => keys.map((k) => obj[k]).find((v) => v !== undefined && v !== '') || '';
  const name = pick('name', 'fullname', 'subscribername');
  const email = pick('email', 'emailaddress');
  if (platform === 'WHATSAPP') {
    return { name, email, phone: pick('phone', 'phonenumber', 'externalid', 'whatsappnumber') };
  }
  return { name, email, chatId: pick('chatid', 'telegramchatid', 'externalid', 'id') };
}

export default function ImportModal({ platform, contactAPI, onClose, onImported, showToast }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const pInfo = getPlatform(platform);
  const rules = PLATFORM_IMPORT_EXPORT[platform] || {};

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(String(e.target.result || ''));
      const objects = csvRowsToObjects(parsed);
      const mapped = objects.map((o) => mapRow(o, platform)).filter((r) => r.phone || r.chatId);
      setRows(mapped);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await contactAPI.import(platform, rows);
      setResult(res.data);
      if (res.data.created || res.data.updated) {
        onImported();
        showToast(`Imported: ${res.data.created} created, ${res.data.updated} updated${res.data.skipped ? `, ${res.data.skipped} skipped` : ''}`);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: 520, maxWidth: '94vw', background: 'var(--bg-surface)', borderRadius: 14, padding: 22, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <pInfo.icon size={17} /> Import {pInfo.label} Subscribers
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
          CSV with a header row. Required column: <strong>{rules.importLabel}</strong>. Optional: Name, Email.
        </p>

        {!result && (
          <>
            <label
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '28px 16px', borderRadius: 10, border: '1.5px dashed var(--border-light)', background: 'var(--bg-base)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <Upload size={22} color="var(--text-muted)" />
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {fileName || 'Click to choose a CSV file'}
              </span>
              {rows.length > 0 && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FileText size={13} /> {rows.length} row(s) ready to import
                </span>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button type="button" disabled={rows.length === 0 || importing} onClick={handleImport} className="btn btn-primary">
                {importing ? 'Importing...' : `Import ${rows.length || ''} Subscriber(s)`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{result.created}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Created</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{result.updated}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Updated</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{result.skipped}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Skipped</div>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', gap: 6, padding: '3px 0' }}>
                    <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> Row {e.row}: {e.reason}
                  </div>
                ))}
              </div>
            )}
            {(!result.errors || result.errors.length === 0) && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Import complete with no issues.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" onClick={onClose} className="btn btn-primary">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
