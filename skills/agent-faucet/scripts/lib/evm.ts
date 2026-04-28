import { keccak256Hex } from "./keccak";

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const PROOF_VERSION = 1;
export const POW_VERSION_HASH = keccak256Hex(new TextEncoder().encode("AGENT_FAUCET_POW_V1"));

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function isHex(value: string): value is Hex {
  return HEX_RE.test(value);
}

export function normalizeAddress(value: string, label = "address"): Address {
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value.toLowerCase() as Address;
}

export function normalizeToken(value: string): Address {
  if (value === "native") {
    return NATIVE_TOKEN_ADDRESS;
  }
  return normalizeAddress(value, "token");
}

export function normalizeBytes32(value: string, label = "bytes32"): Hex {
  if (!BYTES32_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value.toLowerCase() as Hex;
}

export function bigintToHex(value: bigint): Hex {
  if (value < 0n || value > (1n << 256n) - 1n) {
    throw new Error("Value does not fit uint256");
  }
  return `0x${value.toString(16)}` as Hex;
}

export function parseUint(value: string, label: string): bigint {
  const trimmed = value.trim();
  if (/^(0|[1-9][0-9]*)$/.test(trimmed) || /^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

export function hexToBytes(value: Hex): Uint8Array {
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`Invalid hex data: ${value}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function abiWordUint(value: bigint, bits = 256): Uint8Array {
  const max = 1n << BigInt(bits);
  if (value < 0n || value >= max) {
    throw new Error(`uint${bits} value out of range`);
  }
  return hexToBytes(`0x${value.toString(16).padStart(64, "0")}`);
}

export function abiWordAddress(value: Address): Uint8Array {
  return hexToBytes(`0x${value.slice(2).padStart(64, "0")}`);
}

export function abiWordBytes32(value: Hex): Uint8Array {
  return hexToBytes(normalizeBytes32(value));
}
