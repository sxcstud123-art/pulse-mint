// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice A price source that reports failure instead of reverting, so a wrapper can fall back.
interface IPriceSource {
    /// @return price 18-decimal price of one whole token; ok false if stale/unsafe/unavailable.
    function tryFetch() external returns (uint256 price, bool ok);
}
