---
summary: "Setup guide for developers working on Velaclaw from macOS"
read_when:
  - Setting up a macOS development environment
title: "macOS Dev Setup"
---

# macOS Developer Setup

The public repository currently ships the Gateway/CLI runtime. It no longer
contains a native Swift app build tree or packaging scripts.

## Prerequisites

1. **Node.js 24 and pnpm**: recommended for the Gateway, CLI, Control UI, and tests.
2. **Xcode command line tools**: useful for native dependencies and macOS shell tooling.

## Install Dependencies

```bash
pnpm install
```

## Build and Check

```bash
pnpm build
pnpm check
pnpm lint
```

## Run the Gateway

```bash
velaclaw gateway start
velaclaw gateway status
```

If you are developing from the source checkout instead of a global install, use
the package scripts or `node velaclaw.mjs` from the repository root.
