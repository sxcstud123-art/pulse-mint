// Headless E2E of the real Pulse Mint UI on PulseChain testnet v4 (943).
// An injected EIP-1193 provider forwards to Node, which signs with the throwaway deployer key (never sent to the page).
import { chromium } from 'playwright';
import fs from 'fs';
import { createWalletClient, createPublicClient, http, parseUnits, defineChain, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
const D = JSON.parse(fs.readFileSync(ROOT + '/deployments/pulsechain-testnet-943.json', 'utf8'));
const W = D.collaterals.WPLS;
const abi = (n) => JSON.parse(fs.readFileSync(ROOT + '/frontend/src/abis/' + n + '.json', 'utf8'));
const branchAbi = abi('Branch'), erc20 = abi('MockERC20');
const feedAbi = [{ type: 'function', name: 'setPrice', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] }];

const txs = []; // {label, hash, from}
let currentLabel = '';
const startBal = { dep: await pub.getBalance({ address: dep.address }), tst: await pub.getBalance({ address: tst.address }) };

async function cli(w, label, args) {
  const hash = await w.writeContract({ ...args, ...FEES });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 240_000 });
  txs.push({ label, hash, from: w.account.address === dep.address ? 'deployer (script)' : 'tester (script)', status: rc.status, gas: rc.gasUsed, price: rc.effectiveGasPrice });
  if (rc.status !== 'success') throw new Error(label + ' reverted ' + hash);
  console.log('  [script]', label, hash);
  return hash;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
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

const shot = async (n, name) => { await page.waitForTimeout(2500); await page.screenshot({ path: `${ROOT}/test-screenshots/${n}-${name}.png`, fullPage: true }); console.log('📸', n, name); };
const status = () => page.locator('#status').innerText();
async function ui(label, action, expect = 'confirmed') {
  currentLabel = label;
  await action();
  await page.waitForFunction((l) => { const t = document.querySelector('#status')?.textContent || ''; return t.includes(l + ' confirmed') || t.includes(l + ' failed'); }, label, { timeout: 300_000 });
  const s = await status();
  console.log('  status:', s);
  if (!s.includes(expect)) throw new Error('UI step failed: ' + s);
  await page.waitForTimeout(4000);
}
const inputByPh = (ph) => page.getByPlaceholder(ph, { exact: true });
const results = [];
async function step(n, title, fn) {
  try { await fn(); results.push({ n, title, ok: true }); }
  catch (e) { results.push({ n, title, ok: false, err: String(e.message).slice(0, 300) }); console.log('❌', n, e.message); await page.screenshot({ path: `${ROOT}/test-screenshots/${n}-FAILED.png`, fullPage: true }); }
}

