import { CastRunner, readBlockHash, readGlobalConfig, readLatestBlockNumber, readTokenConfig, runCast } from "./lib/cast";
import { Deployment, getDeployment } from "./lib/deployments";
import { bigintToHex, computeDigest, satisfiesTarget } from "./lib/pow";
import { main, parseArgs, parseCommonArgs } from "./common";

export async function computeProof(argv: string[], deps?: { deployment?: Deployment; cast?: CastRunner }) {
  const rawArgs = parseArgs(argv);
  if (rawArgs["confirm-compute"] !== true) {
    throw new Error("Refusing to compute proof without --confirm-compute");
  }

  const args = parseCommonArgs(argv);
  const maxAttempts = typeof rawArgs["max-attempts"] === "string" ? BigInt(rawArgs["max-attempts"]) : 10_000_000n;
  const deployment = deps?.deployment ?? (await getDeployment(args.chainId));
  const cast = deps?.cast ?? runCast;

  const [globalConfig, tokenConfig, latestBlockNumber] = await Promise.all([
    readGlobalConfig(cast, args.rpcUrl, deployment.faucetAddress),
    readTokenConfig(cast, args.rpcUrl, deployment.faucetAddress, args.token),
    readLatestBlockNumber(cast, args.rpcUrl),
  ]);

  if (!tokenConfig.enabled) {
    throw new Error("Token is not enabled");
  }

  const entropyBlockNumber = latestBlockNumber - BigInt(globalConfig.minEntropyAgeBlocks);
  const entropyBlockHash = await readBlockHash(cast, args.rpcUrl, entropyBlockNumber);

  const startedAt = Date.now();
  let attempts = 0n;
  for (let nonce = 0n; nonce < maxAttempts; nonce++) {
    attempts++;
    const digest = computeDigest({
      chainId: args.chainId,
      faucetAddress: deployment.faucetAddress,
      recipient: args.recipient,
      token: args.token,
      entropyBlockNumber,
      entropyBlockHash,
      nonce,
    });
    if (satisfiesTarget(digest, tokenConfig.target)) {
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
          nonce: bigintToHex(nonce),
        },
        debug: {
          latestBlockNumber: latestBlockNumber.toString(),
          entropyBlockHash,
          digest,
          target: bigintToHex(tokenConfig.target),
          attempts: attempts.toString(),
          durationMs: Date.now() - startedAt,
          computedAt: new Date().toISOString(),
        },
      };
    }
  }

  throw new Error(`No valid nonce found after ${maxAttempts} attempts`);
}

if (import.meta.main) {
  await main(() => computeProof(Bun.argv.slice(2)));
}
