// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base} from "./Base.t.sol";

/// pWETH branch: MCR 120%, CCR 150%.
contract RecoveryModeTest is Base {
    function _enterRM() internal {
        _open(b, weth, alice, 10e18, 10000e18); // 199%
        _open(b, weth, bob, 10e18, 10000e18);
        wethFeed.setPrice(1400e18);              // 139% < CCR
        assertTrue(b.isRecoveryMode(1400e18));
    }

    function test_normal_rejectsOpenThatWouldTriggerRM() public {
        _open(b, weth, alice, 10e18, 12000e18);  // TCR 166%
        weth.mint(bob, 10e18);
        vm.startPrank(bob); weth.approve(address(b), 10e18);
        vm.expectRevert("would enter RM"); b.openTrove(10e18, 16000e18); // ICR 124% >= MCR, but TCR -> 142% < CCR
        vm.stopPrank();
    }

    function test_normal_rejectsWithdrawalThatWouldTriggerRM() public {
        _open(b, weth, alice, 10e18, 10000e18);
        vm.prank(alice); vm.expectRevert("would enter RM"); b.adjustTrove(0, 3e18, 0, 0); // 14000/10050 = 139%
    }

    function test_RM_openNeedsCCR() public {
        _enterRM();
        weth.mint(carol, 20e18);
        vm.startPrank(carol); weth.approve(address(b), 20e18);
        vm.expectRevert("RM: ICR < CCR"); b.openTrove(10e18, 9500e18);   // 14000/9547.5 = 146.6%: above MCR, below CCR
        vm.stopPrank();
    }

    function test_RM_openAboveCCRAllowed() public {
        _enterRM();
        _open(b, weth, carol, 20e18, 10000e18);  // 28000/10050 = 278%
        (uint256 d,,,) = b.troves(carol); assertEq(d, 10050e18);
    }

    function test_RM_closeBlocked() public {
        _enterRM();
        vm.prank(alice); vm.expectRevert("RM: cannot close"); b.closeTrove();
    }

    function test_RM_borrowMustImproveICR() public {
        _enterRM();
        vm.prank(alice); vm.expectRevert("RM: ICR"); b.adjustTrove(0, 0, 100e18, 0);
        weth.mint(alice, 20e18);
        vm.startPrank(alice); weth.approve(address(b), 20e18);
        b.adjustTrove(20e18, 0, 100e18, 0); // 42000/10150.5 = 413% >= CCR and improved
        vm.stopPrank();
    }

    function test_RM_repayAndTopUpAllowed() public {
        _enterRM();
        vm.prank(alice); b.adjustTrove(0, 0, 0, 1000e18);
        weth.mint(bob, 1e18);
        vm.startPrank(bob); weth.approve(address(b), 1e18); b.adjustTrove(1e18, 0, 0, 0); vm.stopPrank();
    }

    function test_RM_exitAfterPriceRecovers() public {
        _enterRM();
        wethFeed.setPrice(2000e18);
        assertFalse(b.isRecoveryMode(2000e18));
        vm.prank(alice); b.adjustTrove(0, 1e18, 0, 0);
    }

    function test_RM_liquidationBelowMCRStillWorks() public {
        _enterRM();
        wethFeed.setPrice(1150e18); // 114% < MCR
        vm.prank(carol); b.liquidate(alice); // redistributed to bob (no SP)
        (uint256 d,) = b.getEntireTrove(bob);
        assertApproxEqAbs(d, 20100e18, 1e6);
    }

    function test_redemptionBlockedWhenTCRBelowMCR() public {
        _open(b, weth, alice, 10e18, 10000e18);
        _open(b, weth, bob, 10e18, 10000e18);
        wethFeed.setPrice(1150e18);
        vm.prank(alice); vm.expectRevert("TCR < MCR"); b.redeem(1000e18, 0, 0, address(0), address(0));
    }
}
