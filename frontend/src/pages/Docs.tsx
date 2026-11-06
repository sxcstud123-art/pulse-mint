import { Title } from '../ui/common';
export default function Docs() {
  return (<div className="page docs"><Title t="Docs" sub="Pulse Mint in plain English" />
    <div className="card">
      <h3>Vaults</h3><p>Lock collateral and borrow USDPM. Each collateral has its own minimum collateral ratio (MCR): 120% for bridged ETH, 150% for PLS, PLSX and pDAI, 175% for HEX and eHEX, 200% for INC. Borrowing costs a one-off 0.5% fee. Every vault also holds a 200 USDPM liquidation reserve, which you get back when you close. The minimum debt is 2,000 USDPM.</p>
      <h3>Liquidations</h3><p>If a vault falls below its MCR, anyone can liquidate it. The stability pool pays off the debt and receives the collateral. If the pool is empty, the debt and collateral are shared among the other vaults. The liquidator is paid the 200 USDPM reserve plus 0.5% of the collateral.</p>
      <h3>Stability pool</h3><p>Deposit USDPM to earn liquidated collateral, usually worth more than the debt it covered, plus PMNT emissions.</p>
      <h3>Redemptions</h3><p>Anyone can exchange USDPM for $1 of collateral (minus 0.5%). The collateral is taken from the riskiest vault first, and that vault's debt goes down by the same amount.</p>
      <h3>Staking</h3><p>PMNT has a fixed supply of 100 million. Stakers receive the borrowing fees (USDPM) and redemption fees (collateral).</p>
      <h3>Safety</h3><ul><li><b>Recovery mode:</b> when a collateral's system ratio drops below its critical ratio (CCR), withdrawals and closing are paused and new debt must be extra-safe.</li><li><b>Debt caps</b> limit exposure to thin assets such as INC and eHEX.</li></ul>
      <h3>Prices and pauses</h3>
      <p>Prices use a short average over the last 30 minutes on PulseX (a TWAP), checked against a second, independent source (the Fetch Oracle PLS/USD price). The average makes the price very hard to fake with one big trade, but it means the app's price can <b>lag a fast market</b> by a few minutes. That is expected, not a bug. Keep a healthy collateral ratio so a quick drop doesn't catch you out.</p>
      <ul>
        <li><b>A short glitch of a few minutes pauses nothing.</b></li>
        <li><b>If the two price sources disagree, or the feed loses its price for more than 15 minutes,</b> redemptions pause until they agree again. Liquidations keep working.</li>
        <li><b>If there has been no fresh price for over 2 hours,</b> new borrowing and collateral withdrawals pause too. Repaying, adding collateral, closing your vault and liquidations always stay open. Everything reopens by itself when a fresh price arrives.</li>
        <li>pDAI is priced from its real PulseX market. It is <b>not</b> a $1 stablecoin.</li>
      </ul>
      <p>The app shows a yellow notice on the Borrow, Redemptions and Liquidations pages whenever a pause is on. Testnet uses manual mock prices; the pause rules above are built into the mainnet price feed.</p>
      <div className="alert warn">Testnet prototype. The contracts are not audited. Do not use real funds.</div>
    </div></div>);
}
