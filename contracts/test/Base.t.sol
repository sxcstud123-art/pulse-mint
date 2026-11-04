// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {USDPM} from "../src/USDPM.sol";
import {PMNT} from "../src/PMNT.sol";
import {PMNTStaking} from "../src/PMNTStaking.sol";
import {CommunityIssuance} from "../src/CommunityIssuance.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracles/MockPriceFeed.sol";

contract Base is Test {
    USDPM usdpm; PMNT pmnt; PMNTStaking staking; CommunityIssuance iss;
    MockERC20 weth; MockPriceFeed wethFeed; Branch b;   // pWETH branch, 18 dec, MCR 120 CCR 150
    MockERC20 hex_; MockPriceFeed hexFeed; Branch hb;   // HEX branch, 8 dec, MCR 175 CCR 250
    address alice = makeAddr("alice"); address bob = makeAddr("bob");
    address carol = makeAddr("carol"); address dave = makeAddr("dave");

    function setUp() public virtual {
        usdpm = new USDPM();
        address[] memory r = new address[](1); r[0] = address(this);
        uint256[] memory a = new uint256[](1); a[0] = 100_000_000e18;
        pmnt = new PMNT(r, a);
        staking = new PMNTStaking(address(pmnt));
        iss = new CommunityIssuance(address(pmnt));
        pmnt.transfer(address(iss), 32_000_000e18);
        staking.addRewardToken(address(usdpm));
        (weth, wethFeed, b) = _branch("pWETH", 18, 2000e18, 1.2e18, 1.5e18);
        (hex_, hexFeed, hb) = _branch("HEX", 8, 0.01e18, 1.75e18, 2.5e18);
        iss.setRate(address(b), 1e18);
    }

    function _branch(string memory s, uint8 d, uint256 price, uint256 mcr, uint256 ccr)
        internal returns (MockERC20 t, MockPriceFeed f, Branch br)
    { return _branchFull(s, d, price, mcr, ccr, 10_000_000e18); }

    function _branchCap(string memory s, uint256 price, uint256 mcr, uint256 ccr, uint256 cap)
        internal returns (MockERC20 t, MockPriceFeed f, Branch br)
    { return _branchFull(s, 18, price, mcr, ccr, cap); }

    function _branchFull(string memory s, uint8 d, uint256 price, uint256 mcr, uint256 ccr, uint256 cap)
        internal returns (MockERC20 t, MockPriceFeed f, Branch br)
    { return _branchGas(s, d, price, mcr, ccr, cap, 0, 200e18); }

    function _branchGas(string memory s, uint8 d, uint256 price, uint256 mcr, uint256 ccr, uint256 cap, uint256 gasComp, uint256 minDebt)
        internal returns (MockERC20 t, MockPriceFeed f, Branch br)
    {
        t = new MockERC20(s, s, d); f = new MockPriceFeed(price);
        br = new Branch(Branch.Config({coll: address(t), decimals: d, priceFeed: address(f), usdpm: address(usdpm),
            pmnt: address(pmnt), staking: address(staking), issuance: address(iss), mcr: mcr, ccr: ccr,
            borrowFeeBps: 50, redemptionFeeBps: 50, minDebt: minDebt, debtCap: cap, gasComp: gasComp}));
        usdpm.addBranch(address(br)); staking.addRewardToken(address(t)); staking.addNotifier(address(br));
    }

    function _open(Branch br, MockERC20 t, address u, uint256 c, uint256 s) internal {
        t.mint(u, c);
        vm.startPrank(u); t.approve(address(br), c); br.openTrove(c, s); vm.stopPrank();
    }
}
