// Number + time formatting helpers.
const SUF = ['', 'K', 'M', 'B', 'T'];

/** 950 -> "950", 1234 -> "1.2K", 34000 -> "34K", 1.5e6 -> "1.5M", 2.1e9 -> "2.1B" */
export function fmt(n) {
  n = Number(n) || 0;
  const neg = n < 0;
  let v = Math.abs(n);
  if (v < 1000) return (neg ? '-' : '') + Math.floor(v + 1e-6);
  let i = 0;
  while (v >= 1000 && i < SUF.length - 1) { v /= 1000; i++; }
  const s = v < 10 ? (Math.floor(v * 10 + 1e-6) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(v + 1e-6));
  return (neg ? '-' : '') + s + SUF[i];
}

/** seconds -> "m:ss" */
export function mmss(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}
