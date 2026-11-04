// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script, console2} from "forge-std/Script.sol";
import {USDPM} from "../src/USDPM.sol";
import {PMNT} from "../src/PMNT.sol";
import {PMNTStaking} from "../src/PMNTStaking.sol";
import {CommunityIssuance} from "../src/CommunityIssuance.sol";
import {Branch} from "../src/Branch.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracles/MockPriceFeed.sol";

/// @notice TESTNET deploy (PulseChain testnet v4, chain 943). Uses mock tokens + mock price feeds.
/// Run (NOT run by the agent):
///   export DEPLOYER_PRIVATE_KEY=0x...   # throwaway testnet key only
///   forge script script/Deploy.s.sol --rpc-url pulsechain_testnet --broadcast
contract Deploy is Script {
    struct Coll { string name; string symbol; uint8 dec; uint256 price; uint256 mcr; uint256 ccr; uint256 pmntPerSec; uint256 debtCap; }

    function collaterals() public pure returns (Coll[7] memory c) {
        // price = USD per whole token (18 dec). Placeholder testnet prices.
        c[0] = Coll("Wrapped PLS", "WPLS", 18, 0.00003e18, 1.5e18, 2.0e18, 0.10e18, 20_000_000e18);
        c[1] = Coll("HEX",         "HEX",   8, 0.004e18,   1.75e18, 2.5e18, 0.08e18, 10_000_000e18);
        c[2] = Coll("PulseX",      "PLSX", 18, 0.00002e18, 1.5e18, 2.0e18, 0.06e18, 10_000_000e18);
        c[3] = Coll("Incentive",   "INC",  18, 1e18,       2.0e18, 3.0e18, 0.03e18, 500_000e18);
        c[4] = Coll("pDAI",        "pDAI", 18, 0.002e18,   1.5e18, 2.0e18, 0.03e18, 5_000_000e18); // pDAI is NOT $1 on PulseChain
        c[5] = Coll("eHEX",        "eHEX",  8, 0.003e18,   1.75e18, 2.5e18, 0.05e18, 1_000_000e18);
        c[6] = Coll("Wrapped ETH from Ethereum", "pWETH", 18, 2500e18, 1.2e18, 1.5e18, 0.05e18, 20_000_000e18);
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 943 || block.chainid == 31337, "testnet/local only");
        vm.startBroadcast(pk);

        USDPM usdpm = new USDPM();
        // PMNT split: 32% stability pool, 3% LP rewards (sent to deployer to fund LPRewards later), 65% treasury/team (placeholder)
        uint256 total = 100_000_000e18;
        // Issuance needs PMNT address; deploy PMNT after issuance by pre-computing is complex, so:
        // mint SP share to deployer, then transfer to issuance.
        address[] memory r = new address[](1); r[0] = deployer;
        uint256[] memory a = new uint256[](1); a[0] = total;
        PMNT pmnt = new PMNT(r, a);
        PMNTStaking staking = new PMNTStaking(address(pmnt));
        CommunityIssuance iss = new CommunityIssuance(address(pmnt));
        pmnt.transfer(address(iss), 32_000_000e18);
        staking.addRewardToken(address(usdpm));

        Coll[7] memory cs = collaterals();
        for (uint256 i; i < 7; i++) {
            MockERC20 tok = new MockERC20(cs[i].name, cs[i].symbol, cs[i].dec);
            MockPriceFeed feed = new MockPriceFeed(cs[i].price);
            Branch b = new Branch(Branch.Config({
                coll: address(tok), decimals: cs[i].dec, priceFeed: address(feed), usdpm: address(usdpm),
                pmnt: address(pmnt), staking: address(staking), issuance: address(iss),
                mcr: cs[i].mcr, ccr: cs[i].ccr, borrowFeeBps: 50, redemptionFeeBps: 50, minDebt: 2000e18, debtCap: cs[i].debtCap, gasComp: 200e18
            }));
            usdpm.addBranch(address(b));
            staking.addRewardToken(address(tok));
            staking.addNotifier(address(b));
            iss.setRate(address(b), cs[i].pmntPerSec);
            console2.log(cs[i].symbol);
            console2.log("  token ", address(tok));
            console2.log("  feed  ", address(feed));
            console2.log("  branch", address(b));
        }
        console2.log("USDPM", address(usdpm));
        console2.log("PMNT", address(pmnt));
        console2.log("PMNTStaking", address(staking));
        console2.log("CommunityIssuance", address(iss));
        vm.stopBroadcast();
    }
}