await page.goto('http://127.0.0.1:4173/');
await step('01', 'connect', async () => {
  await page.getByRole('button', { name: /Connect/ }).first().click();
  await page.getByText('Your vault').waitFor({ timeout: 60_000 });
  await shot('01', 'connected-home');
});
await step('02', 'mint test WPLS', async () => {
  await ui('Mint test WPLS', () => page.getByRole('button', { name: /Get 1,000,000,000 test WPLS/ }).click());
  await shot('02', 'minted-test-wpls');
});
await step('03', 'open vault', async () => {
  await inputByPh('WPLS amount').fill('1000000000');
  await inputByPh('USDPM to borrow').fill('5000');
  await ui('Open vault', () => page.getByRole('button', { name: 'Open vault' }).click());
  await shot('03', 'vault-opened');
});
await step('04', 'vault view w/ ratio + second (riskier) vault from tester', async () => {
  // tester opens a riskier vault so there is something to liquidate later
  await cli(wTst, 'tester: mint 300M WPLS', { address: W.token, abi: erc20, functionName: 'mint', args: [tst.address, parseUnits('300000000', 18)] });
  await cli(wTst, 'tester: approve', { address: W.token, abi: erc20, functionName: 'approve', args: [W.branch, parseUnits('300000000', 18)] });
  await cli(wTst, 'tester: open vault 300M WPLS / 3,500 USDPM', { address: W.branch, abi: branchAbi, functionName: 'openTrove', args: [parseUnits('300000000', 18), parseUnits('3500', 18)] });
  await page.reload(); await page.getByRole('button', { name: /Connect/ }).first().click().catch(() => {});
  await page.getByText('Your vault').waitFor();
  await shot('04', 'vault-view-collateral-ratio');
});
await step('05', 'stability pool deposit', async () => {
  await inputByPh('USDPM').first().fill('4000');
  await ui('Deposit', () => page.getByRole('button', { name: 'Deposit' }).click());
  await shot('05', 'stability-pool-deposit');
});
await step('06', 'price drop -> liquidation warning -> liquidate', async () => {
  await cli(wDep, 'deployer: set mock WPLS price $0.00003 -> $0.000017', { address: W.feed, abi: feedAbi, functionName: 'setPrice', args: [parseUnits('0.000017', 18)] });
  await page.reload(); await page.getByRole('button', { name: /Connect/ }).first().click().catch(() => {});
  await page.getByText('liquidatable').waitFor({ timeout: 60_000 });
  await shot('06a', 'price-drop-liquidation-warning');
  await ui('Liquidate', () => page.getByRole('button', { name: 'Liquidate' }).click());
  await shot('06b', 'after-liquidation');
});
await step('07', 'redemption', async () => {
  // tester re-opens a healthy vault and sends deployer 4,000 USDPM (needed later to close)
  await cli(wTst, 'tester: mint 1B WPLS', { address: W.token, abi: erc20, functionName: 'mint', args: [tst.address, parseUnits('1000000000', 18)] });
  await cli(wTst, 'tester: approve', { address: W.token, abi: erc20, functionName: 'approve', args: [W.branch, parseUnits('1000000000', 18)] });
  await cli(wTst, 'tester: open vault 1B WPLS / 4,000 USDPM', { address: W.branch, abi: branchAbi, functionName: 'openTrove', args: [parseUnits('1000000000', 18), parseUnits('4000', 18)] });
  await cli(wTst, 'tester: send 4,000 USDPM to deployer', { address: D.USDPM, abi: erc20, functionName: 'transfer', args: [dep.address, parseUnits('4000', 18)] });
  await page.reload(); await page.getByRole('button', { name: /Connect/ }).first().click().catch(() => {});
  await page.getByText('Your vault').waitFor();
  await shot('07a', 'before-redemption');
  await inputByPh('USDPM').nth(1).fill('500');
  await ui('Redeem', () => page.getByRole('button', { name: 'Redeem' }).click());
  await shot('07b', 'after-redemption');
});
await step('08', 'PMNT staking', async () => {
  await inputByPh('PMNT').fill('1000000');
  await ui('Stake', () => page.getByRole('button', { name: 'Stake', exact: true }).click());
  await shot('08', 'pmnt-staked');
});
await step('09', 'close vault (reserve refunded)', async () => {
  await ui('Close vault', () => page.getByRole('button', { name: 'Close vault' }).click());
  await shot('09', 'vault-closed');
});
// restore the mock price so the testnet is left in a normal state
await cli(wDep, 'deployer: restore mock WPLS price to $0.00003', { address: W.feed, abi: feedAbi, functionName: 'setPrice', args: [parseUnits('0.00003', 18)] }).catch((e) => console.log('restore failed', e.message));

// fill gas for UI txs
for (const t of txs) if (t.gas === undefined) {
  const rc = await pub.getTransactionReceipt({ hash: t.hash }); t.status = rc.status; t.gas = rc.gasUsed; t.price = rc.effectiveGasPrice;
}
const endBal = { dep: await pub.getBalance({ address: dep.address }), tst: await pub.getBalance({ address: tst.address }) };
const out = { results, txs: txs.map((t) => ({ ...t, gas: String(t.gas), price: String(t.price), link: 'https://scan.v4.testnet.pulsechain.com/tx/' + t.hash })),
  spent: { deployer: formatEther(startBal.dep - endBal.dep), tester: formatEther(startBal.tst - endBal.tst) },
  gasTotal: String(txs.reduce((a, t) => a + BigInt(t.gas ?? 0), 0n)) };
fs.writeFileSync(ROOT + '/test-screenshots/results.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(results, null, 1), out.spent);
await browser.close();
