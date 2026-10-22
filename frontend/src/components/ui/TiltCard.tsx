import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, useTransform } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * Pointer-driven tilt card (±6°) with a specular highlight.
 * Disabled under reduced motion or a coarse pointer.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const enabled = !reduce && !coarse;

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [6, -6]), { stiffness: 150, damping: 15 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-6, 6]), { stiffness: 150, damping: 15 });
  const glareX = useTransform(px, [0, 1], ['0%', '100%']);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={enabled ? { rotateX, rotateY, transformStyle: 'preserve-3d' } : undefined}
      className={cn('relative', className)}
    >
      {children}
      {enabled && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-40"
          style={{
            background: useTransform(
              glareX,
              (x) => `radial-gradient(240px circle at ${x} 0%, rgba(255,255,255,0.16), transparent 60%)`,
            ),
          }}
        />
      )}
    </motion.div>
  );
}
