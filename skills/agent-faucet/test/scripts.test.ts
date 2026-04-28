import { describe, expect, test } from "bun:test";
import { computeProof } from "../scripts/compute-proof";
import { NATIVE_TOKEN_ADDRESS } from "../scripts/lib/evm";
import { keccak256Hex } from "../scripts/lib/keccak";
import { computeDigest } from "../scripts/lib/pow";
import { readConfig } from "../scripts/read-config";
import { submitClaim } from "../scripts/submit-claim";

const maxUint256 = (1n << 256n) - 1n;

const deployment = {
  chainId: 31337n,
  chainName: "Local",
  rpcUrls: ["http://127.0.0.1:8545"],
  faucetAddress: "0x1000000000000000000000000000000000000000" as const,
  serverlessUrl: "http://127.0.0.1:3000/api/claim",
  scanUrl: "http://127.0.0.1:8545",
};

const fakeCast = async (args: string[]) => {
  if (args[0] === "block-number") {
    return "1000";
  }
  if (args[0] === "block") {
    expect(args[1]).toBe("992");
    return "0x1111111111111111111111111111111111111111111111111111111111111111";
  }
  if (args[0] === "call") {
    const signature = args[2];
    if (signature.startsWith("getGlobalConfig")) {
      return `(8, 45, 86400, 30000, 1, ${maxUint256})`;
    }
    if (signature.startsWith("getEffectiveTokenConfig")) {
      return `(true, 1, ${maxUint256}, 86400)`;
    }
    if (signature.startsWith("nextClaimBlock")) {
      return "0";
    }
  }
  throw new Error(`Unexpected cast args: ${args.join(" ")}`);
};

const argv = [
  "--chain-id",
  "31337",
  "--recipient",
  "0x2000000000000000000000000000000000000000",
  "--token",
  "native",
];

describe("skill scripts", () => {
  test("vendored keccak computes Ethereum Keccak-256", () => {
    expect(keccak256Hex(new Uint8Array())).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });

  test("local digest matches canonical vector", () => {
    const input = {
      chainId: 31337n,
      faucetAddress: deployment.faucetAddress,
      recipient: "0x2000000000000000000000000000000000000000" as const,
      token: NATIVE_TOKEN_ADDRESS,
      entropyBlockNumber: 992n,
      entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      nonce: 7n,
    };

    expect(computeDigest(input)).toBe("0x289c9202cf66356526b88eced5e46dea4884e08cb8a316457b98f043e27f8b71");
  });

  test("read-config returns output shape", async () => {
    const result = await readConfig(argv, { deployment, cast: fakeCast });

    expect(result.ok).toBe(true);
    expect(result.deployment).toEqual(deployment);
    expect(result.canClaimNow).toBe(true);
    expect(result.token).toBe(NATIVE_TOKEN_ADDRESS);
  });

  test("compute-proof requires confirmation", async () => {
    await expect(computeProof(argv, { deployment, cast: fakeCast })).rejects.toThrow("--confirm-compute");
  });

  test("compute-proof returns proof schema and debug", async () => {
    const result = await computeProof(["--confirm-compute", ...argv], { deployment, cast: fakeCast });

    expect(result.version).toBe(1);
    expect(result.challenge.entropyBlockNumber).toBe("992");
    expect(result.proof.nonce).toBe("0x0");
    expect(result.debug.latestBlockNumber).toBe("1000");
    expect(result.debug.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("submit-claim posts proof and returns serverless JSON", async () => {
    const proof = await computeProof(["--confirm-compute", ...argv], { deployment, cast: fakeCast });

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

    expect(result).toEqual({ ok: true, txHash: "0xabc", scanTxUrl: "http://127.0.0.1:8545/tx/0xabc" });
  });
});

function deploymentForJson() {
  return {
    chainId: "31337",
    chainName: deployment.chainName,
    rpcUrls: deployment.rpcUrls,
    faucetAddress: deployment.faucetAddress,
    serverlessUrl: deployment.serverlessUrl,
    scanUrl: deployment.scanUrl,
  };
}
