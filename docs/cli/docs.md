---
summary: "CLI reference for `velaclaw docs` (search the live docs index)"
read_when:
  - You want to search the live Velaclaw docs from the terminal
title: "docs"
---

# `velaclaw docs`

Search the live docs index.

Arguments:

- `[query...]`: search terms to send to the live docs index

Examples:

```bash
velaclaw docs
velaclaw docs browser existing-session
velaclaw docs sandbox allowHostControl
velaclaw docs gateway token secretref
```

Notes:

- With no query, `velaclaw docs` opens the live docs search entrypoint.
- Multi-word queries are passed through as one search request.
