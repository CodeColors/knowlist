import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/display';

const COLORS = ['#c8603f', '#7f9a72', '#d49a3a', '#f6e1d7', '#4f7a8c'];

/** Célébration discrète de fin de session (désactivée si « réduire les animations »). */
export function Celebration({ fire }: { fire: boolean }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; dx: number; delay: number; color: string }[]>([]);
  useEffect(() => {
    if (!fire || prefersReducedMotion()) return;
    setPieces(
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: 10 + Math.random() * 80,
        dx: (Math.random() - 0.5) * 200,
        delay: Math.random() * 0.4,
        color: COLORS[i % COLORS.length],
      })),
    );
    const t = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(t);
  }, [fire]);
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          aria-hidden="true"
          style={{ left: `${p.left}vw`, background: p.color, animationDelay: `${p.delay}s`, ['--dx' as any]: `${p.dx}px` }}
        />
      ))}
    </>
  );
}
