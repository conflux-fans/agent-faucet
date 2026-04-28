import { Address, NATIVE_TOKEN_ADDRESS, PROOF_VERSION, normalizeAddress, parseUint } from "./evm";

export interface ProofFile {
  version: 1;
  challenge: {
    chainId: string;
    faucetAddress: string;
    entropyBlockNumber: string;
    token: string;
    recipient: string;
  };
  proof: {
    nonce: string;
  };
  debug?: Record<string, unknown>;
}

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
  if (!isRecord(input) || input.version !== PROOF_VERSION || !isRecord(input.challenge) || !isRecord(input.proof)) {
    throw new Error("Invalid proof file");
  }
  const challenge = input.challenge;
  const proof = input.proof;
  const raw: ProofFile = {
    version: PROOF_VERSION,
    challenge: {
      chainId: requireString(challenge.chainId, "challenge.chainId"),
      faucetAddress: requireString(challenge.faucetAddress, "challenge.faucetAddress"),
      entropyBlockNumber: requireString(challenge.entropyBlockNumber, "challenge.entropyBlockNumber"),
      token: requireString(challenge.token, "challenge.token"),
      recipient: requireString(challenge.recipient, "challenge.recipient"),
    },
    proof: {
      nonce: requireString(proof.nonce, "proof.nonce"),
    },
  };
  if (input.debug !== undefined) {
    if (!isRecord(input.debug)) {
      throw new Error("debug must be an object");
    }
    raw.debug = input.debug;
  }

  const entropyBlockNumber = parseUint(raw.challenge.entropyBlockNumber, "challenge.entropyBlockNumber");
  const nonce = parseUint(raw.proof.nonce, "proof.nonce");
  if (entropyBlockNumber > (1n << 64n) - 1n) {
    throw new Error("challenge.entropyBlockNumber exceeds uint64");
  }
  if (nonce > (1n << 256n) - 1n) {
    throw new Error("proof.nonce exceeds uint256");
  }

  return {
    version: PROOF_VERSION,
    challenge: {
      chainId: parseUint(raw.challenge.chainId, "challenge.chainId"),
      faucetAddress: normalizeAddress(raw.challenge.faucetAddress, "challenge.faucetAddress"),
      entropyBlockNumber,
      token: normalizeAddress(raw.challenge.token === "native" ? NATIVE_TOKEN_ADDRESS : raw.challenge.token, "challenge.token"),
      recipient: normalizeAddress(raw.challenge.recipient, "challenge.recipient"),
    },
    proof: { nonce },
    raw,
  };
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
