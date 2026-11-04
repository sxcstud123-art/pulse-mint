# Pulse Mint testnet UI walkthrough (PulseChain testnet v4, chain 943), 4 Nov 2026
The real web app (frontend/dist) was driven by headless Chromium (Playwright). The wallet was an injected EIP-1193 provider that
signs in Node with the throwaway deployer key. A second throwaway "tester" wallet made the riskier vault from a script.
Scripts: `e2e/run.mjs` (the full walkthrough) and `e2e/snapshot.mjs` (a read-only screenshot). Every tx and its explorer link is in `results.json`.

| # | Screenshot | What it shows |
|---|---|---|
| 01 | connected-home | Wallet connected on chain 943 |
| 02 | minted-test-wpls | 1B test WPLS minted |
| 03 | vault-opened | Vault: 1B WPLS, 5,000 USDPM borrowed (5,225 debt incl. fee and 200 reserve) |
| 04 | vault-view-collateral-ratio | Vault ratio 574%, system ratio 436%; the tester's riskier vault (242%) shown as riskiest |
| 05 | stability-pool-deposit | 4,000 USDPM in the stability pool |
| 06a | price-drop-liquidation-warning | Mock WPLS price $0.00003 → $0.000017; the tester vault at 137% is flagged "liquidatable" |
| 06b | after-liquidation | Liquidated: the pool absorbed 3,717.5 USDPM debt and gained 298.5M WPLS; the liquidator got 200 USDPM and 1.5M WPLS |
| 07a/07b | before/after-redemption | 500 USDPM redeemed for WPLS, taken from the riskiest vault |
| 08 | pmnt-staked | 1,000,000 PMNT staked |
| 09 | vault-closed | Vault closed: 4,525 USDPM repaid (debt minus the 200 reserve), collateral returned |
| 10 | final-state-after-ui-fixes | Read-only view after the small UI fixes |
