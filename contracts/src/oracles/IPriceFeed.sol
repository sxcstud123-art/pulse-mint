// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable oracle. Returns USD price of ONE WHOLE collateral token, 18 decimals.
interface IPriceFeed {
    function fetchPrice() external returns (uint256);
    /// @notice Price plus safety flags the Branch uses to pause only the risky actions.
    /// @return price 18-dec USD price (never reverts once a first price exists, so liquidations keep working)
    /// @return riskyPaused true when the price is too old (Frozen past maxFrozenAge): block new borrowing
    ///         and collateral withdrawals; repay / add collateral / close / liquidate stay open.
    /// @return redemptionsPaused true while the sources Disagree or the feed has been Frozen past a short grace.
    function fetchPriceWithFlags() external returns (uint256 price, bool riskyPaused, bool redemptionsPaused);
}
