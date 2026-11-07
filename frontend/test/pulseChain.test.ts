import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { numberToHex } from 'viem';
import {
  PULSE_MAINNET_CHAIN_ID, PULSE_TESTNET_CHAIN_ID, PULSE_TESTNET_CHAIN_ID_HEX, PULSE_TESTNET_EXPLORER,
  PULSE_TESTNET_NATIVE, PULSE_TESTNET_RPC, ensurePulseTestnet, metamaskDappUrl, networkLabel,
  parseChainId, pulseTestnetAddParams, trustWalletUrl, writeBlockReason, type WalletProvider,
} from '../src/wallet/pulseChain.ts';

function provider(handlers: Record<string, (params: unknown) => unknown>): { p: WalletProvider; calls: { method: string; params: unknown }[] } {
  const calls: { method: string; params: unknown }[] = [];
  const p: WalletProvider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (!handlers[method]) throw new Error('unexpected ' + method);
      return handlers[method](params);
    },
  };
  return { p, calls };
}

const methods = (calls: { method: string }[], name: string) => calls.filter((c) => c.method === name);

test('official chain id hex matches viem', () => {
  assert.equal(PULSE_TESTNET_CHAIN_ID, 943);
  assert.equal(PULSE_TESTNET_CHAIN_ID_HEX, '0x3af');
  assert.equal(numberToHex(943), '0x3af');
  assert.equal(PULSE_MAINNET_CHAIN_ID, 369);
});

test('parseChainId accepts hex and decimal', () => {
  assert.equal(parseChainId('0x3af'), 943);
  assert.equal(parseChainId('0x3AF'), 943);
  assert.equal(parseChainId(943), 943);
  assert.equal(parseChainId('943'), 943);
  assert.equal(parseChainId('0x171'), 369);
});

test('already on 943 does not switch or add', async () => {
  for (const current of ['0x3af', '0x3AF', 943, '943']) {
    const { p, calls } = provider({ eth_chainId: () => current });
    assert.equal(await ensurePulseTestnet(p), 'already-on-testnet');
    assert.equal(methods(calls, 'wallet_switchEthereumChain').length, 0);
    assert.equal(methods(calls, 'wallet_addEthereumChain').length, 0);
  }
});

test('existing other chain is switched and not added', async () => {
  let chain = '0x171';
  const { p, calls } = provider({
    eth_chainId: () => chain,
    wallet_switchEthereumChain: (params) => { chain = (params as [{ chainId: string }])[0].chainId; return null; },
    wallet_addEthereumChain: () => { throw new Error('must not add'); },
  });
  assert.equal(await ensurePulseTestnet(p), 'switched');
  assert.equal(methods(calls, 'wallet_switchEthereumChain').length, 1);
  assert.deepEqual(calls.find((c) => c.method === 'wallet_switchEthereumChain')?.params, [{ chainId: '0x3af' }]);
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 0);
});

test('unknown chain is added once with official parameters', async () => {
  let chain = '0x1';
  const { p, calls } = provider({
    eth_chainId: () => chain,
    wallet_switchEthereumChain: (params) => {
      const err = new Error('Unrecognized chain ID');
      (err as { code?: number }).code = 4902;
      if (chain === '0x1') throw err;
      chain = (params as [{ chainId: string }])[0].chainId;
      return null;
    },
    wallet_addEthereumChain: (params) => { chain = (params as [{ chainId: string }])[0].chainId; return null; },
  });
  assert.equal(await ensurePulseTestnet(p), 'added');
  const adds = methods(calls, 'wallet_addEthereumChain');
  assert.equal(adds.length, 1);
  assert.deepEqual(adds[0].params, [pulseTestnetAddParams()]);
  assert.deepEqual(pulseTestnetAddParams(), {
    chainId: '0x3af',
    chainName: 'PulseChain Testnet-V4',
    nativeCurrency: { name: 'Test Pulse', symbol: 'tPLS', decimals: 18 },
    rpcUrls: [PULSE_TESTNET_RPC],
    blockExplorerUrls: [PULSE_TESTNET_EXPLORER],
  });
  assert.equal(PULSE_TESTNET_NATIVE.symbol, 'tPLS');
  assert.equal(methods(calls, 'wallet_switchEthereumChain').length, 1);
});

test('add that does not switch is followed by one switch and no second add', async () => {
  let chain = '0x1';
  let added = false;
  const { p, calls } = provider({
    eth_chainId: () => chain,
    wallet_switchEthereumChain: (params) => {
      if (!added) {
        const err = new Error('Unrecognized chain ID');
        (err as { code?: number }).code = 4902;
        throw err;
      }
      chain = (params as [{ chainId: string }])[0].chainId;
      return null;
    },
    wallet_addEthereumChain: () => { added = true; return null; },
  });
  assert.equal(await ensurePulseTestnet(p), 'added');
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 1);
  assert.equal(methods(calls, 'wallet_switchEthereumChain').length, 2);
  assert.equal(chain, '0x3af');
});

