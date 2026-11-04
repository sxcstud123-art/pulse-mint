// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Synthetix-style staking of a PulseX LP token (e.g. USDPM/WPLS or PMNT/WPLS) for PMNT.
contract LPRewards is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable lp;
    IERC20 public immutable pmnt;
    uint256 public immutable rewardRate;   // PMNT per second
    uint256 public immutable periodFinish;
    uint256 public lastUpdate;
    uint256 public rewardPerTokenStored;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public paid;
    mapping(address => uint256) public rewards;

    /// PMNT for the whole period must be transferred to this contract after deployment.
    constructor(address _lp, address _pmnt, uint256 _rate, uint256 _duration) {
        lp = IERC20(_lp); pmnt = IERC20(_pmnt); rewardRate = _rate;
        periodFinish = block.timestamp + _duration; lastUpdate = block.timestamp;
    }
    function _lastApplicable() internal view returns (uint256) { return block.timestamp < periodFinish ? block.timestamp : periodFinish; }
    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (_lastApplicable() - lastUpdate) * rewardRate * 1e18 / totalSupply;
    }
    function earned(address a) public view returns (uint256) {
        return balanceOf[a] * (rewardPerToken() - paid[a]) / 1e18 + rewards[a];
    }
    modifier update(address a) {
        rewardPerTokenStored = rewardPerToken(); lastUpdate = _lastApplicable();
        rewards[a] = earned(a); paid[a] = rewardPerTokenStored; _;
    }
    function stake(uint256 amt) external nonReentrant update(msg.sender) {
        totalSupply += amt; balanceOf[msg.sender] += amt; lp.safeTransferFrom(msg.sender, address(this), amt);
    }
    function withdraw(uint256 amt) public nonReentrant update(msg.sender) {
        totalSupply -= amt; balanceOf[msg.sender] -= amt; lp.safeTransfer(msg.sender, amt);
    }
    function claim() public nonReentrant update(msg.sender) {
        uint256 r = rewards[msg.sender]; rewards[msg.sender] = 0; if (r > 0) pmnt.safeTransfer(msg.sender, r);
    }
}
