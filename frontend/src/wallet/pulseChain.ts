// Official PulseChain Testnet v4 parameters.
// Network name, RPC, chain id, symbol and explorer: PulseChain GitLab testnet README
// (https://gitlab.com/pulsechaincom/pulsechain-testnet). Native currency name: ethereum-lists eip155-943
// ("Test Pulse", symbol tPLS, 18 decimals). Chain 943 is often already in the wallet from the
// 6 Nov 2026 deployment, so callers must switch first and add only when the wallet says the chain is unknown.

export const PULSE_TESTNET_CHAIN_ID = 943;
export const PULSE_TESTNET_CHAIN_ID_HEX = '0x3af';
export const PULSE_MAINNET_CHAIN_ID = 369;
export const PULSE_TESTNET_RPC = 'https://rpc.v4.testnet.pulsechain.com';
export const PULSE_TESTNET_EXPLORER = 'https://scan.v4.testnet.pulsechain.com';
export const PULSE_TESTNET_CHAIN_NAME = 'PulseChain Testnet-V4';
export const PULSE_TESTNET_NATIVE = { name: 'Test Pulse', symbol: 'tPLS', decimals: 18 } as const;
export const PULSE_TESTNET_FAUCET = 'https://faucet.v4.testnet.pulsechain.com/';

export type WalletProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

export type EnsureResult = 'already-on-testnet' | 'switched' | 'added';

export function pulseTestnetAddParams() {
  return {
    chainId: PULSE_TESTNET_CHAIN_ID_HEX,
    chainName: PULSE_TESTNET_CHAIN_NAME,
    nativeCurrency: {
      name: PULSE_TESTNET_NATIVE.name,
      symbol: PULSE_TESTNET_NATIVE.symbol,
      decimals: PULSE_TESTNET_NATIVE.decimals,
    },
    rpcUrls: [PULSE_TESTNET_RPC],
    blockExplorerUrls: [PULSE_TESTNET_EXPLORER],
  };
}

export function parseChainId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return Number.parseInt(s, 16);
  if (/^\d+$/.test(s)) return Number(s);
  return undefined;
}

export function hasRequest(value: unknown): value is WalletProvider {
  return !!value && typeof value === 'object' && typeof (value as WalletProvider).request === 'function';
}

/** 4902 means the wallet has no chain with this id. Other errors must not add a network. */
export function isUnrecognizedChainError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  if (Number(err.code) === 4001) return false;
  return Number(err.code) === 4902 || Number(err.data?.originalError?.code) === 4902;
}

export function isAlreadyKnownChain(e: unknown): boolean {
  const bag = e && typeof e === 'object' ? e as { message?: unknown; data?: { message?: unknown } } : {};
  const msg = `${bag.message ?? ''} ${bag.data?.message ?? ''}`.toLowerCase();
  return /already exists|already added|chain id.*exist|duplicate chain|same rpc|already been added/.test(msg);
}

export function walletErrorMessage(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? Number((e as { code: unknown }).code) : undefined;
  const short = e && typeof e === 'object' && 'shortMessage' in e ? String((e as { shortMessage: unknown }).shortMessage ?? '') : '';
  const msg = short || (e instanceof Error ? e.message : 'Wallet request failed');
  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(msg)) {
    return 'The wallet closed the request. Tap Connect wallet to try again.';
  }
  if (/provider not found|no ethereum provider|no wallet found/i.test(msg)) return 'No wallet found in this browser.';
  return msg.slice(0, 280);
}

export function writeBlockReason(chainId: number | undefined, connected: boolean): string | null {
  if (!connected) return null;
  if (chainId === PULSE_TESTNET_CHAIN_ID) return null;
  if (chainId === PULSE_MAINNET_CHAIN_ID) {
    return 'PulseChain mainnet is disabled. Switch to PulseChain Testnet v4 (chain 943) before minting, opening a vault, or sending any other transaction.';
  }
  if (chainId == null) {
    return 'This wallet has not reported a network. Switch to PulseChain Testnet v4 (chain 943). Transactions stay off until then.';
  }
  return `This wallet is on chain ${chainId}. Switch to PulseChain Testnet v4 (chain 943). Transactions stay off on every other network, including mainnet.`;
}

export function networkLabel(chainId: number | undefined): string {
  if (chainId === PULSE_TESTNET_CHAIN_ID) return 'PulseChain Testnet v4';
  if (chainId === PULSE_MAINNET_CHAIN_ID) return 'PulseChain mainnet';
  if (chainId == null) return 'Unknown network';
  return `Chain ${chainId}`;
}

/** Open the current page in a wallet's in-app browser. `pageUrl` is the full http(s) URL. */
export function metamaskDappUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}${u.hash}`;
}

export function trustWalletUrl(pageUrl: string): string {
  return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(pageUrl)}`;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out. The wallet did not answer. On a phone, open Pulse Mint in the wallet's browser and tap Connect wallet again.`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Network switch failed';
  const err = new Error(msg);
  if (e && typeof e === 'object' && 'code' in e) (err as { code?: number }).code = Number((e as { code: unknown }).code);
  return err;
}

async function trySwitch(provider: WalletProvider): Promise<'ok' | 'unrecognized' | Error> {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_TESTNET_CHAIN_ID_HEX }] });
    return 'ok';
  } catch (err) {
    if (isUnrecognizedChainError(err)) return 'unrecognized';
    return asError(err);
  }
}

/**
 * Leave the wallet on chain 943. If it is already there, do not switch and do not add.
 * Add the network only when switch fails with 4902 (chain unknown). One add at most.
 */
export async function ensurePulseTestnet(provider: WalletProvider): Promise<EnsureResult> {
  const current = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (current === PULSE_TESTNET_CHAIN_ID) return 'already-on-testnet';

  const switched = await trySwitch(provider);
  if (switched === 'ok') return 'switched';
  if (switched !== 'unrecognized') throw switched;

  try {
    await provider.request({ method: 'wallet_addEthereumChain', params: [pulseTestnetAddParams()] });
  } catch (addErr) {
    if (!isAlreadyKnownChain(addErr)) throw asError(addErr);
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_TESTNET_CHAIN_ID_HEX }] });
    return 'switched';
  }

  const after = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (after !== PULSE_TESTNET_CHAIN_ID) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_TESTNET_CHAIN_ID_HEX }] });
  }
  return 'added';
}
