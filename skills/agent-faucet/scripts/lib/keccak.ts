import sha3 from "./vendor/js-sha3.cjs";

export function keccak256Hex(data: string | Uint8Array | number[] | ArrayBuffer): `0x${string}` {
  return `0x${sha3.keccak256(data)}`;
}
