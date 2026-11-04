// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice USD-pegged stablecoin ( Only collateral branches can mint/burn.
contract USDPM is ERC20, Ownable {
    mapping(address => bool) public isBranch;
    event BranchAdded(address branch);

    constructor() ERC20("Pulse Mint USD", "USDPM") Ownable(msg.sender) {}

    /// Owner wires branches at deploy time, then should renounceOwnership().
    function addBranch(address b) external onlyOwner { isBranch[b] = true; emit BranchAdded(b); }

    modifier onlyBranch() { require(isBranch[msg.sender], "USDPM: not branch"); _; }
    function mint(address to, uint256 amt) external onlyBranch { _mint(to, amt); }
    function burn(address from, uint256 amt) external onlyBranch { _burn(from, amt); }
}
