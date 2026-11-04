# Pulse Mint White Paper
### A 0%-interest, multi-collateral stablecoin protocol for PulseChain
*Draft v0.1, 4 November 2026. Testnet preview, not audited.*

---

## 1. Overview
Pulse Mint is a decentralised borrowing protocol for PulseChain. Users lock one of seven supported tokens in a **vault** and mint **USDPM**, a stablecoin designed to track US$1.

Borrowing carries **0% interest**. The only cost is a small **one-off borrowing fee (0.5%)** added to the debt when USDPM is minted. A second token, **PMNT**, has a fixed supply. Staking it earns a share of protocol fees, and it is used to reward Stability Pool depositors.

The design follows the mechanics of Liquity v1 (MIT-licensed). It is re-implemented from scratch and extended to many collaterals, so each collateral runs in its own isolated **branch**. No Liquity v2 (BUSL-licensed) code is used.

**Status:**
- Fully deployed on the **PulseChain testnet v4 (chain 943)** with mock tokens and mock price feeds.
- Not audited.
- No mainnet contracts exist.

## 2. The problem
PulseChain holders who need dollar liquidity usually have to **sell** their assets and give up their exposure. The alternative is borrowing on platforms with **variable interest**, which grows the debt over time. A stablecoin that is:
- **over-collateralised**,
- **immutable**,
- free of interest rates set by governance, and
- redeemable at face value

offers a simpler, more predictable way to borrow. Supporting the ecosystem's main tokens in separate branches lets one token's risk stay contained.

## 3. How vaults work
A vault holds one user's collateral and debt for one branch.

| Rule | Value (from the contracts and deploy script) |
|---|---|
| Interest | 0% |
| Borrowing fee | 0.5% of USDPM drawn, one-off (`borrowFeeBps = 50`) |
| Liquidation reserve | 200 USDPM added to the debt, refunded on close (`gasComp = 200e18`) |
| Minimum debt | 2,000 USDPM including the reserve (`minDebt = 2000e18`) |
| Minimum collateral ratio (MCR) | Per collateral, 120%–200% (see section 9) |
| Debt cap | Per collateral (see section 9) |

**Operations:**
- **Open:** deposit collateral and choose the USDPM amount.
  - Debt = amount + fee + reserve.
  - The vault's ratio must be at least the MCR, and the system must stay out of recovery mode.
- **Adjust:** add or withdraw collateral, borrow more, or repay. Each change is re-checked against the same rules.
- **Close:** repay the debt minus the reserve and receive all collateral back.
- **Ordering:** vaults are kept on-chain in a list sorted by *nominal* collateral ratio, which doesn't depend on price. That way the riskiest vault can always be found cheaply.

## 4. USDPM and the peg
USDPM is minted only by branches and only against collateral. Every USDPM in circulation equals vault debt, a property checked by invariant tests. The peg holds through two mechanisms:

1. **Floor at about $1 (redemptions).** Anyone can hand in USDPM and receive **$1 of collateral per USDPM, minus a 0.5% redemption fee** (`redemptionFeeBps = 50`).
   - Redemptions take collateral from the **lowest-ratio vault first**, skipping vaults below MCR.
   - If USDPM trades under $1, redeeming it returns more than it costs to buy, and that buying pressure lifts the price.
   - A redeemed borrower loses no value: their debt falls by the same dollar amount as their collateral.
2. **Ceiling (over-collateralised minting).** If USDPM trades above $1, borrowers have a reason to mint and sell it. The 0.5% fee marks roughly the band above which minting becomes attractive.

## 5. 0% interest and the one-off fee
There is no ongoing interest. Debt never grows on its own.
- The **0.5% one-off borrowing fee** is charged in USDPM and sent to PMNT stakers.
- The **0.5% redemption fee** is charged in collateral and also goes to PMNT stakers.
- Both fees are fixed in code (`immutable`). Nobody can change them after deployment.

## 6. PMNT tokenomics, staking and issuance
| Item | Value |
|---|---|
| Total supply | **100,000,000 PMNT**, minted once at deployment. There is no mint function. |
| Stability Pool rewards | **32,000,000 PMNT (32%)** held by `CommunityIssuance` |
| Remaining | 68,000,000 PMNT, held by the deployer on testnet. The deploy script earmarks 3% for LP rewards and 65% for treasury/team, as placeholders. The final mainnet allocation and vesting are **not yet decided**. |

**Issuance** streams PMNT to each branch's Stability Pool at a fixed rate per second. Testnet rates:

| Branch | PMNT per second |
|---|---|
| WPLS | 0.10 |
| HEX | 0.08 |
| PLSX | 0.06 |
| INC | 0.03 |
| pDAI | 0.03 |
| eHEX | 0.05 |
| pWETH | 0.05 |
| **Total** | **0.40** |

At these rates the 32M pool would last about 80,000,000 seconds, roughly 2.5 years. Mainnet rates are not yet set.

**Staking:** PMNT stakers receive all borrowing fees (in USDPM) and redemption fees (in each collateral), in proportion to their stake. There is no lock-up. Fee income depends entirely on usage and is not guaranteed.

**LP rewards:** an `LPRewards` contract can stream PMNT to liquidity providers at a fixed rate for a fixed duration. It is not yet deployed or funded.

