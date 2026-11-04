# Pulse Mint – Security Self-Review (pre-audit)

*Date: 4 Nov 2026 (AEDT). Scope: every contract in `contracts/src`. This review was done internally. It is **not** an audit and does not replace one.*

## In one paragraph
I read every contract line by line, added 10 new fuzz tests and 2 new invariants (the test suite now has **61 tests, all passing**), and ran the Slither static analyser (100 automated notes, none serious). I found and fixed **2 code bugs**: one Medium and one Low. The most important open issue isn't a code bug. It's **who holds the admin keys** (see "Admin keys and control"). Right now one ordinary wallet controls things that must be locked down before mainnet.

## How to read the severity labels
| Label | Meaning in plain words |
|---|---|
| **Critical** | Someone could steal or freeze user funds right now. |
| **High** | Funds could be lost under realistic conditions, or one person has too much power. |
| **Medium** | Users could be treated unfairly, or funds could be at risk in unusual situations. |
| **Low** | Edge cases, rounding, or things that could go wrong only in rare cases. |
| **Info** | Not a problem. Good to know, or a design choice worth documenting. |

## What was checked
- **Vaults** (open, adjust, repay, close): minimum ratio, debt cap, minimum debt, the one-off fee and the 200 USDPM reserve.
- **Liquidations**: only vaults below the minimum ratio can be liquidated. Checked that the Stability Pool absorbs the debt, that leftovers are shared out to the other vaults, and that the liquidator's reward is correct.
- **Redemptions**: USDPM is swapped for $1 of collateral minus the fee. The riskiest vault must be hit first, and the slippage guard must work.
- **Stability Pool**: depositor losses and gains, and the pool must never owe more than it holds.
- **Recovery mode**: no withdrawing collateral, no closing, and new vaults need at least the CCR.
- **Staking and issuance**: how fees and PMNT rewards are paid out.
- **Oracles**: the PulseX TWAP, the fallback logic and frozen-price behaviour.
- **Admin powers**: who can change what.

## Tests now in place
| Suite | What it proves | Count |
|---|---|---|
| Protocol | Core flows end to end | 22 |
| Oracle | TWAP, fallback, price disagreement, frozen price | 12 |
| RecoveryMode | Recovery-mode rules | 10 |
| GasComp | The 200 USDPM liquidation reserve | 5 |
| **Security (new)** | Fuzz tests for vault ops, liquidations, redemptions, the SP and recovery mode (256 random runs each) | **10** |
| Invariant | Random sequences of actions (128 runs × 60 steps). Checks 7 invariants: the bookkeeping always balances, the sorted list stays in order, the SP is always solvent (new), and no active vault ever has debt below the minimum (new) | 2 entries |
| **Total** | | **61 passed, 0 failed** |

## Findings

### F-1 Stability Pool depositors could dodge a liquidation (**Medium – FIXED**)
**What it was:** When a vault drops below the minimum ratio, Stability Pool depositors are about to take a small loss in USDPM and receive more collateral in return. A depositor watching the chain could withdraw just before the liquidation, leaving everyone else to absorb it.
**Fix:** `withdrawFromSP` now refuses to withdraw while the riskiest vault is liquidatable. The error is "SP: liquidations pending". Claiming gains (`withdrawFromSP(0)`) still works. Liquity v1 has the same rule.
**Test:** `test_SPWithdrawBlockedWhileLiquidatable`.

### F-2 Stability Pool running product could, in theory, reach zero (**Low – FIXED**)
**What it was:** The pool tracks everyone's share with a running number called `P`. A very unusual run of liquidations that almost empty the pool could round `P` down to 0, which would break all later deposits. A similar issue was found in Liquity v1 after launch.
**Fix:** a hard check that `P` never becomes 0. The liquidation reverts instead of corrupting the pool.

### F-3 Admin keys are an ordinary wallet and ownership is not renounced (**High for mainnet – OPEN**)
See the next section. On testnet this is expected. It **must** be fixed before mainnet.

### F-4 Price feed: "frozen" price has no time limit (**Medium – OPEN, design**)
If both the main and the backup price sources fail, `RobustPriceFeed` keeps using the last good price indefinitely. During a long outage, vaults could be liquidated, or not liquidated, at an old price.
**Recommendation:** add a maximum age. After it, block new borrowing and redemptions, but still allow repaying and adding collateral.

### F-5 Price disagreement uses the lower price (**Low – OPEN, design**)
If the two sources differ by more than the allowed spread, the lower price is used. That is the safe choice for liquidations. It does mean redeemers get slightly more collateral per USDPM during such moments.
**Recommendation:** consider pausing redemptions while the sources disagree.

### F-6 Recovery mode does not liquidate vaults between MCR and CCR (**Info – design**)
Liquity v1 lets anyone liquidate vaults below the system ratio when in recovery mode. Pulse Mint deliberately does **not**: only vaults under the minimum ratio can ever be liquidated. This is kinder to borrowers. The trade-off is that the system relies on rules (no withdrawals, a high ratio for new vaults) rather than forced liquidations to recover.

