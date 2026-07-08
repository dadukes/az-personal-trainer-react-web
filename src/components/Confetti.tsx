import { useEffect, useRef } from 'react';

/**
 * Dependency-free confetti burst on a full-screen canvas overlay. Self-contained
 * (no external libs — the app ships no confetti dependency) and non-interactive
 * (`pointer-events: none`). Fires once on mount, runs ~2.6s, then fades.
 */

const COLORS = ['#34D2C1', '#7BE3D3', '#F5C542', '#39B1F2', '#0E4C45', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
}

export default function Confetti({ pieceCount = 160, duration = 2600 }: { pieceCount?: number; duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Two side cannons + a light rain from the top.
    const pieces: Piece[] = Array.from({ length: pieceCount }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const cannon = i < pieceCount * 0.7;
      return {
        x: cannon ? (fromLeft ? 0 : W) : Math.random() * W,
        y: cannon ? H * 0.72 : -20,
        vx: cannon ? (fromLeft ? 1 : -1) * (5 + Math.random() * 7) : (Math.random() - 0.5) * 3,
        vy: cannon ? -(9 + Math.random() * 9) : 2 + Math.random() * 3,
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    const gravity = 0.28;
    const drag = 0.995;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = now - start;
      const fade = t > duration - 500 ? Math.max(0, (duration - t) / 500) : 1;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      for (const p of pieces) {
        p.vy += gravity;
        p.vx *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (t < duration) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [pieceCount, duration]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
