const COLORS = ['#8b5cf6', '#22d3ee', '#ff3d8b', '#fbbf24', '#34d399', '#ffffff'];

/**
 * Confettis maison sur un <canvas>. Renvoie une fonction d'arret, a appeler au
 * demontage du composant pour ne pas laisser tourner une boucle d'animation.
 */
export function confetti(
  canvas: HTMLCanvasElement,
  { count = 160, duration = 5200 }: { count?: number; duration?: number } = {},
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();

  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.5,
    w: (6 + Math.random() * 8) * dpr,
    h: (8 + Math.random() * 12) * dpr,
    vy: (1.6 + Math.random() * 3.2) * dpr,
    vx: (Math.random() - 0.5) * 2.2 * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.22,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const start = performance.now();
  let raf = 0;

  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vy += 0.012 * dpr;
      if (p.y > canvas.height + 40) {
        p.y = -30;
        p.x = Math.random() * canvas.width;
        p.vy = (1.6 + Math.random() * 3) * dpr;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = t > duration - 900 ? Math.max(0, (duration - t) / 900) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < duration) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', resize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
