import { availableParallelism } from "node:os";

export function maxThreadCount(getAvailableParallelism = availableParallelism): number {
  return Math.max(1, Math.trunc(getAvailableParallelism()));
}

export function defaultThreadCount(getAvailableParallelism = availableParallelism): number {
  return halfThreadCount(maxThreadCount(getAvailableParallelism));
}

export function parseThreadCount(
  rawThreads: string | boolean | undefined,
  getAvailableParallelism = availableParallelism,
): number {
  if (rawThreads === undefined) {
    return defaultThreadCount(getAvailableParallelism);
  }
  if (typeof rawThreads !== "string" || !/^[1-9][0-9]*$/.test(rawThreads)) {
    throw new Error("--threads must be a positive integer");
  }
  const threads = Number(rawThreads);
  if (!Number.isSafeInteger(threads) || threads < 1) {
    throw new Error("--threads must be a positive integer");
  }
  return threads;
}

export function halfThreadCount(threads: number): number {
  return Math.max(1, Math.ceil(threads / 2));
}
