import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAccount, useReadContracts, useWriteContract, usePublicClient } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, type Abi } from 'viem';
import { ADDR, COLLATERALS, type Coll } from './config';
import { PULSE_TESTNET_CHAIN_ID, hasRequest, parseChainId, writeBlockReason } from './wallet/pulseChain';
import BranchAbi from './abis/Branch.json';
import Erc20Abi from './abis/MockERC20.json';
import StakingAbi from './abis/PMNTStaking.json';

export const branchAbi = BranchAbi as Abi, erc20 = Erc20Abi as Abi, stakingAbi = StakingAbi as Abi;
// Every feed (MockPriceFeed on testnet, RobustPriceFeed on mainnet) has fetchPriceWithFlags(). It is not a
// view on-chain, but an eth_call simulates it safely and returns the price plus the two pause flags.
export const feedAbi = [{ type: 'function', name: 'fetchPriceWithFlags', stateMutability: 'view', inputs: [],
  outputs: [{ type: 'uint256' }, { type: 'bool' }, { type: 'bool' }] },
  // older testnet MockPriceFeeds only have price(); used as a fallback so the app still shows prices
  { type: 'function', name: 'price', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;
export const EXPLORER = 'https://scan.v4.testnet.pulsechain.com';
export const ZERO = '0x0000000000000000000000000000000000000000' as const;
export const E18 = 10n ** 18n;

export const num = (x: bigint | undefined, d = 18) => (x === undefined ? 0 : Number(formatUnits(x, d)));
export const fmt = (x: bigint | number | undefined, d = 18, dp = 2) => {
  if (x === undefined) return '–';
  const n = typeof x === 'number' ? x : num(x, d);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
};
export const pct = (x?: bigint) => (x === undefined ? '–' : x > 10n ** 24n ? '∞' : (Number(x / 10n ** 14n) / 100).toFixed(2) + '%');
export const usd = (n: number) => '$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(2) + 'K' : n.toFixed(2));
export const priceStr = (p?: bigint) => (p === undefined ? '–' : '$' + Number(formatUnits(p, 18)).toPrecision(4));
export const short = (a?: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

export type BranchStats = { c: Coll; price?: bigint; tcr?: bigint; mcr?: bigint; ccr?: bigint; debt?: bigint; coll?: bigint; cap?: bigint; sp?: bigint; size?: bigint; tail?: string; gasComp?: bigint; minDebt?: bigint; owners?: bigint; valueUsd: number; riskyPaused: boolean; redemptionsPaused: boolean };

type Ctx = ReturnType<typeof useBuild>;
const C = createContext<Ctx | null>(null);
export const useP = () => useContext(C)!;
export function ProtocolProvider({ children }: { children: ReactNode }) { const v = useBuild(); return <C.Provider value={v}>{children}</C.Provider>; }

function useBuild() {
  const { address, chainId, isConnected } = useAccount();
  const me = (address ?? ZERO) as `0x${string}`;
  const [sel, setSel] = useState(0);
  const [toast, setToast] = useState<{ msg: string; tx?: string } | null>(null);
  const qc = useQueryClient();
  const client = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  // ---- protocol-wide reads (all 7 branches) ----
  const F = ['priceFeed', 'MCR', 'CCR', 'entireSystemDebt', 'entireSystemColl', 'debtCap', 'totalDeposits', 'sortedSize', 'sortedTail', 'gasComp', 'minDebt', 'ownersCount'] as const;
  const base = useReadContracts({ contracts: COLLATERALS.flatMap((c) => F.map((fn) => ({ address: c.branch, abi: branchAbi, functionName: fn }))) });
  const g = (bi: number, k: number) => base.data?.[bi * F.length + k]?.result as any;
  const feeds = COLLATERALS.map((_, bi) => g(bi, 0) as `0x${string}` | undefined);
  const prices = useReadContracts({ contracts: feeds.flatMap((f) => [{ address: (f ?? ZERO) as `0x${string}`, abi: feedAbi, functionName: 'fetchPriceWithFlags' }, { address: (f ?? ZERO) as `0x${string}`, abi: feedAbi, functionName: 'price' }]), query: { enabled: feeds.every(Boolean), refetchInterval: 60_000 } });
  const branches: BranchStats[] = COLLATERALS.map((c, bi) => {
    const pr = prices.data?.[2 * bi]?.result as readonly [bigint, boolean, boolean] | undefined;
    const price = pr?.[0] ?? (prices.data?.[2 * bi + 1]?.result as bigint | undefined), riskyPaused = !!pr?.[1], redemptionsPaused = !!pr?.[2];
    const debt = g(bi, 3), coll = g(bi, 4);
    const valueUsd = price && coll !== undefined ? num(coll * price / 10n ** BigInt(c.decimals)) : 0;
    const tcr = price && debt ? (coll * price / 10n ** BigInt(c.decimals)) * E18 / debt : debt === 0n ? undefined : undefined;
    return { c, price, tcr, mcr: g(bi, 1), ccr: g(bi, 2), debt, coll, cap: g(bi, 5), sp: g(bi, 6), size: g(bi, 7), tail: g(bi, 8), gasComp: g(bi, 9), minDebt: g(bi, 10), owners: g(bi, 11), valueUsd, riskyPaused, redemptionsPaused };
  });
  const totDebt = branches.reduce((a, b) => a + num(b.debt), 0);
  const tvl = branches.reduce((a, b) => a + b.valueUsd, 0);
  const systemCR = totDebt > 0 ? tvl / totDebt : undefined;
  const anyRM = branches.some((b) => b.tcr !== undefined && b.ccr !== undefined && b.tcr < b.ccr);
  const global = useReadContracts({ contracts: [
    { address: ADDR.usdpm, abi: erc20, functionName: 'totalSupply' },
    { address: ADDR.staking, abi: stakingAbi, functionName: 'totalStaked' },
    { address: ADDR.usdpm, abi: erc20, functionName: 'balanceOf', args: [me] },
    { address: ADDR.pmnt, abi: erc20, functionName: 'balanceOf', args: [me] },
    { address: ADDR.staking, abi: stakingAbi, functionName: 'stakes', args: [me] },
    { address: ADDR.staking, abi: stakingAbi, functionName: 'pending', args: [me, ADDR.usdpm] },
    ...COLLATERALS.map((c) => ({ address: ADDR.staking, abi: stakingAbi, functionName: 'pending', args: [me, c.token] })),
  ] });
  const gg = (k: number) => global.data?.[k]?.result as bigint | undefined;
  const totalSupply = gg(0), totalStaked = gg(1), usdpmBal = gg(2), pmntBal = gg(3), myStake = gg(4), pendUsdpm = gg(5);
  const pendColl = COLLATERALS.map((_, i) => gg(6 + i));
  const spTotal = branches.reduce((a, b) => a + num(b.sp), 0);
  const vaults = branches.reduce((a, b) => a + Number(b.size ?? 0n), 0);

  // ---- account reads for the selected branch ----
  const b = branches[sel], c = b.c;
  const acct = useReadContracts({ contracts: [
    { address: c.branch, abi: branchAbi, functionName: 'getEntireTrove', args: [me] },
    { address: c.branch, abi: branchAbi, functionName: 'getCompoundedDeposit', args: [me] },
    { address: c.branch, abi: branchAbi, functionName: 'getDepositorCollGain', args: [me] },
    { address: c.branch, abi: branchAbi, functionName: 'getDepositorPMNTGain', args: [me] },
    { address: c.token, abi: erc20, functionName: 'balanceOf', args: [me] },
    { address: c.branch, abi: branchAbi, functionName: 'collSurplus', args: [me] },
  ] });
  const a = (k: number) => acct.data?.[k]?.result as any;
  const [vDebt, vColl] = (a(0) as [bigint, bigint] | undefined) ?? [0n, 0n];
  const icr = b.price && vDebt > 0n ? (vColl * b.price / 10n ** BigInt(c.decimals)) * E18 / vDebt : undefined;
  const my = { vDebt, vColl, icr, spDep: a(1) as bigint | undefined, spGain: a(2) as bigint | undefined, spPmnt: a(3) as bigint | undefined, collBal: a(4) as bigint | undefined, surplus: a(5) as bigint | undefined };

  // ---- writes: wait for each receipt (approve -> action), then refresh everything ----
  const send = async (args: any) => {
    // The wallet's live chain id is the source of truth, so a stale UI cannot send on mainnet.
    let live = chainId;
    const eth = (globalThis as { ethereum?: unknown }).ethereum;
    if (hasRequest(eth)) {
      try { live = parseChainId(await eth.request({ method: 'eth_chainId' })) ?? live; } catch { /* keep the wagmi chain id */ }
    }
    if (!isConnected || live !== PULSE_TESTNET_CHAIN_ID) {
      throw new Error(writeBlockReason(live, true) ?? 'Switch to PulseChain Testnet v4 (chain 943).');
    }
    const hash = await writeContractAsync(args);
    setToast((t) => ({ msg: t?.msg ?? '', tx: hash }));
    const rc = await client!.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') throw new Error('transaction reverted');
    return hash;
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setToast({ msg: label + '…' });
    try { await fn(); setToast((t) => ({ msg: label + ' confirmed ✓', tx: t?.tx })); }
    catch (e: any) { setToast((t) => ({ msg: label + ' failed: ' + (e.shortMessage ?? e.message), tx: t?.tx })); }
    finally { await qc.invalidateQueries(); }
  };
  const approve = (token: `0x${string}`, spender: `0x${string}`, amt: bigint) => send({ address: token, abi: erc20, functionName: 'approve', args: [spender, amt] });

  return { address, me, sel, setSel, b, c, branches, totDebt, tvl, systemCR, anyRM, totalSupply, totalStaked, usdpmBal, pmntBal, myStake, pendUsdpm, pendColl, spTotal, vaults, my, send, run, approve, isPending, toast };
}
