// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPriceSource} from "./IPriceSource.sol";
import {IPriceFeed} from "./IPriceFeed.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IUniV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function getReserves() external view returns (uint112, uint112, uint32);
}

/// @notice Time-weighted average price from a PulseX (Uniswap V2 fork) pair.
/// Reports `token` priced in `quote` (18 decimals). Sanity checks:
///  - the TWAP window must be at least `period` long (short windows are easy to manipulate);
///  - the TWAP must have been refreshed within `maxAge` (staleness);
///  - the pair must hold at least `minQuoteReserve` of the quote token (thin pools are unsafe);
///  - a single update may not move the price by more than `maxDeviationBps` from the last good one.
/// If any check fails, tryFetch() returns ok=false so a RobustPriceFeed can use its fallback.
/// Anyone can call update(); a keeper should call it at least every `period`.
contract PulseXTwapFeed is IPriceSource, IPriceFeed {
    IUniV2Pair public immutable pair;
    bool public immutable tokenIs0;
    uint256 public immutable period;
    uint256 public immutable maxAge;
    uint256 public immutable minQuoteReserve;
    uint256 public immutable maxDeviationBps;
    uint8 public immutable tokenDecimals;
    uint8 public immutable quoteDecimals;

    uint256 public obsCumulative;
    uint256 public obsTimestamp;
    uint256 public twap;          // last computed TWAP (18 dec)
    uint256 public twapUpdatedAt;
    bool public lastUpdateDeviated;

    event TwapUpdated(uint256 price, bool deviated);

    constructor(address _pair, address _token, uint8 _tokenDec, uint8 _quoteDec, uint256 _period, uint256 _maxAge,
        uint256 _minQuoteReserve, uint256 _maxDeviationBps)
    {
        pair = IUniV2Pair(_pair);
        require(IUniV2Pair(_pair).token0() == _token || IUniV2Pair(_pair).token1() == _token, "token not in pair");
        tokenIs0 = IUniV2Pair(_pair).token0() == _token;
        require(_period >= 10 minutes && _maxAge >= _period, "bad window");
        period = _period; maxAge = _maxAge; minQuoteReserve = _minQuoteReserve; maxDeviationBps = _maxDeviationBps;
        tokenDecimals = _tokenDec; quoteDecimals = _quoteDec;
        obsCumulative = currentCumulative();
        obsTimestamp = block.timestamp;
    }

    /// Cumulative price as of now, including time since the pair's last trade (UniswapV2OracleLibrary).
    function currentCumulative() public view returns (uint256 cum) {
        (uint112 r0, uint112 r1, uint32 last) = pair.getReserves();
        cum = tokenIs0 ? pair.price0CumulativeLast() : pair.price1CumulativeLast();
        uint32 nowTs = uint32(block.timestamp);
        if (last != nowTs && r0 > 0 && r1 > 0) {
            unchecked {
                uint32 elapsed = nowTs - last;
                uint256 p = tokenIs0 ? (uint256(r1) << 112) / r0 : (uint256(r0) << 112) / r1;
                cum += p * elapsed;
            }
        }
    }

    function _toPrice(uint256 uq112) internal view returns (uint256) {
        return Math.mulDiv(uq112, 10 ** (uint256(tokenDecimals) + 18), (2 ** 112) * 10 ** uint256(quoteDecimals));
    }

    /// Refresh the TWAP if a full period has passed since the last observation.
    function update() public returns (bool updated) {
        uint256 elapsed = block.timestamp - obsTimestamp;
        if (elapsed < period) return false;
        uint256 cum = currentCumulative();
        uint256 avg;
        unchecked { avg = (cum - obsCumulative) / elapsed; }
        uint256 p = _toPrice(avg);
        bool dev = twap != 0 && _deviation(p, twap) > maxDeviationBps;
        lastUpdateDeviated = dev;
        obsCumulative = cum; obsTimestamp = block.timestamp;
        // Accept the new TWAP either way so the feed recovers if the move was real, but flag it.
        twap = p; twapUpdatedAt = block.timestamp;
        emit TwapUpdated(p, dev);
        return true;
    }

    function _deviation(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 d = a > b ? a - b : b - a;
        return d * 10_000 / b;
    }

    function quoteReserve() public view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        return tokenIs0 ? r1 : r0;
    }

    function tryFetch() public returns (uint256 price, bool ok) {
        update();
        price = twap;
        ok = price > 0
            && block.timestamp - twapUpdatedAt <= maxAge
            && quoteReserve() >= minQuoteReserve
            && !lastUpdateDeviated;
    }

    /// Strict variant: reverts when unsafe. Prefer wrapping in RobustPriceFeed.
    function fetchPrice() external returns (uint256) {
        (uint256 p, bool ok) = tryFetch();
        require(ok, "TWAP unsafe");
        return p;
    }

    /// Strict feed has no last-good state: it reverts when unsafe, so it never reports pause flags.
    function fetchPriceWithFlags() external returns (uint256, bool, bool) {
        (uint256 p, bool ok) = tryFetch();
        require(ok, "TWAP unsafe");
        return (p, false, false);
    }
}
