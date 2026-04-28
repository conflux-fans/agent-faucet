import { parseArgs } from "./lib/args";
import { findDeployment, loadDeployments, parseDeploymentsFile } from "./lib/deployments";
import { main } from "./lib/json";
import { parseProofFile } from "./lib/proof";

export async function submitClaim(
  argv: string[],
  deps?: { proofJson?: unknown; deploymentsJson?: unknown; fetchFn?: (url: string, init: RequestInit) => Promise<Response> },
) {
  const args = parseArgs(argv);
  const proofPath = args.proof;
  if (typeof proofPath !== "string" && deps?.proofJson === undefined) {
    throw new Error("--proof is required");
  }

  const proofJson = deps?.proofJson ?? JSON.parse(await Bun.file(proofPath as string).text());
  const proof = parseProofFile(proofJson);
  const deployments = parseDeploymentsFile(deps?.deploymentsJson ?? (await loadDeployments()));
  const deployment = findDeployment(deployments, proof.challenge.chainId);

  const fetchFn = deps?.fetchFn ?? fetch;
  const response = await fetchFn(deployment.serverlessUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(proof.raw),
  });

  const body = await response.json();
  return body;
}

if (import.meta.main) {
  await main(() => submitClaim(Bun.argv.slice(2)));
}
