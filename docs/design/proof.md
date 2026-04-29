# Proof Design

This document defines the Agent Faucet proof model. The goal is to make faucet claims cheap to verify on-chain, reasonably expensive to spam, resistant to replay, and usable by agents through a stateless serverless relay.

## Goals

- Support native token and ERC20 faucet claims with the same proof flow.
- Bind each proof to one recipient, one token, one chain, and one faucet contract.
- Prevent long-range proof precomputation by using recent chain entropy.
- Prevent successful proof replay with bounded per-recipient/token chain state.
- Keep the serverless service stateless.
- Keep CPU-heavy proof computation explicit in the skill flow.

## Non-Goals

- Full Sybil resistance.
- Human identity, CAPTCHA, allowlists, or social verification.
- Serverless-side replay cache or persistent queue.
- Per-proof on-chain storage such as `usedProof[digest]`.
- Dynamic difficulty adjustment in the first version.
- Token discovery from the contract.

## Terminology

- `recipient`: Address that receives the token payout.
- `token`: Token being claimed. `address(0)` represents the native token.
- `entropyBlockNumber`: Recent block number selected by the proof generator.
- `entropyBlockHash`: `blockhash(entropyBlockNumber)`, used as the unpredictable input.
- `nonce`: Value searched by the proof generator.
- `target`: Effective on-chain PoW threshold for the token. Smaller target means harder proof.
- `claimCooldownBlocks`: Effective cooldown, in blocks, for a recipient/token pair after a successful claim.

## Challenge

The challenge is the stable claim identity. It is represented in JSON as:

```json
{
  "chainId": "123",
  "faucetAddress": "0x...",
  "entropyBlockNumber": "123492",
  "token": "0x0000000000000000000000000000000000000000",
  "recipient": "0x..."
}
```

The challenge intentionally does not include:

- `amount`
- `target`
- `claimCooldownBlocks`
- `minEntropyAgeBlocks`
- `maxEntropyAgeBlocks`
- `entropyBlockHash`

Those values are either current on-chain configuration or derived from chain state. They may be included in `debug`, but they are not part of the canonical challenge object.

## Proof File Schema

The stable proof file has four top-level fields:

```json
{
  "version": 1,
  "challenge": {
    "chainId": "123",
    "faucetAddress": "0x...",
    "entropyBlockNumber": "123492",
    "token": "0x0000000000000000000000000000000000000000",
    "recipient": "0x..."
  },
  "proof": {
    "nonce": "0x..."
  },
  "debug": {
    "latestBlockNumber": "123500",
    "entropyBlockHash": "0x...",
    "digest": "0x...",
    "target": "0x...",
    "attempts": "1048576",
    "durationMs": 3821,
    "computedAt": "2026-04-27T00:00:00.000Z"
  }
}
```

`debug` is optional and non-authoritative. Serverless and contract validation must ignore it for security decisions.

The serverless API may accept either the full proof file or only:

```json
{
  "version": 1,
  "challenge": {},
  "proof": {}
}
```

## Digest

The canonical digest is:

```text
keccak256(abi.encode(
  POW_VERSION_HASH,
  chainId,
  faucetAddress,
  recipient,
  token,
  entropyBlockNumber,
  entropyBlockHash,
  nonce
))
```

Where:

```solidity
bytes32 constant POW_VERSION_HASH = keccak256("AGENT_FAUCET_POW_V1");
```

Use `abi.encode`, not `abi.encodePacked`, so TypeScript and Solidity can reproduce the same typed encoding without packed-encoding ambiguity.

The on-chain contract is the source of truth for domain separation:

- `chainId` is computed as `block.chainid`.
- `faucetAddress` is computed as `address(this)`.
- `entropyBlockHash` is computed as `blockhash(entropyBlockNumber)`.

The contract must not accept `chainId`, `faucetAddress`, or `entropyBlockHash` as claim arguments. The serverless service may receive them in JSON, but only to reject proofs for the wrong configured deployment or to log/debug. It must still rely on RPC and contract simulation for authoritative validation.

The proof is valid only if:

```text
uint256(digest) <= effectiveTarget(token)
```

`target` is not included in the digest. The chain uses the current effective target at claim time.

## Canonical Encoding and Validation

The Solidity digest ABI types are:

```text
bytes32 POW_VERSION_HASH
uint256 chainId
address faucetAddress
address recipient
address token
uint64 entropyBlockNumber
bytes32 entropyBlockHash
uint256 nonce
```

JSON validation should use strict canonical input rules:

