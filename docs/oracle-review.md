# Pulse Mint – Oracle / Price-Feed Review

> **Update 6 Nov 2026 – fixes applied (code + tests; not yet on testnet/mainnet).** See §6 at the end.

*Date: 5 Nov 2026 (Australia/Sydney). Read-only review of `contracts/src/oracles/*` against Liquid Loans' known oracle issues and common oracle failure modes. No contracts were deployed or changed.*

---

## Plain-English summary

### What happened to Liquid Loans
Liquid Loans prices PLS in USD mainly through **Fetch Oracle** (a Tellor-style reporter oracle on PulseChain), with a **PulseX V2** fallback. Two separate things matter:

1. **Confirmed pre-launch design risks (Halborn audit, Jun–Jul 2023).** FetchCaller only accepts prices that are at least **15 minutes old** (so bad reports can be disputed). Halborn still found that a disputed bad price can stick in FetchCaller's cache (HAL-01, risk accepted), and that if both Fetch and the fallback fail, the protocol keeps using the **last good price forever** (HAL-02, risk accepted). The 15-minute delay itself was the main "fix" relative to the older Liquity/Tellor mistake of reading the newest report with no dispute window.

2. **Community complaint (~March 2024, Reddit).** Users reported redemptions and claimed liquidations at very high collateral ratios (e.g. "liquidated at 450%"), blaming a **price delay** between Liquid Loans' oracle and live DEX prices that bots could arbitrage. This matches the economics of any lagged oracle (Fetch's 15-minute buffer, or a TWAP window): when the protocol's price lags the market, redemptions or liquidations can look "wrong" vs what you see on PulseX. **No official Liquid Loans post-mortem** was found that confirms wrongful liquidations from a buggy price, or that names a specific on-chain patch for that Reddit thread. Treat the Reddit reports as **community claim / rumour** unless an official write-up appears. Confirmed docs still describe the 15-minute Fetch lag and the PulseX fallback rules.

**Related background (confirmed, Liquity on Ethereum, not Liquid Loans):** In Sep 2022 Liquity's Tellor fallback could be fed a fake price with no dispute delay. Tellor patched it with a 15-minute lag (Nov 2022). Fetch on PulseChain and Liquid Loans inherit that same design pattern.

### Is Pulse Mint exposed?
**Partly yes — different shape, same family of risks.**

Pulse Mint's mainnet design does **not** use Fetch/Tellor reporters, so it **avoids** Liquid Loans' FetchCaller cache bug (HAL-01). Instead each branch is meant to use:

- `PulseXTwapFeed` (primary) — time-weighted average from a PulseX pair, with window, staleness, min liquidity, and jump checks
- optional fallback via `RobustPriceFeed` / `ChainedPriceSource`
- if both fail → **last good price, status Frozen, with no expiry** (same structural issue as Liquid Loans HAL-02 / already filed here as F-4)

So Pulse Mint is **exposed** to:

| Risk | Liquid Loans | Pulse Mint today |
|---|---|---|
| Reporter fake-price / cache-after-dispute | Yes (Fetch HAL-01) | **No** (no FetchCaller) |
| Lagged price vs live DEX (arbitrage / odd redemptions) | Yes (15-min Fetch lag) | **Yes** (TWAP `period`, min 10 min) |
| Last-good price forever when both sources fail | Yes (HAL-02, accepted) | **Yes** (`RobustPriceFeed` Frozen, F-4) |
| Single-block spot manipulation | Secondary oracle (PulseX) if used raw | **Mostly mitigated** by TWAP + tests |
| Thin-pool manipulation | Possible on fallback | **Checked** via `minQuoteReserve` (must be sized per collateral) |
| Wrong decimals / wrong USD path | N/A (single PLS feed) | **Deploy risk** for 7 collaterals, especially pDAI ≠ $1 |
| Frozen feed during a real crash | Possible | **Yes** — large move flags TWAP unsafe; both sources can fail when liquidations are needed most |

Testnet still uses `MockPriceFeed` (owner-set prices). That is fine for testing only and must never ship on mainnet.

