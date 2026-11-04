// Simple original line icons (24x24, stroke = currentColor).
const P = (d: string) => () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>);
export const Icons = {
  start: P('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'),
  borrow: P('M4 7h16v10H4zM4 11h16M8 15h3'),
  pool: P('M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5'),
  stake: P('M12 2v4M5 9h14l-1 11H6zM9 13h6'),
  redeem: P('M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4'),
  liq: P('M12 3l9 16H3zM12 10v4M12 17h.01'),
  analytics: P('M4 20V10M10 20V4M16 20v-7M22 20H2'),
  docs: P('M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7'),
  sun: P('M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'),
  moon: P('M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z'),
};
