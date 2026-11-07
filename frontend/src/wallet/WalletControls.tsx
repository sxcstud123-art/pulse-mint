import { useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { pulsechainTestnet } from '../config';
import { short } from '../data';
import {
  PULSE_TESTNET_CHAIN_ID, PULSE_TESTNET_CHAIN_ID_HEX, PULSE_TESTNET_CHAIN_NAME, PULSE_TESTNET_EXPLORER,
  PULSE_TESTNET_FAUCET, PULSE_TESTNET_NATIVE, PULSE_TESTNET_RPC, ensurePulseTestnet, hasRequest,
  metamaskDappUrl, networkLabel, parseChainId, trustWalletUrl, walletErrorMessage, withTimeout,
  writeBlockReason, type WalletProvider,
} from './pulseChain';

const WALLET_MS = 25_000;

function browserProvider(): WalletProvider | undefined {
  const eth = (globalThis as { ethereum?: unknown }).ethereum;
  return hasRequest(eth) ? eth : undefined;
}

function waitForProvider(ms: number): Promise<WalletProvider | undefined> {
  const existing = browserProvider();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const found = browserProvider();
      if (found || Date.now() - started >= ms) {
        window.clearInterval(timer);
        resolve(found);
      }
    }, 50);
  });
}

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const reason = writeBlockReason(chainId, isConnected);
  if (!reason) return null;
  return <div className="wallet-banner"><div className="alert warn" data-testid="network-gate">{reason}</div></div>;
}

export function WalletControls() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const setIfAlive = (fn: () => void) => { if (alive.current) fn(); };

  const connectorFor = () => connectors.find((c) => c.id === 'injected') ?? connectors.find((c) => c.type === 'injected') ?? connectors[0];

  const onConnect = () => {
    setError(null);
    setHelp(false);
    const immediate = browserProvider();
    // Fire the account request in this turn so a phone wallet can show its sheet.
    const accountsPromise = immediate
      ? withTimeout(immediate.request({ method: 'eth_requestAccounts' }), WALLET_MS, 'Wallet connection')
      : null;
    setBusy(true);
    setStatus(immediate ? 'Confirm the connection in your wallet…' : 'Looking for a wallet…');
    void (async () => {
      try {
        let provider = immediate;
        if (!provider) provider = await waitForProvider(2_000);
        if (!provider) {
          // EIP-6963 wallets may not set window.ethereum. Use the first connector that has a provider.
          for (const connector of connectors) {
            if (connector.id === 'injected') continue;
            const announced = await connector.getProvider().catch(() => undefined);
            if (!hasRequest(announced)) continue;
            setIfAlive(() => setStatus('Confirm the connection in your wallet…'));
            await withTimeout(announced.request({ method: 'eth_requestAccounts' }), WALLET_MS, 'Wallet connection');
            setIfAlive(() => setStatus('Checking PulseChain Testnet v4…'));
            await withTimeout(ensurePulseTestnet(announced), WALLET_MS, 'Network switch');
            await withTimeout(connectAsync({ connector }), WALLET_MS, 'Wallet connection');
            setIfAlive(() => { setStatus(null); setBusy(false); });
            return;
          }
          setIfAlive(() => { setStatus(null); setBusy(false); setHelp(true); });
          return;
        }
        if (accountsPromise) await accountsPromise;
        else await withTimeout(provider.request({ method: 'eth_requestAccounts' }), WALLET_MS, 'Wallet connection');
        setIfAlive(() => setStatus('Checking PulseChain Testnet v4…'));
        await withTimeout(ensurePulseTestnet(provider), WALLET_MS, 'Network switch');
        const connector = connectorFor();
        if (!connector) {
          setIfAlive(() => { setStatus(null); setBusy(false); setHelp(true); });
          return;
        }
        await withTimeout(connectAsync({ connector }), WALLET_MS, 'Wallet connection');
        setIfAlive(() => { setStatus(null); setBusy(false); });
      } catch (e) {
        const msg = walletErrorMessage(e);
        setIfAlive(() => {
          setStatus(null);
          setBusy(false);
          if (/no wallet found/i.test(msg)) setHelp(true);
          else setError(msg);
        });
      }
    })();
  };

  const onSwitch = () => {
    setError(null);
    setBusy(true);
    setStatus('Switching to PulseChain Testnet v4…');
    void (async () => {
      try {
        const provider = browserProvider() ?? await waitForProvider(2_000);
        if (!provider) {
          setIfAlive(() => { setStatus(null); setBusy(false); setHelp(true); });
          return;
        }
        await withTimeout(ensurePulseTestnet(provider), WALLET_MS, 'Network switch');
        try {
          await withTimeout(switchChainAsync({ chainId: pulsechainTestnet.id }), 8_000, 'Wallet network update');
        } catch (e) {
          const now = parseChainId(await provider.request({ method: 'eth_chainId' }));
          if (now !== PULSE_TESTNET_CHAIN_ID) throw e;
        }
        setIfAlive(() => { setStatus(null); setBusy(false); });
      } catch (e) {
        setIfAlive(() => { setStatus(null); setBusy(false); setError(walletErrorMessage(e)); });
      }
    })();
  };

  return (<>
    {isConnected && chainId !== pulsechainTestnet.id && (
      <button type="button" className="btn sm danger" data-testid="switch-network" title="Switch to PulseChain Testnet v4 (chain 943)" onClick={onSwitch} disabled={busy}>
        {busy ? 'Switching…' : 'Switch network'}
      </button>
    )}
    {isConnected
      ? <button type="button" className="pill" data-testid="wallet-pill" title="Disconnect" onClick={() => disconnect()}>{short(address)}<small>{networkLabel(chainId)}</small></button>
      : <button type="button" className="pill" data-testid="connect" onClick={onConnect} disabled={busy}>{busy ? 'Connecting…' : 'Connect wallet'}<small>PulseChain Testnet v4</small></button>}
    {status && <div className="alert info wallet-status" data-testid="wallet-status" role="status">{status}</div>}
    {error && <div className="alert danger wallet-status" data-testid="wallet-error" role="alert">{error}</div>}
    {help && <WalletHelp onClose={() => setHelp(false)} />}
  </>);
}

