// lib/bandit.ts

// Simple Gamma sampler (Marsaglia & Tsang) – good enough for Thompson Sampling.
function sampleGamma(shape: number, scale = 1): number {
  if (shape <= 0) {
    throw new Error("Gamma shape must be > 0");
  }

  // Boost small shapes < 1 into the (1,∞) range
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(1 + shape, scale) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    // Box–Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const x = z;
    let v = 1 + c * x;
    if (v <= 0) continue;

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

export function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error("Beta parameters must be > 0");
  }
  const x = sampleGamma(alpha, 1);
  const y = sampleGamma(beta, 1);
  return x / (x + y);
}
