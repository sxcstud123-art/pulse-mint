import { useState } from 'react';
import { useP, branchAbi, erc20, fmt, pct, priceStr, num, E18 } from '../data';
import { Title, CollSelect, Amount, parse, Tabs, Row, Perf, NeedWallet } from '../ui/common';
import { parseUnits } from 'viem';

export default function Borrow() {
  const { b, c, my, usdpmBal, run, send, approve, isPending, me } = useP();
  const [tab, setTab] = useState(0);
  const [collIn, setCollIn] = useState(''); const [amt, setAmt] = useState('');
  const has = my.vDebt > 0n;
  const scale = 10n ** BigInt(c.decimals);
  const gas = b.gasComp ?? 200n * E18;
  const fee = (x: bigint) => x * 50n / 10000n;

  // Borrow tab numbers
  const dColl = parse(collIn, c.decimals), dAmt = parse(amt);
  const isBorrow = tab === 0;
  const newColl = isBorrow ? my.vColl + dColl : my.vColl - dColl;
  const addDebt = isBorrow ? dAmt + fee(dAmt) + (has || dAmt === 0n ? 0n : gas) : 0n;
  const newDebt = isBorrow ? my.vDebt + addDebt : (my.vDebt > dAmt ? my.vDebt - dAmt : 0n);
  const newIcr = b.price && newDebt > 0n ? (newColl * b.price / scale) * E18 / newDebt : undefined;
  const maxBorrow = (() => { // keep the new ratio at or above CCR (safer than MCR)
    if (!b.price || !b.ccr) return undefined;
    const val = (newColl * b.price / scale) * E18 / b.ccr; // max total debt
    let room = val - my.vDebt - (has ? 0n : gas);
    if (room <= 0n) return 0n;
    return room * 10000n / 10050n;
  })();
  const maxRepay = has && usdpmBal !== undefined && b.minDebt !== undefined ? (() => { const r = my.vDebt - b.minDebt!; return r < 0n ? 0n : (usdpmBal < r ? usdpmBal : r); })() : 0n;
  const liqPrice = (m?: bigint) => (m && newColl > 0n && newDebt > 0n ? newDebt * m / E18 * scale / newColl : undefined);
  const tooLow = newIcr !== undefined && b.mcr !== undefined && newIcr < b.mcr && (dAmt > 0n || dColl > 0n);
  const inRM = b.tcr !== undefined && b.ccr !== undefined && b.tcr < b.ccr;

  const confirm = () => run(has ? 'Adjust vault' : 'Open vault', async () => {
    if (isBorrow && dColl > 0n) await approve(c.token, c.branch, dColl);
    if (!has) await send({ address: c.branch, abi: branchAbi, functionName: 'openTrove', args: [dColl, dAmt] });
    else if (isBorrow) await send({ address: c.branch, abi: branchAbi, functionName: 'adjustTrove', args: [dColl, 0n, dAmt, 0n] });
    else await send({ address: c.branch, abi: branchAbi, functionName: 'adjustTrove', args: [0n, dColl, 0n, dAmt] });
    setCollIn(''); setAmt('');
  });

  return (<div className="page">
    <Title t="Borrow USDPM" sub="Lock collateral, borrow USDPM. 0% interest: a one-off 0.5% fee." />
    <CollSelect />
    <div className="cols">
      <div><div className="col-h">Your {c.symbol} Vault</div>
        <div className="card">
          <Tabs tabs={['Borrow', 'Repay']} cur={tab} set={(i) => { setTab(i); setCollIn(''); setAmt(''); }} />
          <NeedWallet>
            {inRM && <div className="alert warn">Recovery mode on {c.symbol}: withdrawals are paused and new debt must keep the ratio above {pct(b.ccr)}.</div>}
            {isBorrow ? <>
              <Amount id="deposit" label={`Deposit ${c.symbol}`} value={collIn} set={setCollIn} max={my.collBal} dec={c.decimals} unit={c.symbol} />
              <Amount id="borrow" label="Borrow USDPM" value={amt} set={setAmt} max={maxBorrow} unit="USDPM (safe max)" />
            </> : <>
              <Amount id="repay" label="Repay USDPM" value={amt} set={setAmt} max={maxRepay} unit="USDPM" />
              <Amount id="withdraw" label={`Withdraw ${c.symbol}`} value={collIn} set={setCollIn} max={my.vColl} dec={c.decimals} unit={c.symbol} />
            </>}
            {tooLow && <div className="alert danger">This would put the vault below the minimum ratio ({pct(b.mcr)}).</div>}
            <button className="btn" data-testid="confirm-borrow" disabled={isPending || (!has && !isBorrow) || (dAmt === 0n && dColl === 0n)} onClick={confirm}>{has ? 'Confirm' : 'Open vault'}</button>
            {has && !isBorrow && <button className="btn secondary" data-testid="close-vault" onClick={() => run('Close vault', () => send({ address: c.branch, abi: branchAbi, functionName: 'closeTrove' }))}>Close vault (repay {fmt(my.vDebt - gas)} USDPM)</button>}
            <button className="btn secondary" data-testid="mint-test" onClick={() => run('Mint test ' + c.symbol, () => send({ address: c.token, abi: erc20, functionName: 'mint', args: [me, parseUnits('1000000000', c.decimals)] }))}>Get 1,000,000,000 test {c.symbol}</button>
            {(my.surplus ?? 0n) > 0n && <button className="btn secondary" onClick={() => run('Claim surplus', () => send({ address: c.branch, abi: branchAbi, functionName: 'claimCollSurplus' }))}>Claim {fmt(my.surplus, c.decimals)} {c.symbol} left after redemption</button>}
          </NeedWallet>
        </div>
      </div>
      <div><div className="col-h">Transaction Stats</div>
        <div className="stats">
          <Row k={isBorrow ? 'Deposit' : 'Withdraw'} v={`${fmt(dColl, c.decimals)} ${c.symbol}`} />
          <Row k="Borrowing fee (0.5%)" v={`${fmt(isBorrow ? fee(dAmt) : 0n)} USDPM`} />
          <Row k="Liquidation reserve" v={`${has || !isBorrow ? '0' : fmt(gas, 18, 0)} USDPM`} />
          <Row k={isBorrow ? 'You receive' : 'Repay'} v={`${fmt(dAmt)} USDPM`} />
        </div>
        <div className="col-h">Vault Stats</div>
        <div className="stats">
          <Row k="Collateral" v={`${fmt(newColl, c.decimals)} ${c.symbol}`} id="vault-coll" />
          <Row k="Debt (incl. reserve)" v={`${fmt(newDebt)} USDPM`} id="vault-debt" />
          <Row k="Collateral ratio" v={<span className={newIcr && b.mcr && newIcr < b.mcr ? 'ratio-bad' : 'ratio-ok'}>{newDebt > 0n ? pct(newIcr) : '–'}</span>} id="vault-icr" />
          <Row k={`Liquidation price (normal, ${pct(b.mcr)})`} v={priceStr(liqPrice(b.mcr))} />
          <Row k={`Liquidation price (recovery, ${pct(b.ccr)})`} v={priceStr(liqPrice(b.ccr))} />
          <Row k={`${c.symbol} price`} v={priceStr(b.price)} />
        </div>
        {has && my.icr !== undefined && b.mcr !== undefined && my.icr < b.mcr && <div className="alert danger">⚠ Your vault is below {pct(b.mcr)} and can be liquidated.</div>}
        <p className="note">Minimum debt {fmt(b.minDebt, 18, 0)} USDPM including a {fmt(gas, 18, 0)} USDPM reserve that is returned when you close. Debt cap for {c.symbol}: {fmt(b.debt)} / {fmt(b.cap, 18, 0)} USDPM ({b.cap ? ((num(b.debt) / num(b.cap)) * 100).toFixed(2) : 0}% used).</p>
      </div>
    </div>
    <Perf />
  </div>);
}
