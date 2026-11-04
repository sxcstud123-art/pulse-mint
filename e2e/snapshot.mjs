// Read-only: connect with the injected test wallet and screenshot the current state (no transactions).
import { chromium } from 'playwright';
import fs from 'fs';
const RPC = 'https://rpc.v4.testnet.pulsechain.com';
const ADDR = '0x73b35907eC5bcc15cA56d7c87aCb4A5A60Ba0Fd4';
const out = process.argv[2];
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 900, height: 1400 } });
await page.exposeFunction('__rpc', async (method, params) => {
  if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDR];
  if (method === 'eth_chainId') return '0x3af';
  if (method === 'eth_sendTransaction') throw new Error('read-only snapshot');
  if (method.startsWith('wallet_')) return null;
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
});
await page.addInitScript(() => { window.ethereum = { isMetaMask: true, request: ({ method, params }) => window.__rpc(method, params || []), on() {}, removeListener() {} }; });
await page.goto('http://127.0.0.1:4173/');
await page.getByRole('button', { name: /Connect/ }).first().click();
await page.getByText('Your vault').waitFor(); await page.waitForTimeout(5000);
await page.screenshot({ path: out, fullPage: true }); await b.close();