- `version` must be the JSON number `1`.
- `challenge.chainId` must be a base-10 integer string that fits `uint256`.
- `challenge.entropyBlockNumber` must be a base-10 integer string that fits `uint64`.
- `challenge.faucetAddress`, `challenge.recipient`, and `challenge.token` must be 20-byte hex EVM addresses.
- Address checksum casing is accepted but not required. Implementations should normalize addresses before comparison.
- Native token must be encoded as `0x0000000000000000000000000000000000000000`.
- `proof.nonce` must be a `0x`-prefixed hex string that fits `uint256`.
- `proof.nonce` may contain leading zeroes, but consumers should parse it as an integer value.
- `debug` is optional. Unknown fields inside `debug` are allowed.
- Unknown top-level fields or unknown fields inside `challenge` and `proof` should be rejected by the stable schema.

TypeScript consumers should expose strict parsers that normalize these values into typed internal values before hashing, simulation, or submission. The relayer parser lives in `serverless/src/proof.ts`; the installable skill keeps its local parser under `skills/agent-faucet/scripts/lib/`.

## Entropy Window

The proof generator chooses a recent `entropyBlockNumber`. The contract checks its age at claim time:

```text
age = block.number - entropyBlockNumber
minEntropyAgeBlocks <= age <= maxEntropyAgeBlocks
blockhash(entropyBlockNumber) != 0
```

The age comparisons are inclusive. The contract should reject `entropyBlockNumber >= block.number` before subtraction to avoid underflow and to produce a precise error.

`maxEntropyAgeBlocks` must be no greater than `255`. EVM `blockhash` can only read recent block hashes, and keeping the maximum below the lookup boundary avoids ambiguous zero blockhash behavior at the edge.

`minEntropyAgeBlocks` prevents use of blocks that are too new and may be unstable or not survive normal submission delay.

`maxEntropyAgeBlocks` prevents use of old blockhashes that allow long-running precomputation. It also must stay within the EVM blockhash lookup window.

The exact values are deployment parameters. For the initial target chain assumption of 1 second blocks and about 5 seconds submission delay, the values should be chosen after measurement rather than hard-coded in the design.

`minEntropyAgeBlocks` is not a full finality guarantee. It is a practical buffer against normal relay delay and short reorgs. Deployments that need stronger reorg protection should increase this value after measuring the target chain.

## Replay Protection

The challenge and digest alone do not prevent replay. Replay prevention is enforced by contract state:

```solidity
mapping(address recipient => mapping(address token => uint64 nextClaimBlock)) nextClaimBlock;
```

Before a claim succeeds:

```text
block.number >= nextClaimBlock[recipient][token]
```

After a claim succeeds:

```text
nextClaimBlock[recipient][token] = uint64(block.number + effectiveCooldownBlocks(token))
```

This prevents:

- Reusing the same proof for the same recipient/token.
- Computing another proof for the same recipient/token before cooldown expires.

It does not prevent:

- A different recipient from claiming with its own proof.
- Sybil behavior through many recipient addresses.
- Another caller submitting a proof on behalf of the same recipient.

The last case is acceptable because the payout is bound to `recipient`. A third party can at most pay gas or consume relayer capacity while sending funds to the intended recipient.

## Claim Function

The contract claim interface is:

```solidity
function claim(
  address recipient,
  address token,
  uint64 entropyBlockNumber,
  uint256 nonce
) external;
```

Anyone may call `claim`. The serverless relayer is not an authorization boundary.

Validation order should be functionally equivalent to:

1. Contract is not paused.
2. Token is enabled.
3. Current block is not before `nextClaimBlock[recipient][token]`.
4. `entropyBlockNumber` is older than or equal to `minEntropyAgeBlocks`.
5. `entropyBlockNumber` is newer than or equal to `maxEntropyAgeBlocks`.
6. `blockhash(entropyBlockNumber)` is available.
7. Digest satisfies current effective target.
8. `nextClaimBlock` is updated from the current block.
9. Fixed effective token amount is transferred to `recipient`.

If transfer fails, the claim reverts and cooldown is not consumed.

`claim` must be protected with `nonReentrant`. The contract updates cooldown before external transfer and relies on revert rollback if the transfer fails. The guard avoids reentrant same-token or cross-token claims through native recipient callbacks or malicious ERC20 behavior. The design does not try to support reentrant claiming as a feature.

## Configuration

Global config contains:

- `minEntropyAgeBlocks`
- `maxEntropyAgeBlocks`
- `defaultCooldownBlocks`
- `nativeTransferGasLimit`
- `defaultAmount`
- `defaultTarget`

Token config contains:

- `enabled`
- `cooldownBlocks`
- `amount`
- `target`

For token config:

