import { Title } from '../ui/common';
export default function Docs() {
  return (<div className="page docs"><Title t="Docs" sub="Pulse Mint in plain English" />
    <div className="card">
      <h3>Vaults</h3><p>Lock collateral and borrow USDPM. Each collateral has its own minimum collateral ratio (MCR): 120% for bridged ETH, 150% for PLS, PLSX and pDAI, 175% for HEX and eHEX, 200% for INC. Borrowing costs a one-off 0.5% fee. Every vault also holds a 200 USDPM liquidation reserve, which you get back when you close. The minimum debt is 2,000 USDPM.</p>
      <h3>Liquidations</h3><p>If a vault falls below its MCR, anyone can liquidate it. The stability pool pays off the debt and receives the collateral. If the pool is empty, the debt and collateral are shared among the other vaults. The liquidator is paid the 200 USDPM reserve plus 0.5% of the collateral.</p>
      <h3>Stability pool</h3><p>Deposit USDPM to earn liquidated collateral, usually worth more than the debt it covered, plus PMNT emissions.</p>
      <h3>Redemptions</h3><p>Anyone can exchange USDPM for $1 of collateral (minus 0.5%). The collateral is taken from the riskiest vault first, and that vault's debt goes down by the same amount.</p>
      <h3>Staking</h3><p>PMNT has a fixed supply of 100 million. Stakers receive the borrowing fees (USDPM) and redemption fees (collateral).</p>
      <h3>Safety</h3><ul><li><b>Recovery mode:</b> when a collateral's system ratio drops below its critical ratio (CCR), withdrawals and closing are paused and new debt must be extra-safe.</li><li><b>Debt caps</b> limit exposure to thin assets such as INC and eHEX.</li><li><b>Prices:</b> testnet uses manual mock prices. Mainnet would use PulseX time-weighted prices with a fallback.</li></ul>
      <div className="alert warn">Testnet prototype. The contracts are not audited. Do not use real funds.</div>
    </div></div>);
}