## 7. The Stability Pool and liquidations
A vault whose ratio falls **below its MCR** can be liquidated by anyone.
1. **Liquidator reward:** **0.5% of the collateral** (`LIQUIDATOR_BPS = 50`) plus the **200 USDPM reserve**.
2. **Stability Pool offset:** USDPM in the branch's Stability Pool cancels the vault's debt. Depositors receive the rest of the collateral in proportion to their share. Because liquidations happen below the MCR (120%–200%), this collateral is normally worth more than the USDPM used.
3. **Redistribution:** any debt the pool can't cover is shared, with its collateral, among the remaining vaults in proportion to their collateral.

Depositors also earn PMNT issuance. Withdrawals from the pool pause while a liquidatable vault exists, so depositors can't dodge pending losses. Claiming gains still works.

## 8. Recovery mode
Each branch has a **critical collateral ratio (CCR)**. If the branch's total ratio (TCR) falls below it, the branch enters recovery mode:
- no collateral withdrawals;
- vaults can't be closed;
- new vaults, and any extra borrowing, need a ratio of at least the CCR;
- repaying and adding collateral are always allowed.

Unlike Liquity v1, Pulse Mint does **not** liquidate vaults above MCR in recovery mode. It relies on these rules to protect the system instead.

## 9. The seven collaterals
| Collateral | MCR | CCR | Testnet debt cap (USDPM) |
|---|---|---|---|
| WPLS | 150% | 200% | 20,000,000 |
| HEX | 175% | 250% | 10,000,000 |
| PLSX | 150% | 200% | 10,000,000 |
| INC | 200% | 300% | 500,000 |
| pDAI | 150% | 200% | 5,000,000 |
| eHEX | 175% | 250% | 1,000,000 |
| pWETH | 120% | 150% | 20,000,000 |

Each branch is isolated. A failure in one collateral can't drain another branch's collateral. All parameters are `immutable`. The mainnet token addresses were checked against several independent sources: on-chain reads, PulseScan, CoinGecko, the Piteas list, PulseX pairs, and the OmniBridge mapping.

## 10. Oracles
On mainnet each branch would use a `RobustPriceFeed` that combines two sources:
- **Primary:** a **PulseX TWAP**, a time-weighted average price, via `PulseXTwapFeed`. Its safety checks:
  - a minimum averaging window, enforced at **10 minutes or more** in code;
  - a staleness limit;
  - a minimum pool liquidity;
  - a limit on how far the price can move in one update.
- **Fallback:** a second source. `ChainedPriceSource` can combine two TWAPs, for example HEX/WPLS × WPLS/USD.
- **Rules:**
  - Both sources healthy and in agreement: use the primary.
  - They disagree beyond a set spread: use the **lower** price.
  - Only one healthy: use that one.
  - Neither healthy: use the last good price ("Frozen").

Exact windows and limits will be set at mainnet deployment. Testnet uses mock feeds whose price the deployer can set, for testing only.

## 11. Security and audit plan
- **Tests:** 61 Foundry tests, all passing. They cover unit tests, fuzz tests (vault ops, liquidations, redemptions, the Stability Pool, recovery mode) and invariant tests that run random sequences of actions. The invariants check that:
  - USDPM supply equals system debt;
  - collateral bookkeeping balances;
  - the sorted list stays in order;
  - the Stability Pool stays solvent.
- **Static analysis:** Slither found no high-severity issues.
- **Internal review:** two bugs were fixed (see `docs/security-review.md`).
- **Open item:** on testnet the deployer wallet still controls the wiring contracts (USDPM, PMNTStaking, CommunityIssuance). Before mainnet this must be renounced, or moved to a multisig behind a timelock.
- **Plan:**
  1. External audit or audits.
  2. Fix and re-review.
  3. Public bug bounty.
  4. Capped mainnet.

## 12. Roadmap
1. **Testnet (now):** all seven branches live on PulseChain testnet v4, with the web app and analytics.
2. **Audit:** professional external review, then a public report and a bug bounty.
3. **Capped mainnet:** launch with low debt caps and locked-down admin roles, then raise caps gradually.

There are no dates yet. Each stage starts only after the previous one is complete.

## 13. Risks
- **Smart-contract risk:** bugs may exist despite testing. The code is unaudited.
- **Liquidation risk:** sharp price drops can liquidate vaults. Borrowers then lose their collateral but keep the USDPM they borrowed.
- **Oracle risk:** thin liquidity, manipulation or outages could produce wrong or stale prices.
- **Peg risk:** USDPM may trade away from $1, especially in stressed markets.
- **Collateral risk:** the value of a collateral token may collapse. Bridged tokens (pDAI, eHEX, pWETH) also depend on the bridge.
- **Stability Pool risk:** deposits shrink when used, and collateral gains may be worth less than expected if prices keep falling.
- **Admin-key risk** (until renounced): see section 11.
- **Regulatory risk:** rules on stablecoins and DeFi may change.

## 14. Disclaimer
This document describes software under development. It is not an offer, solicitation or financial advice, and nothing in it is a promise of returns or of a launch date. Parameters may change before any mainnet deployment. Use of the software is at your own risk. **Testnet preview, coming soon. Not financial advice. Crypto is risky.**
