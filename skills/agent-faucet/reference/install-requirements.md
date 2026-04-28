# Installing Requirements

The skill scripts require Bun and Foundry's `cast` command at runtime.

## Bun

Install Bun with the official installer:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version
```

## Foundry Cast

Install Foundry with the official installer:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify `cast`:

```bash
cast --version
```

If `bun` or `cast` is not found after installation, open a new shell or make sure the installer-added bin directory is on `PATH`.
