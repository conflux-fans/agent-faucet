import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { POW_VERSION_HASH } from "./constants";

export interface DigestInput {
  chainId: bigint;
  faucetAddress: Address;
  recipient: Address;
  token: Address;
  entropyBlockNumber: bigint;
  entropyBlockHash: Hex;
  nonce: bigint;
}

export function computeDigest(input: DigestInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [
        POW_VERSION_HASH,
        input.chainId,
        input.faucetAddress,
        input.recipient,
        input.token,
        input.entropyBlockNumber,
        input.entropyBlockHash,
        input.nonce,
      ],
    ),
  );
}

export function satisfiesTarget(digest: Hex, target: bigint): boolean {
  return BigInt(digest) <= target;
}
