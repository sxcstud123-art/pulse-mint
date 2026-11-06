import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

export const pulsechainTestnet = defineChain({
  id: 943, name: 'PulseChain Testnet v4', nativeCurrency: { name: 'Test PLS', symbol: 'tPLS', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.v4.testnet.pulsechain.com'] } },
  blockExplorers: { default: { name: 'Otter', url: 'https://scan.v4.testnet.pulsechain.com' } }, testnet: true,
});
export const pulsechain = defineChain({
  id: 369, name: 'PulseChain', nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.pulsechain.com'] } },
});

export const wagmiConfig = createConfig({
  chains: [pulsechainTestnet], connectors: [injected()],
  transports: { [pulsechainTestnet.id]: http() },
});

const Z = '0x0000000000000000000000000000000000000000' as const;
// PulseChain testnet v4 (chain 943) deployment, 2026-11-06 (price-feed hardening build). Collateral tokens are MOCKS with a public mint().
export const ADDR = {
  usdpm: '0x37Ee5AFfF7dA9A7b0ff371b58c898B61BdC1D224' as `0x${string}`,
  pmnt: '0xD3AcD4642C7807e1fF366A2263f787eBf5D38e83' as `0x${string}`,
  staking: '0x50b7f01B33B73E19b56F3cb6a9adaC96A576B182' as `0x${string}`,
  issuance: '0xAb8776C5066bcD694Dc8Fb56b6387a93f8526B4b' as `0x${string}`,
};
export type Coll = { symbol: string; decimals: number; token: `0x${string}`; branch: `0x${string}`; mcr: number };
export const COLLATERALS: Coll[] = [
  { symbol: 'WPLS', decimals: 18, token: '0x6d8B1d8033c6D0374E284Cc1765e0EFc887f97d9', branch: '0xFE365E24d9655C74e9DbFf567aa982a10DD66Bbd', mcr: 150 },
  { symbol: 'HEX', decimals: 8, token: '0x6b8e3a06683CdfB666fa0eaabf514066f32d80fB', branch: '0x3C46CABBCce61931025ef7C83A89B9f578030D40', mcr: 175 },
  { symbol: 'PLSX', decimals: 18, token: '0x4842572aCF24103DcCa20606483d71Fe2C695fB2', branch: '0x51Bb28653ec909eD14CF0586ce3863022280506E', mcr: 150 },
  { symbol: 'INC', decimals: 18, token: '0x1eD7cC52A2c9cD8B2798B13797bb155eC835B474', branch: '0x9CB57Ff8237eadA58d7b15b159275030820d7E1c', mcr: 200 },
  { symbol: 'pDAI', decimals: 18, token: '0x1b9cafdA35C18A3909B60cd21B52a83DB4AF1AFd', branch: '0xE2281eDc151ee3c0c489B89243Fb1de53F395f4e', mcr: 150 },
  { symbol: 'eHEX', decimals: 8, token: '0x69684B0487BB3f53505Edb06B6815ED5c4fd7452', branch: '0x739bf5151b54cF6418F27f944Ce278584b4B460F', mcr: 175 },
  { symbol: 'pWETH', decimals: 18, token: '0xeABc4F7FC8452272BAACc8Ecb12Bf016bd631a04', branch: '0xa2C7aEEdC0CAeaaDadcc3730899f93Efd18511C1', mcr: 120 },
];
export const DEPLOY_BLOCK = 25830539n; // first block of the 2026-11-06 deployment
