import { CastRunner, readTokenConfig, runCast } from "./lib/cast";
import { defaultRpcUrl, Deployment, getDeployment } from "./lib/deployments";
import { ceilDiv, estimateExpectedAttempts } from "./lib/difficulty";
import { bigintToHex, normalizeToken, parseUint } from "./lib/evm";
import { defaultThreadCount, halfThreadCount, parseThreadCount } from "./lib/threads";
import { main, parseArgs } from "./common";

const DEFAULT_BASELINE_ATTEMPTS_PER_SECOND = 50_000n;
const DEFAULT_BASELINE_LABEL = "M2 Pro single-thread TypeScript proof loop";

export async function estimateProofTime(
  argv: string[],
  deps?: { deployment?: Deployment; cast?: CastRunner; availableParallelism?: () => number },
) {
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
      userGuidanceZh: "这个 token 当前没有启用，暂时不能估算领取计算耗时。",
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
    userGuidanceZh: `可以领取。继续前需要你明确授权我在本机做一次防滥用计算，通常会占用 CPU 一小段时间；默认使用 ${allCpuThreads} 个逻辑 CPU 并行加速，按当前 token 难度和基准机器估算约 ${allCpuEstimate.human}。你也可以指定更少线程，例如使用一半 CPU（${halfCpuThreads} 线程，约 ${halfCpuEstimate.human}）或不用多线程加速（1 线程，约 ${singleThreadEstimate.human}）。实际耗时会随硬件和负载变化。要用多少线程继续？`,
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
    return `${formatDecimalSeconds(ms)} 秒`;
  }
  const seconds = ceilDiv(ms, 1000n);
  const minutes = seconds / 60n;
  const remainingSeconds = seconds % 60n;
  if (remainingSeconds === 0n) {
    return `${minutes} 分钟`;
  }
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

if (import.meta.main) {
  await main(() => estimateProofTime(Bun.argv.slice(2)));
}
