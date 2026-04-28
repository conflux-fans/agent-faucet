import {
  CastRunner,
  readGlobalConfig,
  readLatestBlockNumber,
  readNextClaimBlock,
  readTokenConfig,
  runCast,
} from "./lib/cast";
import { Deployment, getDeployment } from "./lib/deployments";
import { main, parseArgs, parseCommonArgs } from "./common";

export async function readConfig(argv: string[], deps?: { deployment?: Deployment; cast?: CastRunner }) {
  const rawArgs = parseArgs(argv);
  const chainIdText = rawArgs["chain-id"];
  if (typeof chainIdText !== "string") {
    throw new Error("--chain-id is required");
  }
  const deployment = deps?.deployment ?? (await getDeployment(BigInt(chainIdText)));
  const args = parseCommonArgs(argv, { rpcUrl: deployment.rpcUrl });
  const cast = deps?.cast ?? runCast;

  const [globalConfig, tokenConfig, nextClaimBlock, latestBlock] = await Promise.all([
    readGlobalConfig(cast, args.rpcUrl, deployment.faucetAddress),
    readTokenConfig(cast, args.rpcUrl, deployment.faucetAddress, args.token),
    readNextClaimBlock(cast, args.rpcUrl, deployment.faucetAddress, args.recipient, args.token),
    readLatestBlockNumber(cast, args.rpcUrl),
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
