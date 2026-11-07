// Mock-wallet checks for Pulse Mint connect / switch / mainnet gating.
// No keys, no broadcasts, no contract deploys. Chain 943 is already present in the "ok" wallet.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRONT = path.join(ROOT, 'frontend');
const OUT = '/opt/cursor/artifacts';
const ORIGIN = 'http://127.0.0.1:4173';
const PAGE = ORIGIN + '/pulse-mint/';
const ACCOUNT = '0x0000000000000000000000000000000000000001';
mkdirSync(OUT, { recursive: true });

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: FRONT, stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
preview.stdout.on('data', (d) => { previewLog += d; });
preview.stderr.on('data', (d) => { previewLog += d; });
const stop = () => { if (!preview.killed) preview.kill('SIGTERM'); };
process.on('exit', stop);

for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(PAGE);
    if (r.ok) break;
  } catch { /* preview still booting */ }
  if (preview.exitCode != null) throw new Error('vite preview exited\n' + previewLog);
  await delay(200);
  if (i === 49) throw new Error('preview did not start\n' + previewLog);
}

const browser = await chromium.launch();
const results = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function withPage(opts, fn) {
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 390, height: 844 },
    isMobile: opts.mobile !== false,
    hasTouch: opts.mobile !== false,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript((cfg) => {
    const calls = [];
    const adds = [];
    let chainId = cfg.chainId;
    let mode = cfg.mode;
    const listeners = {};
    const emit = (ev, arg) => (listeners[ev] || []).forEach((fn) => fn(arg));
    window.__calls = calls;
    window.__adds = adds;
    window.__setChain = (id, emitEvent) => { chainId = id; if (emitEvent) emit('chainChanged', id); };
    window.__chain = () => chainId;
    if (cfg.mode === 'no-wallet') return;
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        calls.push({ method, params });
        if (method === 'eth_chainId' || method === 'net_version') return method === 'net_version' ? String(parseInt(chainId, 16)) : chainId;
        if (method === 'eth_accounts') return calls.some((c) => c.method === 'eth_requestAccounts') ? [cfg.account] : [];
        if (method === 'eth_requestAccounts') return [cfg.account];
        if (method === 'wallet_switchEthereumChain') {
          if (mode === 'reject-switch') { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
          if (mode === 'missing') { const e = new Error('Unrecognized chain ID'); e.code = 4902; throw e; }
          chainId = params[0].chainId;
          emit('chainChanged', chainId);
          return null;
        }
        if (method === 'wallet_addEthereumChain') {
          adds.push(params[0]);
          mode = 'ok';
          chainId = params[0].chainId;
          emit('chainChanged', chainId);
          return null;
        }
        if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);
        return null;
      },
      on(ev, fn) { (listeners[ev] ||= []).push(fn); },
      removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    };
  }, { ...opts, account: ACCOUNT });
  try {
    await fn(page, pageErrors);
    results.push({ name: opts.name, ok: true });
    console.log('ok', opts.name);
  } catch (e) {
    results.push({ name: opts.name, ok: false, err: e.message });
    console.log('FAIL', opts.name, e.message);
    await page.screenshot({ path: path.join(OUT, 'fail-' + opts.name + '.png'), fullPage: true }).catch(() => {});
  }
  await context.close();
}

const callsOf = (page) => page.evaluate(() => ({
  methods: window.__calls.map((c) => c.method),
  adds: window.__adds,
  chain: window.__chain ? window.__chain() : null,
}));

await withPage({ name: 'mobile-no-wallet', mode: 'no-wallet', chainId: '0x1' }, async (page, pageErrors) => {
  await page.goto(PAGE);
  await page.getByTestId('connect').waitFor();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert(theme === 'dark', 'default theme ' + theme);
  const hit = await page.getByTestId('connect').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
  assert(hit, 'Connect wallet is not the element under the tap');
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-help').waitFor();
  const meta = await page.getByTestId('open-metamask').getAttribute('href');
  assert(meta === 'https://metamask.app.link/dapp/127.0.0.1:4173/pulse-mint/', meta);
  const trust = await page.getByTestId('open-trust').getAttribute('href');
  assert(trust?.startsWith('https://link.trustwallet.com/open_url?coin_id=60&url='), trust);
  const cfg = await page.getByTestId('network-config').innerText();
  for (const bit of ['943 (0x3af)', 'PulseChain Testnet-V4', 'https://rpc.v4.testnet.pulsechain.com', 'Test Pulse (tPLS)', 'https://scan.v4.testnet.pulsechain.com']) {
    assert(cfg.includes(bit), 'missing ' + bit + ' in ' + cfg);
  }
  assert(await page.getByTestId('wallet-pill').count() === 0, 'connected without a wallet');
  await page.screenshot({ path: path.join(OUT, 'wallet-no-provider-mobile.png') });
  await page.getByTestId('wallet-help-close').click();
  await page.getByTestId('wallet-help').waitFor({ state: 'hidden' });
  await page.getByTestId('menu').click();
  await page.getByTestId('nav-borrow').waitFor();
  assert(pageErrors.length === 0, pageErrors.join('\n'));
});

