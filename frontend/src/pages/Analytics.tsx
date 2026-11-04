import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { useP, num, ZERO } from '../data';
import { ADDR, DEPLOY_BLOCK } from '../config';
import { Title, Perf, CollSelect } from '../ui/common';
import { LineChart, BarChart } from '../ui/Charts';

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

/** Rebuilds a balance/supply history from Transfer logs since deployment (read-only eth_getLogs). */
function useHistory(token: `0x${string}`, holder: `0x${string}` | null, dec: number) {
  const client = usePublicClient();
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const latest = await client!.getBlock();
        const first = await client!.getBlock({ blockNumber: DEPLOY_BLOCK });
        const t = (bn: bigint) => Number(first.timestamp) + (Number(bn - DEPLOY_BLOCK) / Number(latest.number - DEPLOY_BLOCK || 1n)) * Number(latest.timestamp - first.timestamp);
        const args = holder ? [{ to: holder }, { from: holder }] : [{ from: ZERO }, { to: ZERO }];
        const logs = (await Promise.all(args.map((a) => client!.getLogs({ address: token, event: transfer, args: a as any, fromBlock: DEPLOY_BLOCK, toBlock: latest.number }))))
          .flat().sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || (a.logIndex! - b.logIndex!));
        let bal = 0n; const out = [{ x: Number(first.timestamp), y: 0 }];
        for (const l of logs) {
          const { from, to, value } = l.args as any;
          if (holder) { if (to?.toLowerCase() === holder.toLowerCase()) bal += value; if (from?.toLowerCase() === holder.toLowerCase()) bal -= value; }
          else { if (from === ZERO) bal += value; if (to === ZERO) bal -= value; }
          out.push({ x: t(l.blockNumber!), y: num(bal, dec) });
        }
        out.push({ x: Number(latest.timestamp), y: num(bal, dec) });
        if (!dead) setPts(out);
      } catch { if (!dead) setPts([]); }
    })();
    return () => { dead = true; };
  }, [token, holder]);
  return pts;
}
const day = (x: number) => new Date(x * 1000).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Analytics() {
  const { branches, c } = useP();
  const supply = useHistory(ADDR.usdpm, null, 18);
  const locked = useHistory(c.token, c.branch, c.decimals);
  const sym = branches.map((b) => b.c.symbol);
  return (<div className="page">
    <Title t="Analytics" sub="Live from PulseChain testnet v4: current state read from the contracts, history rebuilt from on-chain events." />
    <Perf />
    <div className="chart-picker"><span>Collateral shown in "locked over time":</span><CollSelect /></div>
    <div className="charts">
      <div className="card" data-testid="chart-supply"><h3>USDPM supply over time</h3><LineChart pts={supply} xLabel={day} /></div>
      <div className="card"><h3>{c.symbol} locked over time</h3><LineChart pts={locked} color="var(--accent)" xLabel={day} /></div>
      <div className="card"><h3>Value locked by collateral (USD)</h3><BarChart data={branches.map((b, i) => ({ k: sym[i], v: b.valueUsd }))} fmtV={(v) => '$' + (v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0))} /></div>
      <div className="card"><h3>USDPM debt by collateral</h3><BarChart data={branches.map((b, i) => ({ k: sym[i], v: num(b.debt) }))} color="var(--brand-2)" /></div>
      <div className="card"><h3>Collateral ratio by branch (%)</h3><BarChart data={branches.map((b, i) => ({ k: sym[i], v: b.tcr ? Number(b.tcr / 10n ** 14n) / 100 : 0 }))} color="var(--accent)" fmtV={(v) => v.toFixed(0) + '%'} markers={[{ v: 150, label: 'typical MCR 150%' }]} /></div>
      <div className="card"><h3>Stability pool deposits (USDPM)</h3><BarChart data={branches.map((b, i) => ({ k: sym[i], v: num(b.sp) }))} /></div>
    </div>
  </div>);
}
