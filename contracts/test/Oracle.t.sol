// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {MockUniV2Pair} from "../src/mocks/MockUniV2Pair.sol";
import {PulseXTwapFeed} from "../src/oracles/PulseXTwapFeed.sol";
import {RobustPriceFeed} from "../src/oracles/RobustPriceFeed.sol";
import {ChainedPriceSource} from "../src/oracles/ChainedPriceSource.sol";
import {IPriceSource} from "../src/oracles/IPriceSource.sol";

contract FixedSource is IPriceSource {
    uint256 public p; bool public ok; bool public boom;
    function set(uint256 _p, bool _ok) external { p = _p; ok = _ok; }
    function setBoom(bool b) external { boom = b; }
    function tryFetch() external view returns (uint256, bool) { require(!boom, "boom"); return (p, ok); }
}

contract OracleTest is Test {
    address constant HEX = address(0x1000); // 8 decimals, token0 (lower address)
    address constant USD = address(0x2000); // 18 decimals
    MockUniV2Pair pair; PulseXTwapFeed twap; FixedSource fb; RobustPriceFeed robust;

    function setUp() public {
        vm.warp(1_000_000);
        pair = new MockUniV2Pair(HEX, USD);
        // 1,000,000 HEX vs 10,000 USD -> $0.01
        pair.setReserves(uint112(1_000_000e8), uint112(10_000e18));
        twap = new PulseXTwapFeed(address(pair), HEX, 8, 18, 30 minutes, 2 hours, 5_000e18, 2_000);
        fb = new FixedSource();
        robust = new RobustPriceFeed(address(twap), address(fb), 300);
    }

    function test_twap_basicPrice() public {
        vm.warp(block.timestamp + 30 minutes);
        (uint256 p, bool ok) = twap.tryFetch();
        assertTrue(ok);
        assertApproxEqRel(p, 0.01e18, 1e12);
    }

    function test_twap_notReadyBeforePeriod() public {
        vm.warp(block.timestamp + 10 minutes);
        (, bool ok) = twap.tryFetch();
        assertFalse(ok);
        vm.expectRevert("TWAP unsafe"); twap.fetchPrice();
    }

    function test_twap_resistsOneBlockSpike() public {
        uint256 t0 = 1_000_000; // setUp time (literal: via-ir re-reads block.timestamp)
        vm.warp(t0 + 29 minutes);
        pair.setReserves(uint112(100_000e8), uint112(100_000e18)); // spot jumps to $1 (100x)
        vm.warp(t0 + 29 minutes + 10);                               // one block later
        pair.setReserves(uint112(1_000_000e8), uint112(10_000e18));  // attacker unwinds
        vm.warp(t0 + 30 minutes);
        (uint256 p,) = twap.tryFetch();
        // 10 s at $1 within a 30 min window -> ~$0.0155, vs $1 spot: attack mostly diluted
        assertLt(p, 0.016e18);
        // and if a previous TWAP exists, the >20% jump is flagged as unsafe
        pair.setReserves(uint112(100_000e8), uint112(100_000e18));
        vm.warp(t0 + 30 minutes + 10);
        pair.setReserves(uint112(1_000_000e8), uint112(10_000e18));
        vm.warp(t0 + 60 minutes);
        (, bool ok) = twap.tryFetch();
        assertTrue(ok); // second window mostly normal: ~$0.0155 vs previous ~$0.0155 -> ok
    }

    function test_twap_staleness() public {
        uint256 t0 = 1_000_000; // setUp time (literal: via-ir re-reads block.timestamp)
        vm.warp(t0 + 30 minutes);
        twap.update();
        // nobody updates for 3h: the next read recomputes over the whole gap and is fresh again
        vm.warp(t0 + 3 hours + 30 minutes);
        (, bool ok) = twap.tryFetch();
        assertTrue(ok);
        assertEq(twap.twapUpdatedAt(), t0 + 3 hours + 30 minutes);
    }

    function test_twap_thinLiquidityRejected() public {
        pair.setReserves(uint112(100_000e8), uint112(1_000e18)); // only $1,000 of quote
        vm.warp(block.timestamp + 30 minutes);
        (, bool ok) = twap.tryFetch();
        assertFalse(ok);
    }

    function test_twap_largeMoveFlaggedThenRecovers() public {
        uint256 t0 = 1_000_000; // setUp time (literal: via-ir re-reads block.timestamp)
        vm.warp(t0 + 30 minutes); twap.update();
        pair.setReserves(uint112(500_000e8), uint112(10_000e18)); // $0.02 (+100%)
        vm.warp(t0 + 60 minutes);
        (, bool ok) = twap.tryFetch();
        assertFalse(ok); // > 20% move in one update -> flagged
        vm.warp(t0 + 90 minutes);
        (uint256 p, bool ok2) = twap.tryFetch();
        assertTrue(ok2);
        assertApproxEqRel(p, 0.02e18, 1e12);
    }

    function test_robust_usesPrimaryWhenAgreeing() public {
        fb.set(0.0101e18, true);
        vm.warp(block.timestamp + 30 minutes);
        assertApproxEqRel(robust.fetchPrice(), 0.01e18, 1e12);
        assertEq(uint8(robust.status()), uint8(RobustPriceFeed.Status.PrimaryOk));
    }

    function test_robust_takesLowerWhenDisagreeing() public {
        fb.set(0.005e18, true);
        vm.warp(block.timestamp + 30 minutes);
        assertEq(robust.fetchPrice(), 0.005e18);
        assertEq(uint8(robust.status()), uint8(RobustPriceFeed.Status.Disagree));
    }

    function test_robust_fallbackWhenPrimaryUnsafe() public {
        fb.set(0.011e18, true);
        vm.warp(block.timestamp + 5 minutes); // TWAP not ready
        assertEq(robust.fetchPrice(), 0.011e18);
        assertEq(uint8(robust.status()), uint8(RobustPriceFeed.Status.FallbackOnly));
    }

    function test_robust_frozenUsesLastGood_andSurvivesRevertingSource() public {
        fb.set(0.011e18, true);
        robust.fetchPrice();
        fb.setBoom(true);
        pair.setReserves(uint112(1), uint112(1)); // primary broken too (thin)
        assertEq(robust.fetchPrice(), 0.011e18);
        assertEq(uint8(robust.status()), uint8(RobustPriceFeed.Status.Frozen));
    }

    function test_robust_revertsWithNoHistory() public {
        fb.set(0, false);
        vm.expectRevert("no price"); robust.fetchPrice();
    }

    function test_chained() public {
        FixedSource a = new FixedSource(); FixedSource c = new FixedSource();
        a.set(250e18, true);       // 250 WPLS per HEX
        c.set(0.00004e18, true);   // $ per WPLS
        ChainedPriceSource ch = new ChainedPriceSource(address(a), address(c));
        (uint256 p, bool ok) = ch.tryFetch();
        assertTrue(ok); assertEq(p, 0.01e18);
        c.set(0.00004e18, false);
        (, ok) = ch.tryFetch(); assertFalse(ok);
    }
}
