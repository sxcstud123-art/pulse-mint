// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base} from "./Base.t.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracles/MockPriceFeed.sol";

/// Liquity-style 200 USDPM liquidation reserve.
contract GasCompTest is Base {
    MockERC20 t; MockPriceFeed f; Branch g;
    function setUp() public override {
        super.setUp();
        (t, f, g) = _branchGas("gWETH", 18, 2000e18, 1.2e18, 1.5e18, 10_000_000e18, 200e18, 2000e18);
    }

    function test_open_addsReserveToDebt() public {
        _open(g, t, alice, 10e18, 5000e18);
        (uint256 d,,,) = g.troves(alice);
        assertEq(d, 5000e18 + 25e18 + 200e18);
        assertEq(usdpm.balanceOf(alice), 5000e18);
        assertEq(g.gasPoolBalance(), 200e18);
        assertEq(usdpm.balanceOf(address(g)), 200e18);
    }

    function test_close_refundsReserve() public {
        _open(g, t, bob, 100e18, 20000e18);
        _open(g, t, alice, 10e18, 5000e18);
        vm.prank(bob); usdpm.transfer(alice, 25e18);
        vm.prank(alice); g.closeTrove(); // repays 5025, reserve burned
        assertEq(usdpm.balanceOf(alice), 0);
        assertEq(g.gasPoolBalance(), 200e18);
        assertEq(usdpm.totalSupply(), g.entireSystemDebt());
    }

    function test_liquidation_paysReserveToLiquidator() public {
        _open(g, t, bob, 100e18, 50000e18);
        _open(g, t, alice, 10e18, 14800e18); // debt 14800+74+200 = 15074
        wethFeedSet(1700e18);
        vm.prank(carol); g.liquidate(alice);
        assertEq(usdpm.balanceOf(carol), 200e18);
        assertEq(t.balanceOf(carol), 0.05e18);
        assertEq(g.gasPoolBalance(), 200e18);
        assertApproxEqAbs(usdpm.totalSupply(), g.entireSystemDebt(), 0);
    }

    function test_redemption_neverRedeemsReserve() public {
        _open(g, t, alice, 2e18, 1800e18);  // debt 2009 (1809 redeemable), ICR ~199%
        _open(g, t, bob, 100e18, 20000e18);
        vm.prank(bob); g.redeem(1809e18, 0, 0, address(0), address(0));
        (,,, Branch.Status st) = g.troves(alice);
        assertEq(uint8(st), uint8(Branch.Status.Closed));
        assertEq(g.collSurplus(alice), 2e18 - uint256(1809e18) * 1e18 / 2000e18);
        assertEq(usdpm.totalSupply(), g.entireSystemDebt());
    }

    function test_minDebtMustExceedReserve() public {
        vm.expectRevert("minDebt <= gasComp");
        this.makeBad();
    }
    function makeBad() external { _branchGas("x", 18, 1e18, 1.2e18, 1.5e18, 1e24, 200e18, 200e18); }

    function wethFeedSet(uint256 p) internal { f.setPrice(p); }
}