test('user rejection does not add a network', async () => {
  const { p, calls } = provider({
    eth_chainId: () => '0x1',
    wallet_switchEthereumChain: () => {
      const err = new Error('User rejected the request.');
      (err as { code?: number }).code = 4001;
      throw err;
    },
    wallet_addEthereumChain: () => { throw new Error('must not add'); },
  });
  await assert.rejects(() => ensurePulseTestnet(p), /rejected/);
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 0);
});

test('generic rpc error does not add a network', async () => {
  const { p, calls } = provider({
    eth_chainId: () => '0x1',
    wallet_switchEthereumChain: () => {
      const err = new Error('Internal error');
      (err as { code?: number }).code = -32603;
      throw err;
    },
    wallet_addEthereumChain: () => { throw new Error('must not add'); },
  });
  await assert.rejects(() => ensurePulseTestnet(p));
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 0);
});

test('MetaMask mobile wraps 4902 and still adds once', async () => {
  let chain = '0x1';
  const { p, calls } = provider({
    eth_chainId: () => chain,
    wallet_switchEthereumChain: () => {
      const err = new Error('wrapped');
      (err as { code?: number; data?: unknown }).code = -32603;
      (err as { data?: unknown }).data = { originalError: { code: 4902 } };
      throw err;
    },
    wallet_addEthereumChain: () => { chain = '0x3af'; return null; },
  });
  assert.equal(await ensurePulseTestnet(p), 'added');
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 1);
});

test('add that reports the chain already exists switches instead of adding again', async () => {
  let chain = '0x1';
  let switches = 0;
  const { p, calls } = provider({
    eth_chainId: () => chain,
    wallet_switchEthereumChain: (params) => {
      switches += 1;
      if (switches === 1) {
        const err = new Error('Unrecognized chain ID');
        (err as { code?: number }).code = 4902;
        throw err;
      }
      chain = (params as [{ chainId: string }])[0].chainId;
      return null;
    },
    wallet_addEthereumChain: () => {
      const err = new Error('Chain ID already exists');
      throw err;
    },
  });
  assert.equal(await ensurePulseTestnet(p), 'switched');
  assert.equal(methods(calls, 'wallet_addEthereumChain').length, 1);
  assert.equal(switches, 2);
});

test('mainnet and other chains are blocked, testnet is not', () => {
  assert.equal(writeBlockReason(943, true), null);
  assert.equal(writeBlockReason(369, false), null);
  assert.match(writeBlockReason(369, true) ?? '', /mainnet/);
  assert.match(writeBlockReason(1, true) ?? '', /chain 1/);
  assert.match(writeBlockReason(undefined, true) ?? '', /not reported/);
  assert.equal(networkLabel(943), 'PulseChain Testnet v4');
  assert.equal(networkLabel(369), 'PulseChain mainnet');
});

test('mobile wallet links keep the page path', () => {
  const page = 'https://sxcstud123-art.github.io/pulse-mint/#borrow';
  assert.equal(metamaskDappUrl(page), 'https://metamask.app.link/dapp/sxcstud123-art.github.io/pulse-mint/#borrow');
  assert.equal(trustWalletUrl(page), 'https://link.trustwallet.com/open_url?coin_id=60&url=' + encodeURIComponent(page));
});

test('frontend addresses match the 6 Nov 2026 deployment and wagmi stays on testnet only', () => {
  const dep = JSON.parse(fs.readFileSync(new URL('../../deployments/pulsechain-testnet-943.json', import.meta.url), 'utf8'));
  const cfg = fs.readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
  assert.equal(dep.chainId, 943);
  assert.equal(dep.USDPM, '0x37Ee5AFfF7dA9A7b0ff371b58c898B61BdC1D224');
  for (const addr of [dep.USDPM, dep.PMNT, dep.PMNTStaking, dep.CommunityIssuance]) assert.ok(cfg.includes(addr), addr);
  for (const [symbol, row] of Object.entries(dep.collaterals) as [string, { token: string; branch: string }][]) {
    assert.ok(cfg.includes(symbol));
    assert.ok(cfg.includes(row.token), row.token);
    assert.ok(cfg.includes(row.branch), row.branch);
  }
  assert.match(cfg, /chains:\s*\[pulsechainTestnet\]/);
  assert.match(cfg, /id:\s*369/);
  assert.match(cfg, /shimDisconnect:\s*false/);
  assert.match(cfg, /https:\/\/rpc\.pulsechain\.com/);
  assert.equal(dep.deployedAt, '2026-11-06');
});
