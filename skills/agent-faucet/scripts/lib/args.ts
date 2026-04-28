export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[name] = true;
    } else {
      args[name] = value;
      i++;
    }
  }
  return args;
}

export function requireStringArg(args: Record<string, string | boolean>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`--${name} is required`);
  }
  return value;
}
