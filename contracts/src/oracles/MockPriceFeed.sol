// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceFeed} from "./IPriceFeed.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TESTNET ONLY. Owner sets the price (and, for testing, the pause flags) manually.
contract MockPriceFeed is IPriceFeed, Ownable {
    uint256 public price;
    bool public riskyPaused;
    bool public redemptionsPaused;
    constructor(uint256 _price) Ownable(msg.sender) { price = _price; }
    function setPrice(uint256 p) external onlyOwner { price = p; }
    function setFlags(bool _risky, bool _redemptions) external onlyOwner { riskyPaused = _risky; redemptionsPaused = _redemptions; }
    function fetchPrice() external view returns (uint256) { return price; }
    function fetchPriceWithFlags() external view returns (uint256, bool, bool) { return (price, riskyPaused, redemptionsPaused); }
}
