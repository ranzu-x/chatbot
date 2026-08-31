import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import api from '../../services/api';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  AlertCircle,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

export default function InChatPaymentCheckoutPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Simulated Card Input Form
  const [cardForm, setCardForm] = useState({
    name: '',
    number: '',
    exp: '',
    cvc: '',
  });

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payments/order/${orderId}`);
      const ord = res.data?.order;
      setOrder(ord);
      if (ord.status === 'PAID') {
        setPaidSuccess(true);
      }
    } catch (err) {
      console.error(err);
      setError('Order not found or has expired.');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setPaying(true);
    setError(null);

    try {
      await api.post(`/payments/order/${orderId}/simulate-pay`);
      setPaidSuccess(true);
    } catch (err) {
      console.error(err);
      setError('Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          Loading checkout...
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 32, maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>Order Unavailable</h3>
          <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#ffffff', borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {/* Brand / Order Header */}
        <div style={{ padding: '22px 24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {order.agency_name || 'Secure Checkout'}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={11} /> 256-bit Encrypted
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                {order.product_name}
              </h2>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Order #{order.id}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
              ${Number(order.amount).toFixed(2)}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>{order.currency}</span>
            </div>
          </div>
        </div>

        {/* Payment Confirmation State */}
        {paidSuccess ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(22, 163, 74, 0.25)' }}>
              <CheckCircle2 size={36} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
              Payment Successful!
            </h3>
            <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 auto 20px', maxWidth: 320, lineHeight: 1.45 }}>
              Your payment of <strong>${Number(order.amount).toFixed(2)} {order.currency}</strong> has been received. Your confirmation receipt has been sent to your chat!
            </p>

            <div style={{ padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#475569', textAlign: 'left', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Transaction Ref:</span>
                <strong>TXN-{order.id}-{Date.now().toString().slice(-6)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Status:</span>
                <strong style={{ color: '#16a34a' }}>PAID & CONFIRMED</strong>
              </div>
            </div>

            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              You may now return to your chat app.
            </span>
          </div>
        ) : (
          /* Checkout Payment Form */
          <form onSubmit={handlePay} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 700 }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Cardholder Name
              </label>
              <input
                type="text"
                required
                className="form-input w-full"
                placeholder="Jane Doe"
                value={cardForm.name}
                onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                style={{ fontSize: '0.82rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Card Number
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  className="form-input w-full"
                  placeholder="4242 •••• •••• 4242"
                  value={cardForm.number}
                  onChange={(e) => setCardForm({ ...cardForm, number: e.target.value })}
                  style={{ fontSize: '0.82rem', paddingRight: 36 }}
                />
                <CreditCard size={18} color="#94a3b8" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Expiry (MM/YY)
                </label>
                <input
                  type="text"
                  required
                  className="form-input w-full"
                  placeholder="12/28"
                  value={cardForm.exp}
                  onChange={(e) => setCardForm({ ...cardForm, exp: e.target.value })}
                  style={{ fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  CVC / CVV
                </label>
                <input
                  type="text"
                  required
                  className="form-input w-full"
                  placeholder="123"
                  maxLength={4}
                  value={cardForm.cvc}
                  onChange={(e) => setCardForm({ ...cardForm, cvc: e.target.value })}
                  style={{ fontSize: '0.82rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={paying}
              style={{
                marginTop: 6,
                padding: '12px 20px',
                borderRadius: 10,
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.92rem',
                fontWeight: 800,
                cursor: paying ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <CreditCard size={16} />
              {paying ? 'Processing Payment...' : `Pay $${Number(order.amount).toFixed(2)} ${order.currency}`}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8', fontSize: '0.72rem', marginTop: 4 }}>
              <ShieldCheck size={14} color="#10b981" /> Guaranteed safe & secure checkout
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
