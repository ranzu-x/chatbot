import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContext';
import { tenantAPI } from '../../services/api';
import { Sparkles, ArrowRight } from 'lucide-react';

const ROLE_HOME = {
  ADMIN:  '/admin',
  AGENCY: '/agency',
  AGENT:  '/inbox',
};

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const [tenant, setTenant] = useState({
    brandName: 'Nexa Chatbot',
    tagline: 'Sign in to your AI & multichannel marketing workspace',
    logoUrl: '',
    primaryColor: '#2563eb',
    allowUserRegistration: true,
  });

  useEffect(() => {
    const domainParam = searchParams.get('domain');
    const hostToResolve = domainParam || window.location.hostname;

    tenantAPI.resolveTenant(hostToResolve)
      .then((res) => {
        if (res.data?.agency) {
          const a = res.data.agency;
          setTenant({
            brandName: a.brandName || a.name || 'Nexa Chatbot',
            tagline: a.tagline || 'Sign in to your AI & multichannel marketing workspace',
            logoUrl: a.logoUrl || '',
            primaryColor: a.primaryColor || '#2563eb',
            allowUserRegistration: a.allowUserRegistration !== false,
          });
          document.title = `Sign In | ${a.brandName || a.name}`;
        }
      })
      .catch((err) => console.error('Tenant resolve error:', err));
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      const home = ROLE_HOME[user.role] || '/login';
      navigate(home, { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Invalid email or password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background orbs */}
      <div
        className="login-bg-orb"
        style={{
          width: 480,
          height: 480,
          background: `radial-gradient(circle, ${tenant.primaryColor}80, transparent)`,
          top: '-120px',
          left: '-160px',
        }}
      />
      <div
        className="login-bg-orb"
        style={{
          width: 360,
          height: 360,
          background: 'radial-gradient(circle, #22d3ee80, transparent)',
          bottom: '-80px',
          right: '-100px',
        }}
      />

      <div className="login-card animate-slide-up" style={{ maxWidth: 440 }}>
        {/* Logo */}
        <div className="login-logo" style={{ textAlign: 'center', marginBottom: 20 }}>
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.brandName}
              style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain', margin: '0 auto 12px', display: 'block' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div
              className="login-logo-icon"
              style={{
                background: `linear-gradient(135deg, ${tenant.primaryColor} 0%, #1e40af 100%)`,
                color: '#fff',
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
                boxShadow: `0 4px 12px ${tenant.primaryColor}40`,
              }}
            >
              <Sparkles size={20} />
            </div>
          )}
          <h1 className="login-title" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
            {tenant.brandName}
          </h1>
          <p className="login-sub" style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
            {tenant.tagline}
          </p>
        </div>

        {/* Error */}
        {error && <div className="login-error">{error}</div>}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
            style={{
              marginTop: '10px',
              background: tenant.primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: `0 4px 12px ${tenant.primaryColor}35`,
            }}
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Signing in…
              </>
            ) : (
              <>
                Sign In <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {tenant.allowUserRegistration && (
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: '0.8rem', color: '#64748b' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: tenant.primaryColor, fontWeight: 700, textDecoration: 'none' }}>
              Create Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}