"use client";

import { useEffect, useRef } from "react";

const nf = new Intl.NumberFormat("en-US");

/**
 * Number that counts up from 0 when it scrolls into view. The final value is server-rendered, so
 * it is correct without JavaScript and for screen readers; reduced-motion users see it unchanged.
 */
export function CountUp({ value, prefix = "", className }: { value: number; prefix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const duration = Math.min(1600, 600 + value * 4);
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + nf.format(Math.round(value * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = prefix + nf.format(value);
    };
  }, [value, prefix]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {prefix + nf.format(value)}
    </span>
  );
}
