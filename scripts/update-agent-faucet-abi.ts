const artifactPath = new URL("../contracts/out/AgentFaucet.sol/AgentFaucet.json", import.meta.url);
const trackedAbiPath = new URL("../serverless/src/AgentFaucet.abi.json", import.meta.url);

const artifact = JSON.parse(await Bun.file(artifactPath).text());
if (!artifact || typeof artifact !== "object" || !("abi" in artifact)) {
  throw new Error(`Foundry artifact at ${artifactPath.pathname} does not contain an abi field`);
}

await Bun.write(trackedAbiPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log(`Updated ${trackedAbiPath.pathname}`);
