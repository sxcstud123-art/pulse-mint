# How to use Pulse Mint – a plain-English guide

> **Testnet preview.** Pulse Mint currently runs only on the PulseChain **testnet** (v4, chain 943), using free test tokens. It has not been audited. Nothing here is financial advice, and crypto is risky.
>
> Screenshots are in `redesign-screenshots/`. Each step below names the file to show, so this guide can be turned straight into tutorial videos. Pages come in `-light.png` and `-dark.png` versions.

---

## 1. What is Pulse Mint?
Pulse Mint lets you **borrow USDPM**, a dollar-pegged stablecoin, by locking up crypto you already own. You can lock any of 7 coins: **WPLS, HEX, PLSX, INC, pDAI, eHEX or pWETH**. You keep the upside of your coins while getting dollars to use.

- **0% interest.** Your debt never grows over time.
- **A small one-off fee** of 0.5% is added when you borrow. That's it.
- **PMNT** is the protocol's token. Stake it to earn a share of the fees.

📸 Show: `page-01-start-light.png` (Start Here page: features, how it works, collateral list)

---

## 2. Connect your wallet
Click **Connect** at the top right. Once connected, the pill shows your address and "PulseChain Testnet v4".

📸 Show: `flow-01-connected-start.png`

---

## 3. Open a vault (borrow USDPM)
1. Go to **Borrow USDPM** in the left menu.
2. Pick your collateral at the top, for example **WPLS**. The % next to each coin is its *minimum ratio*.
3. On testnet only, click **"Get 1,000,000,000 test WPLS"** to get free test coins. 📸 `flow-02-minted-wpls.png`
4. Type how much to **deposit**, and how much USDPM to **borrow**. The 25/50/75/100% buttons fill amounts in for you.
5. Check the right-hand panel:
   - **Borrowing fee (0.5%)**: the one-off fee.
   - **Liquidation reserve: 200 USDPM.** It's held aside and given back when you close.
   - **Collateral ratio**: how safe your vault is.
   - **Liquidation price**: the coin price at which your vault could be liquidated.
6. Click **Open vault** and approve in your wallet. 📸 `flow-03a-open-vault-form.png` → `flow-03b-vault-opened.png`

Rules:
- The minimum debt is **2,000 USDPM**, including the 200 reserve.
- Each collateral has a total **debt cap**, shown under the stats.

📸 Your vault afterwards: `flow-04-vault-view-ratio.png`

| Collateral | Minimum ratio (MCR) | Recovery-mode ratio (CCR) |
|---|---|---|
| WPLS | 150% | 200% |
| HEX | 175% | 250% |
| PLSX | 150% | 200% |
| INC | 200% | 300% |
| pDAI | 150% | 200% |
| eHEX | 175% | 250% |
| pWETH | 120% | 150% |

---

## 4. Repay and close
- **Repay some:** on Borrow, switch to the **Repay** tab, type an amount and confirm. Your ratio goes up, so your vault gets safer.
- **Add collateral:** deposit more on the Borrow tab to make your vault safer.
- **Close:** on the Repay tab, click **Close vault**. You pay back the debt minus the 200 reserve, which is returned, and get **all** your collateral back.

📸 `flow-09a-repay-tab.png` → `flow-09b-vault-closed.png`

---

## 5. The Stability Pool (earn by backing the system)
Deposit USDPM into the **Stability Pool**. When a risky vault is liquidated, the pool pays off its debt and **you receive that vault's collateral**, usually worth more than the USDPM used. You also earn **PMNT rewards**.

1. Go to **Stability Pool**, type an amount and click **Deposit**. 📸 `flow-05-stability-deposit.png`
2. After a liquidation, your collateral gain appears on the right. 📸 `flow-06c-stability-gains.png`
3. Click **Claim** to collect gains, or use the **Withdraw** tab.

Notes:
- Your USDPM deposit shrinks a little each time it is used to pay off debt.
- While a liquidation is waiting to happen, withdrawals pause until it's done. Claiming still works.

📸 Page view: `page-03-stability-light.png`

---

## 6. Staking PMNT
Stake PMNT to earn a share of **every borrowing fee (paid in USDPM)** and **every redemption fee (paid in the collateral coin)**.

