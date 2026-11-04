// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Holds the stability-pool share of PMNT and streams it to each branch's
/// stability pool at a per-branch rate (PMNT per second). Stops when the balance runs out.
contract CommunityIssuance is Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable pmnt;
    mapping(address => uint256) public ratePerSec;
    mapping(address => uint256) public lastIssue;

    constructor(address _pmnt) Ownable(msg.sender) { pmnt = IERC20(_pmnt); }

    function setRate(address branch, uint256 rate) external onlyOwner {
        ratePerSec[branch] = rate;
        lastIssue[branch] = block.timestamp;
    }

    /// Called by a branch; transfers accrued PMNT to it and returns the amount.
    function issue() external returns (uint256 amt) {
        uint256 rate = ratePerSec[msg.sender];
        if (rate == 0) return 0;
        amt = (block.timestamp - lastIssue[msg.sender]) * rate;
        lastIssue[msg.sender] = block.timestamp;
        uint256 bal = pmnt.balanceOf(address(this));
        if (amt > bal) amt = bal;
        if (amt > 0) pmnt.safeTransfer(msg.sender, amt);
    }
}
