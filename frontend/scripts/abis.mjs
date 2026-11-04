// Re-export ABIs from Foundry build output: run `forge build` in ../contracts first.
import fs from 'fs';
for (const c of ['Branch','USDPM','PMNT','PMNTStaking','MockERC20'])
  fs.writeFileSync(`src/abis/${c}.json`, JSON.stringify(JSON.parse(fs.readFileSync(`../contracts/out/${c}.sol/${c}.json`)).abi));
