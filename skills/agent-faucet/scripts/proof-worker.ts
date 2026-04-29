import { parentPort, workerData } from "node:worker_threads";
import { Address, Hex } from "./lib/evm";
import { searchProofNonce } from "./lib/proof-search";

interface WorkerData {
  chainId: string;
  faucetAddress: Address;
  recipient: Address;
  token: Address;
  entropyBlockNumber: string;
  entropyBlockHash: Hex;
  target: string;
  maxAttempts: string;
  startNonce: string;
  step: string;
  stopBuffer: SharedArrayBuffer;
}

const data = workerData as WorkerData;
const stopFlag = new Int32Array(data.stopBuffer);

const result = searchProofNonce({
  chainId: BigInt(data.chainId),
  faucetAddress: data.faucetAddress,
  recipient: data.recipient,
  token: data.token,
  entropyBlockNumber: BigInt(data.entropyBlockNumber),
  entropyBlockHash: data.entropyBlockHash,
  target: BigInt(data.target),
  maxAttempts: BigInt(data.maxAttempts),
  startNonce: BigInt(data.startNonce),
  step: BigInt(data.step),
  shouldStop: () => Atomics.load(stopFlag, 0) === 1,
  stopCheckInterval: 4096n,
});

if (result.nonce !== null && result.digest !== null) {
  Atomics.store(stopFlag, 0, 1);
  parentPort?.postMessage({
    type: "found",
    nonce: result.nonce.toString(),
    digest: result.digest,
    attempts: result.attempts.toString(),
  });
} else {
  parentPort?.postMessage({ type: "done", attempts: result.attempts.toString() });
}
