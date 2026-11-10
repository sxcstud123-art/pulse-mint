import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { useP, branchAbi, fmt, pct, short, ZERO, E18 } from '../data';
import { Title, CollSelect, Amount, parse, Row, Perf, NeedWallet, PriceNotice } from '../ui/common';

export default function Redemptions() {
  const { b, c, usdpmBal, run, send, isPending } = useP();
  const [v, setV] = useState('');
  const a = parse(v);
  const tail = (b.tail ?? ZERO) as `0x${string}`;
  const tailIcr = useReadContract({ address: c.branch, abi: branchAbi, functionName: 'getICR', args: [tail, b.price ?? 0n], query: { enabled: tail !== ZERO && !!b.price } });
  const gross = b.price ? a * 10n ** BigInt(c.decimals) / b.price : 0n;
  const net = gross - gross * 50n / 10000n;
  const blocked = b.redemptionsPaused || (b.tcr !== undefined && b.mcr !== undefined && b.tcr < b.mcr);
  return (<div className="page">
    <Title t="Redemptions" watch="10-redemptions.mp4" sub="Swap USDPM for $1 of collateral. This is what holds USDPM close to its peg." />
    <CollSelect />
    <PriceNotice only="redeem" />
    <div className="cols">
      <div><div className="col-h">Redeem USDPM for {c.symbol}</div>
        <div className="card">
          <div className="alert info">Redemptions are taken from the riskiest {c.symbol} vault first. That owner's debt drops by the same amount, so they lose no value. A 0.5% fee goes to PMNT stakers.</div>
          <NeedWallet>
            <Amount id="redeem-amount" label="Redeem USDPM" value={v} set={setV} max={usdpmBal} unit="USDPM" />
            {!b.redemptionsPaused && blocked && <div className="alert danger">Redemptions are paused while the {c.symbol} system ratio is below {pct(b.mcr)}.</div>}
            <button className="btn" data-testid="confirm-redeem" disabled={isPending || a === 0n || blocked} onClick={() => run('Redeem', async () => {
              await send({ address: c.branch, abi: branchAbi, functionName: 'redeem', args: [a, 0n, net * 99n / 100n, ZERO, ZERO] }); setV('');
            })}>Redeem</button>
          </NeedWallet>
        </div></div>
      <div><div className="col-h">Estimate</div>
        <div className="stats">
          <Row k="You redeem" v={`${fmt(a)} USDPM`} />
          <Row k={`${c.symbol} price`} v={b.price ? '$' + (Number(b.price) / 1e18).toPrecision(4) : '–'} />
          <Row k="Redemption fee (0.5%)" v={`${fmt(gross - net, c.decimals)} ${c.symbol}`} />
          <Row k="You receive (est.)" v={`${fmt(net, c.decimals)} ${c.symbol}`} />
          <Row k="Slippage guard" v="1%" />
        </div>
        <div className="col-h">Next vault to be redeemed</div>
        <div className="stats">
          <Row k="Owner" v={<span className="mono">{tail === ZERO ? 'none' : short(tail)}</span>} />
          <Row k="Collateral ratio" v={pct(tailIcr.data as bigint | undefined)} />
        </div>
      </div>
    </div>
    <Perf />
  </div>);
}
