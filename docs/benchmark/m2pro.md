# M2 Pro Benchmark Environment

This file records the local machine baseline used when collecting proof-search
throughput numbers. It is documentation only; changing it does not update the
skill's estimate model.

## Hardware

- Machine class: Apple Silicon Mac
- CPU: Apple M2 Pro
- Architecture: arm64
- Physical CPU cores: 10
- Logical CPU cores: 10
- Performance cores: 6 physical / 6 logical
- Efficiency cores: 4 physical / 4 logical
- Memory: 16 GiB

## Software

- OS: macOS 26.4.1 (25E253)
- Bun: 1.3.10
- Node.js: v20.19.0

## Benchmark Scope

- Workload: local TypeScript proof-search loop under `skills/agent-faucet/scripts/`.
- Digest: `keccak256(abi.encode(...))`, matching the faucet proof format.
- Benchmark target: `0`, so the run measures exhausted search throughput instead
  of time-to-first-success distribution.
- Output metric: attempts per second for each configured thread count.

## Collection Command

```bash
bun scripts/benchmark-throughput.ts --threads 1,2,3,4,5,6,7,8,9,10 --attempts 1000000000 --max-duration-ms 8000
```

For a shorter focused run:

```bash
bun scripts/benchmark-throughput.ts --threads 1,2,4,8,10 --attempts 1000000000 --max-duration-ms 8000
```

For a fixed-attempt run without timeout:

```bash
bun scripts/benchmark-throughput.ts --threads 1,2,4,8,10 --attempts 2000000
```

## Notes

- Record the exact command and date with any result table added below.
- Do not use these numbers as portable hardware-independent estimates.
- If the estimate model is changed later, document that separately from this
  environment record.

## Results

### 2026-04-29

Command:

```bash
bun scripts/benchmark-throughput.ts --threads 1,2,3,4,5,6,7,8,9,10 --attempts 1000000000 --max-duration-ms 8000
```

Settings:

- Total attempts per run: 1,000,000,000
- Max duration: 8,000 ms
- Warmup attempts: 100,000

| Threads | Attempts | Duration ms | Attempts/s | Speedup |
| ------- | -------- | ----------- | ---------- | ------- |
| 1 | 1,830,912 | 8,019.08 | 228,320 | 1.00x |
| 2 | 3,629,056 | 8,012.14 | 452,945 | 1.98x |
| 3 | 5,517,312 | 8,016.19 | 688,272 | 3.01x |
| 4 | 6,434,816 | 8,023.66 | 801,980 | 3.51x |
| 5 | 6,676,480 | 8,022.46 | 832,224 | 3.64x |
| 6 | 7,536,640 | 8,041.27 | 937,245 | 4.10x |
| 7 | 9,183,232 | 8,022.57 | 1,144,675 | 5.01x |
| 8 | 8,753,152 | 8,023.99 | 1,090,873 | 4.78x |
| 9 | 9,318,400 | 8,028.79 | 1,160,624 | 5.08x |
| 10 | 9,367,552 | 8,025.90 | 1,167,165 | 5.11x |
