import { bigintToHex, computeDigest, faucetAbi, satisfiesTarget } from "@agent-faucet/shared";
import { createClient, getDeployment, main, parseArgs, parseCommonArgs } from "./common";

export async function computeProof(argv: string[], deps?: { deployment?: Awaited<ReturnType<typeof getDeployment>>; client?: any }) {
  const rawArgs = parseArgs(argv);
  if (rawArgs["confirm-compute"] !== true) {
    throw new Error("Refusing to compute proof without --confirm-compute");
  }

  const args = parseCommonArgs(argv);
  const maxAttempts = typeof rawArgs["max-attempts"] === "string" ? BigInt(rawArgs["max-attempts"]) : 10_000_000n;
  const deployment = deps?.deployment ?? (await getDeployment(args.chainId));
  const client = deps?.client ?? createClient(args.chainId, args.rpcUrl);

  const [globalConfig, tokenConfig, latestBlockNumber] = await Promise.all([
    client.readContract({ address: deployment.faucetAddress, abi: faucetAbi, functionName: "getGlobalConfig" }),
    client.readContract({
      address: deployment.faucetAddress,
      abi: faucetAbi,
      functionName: "getEffectiveTokenConfig",
      args: [args.token],
    }),
    client.getBlockNumber(),
  ]);

  if (!tokenConfig.enabled) {
    throw new Error("Token is not enabled");
  }

  const entropyBlockNumber = latestBlockNumber - BigInt(globalConfig.minEntropyAgeBlocks);
  const entropyBlock = await client.getBlock({ blockNumber: entropyBlockNumber });
  if (!entropyBlock.hash) {
    throw new Error("Entropy block hash is unavailable");
  }

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
      entropyBlockHash: entropyBlock.hash,
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
          entropyBlockHash: entropyBlock.hash,
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
