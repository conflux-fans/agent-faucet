import { handleHealth } from "../serverless/src/handler.js";

export const config = {
  runtime: "edge",
};

export default async function health(): Promise<Response> {
  return handleHealth(process.env as never);
}
