// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {USDPM} from "../src/USDPM.sol";
import {PMNT} from "../src/PMNT.sol";
import {PMNTStaking} from "../src/PMNTStaking.sol";
import {CommunityIssuance} from "../src/CommunityIssuance.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracles/MockPriceFeed.sol";

contract Handler is Test {
    mapping(bytes4 => uint256) public ok;
    Branch public b; MockERC20 public t; MockPriceFeed public f; USDPM public u;
    address[] public actors;
    uint256 public calls;
    constructor(Branch _b, MockERC20 _t, MockPriceFeed _f, USDPM _u) {
        b = _b; t = _t; f = _f; u = _u;
        for (uint256 i; i < 6; i++) actors.push(address(uint160(0xA000 + i)));
    }
    function actorsLen() external view returns (uint256) { return actors.length; }
    function _a(uint256 s) internal view returns (address) { return actors[s % actors.length]; }

    function open(uint256 s, uint256 c, uint256 ratio) external {
        address a = _a(s); c = bound(c, 1e18, 200e18); ratio = bound(ratio, 125, 400);
        uint256 debt = c * f.price() / 1e18 * 100 / ratio;
        if (debt < 2100e18) return;
        t.mint(a, c);
        vm.startPrank(a); t.approve(address(b), c);
        try b.openTrove(c, debt) { calls++; ok[msg.sig]++; } catch {}
        vm.stopPrank();
    }
    function adjust(uint256 s, uint256 collIn, uint256 repay, bool more) external {
        address a = _a(s); collIn = bound(collIn, 0, 20e18); repay = bound(repay, 0, 3000e18);
        t.mint(a, collIn);
        vm.startPrank(a); t.approve(address(b), collIn);
        if (more) { try b.adjustTrove(collIn, 0, repay, 0) { calls++; ok[msg.sig]++; } catch {} }
        else { uint256 r = repay > u.balanceOf(a) ? u.balanceOf(a) : repay; try b.adjustTrove(collIn, 0, 0, r) { calls++; ok[msg.sig]++; } catch {} }
        vm.stopPrank();
    }
    function close(uint256 s) external {
        address a = _a(s);
        (uint256 d,) = b.getEntireTrove(a);
        // top up from other actors so close can succeed
        for (uint256 i; i < actors.length && u.balanceOf(a) + 200e18 < d; i++) {
            address o = actors[i]; if (o == a) continue;
            uint256 need = d - 200e18 - u.balanceOf(a); uint256 have = u.balanceOf(o);
            vm.prank(o); u.transfer(a, need < have ? need : have);
        }
        vm.prank(a); try b.closeTrove() { calls++; ok[msg.sig]++; } catch {}
    }
    function setPrice(uint256 p) external { f.setPrice(bound(p, 1000e18, 3000e18)); }
    function liquidate(uint256 s) external { try b.liquidate(_a(s)) { calls++; ok[msg.sig]++; } catch {} }
    function provide(uint256 s, uint256 amt) external {
        address a = _a(s); amt = bound(amt, 0, u.balanceOf(a)); if (amt == 0) return;
        vm.startPrank(a); u.approve(address(b), amt); try b.provideToSP(amt) { calls++; ok[msg.sig]++; } catch {} vm.stopPrank();
    }
    function withdraw(uint256 s, uint256 amt) external { vm.prank(_a(s)); try b.withdrawFromSP(amt) { calls++; ok[msg.sig]++; } catch {} }
    function redeem(uint256 s, uint256 amt) external {
        address a = _a(s); amt = bound(amt, 0, u.balanceOf(a)); if (amt == 0) return;
        vm.prank(a); try b.redeem(amt, 10, 0, address(0), address(0)) { calls++; ok[msg.sig]++; } catch {}
    }
    function claimSurplus(uint256 s) external { vm.prank(_a(s)); try b.claimCollSurplus() { calls++; ok[msg.sig]++; } catch {} }
}

