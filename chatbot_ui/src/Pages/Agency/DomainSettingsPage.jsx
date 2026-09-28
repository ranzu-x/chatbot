import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { domainAPI, assetUrl } from '../../services/api';
import { useBranding } from '../../Provider/BrandingContext';
import { notify, showAlert } from '../../utils/alerts';
import {
  Globe, CheckCircle2, AlertTriangle, Clock, Copy, ExternalLink, Save, RefreshCw, Palette, UserPlus, Info,
  Upload, Trash2, Loader2, Cloud, Image as ImageIcon, ShieldCheck,
} from 'lucide-react';

/**
 * Custom Domain & branding (routes/domains.js).
 *  - Reseller: a platform subdomain (live instantly), its own domain (added to
 *    Cloudflare automatically — shows the DNS record to add, then goes live by
 *    itself), logos + favicon + name, and the sign-up link for its customers.
 *  - Super Admin: the main domain's branding + the Cloudflare setup check.
 */

const spin = { animation: 'spin 0.8s linear infinite' };
const card = { background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '22px 24px' };
const h3 = { fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 };
const sub = { fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.55 };
const label = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 };
const hint = { fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 };

const STATUS = {
  ACTIVE: { text: 'Live with SSL', badge: 'badge-success', Icon: CheckCircle2 },
  PENDING: { text: 'Waiting for DNS', badge: 'badge-warning', Icon: Clock },
  FAILED: { text: 'Problem', badge: 'badge-danger', Icon: AlertTriangle },
  NONE: { text: 'Not set', badge: 'badge-muted', Icon: Globe },
};

const ASSETS = [
  { kind: 'logo', key: 'logoUrl', title: 'Logo', desc: 'Wide logo for the sign-in page and the sidebar. PNG or WEBP with a transparent background, about 360 × 80 px.', box: { width: 180, height: 48 } },
  { kind: 'logoIcon', key: 'logoIconUrl', title: 'Icon logo', desc: 'Square mark for the collapsed sidebar and small screens. PNG, 128 × 128 px or larger.', box: { width: 48, height: 48 } },
  { kind: 'favicon', key: 'faviconUrl', title: 'Favicon', desc: 'The browser-tab icon. PNG (64 × 64 px) or ICO.', box: { width: 32, height: 32 } },
];

function copy(text) {
  navigator.clipboard.writeText(text).then(() => notify.success('Copied')).catch(() => {});
}

