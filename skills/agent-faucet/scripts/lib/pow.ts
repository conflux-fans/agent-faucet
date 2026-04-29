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

export function createDigestComputer(input: Omit<DigestInput, "nonce">): (nonce: bigint) => Hex {
  const encoded = new Uint8Array(32 * 8);
  writeBytes(encoded, 0, abiWordBytes32(POW_VERSION_HASH));
  writeUintWord(encoded, 32, input.chainId);
  writeBytes(encoded, 64, abiWordAddress(input.faucetAddress));
  writeBytes(encoded, 96, abiWordAddress(input.recipient));
  writeBytes(encoded, 128, abiWordAddress(input.token));
  writeUintWord(encoded, 160, input.entropyBlockNumber, 64);
  writeBytes(encoded, 192, abiWordBytes32(input.entropyBlockHash));

  return (nonce: bigint) => {
    writeUintWord(encoded, 224, nonce);
    return keccak256Hex(encoded);
  };
}

export function satisfiesTarget(digest: Hex, target: bigint): boolean {
  return BigInt(digest) <= target;
}

export function targetToPaddedHex(target: bigint): string {
  if (target < 0n || target > (1n << 256n) - 1n) {
    throw new Error("target does not fit uint256");
  }
  return target.toString(16).padStart(64, "0");
}

export function satisfiesPaddedTarget(digest: Hex, paddedTarget: string): boolean {
  return digest.slice(2) <= paddedTarget;
}

function writeBytes(output: Uint8Array, offset: number, bytes: Uint8Array): void {
  output.set(bytes, offset);
}

function writeUintWord(output: Uint8Array, offset: number, value: bigint, bits = 256): void {
  const max = 1n << BigInt(bits);
  if (value < 0n || value >= max) {
    throw new Error(`uint${bits} value out of range`);
  }
  let remaining = value;
  output.fill(0, offset, offset + 32);
  for (let index = offset + 31; remaining > 0n; index--) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

export { bigintToHex };
