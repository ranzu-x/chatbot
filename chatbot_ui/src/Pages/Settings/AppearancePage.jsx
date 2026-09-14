import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { Type, Palette, Ruler, Sun, Moon, RotateCcw, Check } from 'lucide-react';
import {
  FONTS, ACCENTS, DENSITIES,
  getAppearance, setAppearance, resetAppearance,
} from '../../theme/appearance';

const EmbeddedWrapper = ({ children }) => <div>{children}</div>;

function SectionCard({ icon, title, description, children }) {
  return (
    <section className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0,
          background: 'var(--primary-soft)', color: 'var(--primary)',
        }}>
          {icon}
        </div>
        <div>
          <h2 style={{ fontSize: '0.98rem', fontWeight: 700 }}>{title}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function OptionTile({ selected, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative', textAlign: 'left', padding: '13px 15px', borderRadius: 'var(--radius)',
        background: selected ? 'var(--primary-soft)' : 'var(--bg-surface)',
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 3px var(--primary-ring)' : 'none',
        transition: 'border-color .15s, box-shadow .15s, background .15s',
        cursor: 'pointer', width: '100%',
        ...style,
      }}
    >
      {selected && (
        <span style={{
          position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 999,
          background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center',
        }}>
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

export default function AppearancePage({ embedded = false }) {
  const [appearance, setLocal] = useState(getAppearance);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const update = (partial) => setLocal(setAppearance(partial));

  const LayoutWrapper = embedded ? EmbeddedWrapper : AppLayout;
  const activeFont = FONTS.find((f) => f.id === appearance.font) || FONTS[0];

  return (
    <LayoutWrapper>
      {!embedded && (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">Appearance</h1>
            <p className="page-subtitle">
              Typeface, accent colour and density for this workspace. Changes apply instantly and are remembered on this browser.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setLocal(resetAppearance())}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </div>
      )}

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 980 }}>

        {/* Live preview */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            Live preview
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 6 }}>The quick brown fox jumps</h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 560 }}>
            Every heading, label, table and button in the dashboard uses this typeface and accent.
            Numerals: 0123456789 · 1,284 sent · 96.4% delivered
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm">Primary action</button>
            <button className="btn btn-secondary btn-sm">Secondary</button>
            <span className="badge badge-primary">Accent badge</span>
            <span className="badge badge-success">Delivered</span>
            <span className="badge badge-muted">Draft</span>
          </div>
        </div>

        {/* Typeface */}
        <SectionCard
          icon={<Type size={18} />}
          title="Typeface"
          description={`Currently ${activeFont.label}. Web fonts load on demand — "System Default" loads nothing at all.`}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {FONTS.map((f) => (
              <OptionTile key={f.id} selected={appearance.font === f.id} onClick={() => update({ font: f.id })}>
                <div style={{ fontFamily: f.stack, fontSize: '1.15rem', fontWeight: 700, marginBottom: 3 }}>
                  {f.label}
                </div>
                <div style={{ fontFamily: f.stack, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Aa Bb Cc · 0123
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>{f.note}</div>
              </OptionTile>
            ))}
          </div>
        </SectionCard>

        {/* Accent */}
        <SectionCard
          icon={<Palette size={18} />}
          title="Accent colour"
          description="Drives buttons, links, focus rings and every highlighted state across the dashboard."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {ACCENTS.map((a) => (
              <OptionTile key={a.id} selected={appearance.accent === a.id} onClick={() => update({ accent: a.id })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: `linear-gradient(135deg, ${a.light}, ${a.dark})`,
                  }} />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{a.label}</span>
                </div>
              </OptionTile>
            ))}
          </div>
        </SectionCard>

        {/* Density */}
        <SectionCard
          icon={<Ruler size={18} />}
          title="Density"
          description="Scales the whole interface — text, padding and controls together."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {DENSITIES.map((d) => (
              <OptionTile key={d.id} selected={appearance.density === d.id} onClick={() => update({ density: d.id })}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{d.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{d.note} · {d.rootSize}</div>
              </OptionTile>
            ))}
          </div>
        </SectionCard>

        {/* Theme */}
        <SectionCard
          icon={theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
          title="Theme"
          description="Light or dark surfaces. Also available from the account menu in the top bar."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {[['light', 'Light', <Sun key="s" size={16} />], ['dark', 'Dark', <Moon key="m" size={16} />]].map(([id, label, glyph]) => (
              <OptionTile key={id} selected={theme === id} onClick={() => setTheme(id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '0.88rem', fontWeight: 600 }}>
                  {glyph} {label}
                </div>
              </OptionTile>
            ))}
          </div>
        </SectionCard>

        {embedded && (
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setLocal(resetAppearance())}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
        )}
      </div>
    </LayoutWrapper>
  );
}
