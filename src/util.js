export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmt(stamp) {
  if (!stamp) return '—';
  const [date, time] = String(stamp).split('T');
  return time ? `${date} ${time}` : date;
}

export function hash(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function unit(n) {
  return (n % 10000) / 10000;
}

export function safeColor(color, fallback = '#5c6b7a') {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : fallback;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
