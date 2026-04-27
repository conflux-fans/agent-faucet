import { describe, expect, test } from "bun:test";
import { zeroAddress } from "viem";
import { handleClaim, handleHealth, type Env } from "../src/handler";

const env: Env = {
  FAUCET_CHAIN_ID: "31337",
  FAUCET_ADDRESS: "0x1000000000000000000000000000000000000000",
  RPC_URL: "http://127.0.0.1:8545",
  RELAYER_PRIVATE_KEY: "0x1111111111111111111111111111111111111111111111111111111111111111",
};

const proof = {
  version: 1,
  challenge: {
    chainId: "31337",
    faucetAddress: env.FAUCET_ADDRESS,
    entropyBlockNumber: "123",
    token: zeroAddress,
    recipient: "0x2000000000000000000000000000000000000000",
  },
  proof: {
    nonce: "0x01",
  },
};

describe("serverless handlers", () => {
  test("health returns configured deployment", async () => {
    const response = await handleHealth(env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      chainId: "31337",
      faucetAddress: env.FAUCET_ADDRESS,
    });
  });

  test("claim simulates and returns tx hash", async () => {
    const clients = {
      account: "0x3000000000000000000000000000000000000000" as const,
      publicClient: {
        simulateContract: async () => ({ request: { prepared: true } }),
      },
      walletClient: {
        writeContract: async (request: unknown) => {
          expect(request).toEqual({ prepared: true });
          return "0xabc" as `0x${string}`;
        },
      },
    };

    const response = await handleClaim(jsonRequest(proof), env, clients);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, txHash: "0xabc" });
  });

  test("claim rejects deployment mismatch", async () => {
    const response = await handleClaim(jsonRequest({ ...proof, challenge: { ...proof.challenge, chainId: "1" } }), env, {
      account: "0x3000000000000000000000000000000000000000" as const,
      publicClient: { simulateContract: async () => ({ request: {} }) },
      walletClient: { writeContract: async () => "0xabc" as `0x${string}` },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("DEPLOYMENT_MISMATCH");
  });

  test("claim maps simulation failure to structured error", async () => {
    const response = await handleClaim(jsonRequest(proof), env, {
      account: "0x3000000000000000000000000000000000000000" as const,
      publicClient: {
        simulateContract: async () => {
          throw new Error("ClaimCooldownActive");
        },
      },
      walletClient: { writeContract: async () => "0xabc" as `0x${string}` },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("SIMULATION_OR_SEND_FAILED");
    expect(body.message).toContain("ClaimCooldownActive");
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
