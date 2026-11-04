# Pulse Mint – 15 short video scripts (Instagram Reels, TikTok, X)

Rules used throughout:
- Say "0% interest, small one-off fee". Never say "free".
- No profit or yield promises.
- Screenshots are in `redesign-screenshots/`.
- Every video ends with the same closing card:

> **Closing (VO + on-screen):** "Testnet preview, coming soon. Not financial advice. Crypto is risky."

---

### 1. FAQ: "Do I pay interest?" (15s)
- **Hook:** "Borrowing… with no interest ticking up? Here's the catch."
- **VO:** "On Pulse Mint your debt doesn't grow over time. 0% interest. You pay a small one-off fee of 0.5% when you borrow. That's the catch."
- **On-screen:** "0% interest" → "0.5% one-off fee" → "Debt doesn't grow"
- **Show:** `flow-03a-open-vault-form.png` (zoom on "Borrowing fee (0.5%)")
- **Closing card.**

### 2. Myth-busting: "Stablecoins are just printed from nothing" (30s)
- **Hook:** "Myth: stablecoins are printed out of thin air."
- **VO:** "Every USDPM is minted against collateral locked in a vault, at 120% or more depending on the coin. The contracts track every coin of debt, and anyone can check on-chain."
- **On-screen:** "MYTH ❌" → "Backed by locked collateral ✅" → "Check it on-chain"
- **Show:** `page-07-analytics-light.png` (value locked vs debt), `page-01-start-light.png`
- **Closing card.**

### 3. Day in the life of a vault (45s)
- **Hook:** "POV: you're a Pulse Mint vault."
- **VO:**
  - "8am: someone locks WPLS and borrows USDPM. I'm born at a healthy ratio."
  - "Noon: PLS dips. My ratio drops, but I'm still above 150%."
  - "3pm: my owner adds collateral. Phew."
  - "Evening: they repay and close. All the collateral goes home, and the 200 reserve is returned."
- **On-screen:** clock stamps "8:00 / 12:00 / 15:00 / 20:00"
- **Show:** `flow-03b-vault-opened.png` → `flow-04-vault-view-ratio.png` → `page-02-borrow-light.png` → `flow-09b-vault-closed.png`
- **Closing card.**

### 4. Safety tip: your liquidation price (20s)
- **Hook:** "The one number every borrower should screenshot."
- **VO:** "Your liquidation price. If your coin falls to it, your vault can be liquidated. Pulse Mint shows it right next to your vault. Keep a wide buffer."
- **On-screen:** "Know your liquidation price" → "Leave a buffer"
- **Show:** `flow-04-vault-view-ratio.png` (highlight "Liquidation price")
- **Closing card.**

### 5. Comparison: selling vs borrowing against your coins (30s)
- **Hook:** "Need dollars but don't want to sell your PLS?"
- **VO:** "Option one: sell, and lose your exposure. Option two: lock it in a vault and borrow USDPM, with 0% interest and a small one-off fee. The risk: if the price drops too far, you can be liquidated."
- **On-screen:** split screen "SELL" vs "BORROW" → "Risk: liquidation"
- **Show:** `page-02-borrow-dark.png`, `flow-06a-liquidations-table-warning.png`
- **Closing card.**

### 6. FAQ: "What's the 200 USDPM reserve?" (15s)
- **Hook:** "Why is there 200 USDPM extra on my debt?"
- **VO:** "It's a liquidation reserve. It pays whoever liquidates a risky vault. If you close normally, you get it back."
- **On-screen:** "200 USDPM reserve" → "Returned when you close"
- **Show:** `flow-03a-open-vault-form.png`, `flow-09b-vault-closed.png`
- **Closing card.**

### 7. Myth-busting: "Redemption means I got rugged" (30s)
- **Hook:** "Got redeemed? You didn't lose money. Here's why."
- **VO:** "Redemption swaps USDPM for $1 of collateral, starting from the riskiest vault. Your debt drops by the same dollar amount as the collateral taken. It's what keeps USDPM near $1."
- **On-screen:** "Redeemed ≠ rugged" → "Debt ↓ = Collateral ↓ (same $)"
- **Show:** `flow-07a-redemption-form.png`, `flow-07b-after-redemption.png`
- **Closing card.**

