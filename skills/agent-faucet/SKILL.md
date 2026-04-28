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
2. Run `read-config.ts` to check whether the selected recipient can claim the selected token on the selected chain. Tell the user the result in plain language:
   - If claimable: say they can claim now.
   - If not claimable: say they cannot claim now and include the available reason from the config output, such as token disabled or cooldown not finished. Avoid exposing raw target values or proof parameters.
3. If the user can claim, ask for explicit authorization before running the local proof-of-work calculation. Explain only that this is an anti-abuse check, it uses local CPU briefly, and the rough expected time. Suggested wording: "可以领取。继续前需要你明确授权我在本机做一次防滥用计算，通常会占用 CPU 一小段时间；在 Apple M-series 笔记本上常见为几秒到几十秒，具体取决于当前难度。是否继续？"
4. Only after explicit authorization, run `compute-proof.ts` and then `submit-claim.ts` with the generated proof JSON.
5. After submission completes, show the user the transaction hash and the block explorer link. Build the link from the deployment's `scanUrl` and the returned `txHash`; if `submit-claim.ts` already returns `scanTxUrl`, use that.

Native token uses `native` or `0x0000000000000000000000000000000000000000`. ERC20 claims require the caller to provide the token address.

## Commands

```bash
bun skills/agent-faucet/scripts/read-config.ts --chain-id 31337 --rpc-url http://127.0.0.1:8545 --recipient 0x... --token native
```

```bash
bun skills/agent-faucet/scripts/compute-proof.ts --confirm-compute --chain-id 31337 --rpc-url http://127.0.0.1:8545 --recipient 0x... --token native
```

```bash
bun skills/agent-faucet/scripts/submit-claim.ts --proof proof.json
```

`compute-proof.ts` prints the proof JSON to stdout. Save it to a file only after the user confirms they want to spend local compute.