### Prioritised fixes (do before mainnet)
1. **P0 – Cap how long "Frozen / last good price" can be used.** After e.g. 1–4 hours, stop new borrows, liquidations and redemptions; still allow repay and add-collateral. Same recommendation Halborn gave Liquid Loans (HAL-02) and already noted here as F-4.
2. **P0 – Per-collateral mainnet oracle wiring plan.** Deep PulseX pools, correct decimals (HEX/eHEX = 8), and a true USD path. **Do not treat pDAI as $1** (forked DAI on PulseChain is unbacked and off-peg). Prefer WPLS/USD or bridged USDC/DAI pairs with enough depth; use `ChainedPriceSource` for HEX/PLSX/INC/eHEX via token/WPLS × WPLS/USD.
3. **P0 – Size `minQuoteReserve` from live pool depth**, especially INC and eHEX. Reject feeds whose quote side is thinner than the attack cost you care about.
4. **P1 – Independent fallback, not two correlated PulseX TWAPs.** If primary and fallback both die when PulseX is stressed, you freeze. Prefer a second venue or a Fetch/reporter feed **used correctly** (20-min buffer, staleness check, no sticky cache-after-dispute) as one of the two sources.
5. **P1 – Soften "large move → unsafe for one period".** Keep the circuit breaker, but ensure the fallback can still price a real crash so liquidations are not blocked exactly when prices gap down.
6. **P1 – Pause or restrict redemptions while status is `Disagree` or `Frozen`.** Lower-of-two (F-5) protects the system on liquidations but overpays redeemers when the feed is wrong.
7. **P2 – Keeper / monitoring.** Alert on `Frozen`, `Disagree`, `lastUpdateDeviated`, thin reserves, and age of `lastGoodPrice`. Optionally run a dispute/monitor bot if Fetch is used later.
8. **P2 – Document TWAP lag for users.** Same lesson as Liquid Loans: a delayed protocol price vs PulseX spot will create arb; that is expected, not a "bug", but users must keep healthy collateral ratios.

---

## 1. Liquid Loans research (sources + confidence)

### 1.1 Confirmed: architecture and docs
- **Primary:** Fetch Oracle PLS:USD.
- **Fallback to PulseX V2** when:
  - Fetch not updated for **> 4 hours**, or
  - Fetch call reverts / invalid price or timestamp, or
  - Price change between two consecutive Fetch updates **> 50%**.
