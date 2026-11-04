// Headless E2E of the real Pulse Mint UI on PulseChain testnet v4 (943).
// An injected EIP-1193 provider forwards to Node, which signs with the throwaway deployer key (never sent to the page).
import { chromium } from 'playwright';
import fs from 'fs';
import { createWalletClient, createPublicClient, http, parseUnits, defineChain, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const ROOT = '/workspace/lending-protocol';
const env = Object.fromEntries([...fs.readFileSync(ROOT + '/contracts/.env', 'utf8').split('\n'), ...fs.readFileSync(ROOT + '/contracts/.env.tester', 'utf8').split('\n')]
  .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const RPC = 'https://rpc.v4.testnet.pulsechain.com';
const chain = defineChain({ id: 943, name: 'PulseChain Testnet v4', nativeCurrency: { name: 'tPLS', symbol: 'tPLS', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const FEES = { maxFeePerGas: parseUnits('5', 9), maxPriorityFeePerGas: parseUnits('2', 9) }; // network's suggested 62k gwei tip is unnecessary
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const dep = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const tst = privateKeyToAccount(env.TESTER_PRIVATE_KEY);
const wDep = createWalletClient({ account: dep, chain, transport: http(RPC) });
const wTst = createWalletClient({ account: tst, chain, transport: http(RPC) });
// third throwaway wallet, key kept in memory only (never written or printed)
const tst2 = privateKeyToAccount(generatePrivateKey());
const wTst2 = createWalletClient({ account: tst2, chain, transport: http(RPC) });
const D = JSON.parse(fs.readFileSync(ROOT + '/deployments/pulsechain-testnet-943.json', 'utf8'));
const W = D.collaterals.WPLS;
const abi = (n) => JSON.parse(fs.readFileSync(ROOT + '/frontend/src/abis/' + n + '.json', 'utf8'));
const branchAbi = abi('Branch'), erc20 = abi('MockERC20');
const feedAbi = [{ type: 'function', name: 'setPrice', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] }];

const txs = []; // {label, hash, from}
let currentLabel = '';
const startBal = { dep: await pub.getBalance({ address: dep.address }), tst: await pub.getBalance({ address: tst.address }) };
const OUT = ROOT + '/redesign-screenshots';
fs.mkdirSync(OUT, { recursive: true });

async function cli(w, label, args, plain) {
  const hash = args ? await w.writeContract({ ...args, ...FEES }) : await w.sendTransaction({ ...plain, ...FEES });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 240_000 });
  txs.push({ label, hash, from: w.account.address === dep.address ? 'deployer (script)' : w.account.address === tst.address ? 'tester (script)' : 'tester2 (script)', status: rc.status, gas: rc.gasUsed, price: rc.effectiveGasPrice });
  if (rc.status !== 'success') throw new Error(label + ' reverted ' + hash);
  console.log('  [script]', label, hash);
  return hash;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text().slice(0, 200)); });
await page.exposeFunction('__rpc', async (method, params) => {
  switch (method) {
    case 'eth_requestAccounts': case 'eth_accounts': return [dep.address];
    case 'eth_chainId': return '0x3af';
    case 'net_version': return '943';
    case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
    case 'wallet_requestPermissions': case 'wallet_getPermissions': return [{ parentCapability: 'eth_accounts' }];
    case 'eth_sendTransaction': {
      const t = params[0];
      const hash = await wDep.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gas: t.gas ? BigInt(t.gas) : undefined, ...FEES });
      txs.push({ label: currentLabel, hash, from: 'deployer (UI)' });
      console.log('  [ui tx]', currentLabel, hash);
      return hash;
    }
    default: {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
      return j.result;
    }
  }
});
await page.addInitScript(() => {
  const listeners = {};
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      try { return await window.__rpc(method, params || []); }
      catch (e) { const err = new Error(e.message); err.code = -32603; throw err; }
    },
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); }, removeListener: () => {},
  };
});


const shot = async (name) => { await page.waitForTimeout(3000); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log('📸', name); };
async function ui(label, action) {
  currentLabel = label;
  await action();
  await page.waitForFunction((l) => { const t = document.querySelector('#status')?.textContent || ''; return t.includes(l + ' confirmed') || t.includes(l + ' failed'); }, label, { timeout: 300_000 });
  const s = await page.locator('#status').innerText();
  console.log('  status:', s);
  if (!s.includes('confirmed')) throw new Error('UI step failed: ' + s);
  await page.waitForTimeout(4000);
}
const T = (id) => page.getByTestId(id);
async function ensureConnected() { await page.waitForTimeout(1500); if (await T('connect').count()) await T('connect').click(); await T('wallet-pill').waitFor({ timeout: 60_000 }); }
const nav = async (p) => { await T('nav-' + p).click(); await page.waitForTimeout(2500); };
const results = [];
async function step(n, title, fn) {
  try { await fn(); results.push({ n, title, ok: true }); }
  catch (e) { results.push({ n, title, ok: false, err: String(e.message).slice(0, 300) }); console.log('❌', n, e.message); await page.screenshot({ path: `${OUT}/flow-${n}-FAILED.png`, fullPage: true }); }
}