### F-7 The last vault can't be liquidated if the Stability Pool is empty (**Low – OPEN, edge case**)
If only one vault is left and the SP can't cover its debt, there is nobody to share the debt with, so liquidation reverts. This needs the whole system to have shrunk to a single vault.

### F-8 Rewards accrue while the Stability Pool is empty (**Low – OPEN**)
PMNT issuance keeps accruing while nobody is in the SP. The first depositor afterwards collects that backlog at the next liquidation or deposit. It is a small fairness issue. Liquity v1 has a similar quirk.

### F-9 Staking has no lock-up (**Info**)
Someone could stake PMNT just before a large fee arrives and unstake right after. This is the same as Liquity v1 and accepted there.

### F-10 Slither results (**Info**)
- **"Reentrancy" (21 notes):** every state-changing Branch function has `nonReentrant`, and the tokens are standard ERC-20s chosen by us. No exploitable path found.
- **"Costly operations in a loop":** expected for redemptions and batch liquidations. Callers can cap redemption loops with `maxIterations`.
- **"Timestamp comparisons":** used only for TWAP windows and reward timing. That is safe.
- **Tidy-ups to do:** missing events on stake/unstake/setPrice, an unindexed event field, and an unused `stakeOut` line in `_liquidate`.

### F-11 Collateral must be a plain ERC-20 (**Info**)
Tokens that take a fee on transfer or change balances by themselves would break the bookkeeping. All 7 chosen collaterals are plain ERC-20s. Re-check this before adding any new token.

## Admin keys and control

**Who holds them right now (checked on the PulseChain testnet, chain 943, on 4 Nov 2026):** every admin role is held by the **deployer wallet `0x73b35907eC5bcc15cA56d7c87aCb4A5A60Ba0Fd4`**. That is a single ordinary wallet (one private key), not a multisig. **No ownership has been renounced.** There are **no upgradeable proxies and no pause switch** anywhere: contract code can't be changed after deployment.

| Contract | Role | Holder now | What that key can still do | Renounced? |
|---|---|---|---|---|
| **USDPM** | `owner` | Deployer | `addBranch(any address)`. A newly added "branch" can **mint unlimited USDPM**. This is the most dangerous power in the system. | No |
| **PMNTStaking** | `owner` | Deployer | `addRewardToken` and `addNotifier`. A malicious notifier could fake fee income, so stakers' balances would show rewards that other stakers' real fees then pay for. | No |
| **CommunityIssuance** | `owner` | Deployer | `setRate(address, rate)` can change any branch's PMNT emission rate. It can also be set for **any address**, which could then call `issue()` and **pull PMNT out of the 32M Stability Pool reward pot**. | No |
| **MockPriceFeed** ×7 (testnet only) | `owner` | Deployer | `setPrice`: sets any price, which can trigger liquidations. This is how we test on testnet. These mocks are **never** used on mainnet. | No |
| **RobustPriceFeed / PulseXTwapFeed** (mainnet design) | none | – | No admin functions. Sources and settings are fixed at deployment. | n/a |
| **Branch** ×7 | none | – | No admin functions. All ratios, fees, caps and the oracle are fixed (`immutable`). | n/a |
| **PMNT** | none | – | Fixed 100,000,000 supply minted once; there is no mint function. | n/a |
| **LPRewards** | none | – | Rate and duration fixed at deployment. | n/a |
| **Token balance** | – | Deployer | Holds the **68,000,000 PMNT** not sent to CommunityIssuance (the deploy script labels it 3% LP rewards plus 65% treasury/team placeholder). | – |

**In plain words:** the lending contracts themselves can't be changed by anyone. But three "wiring" contracts (USDPM, staking and issuance) still let the deployer add new pieces. A thief with that one key could mint USDPM, drain the PMNT reward pot, or skew staking rewards.

**Recommendation for mainnet:**
1. Deploy and wire everything in one script, then **renounce ownership** of `USDPM`, `PMNTStaking` and `CommunityIssuance` in the same run. This makes the system immutable, like Liquity v1.
2. If you want to add collaterals later, transfer ownership to a **multisig (for example 3-of-5 Safe) behind a 7-day timelock** instead. Anyone can then see a change coming and leave before it happens.
3. Better still, change `CommunityIssuance.setRate` so it only accepts registered branches, and make rates one-way locked. That removes the "drain the pot" path even for the owner.
4. Put the 68M non-issuance PMNT under a vesting contract or a multisig, and publish where it is.
5. Never use `MockPriceFeed` on mainnet. The deploy script already refuses any chain other than testnet (943) or local (31337).

## What still needs to happen before mainnet
- A professional external audit (recommended: two independent firms), then a public bug bounty.
- Fix F-3, and decide on F-4 and F-5.
- Launch with low debt caps (a "capped mainnet") and raise them slowly.
