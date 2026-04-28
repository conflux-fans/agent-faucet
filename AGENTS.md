# Agent Faucet Architecture

This repository is a Bun/TypeScript + Foundry monorepo for an agent-friendly faucet. It lets agents compute a short-lived proof-of-work locally, then submit that proof through a stateless relayer to claim native gas token or configured ERC20 test tokens.

## Top-Level Shape

- `contracts/`: Solidity source and Foundry tests. The on-chain faucet is the source of truth for claim validation, cooldowns, token config, entropy windows, and payouts.
- `shared/`: TypeScript package exported as `@agent-faucet/shared`. It contains proof schemas, canonical digest computation, constants, deployment parsing, and the contract ABI.
- `serverless/`: Stateless HTTP relay. It validates proof JSON, checks deployment mismatch, simulates `claim`, and sends the transaction with a configured relayer key.
- `skills/agent-faucet/`: Installable agent skill. It contains the `SKILL.md`, deployment index, and Bun scripts for reading config, computing proofs, and submitting claims.
- `frontend/`: Static install/landing page for the skill. `frontend/build.ts` currently verifies the static files rather than producing a bundled app.
- `docs/design/proof.md`: Protocol design document. Treat this as the canonical explanation of the proof model and security assumptions.
- `lib/`: Foundry dependencies, mainly OpenZeppelin and forge-std. Avoid editing vendored code unless intentionally updating dependencies.

## Core Protocol

The claim proof binds together:

- `POW_VERSION_HASH`
- `chainId`
- `faucetAddress`
- `recipient`
- `token`
- `entropyBlockNumber`
- `entropyBlockHash`
- `nonce`

The digest is `keccak256(abi.encode(...))`, not packed encoding. The Solidity implementation in `contracts/src/AgentFaucet.sol` and TypeScript implementation in `shared/src/pow.ts` must stay byte-for-byte compatible.

Native token is represented by `address(0)` / `0x0000000000000000000000000000000000000000`.

## Runtime Flow

1. An agent uses `skills/agent-faucet/scripts/read-config.ts` to inspect faucet config, token config, latest block, and cooldown state.
2. The agent asks the user before running `compute-proof.ts` because it performs CPU-intensive local proof-of-work.
3. `compute-proof.ts` selects a recent entropy block, reads its block hash, searches for a nonce whose digest satisfies the current target, then emits a proof JSON document.
4. `submit-claim.ts` posts the proof JSON to the deployment's configured serverless URL.
5. `serverless/src/handler.ts` validates the request, rejects deployment mismatches, simulates `AgentFaucet.claim`, and sends the transaction.
6. `AgentFaucet.claim` recomputes authoritative chain values on-chain, validates entropy age, checks cooldown, checks target, updates cooldown, and pays the recipient.

The relayer is not an authorization boundary. Anyone with gas can call `claim` directly with a valid proof.

## Smart Contract Architecture

`contracts/src/AgentFaucet.sol` owns the on-chain rules:

- `GlobalConfig` sets entropy age bounds, default cooldown, native transfer gas limit, default amount, and default target.
- `TokenConfig` enables each token and can override cooldown, amount, and target. Zero override values inherit global defaults.
- `nextClaimBlock[recipient][token]` enforces replay protection and cooldown.
- `computeDigest` is public for testability and parity checks.
- Native payouts use a limited-gas call; ERC20 payouts use OpenZeppelin `SafeERC20`.
- `claim` is `nonReentrant` and `whenNotPaused`.

When changing claim semantics, update both contract tests in `contracts/test/` and TypeScript parity tests in `shared/test/`.

## Shared Package

`shared/src/` is the boundary between contract, relayer, skill scripts, and tests:

- `constants.ts`: proof version, PoW version hash, native token address.
- `pow.ts`: canonical digest and target check.
- `schema.ts`: strict proof JSON parsing and address/token normalization.
- `deployments.ts`: deployment index parsing and lookup.
- `abi.ts`: faucet ABI used by the relayer and scripts.
- `index.ts`: public exports.

Keep schema parsing strict at the proof boundary. `debug` fields in proof JSON are optional and non-authoritative.

## Serverless Architecture

`serverless/src/handler.ts` contains framework-neutral handlers:

- `handleHealth(env)` validates env and returns deployment identity.
- `handleClaim(request, env, clients?)` validates HTTP method, content type, body size, proof shape, and configured deployment.
- `createClients(env)` builds Viem public and wallet clients from `FAUCET_CHAIN_ID`, `FAUCET_ADDRESS`, `RPC_URL`, and `RELAYER_PRIVATE_KEY`.

Adapters:

- `serverless/api/claim.ts` exposes the claim handler for Vercel Edge runtime.
- `serverless/api/health.ts` exposes health.
- `serverless/src/bun-server.ts` runs the same handlers locally with `Bun.serve`.

The service is intentionally stateless. Do not add replay caches or nonce coordination without revisiting the design in `docs/design/proof.md`.

## Skill Architecture

`skills/agent-faucet/SKILL.md` is the user-facing skill contract. Scripts under `skills/agent-faucet/scripts/` are stable automation entry points:

- `read-config.ts`: read faucet/token/cooldown state.
- `compute-proof.ts`: compute proof only when `--confirm-compute` is present.
- `submit-claim.ts`: submit an existing proof to the configured relayer.

Script internals are split into `scripts/lib/` for argument parsing, deployment loading, `cast` calls, EVM encoding, proof parsing, and JSON output. The skill has its own `deployments.json`; keep it aligned with any deployment changes.

## Frontend

The frontend is a static skill installation page:

- `frontend/index.html`: bilingual page content and language switcher.
- `frontend/styles.css`: page styling.
- `frontend/build.ts`: lightweight verification used by `bun run build:frontend`.

This is not currently a React/Vite app.

## Common Commands

Run all TypeScript tests:

```bash
bun test shared/test serverless/test skills/agent-faucet/test
```

Equivalent root script:

```bash
bun test
```

Run contract tests:

```bash
forge test
```

Build/check frontend:

```bash
bun run build:frontend
```

Run local serverless handler:

```bash
bun serverless/src/bun-server.ts
```

## Change Guidelines

- Keep Solidity and TypeScript digest encoding synchronized.
- Keep proof JSON stable unless also updating `docs/design/proof.md`, `shared/src/schema.ts`, relayer handling, skill scripts, and tests.
- Treat `docs/design/proof.md` as the protocol source of truth for security-sensitive behavior.
- Avoid editing `lib/` vendored dependencies and generated `contracts/out/` artifacts as part of normal feature work.
- Do not make the relayer responsible for security decisions that the contract must enforce.
- Ask before running CPU-heavy proof computation outside tests.
