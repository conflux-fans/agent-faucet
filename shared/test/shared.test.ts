import { describe, expect, test } from "bun:test";
import {
  NATIVE_TOKEN_ADDRESS,
  computeDigest,
  parseDeploymentsFile,
  parseProofFile,
  satisfiesTarget,
} from "../src";

const canonicalProof = {
  version: 1,
  challenge: {
    chainId: "31337",
    faucetAddress: "0x1000000000000000000000000000000000000000",
    entropyBlockNumber: "992",
    token: NATIVE_TOKEN_ADDRESS,
    recipient: "0x2000000000000000000000000000000000000000",
  },
  proof: {
    nonce: "0x07",
  },
  debug: {
    latestBlockNumber: "1000",
    entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    digest: "0x2222222222222222222222222222222222222222222222222222222222222222",
    target: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    attempts: "8",
    durationMs: 1,
    computedAt: "2026-04-27T00:00:00.000Z",
  },
};

describe("shared proof schema", () => {
  test("accepts canonical proof and normalizes values", () => {
    const parsed = parseProofFile(canonicalProof);

    expect(parsed.challenge.chainId).toBe(31337n);
    expect(parsed.challenge.entropyBlockNumber).toBe(992n);
    expect(parsed.proof.nonce).toBe(7n);
    expect(parsed.challenge.token).toBe(NATIVE_TOKEN_ADDRESS);
  });

  test("rejects unknown core fields", () => {
    expect(() => parseProofFile({ ...canonicalProof, extra: true })).toThrow();
    expect(() =>
      parseProofFile({
        ...canonicalProof,
        challenge: { ...canonicalProof.challenge, extra: true },
      }),
    ).toThrow();
  });

  test("computes deterministic digest and compares target", () => {
    const digest = computeDigest({
      chainId: 31337n,
      faucetAddress: "0x1000000000000000000000000000000000000000",
      recipient: "0x2000000000000000000000000000000000000000",
      token: NATIVE_TOKEN_ADDRESS,
      entropyBlockNumber: 992n,
      entropyBlockHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      nonce: 7n,
    });

    expect(digest).toBe("0x289c9202cf66356526b88eced5e46dea4884e08cb8a316457b98f043e27f8b71");
    expect(satisfiesTarget(digest, (1n << 256n) - 1n)).toBe(true);
    expect(satisfiesTarget(digest, 0n)).toBe(false);
  });

  test("parses deployment index", () => {
    const deployments = parseDeploymentsFile({
      version: 1,
      deployments: [
        {
          chainId: "31337",
          chainName: "Local",
          faucetAddress: "0x1000000000000000000000000000000000000000",
          serverlessUrl: "http://127.0.0.1:3000/api/claim",
        },
      ],
    });

    expect(deployments[0].chainId).toBe(31337n);
  });
});
