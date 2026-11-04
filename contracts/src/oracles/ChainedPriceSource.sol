// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceSource} from "./IPriceSource.sol";

/// @notice Multiplies two sources, e.g. HEX/WPLS (PulseX TWAP) x WPLS/USD (PulseX TWAP vs a USD stable).
contract ChainedPriceSource is IPriceSource {
    IPriceSource public immutable a;
    IPriceSource public immutable b;
    constructor(address _a, address _b) { a = IPriceSource(_a); b = IPriceSource(_b); }
    function tryFetch() external returns (uint256 price, bool ok) {
        (uint256 pa, bool oa) = a.tryFetch();
        (uint256 pb, bool ob) = b.tryFetch();
        return (pa * pb / 1e18, oa && ob);
    }
}