function AssetTile({ asset, url, onUploaded, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await domainAPI.uploadBrandingAsset(asset.kind, file);
      onUploaded(asset.key, res.data.url);
      notify.success(`${asset.title} uploaded`);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await domainAPI.removeBrandingAsset(asset.kind);
      onRemoved(asset.key);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not remove it');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{asset.title}</div>
      <div style={{ height: 70, borderRadius: 10, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url
          ? <img src={assetUrl(url)} alt={asset.title} style={{ maxWidth: asset.box.width, maxHeight: asset.box.height, objectFit: 'contain' }} />
          : <ImageIcon size={22} style={{ color: 'var(--text-muted)' }} />}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45, flex: 1 }}>{asset.desc}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? 'wait' : 'pointer', flex: 1, justifyContent: 'center' }}>
          {busy ? <Loader2 size={13} style={spin} /> : <Upload size={13} />} {url ? 'Replace' : 'Upload'}
          <input ref={input} type="file" hidden accept={asset.kind === 'favicon' ? 'image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg' : 'image/png,image/webp,image/jpeg'} onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        </label>
        {url && <button type="button" className="btn btn-secondary btn-sm" onClick={remove} disabled={busy} aria-label={`Remove ${asset.title}`}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

const STATE = {
  ok: { text: 'Set up correctly', color: 'var(--success)', Icon: CheckCircle2 },
  wrong: { text: 'Points somewhere else', color: 'var(--danger)', Icon: AlertTriangle },
  missing: { text: 'Not added yet', color: 'var(--warning)', Icon: Clock },
  unknown: { text: '', color: 'var(--text-muted)', Icon: null },
};

const METHOD_LABEL = {
  CNAME: 'Subdomain — one CNAME record',
  FLATTENED_CNAME: 'Root domain — CNAME on @ (flattened automatically)',
  ALIAS: 'Root domain — ALIAS record',
  A: 'Root domain — A records',
  UNSUPPORTED_APEX: 'Root domain — use a subdomain instead',
};

/**
 * Tailored DNS instructions for the domain being typed (GET /agency/domain/dns-preview):
 * subdomain vs root domain, the reseller's DNS provider, and what is live
 * right now for each record. Debounced; "Re-check DNS" asks again.
 */
function DnsSetupGuide({ domain, onUseDomain }) {
  const [state, setState] = useState({ loading: false, data: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const value = String(domain || '').trim();
    if (!value || !value.includes('.')) { setState({ loading: false, data: null }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      domainAPI.previewDns(value)
        .then((res) => { if (alive) setState({ loading: false, data: res.data }); })
        .catch((err) => { if (alive) setState({ loading: false, data: { valid: false, message: err?.response?.data?.message || 'Could not check this domain' } }); });
    }, 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [domain, tick]);

  const { loading, data } = state;
  if (!data && !loading) return null;
  if (data && !data.valid) {
    return data.message ? <div style={{ ...hint, color: 'var(--danger)', marginTop: 8 }}>{data.message}</div> : null;
  }
  const plan = data?.plan;

  return (
    <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, opacity: loading ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>DNS setup for {plan?.host || domain}</strong>
        {plan && <span className="badge badge-primary">{METHOD_LABEL[plan.method] || plan.method}</span>}
        {plan?.provider?.name
          ? <span className="badge badge-muted">DNS hosted at {plan.provider.name}</span>
          : plan && <span className="badge badge-muted">DNS provider not recognised</span>}
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTick((n) => n + 1)} disabled={loading}>
          <RefreshCw size={13} style={loading ? spin : undefined} /> Re-check DNS
        </button>
      </div>

      {plan?.alternative && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <Info size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 220 }}>{plan.alternative.reason} Use <strong>{plan.alternative.host}</strong> instead — it works everywhere.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseDomain(plan.alternative.host)}>Use {plan.alternative.host}</button>
        </div>
      )}

      {plan?.warnings?.map((w) => (
        <div key={w} style={{ display: 'flex', gap: 8, fontSize: '0.78rem', color: 'var(--warning)', lineHeight: 1.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{w}</span>
        </div>
      ))}

      {plan?.steps?.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {plan.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}

      {plan?.records?.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) minmax(0,1.5fr) 150px', gap: 10, padding: '8px 12px', background: 'var(--bg-hover)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Type</span><span>Name / Host</span><span>Value / Points to</span><span>Right now</span>
          </div>
          {plan.records.map((r) => {
            const st = STATE[r.state] || STATE.unknown;
            return (
              <div key={`${r.type}-${r.name}-${r.value}`} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) minmax(0,1.5fr) 150px', gap: 10, alignItems: 'center', fontSize: '0.82rem' }}>
                  <span className="badge badge-primary" style={{ justifySelf: 'start' }}>{r.type}</span>
                  <button type="button" onClick={() => copy(r.name)} title="Copy" style={{ all: 'unset', cursor: 'pointer', fontFamily: 'monospace', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {r.name} <Copy size={11} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  </button>
                  <button type="button" onClick={() => copy(r.value)} title="Copy" style={{ all: 'unset', cursor: 'pointer', fontFamily: 'monospace', color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {r.value} <Copy size={11} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  </button>
                  <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.76rem', fontWeight: 600, color: st.color }}>
                    {st.Icon && <st.Icon size={13} />} {st.text || '—'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>
                  <strong style={{ color: r.required ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{r.required ? 'Required. ' : 'Optional. '}</strong>{String(r.purpose || '').replace(/\.?$/, '.')}
                  {r.state === 'wrong' && r.current ? <> Currently: <code>{r.current}</code>.</> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {plan?.provider?.nameservers?.length > 0 && !plan.provider.name && (
        <div style={hint}>Nameservers: {plan.provider.nameservers.join(', ')} — add the records wherever these are managed.</div>
      )}
    </div>
  );
}

function CloudflareSetupCard() {
  const [setup, setSetup] = useState(null);
  useEffect(() => {
    domainAPI.getCustomDomainSetup().then((res) => setSetup(res.data)).catch(() => setSetup({ error: 'Could not check the setup' }));
  }, []);
  if (!setup) return <div style={card}><Loader2 size={16} style={spin} /></div>;
  const fb = setup.fallbackOrigin;
  const rows = [
    ['APP_ROOT_DOMAIN', setup.appRootDomain, 'Resellers get <name>.' + (setup.appRootDomain || 'yourdomain.com') + ' instantly'],
    ['CUSTOM_DOMAIN_CNAME_TARGET', setup.cnameTarget, 'What resellers point their CNAME at'],
    ['Cloudflare API token + zone', setup.cloudflareConfigured ? 'Connected' : null, 'Adds reseller domains + SSL automatically'],
    ['Fallback origin', fb ? `${fb.origin} (${fb.status})` : null, 'Where Cloudflare sends reseller-domain traffic'],
  ];
  return (
    <div style={card}>
      <h3 style={h3}><Cloud size={17} color="var(--primary)" /> Reseller domains — Cloudflare for SaaS</h3>
      <p style={sub}>
        When a reseller saves a domain, it is added to your Cloudflare zone as a custom hostname with its own SSL certificate, and goes live as soon as their DNS record is detected.
        {setup.domains && <> Right now: <strong>{setup.domains.active}</strong> live, <strong>{setup.domains.pending}</strong> waiting for DNS{setup.domains.failed ? <>, <strong>{setup.domains.failed}</strong> with a problem</> : null}.</>}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([name, value, why]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', flexWrap: 'wrap' }}>
            {value && !(name === 'Fallback origin' && fb?.status !== 'active')
              ? <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
              : <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
            <code style={{ fontSize: '0.78rem' }}>{name}</code>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value || 'not set'}</span>
            <span style={{ color: 'var(--text-muted)' }}>— {why}</span>
          </div>
        ))}
      </div>
      {setup.error && <p style={{ ...hint, color: 'var(--danger)' }}>{setup.error}</p>}
      <p style={hint}>Set these in the API server's <code>.env</code> (see <code>.env.example</code>) and restart it. Without Cloudflare, domains are only checked by DNS and SSL is up to your server.</p>
    </div>
  );
}

export default function DomainSettingsPage() {
  const { refreshBranding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);

  const apply = useCallback((c) => {
    setCfg(c);
    setForm({
      customDomain: c.customDomain || '',
      subdomain: c.subdomain || '',
      allowUserRegistration: c.allowUserRegistration !== false,
      branding: { ...c.branding },
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await domainAPI.getDomainConfig();
      apply(res.data.domainConfig);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to load domain settings');
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => { load(); }, [load]);

  // While the domain waits for DNS, re-check every 15 s (the server also checks every minute).
  useEffect(() => {
    if (cfg?.domainStatus !== 'PENDING') return undefined;
    const t = setInterval(async () => {
      try {
        const res = await domainAPI.getDomainConfig();
        const c = res.data.domainConfig;
        setCfg(c);
        if (c.domainStatus === 'ACTIVE') notify.success(`🎉 ${c.customDomain} is live`);
      } catch { /* keep polling */ }
    }, 15000);
    return () => clearInterval(t);
  }, [cfg?.domainStatus]);

  const setBranding = (patch) => setForm((f) => ({ ...f, branding: { ...f.branding, ...patch } }));

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = { allowUserRegistration: form.allowUserRegistration, branding: form.branding };
      if (!cfg.isPlatform) { payload.customDomain = form.customDomain; payload.subdomain = form.subdomain; }
      const res = await domainAPI.updateDomainConfig(payload);
      apply(res.data.domainConfig);
      notify.success(res.data.message || 'Saved');
      refreshBranding();
    } catch (err) {
      showAlert.error('Not saved', err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await domainAPI.verifyDomain();
      setCfg(res.data.domainConfig);
      if (res.data.isVerified) notify.success(res.data.message);
      else notify.info(res.data.message);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const removeDomain = async () => {
    const ok = await showAlert.confirm({ title: `Remove ${cfg.customDomain}?`, text: 'Your customers will no longer reach you on this domain. You can add it again later.', confirmButtonText: 'Remove domain' });
    if (!ok) return;
    try {
      const res = await domainAPI.removeCustomDomain();
      apply(res.data.domainConfig);
      notify.success('Custom domain removed');
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not remove it');
    }
  };

  if (loading || !form) {
    return <AppLayout><div className="loading-overlay"><div className="loading-spinner" /></div></AppLayout>;
  }

  const status = STATUS[cfg.domainStatus] || STATUS.NONE;
  const domainChanged = (form.customDomain || '').trim().toLowerCase() !== (cfg.customDomain || '');
  const liveHost = cfg.domainStatus === 'ACTIVE' ? cfg.customDomain : cfg.subdomainHost;
  const signupUrl = liveHost ? `https://${liveHost}/register` : null;

  return (
    <AppLayout>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={20} color="var(--primary)" /> {cfg.isPlatform ? 'Main Domain Branding' : 'Custom Domain & White-label'}
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.55 }}>
            {cfg.isPlatform
              ? 'The logo, favicon and name everyone sees on your main domain. People who sign up there become your own End Users on the default (basic) package.'
              : 'Your own address, logo and favicon. Everyone who signs up on your domain becomes your customer (End User) — never a customer of the platform.'}
          </p>
        </div>

        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {cfg.isPlatform && <CloudflareSetupCard />}

          {!cfg.isPlatform && (
            <div style={card}>
              <h3 style={h3}><Globe size={17} color="var(--primary)" /> 1. Your domain</h3>
              <p style={sub}>Enter your domain or subdomain — e.g. <strong>app.yourbrand.com</strong> or <strong>yourbrand.com</strong>. We'll show exactly what to add at your DNS provider.</p>

              <label style={label}>Domain or subdomain</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="form-input" style={{ flex: 1, minWidth: 240 }} placeholder="app.yourbrand.com" value={form.customDomain}
                  onChange={(e) => setForm({ ...form, customDomain: e.target.value })} />
                {domainChanged && form.customDomain.trim() && (
                  <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? <Loader2 size={14} style={spin} /> : <Save size={14} />} Connect this domain
                  </button>
                )}
              </div>

              {cfg.customDomain && !domainChanged && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className={`badge ${status.badge}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><status.Icon size={12} /> {status.text}</span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{cfg.customDomain}</strong>
                  {cfg.domainStatus === 'ACTIVE' && <a href={`https://${cfg.customDomain}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Open <ExternalLink size={11} /></a>}
                  {cfg.domainCheckedAt && cfg.domainStatus !== 'ACTIVE' && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>last checked {new Date(cfg.domainCheckedAt).toLocaleTimeString()}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {cfg.domainStatus !== 'ACTIVE' && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={checkNow} disabled={checking}>
                        <RefreshCw size={13} style={checking ? spin : undefined} /> Check now
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={removeDomain}><Trash2 size={13} /> Remove</button>
                  </span>
                </div>
              )}
              {cfg.customDomain && !domainChanged && cfg.domainError && cfg.domainStatus !== 'ACTIVE' && (
                <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', color: 'var(--danger)', lineHeight: 1.5, marginTop: 8 }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{cfg.domainError}</span>
                </div>
              )}

              {cfg.customDomain && !domainChanged && cfg.domainStatus === 'ACTIVE' ? (
                <p style={{ ...sub, margin: '10px 0 0', display: 'flex', gap: 6 }}><ShieldCheck size={15} style={{ color: 'var(--success)', flexShrink: 0 }} /> Your domain is live with a free SSL certificate. Keep the DNS record in place.</p>
              ) : (
                <DnsSetupGuide domain={form.customDomain} onUseDomain={(d) => setForm({ ...form, customDomain: d })} />
              )}
              {domainChanged && form.customDomain.trim() && (
                <div style={{ ...hint, marginTop: 10 }}>Click <strong>Connect this domain</strong> to register it — it goes live automatically once the DNS record above is in place.{cfg.customDomain ? ` This replaces ${cfg.customDomain}.` : ''}</div>
              )}

              {cfg.appRootDomain && (
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <label style={label}>Or a free address on our domain (live instantly, no DNS needed)</label>
                  <div style={{ display: 'flex', maxWidth: 480 }}>
                    <input className="form-input" style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} placeholder="yourbrand"
                      value={form.subdomain}
                      onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                    <span style={{ padding: '0 10px', display: 'inline-flex', alignItems: 'center', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 8px 8px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      .{cfg.appRootDomain}
                    </span>
                  </div>
                  {cfg.subdomainHost && (
                    <div style={hint}>Live now: <a href={`https://${cfg.subdomainHost}`} target="_blank" rel="noreferrer">{cfg.subdomainHost} <ExternalLink size={10} /></a></div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={card}>
            <h3 style={h3}><Palette size={17} color="var(--primary)" /> {cfg.isPlatform ? 'Branding' : '2. Branding'}</h3>
            <p style={sub}>Images are saved as soon as you upload them. They show on {cfg.isPlatform ? 'your main domain' : 'your domains'} — the sign-in and sign-up pages, the dashboard and the browser tab.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
              {ASSETS.map((a) => (
                <AssetTile key={a.kind} asset={a} url={form.branding[a.key]}
                  onUploaded={(key, url) => { setBranding({ [key]: url }); refreshBranding(); }}
                  onRemoved={(key) => { setBranding({ [key]: '' }); refreshBranding(); }} />
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <div>
                <label style={label}>Brand name *</label>
                <input className="form-input w-full" required value={form.branding.brandName} onChange={(e) => setBranding({ brandName: e.target.value })} placeholder="e.g. Dynasty AI" />
                <div style={hint}>Shown when no logo is uploaded, and in the browser tab.</div>
              </div>
              <div>
                <label style={label}>Tagline</label>
                <input className="form-input w-full" value={form.branding.tagline} onChange={(e) => setBranding({ tagline: e.target.value })} placeholder="e.g. AI & Live Chat Suite" />
              </div>
              <div>
                <label style={label}>Support email</label>
                <input type="email" className="form-input w-full" value={form.branding.supportEmail} onChange={(e) => setBranding({ supportEmail: e.target.value })} placeholder="support@yourbrand.com" />
              </div>
              <div>
                <label style={label}>Footer / copyright text</label>
                <input className="form-input w-full" value={form.branding.copyrightText} onChange={(e) => setBranding({ copyrightText: e.target.value })} placeholder={`© ${new Date().getFullYear()} Your Brand`} />
              </div>
            </div>
          </div>

          {!cfg.isPlatform && (
            <div style={card}>
              <h3 style={h3}><UserPlus size={17} color="var(--primary)" /> 3. Customer sign-up</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={form.allowUserRegistration} onChange={(e) => setForm({ ...form, allowUserRegistration: e.target.checked })} />
                Let people sign up on my domain (they become my End Users, on my default plan)
              </label>
              {signupUrl ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <input readOnly value={signupUrl} className="form-input" style={{ flex: 1, color: 'var(--primary)', fontWeight: 600 }} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(signupUrl)}><Copy size={13} /> Copy link</button>
                </div>
              ) : (
                <div style={hint}>Your sign-up link appears here once your subdomain or domain is live.</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={15} style={spin} /> : <Save size={15} />} {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
