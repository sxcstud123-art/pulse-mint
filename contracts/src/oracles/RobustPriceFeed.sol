// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceFeed} from "./IPriceFeed.sol";
import {IPriceSource} from "./IPriceSource.sol";

/// @notice The feed a Branch should use in production. Combines a primary and an (ideally independent)
/// fallback source:
///  - both healthy and within `maxSpreadBps` of each other -> primary;
///  - both healthy but disagreeing -> the LOWER price (protects the system) and redemptions pause;
///  - only one healthy -> that one;
///  - neither healthy -> last good price, status Frozen.
/// Frozen is time-limited (fixes the Liquid Loans HAL-02 "last good price forever" issue):
///  - Frozen for <= `frozenGrace` (a short glitch): nothing pauses;
///  - Frozen for >  `frozenGrace`: redemptions pause;
///  - last live price older than `maxFrozenAge` (~2h): new borrowing and collateral withdrawals pause too.
/// The feed never reverts after its first price, so repay / add collateral / close and LIQUIDATIONS keep working.
contract RobustPriceFeed is IPriceFeed {
    enum Status { PrimaryOk, Disagree, FallbackOnly, PrimaryOnly, Frozen }
    IPriceSource public immutable primary;
    IPriceSource public immutable fallbackSource; // may be address(0)
    uint256 public immutable maxSpreadBps;
    uint256 public immutable maxFrozenAge;
    uint256 public immutable frozenGrace;
    uint256 public lastGoodPrice;
    uint256 public lastGoodPriceUpdatedAt; // last time a LIVE source price was used
    Status public status;
    event PriceUsed(uint256 price, Status status, bool riskyPaused, bool redemptionsPaused);

    constructor(address _primary, address _fallback, uint256 _maxSpreadBps, uint256 _maxFrozenAge, uint256 _frozenGrace) {
        require(_primary != address(0), "no primary");
        require(_frozenGrace <= _maxFrozenAge && _maxFrozenAge >= 30 minutes && _maxFrozenAge <= 1 days, "bad frozen window");
        primary = IPriceSource(_primary); fallbackSource = IPriceSource(_fallback); maxSpreadBps = _maxSpreadBps;
        maxFrozenAge = _maxFrozenAge; frozenGrace = _frozenGrace;
    }

    function _try(IPriceSource s) internal returns (uint256 p, bool ok) {
        if (address(s) == address(0)) return (0, false);
        try s.tryFetch() returns (uint256 price, bool good) { return (price, good && price > 0); }
        catch { return (0, false); }
    }

    function fetchPrice() external returns (uint256 p) { (p,,) = _fetch(); }
    function fetchPriceWithFlags() external returns (uint256, bool, bool) { return _fetch(); }

    /// Age of the last live price (0 while sources are healthy).
    function frozenFor() public view returns (uint256) {
        return status == Status.Frozen ? block.timestamp - lastGoodPriceUpdatedAt : 0;
    }

    function _fetch() internal returns (uint256 p, bool riskyPaused, bool redemptionsPaused) {
        (uint256 p1, bool ok1) = _try(primary);
        (uint256 p2, bool ok2) = _try(fallbackSource);
        Status st;
        if (ok1 && ok2) {
            uint256 hi = p1 > p2 ? p1 : p2; uint256 lo = p1 > p2 ? p2 : p1;
            if ((hi - lo) * 10_000 / lo <= maxSpreadBps) { p = p1; st = Status.PrimaryOk; }
            else { p = lo; st = Status.Disagree; redemptionsPaused = true; }
        } else if (ok1) { p = p1; st = Status.PrimaryOnly; }
        else if (ok2) { p = p2; st = Status.FallbackOnly; }
        else {
            require(lastGoodPrice > 0, "no price");
            p = lastGoodPrice; st = Status.Frozen;
            uint256 age = block.timestamp - lastGoodPriceUpdatedAt;
            redemptionsPaused = age > frozenGrace;
            riskyPaused = age > maxFrozenAge;
        }
        if (st != Status.Frozen) { lastGoodPrice = p; lastGoodPriceUpdatedAt = block.timestamp; }
        status = st;
        emit PriceUsed(p, st, riskyPaused, redemptionsPaused);
    }
}
