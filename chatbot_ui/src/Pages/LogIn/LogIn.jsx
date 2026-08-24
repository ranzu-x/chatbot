import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../Provider/AuthContext';

const ROLE_HOME = {
  ADMIN:  '/admin',
  AGENCY: '/agency',
  AGENT:  '/inbox',
};

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

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
        err?.response?.data?.message || 'Invalid credentials. Please try again.'
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
          background: 'radial-gradient(circle, #6366f1, transparent)',
          top: '-120px',
          left: '-160px',
        }}
      />
      <div
        className="login-bg-orb"
        style={{
          width: 360,
          height: 360,
          background: 'radial-gradient(circle, #22d3ee, transparent)',
          bottom: '-80px',
          right: '-100px',
        }}
      />

      <div className="login-card animate-slide-up">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">💬</div>
          <h1 className="login-title gradient-text">ChatSaaS</h1>
          <p className="login-sub">Sign in to your workspace</p>
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
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Signing in…
              </>
            ) : (
              '→ Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}