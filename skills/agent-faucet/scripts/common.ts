import { parseArgs } from "./lib/args";
import { getDeployment } from "./lib/deployments";
import { Address, normalizeAddress, normalizeToken } from "./lib/evm";
import { main, printJson } from "./lib/json";

export interface CommonArgs {
  chainId: bigint;
  rpcUrl: string;
  recipient: Address;
  token: Address;
}

export function parseCommonArgs(argv: string[], defaults?: { rpcUrl?: string }): CommonArgs {
  const parsed = parseArgs(argv);
  const chainIdText = parsed["chain-id"];
  const rpcUrl = parsed["rpc-url"] ?? defaults?.rpcUrl;
  const recipient = parsed.recipient;
  const token = parsed.token ?? "native";

  if (typeof chainIdText !== "string") {
    throw new Error("--chain-id is required");
  }
  if (typeof rpcUrl !== "string") {
    throw new Error("--rpc-url is required");
  }
  if (typeof recipient !== "string") {
    throw new Error("--recipient is required");
  }
  if (typeof token !== "string") {
    throw new Error("--token must be a token address or native");
  }

  return {
    chainId: BigInt(chainIdText),
    rpcUrl,
    recipient: normalizeAddress(recipient, "recipient"),
    token: normalizeToken(token),
  };
}

export { getDeployment, main, parseArgs, printJson };
