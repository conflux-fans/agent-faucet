import { Address, Hex } from "./evm";
import { createDigestComputer, DigestInput, satisfiesPaddedTarget, targetToPaddedHex } from "./pow";

export interface ProofSearchInput extends Omit<DigestInput, "nonce"> {
  target: bigint;
  maxAttempts: bigint;
  startNonce?: bigint;
  step?: bigint;
  shouldStop?: () => boolean;
  onAttempts?: (attempts: bigint) => void;
  progressInterval?: bigint;
  stopCheckInterval?: bigint;
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

  const computeDigest = input.digestFn ?? createNonceDigest(input);
  const progressInterval = input.progressInterval ?? 0n;
  const stopCheckInterval = input.shouldStop ? input.stopCheckInterval ?? 4096n : 0n;
  const paddedTarget = targetToPaddedHex(input.target);
  let attempts = 0n;
  let pendingAttempts = 0n;
  let attemptsUntilStopCheck = 0n;

  const flushAttempts = () => {
    if (pendingAttempts > 0n) {
      input.onAttempts?.(pendingAttempts);
      pendingAttempts = 0n;
    }
  };

  for (let nonce = startNonce; nonce < input.maxAttempts; nonce += step) {
    if (stopCheckInterval > 0n && attemptsUntilStopCheck === 0n && input.shouldStop?.()) {
      break;
    }
    attemptsUntilStopCheck = stopCheckInterval > 0n ? (attemptsUntilStopCheck + 1n) % stopCheckInterval : 0n;

    attempts++;
    pendingAttempts++;
    const digest = computeDigest({
      chainId: input.chainId,
      faucetAddress: input.faucetAddress as Address,
      recipient: input.recipient as Address,
      token: input.token as Address,
      entropyBlockNumber: input.entropyBlockNumber,
      entropyBlockHash: input.entropyBlockHash,
      nonce,
    });

    if (satisfiesPaddedTarget(digest, paddedTarget)) {
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

function createNonceDigest(input: Omit<ProofSearchInput, "digestFn">): (digestInput: DigestInput) => Hex {
  const fastDigest = createDigestComputer({
    chainId: input.chainId,
    faucetAddress: input.faucetAddress,
    recipient: input.recipient,
    token: input.token,
    entropyBlockNumber: input.entropyBlockNumber,
    entropyBlockHash: input.entropyBlockHash,
  });
  return (digestInput: DigestInput) => fastDigest(digestInput.nonce);
}
