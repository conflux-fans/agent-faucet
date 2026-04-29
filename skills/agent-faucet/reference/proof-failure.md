# Proof Computation Failure

Read this reference only if `compute-proof.ts` fails to find a proof after its configured attempt limit.

## User Message

Tell the user:

- This can happen even when everything is working correctly.
- A single proof computation has about a `1 / 20000` chance of not finding a valid proof within the default attempt limit.
- Ask whether they want to retry once.

Suggested wording:

```text
The anti-abuse computation did not find a proof within the default attempt limit. This can be a normal probability event: a single computation has about a 1 / 20000 chance of failing this way. Do you want me to retry once?
```

## Retry Rule

- Retry `compute-proof.ts` at most once.
- Use the same chain, token, recipient, and thread choice unless the user explicitly changes them.
- Re-run `compute-proof.ts` from the beginning so it reads the latest chain state and selects a fresh entropy block. Do not reuse the failed proof attempt's entropy block.
- If the retry succeeds, continue to `submit-claim.ts`.
- If the retry also fails, do not try again automatically.

Suggested wording after the second failure:

```text
The retry still did not find a proof. I will not keep retrying automatically. This may be repeated probability failure, or it may be related to the local environment, RPC data, or current on-chain configuration. You can start a diagnostic request later and I can check the specific cause.
```
