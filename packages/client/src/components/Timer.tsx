import { useEffect, useState } from 'react';
import styles from '../App.module.css';

export function Timer({ endsAt }: { endsAt: number | undefined }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1_000)) : 0;
  return (
    <div className={styles.timer} role="timer" aria-label={`${seconds} secondes restantes`}>
      <span>{seconds}</span>
      <small>secondes</small>
    </div>
  );
}
