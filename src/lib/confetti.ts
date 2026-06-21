/**
 * Confete sem dependências: dispara um <canvas> em overlay com partículas
 * animadas e se auto-remove ao terminar. Usado para celebrar marcos —
 * ex.: quitar a última parcela de um parcelamento.
 *
 * Respeita `prefers-reduced-motion`: se o usuário pede menos movimento,
 * não anima (no-op).
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: 'rect' | 'circle';
}

const COLORS = ['#16a34a', '#22c55e', '#4ade80', '#fbbf24', '#f97316', '#3b82f6', '#a855f7', '#ec4899'];

export function fireConfetti(options: { count?: number; durationMs?: number } = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const count = options.count ?? 140;
  const duration = options.durationMs ?? 2600;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = window.devicePixelRatio || 1;
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

  // Dois jatos vindos das bordas inferiores, disparando para cima e p/ dentro.
  const particles: Particle[] = Array.from({ length: count }, () => {
    const fromLeft = Math.random() < 0.5;
    return {
      x: fromLeft ? 0 : W,
      y: H * (0.7 + Math.random() * 0.3),
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 6),
      vy: -(8 + Math.random() * 8),
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    };
  });

  const gravity = 0.25;
  const drag = 0.99;
  const start = performance.now();
  let raf = 0;
  let done = false;

  const cleanup = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(safety);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };

  // Rede de segurança: garante a remoção mesmo se o rAF for estrangulado
  // (aba em segundo plano), evitando que o canvas vaze na tela.
  const safety = window.setTimeout(cleanup, duration + 400);

  const frame = (now: number) => {
    const elapsed = now - start;
    // Fade nos últimos 40% da duração.
    const fade = 1 - Math.max(0, elapsed - duration * 0.6) / (duration * 0.4);
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (elapsed < duration) raf = requestAnimationFrame(frame);
    else cleanup();
  };

  raf = requestAnimationFrame(frame);
}
