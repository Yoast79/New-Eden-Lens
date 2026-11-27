import { useEffect, useRef } from 'react';

// Smooth 2D value noise + FBM for realistic wispy cosmic nebula clouds
function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.05;
    amp *= 0.5;
  }
  return val;
}

function buildNebulaCanvas(width: number, height: number): HTMLCanvasElement {
  const off = document.createElement('canvas');
  // Render at 1/4 resolution for smooth organic clouds & fast startup
  const nw = Math.max(240, Math.floor(width / 4));
  const nh = Math.max(160, Math.floor(height / 4));
  off.width = nw;
  off.height = nh;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  const img = ctx.createImageData(nw, nh);
  const data = img.data;

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const nx = (x / nw) * 3.2;
      const ny = (y / nh) * 2.4;

      // Domain-warped FBM for realistic EVE-like gas filaments
      const warpX = fbm(nx + 1.7, ny + 9.2);
      const warpY = fbm(nx + 8.3, ny + 2.8);
      const density = fbm(nx + warpX * 1.4, ny + warpY * 1.4);
      const ridge = Math.max(0, 1 - Math.abs(density - 0.52) * 3.6);
      const cloud = Math.pow(density, 2.1) * 0.85 + Math.pow(ridge, 2.4) * 0.35;

      // Subtle cold Caldari/space palette: deep void -> slate-blue -> cyan filament
      const r = Math.min(255, Math.floor(4 + cloud * 26));
      const g = Math.min(255, Math.floor(7 + cloud * 72));
      const b = Math.min(255, Math.floor(14 + cloud * 118));
      const a = Math.min(255, Math.floor(cloud * 195));

      const idx = (y * nw + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return off;
}

interface PinpointStar {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  tint: string;
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
    let nebula = buildNebulaCanvas(w, h);

    const makeStars = (cw: number, ch: number): PinpointStar[] =>
      Array.from({ length: 260 }, () => {
        const bright = Math.random() > 0.9;
        return {
          x: Math.random() * cw,
          y: Math.random() * ch,
          r: bright ? 0.9 + Math.random() * 0.45 : 0.35 + Math.random() * 0.5,
          baseAlpha: bright ? 0.65 + Math.random() * 0.3 : 0.18 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.008 + Math.random() * 0.015,
          tint: Math.random() > 0.78 ? '#BAE6FD' : '#F8FAFC'
        };
      });

    let stars = makeStars(w, h);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      nebula = buildNebulaCanvas(w, h);
      stars = makeStars(w, h);
    };
    window.addEventListener('resize', onResize);

    const draw = () => {
      ctx.fillStyle = '#04070E';
      ctx.fillRect(0, 0, w, h);

      // Slow, subtle atmospheric nebula drift
      const t = Date.now() * 0.00008;
      const dx = Math.sin(t) * 18;
      const dy = Math.cos(t * 0.7) * 12;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nebula, dx - 24, dy - 18, w + 48, h + 36);
      ctx.restore();

      // Subtle distant sun/starlight glow in upper right
      const sun = ctx.createRadialGradient(w * 0.82, h * 0.18, 2, w * 0.82, h * 0.18, Math.max(w, h) * 0.32);
      sun.addColorStop(0, 'rgba(186, 230, 253, 0.11)');
      sun.addColorStop(0.35, 'rgba(56, 189, 248, 0.04)');
      sun.addColorStop(1, 'rgba(4, 7, 14, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);

      // Crisp pinpoint starfield
      for (const s of stars) {
        s.phase += s.speed;
        const twinkle = 0.75 + 0.25 * Math.sin(s.phase);
        ctx.globalAlpha = s.baseAlpha * twinkle;
        ctx.fillStyle = s.tint;
        ctx.fillRect(s.x, s.y, s.r, s.r);
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