await page.goto('http://127.0.0.1:4173/#start');
await page.evaluate(() => sessionStorage.setItem('pm-theme-session', 'light'));
await step('01', 'connect', async () => { await ensureConnected(); await shot('flow-01-connected-start'); });
await step('02', 'mint test WPLS', async () => { await nav('borrow'); await ui('Mint test WPLS', () => T('mint-test').click()); await shot('flow-02-minted-wpls'); });
await step('03', 'open vault', async () => {
  await T('deposit').fill('1000000000'); await T('borrow').fill('5000');
  await page.waitForTimeout(1500); await shot('flow-03a-open-vault-form');
  await ui('Open vault', () => T('confirm-borrow').click()); await shot('flow-03b-vault-opened');
});
await step('04', 'vault view + riskier vault from tester2', async () => {
  await cli(wDep, 'deployer: fund tester2 0.2 tPLS', null, { to: tst2.address, value: parseUnits('0.2', 18) });
  await cli(wTst2, 'tester2: mint 300M WPLS', { address: W.token, abi: erc20, functionName: 'mint', args: [tst2.address, parseUnits('300000000', 18)] });
  await cli(wTst2, 'tester2: approve', { address: W.token, abi: erc20, functionName: 'approve', args: [W.branch, parseUnits('300000000', 18)] });
  await cli(wTst2, 'tester2: open vault 300M WPLS / 3,500 USDPM', { address: W.branch, abi: branchAbi, functionName: 'openTrove', args: [parseUnits('300000000', 18), parseUnits('3500', 18)] });
  await page.reload(); await ensureConnected(); await nav('borrow');
  await shot('flow-04-vault-view-ratio');
});
await step('05', 'stability pool deposit', async () => {
  await nav('stability'); await T('sp-amount').fill('4000');
  await ui('Deposit', () => T('confirm-sp').click()); await shot('flow-05-stability-deposit');
});
await step('06', 'price drop -> liquidation table -> liquidate', async () => {
  await cli(wDep, 'deployer: set mock WPLS price $0.00003 -> $0.000017', { address: W.feed, abi: feedAbi, functionName: 'setPrice', args: [parseUnits('0.000017', 18)] });
  await page.reload(); await ensureConnected(); await nav('liquidations');
  const row = T('liq-row-' + tst2.address.toLowerCase());
  await row.locator('.ratio-bad').waitFor({ timeout: 60_000 });
  await shot('flow-06a-liquidations-table-warning');
  await ui('Liquidate', () => row.getByTestId('liquidate-row').click());
  await shot('flow-06b-after-liquidation');
  await nav('stability'); await shot('flow-06c-stability-gains');
});
await step('07', 'redemption', async () => {
  await cli(wTst, 'tester: borrow 4,500 more USDPM', { address: W.branch, abi: branchAbi, functionName: 'adjustTrove', args: [0n, 0n, parseUnits('4500', 18), 0n] });
  await cli(wTst, 'tester: send 4,500 USDPM to deployer', { address: D.USDPM, abi: erc20, functionName: 'transfer', args: [dep.address, parseUnits('4500', 18)] });
  await page.reload(); await ensureConnected(); await nav('redemptions');
  await T('redeem-amount').fill('500'); await page.waitForTimeout(1500);
  await shot('flow-07a-redemption-form');
  await ui('Redeem', () => T('confirm-redeem').click()); await shot('flow-07b-after-redemption');
});
await step('08', 'PMNT staking', async () => {
  await nav('staking'); await T('stake-amount').fill('1000000');
  await ui('Stake', () => T('confirm-stake').click()); await shot('flow-08-pmnt-staked');
});
await step('09', 'close vault', async () => {
  await nav('borrow'); await T('tab-repay').click(); await page.waitForTimeout(1500);
  await shot('flow-09a-repay-tab');
  await ui('Close vault', () => T('close-vault').click()); await shot('flow-09b-vault-closed');
});
// screenshot every page in both themes, at a moment with live data (price still lowered = interesting ratios)
const PAGES = ['start', 'borrow', 'stability', 'staking', 'redemptions', 'liquidations', 'analytics', 'docs'];
await step('10', 'all pages light + dark', async () => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => sessionStorage.setItem('pm-theme-session', t), theme);
    await page.goto('http://127.0.0.1:4173/#start'); await page.reload(); await ensureConnected();
    for (const [i, p] of PAGES.entries()) { await nav(p); if (p === 'analytics') await page.waitForTimeout(8000); await shot(`page-${String(i + 1).padStart(2, '0')}-${p}-${theme}`); }
  }
});
await cli(wDep, 'deployer: restore mock WPLS price to $0.00003', { address: W.feed, abi: feedAbi, functionName: 'setPrice', args: [parseUnits('0.00003', 18)] }).catch((e) => console.log('restore failed', e.message));

for (const t of txs) if (t.gas === undefined) { const rc = await pub.getTransactionReceipt({ hash: t.hash }); t.status = rc.status; t.gas = rc.gasUsed; t.price = rc.effectiveGasPrice; }
const endBal = { dep: await pub.getBalance({ address: dep.address }), tst: await pub.getBalance({ address: tst.address }), tst2: await pub.getBalance({ address: tst2.address }) };
const gasCost = txs.reduce((a, t) => a + BigInt(t.gas ?? 0) * BigInt(t.price ?? 0), 0n);
const out = { results, tester2: tst2.address, txs: txs.map((t) => ({ ...t, gas: String(t.gas), price: String(t.price), link: 'https://scan.v4.testnet.pulsechain.com/tx/' + t.hash })),
  gasTotal: String(txs.reduce((a, t) => a + BigInt(t.gas ?? 0), 0n)), gasCostTPLS: formatEther(gasCost), tester2Left: formatEther(endBal.tst2) };
fs.writeFileSync(OUT + '/results.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(results), out.gasCostTPLS, out.gasTotal);
await browser.close();
