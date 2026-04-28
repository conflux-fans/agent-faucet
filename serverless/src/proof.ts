import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { z } from "zod";

export const PROOF_VERSION = 1;
export const NATIVE_TOKEN_ADDRESS = zeroAddress;

const decimalString = z.string().regex(/^(0|[1-9][0-9]*)$/);
const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/);

const addressString = z.string().refine((value) => isAddress(value, { strict: false }), {
  message: "Expected a 20-byte EVM address",
});

export const challengeSchema = z
  .object({
    chainId: decimalString,
    faucetAddress: addressString,
    entropyBlockNumber: decimalString,
    token: addressString,
    recipient: addressString,
  })
  .strict();

export const proofBodySchema = z
  .object({
    nonce: hexString,
  })
  .strict();

export const proofFileSchema = z
  .object({
    version: z.literal(PROOF_VERSION),
    challenge: challengeSchema,
    proof: proofBodySchema,
    debug: z
      .object({
        latestBlockNumber: decimalString.optional(),
        entropyBlockHash: hexString.optional(),
        digest: hexString.optional(),
        target: hexString.optional(),
        attempts: decimalString.optional(),
        durationMs: z.number().nonnegative().optional(),
        computedAt: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict();

export type ProofFile = z.infer<typeof proofFileSchema>;

export interface ParsedProof {
  version: 1;
  challenge: {
    chainId: bigint;
    faucetAddress: Address;
    entropyBlockNumber: bigint;
    token: Address;
    recipient: Address;
  };
  proof: {
    nonce: bigint;
  };
  raw: ProofFile;
}

export function parseProofFile(input: unknown): ParsedProof {
  const raw = proofFileSchema.parse(input);
  const entropyBlockNumber = BigInt(raw.challenge.entropyBlockNumber);
  const nonce = BigInt(raw.proof.nonce);

  if (entropyBlockNumber > (1n << 64n) - 1n) {
    throw new Error("challenge.entropyBlockNumber exceeds uint64");
  }
  if (nonce > (1n << 256n) - 1n) {
    throw new Error("proof.nonce exceeds uint256");
  }

  return {
    version: PROOF_VERSION,
    challenge: {
      chainId: BigInt(raw.challenge.chainId),
      faucetAddress: getAddress(raw.challenge.faucetAddress),
      entropyBlockNumber,
      token: getAddress(raw.challenge.token),
      recipient: getAddress(raw.challenge.recipient),
    },
    proof: {
      nonce,
    },
    raw,
  };
}
