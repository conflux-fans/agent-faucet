import { CastRunner, readTokenConfig, runCast } from "./lib/cast";
import { defaultRpcUrl, Deployment, getDeployment } from "./lib/deployments";
import { ceilDiv, estimateExpectedAttempts } from "./lib/difficulty";
import { Address, Hex, bigintToHex, normalizeToken, parseUint } from "./lib/evm";
import { defaultThreadCount, halfThreadCount, parseThreadCount } from "./lib/threads";
import { main, parseArgs } from "./common";

const DEFAULT_BASELINE_ATTEMPTS_PER_SECOND = 50_000n;
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
      userGuidance: string;
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
        allCpu: ProofTimeEstimate;
        halfCpu: ProofTimeEstimate;
        singleThread: ProofTimeEstimate;
      };
      userGuidance: string;
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
  const allCpuThreads = defaultThreadCount(getAvailableParallelism);
  const halfCpuThreads = halfThreadCount(allCpuThreads);
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
      userGuidance: "This token is not currently enabled, so proof computation time cannot be estimated.",
    };
  }

  const expectedAttempts = estimateExpectedAttempts(tokenConfig.target);
  const selectedEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, selectedThreads);
  const allCpuEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, allCpuThreads);
  const halfCpuEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, halfCpuThreads);
  const singleThreadEstimate = estimateForThreads(expectedAttempts, baselineAttemptsPerSecond, 1);

  return {
    ok: true,
    deployment,
    token,
    enabled: true,
    canEstimate: true,
    baseline: {
      label: typeof rawArgs["baseline-label"] === "string" ? rawArgs["baseline-label"] : DEFAULT_BASELINE_LABEL,
      attemptsPerSecond: baselineAttemptsPerSecond.toString(),
    },
    threads: {
      selected: selectedThreads,
      allCpu: allCpuThreads,
      halfCpu: halfCpuThreads,
      singleThread: 1,
    },
    difficulty: {
      expectedAttempts: expectedAttempts.toString(),
      target: bigintToHex(tokenConfig.target),
    },
    estimate: selectedEstimate,
    estimates: {
      selected: selectedEstimate,
      allCpu: allCpuEstimate,
      halfCpu: halfCpuEstimate,
      singleThread: singleThreadEstimate,
    },
    userGuidance: `The recipient can claim now. Before continuing, ask the user to authorize a local anti-abuse computation that will briefly use CPU. The estimates use an M2 Pro single-thread baseline and actual time varies by hardware and load. By default, the script uses all ${allCpuThreads} logical CPUs for parallel acceleration, estimated around ${allCpuEstimate.human}. The user may choose fewer threads, such as half CPU (${halfCpuThreads} threads, around ${halfCpuEstimate.human}) or single-thread mode with no multithread acceleration (1 thread, around ${singleThreadEstimate.human}). Ask which thread count to use.`,
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
