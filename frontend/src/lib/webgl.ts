/** Returns true when a WebGL(2) rendering context can be created. */
export function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

interface NavigatorLike {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Heuristic for low-power / constrained devices where the 3D hero is skipped. */
export function isLowPower(): boolean {
  const nav = navigator as Navigator & NavigatorLike;
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  const saveData = nav.connection?.saveData ?? false;
  return cores <= 2 || memory <= 2 || saveData;
}
