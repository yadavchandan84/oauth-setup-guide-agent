import { Suspense, lazy, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { canUseWebGL, isLowPower } from '../../lib/webgl';
import { HeroFallback } from './HeroFallback';

const HeroScene = lazy(() => import('./HeroScene'));

/**
 * Capability-gated 3D hero. Renders HeroFallback immediately; only when WebGL is usable,
 * the device is not low-power, reduced motion is off, and the GL context is live does it
 * lazy-load the heavy HeroScene chunk. The container is aria-hidden; the real headline and
 * inputs are DOM text overlaid by the caller.
 */
export function Hero() {
  const reduce = useReducedMotion();
  const [capable] = useState(() => canUseWebGL() && !isLowPower());
  const [contextLost] = useState(false);
  const show3D = capable && !reduce && !contextLost;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-0 opacity-90"
    >
      {show3D ? (
        <ErrorBoundary fallback={<HeroFallback />}>
          <Suspense fallback={<HeroFallback />}>
            <HeroScene />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <HeroFallback />
      )}
    </div>
  );
}
