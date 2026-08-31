import React, { useState, useEffect } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContext';
import { authAPI, tenantAPI } from '../../services/api';

export default function Register() {
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [tenant, setTenant] = useState({
    brandName: 'Nexa Chatbot',
    tagline: 'Sign up to your AI & multichannel marketing workspace',
    logoUrl: '',
    primaryColor: '#2563eb',
    allowUserRegistration: true,
  });

  const [loadingTenant, setLoadingTenant] = useState(true);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Resolve Tenant Branding on Mount
  useEffect(() => {
    const domainParam = searchParams.get('domain');
    const hostToResolve = domainParam || window.location.hostname;

    tenantAPI.resolveTenant(hostToResolve)
      .then((res) => {
        if (res.data?.agency) {
          const a = res.data.agency;
          setTenant({
            brandName: a.brandName || a.name || 'Nexa Chatbot',
            tagline: a.tagline || `Join the ${a.name} workspace`,
            logoUrl: a.logoUrl || '',
            primaryColor: a.primaryColor || '#2563eb',
            allowUserRegistration: a.allowUserRegistration !== false,
          });
          document.title = `Sign Up | ${a.brandName || a.name}`;
        }
      })
      .catch((err) => console.error('Tenant resolve error:', err))
      .finally(() => setLoadingTenant(false));
  }, [searchParams]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const temp = {};
    if (!formData.name.trim()) temp.name = 'Full Name is required.';
    if (!formData.email.trim()) {
      temp.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      temp.email = 'Enter a valid email address.';
    }
    if (!formData.password) {
      temp.password = 'Password is required.';
    } else if (formData.password.length < 6) {
      temp.password = 'Password must be at least 6 characters.';
    }
    if (formData.password !== formData.confirmPassword) {
      temp.confirmPassword = 'Passwords do not match.';
    }
    setErrors(temp);
    return Object.keys(temp).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const domainParam = searchParams.get('domain');
      const targetHost = domainParam || window.location.host;

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        domain: targetHost,
        host: targetHost,
      };

      const res = await authAPI.register(payload);

      if (res.data?.token) {
        localStorage.setItem('auth_token', res.data.token);
      }

      // Redirect to login or auto-login
      navigate('/inbox');
    } catch (err) {
      console.error(err);
      setServerError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!tenant.allowUserRegistration) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
            Registration Closed
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: 20 }}>
            Public user registration is currently disabled for <strong>{tenant.brandName}</strong>. Please contact your workspace administrator for access.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ padding: '8px 20px' }}>
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

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

      <div className="login-card animate-slide-up" style={{ maxWidth: 460 }}>
        {/* Logo / Brand Header */}
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

        {/* Server Error Alert */}
        {serverError && (
          <div className="login-error" style={{ marginBottom: 14 }}>
            {serverError}
          </div>
        )}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                id="register-name"
                type="text"
                name="name"
                className="form-input"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                style={{ paddingLeft: 34 }}
                required
              />
            </div>
            {errors.name && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2, display: 'block' }}>{errors.name}</span>}
          </div>

          {/* Email */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-email">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                id="register-email"
                type="email"
                name="email"
                className="form-input"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                style={{ paddingLeft: 34 }}
                required
              />
            </div>
            {errors.email && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2, display: 'block' }}>{errors.email}</span>}
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className="form-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                style={{ paddingLeft: 34, paddingRight: 34 }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2, display: 'block' }}>{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-confirm">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                id="register-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                className="form-input"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                style={{ paddingLeft: 34, paddingRight: 34 }}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.confirmPassword && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2, display: 'block' }}>{errors.confirmPassword}</span>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 8,
              background: tenant.primaryColor || '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: `0 4px 12px ${tenant.primaryColor}35`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 6,
            }}
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
            {!submitting && <ArrowRight size={15} />}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: '0.8rem', color: '#64748b' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: tenant.primaryColor, fontWeight: 700, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}