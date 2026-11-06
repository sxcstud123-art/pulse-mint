// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PulseXTwapFeed} from "../src/oracles/PulseXTwapFeed.sol";
import {ChainedPriceSource} from "../src/oracles/ChainedPriceSource.sol";
import {RobustPriceFeed} from "../src/oracles/RobustPriceFeed.sol";
import {FetchOracleSource} from "../src/oracles/FetchOracleSource.sol";

/// @notice PulseChain MAINNET (369) oracle wiring for the 7 collaterals. NOT DEPLOYED.
/// Used today only by test/MainnetForkOracle.t.sol on a local fork. A future mainnet deploy script must
/// re-survey pool depth first (see deployments/pulsechain-mainnet-369-oracles.json).
///
/// Shape for every collateral (USD price, 18 dec):
///   primary  = token/WPLS TWAP (deepest PulseX pool) x WPLS/USDC TWAP (PulseX)
///   fallback = token/WPLS TWAP (a DIFFERENT PulseX pool)   x PLS/USD from Fetch Oracle (reporter oracle, not PulseX)
/// WPLS itself: primary = WPLS/USDC TWAP, fallback = Fetch PLS/USD (fully independent).
/// pDAI is priced from its live pDAI/WPLS market like any other token. It is NEVER treated as $1.
library MainnetOracleConfig {
    // ---- tokens (PulseChain mainnet) ----
    address constant WPLS  = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27; // 18
    address constant HEX   = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39; // 8
    address constant PLSX  = 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab; // 18
    address constant INC   = 0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d; // 18
    address constant PDAI  = 0x6B175474E89094C44Da98b954EedeAC495271d0F; // 18, forked DAI, NOT $1
    address constant EHEX  = 0x57fde0a71132198BBeC939B98976993d8D89D225; // 8, bridged HEX from Ethereum
    address constant PWETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // 18, forked WETH
    address constant USDC_E = 0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07; // 6, USDC bridged from Ethereum

    // ---- Fetch Oracle (independent fallback for the PLS/USD leg) ----
    address constant FETCH_ORACLE = 0xCe9DEa26eB6bEaEc73CFf3BACdF3F9e42BB89951;
    bytes32 constant FETCH_PLS_USD = 0x83245f6a6a2f6458558a706270fbcc35ac3a81917602c1313d3bfa998dcc2d4b;

    // ---- PulseX pairs (survey 6 Nov 2026, DexScreener) ----
    address constant P_WPLS_USDC   = 0x6753560538ECa67617A9Ce605178F788bE7E524E; // v1 ~ $645k
    address constant P_HEX_WPLS    = 0x19BB45a7270177e303DEe6eAA6F5Ad700812bA98; // v2 ~ $424k
    address constant P_HEX_WPLS_B  = 0xf1F4ee610b2bAbB05C635F726eF8B0C568c8dc65; // v1 ~ $298k
    address constant P_PLSX_WPLS   = 0x1b45b9148791d3a104184Cd5DFE5CE57193a3ee9; // v1 ~ $1.06m
    address constant P_PLSX_WPLS_B = 0x149B2C629e652f2E89E11cd57e5d4D77ee166f9F; // v2 ~ $430k
    address constant P_INC_WPLS    = 0xf808Bb6265e9Ca27002c0A04562Bf50d4FE37EAA; // v1 ~ $374k
    address constant P_INC_WPLS_B  = 0x5B9661276708202DD1A0dD2346A3856b00d3c251; // v2 ~ $108k
    address constant P_PDAI_WPLS   = 0xaE8429918FdBF9a5867e3243697637Dc56aa76A1; // v2 ~ $414k
    address constant P_PDAI_WPLS_B = 0x947b4633e32E0c7f2c76753B43F008480715416D; // v1 ~ $41k (thin)
    address constant P_EHEX_WPLS   = 0xF0eA3efE42C11c8819948Ec2D3179F4084863D3F; // v2 ~ $167k (thin)
    address constant P_EHEX_HEX    = 0x922723FC4de3122F7DC837E2CD2b82Dce9dA81d2; // v2 ~ $210k
    address constant P_PWETH_WPLS  = 0x7994d526A127979BcB9Ec7C98509BB5C7ebD78FD; // v2 ~ $67k (thin!)

    // ---- minQuoteReserve: ~45-50% of the quote (WPLS / USDC) side seen in the survey. If a pool loses
    // more than about half its depth the feed reports unsafe instead of trusting a now-cheap-to-move price.
    uint256 constant MIN_USDC_WPLS_USDC = 150_000e6;
    uint256 constant MIN_WPLS_HEX    = 18_000_000_000e18;
    uint256 constant MIN_WPLS_HEX_B  = 13_000_000_000e18;
    uint256 constant MIN_WPLS_PLSX   = 45_000_000_000e18;
    uint256 constant MIN_WPLS_PLSX_B = 18_000_000_000e18;
    uint256 constant MIN_WPLS_INC    = 17_000_000_000e18;
    uint256 constant MIN_WPLS_INC_B  = 4_500_000_000e18;
    uint256 constant MIN_WPLS_PDAI   = 18_000_000_000e18;
    uint256 constant MIN_WPLS_PDAI_B = 1_700_000_000e18;
    uint256 constant MIN_WPLS_EHEX   = 7_000_000_000e18;
    uint256 constant MIN_HEX_EHEX    = 40_000_000e8;
    uint256 constant MIN_WPLS_PWETH  = 3_000_000_000e18;

    uint256 constant PERIOD = 30 minutes;
    uint256 constant MAX_AGE = 2 hours;
    uint256 constant DEV_MAJOR = 2000; // 20% per period
    uint256 constant DEV_THIN = 3000;  // 30% per period (INC, eHEX, pDAI, pWETH)
    uint256 constant SPREAD_BPS = 500; // primary vs fallback must agree within 5%
    uint256 constant MAX_FROZEN_AGE = 2 hours;
    uint256 constant FROZEN_GRACE = 15 minutes;

    struct Feeds { address wpls; address hex_; address plsx; address inc; address pdai; address ehex; address pweth; }

    function _twap(address pair, address token, uint8 td, uint8 qd, uint256 minQ, uint256 dev) private returns (address) {
        return address(new PulseXTwapFeed(pair, token, td, qd, PERIOD, MAX_AGE, minQ, dev));
    }
    function _chain(address a, address b) private returns (address) { return address(new ChainedPriceSource(a, b)); }
    function _robust(address p, address f) private returns (address) {
        return address(new RobustPriceFeed(p, f, SPREAD_BPS, MAX_FROZEN_AGE, FROZEN_GRACE));
    }

    function build() internal returns (Feeds memory f) {
        address plsUsd = _twap(P_WPLS_USDC, WPLS, 18, 6, MIN_USDC_WPLS_USDC, DEV_MAJOR);
        address plsUsdFetch = address(new FetchOracleSource(FETCH_ORACLE, FETCH_PLS_USD, 20 minutes, 4 hours, 18));
        f.wpls = _robust(plsUsd, plsUsdFetch);
        f.hex_ = _robust(_chain(_twap(P_HEX_WPLS, HEX, 8, 18, MIN_WPLS_HEX, DEV_MAJOR), plsUsd),
                         _chain(_twap(P_HEX_WPLS_B, HEX, 8, 18, MIN_WPLS_HEX_B, DEV_MAJOR), plsUsdFetch));
        f.plsx = _robust(_chain(_twap(P_PLSX_WPLS, PLSX, 18, 18, MIN_WPLS_PLSX, DEV_MAJOR), plsUsd),
                         _chain(_twap(P_PLSX_WPLS_B, PLSX, 18, 18, MIN_WPLS_PLSX_B, DEV_MAJOR), plsUsdFetch));
        f.inc = _robust(_chain(_twap(P_INC_WPLS, INC, 18, 18, MIN_WPLS_INC, DEV_THIN), plsUsd),
                        _chain(_twap(P_INC_WPLS_B, INC, 18, 18, MIN_WPLS_INC_B, DEV_THIN), plsUsdFetch));
        f.pdai = _robust(_chain(_twap(P_PDAI_WPLS, PDAI, 18, 18, MIN_WPLS_PDAI, DEV_THIN), plsUsd),
                         _chain(_twap(P_PDAI_WPLS_B, PDAI, 18, 18, MIN_WPLS_PDAI_B, DEV_THIN), plsUsdFetch));
        // eHEX fallback: eHEX/HEX x HEX/WPLS(v1) x Fetch PLS/USD (different pools from the primary)
        f.ehex = _robust(_chain(_twap(P_EHEX_WPLS, EHEX, 8, 18, MIN_WPLS_EHEX, DEV_THIN), plsUsd),
                         _chain(_twap(P_EHEX_HEX, EHEX, 8, 8, MIN_HEX_EHEX, DEV_THIN),
                                _chain(_twap(P_HEX_WPLS_B, HEX, 8, 18, MIN_WPLS_HEX_B, DEV_MAJOR), plsUsdFetch)));
        // pWETH: only one usable PulseX pool today (~$67k). Fallback reuses it with Fetch for the USD leg, so
        // the token leg is NOT independent. Keep the pWETH debt cap very low (or delay the branch).
        address weth = _twap(P_PWETH_WPLS, PWETH, 18, 18, MIN_WPLS_PWETH, DEV_THIN);
        f.pweth = _robust(_chain(weth, plsUsd), _chain(weth, plsUsdFetch));
    }
}
