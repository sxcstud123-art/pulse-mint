// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base} from "./Base.t.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract ProtocolTest is Base {
    // ---------- vault lifecycle ----------
    function test_openTrove_mintsAndChargesFee() public {
        _open(b, weth, alice, 10e18, 5000e18);
        (uint256 debt, uint256 c,,) = b.troves(alice);
        assertEq(c, 10e18);
        assertEq(debt, 5025e18); // 0.5% fee
        assertEq(usdpm.balanceOf(alice), 5000e18);
        assertEq(usdpm.balanceOf(address(staking)), 25e18);
    }

    function test_open_revertsBelowMCR() public {
        weth.mint(alice, 1e18);
        vm.startPrank(alice); weth.approve(address(b), 1e18);
        vm.expectRevert("ICR < MCR"); b.openTrove(1e18, 1700e18); vm.stopPrank();
    }

    function test_open_revertsBelowMinDebt() public {
        weth.mint(alice, 1e18);
        vm.startPrank(alice); weth.approve(address(b), 1e18);
        vm.expectRevert("below min debt"); b.openTrove(1e18, 100e18); vm.stopPrank();
    }

    function test_adjustTrove() public {
        _open(b, weth, alice, 10e18, 5000e18);
        _open(b, weth, bob, 10e18, 2000e18);
        weth.mint(alice, 5e18);
        vm.startPrank(alice);
        weth.approve(address(b), 5e18);
        b.adjustTrove(5e18, 0, 1000e18, 0);
        (uint256 debt, uint256 c,,) = b.troves(alice);
        assertEq(c, 15e18); assertEq(debt, 6030e18);
        b.adjustTrove(0, 2e18, 0, 3000e18);
        (debt, c,,) = b.troves(alice);
        assertEq(c, 13e18); assertEq(debt, 3030e18);
        assertEq(weth.balanceOf(alice), 2e18);
        vm.stopPrank();
    }

    function test_closeTrove() public {
        _open(b, weth, alice, 10e18, 5000e18);
        _open(b, weth, bob, 10e18, 2000e18);
        vm.prank(bob); usdpm.transfer(alice, 25e18); // cover fee
        vm.prank(alice); b.closeTrove();
        (,,, Branch.Status st) = b.troves(alice);
        assertEq(uint8(st), uint8(Branch.Status.Closed));
        assertEq(weth.balanceOf(alice), 10e18);
        assertEq(usdpm.balanceOf(alice), 0);
    }

    function test_hexBranch_8decimals() public {
        // 1,000,000 HEX @ $0.01 = $10,000; MCR 175% -> max ~5714 debt
        _open(hb, hex_, carol, 100_000_000e8, 100_000e18); // healthy system
        _open(hb, hex_, alice, 1_000_000e8, 5000e18);
        assertEq(hb.getICR(alice, 0.01e18), uint256(10_000e18) * 1e18 / 5025e18);
        hex_.mint(bob, 1_000_000e8);
        vm.startPrank(bob); hex_.approve(address(hb), 1_000_000e8);
        vm.expectRevert("ICR < MCR"); hb.openTrove(1_000_000e8, 5800e18); vm.stopPrank();
    }

    function test_recoveryMode_blocksWithdrawal() public {
        _open(b, weth, alice, 10e18, 10000e18);
        // TCR = 20000/10050 = 199%; drop price so TCR < 150% but ICR > 120%
        wethFeed.setPrice(1400e18); // 14000/10050 = 139%
        assertTrue(b.isRecoveryMode(1400e18));
        vm.prank(alice); vm.expectRevert("RM: no coll withdrawal"); b.adjustTrove(0, 1e18, 0, 0);
    }

    // ---------- liquidation + stability pool ----------
    function test_liquidation_offsetsWithStabilityPool() public {
        _open(b, weth, bob, 100e18, 50000e18);    // depositor   // ICR 133%
        _open(b, weth, alice, 10e18, 15000e18);
        vm.startPrank(bob); usdpm.approve(address(b), 50000e18); b.provideToSP(50000e18); vm.stopPrank();

        wethFeed.setPrice(1700e18); // alice ICR = 17000/15075 = 112.7% < 120%
        vm.prank(carol); b.liquidate(alice);
        assertEq(weth.balanceOf(carol), 0.05e18);           // 0.5% comp
        assertEq(b.totalDeposits(), 50000e18 - 15075e18);
        assertApproxEqAbs(b.getCompoundedDeposit(bob), 50000e18 - 15075e18, 1e6);
        assertApproxEqAbs(b.getDepositorCollGain(bob), 9.95e18, 1e6);

        vm.prank(bob); b.withdrawFromSP(type(uint256).max);
        assertApproxEqAbs(weth.balanceOf(bob), 9.95e18, 1e6);
        assertApproxEqAbs(usdpm.balanceOf(bob), 50000e18 - 15075e18, 1e6);
        assertEq(b.deposits(bob), 0);
    }

    function test_liquidation_redistributesWhenSPEmpty() public {
        _open(b, weth, bob, 100e18, 50000e18);
        _open(b, weth, alice, 10e18, 15000e18);
        wethFeed.setPrice(1700e18);
        b.liquidate(alice);
        (uint256 d, uint256 c) = b.getEntireTrove(bob);
        assertApproxEqAbs(d, 50250e18 + 15075e18, 1e6);
        assertApproxEqAbs(c, 100e18 + 9.95e18, 1e6);
        // touching bob applies pending rewards
        vm.prank(bob); b.adjustTrove(0, 0, 0, 1000e18);
        (uint256 dd,,,) = b.troves(bob);
        assertApproxEqAbs(dd, 50250e18 + 15075e18 - 1000e18, 1e6);
        assertApproxEqAbs(b.defaultDebt(), 0, 1e6);
    }

    function test_liquidate_revertsIfHealthy() public {
        _open(b, weth, alice, 10e18, 5000e18);
        vm.expectRevert("ICR >= MCR"); b.liquidate(alice);
    }

    function test_stabilityPool_multipleDepositorsShareGains() public {
        _open(b, weth, bob, 100e18, 30000e18);
        _open(b, weth, carol, 100e18, 30000e18);
        _open(b, weth, alice, 10e18, 15000e18);
        vm.startPrank(bob); usdpm.approve(address(b), 30000e18); b.provideToSP(30000e18); vm.stopPrank();
        vm.startPrank(carol); usdpm.approve(address(b), 10000e18); b.provideToSP(10000e18); vm.stopPrank();
        vm.warp(block.timestamp + 1000);
        wethFeed.setPrice(1700e18);
        b.liquidate(alice);
        assertApproxEqAbs(b.getDepositorCollGain(bob), 9.95e18 * 3 / 4, 1e9);
        assertApproxEqAbs(b.getDepositorCollGain(carol), 9.95e18 / 4, 1e9);
        // 1000s * 1 PMNT/s split 3:1
        assertApproxEqAbs(b.getDepositorPMNTGain(bob), 750e18, 1e9);
        assertApproxEqAbs(b.getDepositorPMNTGain(carol), 250e18, 1e9);
        vm.prank(carol); b.withdrawFromSP(0);
        assertApproxEqAbs(pmnt.balanceOf(carol), 250e18, 1e9);
    }

    function test_stabilityPool_fullDepletionNewEpoch() public {
        _open(b, weth, bob, 100e18, 30000e18);
        _open(b, weth, alice, 10e18, 15000e18);
        vm.startPrank(bob); usdpm.approve(address(b), 15075e18); b.provideToSP(15075e18); vm.stopPrank();
        wethFeed.setPrice(1700e18);
        b.liquidate(alice);
        assertEq(b.totalDeposits(), 0);
        assertEq(b.getCompoundedDeposit(bob), 0);
        assertEq(b.currentEpoch(), 1);
        assertApproxEqAbs(b.getDepositorCollGain(bob), 9.95e18, 1e6);
    }

    // ---------- redemptions ----------
    function test_redemption() public {
        _open(b, weth, alice, 10e18, 10000e18);  // ICR 199%
        _open(b, weth, bob, 20e18, 10000e18);    // ICR 398%
        vm.prank(bob); b.redeem(4000e18, 0, 0, address(0), address(0));
        // 4000 USDPM @ $2000 = 2 WETH, minus 0.5% fee
        assertEq(weth.balanceOf(bob), 2e18 - 0.01e18);
        assertEq(weth.balanceOf(address(staking)), 0.01e18);
        (uint256 d, uint256 c,,) = b.troves(alice);
        assertEq(d, 10050e18 - 4000e18); assertEq(c, 8e18);
    }

    function test_redemption_fullyClosesTroveAndLeavesSurplus() public {
        _open(b, weth, alice, 1e18, 1000e18);    // debt 1005, ICR 199% (riskiest)
        _open(b, weth, bob, 20e18, 10000e18);
        vm.prank(bob); b.redeem(1005e18, 0, 0, address(0), address(0));
        (,,, Branch.Status st) = b.troves(alice);
        assertEq(uint8(st), uint8(Branch.Status.Closed));
        assertEq(b.collSurplus(alice), 1e18 - 0.5025e18);
        vm.prank(alice); b.claimCollSurplus();
        assertEq(weth.balanceOf(alice), 1e18 - 0.5025e18);
    }

    // ---------- PMNT staking ----------
    function test_staking_earnsBorrowAndRedemptionFees() public {
        pmnt.transfer(dave, 1000e18);
        vm.startPrank(dave); pmnt.approve(address(staking), 1000e18); staking.stake(1000e18); vm.stopPrank();
        _open(b, weth, alice, 10e18, 10000e18);  // 50 USDPM fee
        _open(b, weth, bob, 20e18, 10000e18);    // 50 USDPM fee
        vm.prank(bob); b.redeem(4000e18, 0, 0, address(0), address(0));  // 0.01 WETH fee
        assertEq(staking.pending(dave, address(usdpm)), 100e18);
        assertEq(staking.pending(dave, address(weth)), 0.01e18);
        vm.prank(dave); staking.unstake(1000e18);
        assertEq(usdpm.balanceOf(dave), 100e18);
        assertEq(weth.balanceOf(dave), 0.01e18);
        assertEq(pmnt.balanceOf(dave), 1000e18);
    }

    function test_staking_feesBeforeAnyStakerAreKept() public {
        _open(b, weth, alice, 10e18, 10000e18);  // 50 USDPM fee with no stakers
        pmnt.transfer(dave, 10e18);
        vm.startPrank(dave); pmnt.approve(address(staking), 10e18); staking.stake(10e18); vm.stopPrank();
        _open(b, weth, bob, 20e18, 10000e18);    // next fee also flushes undistributed
        assertEq(staking.pending(dave, address(usdpm)), 100e18);
    }

    function test_onlyBranchCanMint() public {
        vm.expectRevert("USDPM: not branch"); usdpm.mint(alice, 1);
    }

    // ---------- fuzz: open/close round trip conserves collateral ----------
    function testFuzz_openClose(uint96 c, uint96 s) public {
        uint256 coll = bound(uint256(c), 1e18, 1000e18);
        uint256 maxDebt = coll * 2000 / 2; // ICR ~200%, keep TCR > CCR
        uint256 amt = bound(uint256(s), 200e18, maxDebt);
        _open(b, weth, bob, 1000e18, 100000e18); // keeps a second trove
        _open(b, weth, alice, coll, amt);
        vm.prank(bob); usdpm.transfer(alice, amt * 50 / 10000);
        vm.prank(alice); b.closeTrove();
        assertEq(weth.balanceOf(alice), coll);
    }

    function test_debtCap() public {
        (MockERC20 t,, Branch capped) = _branchCap("INC", 1e18, 2e18, 3e18, 1000e18);
        _open(capped, t, alice, 10_000e18, 900e18); // 904.5 debt
        t.mint(bob, 10_000e18);
        vm.startPrank(bob); t.approve(address(capped), 10_000e18);
        vm.expectRevert("debt cap"); capped.openTrove(10_000e18, 200e18);
        vm.stopPrank();
        vm.prank(alice); vm.expectRevert("debt cap"); capped.adjustTrove(0, 0, 100e18, 0);
    }

    function test_sortedList_orderAndRedemptionHitsRiskiestFirst() public {
        _open(b, weth, alice, 20e18, 10000e18); // ~398%
        _open(b, weth, bob, 10e18, 10000e18);   // ~199% (riskiest)
        _open(b, weth, carol, 15e18, 10000e18); // ~298%
        assertEq(b.sortedHead(), alice); assertEq(b.sortedTail(), bob);
        assertEq(b.sortedNext(alice), carol); assertEq(b.sortedNext(carol), bob);
        // even when alice redeems, bob (lowest ratio) is hit first
        vm.prank(alice); b.redeem(3000e18, 0, 0, address(0), address(0));
        (uint256 db,,,) = b.troves(bob); (uint256 dc,,,) = b.troves(carol);
        assertEq(db, 10050e18 - 3000e18); assertEq(dc, 10050e18);
    }

    function test_sortedList_skipsUnderwaterAndSpillsOver() public {
        _open(b, weth, alice, 100e18, 50000e18);
        _open(b, weth, bob, 10e18, 15000e18);   // 133% -> goes under MCR after price drop
        _open(b, weth, carol, 15e18, 10000e18); // 298%
        wethFeed.setPrice(1700e18);              // bob 112% (skipped), carol 253%
        vm.prank(alice); b.redeem(20000e18, 0, 0, address(0), address(0));
        (uint256 db,,,) = b.troves(bob);
        assertEq(db, 15075e18); // untouched
        // carol fully redeemed (10050), remainder from alice
        (,,, Branch.Status sc) = b.troves(carol);
        assertEq(uint8(sc), uint8(Branch.Status.Closed));
        (uint256 da,,,) = b.troves(alice);
        assertEq(da, 50250e18 - (20000e18 - 10050e18));
    }

    function test_hintsWork() public {
        _open(b, weth, alice, 20e18, 10000e18);
        _open(b, weth, carol, 10e18, 10000e18);
        weth.mint(bob, 15e18);
        uint256 n = uint256(15e18) * 1e20 / 10050e18;
        (address p, address nx) = b.getInsertPosition(n);
        assertEq(p, alice); assertEq(nx, carol);
        vm.startPrank(bob); weth.approve(address(b), 15e18); b.openTroveWithHints(15e18, 10000e18, p, nx); vm.stopPrank();
        assertEq(b.sortedNext(alice), bob); assertEq(b.sortedNext(bob), carol);
    }
}
