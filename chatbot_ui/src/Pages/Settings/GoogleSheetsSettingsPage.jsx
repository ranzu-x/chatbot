import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { googleSheetsAPI } from '../../services/api';
import Swal from 'sweetalert2';
import { Sheet, CheckCircle2, AlertCircle, Link2, Unlink } from 'lucide-react';

/**
 * Connects ONE Google account per agency, used as an export destination for
 * User Input Flow responses (picked per form on its Start node).
 *
 * The connection is a normal OAuth "offline" grant: we hold a refresh token so
 * a completed form can be written to the sheet at any time later, not just
 * while someone is sitting in front of the browser.
 */
export default function GoogleSheetsSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await googleSheetsAPI.getStatus();
      setStatus(res.data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Our OAuth callback redirects back here with ?connected=1|0
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (!connected) return;
    if (connected === '1') {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Google account connected', showConfirmButton: false, timer: 2600 });
    } else {
      Swal.fire({
        icon: 'error',
        title: "Couldn't connect",
        text: searchParams.get('reason') || 'Google did not complete the connection.',
      });
    }
    searchParams.delete('connected');
    searchParams.delete('reason');
    searchParams.delete('email');
    setSearchParams(searchParams, { replace: true });
    load();
  }, [searchParams, setSearchParams, load]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await googleSheetsAPI.getAuthUrl();
      if (res.data?.url) {
        window.location.href = res.data.url; // hand off to Google's consent screen
      }
    } catch (err) {
      Swal.fire({
        icon: 'warning',
        title: 'Not configured yet',
        text: err?.response?.data?.message || 'Google Sheets is not set up on this server.',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await Swal.fire({
      title: 'Disconnect Google?',
      text: 'Forms exporting to a Google Sheet will stop writing new rows until you reconnect.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Disconnect',
    });
    if (!ok.isConfirmed) return;
    await googleSheetsAPI.disconnect();
    load();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Disconnected', showConfirmButton: false, timer: 2000 });
  };

  return (
    <AppLayout>
      <div style={{ padding: '24px 28px', maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(16,185,129,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sheet size={19} color="#059669" />
          </span>
          Google Sheets
        </h1>
        <p style={{ margin: '8px 0 22px 44px', fontSize: '0.86rem', color: '#64748b', lineHeight: 1.55 }}>
          Connect a Google account so your User Input Flows can append every completed submission
          straight into a spreadsheet. You pick which sheet and tab per form, on its Start node.
        </p>

        {/* Connection card */}
        <div style={{ border: '1px solid #e4e4f0', borderRadius: 14, padding: 20, background: '#fff' }}>
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Checking connection...</div>
          ) : status?.connected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <CheckCircle2 size={30} color="#16a34a" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Connected</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                  {status.email || 'Google account linked'}
                </div>
              </div>
              <button type="button" onClick={handleDisconnect} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9,
                border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
              }}>
                <Unlink size={14} /> Disconnect
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <AlertCircle size={30} color="#f59e0b" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Not connected</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                  Link a Google account to enable spreadsheet export.
                </div>
              </div>
              <button type="button" onClick={handleConnect} disabled={connecting} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff',
                fontSize: '0.85rem', fontWeight: 700, cursor: connecting ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(16,185,129,0.28)',
              }}>
                <Link2 size={15} /> {connecting ? 'Redirecting...' : 'Connect Google Account'}
              </button>
            </div>
          )}
        </div>

        {/* Server setup notice — this integration needs one-time Google Cloud setup */}
        <div style={{
          marginTop: 18, border: '1px dashed #cbd5e1', borderRadius: 12, padding: 16,
          background: '#f8fafc', fontSize: '0.82rem', color: '#475569', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 800, color: '#334155', marginBottom: 8 }}>One-time server setup</div>
          Before the button above can work, a Google Cloud OAuth client has to exist for this server:
          <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
            <li>Create a project in Google Cloud Console and enable the <strong>Google Sheets API</strong> and <strong>Google Drive API</strong>.</li>
            <li>Configure the OAuth consent screen (add yourself as a test user while it stays in Testing mode).</li>
            <li>Create an <strong>OAuth Client ID</strong> of type <em>Web application</em>, with this authorized redirect URI:
              <code style={{
                display: 'block', marginTop: 6, padding: '7px 10px', borderRadius: 7,
                background: '#0f172a', color: '#e2e8f0', fontSize: '0.76rem', wordBreak: 'break-all',
              }}>
                {`${window.location.origin.replace(/:\d+$/, ':5000')}/api/v1/integrations/google-sheets/callback`}
              </code>
            </li>
            <li>Put the Client ID and Secret into the API's <code>.env</code> as <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_REDIRECT_URI</code>, then restart the server.</li>
          </ol>
        </div>
      </div>
    </AppLayout>
  );
}
