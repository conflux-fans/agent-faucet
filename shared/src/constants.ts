import { keccak256, stringToHex, zeroAddress } from "viem";

export const PROOF_VERSION = 1;
export const POW_VERSION_HASH = keccak256(stringToHex("AGENT_FAUCET_POW_V1"));
export const NATIVE_TOKEN_ADDRESS = zeroAddress;
