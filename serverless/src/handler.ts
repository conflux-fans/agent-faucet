import { faucetAbi, parseProofFile } from "@agent-faucet/shared";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface Env {
  FAUCET_CHAIN_ID: string;
  FAUCET_ADDRESS: string;
  RPC_URL: string;
  RELAYER_PRIVATE_KEY: string;
}

interface ClientBundle {
  account: Address;
  publicClient: {
    simulateContract: (request: {
      address: Address;
      abi: typeof faucetAbi;
      functionName: "claim";
      account: Address;
      args: [Address, Address, bigint, bigint];
    }) => Promise<{ request: unknown }>;
  };
  walletClient: {
    writeContract: (request: any) => Promise<`0x${string}`>;
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function loadEnv(env: Env): { chainId: bigint; faucetAddress: Address; rpcUrl: string; privateKey: `0x${string}` } {
  if (!/^(0|[1-9][0-9]*)$/.test(env.FAUCET_CHAIN_ID)) {
    throw new Error("FAUCET_CHAIN_ID must be a decimal string");
  }
  if (!isAddress(env.FAUCET_ADDRESS, { strict: false })) {
    throw new Error("FAUCET_ADDRESS must be an EVM address");
  }
  if (!env.RPC_URL) {
    throw new Error("RPC_URL is required");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.RELAYER_PRIVATE_KEY)) {
    throw new Error("RELAYER_PRIVATE_KEY must be a 32-byte hex private key");
  }

  return {
    chainId: BigInt(env.FAUCET_CHAIN_ID),
    faucetAddress: getAddress(env.FAUCET_ADDRESS),
    rpcUrl: env.RPC_URL,
    privateKey: env.RELAYER_PRIVATE_KEY as `0x${string}`,
  };
}

export function createClients(env: Env): ClientBundle {
  const config = loadEnv(env);
  const chain = defineChain({
    id: Number(config.chainId),
    name: `Agent Faucet ${config.chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: {
      default: {
        http: [config.rpcUrl],
      },
    },
  });
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);

  return {
    account: account.address,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

export async function handleHealth(env: Env): Promise<Response> {
  try {
    const config = loadEnv(env);
    return jsonResponse({
      ok: true,
      chainId: config.chainId.toString(),
      faucetAddress: config.faucetAddress,
    });
  } catch (error) {
    return jsonResponse(errorBody("CONFIG_ERROR", errorMessage(error)), 500);
  }
}

export async function handleClaim(request: Request, env: Env, clients = createClients(env)): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "Use POST /api/claim"), 405);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 64 * 1024) {
    return jsonResponse(errorBody("REQUEST_TOO_LARGE", "Request body is too large"), 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse(errorBody("UNSUPPORTED_MEDIA_TYPE", "Use application/json"), 415);
  }

  let parsed;
  try {
    parsed = parseProofFile(await request.json());
  } catch (error) {
    return jsonResponse(errorBody("INVALID_REQUEST", errorMessage(error)), 400);
  }

  let config;
  try {
    config = loadEnv(env);
  } catch (error) {
    return jsonResponse(errorBody("CONFIG_ERROR", errorMessage(error)), 500);
  }

  if (parsed.challenge.chainId !== config.chainId) {
    return jsonResponse(errorBody("DEPLOYMENT_MISMATCH", "Proof chainId does not match this relayer"), 400);
  }
  if (parsed.challenge.faucetAddress !== config.faucetAddress) {
    return jsonResponse(errorBody("DEPLOYMENT_MISMATCH", "Proof faucetAddress does not match this relayer"), 400);
  }

  try {
    const simulation = await clients.publicClient.simulateContract({
      address: config.faucetAddress,
      abi: faucetAbi,
      functionName: "claim",
      account: clients.account,
      args: [
        parsed.challenge.recipient,
        parsed.challenge.token,
        parsed.challenge.entropyBlockNumber,
        parsed.proof.nonce,
      ],
    });
    const txHash = await clients.walletClient.writeContract(simulation.request);
    return jsonResponse({ ok: true, txHash });
  } catch (error) {
    return jsonResponse(errorBody("SIMULATION_OR_SEND_FAILED", errorMessage(error)), 400);
  }
}

function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return details ? { ok: false, code, message, details } : { ok: false, code, message };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
