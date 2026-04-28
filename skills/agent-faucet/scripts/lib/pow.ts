import {
  Address,
  Hex,
  POW_VERSION_HASH,
  abiWordAddress,
  abiWordBytes32,
  abiWordUint,
  bigintToHex,
  concatBytes,
} from "./evm";
import { keccak256Hex } from "./keccak";

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
  return keccak256Hex(
    concatBytes([
      abiWordBytes32(POW_VERSION_HASH),
      abiWordUint(input.chainId),
      abiWordAddress(input.faucetAddress),
      abiWordAddress(input.recipient),
      abiWordAddress(input.token),
      abiWordUint(input.entropyBlockNumber, 64),
      abiWordBytes32(input.entropyBlockHash),
      abiWordUint(input.nonce),
    ]),
  );
}

export function satisfiesTarget(digest: Hex, target: bigint): boolean {
  return BigInt(digest) <= target;
}

export { bigintToHex };
