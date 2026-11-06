// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceSource} from "./IPriceSource.sol";

/// Minimal Fetch Oracle (Tellor-style reporter oracle on PulseChain) read interface.
interface IFetchOracle {
    function getDataBefore(bytes32 queryId, uint256 timestamp)
        external view returns (bool ifRetrieve, bytes memory value, uint256 timestampRetrieved);
}

/// @notice Independent (non-PulseX) fallback source. Reads a Fetch Oracle reporter value the safe way:
///  - only values at least `disputeBuffer` old (>= 20 min, Fetch guidance) so bad reports can be disputed;
///  - rejects values older than `maxAge`;
///  - NO cached copy: if a value is disputed and removed, we simply read the next older one (avoids Liquid
///    Loans HAL-01, where a disputed price stayed cached);
///  - value is expected as a uint256 18-decimal USD price (scaled by `valueDecimals`).
/// Because it lags by >= 20 minutes it is a FALLBACK only, never the primary.
contract FetchOracleSource is IPriceSource {
    IFetchOracle public immutable oracle;
    bytes32 public immutable queryId;
    uint256 public immutable disputeBuffer;
    uint256 public immutable maxAge;
    uint8 public immutable valueDecimals;

    constructor(address _oracle, bytes32 _queryId, uint256 _disputeBuffer, uint256 _maxAge, uint8 _valueDecimals) {
        require(_oracle != address(0), "no oracle");
        require(_disputeBuffer >= 20 minutes && _maxAge > _disputeBuffer, "bad window");
        oracle = IFetchOracle(_oracle); queryId = _queryId; disputeBuffer = _disputeBuffer; maxAge = _maxAge;
        valueDecimals = _valueDecimals;
    }

    function tryFetch() external view returns (uint256 price, bool ok) {
        try oracle.getDataBefore(queryId, block.timestamp - disputeBuffer) returns (bool got, bytes memory v, uint256 ts) {
            if (!got || v.length != 32 || ts == 0 || block.timestamp - ts > maxAge) return (0, false);
            uint256 raw = abi.decode(v, (uint256));
            price = valueDecimals == 18 ? raw : raw * 1e18 / (10 ** uint256(valueDecimals));
            ok = price > 0;
        } catch { return (0, false); }
    }
}
