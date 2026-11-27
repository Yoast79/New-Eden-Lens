import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
}

export function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const colors = ['#E2E8F0', '#BAE6FD', '#38BDF8', '#FDE68A'];
    const stars: Star[] = Array.from({ length: 140 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.3 + Math.random() * 0.9,
      r: 0.6 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.14,
      vy: -0.06 - Math.random() * 0.16,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Subtle drifting nebula glows
      const t = Date.now() * 0.00018;
      const g1 = ctx.createRadialGradient(
        w * (0.25 + Math.sin(t) * 0.05),
        h * (0.2 + Math.cos(t * 0.8) * 0.05),
        20,
        w * 0.25,
        h * 0.2,
        Math.max(w, h) * 0.45
      );
      g1.addColorStop(0, 'rgba(56, 189, 248, 0.10)');
      g1.addColorStop(1, 'rgba(7, 11, 18, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(
        w * (0.78 + Math.cos(t * 0.7) * 0.04),
        h * (0.65 + Math.sin(t * 0.9) * 0.04),
        20,
        w * 0.78,
        h * 0.65,
        Math.max(w, h) * 0.4
      );
      g2.addColorStop(0, 'rgba(245, 158, 11, 0.06)');
      g2.addColorStop(1, 'rgba(7, 11, 18, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Stars & subtle constellation links
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x += s.vx * s.z;
        s.y += s.vy * s.z;
        if (s.y < -4) {
          s.y = h + 4;
          s.x = Math.random() * w;
        }
        if (s.x < -4) s.x = w + 4;
        if (s.x > w + 4) s.x = -4;

        ctx.globalAlpha = 0.35 + s.z * 0.55;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
        ctx.fill();

        // Connect close stars for subtle EVE starmap feel
        for (let j = i + 1; j < i + 6 && j < stars.length; j++) {
          const o = stars[j];
          const dx = s.x - o.x;
          const dy = s.y - o.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 11000) {
            ctx.globalAlpha = (1 - dist2 / 11000) * 0.12;
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(o.x, o.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />;
}

