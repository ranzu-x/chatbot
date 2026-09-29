/** Splits text into plain / matched parts for every search word (case-insensitive). */
export function highlightParts(text, tokens) {
  const words = (tokens || []).map((t) => String(t).trim()).filter(Boolean);
  if (!text || !words.length) return [{ text: text || '', match: false }];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return String(text).split(re).filter((p) => p !== '').map((p) => ({
    text: p,
    match: words.some((w) => w.toLowerCase() === p.toLowerCase()),
  }));
}
