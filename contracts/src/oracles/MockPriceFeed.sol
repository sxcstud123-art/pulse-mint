// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceFeed} from "./IPriceFeed.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TESTNET ONLY. Owner sets the price manually.
contract MockPriceFeed is IPriceFeed, Ownable {
    uint256 public price;
    constructor(uint256 _price) Ownable(msg.sender) { price = _price; }
    function setPrice(uint256 p) external onlyOwner { price = p; }
    function fetchPrice() external view returns (uint256) { return price; }
}
