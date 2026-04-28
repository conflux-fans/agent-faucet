import { Address, normalizeAddress, parseUint } from "./evm";

export interface Deployment {
  chainId: bigint;
  chainName: string;
  rpcUrls: string[];
  faucetAddress: Address;
  serverlessUrl: string;
  scanUrl: string;
}

export async function loadDeployments(path = new URL("../../deployments.json", import.meta.url)): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

export function parseDeploymentsFile(input: unknown): Deployment[] {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.deployments)) {
    throw new Error("Invalid deployments file");
  }
  return input.deployments.map((deployment, index) => {
    if (!isRecord(deployment)) {
      throw new Error(`Invalid deployment at index ${index}`);
    }
    const chainId = requireString(deployment.chainId, `deployments[${index}].chainId`);
    const chainName = requireString(deployment.chainName, `deployments[${index}].chainName`);
    const rpcUrls = requireStringArray(deployment.rpcUrls, `deployments[${index}].rpcUrls`);
    const faucetAddress = requireString(deployment.faucetAddress, `deployments[${index}].faucetAddress`);
    const serverlessUrl = requireString(deployment.serverlessUrl, `deployments[${index}].serverlessUrl`);
    const scanUrl = requireString(deployment.scanUrl, `deployments[${index}].scanUrl`);
    if (chainName.length === 0) {
      throw new Error(`deployments[${index}].chainName is required`);
    }
    if (rpcUrls.length === 0) {
      throw new Error(`deployments[${index}].rpcUrls must not be empty`);
    }
    rpcUrls.forEach((rpcUrl, rpcIndex) => requireUrl(rpcUrl, `deployments[${index}].rpcUrls[${rpcIndex}]`));
    requireUrl(serverlessUrl, `deployments[${index}].serverlessUrl`);
    requireUrl(scanUrl, `deployments[${index}].scanUrl`);
    return {
      chainId: parseUint(chainId, `deployments[${index}].chainId`),
      chainName,
      rpcUrls,
      faucetAddress: normalizeAddress(faucetAddress, `deployments[${index}].faucetAddress`),
      serverlessUrl,
      scanUrl,
    };
  });
}

export function transactionScanUrl(deployment: Deployment, txHash: string): string {
  return `${deployment.scanUrl.replace(/\/+$/, "")}/tx/${txHash}`;
}

export function defaultRpcUrl(deployment: Deployment): string {
  return deployment.rpcUrls[0];
}

export async function getDeployment(chainId: bigint) {
  return findDeployment(parseDeploymentsFile(await loadDeployments()), chainId);
}

export function findDeployment(deployments: Deployment[], chainId: bigint): Deployment {
  const deployment = deployments.find((candidate) => candidate.chainId === chainId);
  if (!deployment) {
    throw new Error(`No deployment configured for chainId ${chainId}`);
  }
  return deployment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

function requireUrl(value: string, label: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}
