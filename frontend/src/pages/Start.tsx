import { useP, fmt, pct, priceStr } from '../data';
import { Perf } from '../ui/common';
import { Icons } from '../ui/icons';

const FEATURES = [
  ['borrow', 'Borrow USDPM', 'Lock PLS, HEX, PLSX, INC, pDAI, eHEX or bridged ETH and mint USDPM. You pay one 0.5% fee and no interest.', Icons.borrow],
  ['stability', 'Stability Pool', 'Deposit USDPM to absorb risky debt and collect the liquidated collateral at a discount, plus PMNT.', Icons.pool],
  ['staking', 'Stake PMNT', 'Earn the protocol fees: borrowing fees in USDPM and redemption fees in collateral.', Icons.stake],
  ['redemptions', 'Redemptions', 'Anyone can swap USDPM for $1 of collateral. This keeps USDPM close to $1.', Icons.redeem],
  ['liquidations', 'Liquidations', 'Vaults below their minimum ratio are closed by keepers, who are paid for it.', Icons.liq],
  ['analytics', 'Analytics', 'Live system health for every collateral: ratios, debt caps, deposits and history.', Icons.analytics],
] as const;

export default function Start({ go }: { go: (p: string) => void }) {
  const { branches } = useP();
  return (<div className="page">
    <div className="hero">
      <h1>Borrow on PulseChain. <em>Zero interest.</em></h1>
      <p>Pulse Mint turns your PulseChain assets into USDPM, an over-collateralised dollar stablecoin.
        There is no interest and no repayment schedule. Your vault stays open as long as it is safely collateralised.</p>
    </div>
    <div className="grid3">{FEATURES.map(([id, t, d, I]) => (
      <div className="card feature" key={id} onClick={() => go(id)} data-testid={'feature-' + id}><div className="ico"><I /></div><h4>{t}</h4><p>{d}</p></div>))}</div>

    <div className="card" style={{ marginTop: 22 }}><h3>How the pieces fit</h3>
      <div className="flow">
        <div className="node"><b>Borrowers</b><span className="note">lock collateral → mint USDPM</span></div><div className="arrow">→</div>
        <div className="node"><b>Stability pool</b><span className="note">USDPM absorbs bad debt → earns collateral</span></div><div className="arrow">→</div>
        <div className="node"><b>PMNT stakers</b><span className="note">collect borrowing and redemption fees</span></div>
      </div></div>

    <div style={{ marginTop: 22 }}><table><thead><tr><th>Collateral</th><th>Price</th><th>Min ratio</th><th>System ratio</th><th>Debt / cap (USDPM)</th><th>Vaults</th></tr></thead>
      <tbody>{branches.map((b) => (<tr key={b.c.symbol}><td><b>{b.c.symbol}</b></td><td>{priceStr(b.price)}</td><td>{pct(b.mcr)}</td><td>{b.debt ? pct(b.tcr) : '–'}</td><td>{fmt(b.debt, 18, 0)} / {fmt(b.cap, 18, 0)}</td><td>{String(b.size ?? '–')}</td></tr>))}</tbody></table></div>
    <Perf />
  </div>);
}
