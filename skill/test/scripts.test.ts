import { describe, expect, test } from "bun:test";
import { NATIVE_TOKEN_ADDRESS } from "@agent-faucet/shared";
import { computeProof } from "../scripts/compute-proof";
import { readConfig } from "../scripts/read-config";
import { submitClaim } from "../scripts/submit-claim";

const deployment = {
  chainId: 31337n,
  chainName: "Local",
  faucetAddress: "0x1000000000000000000000000000000000000000" as const,
  serverlessUrl: "http://127.0.0.1:3000/api/claim",
};

const fakeClient = {
  readContract: async ({ functionName }: { functionName: string }) => {
    if (functionName === "getGlobalConfig") {
      return {
        minEntropyAgeBlocks: 8,
        maxEntropyAgeBlocks: 45,
        defaultCooldownBlocks: 86400,
        nativeTransferGasLimit: 30000,
        defaultAmount: 1n,
        defaultTarget: (1n << 256n) - 1n,
      };
    }
    if (functionName === "getEffectiveTokenConfig") {
      return {
        enabled: true,
        amount: 1n,
        target: (1n << 256n) - 1n,
        cooldownBlocks: 86400,
      };
    }
    if (functionName === "nextClaimBlock") {
      return 0n;
    }
    throw new Error(`Unexpected read ${functionName}`);
  },
  getBlockNumber: async () => 1000n,
  getBlock: async () => ({
    hash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
  }),
};

const argv = [
  "--chain-id",
  "31337",
  "--rpc-url",
  "http://127.0.0.1:8545",
  "--recipient",
  "0x2000000000000000000000000000000000000000",
  "--token",
  "native",
];

describe("skill scripts", () => {
  test("read-config returns output shape", async () => {
    const result = await readConfig(argv, { deployment, client: fakeClient });

    expect(result.ok).toBe(true);
    expect(result.deployment).toEqual(deployment);
    expect(result.canClaimNow).toBe(true);
    expect(result.token).toBe(NATIVE_TOKEN_ADDRESS);
  });

  test("compute-proof requires confirmation", async () => {
    await expect(computeProof(argv, { deployment, client: fakeClient })).rejects.toThrow("--confirm-compute");
  });

  test("compute-proof returns proof schema and debug", async () => {
    const result = await computeProof(["--confirm-compute", ...argv], { deployment, client: fakeClient });

    expect(result.version).toBe(1);
    expect(result.challenge.entropyBlockNumber).toBe("992");
    expect(result.proof.nonce).toBe("0x0");
    expect(result.debug.latestBlockNumber).toBe("1000");
    expect(result.debug.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("submit-claim posts proof and returns serverless JSON", async () => {
    const proof = await computeProof(["--confirm-compute", ...argv], { deployment, client: fakeClient });

    const result = await submitClaim([], {
      proofJson: proof,
      deploymentsJson: { version: 1, deployments: [deploymentForJson()] },
      fetchFn: async (url, init) => {
        expect(url).toBe(deployment.serverlessUrl);
        expect(init?.method).toBe("POST");
        expect(JSON.parse(init?.body as string).version).toBe(1);
        return Response.json({ ok: true, txHash: "0xabc" });
      },
    });

    expect(result).toEqual({ ok: true, txHash: "0xabc" });
  });
});

function deploymentForJson() {
  return {
    chainId: "31337",
    chainName: deployment.chainName,
    faucetAddress: deployment.faucetAddress,
    serverlessUrl: deployment.serverlessUrl,
  };
}
