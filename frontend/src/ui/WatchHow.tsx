import { useEffect, useRef, useState } from 'react';

/** Approved help clips in frontend/public/help, served at /pulse-mint/help/. */
export const HELP_VIDEOS = [
  ['01-borrow-open-vault.mp4', 'Borrow: open a vault'],
  ['02-connect-wallet.mp4', 'Connect your wallet'],
  ['03-repay-debt.mp4', 'Repay debt'],
  ['04-close-vault.mp4', 'Close a vault'],
  ['05-collateral-ratio.mp4', 'Collateral ratio'],
  ['06-fees.mp4', 'Borrowing fee'],
  ['07-stability-pool.mp4', 'Stability Pool'],
  ['08-staking-pmnt.mp4', 'Stake PMNT'],
  ['09-liquidations.mp4', 'Liquidations'],
  ['10-redemptions.mp4', 'Redemptions'],
  ['11-recovery-mode.mp4', 'Recovery mode'],
] as const;

export function helpSrc(file: string) {
  return `${import.meta.env.BASE_URL}help/${file}`;
}

export function WatchHow({ src, compact = false }: { src: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const close = () => {
    video.current?.pause();
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      video.current?.pause();
      setOpen(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  const title = HELP_VIDEOS.find(([file]) => file === src)?.[1] ?? 'Watch how';
  return (<>
    <button type="button" className={'watchhow' + (compact ? ' compact' : '')} data-testid={'watch-' + src.replace(/\.mp4$/, '')} aria-label={'Watch how: ' + title} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" /></svg>
      {compact ? null : 'Watch how'}
    </button>
    {open && (
      <div className="wallet-modal watch-modal" role="dialog" aria-modal="true" aria-label={title} data-testid="watch-modal" onClick={close}>
        <div className="card watch-card" onClick={(e) => e.stopPropagation()}>
          <div className="head"><h3>{title}</h3><button type="button" className="btn sm secondary" data-testid="watch-close" onClick={close}>Close</button></div>
          <video ref={video} controls playsInline preload="none" src={helpSrc(src)} />
        </div>
      </div>
    )}
  </>);
}

export function HelpVideoList() {
  return (
    <ul className="help-list">
      {HELP_VIDEOS.map(([file, title]) => (
        <li key={file}>
          <a href={helpSrc(file)}>{title}</a>
          <WatchHow src={file} />
        </li>
      ))}
    </ul>
  );
}
