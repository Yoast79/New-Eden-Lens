import { useEffect, useRef } from 'react';

interface GalaxyStar {
  radius: number;
  angle: number;
  armOffset: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

interface BgStar {
  x: number;
  y: number;
  r: number;
  twinklePhase: number;
  twinkleSpeed: number;
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

    const arms = 4;
    const galaxyColors = ['#E0F2FE', '#7DD3FC', '#38BDF8', '#C084FC', '#FDE68A', '#FDBA74'];
    const galaxyStars: GalaxyStar[] = Array.from({ length: 820 }, (_, i) => {
      const arm = i % arms;
      const dist = Math.pow(Math.random(), 0.72);
      const radius = 16 + dist * 460;
      const swirl = dist * 4.4;
      const scatter = (Math.random() - 0.5) * (0.35 + dist * 0.65);
      return {
        radius,
        angle: (arm / arms) * Math.PI * 2 + swirl + scatter,
        armOffset: (Math.random() - 0.5) * 18,
        speed: 0.00022 + (1 - dist) * 0.00045,
        size: dist < 0.2 ? 1.1 + Math.random() * 1.4 : 0.6 + Math.random() * 1.3,
        alpha: 0.25 + Math.random() * 0.7,
        color:
          dist < 0.16
            ? '#FDE68A'
            : galaxyColors[Math.floor(Math.random() * galaxyColors.length)]
      };
    });

    const bgStars: BgStar[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.4 + Math.random() * 1.1,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.015 + Math.random() * 0.025,
      color: Math.random() > 0.8 ? '#7DD3FC' : '#E2E8F0'
    }));

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const t = Date.now() * 0.00015;

      // Deep-space multi-layered drifting nebulae
      const nebulae = [
        { x: w * (0.72 + Math.sin(t) * 0.03), y: h * (0.32 + Math.cos(t * 0.7) * 0.03), r: Math.max(w, h) * 0.52, c1: 'rgba(56, 189, 248, 0.14)', c2: 'rgba(14, 165, 233, 0)' },
        { x: w * (0.24 + Math.cos(t * 0.8) * 0.04), y: h * (0.72 + Math.sin(t * 0.6) * 0.03), r: Math.max(w, h) * 0.46, c1: 'rgba(168, 85, 247, 0.11)', c2: 'rgba(168, 85, 247, 0)' },
        { x: w * 0.68, y: h * 0.34, r: Math.max(w, h) * 0.28, c1: 'rgba(245, 158, 11, 0.09)', c2: 'rgba(245, 158, 11, 0)' }
      ];
      for (const n of nebulae) {
        const g = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
        g.addColorStop(0, n.c1);
        g.addColorStop(1, n.c2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // Twinkling deep-field stars
      for (const b of bgStars) {
        b.twinklePhase += b.twinkleSpeed;
        ctx.globalAlpha = 0.25 + (Math.sin(b.twinklePhase) + 1) * 0.35;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spinning Spiral Galaxy (tilted elliptical projection)
      const cx = w * 0.7;
      const cy = h * 0.34;
      const tilt = 0.48; // perspective foreshortening
      const rotTilt = -0.28; // diagonal tilt
      const cosR = Math.cos(rotTilt);
      const sinR = Math.sin(rotTilt);

      // Galactic core glow
      const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, 135);
      core.addColorStop(0, 'rgba(254, 243, 199, 0.45)');
      core.addColorStop(0.28, 'rgba(56, 189, 248, 0.20)');
      core.addColorStop(1, 'rgba(7, 11, 18, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, 135, 0, Math.PI * 2);
      ctx.fill();

      for (const s of galaxyStars) {
        s.angle += s.speed;
        const lx = Math.cos(s.angle) * s.radius;
        const ly = Math.sin(s.angle) * s.radius * tilt + s.armOffset * 0.35;
        const px = cx + lx * cosR - ly * sinR;
        const py = cy + lx * sinR + ly * cosR;

        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
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
