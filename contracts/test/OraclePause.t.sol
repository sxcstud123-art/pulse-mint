// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base} from "./Base.t.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {RobustPriceFeed} from "../src/oracles/RobustPriceFeed.sol";
import {FetchOracleSource, IFetchOracle} from "../src/oracles/FetchOracleSource.sol";
import {IPriceSource} from "../src/oracles/IPriceSource.sol";

contract Src is IPriceSource {
    uint256 public p; bool public ok;
    function set(uint256 _p, bool _ok) external { p = _p; ok = _ok; }
    function tryFetch() external view returns (uint256, bool) { return (p, ok); }
}

contract MockFetch is IFetchOracle {
    bytes public v; uint256 public ts; bool public has;
    function set(uint256 price, uint256 _ts) external { v = abi.encode(price); ts = _ts; has = true; }
    function clear() external { has = false; }
    function getDataBefore(bytes32, uint256 before) external view returns (bool, bytes memory, uint256) {
        if (!has || ts > before) return (false, "", 0);
        return (true, v, ts);
    }
}

/// Charles's pause rules, end to end through a Branch wired to a real RobustPriceFeed.
contract OraclePauseTest is Base {
    Src pri; Src fb; RobustPriceFeed feed; MockERC20 tok; Branch br;
    uint256 constant T0 = 10_000_000;

    function setUp() public override {
        super.setUp();
        vm.warp(T0);
        pri = new Src(); fb = new Src();
        pri.set(2000e18, true); fb.set(2000e18, true);
        feed = new RobustPriceFeed(address(pri), address(fb), 300, 2 hours, 15 minutes);
        tok = new MockERC20("pWETH2", "pWETH2", 18);
        br = new Branch(Branch.Config({coll: address(tok), decimals: 18, priceFeed: address(feed), usdpm: address(usdpm),
            pmnt: address(pmnt), staking: address(staking), issuance: address(iss), mcr: 1.2e18, ccr: 1.5e18,
            borrowFeeBps: 50, redemptionFeeBps: 50, minDebt: 200e18, debtCap: 10_000_000e18, gasComp: 0}));
        usdpm.addBranch(address(br)); staking.addRewardToken(address(tok)); staking.addNotifier(address(br));
        _open(br, tok, bob, 100e18, 50_000e18);   // safe: ICR ~4
        _open(br, tok, alice, 10e18, 15_000e18);  // riskier: ICR ~1.33
        tok.mint(alice, 10e18); vm.prank(alice); tok.approve(address(br), type(uint256).max);
    }

    function _bothDown() internal { pri.set(0, false); fb.set(0, false); }

    // ---------- fresh price: everything works ----------
    function test_fresh_allActionsWork() public {
        vm.startPrank(alice);
        br.adjustTrove(1e18, 0, 0, 0);       // add collateral
        br.adjustTrove(0, 0, 0, 100e18);     // repay
        br.adjustTrove(0, 0, 100e18, 0);     // borrow more
        br.adjustTrove(0, 1e17, 0, 0);       // withdraw collateral
        vm.stopPrank();
        vm.prank(bob); br.redeem(1_000e18, 0, 0, address(0), address(0));
        _open(br, tok, carol, 10e18, 5_000e18); // new borrow
        assertEq(uint256(feed.status()), uint256(RobustPriceFeed.Status.PrimaryOk));
    }

    // ---------- short glitch: nothing pauses ----------
    function test_shortGlitch_noPause() public {
        _bothDown();
        vm.warp(T0 + 5 minutes);
        (uint256 p, bool risky, bool red) = feed.fetchPriceWithFlags();
        assertEq(p, 2000e18); assertFalse(risky); assertFalse(red);
        vm.prank(bob); br.redeem(500e18, 0, 0, address(0), address(0));
        vm.prank(alice); br.adjustTrove(0, 0, 100e18, 0);
    }

    // ---------- last good < 2h: borrowing open, redemptions paused after grace ----------
    function test_frozenUnder2h_noBorrowPause_redemptionsPaused() public {
        _bothDown();
        vm.warp(T0 + 90 minutes);
        (, bool risky, bool red) = feed.fetchPriceWithFlags();
        assertFalse(risky); assertTrue(red);
        vm.prank(alice); br.adjustTrove(0, 0, 100e18, 0);   // borrow ok
        vm.prank(alice); br.adjustTrove(0, 1e17, 0, 0);     // withdraw ok
        _open(br, tok, carol, 10e18, 5_000e18);              // new vault ok
        vm.prank(bob); vm.expectRevert("Price sources unsettled: redemptions paused");
        br.redeem(500e18, 0, 0, address(0), address(0));
    }

    // ---------- last good > 2h ----------
    function test_frozenOver2h_blocksBorrowWithdraw_allowsRepayAddLiquidate() public {
        // real crash: live price drops so alice is liquidatable, then both sources die
        pri.set(1700e18, true); fb.set(1700e18, true); feed.fetchPrice();
        _bothDown();
        vm.warp(T0 + 2 hours + 1);
        (, bool risky, bool red) = feed.fetchPriceWithFlags();
        assertTrue(risky); assertTrue(red);

        vm.startPrank(bob);
        vm.expectRevert("Price too old: borrow/withdraw paused"); br.adjustTrove(0, 0, 100e18, 0);
        vm.expectRevert("Price too old: borrow/withdraw paused"); br.adjustTrove(0, 1e18, 0, 0);
        br.adjustTrove(0, 0, 0, 100e18);      // repay ok
        vm.stopPrank();
        tok.mint(bob, 1e18); vm.startPrank(bob); tok.approve(address(br), 1e18);
        br.adjustTrove(1e18, 0, 0, 0);        // add collateral ok
        vm.expectRevert("Price sources unsettled: redemptions paused");
        br.redeem(500e18, 0, 0, address(0), address(0));
        vm.stopPrank();

        tok.mint(carol, 10e18);
        vm.startPrank(carol); tok.approve(address(br), 10e18);
        vm.expectRevert("Price too old: borrowing paused"); br.openTrove(10e18, 5_000e18);
        vm.stopPrank();

        // liquidations keep working
        vm.prank(dave); br.liquidate(alice);
        (uint256 d,) = br.getEntireTrove(alice); assertEq(d, 0);
    }

    // ---------- Disagree: redemptions paused, liquidations allowed ----------
    function test_disagree_pausesRedemptions_allowsLiquidation() public {
        pri.set(2000e18, true); fb.set(1700e18, true);  // 15% apart -> Disagree, lower price used
        (uint256 p, bool risky, bool red) = feed.fetchPriceWithFlags();
        assertEq(p, 1700e18); assertFalse(risky); assertTrue(red);
        vm.prank(bob); vm.expectRevert("Price sources unsettled: redemptions paused");
        br.redeem(500e18, 0, 0, address(0), address(0));
        vm.prank(dave); br.liquidate(alice);
        // sources agree again -> redemptions reopen
        fb.set(2000e18, true);
        vm.prank(bob); br.redeem(500e18, 0, 0, address(0), address(0));
    }

    function test_recoveryAfterFrozen_unpauses() public {
        _bothDown(); vm.warp(T0 + 3 hours);
        (, bool risky,) = feed.fetchPriceWithFlags(); assertTrue(risky);
        pri.set(2000e18, true); fb.set(2000e18, true);
        (, risky,) = feed.fetchPriceWithFlags(); assertFalse(risky);
        vm.prank(alice); br.adjustTrove(0, 0, 100e18, 0);
    }

    // ---------- independent Fetch fallback ----------
    function test_fetchSource_bufferStalenessNoCache() public {
        MockFetch fo = new MockFetch();
        FetchOracleSource fs = new FetchOracleSource(address(fo), keccak256("PLS/USD"), 20 minutes, 4 hours, 18);
        fo.set(5e13, block.timestamp);                // brand new report: inside dispute buffer
        (, bool ok) = fs.tryFetch(); assertFalse(ok);
        vm.warp(block.timestamp + 21 minutes);
        uint256 p; (p, ok) = fs.tryFetch(); assertTrue(ok); assertEq(p, 5e13);
        fo.clear();                                   // disputed/removed -> not served from a cache
        (, ok) = fs.tryFetch(); assertFalse(ok);
        fo.set(5e13, block.timestamp - 5 hours);      // too old
        (, ok) = fs.tryFetch(); assertFalse(ok);
    }

    function test_badFrozenWindowRejected() public {
        vm.expectRevert("bad frozen window"); new RobustPriceFeed(address(pri), address(fb), 300, 2 days, 15 minutes);
        vm.expectRevert("bad frozen window"); new RobustPriceFeed(address(pri), address(fb), 300, 2 hours, 3 hours);
    }
}
