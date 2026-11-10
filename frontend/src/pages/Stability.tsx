import { useState } from 'react';
import { useP, branchAbi, fmt, num } from '../data';
import { ADDR } from '../config';
import { Title, CollSelect, Amount, parse, Tabs, Row, Perf, NeedWallet } from '../ui/common';

export default function Stability() {
  const { b, c, my, usdpmBal, run, send, approve, isPending } = useP();
  const [tab, setTab] = useState(0); const [v, setV] = useState('');
  const a = parse(v);
  const share = b.sp && my.spDep ? (num(my.spDep) / num(b.sp)) * 100 : 0;
  return (<div className="page">
    <Title t="Stability Pool" watch="07-stability-pool.mp4" sub={`Deposit USDPM to back ${c.symbol} vaults. Earn liquidated ${c.symbol} at a discount, plus PMNT.`} />
    <CollSelect />
    <div className="cols">
      <div><div className="col-h">Deposit USDPM</div>
        <div className="card"><Tabs tabs={['Deposit', 'Withdraw']} cur={tab} set={(i) => { setTab(i); setV(''); }} />
          <NeedWallet>
            {tab === 0 ? <Amount id="sp-amount" label="Deposit USDPM" value={v} set={setV} max={usdpmBal} unit="USDPM" />
              : <Amount id="sp-amount" label="Withdraw USDPM" value={v} set={setV} max={my.spDep} unit="USDPM" />}
            <button className="btn" data-testid="confirm-sp" disabled={isPending || a === 0n} onClick={() => run(tab === 0 ? 'Deposit' : 'Withdraw', async () => {
              if (tab === 0) { await approve(ADDR.usdpm, c.branch, a); await send({ address: c.branch, abi: branchAbi, functionName: 'provideToSP', args: [a] }); }
              else await send({ address: c.branch, abi: branchAbi, functionName: 'withdrawFromSP', args: [a] });
              setV('');
            })}>Confirm</button>
          </NeedWallet>
        </div></div>
      <div><div className="col-h">{c.symbol} Stability Pool</div>
        <div className="stats">
          <Row k="Your deposit" v={`${fmt(my.spDep)} USDPM`} id="sp-deposit" />
          <Row k="Your pool share" v={share.toFixed(2) + '%'} />
          <Row k="Total in pool" v={`${fmt(b.sp)} USDPM`} />
        </div>
        <div className="col-h">Your Rewards</div>
        <div className="stats">
          <Row k={`Liquidation gains (${c.symbol})`} v={fmt(my.spGain, c.decimals)} id="sp-gain" />
          <Row k="PMNT rewards" v={fmt(my.spPmnt)} />
        </div>
        <button className="btn secondary" data-testid="claim-sp" disabled={!my.spDep && !my.spGain} onClick={() => run('Claim', () => send({ address: c.branch, abi: branchAbi, functionName: 'withdrawFromSP', args: [0n] }))}>Claim rewards</button>
      </div>
    </div>
    <Perf />
  </div>);
}
