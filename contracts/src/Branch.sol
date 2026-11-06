// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPriceFeed} from "./oracles/IPriceFeed.sol";
import {USDPM} from "./USDPM.sol";
import {PMNTStaking} from "./PMNTStaking.sol";
import {CommunityIssuance} from "./CommunityIssuance.sol";

/// @title Branch — one collateral type (vaults + active/default pools + stability pool).
/// @notice Design follows Liquity v1 (MIT) mechanics, re-implemented per collateral so the
/// system is multi-collateral like Liquity v2 / Liquid Loans, without using BUSL code.
/// Simplifications vs Liquity v1 are listed in README ("Known limitations").
contract Branch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 constant DP = 1e18;
    uint256 constant SCALE_FACTOR = 1e9;
    uint256 public constant LIQUIDATOR_BPS = 50; // 0.5% of collateral to liquidator
    uint256 public constant FEE_DENOM = 10_000;

    // --- config (immutable) ---
    IERC20 public immutable coll;
    uint256 public immutable collScale; // 10**decimals
    IPriceFeed public immutable priceFeed;
    USDPM public immutable usdpm;
    IERC20 public immutable pmnt;
    PMNTStaking public immutable staking;
    CommunityIssuance public immutable issuance;
    uint256 public immutable MCR;            // e.g. 1.5e18 = 150%
    uint256 public immutable CCR;            // recovery-mode threshold
    uint256 public immutable borrowFeeBps;   // one-off fee on new debt
    uint256 public immutable redemptionFeeBps;
    uint256 public immutable minDebt;
    uint256 public immutable debtCap;        // max total debt for this collateral
    uint256 public immutable gasComp;        // liquidation reserve (USDPM) held per vault, paid to liquidator
    uint256 public gasPoolBalance;

    // --- troves ---
    enum Status { None, Active, Closed }
    struct Trove { uint256 debt; uint256 coll; uint256 stake; Status status; }
    mapping(address => Trove) public troves;
    mapping(address => uint256) public snapL_Coll;
    mapping(address => uint256) public snapL_Debt;
    mapping(address => uint256) public collSurplus; // left-over coll after full redemption
    uint256 public totalSurplus;
    address[] public owners; // for UIs/keepers; not used for logic ordering
    address public sortedHead; address public sortedTail; uint256 public sortedSize;
    mapping(address => address) public sortedNext; // towards riskier (lower NICR)
    mapping(address => address) public sortedPrev; // towards safer
    mapping(address => bool) public inSorted;

    uint256 public activeColl;
    uint256 public activeDebt;
    uint256 public defaultColl; // redistributed, not yet applied to troves
    uint256 public defaultDebt;
    uint256 public totalStakes;
    uint256 public totalStakesSnapshot;
    uint256 public totalCollSnapshot;
    uint256 public L_Coll;
    uint256 public L_Debt;

    // --- stability pool (Liquity product/sum algorithm) ---
    uint256 public totalDeposits;
    uint256 public spCollBalance;
    uint256 public P = DP;
    uint128 public currentScale;
    uint128 public currentEpoch;
    mapping(uint128 => mapping(uint128 => uint256)) public epochToScaleToS;
    mapping(uint128 => mapping(uint128 => uint256)) public epochToScaleToG;
    struct Snap { uint256 S; uint256 P; uint256 G; uint128 scale; uint128 epoch; }
    mapping(address => uint256) public deposits;
    mapping(address => Snap) public depositSnaps;

    event TroveUpdated(address indexed owner, uint256 debt, uint256 coll);
    event Liquidated(address indexed owner, uint256 debt, uint256 coll, uint256 offset);
    event Redeemed(address indexed redeemer, uint256 usdpmAmount, uint256 collSent, uint256 fee);
    event SPDeposit(address indexed user, uint256 newDeposit);

    struct Config {
        address coll; uint8 decimals; address priceFeed; address usdpm; address pmnt;
        address staking; address issuance; uint256 mcr; uint256 ccr;
        uint256 borrowFeeBps; uint256 redemptionFeeBps; uint256 minDebt; uint256 debtCap; uint256 gasComp;
    }

    constructor(Config memory c) {
        require(c.mcr >= 1.1e18 && c.ccr > c.mcr, "bad ratios");
        coll = IERC20(c.coll); collScale = 10 ** c.decimals; priceFeed = IPriceFeed(c.priceFeed);
        usdpm = USDPM(c.usdpm); pmnt = IERC20(c.pmnt); staking = PMNTStaking(c.staking);
        issuance = CommunityIssuance(c.issuance); MCR = c.mcr; CCR = c.ccr;
        borrowFeeBps = c.borrowFeeBps; redemptionFeeBps = c.redemptionFeeBps; minDebt = c.minDebt; debtCap = c.debtCap; gasComp = c.gasComp;
        require(c.minDebt > c.gasComp, "minDebt <= gasComp");
    }

    // ================= views =================
    function _icr(uint256 c, uint256 d, uint256 price) internal view returns (uint256) {
        if (d == 0) return type(uint256).max;
        return c * price / collScale * DP / d;
    }
    function entireSystemColl() public view returns (uint256) { return activeColl + defaultColl; }
    function entireSystemDebt() public view returns (uint256) { return activeDebt + defaultDebt; }
    function _tcr(uint256 price) internal view returns (uint256) { return _icr(entireSystemColl(), entireSystemDebt(), price); }
    function getTCR(uint256 price) external view returns (uint256) { return _tcr(price); }
    function isRecoveryMode(uint256 price) public view returns (bool) { return _tcr(price) < CCR; }
    function pendingRewards(address o) public view returns (uint256 pc, uint256 pd) {
        Trove storage t = troves[o];
        if (t.status != Status.Active) return (0, 0);
        pc = t.stake * (L_Coll - snapL_Coll[o]) / DP;
        pd = t.stake * (L_Debt - snapL_Debt[o]) / DP;
    }
    function getEntireTrove(address o) public view returns (uint256 debt, uint256 c) {
        (uint256 pc, uint256 pd) = pendingRewards(o);
        return (troves[o].debt + pd, troves[o].coll + pc);
    }
    function getICR(address o, uint256 price) external view returns (uint256) {
        (uint256 d, uint256 c) = getEntireTrove(o); return _icr(c, d, price);
    }
    function ownersCount() external view returns (uint256) { return owners.length; }

    // ================= trove internals =================
    function _applyPending(address o) internal {
        Trove storage t = troves[o];
        if (t.status != Status.Active) return;
        (uint256 pc, uint256 pd) = pendingRewards(o);
        if (pc > 0 || pd > 0) {
            t.coll += pc; t.debt += pd;
            defaultColl -= pc; defaultDebt -= pd; activeColl += pc; activeDebt += pd;
        }
        snapL_Coll[o] = L_Coll; snapL_Debt[o] = L_Debt;
    }
    function _computeStake(uint256 c) internal view returns (uint256) {
        return totalCollSnapshot == 0 ? c : c * totalStakesSnapshot / totalCollSnapshot;
    }
    function _updateStake(address o) internal {
        Trove storage t = troves[o];
        uint256 s = _computeStake(t.coll);
        totalStakes = totalStakes - t.stake + s;
        t.stake = s;
    }
    function _removeTrove(address o) internal {
        Trove storage t = troves[o];
        _sortedRemove(o);
        totalStakes -= t.stake;
        t.stake = 0; t.debt = 0; t.coll = 0; t.status = Status.Closed;
    }
    function _fee(uint256 amt, uint256 bps) internal pure returns (uint256) { return amt * bps / FEE_DENOM; }

    function _mintFee(uint256 fee) internal {
        if (fee == 0) return;
        usdpm.mint(address(staking), fee);
        staking.notifyReward(address(usdpm), fee);
    }

    // ================= borrower operations =================
    function openTrove(uint256 collAmt, uint256 usdpmAmt) external nonReentrant {
        _openTrove(collAmt, usdpmAmt, address(0), address(0));
    }
    /// @param upperHint/lowerHint neighbours in the sorted list (from getInsertPosition); wrong hints still work, just cost more gas.
    function openTroveWithHints(uint256 collAmt, uint256 usdpmAmt, address upperHint, address lowerHint) external nonReentrant {
        _openTrove(collAmt, usdpmAmt, upperHint, lowerHint);
    }
    function _openTrove(uint256 collAmt, uint256 usdpmAmt, address upperHint, address lowerHint) internal {
        Trove storage t = troves[msg.sender];
        require(t.status != Status.Active, "trove active");
        (uint256 price, bool riskyPaused,) = priceFeed.fetchPriceWithFlags();
        require(!riskyPaused, "Price too old: borrowing paused");
        uint256 fee = _fee(usdpmAmt, borrowFeeBps);
        uint256 debt = usdpmAmt + fee + gasComp; // reserve is part of the debt, refunded on close
        require(debt >= minDebt, "below min debt");
        require(entireSystemDebt() + debt <= debtCap, "debt cap");
        uint256 icr = _icr(collAmt, debt, price);
        if (isRecoveryMode(price)) {
            require(icr >= CCR, "RM: ICR < CCR");
        } else {
            require(icr >= MCR, "ICR < MCR");
            require(_icr(entireSystemColl() + collAmt, entireSystemDebt() + debt, price) >= CCR, "would enter RM");
        }
        coll.safeTransferFrom(msg.sender, address(this), collAmt);
        if (t.status == Status.None) owners.push(msg.sender);
        t.coll = collAmt; t.debt = debt; t.status = Status.Active;
        snapL_Coll[msg.sender] = L_Coll; snapL_Debt[msg.sender] = L_Debt;
        _updateStake(msg.sender);
        activeColl += collAmt; activeDebt += debt;
        usdpm.mint(msg.sender, usdpmAmt);
        if (gasComp > 0) { usdpm.mint(address(this), gasComp); gasPoolBalance += gasComp; }
        _mintFee(fee);
        _sortedInsert(msg.sender, _nicr(collAmt, debt), upperHint, lowerHint);
        emit TroveUpdated(msg.sender, debt, collAmt);
    }

    /// @param collIn collateral to add, collOut collateral to withdraw (one should be 0)
    /// @param borrow new USDPM to draw, repay USDPM to pay back (one should be 0)
    function adjustTrove(uint256 collIn, uint256 collOut, uint256 borrow, uint256 repay) external nonReentrant {
        _adjustTrove(collIn, collOut, borrow, repay, address(0), address(0));
    }
    function adjustTroveWithHints(uint256 collIn, uint256 collOut, uint256 borrow, uint256 repay, address upperHint, address lowerHint)
        external nonReentrant
    { _adjustTrove(collIn, collOut, borrow, repay, upperHint, lowerHint); }
    function _adjustTrove(uint256 collIn, uint256 collOut, uint256 borrow, uint256 repay, address upperHint, address lowerHint) internal {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.Active, "no trove");
        require(collIn == 0 || collOut == 0, "coll in+out");
        require(borrow == 0 || repay == 0, "borrow+repay");
        (uint256 price, bool riskyPaused,) = priceFeed.fetchPriceWithFlags();
        // Stale price: only safety-increasing actions (repay, add collateral) are allowed.
        if (riskyPaused) require(borrow == 0 && collOut == 0, "Price too old: borrow/withdraw paused");
        _applyPending(msg.sender);
        bool rm = isRecoveryMode(price);
        uint256 oldIcr = _icr(t.coll, t.debt, price);
        uint256 fee = _fee(borrow, borrowFeeBps);
        uint256 newColl = t.coll + collIn - collOut;
        uint256 newDebt = t.debt + borrow + fee - repay;
        require(newDebt >= minDebt, "below min debt");
        if (borrow > 0) require(entireSystemDebt() + borrow + fee <= debtCap, "debt cap");
        uint256 newIcr = _icr(newColl, newDebt, price);
        if (rm) {
            require(collOut == 0, "RM: no coll withdrawal");
            if (borrow > 0) require(newIcr >= CCR && newIcr >= oldIcr, "RM: ICR");
        } else {
            require(newIcr >= MCR, "ICR < MCR");
            require(_icr(entireSystemColl() + collIn - collOut, entireSystemDebt() + borrow + fee - repay, price) >= CCR, "would enter RM");
        }
        if (collIn > 0) coll.safeTransferFrom(msg.sender, address(this), collIn);
        if (repay > 0) usdpm.burn(msg.sender, repay);
        t.coll = newColl; t.debt = newDebt;
        activeColl = activeColl + collIn - collOut;
        activeDebt = activeDebt + borrow + fee - repay;
        _updateStake(msg.sender);
        if (borrow > 0) { usdpm.mint(msg.sender, borrow); _mintFee(fee); }
        if (collOut > 0) coll.safeTransfer(msg.sender, collOut);
        _sortedRemove(msg.sender);
        _sortedInsert(msg.sender, _nicr(newColl, newDebt), upperHint, lowerHint);
        emit TroveUpdated(msg.sender, newDebt, newColl);
    }

    function closeTrove() external nonReentrant {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.Active, "no trove");
        uint256 price = priceFeed.fetchPrice();
        _applyPending(msg.sender);
        require(!isRecoveryMode(price), "RM: cannot close");
        uint256 c = t.coll; uint256 d = t.debt;
        require(totalStakes > t.stake || (defaultDebt == 0), "last trove");
        usdpm.burn(msg.sender, d - gasComp);
        _burnGasComp();
        activeColl -= c; activeDebt -= d;
        _removeTrove(msg.sender);
        if (activeDebt > 0 || defaultDebt > 0) {
            require(_tcr(price) >= CCR, "would enter RM");
        }
        coll.safeTransfer(msg.sender, c);
        emit TroveUpdated(msg.sender, 0, 0);
    }

    function claimCollSurplus() external nonReentrant {
        uint256 s = collSurplus[msg.sender];
        require(s > 0, "no surplus");
        collSurplus[msg.sender] = 0; totalSurplus -= s;
        coll.safeTransfer(msg.sender, s);
    }

    // ================= liquidation =================
    function liquidate(address o) public nonReentrant {
        _liquidate(o, priceFeed.fetchPrice());
    }

    function batchLiquidate(address[] calldata list) external nonReentrant {
        uint256 price = priceFeed.fetchPrice();
        for (uint256 i; i < list.length; i++) {
            Trove storage t = troves[list[i]];
            if (t.status != Status.Active) continue;
            (uint256 d, uint256 c) = getEntireTrove(list[i]);
            if (_icr(c, d, price) < MCR) _liquidate(list[i], price);
        }
    }

    function _liquidate(address o, uint256 price) internal {
        Trove storage t = troves[o];
        require(t.status == Status.Active, "no trove");
        _applyPending(o);
        uint256 c = t.coll; uint256 d = t.debt;
        require(_icr(c, d, price) < MCR, "ICR >= MCR");
        _triggerSPIssuance();

        uint256 liqComp = c * LIQUIDATOR_BPS / FEE_DENOM;
        uint256 collRest = c - liqComp;
        activeColl -= c; activeDebt -= d;
        uint256 stakeOut = t.stake;
        _removeTrove(o);

        // 1) offset with stability pool
        uint256 debtOffset = d < totalDeposits ? d : totalDeposits;
        uint256 collToSP = d == 0 ? 0 : collRest * debtOffset / d;
        if (debtOffset > 0) _offset(debtOffset, collToSP);

        // 2) redistribute remainder to other troves
        uint256 debtRedist = d - debtOffset;
        uint256 collRedist = collRest - collToSP;
        if (debtRedist > 0 || collRedist > 0) {
            require(totalStakes > 0, "nothing to redistribute to");
            L_Coll += collRedist * DP / totalStakes;
            L_Debt += debtRedist * DP / totalStakes;
            defaultColl += collRedist; defaultDebt += debtRedist;
        }
        stakeOut; // silence
        totalStakesSnapshot = totalStakes;
        totalCollSnapshot = entireSystemColl();
        coll.safeTransfer(msg.sender, liqComp);
        if (gasComp > 0) { gasPoolBalance -= gasComp; IERC20(address(usdpm)).safeTransfer(msg.sender, gasComp); }
        emit Liquidated(o, d, c, debtOffset);
    }

    // ================= redemptions =================
    /// @notice Swap USDPM for collateral at face value ($1) minus fee. Vaults are redeemed strictly in
    /// order from the riskiest (lowest collateral ratio) upward using the on-chain sorted list; vaults
    /// below MCR are skipped (they should be liquidated instead).
    /// @param maxIterations 0 = no limit. Hints are only used to re-insert a partially redeemed vault.
    function redeem(uint256 usdpmAmt, uint256 maxIterations, uint256 minCollOut, address upperHint, address lowerHint)
        external nonReentrant
    {
        (uint256 price,, bool redemptionsPaused) = priceFeed.fetchPriceWithFlags();
        require(!redemptionsPaused, "Price sources unsettled: redemptions paused");
        require(_tcr(price) >= MCR, "TCR < MCR");
        uint256 remaining = usdpmAmt;
        uint256 collOut;
        address cur = sortedTail;
        while (cur != address(0) && _icrOf(cur, price) < MCR) cur = sortedPrev[cur];
        for (uint256 it; cur != address(0) && remaining > 0 && (maxIterations == 0 || it < maxIterations); it++) {
            address nextCur = sortedPrev[cur];
            (uint256 taken, uint256 c) = _redeemFrom(cur, remaining, price, upperHint, lowerHint);
            collOut += c; remaining -= taken;
            cur = nextCur;
        }
        uint256 redeemed = usdpmAmt - remaining;
        require(redeemed > 0, "nothing redeemed");
        usdpm.burn(msg.sender, redeemed);
        uint256 fee = _fee(collOut, redemptionFeeBps);
        require(collOut - fee >= minCollOut, "slippage");
        if (fee > 0) { coll.safeTransfer(address(staking), fee); staking.notifyReward(address(coll), fee); }
        coll.safeTransfer(msg.sender, collOut - fee);
        emit Redeemed(msg.sender, redeemed, collOut - fee, fee);
    }

    function _redeemFrom(address o, uint256 remaining, uint256 price, address upperHint, address lowerHint)
        internal returns (uint256 take, uint256 c)
    {
        Trove storage t = troves[o];
        _applyPending(o);
        uint256 redeemable = t.debt - gasComp; // the reserve itself is never redeemed
        take = remaining < redeemable ? remaining : redeemable;
        if (take < redeemable && t.debt - take < minDebt) {
            take = t.debt - minDebt; // partial down to minDebt
            if (take == 0) return (0, 0);
        }
        c = take * collScale / price;
        t.debt -= take; t.coll -= c;
        activeDebt -= take; activeColl -= c;
        if (t.debt == gasComp) {
            activeDebt -= gasComp; t.debt = 0;
            _burnGasComp();
            uint256 left = t.coll;
            activeColl -= left;
            collSurplus[o] += left; totalSurplus += left;
            _removeTrove(o);
        } else {
            _updateStake(o);
            _sortedRemove(o);
            _sortedInsert(o, _nicr(t.coll, t.debt), upperHint, lowerHint);
        }
        emit TroveUpdated(o, t.debt, t.coll);
    }

    function _burnGasComp() internal {
        if (gasComp == 0) return;
        gasPoolBalance -= gasComp; usdpm.burn(address(this), gasComp);
    }

    // ================= sorted list (descending NICR: head = safest, tail = riskiest) =================
    function _nicr(uint256 c, uint256 d) internal pure returns (uint256) {
        return d == 0 ? type(uint256).max : c * 1e20 / d;
    }
    /// Nominal ICR including pending redistribution rewards (price-independent, so ordering is stable).
    function getNominalICR(address o) public view returns (uint256) {
        (uint256 d, uint256 c) = getEntireTrove(o); return _nicr(c, d);
    }
    function _icrOf(address o, uint256 price) internal view returns (uint256) {
        (uint256 d, uint256 c) = getEntireTrove(o); return _icr(c, d, price);
    }
    function _validPos(uint256 n, address prev, address next) internal view returns (bool) {
        if (prev == address(0) && next == address(0)) return sortedSize == 0;
        if (prev == address(0)) return sortedHead == next && n >= getNominalICR(next);
        if (next == address(0)) return sortedTail == prev && n <= getNominalICR(prev);
        return sortedNext[prev] == next && getNominalICR(prev) >= n && n >= getNominalICR(next);
    }
    /// @notice Off-chain helper (eth_call) to compute hints for a given NICR.
    function getInsertPosition(uint256 n) public view returns (address prev, address next) {
        next = sortedHead;
        while (next != address(0) && getNominalICR(next) > n) { prev = next; next = sortedNext[next]; }
    }
    function _sortedInsert(address id, uint256 n, address prev, address next) internal {
        if (!_validPos(n, prev, next)) (prev, next) = getInsertPosition(n);
        sortedPrev[id] = prev; sortedNext[id] = next;
        if (prev == address(0)) sortedHead = id; else sortedNext[prev] = id;
        if (next == address(0)) sortedTail = id; else sortedPrev[next] = id;
        inSorted[id] = true; sortedSize++;
    }
    function _sortedRemove(address id) internal {
        if (!inSorted[id]) return;
        address prev = sortedPrev[id]; address next = sortedNext[id];
        if (prev == address(0)) sortedHead = next; else sortedNext[prev] = next;
        if (next == address(0)) sortedTail = prev; else sortedPrev[next] = prev;
        delete sortedPrev[id]; delete sortedNext[id]; inSorted[id] = false; sortedSize--;
    }

    // ================= stability pool =================
    function _triggerSPIssuance() internal {
        if (totalDeposits == 0 || address(issuance) == address(0)) return;
        uint256 amt = issuance.issue();
        if (amt == 0) return;
        uint256 perUnit = amt * DP / totalDeposits;
        epochToScaleToG[currentEpoch][currentScale] += perUnit * P;
    }

    function _offset(uint256 debt, uint256 c) internal {
        uint256 collPerUnit = c * DP / totalDeposits;
        uint256 lossPerUnit;
        if (debt == totalDeposits) lossPerUnit = DP;
        else { lossPerUnit = (debt * DP - 1) / totalDeposits + 1; } // round up
        epochToScaleToS[currentEpoch][currentScale] += collPerUnit * P;
        uint256 npf = DP - lossPerUnit;
        if (npf == 0) {
            currentEpoch += 1; currentScale = 0; P = DP;
        } else if (P * npf / DP < SCALE_FACTOR) {
            P = P * npf * SCALE_FACTOR / DP; currentScale += 1;
        } else {
            P = P * npf / DP;
        }
        require(P > 0, "SP: P underflow"); // never let the running product collapse to 0
        totalDeposits -= debt;
        spCollBalance += c;
        usdpm.burn(address(this), debt);
    }

    function _gainFrom(mapping(uint128 => mapping(uint128 => uint256)) storage m, uint256 d0, Snap memory s, uint256 snapVal)
        internal view returns (uint256)
    {
        if (d0 == 0) return 0;
        uint256 first = m[s.epoch][s.scale] - snapVal;
        uint256 second = m[s.epoch][s.scale + 1] / SCALE_FACTOR;
        return d0 * (first + second) / s.P / DP;
    }
    function getDepositorCollGain(address u) public view returns (uint256) {
        Snap memory s = depositSnaps[u]; return _gainFrom(epochToScaleToS, deposits[u], s, s.S);
    }
    function getDepositorPMNTGain(address u) public view returns (uint256) {
        Snap memory s = depositSnaps[u]; return _gainFrom(epochToScaleToG, deposits[u], s, s.G);
    }
    function getCompoundedDeposit(address u) public view returns (uint256) {
        uint256 d0 = deposits[u];
        if (d0 == 0) return 0;
        Snap memory s = depositSnaps[u];
        if (s.epoch < currentEpoch) return 0;
        uint256 diff = currentScale - s.scale;
        uint256 v;
        if (diff == 0) v = d0 * P / s.P;
        else if (diff == 1) v = d0 * P / s.P / SCALE_FACTOR;
        else return 0;
        if (v < d0 / 1e9) return 0; // dust guard
        return v;
    }

    function _payGainsAndUpdate(address u, uint256 newDeposit) internal {
        uint256 cg = getDepositorCollGain(u);
        uint256 gg = getDepositorPMNTGain(u);
        deposits[u] = newDeposit;
        if (newDeposit == 0) delete depositSnaps[u];
        else depositSnaps[u] = Snap({S: epochToScaleToS[currentEpoch][currentScale], P: P,
            G: epochToScaleToG[currentEpoch][currentScale], scale: currentScale, epoch: currentEpoch});
        if (cg > 0) { if (cg > spCollBalance) cg = spCollBalance; spCollBalance -= cg; coll.safeTransfer(u, cg); }
        if (gg > 0) { uint256 bal = pmnt.balanceOf(address(this)); if (gg > bal) gg = bal; pmnt.safeTransfer(u, gg); }
        emit SPDeposit(u, newDeposit);
    }

    function provideToSP(uint256 amt) external nonReentrant {
        require(amt > 0, "zero");
        _triggerSPIssuance();
        uint256 cur = getCompoundedDeposit(msg.sender);
        IERC20(address(usdpm)).safeTransferFrom(msg.sender, address(this), amt);
        totalDeposits += amt;
        _payGainsAndUpdate(msg.sender, cur + amt);
    }

    /// withdrawFromSP(0) claims collateral + PMNT gains only.
    /// Withdrawals (not claims) are blocked while the riskiest vault is liquidatable, so depositors
    /// cannot dodge a pending liquidation loss by front-running it (same rule as Liquity v1).
    function withdrawFromSP(uint256 amt) external nonReentrant {
        _triggerSPIssuance();
        uint256 cur = getCompoundedDeposit(msg.sender);
        uint256 w = amt > cur ? cur : amt;
        if (w > 0 && sortedTail != address(0)) {
            require(_icrOf(sortedTail, priceFeed.fetchPrice()) >= MCR, "SP: liquidations pending");
        }
        if (w > totalDeposits) w = totalDeposits;
        totalDeposits -= w;
        _payGainsAndUpdate(msg.sender, cur - w);
        if (w > 0) IERC20(address(usdpm)).safeTransfer(msg.sender, w);
    }
}
