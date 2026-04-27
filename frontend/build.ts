const html = await Bun.file(new URL("./index.html", import.meta.url)).text();
const css = await Bun.file(new URL("./styles.css", import.meta.url)).text();

if (!html.includes("Agent Faucet Skill")) {
  throw new Error("frontend/index.html is missing the product name");
}

if (!css.includes(".hero")) {
  throw new Error("frontend/styles.css is missing hero styling");
}

console.log("frontend static files verified");
