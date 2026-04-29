import { Address, Hex } from "./evm";
import { computeDigest, DigestInput, satisfiesTarget } from "./pow";

export interface ProofSearchInput extends Omit<DigestInput, "nonce"> {
  target: bigint;
  maxAttempts: bigint;
  startNonce?: bigint;
  step?: bigint;
  shouldStop?: () => boolean;
  onAttempts?: (attempts: bigint) => void;
  progressInterval?: bigint;
  digestFn?: (input: DigestInput) => Hex;
}

export interface ProofSearchResult {
  nonce: bigint | null;
  digest: Hex | null;
  attempts: bigint;
}

export function searchProofNonce(input: ProofSearchInput): ProofSearchResult {
  const startNonce = input.startNonce ?? 0n;
  const step = input.step ?? 1n;
  if (startNonce < 0n) {
    throw new Error("startNonce must be non-negative");
  }
  if (step <= 0n) {
    throw new Error("step must be greater than 0");
  }

  const digestFn = input.digestFn ?? computeDigest;
  const progressInterval = input.progressInterval ?? 0n;
  let attempts = 0n;
  let pendingAttempts = 0n;

  const flushAttempts = () => {
    if (pendingAttempts > 0n) {
      input.onAttempts?.(pendingAttempts);
      pendingAttempts = 0n;
    }
  };

  for (let nonce = startNonce; nonce < input.maxAttempts; nonce += step) {
    if (input.shouldStop?.()) {
      break;
    }

    attempts++;
    pendingAttempts++;
    const digest = digestFn({
      chainId: input.chainId,
      faucetAddress: input.faucetAddress as Address,
      recipient: input.recipient as Address,
      token: input.token as Address,
      entropyBlockNumber: input.entropyBlockNumber,
      entropyBlockHash: input.entropyBlockHash,
      nonce,
    });

    if (satisfiesTarget(digest, input.target)) {
      flushAttempts();
      return { nonce, digest, attempts };
    }

    if (progressInterval > 0n && pendingAttempts >= progressInterval) {
      flushAttempts();
    }
  }

  flushAttempts();
  return { nonce: null, digest: null, attempts };
}
