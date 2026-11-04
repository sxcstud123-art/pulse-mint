# How Pulse Mint works (plain English)

Pulse Mint lets people borrow a dollar coin, **USDPM**, by locking up crypto they already own. A second coin, **PMNT**,
rewards the people who keep the system safe and gives them a share of the fees.

## 1. Borrowing (vaults)
- You pick a coin to lock up: PLS (as WPLS), HEX, PLSX, INC, pDAI, eHEX or pWETH.
- You lock it in a **vault** and borrow USDPM against it. You don't pay interest, only a **one-off 0.5% fee** when you borrow.
- You must always lock more value than you borrow. The minimum is the coin's **MCR** (minimum collateral ratio). For example, with
  pWETH at 120% you need at least $120 of ETH for every $100 you borrow. Coins that swing in price more need more: HEX needs 175%, INC needs 200%.
- Every vault also sets aside **200 USDPM as a "liquidation reserve"**. You get it back when you close the vault.
- The smallest loan is 2,000 USDPM, including the reserve.
- To get your coins back, repay the USDPM and close the vault.

## 2. Liquidation (when a vault gets too risky)
If the price of your coin falls and your vault drops below its MCR, anyone can **liquidate** it:
- Your debt is cancelled, and you lose the collateral. You keep the USDPM you borrowed.
- The person who liquidates you gets the 200 USDPM reserve plus 0.5% of the collateral, as payment for doing it.
- The rest of the collateral goes to the **stability pool** (next section). If the pool is empty, the debt and collateral are shared among the other vaults instead.

## 3. Stability pool (earn by backing the system)
- Anyone can deposit USDPM in the stability pool for each coin.
- When a vault is liquidated, the pool's USDPM pays off its debt. In return the pool receives that vault's collateral, which is usually worth **more** than the debt (for example $110–$120 of coins for every $100 of debt).
- Depositors also earn **PMNT** every second.

## 4. Redemptions (what keeps USDPM near $1)
- Anyone can hand in USDPM and get **$1 worth of collateral per USDPM** (minus a 0.5% fee).
- The system always takes that collateral from the **riskiest vault first**, the one with the lowest ratio. That vault's debt goes down by the same amount, so its owner loses nothing in dollar terms. They just end up holding less of the coin.
- If USDPM trades below $1, people buy it cheaply and redeem it for $1, which pushes the price back up.

## 5. Staking PMNT (earn the fees)
- PMNT has a fixed supply of 100 million. No more can ever be created.
- Stake PMNT to receive the **borrowing fees** (paid in USDPM) and the **redemption fees** (paid in the collateral coins).

## 6. Safety switches
- **Recovery mode:** if the whole system for one coin drops below its **CCR** (for example 150% for pWETH), new borrowing must be extra-safe,
  you can't withdraw collateral, and you can't close vaults until things recover.
- **Debt caps:** each coin has a limit on how much USDPM can be borrowed against it. The limits are small for thin coins like INC and eHEX.
- **Prices:** a lending system is only as safe as its prices. On testnet we set prices by hand. For the real launch, prices come from
  PulseX averaged over time (a "TWAP"), which is hard to manipulate, with checks for thin pools, sudden jumps and outdated prices, plus a backup source.

## 7. What's real today
- It runs on the **PulseChain testnet** only, using **pretend coins and prices**.
- Before real money, it needs: a professional **security audit**, the real price feeds wired up, and final settings (fees, caps, PMNT split).
- Bugs in lending code can lose people's money. Never skip the audit.
