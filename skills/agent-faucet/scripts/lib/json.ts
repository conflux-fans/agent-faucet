export function printJson(value: unknown) {
  console.log(JSON.stringify(value, bigintJsonReplacer, 2));
}

export function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

export async function main(fn: () => Promise<unknown>) {
  try {
    printJson(await fn());
  } catch (error) {
    printJson({ ok: false, code: "SCRIPT_ERROR", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}
