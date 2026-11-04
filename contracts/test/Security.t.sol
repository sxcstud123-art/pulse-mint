// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base} from "./Base.t.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracles/MockPriceFeed.sol";

/// Pre-audit fuzz tests: vault ops, liquidations, redemptions, stability pool, recovery mode.
/// Branch "g" mirrors the deploy settings: 18 dec, MCR 150%, CCR 200%, 0.5% fees, minDebt 2000, reserve 200.
contract SecurityFuzz is Base {
    MockERC20 gt; MockPriceFeed gf; Branch g;

    function setUp() public override {
        super.setUp();
        (gt, gf, g) = _branchGas("G", 18, 2000e18, 1.5e18, 2.0e18, 100_000_000e18, 200e18, 2000e18);
    }
    function _icr(address o) internal view returns (uint256) { return g.getICR(o, gf.price()); }
    function _checkBooks() internal view {
        assertEq(usdpm.balanceOf(address(g)), g.totalDeposits() + g.gasPoolBalance(), "usdpm held");
        assertEq(gt.balanceOf(address(g)), g.activeColl() + g.defaultColl() + g.spCollBalance() + g.totalSurplus(), "coll held");
    }

    // ---------- vault ops ----------
    function testFuzz_openRespectsMCRandFee(uint256 c, uint256 borrow) public {
        c = bound(c, 1e18, 1000e18); borrow = bound(borrow, 1800e18, 2_000_000e18);
        uint256 debt = borrow + borrow * 50 / 10_000 + 200e18;
        uint256 icr = c * 2000e18 / 1e18 * 1e18 / debt;
        gt.mint(alice, c);
        vm.startPrank(alice); gt.approve(address(g), c);
        if (debt < 2000e18 || icr < 2.0e18) { // first vault must also keep TCR >= CCR
            vm.expectRevert(); g.openTrove(c, borrow);
        } else {
            g.openTrove(c, borrow);
            (uint256 d, uint256 cc) = g.getEntireTrove(alice);
            assertEq(d, debt); assertEq(cc, c);
            assertEq(usdpm.balanceOf(alice), borrow); // user gets exactly what they asked for
            assertGe(_icr(alice), 1.5e18);
        }
        vm.stopPrank();
        _checkBooks();
    }

    function testFuzz_adjustNeverBelowMCR(uint256 collOut, uint256 more) public {
        _open(g, gt, alice, 100e18, 50_000e18);
        _open(g, gt, bob, 100e18, 20_000e18);
        collOut = bound(collOut, 0, 99e18); more = bound(more, 0, 200_000e18);
        vm.prank(alice);
        try g.adjustTrove(0, collOut, more, 0) {
            assertGe(_icr(alice), 1.5e18, "adjusted below MCR");
            assertGe(g.getTCR(gf.price()), 2.0e18, "adjust pushed system into RM");
        } catch {}
        _checkBooks();
    }

    function testFuzz_repayAndCloseReturnsAllCollateral(uint256 c, uint256 borrow) public {
        c = bound(c, 10e18, 1000e18); borrow = bound(borrow, 2000e18, c * 2000 / 3);
        _open(g, gt, bob, 1000e18, 10_000e18); // second vault so the system is not empty
        _open(g, gt, alice, c, borrow);
        (uint256 d,) = g.getEntireTrove(alice);
        vm.prank(bob); usdpm.transfer(alice, d - 200e18 - borrow); // top up the fee
        vm.prank(alice); g.closeTrove();
        assertEq(gt.balanceOf(alice), c);
        assertEq(usdpm.balanceOf(alice), 0);
        _checkBooks();
    }

    // ---------- liquidations ----------
    function testFuzz_liquidateOnlyBelowMCR(uint256 price) public {
        _open(g, gt, alice, 100e18, 50_000e18);   // ICR ~398%
        _open(g, gt, bob, 10e18, 9_000e18);       // ICR ~217%
        vm.startPrank(alice); usdpm.approve(address(g), 50_000e18); g.provideToSP(50_000e18); vm.stopPrank();
        price = bound(price, 100e18, 4000e18); gf.setPrice(price);
        bool under = _icr(bob) < 1.5e18;
        if (under) { vm.prank(carol); g.liquidate(bob); (,,, Branch.Status s) = g.troves(bob); assertEq(uint8(s), 2); }
        else { vm.expectRevert(bytes("ICR >= MCR")); vm.prank(carol); g.liquidate(bob); }
        _checkBooks();
        assertEq(usdpm.totalSupply(), g.entireSystemDebt() + _otherDebt());
    }

    function testFuzz_liquidationSPLossAndGain(uint256 dep) public {
        _open(g, gt, alice, 1000e18, 100_000e18);
        _open(g, gt, bob, 10e18, 9_000e18);
        (uint256 bd, uint256 bc) = g.getEntireTrove(bob);
        dep = bound(dep, 1e18, 100_000e18);
        vm.startPrank(alice); usdpm.approve(address(g), dep); g.provideToSP(dep); vm.stopPrank();
        gf.setPrice(1300e18);
        vm.prank(carol); g.liquidate(bob);
        uint256 offset = bd < dep ? bd : dep;
        assertApproxEqAbs(g.getCompoundedDeposit(alice), dep - offset, 1e12, "deposit loss");
        uint256 collToSP = (bc - bc * 50 / 10_000) * offset / bd;
        assertApproxEqRel(g.getDepositorCollGain(alice), collToSP, 1e12, "coll gain");
        assertEq(gt.balanceOf(carol), bc * 50 / 10_000); // liquidator 0.5%
        assertEq(usdpm.balanceOf(carol), 200e18);         // + reserve
        _checkBooks();
    }

    function test_SPWithdrawBlockedWhileLiquidatable() public {
        _open(g, gt, alice, 1000e18, 100_000e18);
        _open(g, gt, bob, 10e18, 9_000e18);
        vm.startPrank(alice); usdpm.approve(address(g), 50_000e18); g.provideToSP(50_000e18); vm.stopPrank();
        gf.setPrice(1300e18);
        vm.prank(alice); vm.expectRevert(bytes("SP: liquidations pending")); g.withdrawFromSP(50_000e18);
        vm.prank(alice); g.withdrawFromSP(0); // claiming gains is still allowed
        g.liquidate(bob);
        vm.prank(alice); g.withdrawFromSP(1_000e18); // allowed again
    }

    // ---------- redemptions ----------
    function testFuzz_redemptionFaceValueRiskiestFirst(uint256 amt) public {
        _open(g, gt, alice, 1000e18, 100_000e18); // safest
        _open(g, gt, bob, 30e18, 20_000e18);      // riskiest (~297%)
        _open(g, gt, carol, 100e18, 30_000e18);
        amt = bound(amt, 1e18, 50_000e18);
        uint256 bobDebtBefore; (bobDebtBefore,) = g.getEntireTrove(bob);
        vm.prank(alice); usdpm.transfer(dave, amt);
        vm.prank(dave); g.redeem(amt, 0, 0, address(0), address(0));
        uint256 redeemed = amt - usdpm.balanceOf(dave);
        uint256 gross = redeemed * 1e18 / 2000e18;
        assertApproxEqAbs(gt.balanceOf(dave), gross - gross * 50 / 10_000, 1e6, "not face value");
        (uint256 bobDebtAfter,) = g.getEntireTrove(bob);
        assertLt(bobDebtAfter, bobDebtBefore, "riskiest not hit first");
        _checkBooks();
    }

    function testFuzz_redemptionSlippageGuard(uint256 amt) public {
        _open(g, gt, alice, 1000e18, 100_000e18);
        _open(g, gt, bob, 30e18, 20_000e18);
        amt = bound(amt, 100e18, 10_000e18);
        vm.prank(alice); vm.expectRevert(bytes("slippage"));
        g.redeem(amt, 0, amt * 1e18 / 2000e18, address(0), address(0)); // demands more than face value minus fee
    }

    // ---------- recovery mode ----------
    function testFuzz_recoveryModeRules(uint256 price) public {
        _open(g, gt, alice, 100e18, 80_000e18); // ~249%
        _open(g, gt, bob, 100e18, 80_000e18);
        price = bound(price, 1300e18, 1600e18); gf.setPrice(price); // TCR between 162% and 199%
        assertTrue(g.isRecoveryMode(price));
        vm.startPrank(alice);
        vm.expectRevert(bytes("RM: no coll withdrawal")); g.adjustTrove(0, 1e18, 0, 0);
        vm.expectRevert(bytes("RM: cannot close")); g.closeTrove();
        g.adjustTrove(0, 0, 0, 1000e18); // repaying is always allowed
        vm.stopPrank();
        gt.mint(carol, 100e18);
        vm.startPrank(carol); gt.approve(address(g), 100e18);
        uint256 maxAtCCR = 100e18 * price / 1e18 * 1e18 / 2.0e18;
        vm.expectRevert(bytes("RM: ICR < CCR")); g.openTrove(100e18, maxAtCCR); // fee+reserve push it under CCR
        g.openTrove(100e18, maxAtCCR / 2);
        vm.stopPrank();
        assertGe(_icr(carol), 2.0e18);
        _checkBooks();
    }

    // ---------- stability pool ----------
    function testFuzz_SPManyDepositorsNeverOverpay(uint256 a1, uint256 a2, uint256 p) public {
        _open(g, gt, alice, 1000e18, 200_000e18);
        _open(g, gt, bob, 10e18, 9_000e18);
        _open(g, gt, carol, 12e18, 11_000e18);
        a1 = bound(a1, 1e18, 100_000e18); a2 = bound(a2, 1e18, 90_000e18);
        vm.startPrank(alice); usdpm.approve(address(g), type(uint256).max);
        g.provideToSP(a1); usdpm.transfer(dave, a2); vm.stopPrank();
        vm.startPrank(dave); usdpm.approve(address(g), a2); g.provideToSP(a2); vm.stopPrank();
        gf.setPrice(bound(p, 1000e18, 1340e18));
        g.liquidate(bob); g.liquidate(carol);
        assertLe(g.getCompoundedDeposit(alice) + g.getCompoundedDeposit(dave), g.totalDeposits() + 1e9);
        assertLe(g.getDepositorCollGain(alice) + g.getDepositorCollGain(dave), g.spCollBalance() + 1e9);
        vm.prank(alice); g.withdrawFromSP(type(uint256).max);
        vm.prank(dave); g.withdrawFromSP(type(uint256).max);
        _checkBooks();
    }

    function _otherDebt() internal view returns (uint256) { return b.entireSystemDebt() + hb.entireSystemDebt(); }
}
