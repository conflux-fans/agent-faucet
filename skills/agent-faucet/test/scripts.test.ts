import { describe, expect, test } from "bun:test";
import { computeProof } from "../scripts/compute-proof";
import { estimateExpectedAttempts, estimateProofTime } from "../scripts/estimate-proof-time";
import { defaultMaxAttemptsForTarget } from "../scripts/lib/difficulty";
import { NATIVE_TOKEN_ADDRESS } from "../scripts/lib/evm";
import { keccak256Hex } from "../scripts/lib/keccak";
import { computeDigest } from "../scripts/lib/pow";
import { searchProofNonce } from "../scripts/lib/proof-search";
import { parseThreadCount } from "../scripts/lib/threads";
import { readConfig } from "../scripts/read-config";
import { submitClaim } from "../scripts/submit-claim";

const maxUint256 = (1n << 256n) - 1n;

const deployment = {
  chainId: 31337n,
  chainName: "Local",
  rpcUrl: "http://127.0.0.1:8545",
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

  test("estimate-proof-time returns dynamic guidance from token target", async () => {
    const target = maxUint256 / 100_000n;
    const result = await estimateProofTime(["--chain-id", "31337", "--token", "native"], {
      deployment,
      availableParallelism: () => 8,
      cast: async (args) => {
        if (args[0] === "call" && args[2].startsWith("getEffectiveTokenConfig")) {
          return `(true, 1, ${target}, 86400)`;
        }
        throw new Error(`Unexpected cast args: ${args.join(" ")}`);
      },
    });

    expect(result.canEstimate).toBe(true);
    expect(result.difficulty.expectedAttempts).toBe("100000");
    expect(result.difficulty.target).toBe(`0x${target.toString(16)}`);
    expect(result.threads).toEqual({ selected: 8, allCpu: 8, halfCpu: 4, singleThread: 1 });
    expect(result.estimate.expectedMs).toBe("250");
    expect(result.estimates.singleThread.expectedMs).toBe("2000");
    expect(result.userGuidanceZh).toContain("默认使用 8 个逻辑 CPU");
    expect(result.userGuidanceZh).toContain("1 线程，约 2 秒");
  });

  test("estimate-proof-time reports 10x target near one million expected attempts", async () => {
    const target = maxUint256 / 1_000_000n;
    const result = await estimateProofTime(["--chain-id", "31337", "--token", "native", "--threads", "1"], {
      deployment,
      availableParallelism: () => 8,
      cast: async (args) => {
        if (args[0] === "call" && args[2].startsWith("getEffectiveTokenConfig")) {
          return `(true, 1, ${target}, 86400)`;
        }
        throw new Error(`Unexpected cast args: ${args.join(" ")}`);
      },
    });

    expect(result.difficulty.expectedAttempts).toBe("1000000");
    expect(result.estimate.expectedMs).toBe("20000");
  });

  test("estimateExpectedAttempts handles easy max target", () => {
    expect(estimateExpectedAttempts(maxUint256)).toBe(1n);
  });

  test("default max-attempts scales from target difficulty", () => {
    expect(defaultMaxAttemptsForTarget(maxUint256 / 100_000n)).toBe(1_000_000n);
    expect(defaultMaxAttemptsForTarget(maxUint256 / 1_000_000n)).toBe(10_000_000n);
  });

  test("multi-thread nonce partition keeps max-attempts global", () => {
    const checked: bigint[] = [];
    for (let worker = 0n; worker < 4n; worker++) {
      const result = searchProofNonce({
        chainId: 31337n,
        faucetAddress: deployment.faucetAddress,
        recipient: "0x2000000000000000000000000000000000000000",
        token: NATIVE_TOKEN_ADDRESS,
        entropyBlockNumber: 992n,
        entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        target: 0n,
        maxAttempts: 10n,
        startNonce: worker,
        step: 4n,
        digestFn: (input) => {
          checked.push(input.nonce);
          return "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        },
      });
      expect(result.nonce).toBeNull();
    }

    expect(checked.map(String).sort((a, b) => Number(a) - Number(b))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    expect(new Set(checked.map(String)).size).toBe(10);
  });

  test("invalid thread count rejects", () => {
    expect(() => parseThreadCount("0")).toThrow("--threads");
    expect(() => parseThreadCount("1.5")).toThrow("--threads");
  });

  test("compute-proof requires confirmation", async () => {
    await expect(computeProof(argv, { deployment, cast: fakeCast })).rejects.toThrow("--confirm-compute");
  });

  test("compute-proof returns proof schema and debug", async () => {
    const result = await computeProof(["--confirm-compute", "--threads", "1", ...argv], { deployment, cast: fakeCast });

    expect(result.version).toBe(1);
    expect(result.challenge.entropyBlockNumber).toBe("992");
    expect(result.proof.nonce).toBe("0x0");
    expect(result.debug.latestBlockNumber).toBe("1000");
    expect(result.debug.threads).toBe(1);
    expect(result.debug.maxAttempts).toBe("10");
    expect(result.debug.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("compute-proof can find a nonce from a non-zero worker partition", async () => {
    const targetNonce = findMinimalDigestNonceForWorker(4n, 1n);
    const target = BigInt(
      computeDigest({
        chainId: 31337n,
        faucetAddress: deployment.faucetAddress,
        recipient: "0x2000000000000000000000000000000000000000",
        token: NATIVE_TOKEN_ADDRESS,
        entropyBlockNumber: 992n,
        entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        nonce: targetNonce,
      }),
    );
    const cast = async (args: string[]) => {
      if (args[0] === "block-number") {
        return "1000";
      }
      if (args[0] === "block") {
        return "0x1111111111111111111111111111111111111111111111111111111111111111";
      }
      if (args[0] === "call") {
        const signature = args[2];
        if (signature.startsWith("getGlobalConfig")) {
          return `(8, 45, 86400, 30000, 1, ${target})`;
        }
        if (signature.startsWith("getEffectiveTokenConfig")) {
          return `(true, 1, ${target}, 86400)`;
        }
      }
      throw new Error(`Unexpected cast args: ${args.join(" ")}`);
    };

    const result = await computeProof(
      ["--confirm-compute", "--threads", "4", "--max-attempts", (targetNonce + 1n).toString(), ...argv],
      { deployment, cast },
    );

    expect(BigInt(result.proof.nonce)).toBe(targetNonce);
    expect(targetNonce % 4n).toBe(1n);
    expect(result.debug.threads).toBe(4);
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

function findMinimalDigestNonceForWorker(step: bigint, worker: bigint): bigint {
  let bestNonce = 0n;
  let bestDigest = maxUint256;
  for (let nonce = 0n; nonce < 128n; nonce++) {
    const digest = BigInt(
      computeDigest({
        chainId: 31337n,
        faucetAddress: deployment.faucetAddress,
        recipient: "0x2000000000000000000000000000000000000000",
        token: NATIVE_TOKEN_ADDRESS,
        entropyBlockNumber: 992n,
        entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        nonce,
      }),
    );
    if (digest < bestDigest) {
      bestDigest = digest;
      bestNonce = nonce;
      if (nonce % step === worker) {
        return nonce;
      }
    }
  }
  throw new Error("Unable to find non-zero worker nonce fixture");
}

function deploymentForJson() {
  return {
    chainId: "31337",
    chainName: deployment.chainName,
    rpcUrl: deployment.rpcUrl,
    faucetAddress: deployment.faucetAddress,
    serverlessUrl: deployment.serverlessUrl,
    scanUrl: deployment.scanUrl,
  };
}
