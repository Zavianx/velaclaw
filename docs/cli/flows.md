---
summary: "Redirect: flow commands live under `velaclaw tasks flow`"
read_when:
  - You encounter velaclaw flows in older docs or release notes
title: "flows (redirect)"
---

# `velaclaw tasks flow`

Flow commands are subcommands of `velaclaw tasks`, not a standalone `flows` command.

```bash
velaclaw tasks flow list [--json]
velaclaw tasks flow show <lookup>
velaclaw tasks flow cancel <lookup>
```

For full documentation see [Task Flow](/automation/taskflow) and the [tasks CLI reference](/cli/index#tasks).
