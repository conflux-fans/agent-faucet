import { handleClaim } from "../serverless/src/handler.js";

export const config = {
  runtime: "edge",
};

export default async function claim(request: Request): Promise<Response> {
  return handleClaim(request, process.env as never);
}
