// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// TEST ONLY: mimics UniswapV2Pair reserve + cumulative-price accounting (_update).
contract MockUniV2Pair {
    address public token0; address public token1;
    uint112 r0; uint112 r1; uint32 public blockTimestampLast;
    uint256 public price0CumulativeLast; uint256 public price1CumulativeLast;
    constructor(address a, address b) { (token0, token1) = a < b ? (a, b) : (b, a); }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, blockTimestampLast); }
    /// Simulates a trade/sync that leaves the given reserves.
    function setReserves(uint112 n0, uint112 n1) external {
        uint32 ts = uint32(block.timestamp);
        unchecked {
            uint32 elapsed = ts - blockTimestampLast;
            if (elapsed > 0 && r0 != 0 && r1 != 0) {
                price0CumulativeLast += ((uint256(r1) << 112) / r0) * elapsed;
                price1CumulativeLast += ((uint256(r0) << 112) / r1) * elapsed;
            }
        }
        r0 = n0; r1 = n1; blockTimestampLast = ts;
    }
}
