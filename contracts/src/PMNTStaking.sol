// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Stake PMNT, earn borrowing fees (USDPM) and redemption fees (each collateral token).
contract PMNTStaking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable pmnt;
    address[] public rewardTokens;
    mapping(address => bool) public isRewardToken;
    mapping(address => bool) public isNotifier;

    uint256 public totalStaked;
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public F;            // reward per staked PMNT, 1e18
    mapping(address => uint256) public undistributed; // fees received while nobody staked
    mapping(address => mapping(address => uint256)) public snapshot;

    constructor(address _pmnt) Ownable(msg.sender) { pmnt = IERC20(_pmnt); }

    function addRewardToken(address t) external onlyOwner {
        if (!isRewardToken[t]) { isRewardToken[t] = true; rewardTokens.push(t); }
    }
    function addNotifier(address n) external onlyOwner { isNotifier[n] = true; }
    function rewardTokenCount() external view returns (uint256) { return rewardTokens.length; }

    /// Called by a branch AFTER transferring `amt` of `token` to this contract.
    function notifyReward(address token, uint256 amt) external {
        require(isNotifier[msg.sender] && isRewardToken[token], "Staking: unauthorized");
        if (totalStaked == 0) { undistributed[token] += amt; return; }
        F[token] += (amt + undistributed[token]) * 1e18 / totalStaked;
        undistributed[token] = 0;
    }

    function pending(address user, address token) public view returns (uint256) {
        return stakes[user] * (F[token] - snapshot[user][token]) / 1e18;
    }

    function _claimAll(address user) internal {
        for (uint256 i; i < rewardTokens.length; i++) {
            address t = rewardTokens[i];
            uint256 p = pending(user, t);
            snapshot[user][t] = F[t];
            if (p > 0) IERC20(t).safeTransfer(user, p);
        }
    }

    function stake(uint256 amt) external nonReentrant {
        _claimAll(msg.sender);
        if (amt > 0) {
            pmnt.safeTransferFrom(msg.sender, address(this), amt);
            stakes[msg.sender] += amt;
            totalStaked += amt;
        }
    }

    /// unstake(0) just claims rewards.
    function unstake(uint256 amt) external nonReentrant {
        require(amt <= stakes[msg.sender], "Staking: too much");
        _claimAll(msg.sender);
        stakes[msg.sender] -= amt;
        totalStaked -= amt;
        if (amt > 0) pmnt.safeTransfer(msg.sender, amt);
    }
}
