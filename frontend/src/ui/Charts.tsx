// Tiny dependency-free SVG charts.
type Pt = { x: number; y: number };
const W = 460, H = 220, PAD = { l: 52, r: 12, t: 14, b: 30 };
const tick = (v: number) => (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(v < 10 ? 2 : 0));

export function LineChart({ pts, color = 'var(--brand)', xLabel }: { pts: Pt[]; color?: string; xLabel?: (x: number) => string }) {
  if (pts.length < 2) return <div className="note" style={{ height: H, display: 'grid', placeItems: 'center' }}>Not enough on-chain history yet</div>;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys) * 1.1 || 1;
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - (y / y1) * (H - PAD.t - PAD.b);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + sx(p.x) + ',' + sy(p.y)).join(' ');
  const id = 'g' + Math.round(Math.random() * 1e9);
  return (<svg viewBox={`0 0 ${W} ${H}`} width="100%">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    {[0, .5, 1].map((f) => <g key={f}><line x1={PAD.l} x2={W - PAD.r} y1={sy(y1 * f)} y2={sy(y1 * f)} stroke="var(--border)" /><text x={PAD.l - 6} y={sy(y1 * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{tick(y1 * f)}</text></g>)}
    <path d={d + ` L${sx(x1)},${sy(0)} L${sx(x0)},${sy(0)} Z`} fill={`url(#${id})`} />
    <path d={d} fill="none" stroke={color} strokeWidth="2" />
    {xLabel && [x0, (x0 + x1) / 2, x1].map((x, i) => <text key={i} x={sx(x)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="10" fill="var(--muted)">{xLabel(x)}</text>)}
  </svg>);
}

export function BarChart({ data, color = 'var(--brand)', fmtV = tick, markers = [] }: { data: { k: string; v: number }[]; color?: string; fmtV?: (v: number) => string; markers?: { v: number; label: string }[] }) {
  const max = Math.max(...data.map((d) => d.v), ...markers.map((m) => m.v), 0) * 1.15 || 1;
  const bw = (W - PAD.l - PAD.r) / data.length;
  const sy = (y: number) => H - PAD.b - (y / max) * (H - PAD.t - PAD.b);
  return (<svg viewBox={`0 0 ${W} ${H}`} width="100%">
    <line x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} stroke="var(--border)" />
    {markers.map((m) => <g key={m.label}><line x1={PAD.l} x2={W - PAD.r} y1={sy(m.v)} y2={sy(m.v)} stroke="var(--warn)" strokeDasharray="4 4" /><text x={W - PAD.r} y={sy(m.v) - 4} textAnchor="end" fontSize="10" fill="var(--warn)">{m.label}</text></g>)}
    {data.map((d, i) => { const x = PAD.l + i * bw + bw * .18, w = bw * .64; return (<g key={d.k}>
      <rect x={x} y={sy(d.v)} width={w} height={Math.max(0, sy(0) - sy(d.v))} rx="5" fill={color} opacity=".9" />
      <text x={x + w / 2} y={sy(d.v) - 5} textAnchor="middle" fontSize="10" fill="var(--text)">{d.v ? fmtV(d.v) : ''}</text>
      <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.k}</text></g>); })}
  </svg>);
}