function WalletHelp({ onClose }: { onClose: () => void }) {
  const pageUrl = location.href;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const done = (ok: boolean) => { setCopied(ok); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(pageUrl).then(() => done(true), () => done(false));
    else done(false);
  };
  return (
    <div className="wallet-modal" data-testid="wallet-help" role="dialog" aria-modal="true" aria-labelledby="wallet-help-title">
      <div className="card">
        <div className="head"><h3 id="wallet-help-title">No wallet in this browser</h3><button type="button" className="btn sm secondary" data-testid="wallet-help-close" onClick={onClose}>Close</button></div>
        <p>Connect wallet needs a wallet built into the browser. Safari and Chrome on a phone do not have one, so the button cannot open a prompt there. Open Pulse Mint in your wallet's browser, then tap Connect wallet again.</p>
        <a className="btn" data-testid="open-metamask" href={metamaskDappUrl(pageUrl)}>Open in MetaMask</a>
        <a className="btn secondary" data-testid="open-trust" href={trustWalletUrl(pageUrl)}>Open in Trust Wallet</a>
        <button type="button" className="btn secondary" data-testid="copy-page-link" onClick={copy}>{copied ? 'Link copied' : 'Copy page link'}</button>
        <p className="note">Rabby, Internet Money and other wallets work the same way: open this site in that app's browser. If a prompt was dismissed, the error stays on screen instead of the button doing nothing.</p>
        <div className="netlist" data-testid="network-config">
          <div><span>Chain ID</span><b>{PULSE_TESTNET_CHAIN_ID} ({PULSE_TESTNET_CHAIN_ID_HEX})</b></div>
          <div><span>Network name</span><b>{PULSE_TESTNET_CHAIN_NAME}</b></div>
          <div><span>RPC URL</span><b>{PULSE_TESTNET_RPC}</b></div>
          <div><span>Native token</span><b>{PULSE_TESTNET_NATIVE.name} ({PULSE_TESTNET_NATIVE.symbol}), {PULSE_TESTNET_NATIVE.decimals} decimals</b></div>
          <div><span>Explorer</span><b>{PULSE_TESTNET_EXPLORER}</b></div>
        </div>
        <p className="note">If chain 943 is already in the wallet's network list, select it. Pulse Mint switches to that network and does not add a second copy. PulseChain mainnet (chain 369) stays blocked for mint and vault transactions.</p>
        <p className="note">Test tPLS: <a href={PULSE_TESTNET_FAUCET} target="_blank" rel="noreferrer">faucet.v4.testnet.pulsechain.com</a></p>
      </div>
    </div>
  );
}