1. Go to **Staking (PMNT)**, type an amount and click **Stake**. 📸 `flow-08-pmnt-staked.png`
2. Pending rewards for each coin are listed on the right. Click **Claim** any time.

📸 Page view: `page-04-staking-light.png`

---

## 7. Redemptions (how USDPM stays near $1)
Anyone can swap **1 USDPM for $1 worth of collateral**, minus a 0.5% fee. It is taken from the **riskiest vault first**. If USDPM ever trades below $1, people can buy it cheaply and redeem it for $1 of collateral, which pushes the price back up.

1. Go to **Redemptions**, type an amount and check "next vault to be redeemed". 📸 `flow-07a-redemption-form.png`
2. Click **Redeem**. 📸 `flow-07b-after-redemption.png`

**If you are a borrower:** being redeemed is not a loss. Your debt goes down by the same dollar amount as the collateral taken. Keeping a higher ratio makes it less likely to happen to you.

---

## 8. Liquidations
If your vault's ratio falls **below the minimum** (for example under 150% for WPLS), anyone can liquidate it:
- Your debt is paid off by the Stability Pool.
- Your collateral goes to pool depositors.
- The liquidator gets **0.5% of the collateral plus the 200 USDPM reserve**.
- **You keep the USDPM you borrowed, but lose the collateral.**

The **Liquidations** page lists every vault, riskiest first. Ratios under the minimum show in red, and only those vaults have an active **Liquidate** button.

📸 `flow-06a-liquidations-table-warning.png` (a vault at 137% in red) → `flow-06b-after-liquidation.png`

---

## 9. Staying safe
- **Keep your ratio well above the minimum.** Prices of PLS, HEX and the other coins can drop fast. Many users aim for 250% or more.
- **Watch your liquidation price** on the Borrow page and the **system ratio** in the top bar.
- **Recovery mode:** if the whole system's ratio drops below the recovery level (CCR), the top bar shows it. Then:
  - you can't withdraw collateral or close your vault;
  - new vaults need at least the CCR.
  Repaying and adding collateral always work.
- **Prices are a short average, so they can lag.** Pulse Mint uses a 30-minute average price from PulseX (a "TWAP"), checked against a second, independent source (the Fetch Oracle PLS/USD price). This makes the price very hard to fake with one big trade, but in a fast market the app's price can be a few minutes behind what you see on PulseX. That's expected, so keep a healthy ratio.
- **Price pauses (you'll see a yellow notice on the page):**
  - A short glitch of a few minutes pauses nothing.
  - If the two price sources disagree, or the feed loses its price for more than 15 minutes, **redemptions pause**. Liquidations keep working.
  - If there has been **no fresh price for over 2 hours**, **new borrowing and collateral withdrawals pause** too.
  - **Repaying, adding collateral, closing your vault and liquidations always stay open.** Everything reopens by itself when a fresh price comes back.
- **pDAI is not $1.** It is priced from its real PulseX market like every other coin.
- **Only use the official site and check contract addresses.**
- **Never share your seed phrase.** Pulse Mint will never ask for it.
- **Unaudited, testnet only.** Don't use real funds until there has been an audit and a mainnet launch.

---

## 10. Analytics and Docs
- **Analytics** shows live charts built from on-chain data: USDPM supply, collateral locked, value and debt per collateral, ratio per branch, and Stability Pool deposits. 📸 `page-07-analytics-light.png` / `page-07-analytics-dark.png`
- **Docs** covers the basics inside the app. 📸 `page-08-docs-light.png`
- The **light/dark** switch is the sun/moon button at the top right. Compare any `-light` and `-dark` pair.

---

## Quick facts
| Item | Value |
|---|---|
| Interest | 0% |
| Borrowing fee | 0.5% one-off |
| Redemption fee | 0.5% |
| Minimum debt | 2,000 USDPM (includes the 200 reserve) |
| Liquidation reserve | 200 USDPM, refunded when you close |
| Liquidator reward | 0.5% of the collateral + 200 USDPM |
| PMNT supply | 100,000,000, fixed |

*Testnet preview, coming soon. Not financial advice. Crypto is risky.*