### 8. Explainer: the Stability Pool in 20 seconds (20s)
- **Hook:** "Who pays off bad debt? This pool."
- **VO:** "Deposit USDPM into the Stability Pool. When a vault is liquidated, the pool cancels its debt and depositors receive its collateral, plus PMNT rewards. Your deposit can shrink, so understand it first."
- **On-screen:** "USDPM in → collateral + PMNT out" → "Deposits can shrink"
- **Show:** `flow-05-stability-deposit.png`, `flow-06c-stability-gains.png`
- **Closing card.**

### 9. Safety tip: recovery mode (25s)
- **Hook:** "See this warning in the top bar? Here's what it means."
- **VO:** "If the whole system's ratio dips below the recovery level, Pulse Mint locks collateral withdrawals and asks new vaults for a higher ratio. Repaying and adding collateral still work."
- **On-screen:** "Recovery mode = protect the system" → "Repay ✅ Add collateral ✅"
- **Show:** `page-06-liquidations-light.png` (top bar system ratio)
- **Closing card.**

### 10. Launch hype: 7 collaterals (15s)
- **Hook:** "One app. Seven coins."
- **VO:** "WPLS, HEX, PLSX, INC, pDAI, eHEX, pWETH. Each one has its own vault rules. Testnet now."
- **On-screen:** coin chips pop in one by one
- **Show:** `page-02-borrow-light.png` (collateral selector)
- **Closing card.**

### 11. FAQ: "What does staking PMNT do?" (20s)
- **Hook:** "Where do Pulse Mint's fees go?"
- **VO:** "To PMNT stakers. Borrowing fees are shared in USDPM, and redemption fees in the collateral coin. Rewards depend on activity and aren't guaranteed."
- **On-screen:** "Fees → PMNT stakers" → "Not guaranteed"
- **Show:** `flow-08-pmnt-staked.png`, `page-04-staking-dark.png`
- **Closing card.**

### 12. Comparison: light vs dark mode (15s)
- **Hook:** "Team light or team dark?"
- **VO:** "Same app, your vibe. Flip the switch top right."
- **On-screen:** a swipe wipe between the two images, "Light ☀️ / Dark 🌙"
- **Show:** `page-01-start-light.png` ↔ `page-01-start-dark.png`, `page-07-analytics-light.png` ↔ `-dark.png`
- **Closing card.**

### 13. Myth-busting: "Anyone can liquidate me any time" (25s)
- **Hook:** "Can a random person liquidate your vault? Only if…"
- **VO:** "…your ratio falls below the minimum. Healthy vaults can't be touched. The Liquidate button stays greyed out for them. Keep your ratio up and you stay in control."
- **On-screen:** "Only below the minimum ratio" → "Healthy = greyed out"
- **Show:** `flow-06a-liquidations-table-warning.png` (red 137% vs greyed-out buttons)
- **Closing card.**

### 14. Safety tip: three habits (30s)
- **Hook:** "Three habits before you open any vault."
- **VO:** "One: borrow less than the max. The 100% button isn't a target. Two: check the official contract addresses. Three: never share your seed phrase. No real team will ask for it."
- **On-screen:** "1 Borrow less than max" / "2 Check addresses" / "3 Seed phrase = never"
- **Show:** `flow-03a-open-vault-form.png`, `page-08-docs-light.png`
- **Closing card.**

### 15. Launch hype: road to mainnet (30s)
- **Hook:** "Where Pulse Mint is right now. Honest version."
- **VO:** "Built and running on testnet. Next comes a security audit. Then a mainnet launch with low debt caps that grow slowly. No shortcuts."
- **On-screen:** roadmap "Testnet ✅ → Audit ⏳ → Capped mainnet 🔜"
- **Show:** `page-07-analytics-dark.png`, `page-01-start-dark.png`
- **Closing card.**
