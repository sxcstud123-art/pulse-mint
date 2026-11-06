// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {MainnetOracleConfig as C} from "../script/MainnetOracleConfig.sol";
import {RobustPriceFeed} from "../src/oracles/RobustPriceFeed.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// Read-only check of the mainnet wiring on a LOCAL fork (nothing is broadcast).
/// Run: PULSECHAIN_FORK_RPC=https://rpc.pulsechain.com forge test --match-contract MainnetForkOracle -vv
contract MainnetForkOracleTest is Test {
    bool on;
    function setUp() public {
        string memory rpc = vm.envOr("PULSECHAIN_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc); on = true;
        assertEq(block.chainid, 369);
    }

    function _p(address feed, string memory n, uint256 lo, uint256 hi) internal returns (uint256 p) {
        (uint256 price, bool risky, bool red) = RobustPriceFeed(feed).fetchPriceWithFlags();
        p = price;
        console2.log(n, p, uint256(RobustPriceFeed(feed).status()));
        assertFalse(risky); assertFalse(red);
        assertTrue(RobustPriceFeed(feed).status() == RobustPriceFeed.Status.PrimaryOk, "sources should agree");
        assertGe(p, lo, n); assertLe(p, hi, n);
    }

    function test_fork_decimals() public {
        if (!on) return;
        assertEq(IERC20Metadata(C.WPLS).decimals(), 18); assertEq(IERC20Metadata(C.HEX).decimals(), 8);
        assertEq(IERC20Metadata(C.PLSX).decimals(), 18); assertEq(IERC20Metadata(C.INC).decimals(), 18);
        assertEq(IERC20Metadata(C.PDAI).decimals(), 18); assertEq(IERC20Metadata(C.EHEX).decimals(), 8);
        assertEq(IERC20Metadata(C.PWETH).decimals(), 18); assertEq(IERC20Metadata(C.USDC_E).decimals(), 6);
    }

    function test_fork_allSevenPricesSane() public {
        if (!on) return;
        C.Feeds memory f = C.build();
        vm.warp(block.timestamp + 31 minutes); // first TWAP window (fork reserves are static)
        // wide bands around the 6 Nov 2026 survey; these catch decimals / path mistakes (1e10x errors)
        _p(f.wpls,  "WPLS",  1e12, 5e13);
        _p(f.hex_,  "HEX",   1e14, 1e16);
        _p(f.plsx,  "PLSX",  5e11, 5e13);
        _p(f.inc,   "INC",   2e16, 3e18);
        uint256 pd = _p(f.pdai, "pDAI", 1e14, 1e17);
        assertLt(pd, 0.5e18, "pDAI must never be priced near $1");
        _p(f.ehex,  "eHEX",  5e13, 5e15);
        _p(f.pweth, "pWETH", 5e11, 5e13);
    }
}
