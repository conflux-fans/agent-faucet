---
# This section is managed by the CLI. Do not edit manually.
id: "09830485-5d4a-4255-bad1-8e1f83e404e9"
title: "PRD: Agent Blockchain Faucet"
status: "closed"
priority: "high"
labels: ["FEATURE REQUEST"]
created_at: "2026-04-27T07:14:00Z"
updated_at: "2026-04-28T02:18:00Z"
---

## Problem Statement

Agent 在测试链或开发链上执行链上任务时，经常需要少量 native token 作为 gas，也可能需要少量 ERC20 token 来测试代币流程。现有 faucet 往往面向人类交互，依赖网页、钱包连接、验证码、社交登录或人工操作，不适合 agent 稳定、可脚本化地使用。

本项目要提供一个面向 agent 的 blockchain faucet：agent 可以通过安装 skill、读取静态部署索引、在本地计算轻量工作量证明，并通过 serverless 服务或直接链上调用获得固定额度 token。系统需要防止简单重放和低成本滥用，同时保持可用性，避免把过多状态或复杂交互放到无状态 serverless 服务中。

## Solution

实现一个 monorepo，包含链上合约、无状态 serverless 服务、agent skill、共享 TS 模块、静态介绍前端和最小部署索引。

链上合约是安全边界。合约接受基于 recent blockhash 的 PoW challenge，使用 `recipient + token` 粒度的 `claimCooldownBlocks` 防重放和限频，支持 native token 与 ERC20 token 固定额度发放。合约 owner 可以配置全局默认项和 token override，暂停领取，回收资金，并调整 PoW target、发放额度和 cooldown。

serverless 服务是可用性层，不是权限边界。它是无状态的，只支持一个部署，通过环境变量配置 chain、faucet、RPC 和 relayer key。它接收已经计算好的 proof，发送前做 `eth_call` 模拟，成功后用 SDK wallet interface 发交易并返回交易哈希。

skill 是 agent 的主要入口。skill 内置静态 `deployments.json`，提供稳定 Bun + TS CLI。CPU 密集的 PoW 计算被拆成独立脚本，并要求 agent 在运行前取得用户确认；其他脚本只做轻量 RPC 读取或 serverless POST。

前端只做静态介绍页，说明 skill 能做什么和如何安装，不连接钱包，不读链上，不展示部署列表。

## User Stories

