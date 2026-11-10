import { useState } from 'react';
import { useP, stakingAbi, fmt, num } from '../data';
import { ADDR, COLLATERALS } from '../config';
import { Title, Amount, parse, Tabs, Row, Perf, NeedWallet } from '../ui/common';

export default function Staking() {
  const { pmntBal, myStake, totalStaked, pendUsdpm, pendColl, run, send, approve, isPending } = useP();
  const [tab, setTab] = useState(0); const [v, setV] = useState('');
  const a = parse(v);
  const share = totalStaked && myStake ? (num(myStake) / num(totalStaked)) * 100 : 0;
  return (<div className="page">
    <Title t="Staking (PMNT)" watch="08-staking-pmnt.mp4" sub="Stake PMNT to earn the protocol's borrowing fees (USDPM) and redemption fees (collateral)." />
    <div className="cols">
      <div><div className="col-h">Stake PMNT</div>
        <div className="card"><Tabs tabs={['Stake', 'Unstake']} cur={tab} set={(i) => { setTab(i); setV(''); }} />
          <NeedWallet>
            <Amount id="stake-amount" label={tab === 0 ? 'Stake PMNT' : 'Unstake PMNT'} value={v} set={setV} max={tab === 0 ? pmntBal : myStake} unit="PMNT" />
            <button className="btn" data-testid="confirm-stake" disabled={isPending || a === 0n} onClick={() => run(tab === 0 ? 'Stake' : 'Unstake', async () => {
              if (tab === 0) { await approve(ADDR.pmnt, ADDR.staking, a); await send({ address: ADDR.staking, abi: stakingAbi, functionName: 'stake', args: [a] }); }
              else await send({ address: ADDR.staking, abi: stakingAbi, functionName: 'unstake', args: [a] });
              setV('');
            })}>Confirm</button>
          </NeedWallet>
        </div></div>
      <div><div className="col-h">Staking Pool</div>
        <div className="stats">
          <Row k="Your stake" v={`${fmt(myStake)} PMNT`} id="my-stake" />
          <Row k="Your pool share" v={share.toFixed(4) + '%'} />
          <Row k="Total staked" v={`${fmt(totalStaked)} PMNT`} />
        </div>
        <div className="col-h">Your Rewards</div>
        <div className="stats">
          <Row k="Borrowing fees" v={`${fmt(pendUsdpm)} USDPM`} />
          {COLLATERALS.map((c, i) => <Row key={c.symbol} k={`Redemption fees (${c.symbol})`} v={fmt(pendColl[i], c.decimals)} />)}
        </div>
        <button className="btn secondary" disabled={!myStake} onClick={() => run('Claim', () => send({ address: ADDR.staking, abi: stakingAbi, functionName: 'unstake', args: [0n] }))}>Claim rewards</button>
      </div>
    </div>
    <Perf />
  </div>);
}
