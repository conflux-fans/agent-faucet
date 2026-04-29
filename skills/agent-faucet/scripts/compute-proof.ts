import { Worker } from "node:worker_threads";
import { CastRunner, readBlockHash, readGlobalConfig, readLatestBlockNumber, readTokenConfig, runCast } from "./lib/cast";
import { defaultRpcUrl, Deployment, getDeployment } from "./lib/deployments";
import { defaultMaxAttemptsForTarget } from "./lib/difficulty";
import { Address, Hex, bigintToHex } from "./lib/evm";
import { searchProofNonce } from "./lib/proof-search";
import { parseThreadCount } from "./lib/threads";
import { main, parseArgs, parseCommonArgs } from "./common";

interface ProofSearchContext {
  chainId: bigint;
  faucetAddress: Address;
  recipient: Address;
  token: Address;
  entropyBlockNumber: bigint;
  entropyBlockHash: Hex;
  target: bigint;
  maxAttempts: bigint;
}

interface FoundProof {
  nonce: bigint;
  digest: Hex;
  attempts: bigint;
}

export async function computeProof(
  argv: string[],
  deps?: { deployment?: Deployment; cast?: CastRunner; availableParallelism?: () => number },
) {
  const rawArgs = parseArgs(argv);
  if (rawArgs["confirm-compute"] !== true) {
    throw new Error("Refusing to compute proof without --confirm-compute");
  }

  const chainIdText = rawArgs["chain-id"];
  if (typeof chainIdText !== "string") {
    throw new Error("--chain-id is required");
  }
  const threads = parseThreadCount(rawArgs.threads, deps?.availableParallelism);
  const deployment = deps?.deployment ?? (await getDeployment(BigInt(chainIdText)));
  const args = parseCommonArgs(argv, { rpcUrl: defaultRpcUrl(deployment) });
  const cast = deps?.cast ?? runCast;

  const [globalConfig, tokenConfig, latestBlockNumber] = await Promise.all([
    readGlobalConfig(cast, args.rpcUrl, deployment.faucetAddress),
    readTokenConfig(cast, args.rpcUrl, deployment.faucetAddress, args.token),
    readLatestBlockNumber(cast, args.rpcUrl),
  ]);

  if (!tokenConfig.enabled) {
    throw new Error("Token is not enabled");
  }
  const maxAttempts =
    typeof rawArgs["max-attempts"] === "string"
      ? parseMaxAttempts(rawArgs["max-attempts"])
      : defaultMaxAttemptsForTarget(tokenConfig.target);

  const entropyBlockNumber = latestBlockNumber - BigInt(globalConfig.minEntropyAgeBlocks);
  const entropyBlockHash = await readBlockHash(cast, args.rpcUrl, entropyBlockNumber);

  const startedAt = Date.now();
  const found = await findProof({
    chainId: args.chainId,
    faucetAddress: deployment.faucetAddress,
    recipient: args.recipient,
    token: args.token,
    entropyBlockNumber,
    entropyBlockHash,
    target: tokenConfig.target,
    maxAttempts,
  }, threads);

  if (found) {
    return {
      version: 1,
      challenge: {
        chainId: args.chainId.toString(),
        faucetAddress: deployment.faucetAddress,
        entropyBlockNumber: entropyBlockNumber.toString(),
        token: args.token,
        recipient: args.recipient,
      },
      proof: {
        nonce: bigintToHex(found.nonce),
      },
      debug: {
        latestBlockNumber: latestBlockNumber.toString(),
        entropyBlockHash,
        digest: found.digest,
        target: bigintToHex(tokenConfig.target),
        threads,
        maxAttempts: maxAttempts.toString(),
        attempts: found.attempts.toString(),
        durationMs: Date.now() - startedAt,
        computedAt: new Date().toISOString(),
      },
    };
  }

  throw new Error(`No valid nonce found after ${maxAttempts} attempts`);
}

function parseMaxAttempts(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("--max-attempts must be a positive integer");
  }
  return BigInt(value);
}

async function findProof(context: ProofSearchContext, threads: number): Promise<FoundProof | null> {
  if (threads === 1) {
    const result = searchProofNonce({
      chainId: context.chainId,
      faucetAddress: context.faucetAddress,
      recipient: context.recipient,
      token: context.token,
      entropyBlockNumber: context.entropyBlockNumber,
      entropyBlockHash: context.entropyBlockHash,
      target: context.target,
      maxAttempts: context.maxAttempts,
    });
    if (result.nonce === null || result.digest === null) {
      return null;
    }
    return { nonce: result.nonce, digest: result.digest, attempts: result.attempts };
  }

  return findProofWithWorkers(context, threads);
}

function findProofWithWorkers(context: ProofSearchContext, threads: number): Promise<FoundProof | null> {
  const stopBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const attemptsBuffer = new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT);
  const attemptsCounter = new BigInt64Array(attemptsBuffer);
  let completedWorkers = 0;
  let found: { nonce: bigint; digest: Hex } | null = null;
  const workers: Worker[] = [];

  return new Promise((resolve, reject) => {
    const finishWorker = () => {
      completedWorkers++;
      if (completedWorkers === threads) {
        resolve(found ? { ...found, attempts: Atomics.load(attemptsCounter, 0) } : null);
      }
    };

    const fail = (error: unknown) => {
      for (const worker of workers) {
        void worker.terminate();
      }
      reject(error);
    };

    for (let index = 0; index < threads; index++) {
      const worker = new Worker(new URL("./proof-worker.ts", import.meta.url), {
        workerData: {
          chainId: context.chainId.toString(),
          faucetAddress: context.faucetAddress,
          recipient: context.recipient,
          token: context.token,
          entropyBlockNumber: context.entropyBlockNumber.toString(),
          entropyBlockHash: context.entropyBlockHash,
          target: context.target.toString(),
          maxAttempts: context.maxAttempts.toString(),
          startNonce: index.toString(),
          step: threads.toString(),
          stopBuffer,
          attemptsBuffer,
        },
      });
      workers.push(worker);
      worker.on("message", (message: { type: string; nonce?: string; digest?: Hex }) => {
        if (message.type === "found" && message.nonce !== undefined && message.digest !== undefined && found === null) {
          found = { nonce: BigInt(message.nonce), digest: message.digest };
        }
        finishWorker();
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (code !== 0) {
          fail(new Error(`proof worker exited with code ${code}`));
        }
      });
    }
  });
}

if (import.meta.main) {
  await main(() => computeProof(Bun.argv.slice(2)));
}
