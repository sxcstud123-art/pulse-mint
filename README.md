# Pulse Mint — multi-collateral lending protocol for PulseChain

Tokens: **Pulse Mint (PMNT)**, the fixed-supply governance/fee token, and **Pulse Mint USD (USDPM)**, the USD stablecoin.

A Liquity / Liquid Loans-style protocol: lock collateral in a vault, borrow USDPM (USD stablecoin) with a one-off fee,
no interest. **UNAUDITED PROTOTYPE, testnet only.**

## Layout
- `contracts/` (Foundry)
  - `src/Branch.sol`: one per collateral. Vaults (troves), liquidations, redistribution, redemptions, recovery mode, stability pool (Liquity product/sum maths, PMNT rewards)
  - `src/USDPM.sol`: stablecoin, minted and burned only by branches
  - `src/PMNT.sol`: fixed 100M supply, no mint function
  - `src/PMNTStaking.sol`: stake PMNT, earn borrowing fees (USDPM) and redemption fees (each collateral)
  - `src/CommunityIssuance.sol`: streams PMNT to each branch's stability pool at its own rate
  - `src/LPRewards.sol`: stake PulseX LP tokens to earn PMNT
  - `src/oracles/`: `IPriceFeed` (pluggable), `MockPriceFeed` (testnet), `PulseXTwapFeed` (rough sketch, untested)
  - `src/mocks/MockERC20.sol`: test stand-ins for the collateral tokens
  - `script/Deploy.s.sol`: testnet deploy, reads `DEPLOYER_PRIVATE_KEY` from env, refuses any chain except 943/31337
  - `test/`: Foundry tests
- `frontend/`: Vite + React + wagmi/viem. Connect wallet, pick a collateral, open/close vault, stability pool, PMNT staking

## Collateral settings (Deploy.s.sol; placeholder values)
| Coll | Dec | MCR | CCR | Debt cap |
|---|---|---|---|---|
| WPLS (native PLS, wrapped) | 18 | 150% | 200% | 20M |
| HEX | 8 | 175% | 250% | 10M |
| PLSX | 18 | 150% | 200% | 10M |
| INC | 18 | 200% | 300% | 500k |
| pDAI | 18 | 150% | 200% | 5M |
| eHEX (bridged) | 8 | 175% | 250% | 1M |
| pWETH (bridged ETH) | 18 | 120% | 150% | 20M |

## Mainnet address verification (PulseChain 369, read-only, 30 Oct 2026)
Sources used:
- **(A) On-chain reads over RPC** of name, symbol, decimals, totalSupply and code
- **(B) PulseScan API** (api.scan.pulsechain.com) for source-verification status and holder counts
- **(C) CoinGecko** `coins/pulsechain/contract/<addr>`
- **(D) Piteas token list** (github.com/piteasio/app-tokens)
- **(E) PulseX liquidity:** `getPair(token, WPLS)` on the V1 and V2 factories, and the WPLS held in each pair
- **(F) OmniBridge on-chain mapping**, read on the PulseChain home mediator `0x4fD0aaa7506f3d9cB8274bdB946Ec42A1b8751Ef`. Its `mediatorContractOnOtherSide()` is the Ethereum ForeignOmnibridge `0x1715a3E4…A10D`, and its AMB is `0x6ef79FD6…8b2b`.
- **(G) Ethereum mainnet reads:** bytecode comparison and the balances locked in the bridge
- **(H) Community docs:** hexikani pulsechain-docs, cryptospecting.com, hexbonds.com

| Item | Address | Sources that agree | Discrepancies / notes | Verdict |
|---|---|---|---|---|
| WPLS | 0xA1077a294dDE1B09bB078844df40758a5D0f9a27 | A "Wrapped Pulse"/WPLS/18; B verified, ~177k holders; C wrapped-pulse-wpls; D; both PulseX routers' `WPLS()`; H | none | ✅ Confirmed |
| HEX (PulseChain copy) | 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39 | A HEX/8; G bytecode hash identical to Ethereum HEX (a fork copy); B verified, ~381k holders; C hex-pulsechain; D; E V2 pair holds ~38.9B WPLS | It is the **forked copy**, separate from Ethereum HEX. That is the intended "HEX" collateral | ✅ Confirmed |
| PLSX | 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab | A PulseX/PLSX/18; B verified, ~232k holders; C pulsex; D; E V1 pair ~100.7B WPLS; H | none | ✅ Confirmed |
| INC | 0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d | A Incentive/INC/18; B verified; C pulsex-incentive-token; D; E V1 pair ~34.3B WPLS; H | The same address on Ethereum is a bridge validator contract. Irrelevant on 369 | ✅ Confirmed |
| pDAI (forked DAI) | 0x6B175474E89094C44Da98b954EedeAC495271d0F | A "Dai Stablecoin"/DAI/18; G bytecode hash identical to Ethereum DAI (a fork copy); B verified; C dai-on-pulsechain; D (as "pDAI"); PulseX Extended list; E V2 pair ~40.2B WPLS | The on-chain symbol is "DAI". It is **unbacked and not $1**. Bridged DAI ("Dai from Ethereum") is a different token | ✅ Confirmed (as the forked pDAI) |
| eHEX (bridged HEX) | 0x57fde0a71132198BBeC939B98976993d8D89D225 | F `bridgedTokenAddress(Ethereum HEX)` returns this address, and `nativeTokenAddress(this)` returns Ethereum HEX; token `owner()`/`bridgeContract()` = home mediator; A "HEX from Ethereum"/HEX/8; G HEX locked on Ethereum ≈ 1.167e18 raw vs eHEX supply ≈ 1.164e18; C pulsechain-bridged-hex-pulsechain; D (as "eHEX"); E V2 pair ~15.9B WPLS | **The PulseScan source shows as not verified.** Its bytecode is the same TokenProxy as pWETH's (same code hash, same implementation `0x539a69de…ba11`), and pWETH's is verified | ✅ Confirmed (the explorer label is cosmetic) |
| pWETH (bridged WETH) | 0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C | F `bridgedTokenAddress(WETH 0xC02aaA39…6Cc2)` returns this address, and the reverse lookup returns WETH; owner = home mediator; A "Wrapped Ether from Ethereum"/WETH/18; G WETH locked ≈ 4,002 vs supply ≈ 3,971; B verified TokenProxy; C pulsechain-bridged-weth-pulsechain; D; E V1 pair ~55.2B WPLS | The on-chain symbol is "WETH", not "pWETH" | ✅ Confirmed |
| PulseX V1 router | 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02 | A `factory()` = V1 factory and `WPLS()` = WPLS; B verified PulseXRouter02, tagged "Official"; H (3 sites) | Same contract name as V2. Only `factory()` tells them apart | ✅ Confirmed |
| PulseX V1 factory | 0x1715a3E4A142d8b698131108995174F37aEBA10D | A ~65k pairs; B verified PulseXFactory; H | On **Ethereum** this address is the OmniBridge mediator, so always check the chain | ✅ Confirmed |
| PulseX V2 router | 0x165C3410fC91EF562C50559f7d2289fEbed552d9 | A `factory()` = V2 factory and `WPLS()` = WPLS; B verified, with constructor args (V2 factory, WPLS); H | The PulseX app itself swaps via a separate Swap Router, 0xDA9aBA4e…3Bba, per hexbonds (not used here) | ✅ Confirmed |
| PulseX V2 factory | 0x29eA7545DEf87022BAdc76323F373EA1e707C523 | A ~191k pairs, init-code hash 0x5dff1ac2… matches the router library; B verified; H; same `feeToSetter` as V1 (0x3a27c0a6…F091) | none | ✅ Confirmed |

