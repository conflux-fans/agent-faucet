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

The initial testnet deployment uses the same conservative defaults as the contract tests, with a moderate proof target for agent-local computation:

```text
minEntropyAgeBlocks      = 8
maxEntropyAgeBlocks      = 45
defaultCooldownBlocks    = 86400
nativeTransferGasLimit   = 30000
defaultAmount            = 10000000000000000
defaultTarget            = 0x0000a7c5ac471b4784230fcf80dc33721d53cddd6e04c059210385c67dfe32a0
```

`defaultAmount` is `0.01` native token. The target is approximately `2^256 / 100000`, so a proof should take about `100000` digest attempts on average.

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
  "(8,45,86400,30000,10000000000000000,1157920892373161954235709850086879078532699846656405640394575840079131296)" \
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

```bash
bun skills/agent-faucet/scripts/compute-proof.ts \
  --confirm-compute \
  --chain-id 71 \
  --recipient 0x... \
  --token native > proof.json
```

Submit the proof through Vercel:

```bash
bun skills/agent-faucet/scripts/submit-claim.ts --proof proof.json
```

## 7. Optional Contract Verification

ConfluxScan verification uses the Etherscan-compatible endpoint. Do not pass `--chain-id`.

```bash
forge verify-contract "$FAUCET_ADDRESS" contracts/src/AgentFaucet.sol:AgentFaucet \
  --verifier-url https://evmapi-testnet.confluxscan.org/api/ \
  --etherscan-api-key any \
  --constructor-args "$(cast abi-encode \
    'constructor((uint64,uint64,uint64,uint64,uint256,uint256),address)' \
    '(8,45,86400,30000,10000000000000000,1157920892373161954235709850086879078532699846656405640394575840079131296)' \
    "$(cast wallet address --private-key "$PRIVATE_KEY")")"
```
