// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable oracle. Returns USD price of ONE WHOLE collateral token, 18 decimals.
interface IPriceFeed {
    function fetchPrice() external returns (uint256);
}