Limits of this check:
- PulseX publishes no official address page. The app.pulsex.com bundle fetched was a landing page with no addresses in it, and the official PulseX default token list on npm has no chain-369 entries. PulseX attribution therefore rests on on-chain links, explorer verification and community docs.
- The OmniBridge mediator address came from a community page (cryptospecting). It is self-consistent on both chains: each mediator points at the other, the AMBs match, and the bridged tokens' owner is that mediator. It was not taken from the official bridge repository.
- Before mainnet, re-run these reads and pin the addresses in the deploy script.

Fees: 0.5% borrowing fee, 0.5% redemption fee. Minimum debt is 2,000 USDPM, which includes a 200 USDPM liquidation reserve that is refunded on close. A liquidator gets that 200 USDPM plus 0.5% of the vault's collateral.

## Commands
```
cd contracts && forge test
DEPLOYER_PRIVATE_KEY=... forge script script/Deploy.s.sol --rpc-url pulsechain_testnet --broadcast   # later, testnet only
cd frontend && npm i && npm run dev   # put the deployed addresses in src/config.ts
```

## Oracles
`MockPriceFeed` is for testnet only. For a real launch, each collateral needs a manipulation-resistant feed, for example:
- a PulseX V1/V2 TWAP (see `PulseXTwapFeed`) over deep pairs (WPLS/DAI-from-Ethereum, HEX/WPLS, PLSX/WPLS), routing
  through WPLS for the thin ones, with staleness and deviation checks;
- a second source (Pyth, or Chainlink/Redstone if they cover PulseChain) with fallback logic, the way Liquity uses Chainlink with Tellor as backup.
Thin tokens (INC, eHEX) are easy to manipulate. Give them low debt ceilings or leave them out.

## Licensing
- Liquity v1 is MIT. Liquity v2 ("BOLD") is **BUSL-1.1** (licensor Liquity AG, change date 2027-09-01, then GPL-2.0+),
  so production use before then is limited to Liquity's additional-use grant. **No v2 code is used here.**
- This repo is a fresh MIT implementation of the Liquity v1 mechanics, rebuilt per collateral. It does not copy v1 files.

## Known limitations / TODO before mainnet
Done since the first version: per-collateral debt caps; an on-chain sorted vault list so redemptions always hit the riskiest vault first;
a 200 USDPM liquidation reserve; a PulseX TWAP feed with a fallback wrapper (`RobustPriceFeed`); invariant fuzzing.

Still open:
- Fees are fixed (0.5%). Liquity's base rate, which rises with redemptions and decays over time, is not implemented. Redemptions run one branch at a time, with no routing across collaterals.
- Recovery mode blocks risky actions, but there are no recovery-mode liquidations of vaults between MCR and CCR.
- If hints are wrong, the sorted-list insert walks from the head. That costs O(n) gas, so a frontend must compute hints (`getInsertPosition`) once there are many vaults.
- Batch liquidations take a caller-supplied list. There is no "liquidate N riskiest" from the tail yet.
- Withdrawing from the stability pool is not blocked while liquidatable vaults exist (Liquity blocks it).
- The deploy script still uses mock feeds. A mainnet deploy script that wires `PulseXTwapFeed` + `ChainedPriceSource` + `RobustPriceFeed` for each collateral is still to do, and so is a keeper that calls `update()` on the TWAPs.
- The USDPM owner must `renounceOwnership()` after wiring the branches. The PMNT split and vesting are placeholders. `LPRewards` is not deployed by the script.
- Invariant runs are modest (128 x 60 calls, one branch, 6 actors). Liquidations are rare in those runs. Longer campaigns and multi-branch handlers are recommended.
- Needs an independent security audit, a formal review of the sorted-list and stability-pool maths, and a bug bounty.
