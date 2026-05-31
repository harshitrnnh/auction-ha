import { useRef, useEffect } from 'react';

export default function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    let w, h, stars, raf;
    const resize = () => {
      w = c.width = window.innerWidth;
      h = c.height = window.innerHeight;
      stars = Array.from({ length: Math.round(w * h / 14000) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.2,
        a: Math.random() * 0.5 + 0.1,
        tw: Math.random() * 0.02 + 0.004,
        p: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.p += s.tw;
        const a = s.a * (0.6 + 0.4 * Math.sin(s.p));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fillStyle = `rgba(255,250,235,${a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas className="starfield" ref={ref} />;
}