- Source: [Liquid Loans docs – Stability Pool & Liquidations (oracle section)](https://docs.liquidloans.io/pulsechain/stability-pool-and-liquidations).

### 1.2 Confirmed: Halborn audit (20 Jun – 12 Jul 2023)
Report: [liquidloans.io/pulsechain/audit](https://www.liquidloans.io/pulsechain/audit).

| ID | Issue | Severity | Remediation |
|---|---|---|---|
| **HAL-01** | `FetchCaller` stores `lastStoredPrice`. After a 15-min delay a malicious report can be cached; if later disputed and removed from Fetch, the caller can still return the cached bad price (partially limited by 50% deviation check). | Low (2.2) | **Risk accepted.** Off-chain automated dispute bots. |
| **HAL-02** | If both Fetch and secondary fail, `PriceFeed.fetchPrice()` returns **last good price indefinitely** → stale pricing, bad liquidations/redemptions/arb. Halborn recommended **revert** instead. | Low (4.1) | **Risk accepted.** Team argued reverting would freeze all vault ops; preferred keeping close/redeem paths. |
| HAL-03 | Fallback oracle address not validated at `setAddresses`. | Low | **Solved** (commit ba8022f). |

Executive summary also notes: *FetchCaller now returns the last price returned by the oracle with at least a 15-minute delay.*

### 1.3 Confirmed: Fetch Oracle integration guidance
[Fetch user checklists](https://docs.fetchoracle.com/getting-data/user-checklists) recommend:
- `_getDataBefore(queryId, block.timestamp - 20 minutes)` (dispute buffer; LL used 15 minutes),
- staleness checks (e.g. require age &lt; 24h),
- mitigations for back-in-time disputes after a value is removed.

### 1.4 Confirmed background: Liquity Tellor issue (Ethereum)
- [Liquity blog – Tellor Issue and Fix](https://www.liquity.org/blog/tellor-issue-and-fix) (22 Nov 2022).
- [GitHub advisory GHSA-5x6p-646h-mmgj](https://github.com/liquity/dev/security/advisories/GHSA-5x6p-646h-mmgj) (1 Jun 2023): even with a correct 15-min lag, fallback to Tellor can enable undercollateralized troves, delayed resync, and redemption value leak when the lagged price diverges from spot.
- Exploited on **ETHW fork**, not Ethereum mainnet (Chainlink never failed for Liquity mainnet).

### 1.5 Community / rumour: high-CR liquidations & redemptions (~Mar 2024)
- Reddit: [Liquidation & redemption collateral going higher and higher](https://www.reddit.com/r/LiquidLoans/comments/1b89hu2/liquidation_redemption_collateral_going_higher/) — user claimed liquidation at **450%** and blamed **oracle delay vs DEX** arb. Other users echoed heavy redemptions.
- **Not confirmed** by an official Liquid Loans incident report or on-chain post-mortem found in this research pass.
- Plausible mechanism (economics, not proven for that thread): lagged Fetch price below live PLS/USD → redemptions pay more PLS per USDL than spot; bots redeem; riskiest vaults shrink; some UIs/users mislabel redemption as liquidation. True wrongful liquidation at 450% ICR would require the **protocol** price to be far below market (or recovery-mode rules) — possible under stale/wrong oracle, but **not proven** here.
- Community video updates exist (e.g. CC on Fetch Oracle / redemptions on Odysee) but no reliable transcript confirming a specific "we fixed a wrong price bug" claim was retrieved.

### 1.6 What we did **not** find
- No confirmed report of PulseX TWAP manipulation draining Liquid Loans.
- No confirmed mainnet mass wrongful-liquidation post-mortem from the Liquid Loans team.
- Official X account `@liquidloansio` posts in the sampled window did not yield a clear oracle-incident announcement (search coverage limited).

---

## 2. Pulse Mint oracle code (read-only)

Files reviewed:
- `contracts/src/oracles/PulseXTwapFeed.sol`
- `contracts/src/oracles/RobustPriceFeed.sol`
- `contracts/src/oracles/ChainedPriceSource.sol`
- `contracts/src/oracles/IPriceFeed.sol`, `IPriceSource.sol`
- `contracts/src/oracles/MockPriceFeed.sol` (testnet only)
- `contracts/test/Oracle.t.sol` (12 oracle tests)
- Cross-check: `docs/security-review.md` F-4 / F-5, `docs/whitepaper.md` §10, `Branch.sol` (always calls `priceFeed.fetchPrice()` on sensitive paths)

### 2.1 Intended mainnet design
Per whitepaper / comments:
1. **Primary:** `PulseXTwapFeed` on a deep PulseX pair.
2. **Fallback:** second `IPriceSource` (often `ChainedPriceSource` of two TWAPs, e.g. HEX/WPLS × WPLS/USD).
3. **Wrapper:** `RobustPriceFeed(primary, fallback, maxSpreadBps)`:
   - both ok + within spread → primary
   - both ok + disagree → **lower** price (`Disagree`)
   - one ok → that one
   - neither → `lastGoodPrice`, status **`Frozen`** (requires `lastGoodPrice > 0`)

Testnet: seven `MockPriceFeed`s owned by deployer — **not** for mainnet.

### 2.2 What `PulseXTwapFeed` already does well
| Check | Code | Tests |
|---|---|---|
| Min TWAP window ≥ 10 minutes | constructor `require(_period >= 10 minutes)` | basic / not-ready tests |
| Staleness (`maxAge`) | `tryFetch` requires `block.timestamp - twapUpdatedAt <= maxAge` | `test_twap_staleness` (update refreshes age) |
| Min quote liquidity | `quoteReserve() >= minQuoteReserve` | `test_twap_thinLiquidityRejected` |
| Jump / deviation circuit breaker | `_deviation(p, twap) > maxDeviationBps` → `lastUpdateDeviated`, `ok=false` | `test_twap_largeMoveFlaggedThenRecovers` |
| Spot spike diluted over window | cumulative UniV2-style TWAP | `test_twap_resistsOneBlockSpike` |
| Decimals | `_toPrice` uses `tokenDecimals` + `quoteDecimals` | HEX 8-dec path in tests |
| Failure soft-signals | `tryFetch` returns `ok=false` instead of revert | used by `RobustPriceFeed` |

Anyone calling `tryFetch` / `fetchPrice` also calls `update()`, so Branch operations that touch price keep the TWAP moving without a separate keeper (a dedicated keeper is still wise for UX freshness).

### 2.3 Failure-mode checklist vs Liquid Loans / common oracle bugs

#### A. Stale price with no time limit — **OPEN (Medium, = F-4)**
`RobustPriceFeed` when both sources fail:

```solidity
else { require(lastGoodPrice > 0, "no price"); p = lastGoodPrice; st = Status.Frozen; }
lastGoodPrice = p; status = st;
```

There is **no** `maxFrozenAge`. Identical in spirit to Liquid Loans **HAL-02**. During a long dual outage, liquidations/redemptions/borrows can run at an arbitrarily old price.

**Recommended fix:** store `lastGoodPriceUpdatedAt`. If `block.timestamp - lastGoodPriceUpdatedAt > MAX_FROZEN_AGE` (suggest 1–4 hours, tunable per collateral volatility):
- `fetchPrice()` should revert for **borrow, redeem, liquidate**;
- Branch should still allow **repay / add collateral** via a separate `peekPrice` or by treating Frozen+expired as "collateral ops only".  
If Branch cannot split paths easily, prefer revert-all on expired Frozen over infinite stale (availability loss &lt; solvency loss), matching Halborn's advice.

#### B. Single-block spot manipulation — **Mostly mitigated**
TWAP averages over `period` (≥ 10 min). Tests show a one-block 100× spike then unwind moves the TWAP only slightly.  
**Residual risk:** sustained multi-block / multi-period manipulation in a thin pool, or manipulating through the **entire** `period` so the next observation locks in a bad average. Mitigate with high `minQuoteReserve` and a non-PulseX fallback.

#### C. Too little liquidity in pools read — **Mitigated in code, open at deploy**
`minQuoteReserve` is immutable per feed. Deploy must set it from **current** PulseX depth for each of the 7 collaterals. Thin tokens (**INC**, **eHEX**) are the weak spots. Re-check before raising debt caps.

#### D. Wrong decimals — **Deploy-time risk**
Feed constructor takes `_tokenDec` / `_quoteDec`. HEX and eHEX are **8 decimals**; others 18. A wrong value silently scales USD price by 10^(18−8)=1e10. Add deploy asserts + a mainnet fork test that `fetchPrice()` is within ~5–10% of an independent reference for each collateral.

#### E. Sudden jump with no deviation check — **Mitigated on TWAP; nuance on Robust**
TWAP flags `lastUpdateDeviated` and returns `ok=false` for that update (price is still written so the feed can recover next period).  
`RobustPriceFeed` then falls to fallback or Frozen.  
**Gap:** a **real** flash crash can look like a "manipulation jump". Primary goes unsafe; if fallback is a similar TWAP on a correlated pool, both fail → Frozen at **pre-crash** price → **liquidations may not run** while vaults are underwater on mark-to-market. That is the opposite failure mode from wrongful liquidation, but still dangerous for system solvency.

**Recommended fix:** on large moves, prefer "use fallback if healthy" (already happens) and/or a shorter secondary TWAP / reporter feed; optionally allow liquidations at `min(primary, fallback, lastGood)` with explicit status rather than freezing entirely.

#### F. Fallback switching — **Present, conservative**
Disagree → lower price (good for liquidations, bad for redeemers — F-5). No automatic switch-back hysteresis beyond "next call re-evaluates". Consider pausing redemptions on `Disagree` / `Frozen`.

#### G. Frozen price feed — **Present; no unwind policy**
Status `Frozen` is visible via `status()` and `PriceUsed` events — good for keepers/UI. Missing: expiry, user-facing pause messaging, and Branch behaviour differentiation (see A).

#### H. FetchCaller-style cache-after-dispute — **Not applicable**
Pulse Mint does not include a Fetch/Tellor caller. If you later add Fetch as fallback, implement Fetch's **20-minute** buffer, staleness, and **do not** keep returning a cached value after Fetch has removed it (avoid HAL-01). Prefer the [Fetch reference integration](https://docs.fetchoracle.com/getting-data/user-checklists).

#### I. ChainedPriceSource — **OK with caveats**
`pa * pb / 1e18` with Solidity 0.8 overflow checks. Both legs must be ok. Error compounds: if WPLS/USD is wrong, every chained collateral is wrong. Prefer the deepest WPLS/USD (or USDC) pool as the shared USD leg, with its own Robust wrapper.

#### J. pDAI / USD path — **Critical deploy note**
`Deploy.s.sol` and README state **pDAI is not $1** (PulseChain forked DAI, unbacked). Pricing pDAI vaults as $1 would massively overvalue collateral. Mainnet feed for pDAI must be **pDAI/USD** (or pDAI/WPLS × WPLS/USD) from actual market pools, never a hard-coded 1e18.

#### K. Correlated sources
If both primary and fallback are PulseX TWAPs, a PulseX outage or chain-wide liquidity shock fails both. Liquid Loans' Fetch + PulseX split is more diverse. Pulse Mint should aim for **heterogeneous** sources (TWAP + Fetch, or TWAP + another DEX / bridge-aware feed for pWETH/eHEX).

---

## 3. Recommended code / config changes (not applied)

These are recommendations only; nothing was edited in contracts.

### 3.1 `RobustPriceFeed` — expire Frozen
- Add `uint256 public lastGoodPriceUpdatedAt` (update whenever a **live** source price is used: PrimaryOk, Disagree, FallbackOnly, PrimaryOnly).
- Add immutable `maxFrozenAge`.
- When both sources fail:
  - if `lastGoodPrice == 0` → revert (already);
  - if age ≤ `maxFrozenAge` → return last good, status Frozen;
  - if age &gt; `maxFrozenAge` → revert `"price frozen too long"` (or return ok=false via a new `tryFetchPrice` for Branch to branch on).

### 3.2 `Branch` — degrade gracefully when feed is expired/Frozen
- Allow: `repay`, `addColl`, full close that only burns debt.
- Block: `openTrove`, increase debt, `redeem`, `liquidate` when price is expired-Frozen.
- Optional: block `redeem` whenever `status == Disagree || status == Frozen`.

### 3.3 `PulseXTwapFeed` — tuning defaults (suggested starting points)
| Param | Busy majors (WPLS, pWETH, PLSX) | Thin / volatile (INC, eHEX, HEX) |
|---|---|---|
| `period` | 30 minutes | 30–60 minutes |
| `maxAge` | 2 hours | 2–3 hours |
| `maxDeviationBps` | 2000 (20%) | 2500–3000 |
| `minQuoteReserve` | Set from 2% depth / attack budget (USD notionals in quote token) | Higher relative to debtCap |

Final numbers need a live PulseX depth survey at deploy time.

### 3.4 Mainnet wiring sketch (all 7)
| Collateral | Primary idea | Fallback idea |
|---|---|---|
| WPLS | TWAP WPLS/USD-stable (deepest USDC/DAI-bridged or equivalent) | Fetch PLS:USD **if** integrated safely, or second DEX TWAP |
| HEX | TWAP HEX/WPLS × WPLS/USD (`ChainedPriceSource`) | Alternate HEX pool or longer TWAP |
| PLSX | TWAP PLSX/WPLS × WPLS/USD | Alternate pool |
| INC | TWAP INC/WPLS × WPLS/USD; **strict** minQuoteReserve; low debtCap | Conservative: consider delaying INC branch until depth exists |
| pDAI | TWAP pDAI/USD or pDAI/WPLS × WPLS/USD (**not $1**) | Second pool |
| eHEX | Same pattern as HEX; watch bridge + thin liquidity | Alternate / delay if thin |
| pWETH | TWAP pWETH/WPLS × WPLS/USD or pWETH/stable | Bridged ETH reference if available |

Each branch: `new RobustPriceFeed(primary, fallback, maxSpreadBps)` with `maxSpreadBps` around 300–500 (3–5%) unless volatility demands wider.

### 3.5 Tests to add before mainnet
- Frozen past `maxFrozenAge` reverts (or blocks risky Branch ops).
- Fork tests: each collateral feed within band of DexScreener/PulseX spot over a calm window.
- Simulated dual-oracle failure during a −40% crash: assert liquidations still possible via fallback **or** system stops new debt and documents unwind.
- pDAI feed ≠ 1e18 on a mainnet fork.
- Decimals fuzz: wrong dec in constructor caught by deploy script asserts.

### 3.6 Ops
- Index `PriceUsed` / `TwapUpdated` events; alert on Frozen, Disagree, `deviated=true`, quote reserve &lt; 1.2× min.
- Keep debt caps low until oracles and pools prove stable (capped mainnet).
- Never deploy `MockPriceFeed` on chain 369 (PulseChain mainnet).

---

## 4. Confidence legend
| Label | Meaning |
|---|---|
| **Confirmed** | Primary docs, audit PDF, or protocol blog/advisory |
| **Community / rumour** | Reddit/Telegram/video claims without official post-mortem |
| **Design inference** | Economic consequence of documented lag/TWAP behaviour |

---

## 5. Source list
1. https://www.liquidloans.io/pulsechain/audit — Halborn assessment (HAL-01, HAL-02, 15-min Fetch delay)
2. https://docs.liquidloans.io/pulsechain/stability-pool-and-liquidations — Fetch primary, PulseX V2 fallback rules
3. https://docs.liquidloans.io/audits — LL audit index
4. https://docs.fetchoracle.com/getting-data/user-checklists — 20-min buffer, staleness, dispute guidance
5. https://www.liquity.org/blog/tellor-issue-and-fix — Liquity Tellor lag fix (context for Fetch design)
6. https://github.com/liquity/dev/security/advisories/GHSA-5x6p-646h-mmgj — Liquity fallback lag risks
7. https://www.reddit.com/r/LiquidLoans/comments/1b89hu2/liquidation_redemption_collateral_going_higher/ — community high-CR / delay claims (**rumour**)
8. Internal: `docs/security-review.md` (F-4, F-5), `docs/whitepaper.md` §10, `contracts/src/oracles/*`, `contracts/test/Oracle.t.sol`

---

*End of review. No contract code was modified or deployed in producing this document.*


---

## 6. Fixes applied (6 Nov 2026)

Owner's pause rules (override §3 where they differ): only **new borrowing and collateral withdrawal** pause on a stale price; **repay, add collateral, close and liquidations always work**; redemptions pause on Disagree/Frozen; short glitches pause nothing.

| # | Fix | Where |
|---|---|---|
| 1 | `RobustPriceFeed` now records `lastGoodPriceUpdatedAt` (only on live prices) and exposes `fetchPriceWithFlags() → (price, riskyPaused, redemptionsPaused)`. Frozen ≤ 15 min (`frozenGrace`): no pause. Frozen > 15 min: redemptions pause. Last live price > 2 h (`maxFrozenAge`): borrow + withdraw pause. Disagree: redemptions pause immediately, lower price still used for liquidations. The feed never reverts once it has a first price, so liquidations keep running. | `src/oracles/RobustPriceFeed.sol`, `IPriceFeed.sol` |
| 1 | `Branch`: `openTrove` and `adjustTrove` with `borrow > 0` or `collOut > 0` revert while `riskyPaused`; `redeem` reverts while `redemptionsPaused`. Repay, add collateral, `closeTrove`, `liquidate`, `batchLiquidate`, Stability Pool untouched. | `src/Branch.sol` |
| 2 | Mainnet wiring for all 7 collaterals with verified decimals (HEX/eHEX 8, USDC 6, rest 18). Every collateral is token/WPLS TWAP × WPLS/USDC TWAP. **pDAI is priced from its pDAI/WPLS market, never $1** (≈ $0.00114 on 6 Nov 2026). | `script/MainnetOracleConfig.sol`, `deployments/pulsechain-mainnet-369-oracles.json` |
| 3 | `minQuoteReserve` set to ~45–50 % of each pool's live quote-side depth (DexScreener, 6 Nov 2026). | same |
| 4 | New `FetchOracleSource` (Fetch Oracle, PulseChain `0xCe9D…9951`, PLS/USD queryId `0x8324…2d4b`): 20-min dispute buffer, 4-h staleness, **no cached value** (avoids LL HAL-01). Fallback for every collateral = a *different* PulseX pool for the token leg × Fetch PLS/USD for the USD leg. | `src/oracles/FetchOracleSource.sol` |
| 5 | Frontend notices on Borrow / Redemptions / Liquidations; Docs page + how-to guide explain TWAP lag and pauses. | `frontend/src` , `docs/how-to-use-pulse-mint.md` |
| 6 | Tests: `test/OraclePause.t.sol` (8) and `test/MainnetForkOracle.t.sol` (2, read-only fork; all 7 feeds agree with Fetch within 5 %). | `contracts/test` |

**Remaining gaps (documented, not solved):**
- The **token leg** (HEX, PLSX, INC, pDAI, eHEX, pWETH vs WPLS) still comes only from PulseX in both primary and fallback (different pools, same venue). Fetch only reports PLS/USD today. If Fetch adds per-token feeds, plug them in via `FetchOracleSource`.
- **pWETH** has one usable PulseX pool (~$67k); its fallback reuses the same token pool. **eHEX** and **pDAI** fallback pools are thin. Keep their debt caps very low or launch those branches later.
- `minQuoteReserve` values are a snapshot; re-survey right before any mainnet deploy.
- The "large move flags TWAP unsafe" circuit breaker can still freeze a real crash at the pre-crash price if both sources trip; liquidations keep running at the last good price, but may lag. Monitor + keeper still recommended (§3.6).
- Testnet still uses `MockPriceFeed` (now with the same flags interface, owner-settable for demos).
