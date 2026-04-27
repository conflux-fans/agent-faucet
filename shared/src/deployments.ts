import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

const decimalString = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const deploymentSchema = z
  .object({
    chainId: decimalString,
    chainName: z.string().min(1),
    faucetAddress: z.string().refine((value) => isAddress(value, { strict: false })),
    serverlessUrl: z.string().url(),
  })
  .strict();

export const deploymentsFileSchema = z
  .object({
    version: z.literal(1),
    deployments: z.array(deploymentSchema),
  })
  .strict();

export interface Deployment {
  chainId: bigint;
  chainName: string;
  faucetAddress: Address;
  serverlessUrl: string;
}

export function parseDeploymentsFile(input: unknown): Deployment[] {
  const parsed = deploymentsFileSchema.parse(input);
  return parsed.deployments.map((deployment) => ({
    chainId: BigInt(deployment.chainId),
    chainName: deployment.chainName,
    faucetAddress: getAddress(deployment.faucetAddress),
    serverlessUrl: deployment.serverlessUrl,
  }));
}

export function findDeployment(deployments: Deployment[], chainId: bigint): Deployment {
  const deployment = deployments.find((candidate) => candidate.chainId === chainId);
  if (!deployment) {
    throw new Error(`No deployment configured for chainId ${chainId}`);
  }
  return deployment;
}
