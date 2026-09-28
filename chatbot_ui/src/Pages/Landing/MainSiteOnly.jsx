import { Link, Navigate } from 'react-router';
import usePublicSite from '../../hooks/usePublicSite';

/**
 * Pages that belong to the platform's main domain only (the blog, the
 * platform's own pricing). On a Reseller's address they redirect (`redirectTo`)
 * or show a plain "not found" — the API refuses them there too.
 */
export default function MainSiteOnly({ children, redirectTo = null }) {
  const publicSite = usePublicSite();
  if (publicSite.loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;
  if (publicSite.kind !== 'RESELLER') return children;
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return (
    <section className="lp-section" style={{ minHeight: '50vh', textAlign: 'center' }}>
      <div className="lp-container">
        <h1 className="lp-section-title">Page not found</h1>
        <p className="lp-section-desc" style={{ margin: '0 auto 24px' }}>This page isn&apos;t available here.</p>
        <Link to="/landing" className="lp-btn-primary">Back to home</Link>
      </div>
    </section>
  );
}
