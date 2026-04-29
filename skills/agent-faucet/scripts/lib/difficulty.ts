const UINT256_SPACE = 1n << 256n;

export const DEFAULT_MAX_ATTEMPTS_MULTIPLIER = 10n;

export function estimateExpectedAttempts(target: bigint): bigint {
  if (target < 0n || target >= UINT256_SPACE) {
    throw new Error("target must fit uint256");
  }
  return ceilDiv(UINT256_SPACE, target + 1n);
}

export function defaultMaxAttemptsForTarget(target: bigint): bigint {
  return estimateExpectedAttempts(target) * DEFAULT_MAX_ATTEMPTS_MULTIPLIER;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