await withPage({ name: 'mobile-already-943', mode: 'ok', chainId: '0x3af' }, async (page) => {
  await page.goto(PAGE + '#borrow');
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-pill').waitFor();
  const info = await callsOf(page);
  assert(!info.methods.includes('wallet_addEthereumChain'), 'added a network that already existed: ' + JSON.stringify(info));
  assert(!info.methods.includes('wallet_switchEthereumChain'), 'switched a wallet already on 943: ' + JSON.stringify(info.methods));
  assert(!info.methods.includes('wallet_requestPermissions'), 'wallet_requestPermissions hangs on MetaMask mobile: ' + JSON.stringify(info.methods));
  assert(info.methods.includes('eth_requestAccounts'), 'no account request');
  assert(await page.getByTestId('network-gate').count() === 0, 'testnet was gated');
  await page.getByTestId('confirm-borrow').waitFor();
  await page.getByTestId('mint-test').click();
  await page.waitForFunction(() => window.__calls.some((c) => c.method === 'eth_sendTransaction') || /failed/i.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20_000 });
  const after = await callsOf(page);
  const status = (await page.locator('#status').count()) ? await page.locator('#status').innerText() : '';
  const sent = after.methods.includes('eth_sendTransaction');
  if (!sent) {
    assert(/failed/i.test(status), 'mint click was a silent no-op: ' + status);
    assert(!/mainnet|disabled/i.test(status), 'testnet mint was blocked: ' + status);
  }
  await page.screenshot({ path: path.join(OUT, 'wallet-connected-943-mobile.png'), fullPage: true });
});

await withPage({ name: 'switch-existing-369', mode: 'ok', chainId: '0x171', mobile: false, viewport: { width: 1280, height: 800 } }, async (page) => {
  await page.goto(PAGE);
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-pill').waitFor();
  const info = await callsOf(page);
  assert(info.methods.filter((m) => m === 'wallet_switchEthereumChain').length >= 1, JSON.stringify(info.methods));
  assert(!info.methods.includes('wallet_addEthereumChain'), 'duplicate add while chain 943 already exists');
  assert(info.chain === '0x3af', 'ended on ' + info.chain);
  const label = await page.getByTestId('wallet-pill').evaluate((el) => el.textContent || '');
  assert(label.includes('PulseChain Testnet v4'), label);
  assert(await page.getByTestId('network-gate').count() === 0, 'gate still showing');
  await page.screenshot({ path: path.join(OUT, 'wallet-connected-desktop.png') });
});

await withPage({ name: 'add-only-when-missing', mode: 'missing', chainId: '0x1' }, async (page) => {
  await page.goto(PAGE);
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-pill').waitFor();
  const info = await callsOf(page);
  assert(info.adds.length === 1, 'adds ' + info.adds.length);
  assert(info.adds[0].chainId === '0x3af', JSON.stringify(info.adds[0]));
  assert(info.adds[0].chainName === 'PulseChain Testnet-V4', info.adds[0].chainName);
  assert(JSON.stringify(info.adds[0].rpcUrls) === JSON.stringify(['https://rpc.v4.testnet.pulsechain.com']), JSON.stringify(info.adds[0]));
  assert(info.adds[0].nativeCurrency.symbol === 'tPLS' && info.adds[0].nativeCurrency.name === 'Test Pulse' && info.adds[0].nativeCurrency.decimals === 18, JSON.stringify(info.adds[0].nativeCurrency));
  assert(JSON.stringify(info.adds[0].blockExplorerUrls) === JSON.stringify(['https://scan.v4.testnet.pulsechain.com']), JSON.stringify(info.adds[0].blockExplorerUrls));
  assert(info.chain === '0x3af', info.chain);
});

await withPage({ name: 'reject-switch-shows-error', mode: 'reject-switch', chainId: '0x1' }, async (page) => {
  await page.goto(PAGE);
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-error').waitFor();
  const text = await page.getByTestId('wallet-error').innerText();
  assert(/closed the request|rejected/i.test(text), text);
  assert(await page.getByTestId('connect').count() === 1, 'connect button disappeared');
  const info = await callsOf(page);
  assert(!info.methods.includes('wallet_addEthereumChain'), 'add after rejection');
  assert(info.methods.includes('wallet_switchEthereumChain'), 'switch was not attempted');
  await page.screenshot({ path: path.join(OUT, 'wallet-rejected-switch.png') });
});

await withPage({ name: 'mainnet-gate-and-switch', mode: 'ok', chainId: '0x3af' }, async (page) => {
  await page.goto(PAGE + '#borrow');
  await page.getByTestId('connect').click();
  await page.getByTestId('wallet-pill').waitFor();
  const before = (await callsOf(page)).methods.length;
  await page.evaluate(() => window.__setChain('0x171', false));
  await page.getByTestId('mint-test').click();
  await page.locator('#status').waitFor();
  await page.waitForFunction(() => /failed/i.test(document.querySelector('#status')?.textContent || ''));
  const status = await page.locator('#status').innerText();
  assert(/mainnet/i.test(status), status);
  const mid = await callsOf(page);
  assert(!mid.methods.slice(before).includes('eth_sendTransaction'), 'mainnet mint sent a transaction: ' + JSON.stringify(mid.methods));
  await page.screenshot({ path: path.join(OUT, 'wallet-mainnet-gate.png'), fullPage: true });
  await page.evaluate(() => window.__setChain('0x171', true));
  await page.getByTestId('network-gate').waitFor();
  await page.getByTestId('switch-network').waitFor();
  await page.screenshot({ path: path.join(OUT, 'wallet-switch-network.png') });
  await page.getByTestId('switch-network').click();
  await page.getByTestId('network-gate').waitFor({ state: 'hidden', timeout: 15_000 });
  const end = await callsOf(page);
  assert(end.chain === '0x3af', end.chain);
  const addsAfter = end.adds.length;
  assert(addsAfter === 0, 'switch added a duplicate network');
  const label = await page.getByTestId('wallet-pill').evaluate((el) => el.textContent || '');
  assert(label.includes('PulseChain Testnet v4'), label);
});

await browser.close();
stop();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(results, null, 2));
if (failed.length) process.exit(1);
