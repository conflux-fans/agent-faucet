import { Address, Hex, normalizeBytes32, parseUint } from "./evm";

export type CastRunner = (args: string[]) => Promise<string>;

export const runCast: CastRunner = async (args) => {
  const proc = Bun.spawn(["cast", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`cast ${args.join(" ")} failed: ${stderr.trim() || stdout.trim()}`);
  }
  return stdout.trim();
};

export interface GlobalConfig {
  minEntropyAgeBlocks: bigint;
  maxEntropyAgeBlocks: bigint;
  defaultCooldownBlocks: bigint;
  nativeTransferGasLimit: bigint;
  defaultAmount: bigint;
  defaultTarget: bigint;
}

export interface TokenConfig {
  enabled: boolean;
  amount: bigint;
  target: bigint;
  cooldownBlocks: bigint;
}

export async function readGlobalConfig(cast: CastRunner, rpcUrl: string, faucetAddress: Address): Promise<GlobalConfig> {
  const values = parseCastValues(
    await cast([
      "call",
      faucetAddress,
      "getGlobalConfig()(uint64,uint64,uint64,uint64,uint256,uint256)",
      "--rpc-url",
      rpcUrl,
    ]),
  );
  requireValueCount(values, 6, "getGlobalConfig");
  return {
    minEntropyAgeBlocks: castValueToUint(values[0], "minEntropyAgeBlocks"),
    maxEntropyAgeBlocks: castValueToUint(values[1], "maxEntropyAgeBlocks"),
    defaultCooldownBlocks: castValueToUint(values[2], "defaultCooldownBlocks"),
    nativeTransferGasLimit: castValueToUint(values[3], "nativeTransferGasLimit"),
    defaultAmount: castValueToUint(values[4], "defaultAmount"),
    defaultTarget: castValueToUint(values[5], "defaultTarget"),
  };
}

export async function readTokenConfig(
  cast: CastRunner,
  rpcUrl: string,
  faucetAddress: Address,
  token: Address,
): Promise<TokenConfig> {
  const values = parseCastValues(
    await cast([
      "call",
      faucetAddress,
      "getEffectiveTokenConfig(address)(bool,uint256,uint256,uint64)",
      token,
      "--rpc-url",
      rpcUrl,
    ]),
  );
  requireValueCount(values, 4, "getEffectiveTokenConfig");
  return {
    enabled: castValueToBool(values[0], "enabled"),
    amount: castValueToUint(values[1], "amount"),
    target: castValueToUint(values[2], "target"),
    cooldownBlocks: castValueToUint(values[3], "cooldownBlocks"),
  };
}

export async function readNextClaimBlock(
  cast: CastRunner,
  rpcUrl: string,
  faucetAddress: Address,
  recipient: Address,
  token: Address,
): Promise<bigint> {
  const values = parseCastValues(
    await cast(["call", faucetAddress, "nextClaimBlock(address,address)(uint64)", recipient, token, "--rpc-url", rpcUrl]),
  );
  requireValueCount(values, 1, "nextClaimBlock");
  return castValueToUint(values[0], "nextClaimBlock");
}

export async function readLatestBlockNumber(cast: CastRunner, rpcUrl: string): Promise<bigint> {
  return parseUint(await cast(["block-number", "--rpc-url", rpcUrl]), "latest block number");
}

export async function readBlockHash(cast: CastRunner, rpcUrl: string, blockNumber: bigint): Promise<Hex> {
  return normalizeBytes32(await cast(["block", blockNumber.toString(), "--field", "hash", "--rpc-url", rpcUrl]), "block hash");
}

export function parseCastValues(output: string): string[] {
  const values = output.match(/0x[0-9a-fA-F]+|true|false|[0-9]+/g);
  if (!values) {
    throw new Error(`Unable to parse cast output: ${output}`);
  }
  return values;
}

function requireValueCount(values: string[], expected: number, label: string) {
  if (values.length !== expected) {
    throw new Error(`Expected ${expected} values from ${label}, got ${values.length}`);
  }
}

function castValueToUint(value: string, label: string): bigint {
  return parseUint(value, label);
}

function castValueToBool(value: string, label: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}
