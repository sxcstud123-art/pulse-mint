import { useReadContracts } from 'wagmi';
import { useP, branchAbi, fmt, pct, short, E18 } from '../data';
import { Title, CollSelect, Perf } from '../ui/common';

export default function Liquidations() {
  const { b, c, run, send, isPending, address } = useP();
  const n = Number(b.owners ?? 0n);
  const ownersQ = useReadContracts({ contracts: Array.from({ length: n }, (_, i) => ({ address: c.branch, abi: branchAbi, functionName: 'owners', args: [BigInt(i)] })) });
  const owners = [...new Set((ownersQ.data ?? []).map((r) => r.result as `0x${string}`).filter(Boolean))];
  const tq = useReadContracts({ contracts: owners.flatMap((o) => [
    { address: c.branch, abi: branchAbi, functionName: 'getEntireTrove', args: [o] },
    { address: c.branch, abi: branchAbi, functionName: 'troves', args: [o] },
  ]) });
  const rows = owners.map((o, i) => {
    const [debt, coll] = (tq.data?.[2 * i]?.result as [bigint, bigint] | undefined) ?? [0n, 0n];
    const st = (tq.data?.[2 * i + 1]?.result as any)?.[3];
    const icr = b.price && debt > 0n ? (coll * b.price / 10n ** BigInt(c.decimals)) * E18 / debt : undefined;
    return { o, debt, coll, active: Number(st) === 1, icr };
  }).filter((r) => r.active).sort((x, y) => (x.icr ?? 0n) < (y.icr ?? 0n) ? -1 : 1);
  const eligible = rows.filter((r) => r.icr !== undefined && b.mcr !== undefined && r.icr < b.mcr);
  return (<div className="page">
    <Title t="Liquidations" sub={`Vaults below ${pct(b.mcr)} can be liquidated by anyone. The liquidator earns the 200 USDPM reserve plus 0.5% of the collateral.`} />
    <CollSelect />
    <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 12px' }}>
      <h3 style={{ margin: 0, flex: 1 }}>Open {c.symbol} vaults ({rows.length})</h3>
      <button className="btn sm" data-testid="liquidate-all" disabled={!address || eligible.length === 0 || isPending} onClick={() => run('Liquidate all', () => send({ address: c.branch, abi: branchAbi, functionName: 'batchLiquidate', args: [eligible.map((r) => r.o)] }))}>Liquidate all eligible ({eligible.length})</button>
    </div>
    <table data-testid="liq-table"><thead><tr><th>Owner</th><th>Collateral ({c.symbol})</th><th>Debt (USDPM)</th><th>Collateral ratio ↑</th><th></th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No open vaults</td></tr> :
        rows.map((r) => { const bad = r.icr !== undefined && b.mcr !== undefined && r.icr < b.mcr; return (
          <tr key={r.o} data-testid={'liq-row-' + r.o.toLowerCase()}>
            <td className="mono" title={r.o}>{short(r.o)}{r.o.toLowerCase() === address?.toLowerCase() && ' (you)'}</td>
            <td>{fmt(r.coll, c.decimals)}</td><td>{fmt(r.debt)}</td>
            <td className={bad ? 'ratio-bad' : 'ratio-ok'}>{pct(r.icr)}</td>
            <td><button className={'btn sm' + (bad ? ' danger' : '')} data-testid="liquidate-row" disabled={!bad || !address || isPending}
              onClick={() => run('Liquidate', () => send({ address: c.branch, abi: branchAbi, functionName: 'liquidate', args: [r.o] }))}>Liquidate</button></td>
          </tr>); })}</tbody></table>
    <Perf />
  </div>);
}
