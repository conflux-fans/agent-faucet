import { CastRunner, readTokenConfig, runCast } from "./lib/cast";
import { defaultRpcUrl, Deployment, getDeployment } from "./lib/deployments";
import { ceilDiv, estimateExpectedAttempts } from "./lib/difficulty";
import { Address, Hex, bigintToHex, normalizeToken, parseUint } from "./lib/evm";
import { defaultThreadCount, maxThreadCount, parseThreadCount } from "./lib/threads";
import { main, parseArgs } from "./common";

const DEFAULT_BASELINE_ATTEMPTS_PER_SECOND = 120_000n;
const DEFAULT_BASELINE_LABEL = "M2 Pro single-thread TypeScript proof loop";

type ProofTimeEstimate = ReturnType<typeof estimateForThreads>;

type EstimateProofTimeDeps = {
  deployment?: Deployment;
  cast?: CastRunner;
  availableParallelism?: () => number;
};

export type EstimateProofTimeResult =
  | {
      ok: true;
      deployment: Deployment;
      token: Address;
      enabled: false;
      canEstimate: false;
      reason: "TOKEN_DISABLED";
    }
  | {
      ok: true;
      deployment: Deployment;
      token: Address;
      enabled: true;
      canEstimate: true;
      baseline: {
        label: string;
        attemptsPerSecond: string;
      };
      threads: {
        selected: number;
        default: number;
        maxCpu: number;
        allCpu: number;
        halfCpu: number;
        singleThread: 1;
      };
      difficulty: {
        expectedAttempts: string;
        target: Hex;
      };
      estimate: ProofTimeEstimate;
      estimates: {
        selected: ProofTimeEstimate;
        default: ProofTimeEstimate;
        maxCpu: ProofTimeEstimate;
        allCpu: ProofTimeEstimate;
        halfCpu: ProofTimeEstimate;
        singleThread: ProofTimeEstimate;
      };
    };

export async function estimateProofTime(
  argv: string[],
  deps?: EstimateProofTimeDeps,
): Promise<EstimateProofTimeResult> {
  const rawArgs = parseArgs(argv);
  const chainIdText = rawArgs["chain-id"];
  if (typeof chainIdText !== "string") {
    throw new Error("--chain-id is required");
  }

  const deployment = deps?.deployment ?? (await getDeployment(BigInt(chainIdText)));
  const rpcUrl = typeof rawArgs["rpc-url"] === "string" ? rawArgs["rpc-url"] : defaultRpcUrl(deployment);
  const token = normalizeToken(typeof rawArgs.token === "string" ? rawArgs.token : "native");
  const baselineAttemptsPerSecond =
    typeof rawArgs["baseline-attempts-per-second"] === "string"
      ? parseUint(rawArgs["baseline-attempts-per-second"], "baseline-attempts-per-second")
      : DEFAULT_BASELINE_ATTEMPTS_PER_SECOND;
  if (baselineAttemptsPerSecond === 0n) {
    throw new Error("--baseline-attempts-per-second must be greater than 0");
  }
  const getAvailableParallelism = deps?.availableParallelism;
  const maxCpuThreads = maxThreadCount(getAvailableParallelism);
  const defaultThreads = defaultThreadCount(getAvailableParallelism);
  const selectedThreads = parseThreadCount(rawArgs.threads, getAvailableParallelism);

  const cast = deps?.cast ?? runCast;
  const tokenConfig = await readTokenConfig(cast, rpcUrl, deployment.faucetAddress, token);
  if (!tokenConfig.enabled) {
    return {
      ok: true,
      deployment,
      token,
      enabled: false,
      canEstimate: false,
      reason: "TOKEN_DISABLED",
    };
  }

  const expectedAttempts = estimateExpectedAttempts(tokenConfig.target);
  const selectedEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, selectedThreads);
  const defaultEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, defaultThreads);
  const maxCpuEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, maxCpuThreads);
  const singleThreadEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, 1);
  const baselineLabel = typeof rawArgs["baseline-label"] === "string" ? rawArgs["baseline-label"] : DEFAULT_BASELINE_LABEL;

  return {
    ok: true,
    deployment,
    token,
    enabled: true,
    canEstimate: true,
    baseline: {
      label: baselineLabel,
      attemptsPerSecond: baselineAttemptsPerSecond.toString(),
    },
    threads: {
      selected: selectedThreads,
      default: defaultThreads,
      maxCpu: maxCpuThreads,
      allCpu: maxCpuThreads,
      halfCpu: defaultThreads,
      singleThread: 1,
    },
    difficulty: {
      expectedAttempts: expectedAttempts.toString(),
      target: bigintToHex(tokenConfig.target),
    },
    estimate: selectedEstimate,
    estimates: {
      selected: selectedEstimate,
      default: defaultEstimate,
      maxCpu: maxCpuEstimate,
      allCpu: maxCpuEstimate,
      halfCpu: defaultEstimate,
      singleThread: singleThreadEstimate,
    },
  };
}

export { estimateExpectedAttempts };

function estimateForThreads(expectedAttempts: bigint, baselineAttemptsPerSecond: bigint, threads: number) {
  const expectedMs = ceilDiv(expectedAttempts * 1000n, baselineAttemptsPerSecond * BigInt(threads));
  return {
    threads,
    expectedMs: expectedMs.toString(),
    expectedSeconds: formatDecimalSeconds(expectedMs),
    human: formatHumanDuration(expectedMs),
  };
}

function formatDecimalSeconds(ms: bigint): string {
  const whole = ms / 1000n;
  const fraction = ms % 1000n;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function formatHumanDuration(ms: bigint): string {
  if (ms < 1000n) {
    return `${ms} ms`;
  }
  if (ms < 60_000n) {
    return `${formatDecimalSeconds(ms)} seconds`;
  }
  const seconds = ceilDiv(ms, 1000n);
  const minutes = seconds / 60n;
  const remainingSeconds = seconds % 60n;
  if (remainingSeconds === 0n) {
    return `${minutes} minutes`;
  }
  return `${minutes} minutes ${remainingSeconds} seconds`;
}

if (import.meta.main) {
  await main(() => estimateProofTime(Bun.argv.slice(2)));
}