1. As an agent, I want to install a faucet skill, so that I can request bootstrap chain funds without using a human-oriented web faucet.
2. As an agent, I want the skill to contain a static deployment index, so that I can discover the chain, faucet address, and serverless URL needed for claiming.
3. As an agent, I want to claim native token by default, so that I can obtain gas for later transactions.
4. As an agent, I want to pass an ERC20 token address explicitly, so that I can request a configured test token when I already know which token I need.
5. As an agent, I want to read faucet configuration from chain before computing proof, so that I know whether the token is enabled and what target applies.
6. As an agent, I want a lightweight read-config script, so that I can inspect claim readiness without doing expensive computation.
7. As an agent, I want PoW computation isolated in a separate script, so that I can ask the user for confirmation before spending CPU.
8. As an agent, I want the proof output to use a stable JSON schema, so that it can be passed between scripts reliably.
9. As an agent, I want the proof file to include debug information, so that failures can be inspected without trusting debug fields for security.
10. As an agent, I want submit-claim to post an existing proof without recomputing it, so that the expensive and cheap steps stay separate.
11. As an agent, I want serverless to return only a transaction hash on success, so that I can track the transaction myself.
12. As an agent, I want serverless errors to be structured, so that I can decide whether to recompute, wait, or fix input.
13. As an agent, I want the proof to bind to my recipient address, so that intercepted proofs cannot redirect funds.
14. As an agent, I want someone else or a relayer to submit my proof, so that I can receive native token even before I have gas.
15. As an agent, I want a proof to be valid long enough for normal chain delay, so that a roughly 5-second relay path does not commonly fail.
16. As an agent, I want stale proofs to expire quickly, so that proof files do not remain valuable indefinitely.
17. As a faucet user, I want fixed per-token amounts, so that I do not have to choose claim size.
18. As a faucet user, I want the same claim path for native and ERC20 tokens, so that integration remains simple.
19. As a faucet user, I want failed transfers to revert the claim, so that cooldown is not consumed when no token is delivered.
20. As a faucet operator, I want the contract to validate PoW on-chain, so that serverless bugs cannot bypass proof rules.
21. As a faucet operator, I want cooldown enforced on-chain by recipient and token, so that the same proof or recipient cannot drain funds repeatedly.
22. As a faucet operator, I want chain state to grow by recipient/token rather than proof digest, so that repeated claims do not create unbounded per-proof storage.
23. As a faucet operator, I want to configure default amount, target, and cooldown, so that deployments have sensible global behavior.
24. As a faucet operator, I want token configs to override defaults only when nonzero, so that token setup remains compact.
25. As a faucet operator, I want `address(0)` to represent native token, so that native and ERC20 configuration use one token field.
26. As a faucet operator, I want to disable native or ERC20 claims independently, so that I can respond to low balances or misuse.
27. As a faucet operator, I want min and max entropy block age configured globally, so that proof validity matches chain timing.
28. As a faucet operator, I want native transfer gas capped, so that recipient fallback behavior cannot consume unbounded gas.
29. As a faucet operator, I want owner-only pause and unpause, so that claims can be stopped during incidents.
30. As a faucet operator, I want owner-only withdrawals, so that unused native or ERC20 balances can be recovered.
31. As a faucet operator, I want custom Solidity errors, so that tests and serverless can map failures precisely.
32. As a faucet operator, I want events emitted on successful claims, so that claims remain auditable even though no indexer is required.
33. As a serverless operator, I want the service to be stateless, so that it can run reliably on Vercel functions.
34. As a serverless operator, I want the service to support exactly one deployment, so that environment configuration and blast radius are simple.
35. As a serverless operator, I want requests to still include chainId and faucetAddress, so that wrong-environment proofs are rejected early.
36. As a serverless operator, I want to use SDK wallet behavior for gas, fees, and nonce management, so that the service stays small.
37. As a serverless operator, I want to simulate before sending, so that relayer gas is not spent on obvious reverts.
38. As a developer, I want shared TS modules for schema and hashing, so that skill and serverless cannot drift.
39. As a developer, I want Solidity and TS digest tests, so that the proof computed by Bun matches the proof checked by the contract.
40. As a visitor, I want a simple static page explaining the skill and install command, so that I understand the project without connecting a wallet.

## Implementation Decisions

- Use a monorepo with `contracts`, `shared`, `serverless`, `skill`, and `frontend` modules.
- Use Foundry for smart contract development and tests.
- Use OpenZeppelin for `Ownable`, `Pausable`, `ReentrancyGuard`, and `SafeERC20`.
- Use Bun + TypeScript for shared modules, skill scripts, serverless code, and frontend tooling.
- Native token is represented by `address(0)`.
- `claim` is open to anyone. The serverless relayer is not authorized in the contract and is not a permission boundary.
- `claim` accepts `recipient`, `token`, `entropyBlockNumber`, and `nonce`.
- The PoW digest binds version, chain ID, faucet address, recipient, token, entropy block number, entropy block hash, and nonce.
- The digest does not bind amount or target. Current effective on-chain config is authoritative at claim time.
- PoW comparison uses `uint256(digest) <= target`.
- Recent blockhash provides anti-precomputation. Global `minEntropyAgeBlocks` and `maxEntropyAgeBlocks` define the valid entropy block age range.
- Concrete values for entropy age bounds are deferred until chain timing is measured.
- Replay and rate limiting are enforced by `nextClaimBlock[recipient][token]`.
- Successful claims set `nextClaimBlock` from the current mined block plus effective cooldown.
- Recommended default cooldown is approximately one day, but the exact block count is deferred.
- The product stance is bootstrap-first: users are expected to claim once or rarely, not repeatedly as a core workflow.
- Token config is an owner-set whole-struct replacement.
- Token config fields `amount`, `target`, and `cooldownBlocks` use zero to mean “inherit global default”.
- Global defaults must be nonzero and valid.
- `enabled` is explicit per token, including native token.
- The contract does not maintain an enumerable token list. Callers must know the token address and query whether it is enabled.
- ERC20 token config should reject enabled nonzero token addresses without contract code.
- Native token transfer uses low-level call with configurable global gas limit; if it exceeds the limit or reverts, claim reverts.
- ERC20 payout uses `SafeERC20.safeTransfer`; fee-on-transfer tokens are not promised to deliver exactly configured amount.
- Claim has no required return value. Serverless returns transaction hash only.
- Claim emits an event for audit/debug, but no indexer is required by the product.
- Owner operations include pause, unpause, global config update, token config update, native withdraw, ERC20 withdraw, and ownership transfer.
- Serverless exposes `POST /api/claim` and `GET /api/health`.
- Serverless supports one deployment configured by environment variables: chain ID, faucet address, RPC URL, and relayer private key.
- Serverless accepts either full proof schema or only `version`, `challenge`, and `proof`.
- Serverless ignores `debug` for all security decisions.
- Serverless performs schema validation, deployment match checks, simulation, then transaction submission.
- Serverless uses the selected SDK wallet interface for gas, fee, and nonce behavior.
- Proof JSON top-level fields are `version`, `challenge`, `proof`, and optional `debug`.
- `challenge` contains `chainId`, `faucetAddress`, `entropyBlockNumber`, `token`, and `recipient`.
- `proof` contains `nonce`.
- `debug` may contain `latestBlockNumber`, `entropyBlockHash`, `digest`, `target`, attempts, duration, and computed timestamp.
- The static deployment index contains only chain, faucet address, and serverless service URL.
- Runtime token/config information is read from chain, not from the index.
- The frontend is a static page explaining skill capability and installation only.