- `cooldownBlocks == 0` means inherit `defaultCooldownBlocks`.
- `amount == 0` means inherit `defaultAmount`.
- `target == 0` means inherit `defaultTarget`.
- `enabled` is explicit and never inherited.

Global defaults must be valid and nonzero. Token override values of zero are not valid effective values; they mean default inheritance.

Because amount, target, and cooldown are not digest-bound, a proof is evaluated against the current on-chain configuration at claim time. If owner tightens target after proof computation, the proof may fail. If owner loosens target or increases amount, a recently computed proof may succeed under the new configuration. This is acceptable because config changes are privileged, proof validity is short-lived, and serverless simulation should surface the current result before sending.

## Native Token

`address(0)` represents the native token. Native claims are enabled or disabled through the same token config mapping as ERC20 claims.

Native transfer uses a low-level call with a configured gas limit:

```solidity
(bool ok, ) = payable(recipient).call{value: amount, gas: nativeTransferGasLimit}("");
```

If the call reverts or exceeds the gas limit, the claim reverts.

## ERC20 Tokens

ERC20 claims use OpenZeppelin `SafeERC20.safeTransfer`.

When enabling a nonzero token address, the contract should reject addresses with no code. Fee-on-transfer tokens are not guaranteed to deliver exactly the configured amount.

## Serverless Role

The serverless service is stateless and supports one deployment.

It receives a proof, validates JSON shape, checks `chainId` and `faucetAddress` against environment configuration, simulates the claim, and sends the transaction through the configured wallet client.

The relayer is not a contract authorization boundary, but it still needs operational protection because otherwise valid claims can consume relayer gas. The first deployment should include:

- Request body size limits.
- HTTP method and content-type checks.
- Basic platform or edge rate limits where available.
- A small relayer gas balance with operational refills rather than a large hot wallet.
- Simulation before every transaction.
- Clear refusal errors when local policy rejects a request before chain submission.

The first version does not implement distributed nonce locking or queueing. A purely stateless serverless function cannot reliably coordinate pending nonces across concurrent instances. The deployment should assume low traffic, rely on the configured wallet/RPC/provider behavior, and use platform-level rate limits to reduce concurrent sends. If high request volume is expected, that deployment should use a managed transaction relay or add an explicit queue/stateful nonce coordinator outside this protocol.

Local policy rejection is allowed even if a proof might be valid on-chain. Example response:

```json
{
  "ok": false,
  "code": "RELAYER_POLICY_REJECTED",
  "message": "Relayer is temporarily refusing claims"
}
```

This does not change contract semantics. A caller with gas may still submit a valid proof directly to the contract.

It returns:

```json
{
  "ok": true,
  "txHash": "0x..."
}
```

or:

```json
{
  "ok": false,
  "code": "INVALID_PROOF",
  "message": "Proof does not satisfy current target"
}
```

Serverless must not rely on `debug`. It should recompute or ask the chain for all authoritative values.

## Skill Role

The skill provides stable Bun + TypeScript scripts:

- `read-config.ts`: Reads chain configuration and claim readiness.
- `estimate-proof-time.ts`: Estimates the current token's proof computation time from its configured difficulty, thread count, and a local baseline. It does not search for a proof and does not require user confirmation.
- `compute-proof.ts`: Computes the PoW proof. This is CPU-intensive, supports multi-threaded search, and requires user confirmation before running.
- `submit-claim.ts`: Submits an existing proof to the configured serverless endpoint.

`compute-proof.ts` writes the proof schema described above. `submit-claim.ts` does not recompute proof.

## Testing Requirements

The first implementation must test:

- Happy path native claim.
- Happy path ERC20 claim.
- Same proof replay fails after first success.
- Different proof for same recipient/token fails before cooldown.
- Same recipient can claim after cooldown.
- Different recipient can claim independently.
- Entropy too recent fails.
- Entropy too old fails.
- Future or current entropy block fails with a precise error.
- Invalid target comparison fails.
- TypeScript digest matches Solidity digest for the same inputs.
- Reentrant native recipient cannot claim again during transfer.

The TypeScript digest tests and contract tests should include at least one complete test vector:

- `version`
- `challenge`
- `entropyBlockHash`
- `nonce`
- expected ABI-encoded digest
- target value
- expected validity result

The exact test vector should be kept stable as a regression fixture.

These tests are the minimum needed to prove the design's core safety properties.

## Open Parameters

These values are intentionally not fixed in this design:

- `minEntropyAgeBlocks`
- `maxEntropyAgeBlocks`
- Default `claimCooldownBlocks`, currently expected to be about one day.
- Default `target`
- Default `amount`
- `nativeTransferGasLimit`

They should be finalized per deployment after measuring target chain block timing, submission delay, desired claim cost, and operational budget.