contract InvariantTest is StdInvariant, Test {
    USDPM u; PMNT g; PMNTStaking st; CommunityIssuance iss; Branch b; MockERC20 t; MockPriceFeed f; Handler h;

    function setUp() public {
        u = new USDPM();
        address[] memory r = new address[](1); r[0] = address(this);
        uint256[] memory a = new uint256[](1); a[0] = 100_000_000e18;
        g = new PMNT(r, a); st = new PMNTStaking(address(g)); iss = new CommunityIssuance(address(g));
        g.transfer(address(iss), 1_000_000e18);
        t = new MockERC20("W", "W", 18); f = new MockPriceFeed(2000e18);
        b = new Branch(Branch.Config({coll: address(t), decimals: 18, priceFeed: address(f), usdpm: address(u),
            pmnt: address(g), staking: address(st), issuance: address(iss), mcr: 1.1e18, ccr: 1.5e18,
            borrowFeeBps: 50, redemptionFeeBps: 50, minDebt: 2000e18, debtCap: 100_000_000e18, gasComp: 200e18}));
        u.addBranch(address(b)); st.addRewardToken(address(u)); st.addRewardToken(address(t)); st.addNotifier(address(b));
        iss.setRate(address(b), 1e18);
        h = new Handler(b, t, f, u);
        f.transferOwnership(address(h));
        targetContract(address(h));
    }

    /// Every USDPM in existence is backed by vault debt (fees + reserves included).
    function invariant_supplyEqualsSystemDebt() public view {
        assertEq(u.totalSupply(), b.entireSystemDebt());
    }
    /// Collateral held by the branch is exactly what its books say.
    function invariant_collateralAccounting() public view {
        assertEq(t.balanceOf(address(b)), b.activeColl() + b.defaultColl() + b.spCollBalance() + b.totalSurplus());
    }
    /// USDPM held by the branch = stability pool deposits + liquidation reserves.
    function invariant_usdpmHeld() public view {
        assertEq(u.balanceOf(address(b)), b.totalDeposits() + b.gasPoolBalance());
    }
    /// Sum of each vault's debt (incl. pending redistribution) never exceeds system debt; rounding dust only.
    function invariant_troveSums() public view {
        uint256 sumD; uint256 sumC; uint256 n;
        for (uint256 i; i < h.actorsLen(); i++) {
            address a = h.actors(i);
            (,,, Branch.Status s) = b.troves(a);
            if (s != Branch.Status.Active) continue;
            (uint256 d, uint256 c) = b.getEntireTrove(a); sumD += d; sumC += c; n++;
        }
        assertLe(sumD, b.entireSystemDebt()); assertLe(sumC, b.entireSystemColl());
        assertApproxEqAbs(sumD, b.entireSystemDebt(), 1e9); assertApproxEqAbs(sumC, b.entireSystemColl(), 1e9);
        assertEq(b.gasPoolBalance(), n * 200e18);
        assertEq(b.sortedSize(), n);
    }
    /// Stability pool never owes depositors more USDPM or collateral than it holds.
    function invariant_stabilityPoolSolvent() public view {
        uint256 sumDep; uint256 sumGain;
        for (uint256 i; i < h.actorsLen(); i++) { address a = h.actors(i); sumDep += b.getCompoundedDeposit(a); sumGain += b.getDepositorCollGain(a); }
        assertLe(sumDep, b.totalDeposits() + 1e9);
        assertLe(sumGain, b.spCollBalance() + 1e9);
    }
    /// Outside recovery mode, no healthy system can have TCR under MCR unless the price moved (we only check books stay consistent).
    function invariant_noActiveVaultWithZeroDebt() public view {
        for (uint256 i; i < h.actorsLen(); i++) {
            address a = h.actors(i); (,,, Branch.Status s) = b.troves(a);
            if (s == Branch.Status.Active) { (uint256 d,) = b.getEntireTrove(a); assertGe(d, 2000e18); }
        }
    }
    /// Sanity: the handler's actions really succeed (so invariants are not vacuous).
    function test_handlerActionsSucceed() public {
        h.open(0, 50e18, 300); h.open(1, 80e18, 200); h.open(2, 30e18, 160);
        h.provide(1, 5000e18); h.setPrice(1300e18); h.liquidate(2); h.redeem(0, 1000e18); h.withdraw(1, 100e18);
        assertGe(h.calls(), 6);
        assertGt(h.ok(Handler.open.selector), 2);
        invariant_supplyEqualsSystemDebt(); invariant_collateralAccounting(); invariant_usdpmHeld();
        invariant_troveSums(); invariant_sortedOrder();
    }
    /// Sorted list is a valid descending-NICR linked list.
    function invariant_sortedOrder() public view {
        address cur = b.sortedHead(); uint256 prevN = type(uint256).max; uint256 k;
        while (cur != address(0)) {
            uint256 n = b.getNominalICR(cur);
            assertLe(n, prevN); prevN = n; k++;
            address nx = b.sortedNext(cur);
            if (nx != address(0)) assertEq(b.sortedPrev(nx), cur); else assertEq(b.sortedTail(), cur);
            cur = nx;
        }
        assertEq(k, b.sortedSize());
    }
}
