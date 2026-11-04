// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply governance/fee token ( No mint after construction.
contract PMNT is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 100_000_000e18;
    /// @param recipients e.g. [communityIssuance, lpRewards, team/treasury]
    constructor(address[] memory recipients, uint256[] memory amounts) ERC20("Pulse Mint", "PMNT") {
        uint256 sum;
        for (uint256 i; i < recipients.length; i++) { _mint(recipients[i], amounts[i]); sum += amounts[i]; }
        require(sum == TOTAL_SUPPLY, "PMNT: bad split");
    }
}
