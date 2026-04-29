# Proof Computation Failure

Read this reference only if `compute-proof.ts` fails to find a proof after its configured attempt limit.

## User Message

Tell the user:

- This can happen even when everything is working correctly.
- A single proof computation has about a `1 / 20000` chance of not finding a valid proof within the default attempt limit.
- Ask whether they want to retry once.

Suggested Chinese wording:

```text
这次防滥用计算没有在默认尝试次数内找到 proof。这个情况可能只是概率事件，单次计算大约有 1/20000 的概率失败。是否重试一次？
```

## Retry Rule

- Retry `compute-proof.ts` at most once.
- Use the same chain, token, recipient, and thread choice unless the user explicitly changes them.
- Re-run `compute-proof.ts` from the beginning so it reads the latest chain state and selects a fresh entropy block. Do not reuse the failed proof attempt's entropy block.
- If the retry succeeds, continue to `submit-claim.ts`.
- If the retry also fails, do not try again automatically.

Suggested Chinese wording after the second failure:

```text
重试后仍然没有找到 proof。我不会继续自动尝试。当前可能只是连续概率失败，也可能和本机环境、RPC 数据或当前链上配置有关。你可以稍后发起诊断请求，我再帮你检查具体原因。
```
