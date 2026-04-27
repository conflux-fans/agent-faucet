import { parseAbi } from "viem";

export const faucetAbi = parseAbi([
  "function claim(address recipient,address token,uint64 entropyBlockNumber,uint256 nonce)",
  "function computeDigest(address recipient,address token,uint64 entropyBlockNumber,bytes32 entropyBlockHash,uint256 nonce) view returns (bytes32)",
  "function getGlobalConfig() view returns ((uint64 minEntropyAgeBlocks,uint64 maxEntropyAgeBlocks,uint64 defaultCooldownBlocks,uint64 nativeTransferGasLimit,uint256 defaultAmount,uint256 defaultTarget))",
  "function getEffectiveTokenConfig(address token) view returns ((bool enabled,uint256 amount,uint256 target,uint64 cooldownBlocks))",
  "function nextClaimBlock(address recipient,address token) view returns (uint64)",
  "error TokenDisabled(address token)",
  "error ClaimCooldownActive(address recipient,address token,uint64 nextClaimBlock,uint256 currentBlock)",
  "error EntropyBlockNotPast(uint64 entropyBlockNumber,uint256 currentBlock)",
  "error EntropyTooRecent(uint64 entropyBlockNumber,uint256 currentBlock,uint64 minAge)",
  "error EntropyTooOld(uint64 entropyBlockNumber,uint256 currentBlock,uint64 maxAge)",
  "error EntropyUnavailable(uint64 entropyBlockNumber)",
  "error InvalidProof(bytes32 digest,uint256 target)",
]);
