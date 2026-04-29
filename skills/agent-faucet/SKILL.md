---
name: agent-faucet
description: Claim native or configured ERC20 test tokens from Agent Faucet deployments while keeping the user-facing flow high level.
---

# Agent Faucet

Use this skill when an agent needs bootstrap native token for gas or a known ERC20 test token from an Agent Faucet deployment.

Keep user-facing messages high level. Do not describe contract internals, proof schema fields, nonce search, relayer implementation details, or raw command mechanics unless the user explicitly asks.

## Requirements

- Bun
- Foundry `cast`

See `reference/install-requirements.md` for installation and verification commands.

## Workflow

1. Read `deployments.json` first. If the user did not already provide the target chain, token, or recipient address, ask for the missing values after reading the available deployment choices. Prefer selection-style options for known choices:
   - chain: offer the configured `chainName` values.
   - token: offer `native` first, then ask for an ERC20 token address only if needed.
   - recipient: ask for an EVM hex address.
2. Use the selected deployment's configured `rpcUrl` by default. Do not ask the user for an RPC URL unless the deployment has no usable RPC endpoint or the user explicitly wants to override it.
3. Run `read-config.ts` to check whether the selected recipient can claim the selected token on the selected chain. Tell the user the result in plain language:
   - If claimable: say they can claim now.
   - If not claimable: say they cannot claim now and include the available reason from the config output, such as token disabled or cooldown not finished. Avoid exposing raw target values or proof parameters.
4. If the user can claim, run `estimate-proof-time.ts` for the selected token. This only reads the token's current difficulty and estimates time from a baseline; it does not perform proof computation and does not need proof-work authorization.
5. Ask for explicit authorization before running the local proof-of-work calculation. Explain only that this is an anti-abuse check, it uses local CPU briefly, and the rough expected time from `estimate-proof-time.ts`. Prefer the returned `userGuidanceZh` wording when speaking Chinese. Tell the user the default is all logical CPUs, and that they may choose fewer threads such as half CPU or 1 thread/no multithread acceleration. Do not expose raw target values or proof parameters unless the user explicitly asks.
6. Only after explicit authorization, run `compute-proof.ts` with the user-selected `--threads` value, then run `submit-claim.ts` with the generated proof JSON. If the user accepts the default, omit `--threads` so the script uses all logical CPUs.
7. If `compute-proof.ts` fails to find a proof after its attempt limit, read `reference/proof-failure.md` and follow it exactly. Do not explain the failure details from memory during the normal workflow.
8. After submission completes, show the user the transaction hash and the block explorer link. Build the link from the deployment's `scanUrl` and the returned `txHash`; if `submit-claim.ts` already returns `scanTxUrl`, use that.

Native token uses `native` or `0x0000000000000000000000000000000000000000`. ERC20 claims require the caller to provide the token address.

## Commands

```bash
bun skills/agent-faucet/scripts/read-config.ts --chain-id 71 --recipient 0x... --token native
```

```bash
bun skills/agent-faucet/scripts/estimate-proof-time.ts --chain-id 71 --token native
```

```bash
bun skills/agent-faucet/scripts/compute-proof.ts --confirm-compute --chain-id 71 --recipient 0x... --token native --threads 4
```

```bash
bun skills/agent-faucet/scripts/submit-claim.ts --proof proof.json
```

`compute-proof.ts` prints the proof JSON to stdout. Save it to a file only after the user confirms they want to spend local compute. Omit `--threads` to use all logical CPUs.
