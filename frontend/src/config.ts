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
// PulseChain testnet v4 (chain 943) deployment, 2026-11-02 (hardened build). Collateral tokens are MOCKS with a public mint().
export const ADDR = {
  usdpm: '0x0Dae02717020601f3F6D967C6A7284a6e82C661f' as `0x${string}`,
  pmnt: '0x7C624E4899976e3BB4E86c435C382923663CdB27' as `0x${string}`,
  staking: '0xA8b5105d232637d078039257A1d94eFA0906cB4f' as `0x${string}`,
  issuance: '0x49eEBb525c707C59381b0B1Ec671Aa3199253593' as `0x${string}`,
};
export type Coll = { symbol: string; decimals: number; token: `0x${string}`; branch: `0x${string}`; mcr: number };
export const COLLATERALS: Coll[] = [
  { symbol: 'WPLS', decimals: 18, token: '0xFD747954C015EC62b618b912C2dBe147Fc98f688', branch: '0xed912144271b9859af6547bc3d5A85F8465e14b3', mcr: 150 },
  { symbol: 'HEX', decimals: 8, token: '0xA16832ED05ad74C1605b8f30098096e94C240231', branch: '0x295A0855967dAAe16f3168330332412b4F0E3203', mcr: 175 },
  { symbol: 'PLSX', decimals: 18, token: '0xcAA7603D528055F367c0454A9152D0A74025a910', branch: '0x592747D1b5E61615F47916c7Dfe97EcE04C314D7', mcr: 150 },
  { symbol: 'INC', decimals: 18, token: '0x90091EE6ef7aa138f2c8749da8932FF7134eb122', branch: '0xB1e420340429247a583915e58B388D1d0De70fda', mcr: 200 },
  { symbol: 'pDAI', decimals: 18, token: '0xCC5FBc1B2b7A1eA27eF2119C5934ccdC6BeF4E27', branch: '0xa07dBAdF01a7Ebb86A9207aC2A737804802cfB40', mcr: 150 },
  { symbol: 'eHEX', decimals: 8, token: '0x25Cd939281662E4f6B400395db31b8f9B1294c0a', branch: '0xB942a088F14F4eBe46Ebf0966E83422975B690Ae', mcr: 175 },
  { symbol: 'pWETH', decimals: 18, token: '0x6b89013491E85C0d1a3feDCa857F4A197859A06B', branch: '0x03B3a66f4A694d8070095f2d7587D63748DB77a4', mcr: 120 },
];
export const DEPLOY_BLOCK = 25799061n; // first block of the 2026-11-02 deployment
