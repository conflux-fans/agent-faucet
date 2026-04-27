import { faucetAbi } from "@agent-faucet/shared";
import { createClient, getDeployment, main, parseCommonArgs } from "./common";

export async function readConfig(argv: string[], deps?: { deployment?: Awaited<ReturnType<typeof getDeployment>>; client?: any }) {
  const args = parseCommonArgs(argv);
  const deployment = deps?.deployment ?? (await getDeployment(args.chainId));
  const client = deps?.client ?? createClient(args.chainId, args.rpcUrl);

  const [globalConfig, tokenConfig, nextClaimBlock, latestBlock] = await Promise.all([
    client.readContract({ address: deployment.faucetAddress, abi: faucetAbi, functionName: "getGlobalConfig" }),
    client.readContract({
      address: deployment.faucetAddress,
      abi: faucetAbi,
      functionName: "getEffectiveTokenConfig",
      args: [args.token],
    }),
    client.readContract({
      address: deployment.faucetAddress,
      abi: faucetAbi,
      functionName: "nextClaimBlock",
      args: [args.recipient, args.token],
    }),
    client.getBlockNumber(),
  ]);

  return {
    ok: true,
    deployment,
    recipient: args.recipient,
    token: args.token,
    globalConfig,
    tokenConfig,
    latestBlock: latestBlock.toString(),
    nextClaimBlock: nextClaimBlock.toString(),
    canClaimNow: latestBlock >= nextClaimBlock,
  };
}

if (import.meta.main) {
  await main(() => readConfig(Bun.argv.slice(2)));
}
