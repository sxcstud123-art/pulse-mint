import { useState, type ReactNode } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { useP, fmt, pct, usd, num } from '../data';
import { COLLATERALS } from '../config';

export const Title = ({ t, sub }: { t: string; sub?: string }) => (<><div className="title"><h1>{t}</h1></div>{sub && <p className="subtitle">{sub}</p>}</>);
export const Row = ({ k, v, id }: { k: ReactNode; v: ReactNode; id?: string }) => <div className="row"><span>{k}</span><b data-testid={id}>{v}</b></div>;

export function CollSelect() {
  const { sel, setSel, branches } = useP();
  return (<div className="selector" data-testid="coll-select">
    {COLLATERALS.map((c, i) => (
      <button key={c.symbol} className={'chip' + (sel === i ? ' active' : '')} onClick={() => setSel(i)} data-testid={'coll-' + c.symbol}>
        {c.symbol} <small>{pct(branches[i].mcr)}</small>
      </button>))}
  </div>);
}

/** Amount input with 25/50/75/100% shortcuts of `max`. */
export function Amount({ label, value, set, max, dec = 18, unit, id }: { label: string; value: string; set: (v: string) => void; max?: bigint; dec?: number; unit: string; id: string }) {
  return (<>
    <div className="field"><label>{label}</label><input data-testid={id} inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => set(e.target.value)} /></div>
    <div className="hint">Available: {fmt(max, dec)} {unit}</div>
    <div className="pcts">{[25, 50, 75, 100].map((p) => (
      <button key={p} data-testid={`${id}-${p}`} disabled={!max} onClick={() => max !== undefined && set(formatUnits(max * BigInt(p) / 100n, dec))}>{p}%</button>))}</div>
  </>);
}
export const parse = (v: string, d = 18) => { try { return v ? parseUnits(v.replace(/,/g, ''), d) : 0n; } catch { return 0n; } };

export function Tabs({ tabs, cur, set }: { tabs: string[]; cur: number; set: (i: number) => void }) {
  return <div className="tabs">{tabs.map((t, i) => <button key={t} data-testid={'tab-' + t.toLowerCase().replace(/\W+/g, '-')} className={cur === i ? 'active' : ''} onClick={() => set(i)}>{t}</button>)}</div>;
}
export const useTab = () => useState(0);

export function Perf() {
  const { tvl, systemCR, spTotal, totalSupply, totalStaked, vaults } = useP();
  const supply = num(totalSupply);
  const cells: [string, ReactNode, ReactNode?][] = [
    ['Total value locked', usd(tvl), 'all collaterals'],
    ['System collateral ratio', systemCR ? (systemCR * 100).toFixed(2) + '%' : '–'],
    ['USDPM in stability pools', fmt(spTotal), supply ? ((spTotal / supply) * 100).toFixed(2) + '% of supply' : ''],
    ['PMNT staked', fmt(totalStaked)],
    ['USDPM supply', fmt(totalSupply)],
    ['Active vaults', String(vaults)],
  ];
  return (<div className="perf"><div className="col-h">Protocol Performance</div>
    <div className="strip" data-testid="perf">{cells.map(([k, v, s]) => <div className="cell" key={k}><span>{k}</span><b>{v}</b>{s && <small>{s}</small>}</div>)}</div></div>);
}

export function NeedWallet({ children }: { children: ReactNode }) {
  const { address } = useP();
  return address ? <>{children}</> : <div className="alert info">Connect a wallet (top right) to use this form. Stats are shown read-only.</div>;
}

/** Plain-language notice when the price feed has paused some actions for the selected collateral. */
export function PriceNotice({ only }: { only?: 'borrow' | 'redeem' }) {
  const { b, c } = useP();
  const showRisky = b.riskyPaused && only !== 'redeem';
  const showRed = b.redemptionsPaused && only !== 'borrow';
  if (!showRisky && !showRed) return null;
  return (<div className="alert warn" data-testid="price-notice">
    {showRisky && <p><b>New borrowing and collateral withdrawals are paused for {c.symbol}.</b> The price feed has not had a fresh price for over 2 hours, so it is unsafe to let anyone borrow more against an old price. You can still repay, add collateral and close your vault, and liquidations keep running. Everything reopens automatically as soon as a fresh price arrives.</p>}
    {showRed && <p><b>Redemptions are paused for {c.symbol}.</b> The two price sources disagree, or the feed has briefly lost its price, so a redemption could pay out at the wrong rate. They reopen automatically when the sources agree again. Liquidations are not affected.</p>}
  </div>);
}
