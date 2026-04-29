import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { parseArgs } from "../skills/agent-faucet/scripts/common";
import { Address, Hex, NATIVE_TOKEN_ADDRESS } from "../skills/agent-faucet/scripts/lib/evm";
import { searchProofNonce } from "../skills/agent-faucet/scripts/lib/proof-search";

const BENCH_CONTEXT = {
  chainId: 31337n,
  faucetAddress: "0x1000000000000000000000000000000000000000" as Address,
  recipient: "0x2000000000000000000000000000000000000000" as Address,
  token: NATIVE_TOKEN_ADDRESS,
  entropyBlockNumber: 992n,
  entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
  target: 0n,
};

interface BenchmarkOptions {
  attempts: bigint;
  maxDurationMs?: number;
  warmupAttempts: bigint;
  threads: number[];
  json: boolean;
}

interface BenchmarkRow {
  threads: number;
  attempts: string;
  durationMs: number;
  attemptsPerSecond: number;
}

interface WorkerMessage {
  type: string;
  attempts?: string;
}

export async function benchmarkThroughput(argv: string[], deps?: { availableParallelism?: () => number }) {
  const options = parseBenchmarkOptions(argv, deps);

  if (options.warmupAttempts > 0n) {
    await runBenchmark(1, options.warmupAttempts);
  }

  const rows: BenchmarkRow[] = [];
  for (const threads of options.threads) {
    rows.push(await runBenchmark(threads, options.attempts, options.maxDurationMs));
  }

  const result = {
    benchmark: "agent-faucet proof search throughput",
    totalAttemptsPerRun: options.attempts.toString(),
    maxDurationMs: options.maxDurationMs,
    warmupAttempts: options.warmupAttempts.toString(),
    rows,
  };

  if (options.json) {
    return result;
  }

  return formatTable(result);
}

function parseBenchmarkOptions(argv: string[], deps?: { availableParallelism?: () => number }): BenchmarkOptions {
  const rawArgs = parseArgs(argv);
  const cpuCount = Math.max(1, Math.trunc((deps?.availableParallelism ?? availableParallelism)()));
  const attempts = parsePositiveBigint(rawArgs.attempts, "--attempts", 2_000_000n);
  const maxDurationMs = parseOptionalPositiveNumber(rawArgs["max-duration-ms"], "--max-duration-ms");
  const warmupAttempts = parseNonNegativeBigint(rawArgs["warmup-attempts"], "--warmup-attempts", 100_000n);
  const threads =
    typeof rawArgs.threads === "string"
      ? parseThreadList(rawArgs.threads)
      : Array.from({ length: cpuCount }, (_, index) => index + 1);

  return {
    attempts,
    maxDurationMs,
    warmupAttempts,
    threads,
    json: rawArgs.json === true,
  };
}

function parseThreadList(value: string): number[] {
  const threads = value.split(",").map((item) => {
    if (!/^[1-9][0-9]*$/.test(item)) {
      throw new Error("--threads must be a comma-separated list of positive integers");
    }
    const thread = Number(item);
    if (!Number.isSafeInteger(thread) || thread < 1) {
      throw new Error("--threads must be a comma-separated list of positive integers");
    }
    return thread;
  });
  return [...new Set(threads)];
}

function parsePositiveBigint(value: string | boolean | undefined, flag: string, fallback: bigint): bigint {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return BigInt(value);
}

function parseNonNegativeBigint(value: string | boolean | undefined, flag: string, fallback: bigint): bigint {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return BigInt(value);
}

function parseOptionalPositiveNumber(value: string | boolean | undefined, flag: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${flag} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

async function runBenchmark(threads: number, attempts: bigint, maxDurationMs?: number): Promise<BenchmarkRow> {
  const deadlineMs = maxDurationMs === undefined ? undefined : Date.now() + maxDurationMs;
  const startedAt = performance.now();
  const actualAttempts =
    threads === 1 ? runSingleThreadAttempts(attempts, deadlineMs) : await runWorkers(threads, attempts, deadlineMs);
  const durationMs = performance.now() - startedAt;
  const attemptsPerSecond = Number(actualAttempts) / (durationMs / 1000);

  return {
    threads,
    attempts: actualAttempts.toString(),
    durationMs,
    attemptsPerSecond,
  };
}

function runSingleThreadAttempts(maxAttempts: bigint, deadlineMs?: number): bigint {
  const result = searchProofNonce({
    ...BENCH_CONTEXT,
    maxAttempts,
    shouldStop: deadlineMs === undefined ? undefined : () => Date.now() >= deadlineMs,
    stopCheckInterval: 4096n,
  });
  return result.attempts;
}

function runWorkers(threads: number, maxAttempts: bigint, deadlineMs?: number): Promise<bigint> {
  const stopBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  let completedWorkers = 0;
  let attempts = 0n;
  const workers: Worker[] = [];

  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      for (const worker of workers) {
        void worker.terminate();
      }
      reject(error);
    };

    const finishWorker = () => {
      completedWorkers++;
      if (completedWorkers === threads) {
        resolve(attempts);
      }
    };

    for (let index = 0; index < threads; index++) {
      const worker = new Worker(new URL("../skills/agent-faucet/scripts/proof-worker.ts", import.meta.url), {
        workerData: {
          chainId: BENCH_CONTEXT.chainId.toString(),
          faucetAddress: BENCH_CONTEXT.faucetAddress,
          recipient: BENCH_CONTEXT.recipient,
          token: BENCH_CONTEXT.token,
          entropyBlockNumber: BENCH_CONTEXT.entropyBlockNumber.toString(),
          entropyBlockHash: BENCH_CONTEXT.entropyBlockHash,
          target: BENCH_CONTEXT.target.toString(),
          maxAttempts: maxAttempts.toString(),
          startNonce: index.toString(),
          step: threads.toString(),
          stopBuffer,
          deadlineMs,
        },
      });
      workers.push(worker);
      worker.on("message", (message: WorkerMessage) => {
        if (message.attempts !== undefined) {
          attempts += BigInt(message.attempts);
        }
        finishWorker();
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (code !== 0) {
          fail(new Error(`proof benchmark worker exited with code ${code}`));
        }
      });
    }
  });
}

function formatTable(result: {
  benchmark: string;
  totalAttemptsPerRun?: string;
  maxDurationMs?: number;
  warmupAttempts: string;
  rows: BenchmarkRow[];
}): string {
  const lines = [
    result.benchmark,
    `total attempts per run: ${result.totalAttemptsPerRun}`,
    `max duration ms: ${result.maxDurationMs ?? "disabled"}`,
    `warmup attempts: ${result.warmupAttempts}`,
    "",
    "threads | attempts | duration ms | attempts/s",
    "------- | -------- | ----------- | ----------",
  ];

  for (const row of result.rows) {
    lines.push(
      `${row.threads.toString().padStart(7)} | ${row.attempts.padStart(8)} | ${row.durationMs.toFixed(2).padStart(11)} | ${Math.round(row.attemptsPerSecond).toString().padStart(10)}`,
    );
  }

  return lines.join("\n");
}

if (import.meta.main) {
  const result = await benchmarkThroughput(Bun.argv.slice(2));
  if (typeof result === "string") {
    console.log(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
