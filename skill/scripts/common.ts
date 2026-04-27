import { findDeployment, normalizeAddress, normalizeToken, parseDeploymentsFile } from "@agent-faucet/shared";
import { createPublicClient, defineChain, http } from "viem";

export interface CommonArgs {
  chainId: bigint;
  rpcUrl: string;
  recipient: `0x${string}`;
  token: `0x${string}`;
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[name] = true;
    } else {
      args[name] = value;
      i++;
    }
  }
  return args;
}

export async function loadDeployments(path = new URL("../deployments.json", import.meta.url)): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

export async function getDeployment(chainId: bigint) {
  const deployments = parseDeploymentsFile(await loadDeployments());
  return findDeployment(deployments, chainId);
}

export function parseCommonArgs(argv: string[]): CommonArgs {
  const parsed = parseArgs(argv);
  const chainIdText = parsed["chain-id"];
  const rpcUrl = parsed["rpc-url"];
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

export function createClient(chainId: bigint, rpcUrl: string) {
  return createPublicClient({
    chain: defineChain({
      id: Number(chainId),
      name: `Agent Faucet ${chainId}`,
      nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    }),
    transport: http(rpcUrl),
  });
}

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, bigintJsonReplacer, 2));
}

export function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

export async function main(fn: () => Promise<unknown>) {
  try {
    printJson(await fn());
  } catch (error) {
    printJson({ ok: false, code: "SCRIPT_ERROR", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}
