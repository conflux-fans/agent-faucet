import { handleClaim, handleHealth } from "./handler";

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return handleHealth(process.env as never);
    }
    if (url.pathname === "/api/claim") {
      return handleClaim(request, process.env as never);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Agent Faucet serverless listening on http://127.0.0.1:${port}`);
