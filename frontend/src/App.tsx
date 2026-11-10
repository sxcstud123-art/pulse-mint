import { useEffect, useState } from 'react';
import { ProtocolProvider, useP, priceStr, pct, EXPLORER } from './data';
import Logo from './ui/Logo';
import { Icons } from './ui/icons';
import { NetworkBanner, WalletControls } from './wallet/WalletControls';
import { WatchHow } from './ui/WatchHow';
import Start from './pages/Start'; import Borrow from './pages/Borrow'; import Stability from './pages/Stability';
import Staking from './pages/Staking'; import Redemptions from './pages/Redemptions'; import Liquidations from './pages/Liquidations';
import Analytics from './pages/Analytics'; import Docs from './pages/Docs';

const NAV = [
  ['start', 'Start Here', Icons.start], ['borrow', 'Borrow USDPM', Icons.borrow], ['stability', 'Stability Pool', Icons.pool],
  ['staking', 'Staking (PMNT)', Icons.stake], ['redemptions', 'Redemptions', Icons.redeem], ['liquidations', 'Liquidations', Icons.liq],
  ['analytics', 'Analytics', Icons.analytics], ['docs', 'Docs', Icons.docs],
] as const;

function TopBar({ theme, toggle, menu }: { theme: string; toggle: () => void; menu: () => void }) {
  const { systemCR, anyRM, b, c, my } = useP();
  return (<header className="topbar">
    <button className="menubtn" data-testid="menu" aria-label="Open menu" onClick={menu}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
    <div className="mbrand"><Logo size={30} /><b>Pulse Mint</b></div>
    <div className="tstat"><span>System ratio {anyRM ? '· recovery' : '· normal'}</span><span className="with-watch"><b data-testid="system-cr" style={{ color: anyRM ? 'var(--danger)' : 'var(--ok)' }}>{systemCR ? (systemCR * 100).toFixed(2) + '%' : '–'}</b><WatchHow src="11-recovery-mode.mp4" compact /></span></div>
    <div className="tstat"><span>Your {c.symbol} ratio</span><b>{my.vDebt > 0n ? pct(my.icr) : '–'}</b></div>
    <div className="prices">
      <div className="price"><div className="dot" style={{ background: 'linear-gradient(135deg,#14b8a6,#34d399)' }}>PM</div><div className="tstat"><span>PMNT</span><b>no market yet</b></div></div>
      <div className="price"><div className="dot" style={{ background: '#0ea5e9' }}>$</div><div className="tstat"><span>USDPM</span><b>$1.00 target</b></div></div>
      <div className="price"><div className="dot" style={{ background: '#334155' }}>{c.symbol.slice(0, 2)}</div><div className="tstat"><span>{c.symbol}</span><b>{priceStr(b.price)}</b></div></div>
    </div>
    <WalletControls />
    <WatchHow src="02-connect-wallet.mp4" compact />
    <button className="iconbtn" data-testid="theme" onClick={toggle} title="Toggle light/dark">{theme === 'dark' ? <Icons.sun /> : <Icons.moon />}</button>
  </header>);
}

function Toast() {
  const { toast } = useP();
  if (!toast) return null;
  return <div className="toast" id="status">{toast.msg} {toast.tx && <a href={`${EXPLORER}/tx/${toast.tx}`} target="_blank">view tx ↗</a>}</div>;
}

export default function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || 'start');
  const [theme, setTheme] = useState(() => sessionStorage.getItem('pm-theme-session') || 'dark'); // always opens dark; toggle lasts for this tab only
  useEffect(() => { document.documentElement.dataset.theme = theme; sessionStorage.setItem('pm-theme-session', theme); localStorage.removeItem('pm-theme'); }, [theme]);
  useEffect(() => { const f = () => setPage(location.hash.slice(1) || 'start'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const [open, setOpen] = useState(false);
  const go = (p: string) => { location.hash = p; setPage(p); setOpen(false); scrollTo(0, 0); };
  const P = { start: <Start go={go} />, borrow: <Borrow />, stability: <Stability />, staking: <Staking />, redemptions: <Redemptions />, liquidations: <Liquidations />, analytics: <Analytics />, docs: <Docs /> } as Record<string, JSX.Element>;
  return (<ProtocolProvider><div className={"app" + (open ? " menu-open" : "")}>
    <div className="scrim" onClick={() => setOpen(false)} />
    <aside className="sidebar">
      <div className="brand"><Logo /><div><b>Pulse Mint</b><small>Testnet</small></div></div>
      <nav className="nav">{NAV.map(([id, label, I]) => <button key={id} data-testid={'nav-' + id} className={page === id ? 'active' : ''} onClick={() => go(id)}><I />{label}</button>)}</nav>
      <div className="side-foot">PulseChain testnet v4 · chain 943<br />Unaudited prototype. Test funds only.</div>
    </aside>
    <main className="main"><TopBar theme={theme} toggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} menu={() => setOpen(true)} /><NetworkBanner />{P[page] ?? P.start}</main>
    <Toast />
  </div></ProtocolProvider>);
}