## Testing Decisions

- Tests must prioritize external behavior over implementation details.
- Happy path must be covered end to end at the module level: compute a valid proof, pass contract validation, update cooldown, and transfer native/ERC20 value.
- Replay prevention must be explicitly tested: the same proof or another proof for the same recipient/token before cooldown must fail after a successful claim.
- Contract tests must cover PoW success and failure, entropy too recent, entropy too old, disabled token, inherited config, token overrides, cooldown update from current block, native payout, ERC20 payout, pause behavior, withdraw behavior, and custom error selectors.
- Contract tests must cover native transfer failure when the recipient reverts or exceeds the configured gas limit.
- Contract tests must cover ERC20 transfer failure behavior through SafeERC20.
- Shared module tests must verify proof schema acceptance/rejection and deterministic digest calculation.
- Cross-language tests must ensure Bun/TS digest calculation matches Solidity digest calculation for the same challenge and nonce.
- Serverless tests must cover successful request handling through a mocked wallet/public client path and must assert that a tx hash is returned.
- Serverless tests must cover replay/cooldown failure surfaced from simulation or chain state as a structured error.
- Skill script tests must cover read-config output, compute-proof output schema, and submit-claim request body shape.
- The first implementation should include enough tests to prove the happy path and replay protection before expanding peripheral coverage.

## Out of Scope

- Wallet connection or browser-based claiming in the frontend.
- CAPTCHA, social login, allowlists, identity, reputation, or Sybil-resistant human verification.
- Serverless persistence, KV, Redis, queues, or long-lived replay cache.
- Authorized relayer gating in the smart contract.
- Token enumeration from the smart contract.
- Multiple deployments served by a single serverless instance.
- Dynamic target adjustment.
- Fee-on-transfer token accounting guarantees.
- Claim indexing or analytics dashboard.
- Supporting users choosing arbitrary claim amounts.

## Further Notes

- The first target chain assumption is approximately 1 second per block with roughly 5 seconds submission delay.
- `minEntropyAgeBlocks`, `maxEntropyAgeBlocks`, default `claimCooldownBlocks`, default `target`, and default `amount` remain deployment tuning parameters.
- The design intentionally accepts per-recipient/token state growth to avoid per-proof state growth while still providing real replay protection.
- The serverless service improves usability for gasless agents, but direct contract calls remain possible for callers that already have gas.
- The PoW compute script must be treated as an expensive operation by the skill instructions and should require user confirmation before execution.

## Acceptance Record

Accepted on 2026-04-28.

Verification performed:

- `bun test` passed: shared schema/digest tests, serverless handler tests, and skill script tests.
- `forge test` passed: 20 contract tests covering native/ERC20 happy paths, replay/cooldown, entropy bounds, invalid proof, disabled token, config inheritance/overrides, pause, withdraw, native/ERC20 transfer failures, and reentrancy.
- `bun run build:frontend` passed: static frontend files verified.
- Skill runtime scripts were checked for direct imports of `@agent-faucet/shared`, `viem`, and `zod`; no runtime dependency on those packages remains under `skills/agent-faucet/scripts`.
- Frontend command examples were corrected to the current `skills/agent-faucet/scripts/...` path during acceptance.

Accepted deviations / follow-up notes:

- The skill package now lives at `skills/agent-faucet` rather than the original singular `skill` module name in the first PRD draft.
- Current deployment index contains the local Anvil deployment only; production/testnet deployment values remain an operational follow-up.
- Serverless still depends on shared schemas and `viem`, which matches the PRD; only the skill runtime was made self-contained except for Bun and Foundry `cast`.

### User Story Checklist

| # | Status | Acceptance note |
|---|---|---|
| 1 | Pass | Skill exists under `skills/agent-faucet` with install/use instructions. |
| 2 | Pass | Skill contains static `deployments.json`; currently local Anvil only. |
| 3 | Pass | `--token` defaults to `native` in common skill args. |
| 4 | Pass | ERC20 address can be passed explicitly through `--token`. |
| 5 | Pass | Skill reads global/token config from chain before proof computation. |
| 6 | Pass | `read-config.ts` provides lightweight readiness/config inspection. |
| 7 | Pass | PoW is isolated in `compute-proof.ts` and requires `--confirm-compute`. |
| 8 | Pass | Proof output uses stable `version`, `challenge`, `proof`, `debug` schema. |
| 9 | Pass | Proof output includes debug fields for block, hash, digest, target, attempts, and timing. |
| 10 | Pass | `submit-claim.ts` posts an existing proof file without recomputing. |
| 11 | Partial | Serverless returns `txHash` on success, but response also includes `ok: true`. |
| 12 | Pass | Serverless errors use structured `{ ok: false, code, message }`. |
| 13 | Pass | PoW digest binds the recipient address. |
| 14 | Pass | Contract `claim` is open and serverless can submit for the proof recipient. |
| 15 | Partial | Entropy max age is configurable for relay delay tolerance, but 5-second reliability is not separately measured. |
| 16 | Pass | Stale proof expiry is enforced through `maxEntropyAgeBlocks`. |
| 17 | Pass | Claim amount is fixed by config; users cannot choose arbitrary amounts. |
| 18 | Pass | Native and ERC20 claims share the same `claim` path and proof shape. |
| 19 | Pass | Native/ERC20 transfer failure tests confirm cooldown is not consumed on revert. |
| 20 | Pass | Contract validates PoW on-chain. |
| 21 | Pass | Cooldown is enforced on-chain by `recipient` and `token`. |
| 22 | Pass | Storage grows by `nextClaimBlock[recipient][token]`, not by proof digest. |
| 23 | Pass | Owner can configure global default amount, target, and cooldown. |
| 24 | Pass | Token amount/target/cooldown zero values inherit global defaults. |
| 25 | Pass | `address(0)` represents native token. |
| 26 | Pass | Native and ERC20 token configs are independently enabled/disabled. |
| 27 | Pass | Global min/max entropy block age are configurable. |
| 28 | Pass | Native transfer uses a configurable gas cap. |
| 29 | Pass | Owner-only pause and unpause are implemented. |
| 30 | Pass | Owner-only native and ERC20 withdrawals are implemented. |
| 31 | Pass | Domain failures use custom Solidity errors; OpenZeppelin owner/pause errors remain from dependencies. |
| 32 | Pass | Successful claims emit `Claimed`. |
| 33 | Pass | Serverless handler is stateless. |
| 34 | Pass | Serverless serves one deployment from environment variables. |
| 35 | Pass | Requests include chain/faucet data and mismatches are rejected early. |
| 36 | Pass | Serverless uses `viem` wallet/public client behavior for simulation and send. |
| 37 | Pass | Serverless simulates before writing the transaction. |
| 38 | Pass | Shared TS modules provide schema, ABI, deployment parsing, and hashing for serverless/shared tests. |
| 39 | Partial | Solidity and TS digest behavior are covered by deterministic tests, but there is no single direct cross-language integration test invoking both on the same fixture. |
| 40 | Pass | Frontend is static and describes skill usage without wallet connection or chain reads. |
