// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceFeed} from "./IPriceFeed.sol";
import {IPriceSource} from "./IPriceSource.sol";

/// @notice The feed a Branch should use in production. Combines a primary and an optional
/// fallback source (Liquity-style):
///  - both healthy and within `maxSpreadBps` of each other -> primary;
///  - both healthy but disagreeing -> the LOWER price (conservative: protects the system, not borrowers);
///  - only one healthy -> that one;
///  - neither healthy -> last good price, and status = Frozen (keepers/UI should alert).
contract RobustPriceFeed is IPriceFeed {
    enum Status { PrimaryOk, Disagree, FallbackOnly, PrimaryOnly, Frozen }
    IPriceSource public immutable primary;
    IPriceSource public immutable fallbackSource; // may be address(0)
    uint256 public immutable maxSpreadBps;
    uint256 public lastGoodPrice;
    Status public status;
    event PriceUsed(uint256 price, Status status);

    constructor(address _primary, address _fallback, uint256 _maxSpreadBps) {
        primary = IPriceSource(_primary); fallbackSource = IPriceSource(_fallback); maxSpreadBps = _maxSpreadBps;
    }

    function _try(IPriceSource s) internal returns (uint256 p, bool ok) {
        if (address(s) == address(0)) return (0, false);
        try s.tryFetch() returns (uint256 price, bool good) { return (price, good && price > 0); }
        catch { return (0, false); }
    }

    function fetchPrice() external returns (uint256) {
        (uint256 p1, bool ok1) = _try(primary);
        (uint256 p2, bool ok2) = _try(fallbackSource);
        uint256 p; Status st;
        if (ok1 && ok2) {
            uint256 hi = p1 > p2 ? p1 : p2; uint256 lo = p1 > p2 ? p2 : p1;
            if ((hi - lo) * 10_000 / lo <= maxSpreadBps) { p = p1; st = Status.PrimaryOk; }
            else { p = lo; st = Status.Disagree; }
        } else if (ok1) { p = p1; st = Status.PrimaryOnly; }
        else if (ok2) { p = p2; st = Status.FallbackOnly; }
        else { require(lastGoodPrice > 0, "no price"); p = lastGoodPrice; st = Status.Frozen; }
        lastGoodPrice = p; status = st;
        emit PriceUsed(p, st);
        return p;
    }
}
