---
name: agent-faucet
description: Claim native or configured ERC20 test tokens from Agent Faucet deployments using a local proof-of-work flow.
---

# Agent Faucet

Use this skill when an agent needs bootstrap native token for gas or a known ERC20 test token from an Agent Faucet deployment.

## Workflow

1. Run `read-config.ts` to inspect the configured faucet and token.
2. Ask the user before running `compute-proof.ts`; it performs CPU-intensive proof-of-work.
3. Run `submit-claim.ts` with the generated proof JSON.

Native token uses `native` or `0x0000000000000000000000000000000000000000`. ERC20 claims require the caller to provide the token address.

## Commands

```bash
bun skill/scripts/read-config.ts --chain-id 31337 --rpc-url http://127.0.0.1:8545 --recipient 0x... --token native
```

```bash
bun skill/scripts/compute-proof.ts --confirm-compute --chain-id 31337 --rpc-url http://127.0.0.1:8545 --recipient 0x... --token native
```

```bash
bun skill/scripts/submit-claim.ts --proof proof.json
```

`compute-proof.ts` prints the proof JSON to stdout. Save it to a file only after the user confirms they want to spend local compute.
