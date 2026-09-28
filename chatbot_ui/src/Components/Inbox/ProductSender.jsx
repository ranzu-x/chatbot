import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { waCatalogAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { CatalogProducts } from '../Bots/WhatsAppCatalogPanel';

/**
 * Send Menu → Products (WhatsApp): the catalog, one product, or a list of up
 * to 30 (chatbot_api/utils/whatsappCatalog.js buildProductMessage).
 */
export default function ProductSender({ conversationId, integrationId, onSent, onClose }) {
  const [kind, setKind] = useState('product');
  const [picked, setPicked] = useState([]);
  const [body, setBody] = useState('');
  const [header, setHeader] = useState('');
  const [sending, setSending] = useState(false);

  const pick = (p) => {
    if (kind === 'list') setPicked((l) => (l.includes(p.retailerId) ? l.filter((x) => x !== p.retailerId) : l.length >= 30 ? l : [...l, p.retailerId]));
    else setPicked([p.retailerId]);
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await waCatalogAPI.send({ conversationId, kind, retailerIds: picked, body, header });
      notify.success('Sent');
      onSent?.({ kind: 'products', message: res.data?.message });
      onClose?.();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', boxSizing: 'border-box' };
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['product', 'One product'], ['list', 'Product list'], ['catalog', 'Whole catalog']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setKind(id); setPicked([]); }}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: `1px solid ${kind === id ? '#2563eb' : '#e2e8f0'}`, background: kind === id ? '#eff6ff' : '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      {kind === 'list' && <input style={input} maxLength={60} placeholder="Header (e.g. New arrivals)" value={header} onChange={(e) => setHeader(e.target.value)} />}
      <textarea style={input} rows={2} maxLength={1024} placeholder={kind === 'catalog' ? 'Message (e.g. Browse our catalog)' : 'Message (optional)'} value={body} onChange={(e) => setBody(e.target.value)} />
      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
        {kind === 'catalog' ? 'Optional: pick a product for the thumbnail.' : kind === 'list' ? `Pick up to 30 products (${picked.length} picked).` : 'Pick the product.'}
      </div>
      <CatalogProducts integrationId={integrationId} onPick={pick} picked={picked} />
      <button type="button" onClick={send} disabled={sending || (kind !== 'catalog' && !picked.length)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
      </button>
    </div>
  );
}
