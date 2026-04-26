---
summary: "Status of native macOS app signing in the public repository"
read_when:
  - Looking for macOS signing or packaging steps
title: "macOS Signing"
---

# macOS Signing

The public repository no longer ships native macOS app packaging or signing
scripts. The supported public build path is the Node-based Gateway/CLI package.

For local development on macOS, use:

```bash
pnpm install
pnpm build
pnpm check
```

Code signing is only relevant to native app distributions maintained outside
this public build tree.
