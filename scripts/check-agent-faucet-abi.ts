const artifactPath = new URL("../contracts/out/AgentFaucet.sol/AgentFaucet.json", import.meta.url);
const trackedAbiPath = new URL("../serverless/src/AgentFaucet.abi.json", import.meta.url);

async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const artifact = await readJson(artifactPath);
if (!artifact || typeof artifact !== "object" || !("abi" in artifact)) {
  throw new Error(`Foundry artifact at ${artifactPath.pathname} does not contain an abi field`);
}

const compiledAbi = (artifact as { abi: unknown }).abi;
const trackedAbi = await readJson(trackedAbiPath);

if (stableJson(compiledAbi) !== stableJson(trackedAbi)) {
  console.error("serverless/src/AgentFaucet.abi.json is out of sync with the compiled AgentFaucet ABI.");
  console.error("Run `bun run abi:update` after `forge build`, then commit the updated ABI.");
  process.exit(1);
}

console.log("AgentFaucet ABI is in sync.");
