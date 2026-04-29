# Deployment Guide

This guide deploys Agent Faucet to Conflux eSpace Testnet and Vercel.

## Prerequisites

- Bun
- Foundry `forge` and `cast`
- Vercel CLI authenticated with `vercel login`
- A Conflux eSpace Testnet account funded with native token for deployment, relayer gas, and faucet liquidity

Conflux eSpace Testnet:

- Chain ID: `71`
- RPC URL: `https://evmtestnet.confluxrpc.com`
- Explorer: `https://evmtestnet.confluxscan.org`

## Current Testnet Deployment

- Chain: Conflux eSpace Testnet (`71`)
- Faucet contract: `0xAEcbc1bd17F65aef2f5965E56bFBFEF283123F9b`
- Vercel site: `https://agent-faucet.vercel.app`
- Claim endpoint: `https://agent-faucet.vercel.app/api/claim`
- Health endpoint: `https://agent-faucet.vercel.app/api/health`

## 1. Choose Deployment Parameters

The current testnet runtime configuration uses a wide proof validity window, a one-day block cooldown, and a moderate proof target for agent-local computation:

```text
minEntropyAgeBlocks      = 8
maxEntropyAgeBlocks      = 255
defaultCooldownBlocks    = 86400
nativeTransferGasLimit   = 50000
defaultAmount            = 10000000000000000
defaultTarget            = 0x000010c6f7a0b5ed8d36b4c7f34938583621fafc8b0079a2834d26fa3fcc9ea9
```

`defaultAmount` is `0.01` native token. The target is approximately `2^256 / 1000000`, so a proof should take about `1000000` digest attempts on average. The time estimates use an M2 Pro single-thread TypeScript proof loop as the baseline: roughly 20 seconds at this target before thread scaling. Multi-threaded estimates are linear projections from that baseline and actual wall-clock time depends on hardware and load.

To update the current testnet deployment to this target, use the owner key and keep all other config fields unchanged:

```bash
cast send 0xAEcbc1bd17F65aef2f5965E56bFBFEF283123F9b \
  "setGlobalConfig((uint64,uint64,uint64,uint64,uint256,uint256))" \
  "(8,255,86400,50000,10000000000000000,115792089237316195423570985008687907853269984665640564039457584007913129)" \
  --rpc-url https://evmtestnet.confluxrpc.com \
  --private-key "$PRIVATE_KEY"
```

## 2. Deploy the Contract

Set the deployer private key only in your local shell:

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://evmtestnet.confluxrpc.com
```

Deploy with Foundry. Use an explicit gas limit on Conflux eSpace because the default estimate can be too low.

```bash
forge create contracts/src/AgentFaucet.sol:AgentFaucet \
  --broadcast \
  --rpc-url "$RPC_URL" \
  --gas-limit 10000000 \
  --private-key "$PRIVATE_KEY" \
  --constructor-args \
  "(8,255,86400,50000,10000000000000000,115792089237316195423570985008687907853269984665640564039457584007913129)" \
  "$(cast wallet address --private-key "$PRIVATE_KEY")"
```

Record the deployed faucet address from the `Deployed to:` line.

## 3. Enable Native Claims

Native token is represented by `0x0000000000000000000000000000000000000000`.

```bash
export FAUCET_ADDRESS=0x...

cast send "$FAUCET_ADDRESS" \
  "setTokenConfig(address,(bool,uint64,uint256,uint256))" \
  0x0000000000000000000000000000000000000000 \
  "(true,0,0,0)" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --gas-limit 500000
```

Fund the faucet contract with native token:

```bash
cast send "$FAUCET_ADDRESS" \
  --value 0.05ether \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --gas-limit 100000
```

## 4. Deploy the Relayer to Vercel

The relayer is stateless. Configure exactly one deployment per Vercel project:

```bash
vercel env add FAUCET_CHAIN_ID production
vercel env add FAUCET_ADDRESS production
vercel env add RPC_URL production
vercel env add RELAYER_PRIVATE_KEY production
```

Use these values:

```text
FAUCET_CHAIN_ID=71
FAUCET_ADDRESS=<deployed faucet address>
RPC_URL=https://evmtestnet.confluxrpc.com
RELAYER_PRIVATE_KEY=<funded relayer private key>
```

Deploy:

```bash
vercel --prod
```

If the installed Vercel CLI is too old for the current deployment API, use:

```bash
npx vercel@latest deploy --prod --yes
```

After deployment, verify health:

```bash
curl https://<vercel-deployment>/api/health
```

Expected response:

```json
{
  "ok": true,
  "chainId": "71",
  "faucetAddress": "0x..."
}
```

## 5. Update the Skill Deployment Index

Update `skills/agent-faucet/deployments.json` with the deployed chain, RPC URL, faucet address, Vercel claim URL, and block explorer URL:

```json
{
  "chainId": "71",
  "chainName": "Conflux eSpace Testnet",
  "rpcUrl": "https://evmtestnet.confluxrpc.com",
  "faucetAddress": "0x...",
  "serverlessUrl": "https://<vercel-deployment>/api/claim",
  "scanUrl": "https://evmtestnet.confluxscan.org"
}
```

Keep this index minimal. Runtime configuration such as amount, target, cooldown, and token enablement should be read from the chain.

## 6. Verify the Skill Flow

Inspect on-chain config:

```bash
bun skills/agent-faucet/scripts/read-config.ts \
  --chain-id 71 \
  --recipient 0x... \
  --token native
```

Proof computation is CPU-intensive. Ask the operator before running it:

Estimate proof time first. Omit `--threads` to estimate the default all-logical-CPU mode; use `--threads 1` to estimate single-thread mode. Report estimates as M2 Pro single-thread-baseline projections, not guaranteed local runtime.

```bash
bun skills/agent-faucet/scripts/estimate-proof-time.ts \
  --chain-id 71 \
  --token native
```

```bash
bun skills/agent-faucet/scripts/compute-proof.ts \
  --confirm-compute \
  --chain-id 71 \
  --recipient 0x... \
  --token native \
  --threads 4 > proof.json
```

Submit the proof through Vercel:

```bash
bun skills/agent-faucet/scripts/submit-claim.ts --proof proof.json
```

## 7. Optional Contract Verification

ConfluxScan verification uses the Etherscan-compatible endpoint. Do not pass `--chain-id`.

For a new deployment, use the same constructor argument tuple from step 2. The current testnet contract was deployed before runtime parameter tuning, so verifying `0xAEcbc1bd17F65aef2f5965E56bFBFEF283123F9b` still requires its original constructor tuple:

```bash
forge verify-contract "$FAUCET_ADDRESS" contracts/src/AgentFaucet.sol:AgentFaucet \
  --verifier-url https://evmapi-testnet.confluxscan.org/api/ \
  --etherscan-api-key any \
  --constructor-args "$(cast abi-encode \
    'constructor((uint64,uint64,uint64,uint64,uint256,uint256),address)' \
    '(8,45,86400,30000,10000000000000000,1157920892373161954235709850086879078532699846656405640394575840079131296)' \
    "$(cast wallet address --private-key "$PRIVATE_KEY")")"
```
