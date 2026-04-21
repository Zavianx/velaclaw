# VelaClaw Manifesto

## The Problem

Your team is already using AI. Every member has their own chat window, their own context, their own habits. Knowledge gets discovered and forgotten in private conversations. Mistakes get repeated because no one saw the lesson the first time.

This isn't a tools problem. It's a coordination problem.

## Three Beliefs

### 1. Privacy is a right, not a feature

When a team member talks to AI, that conversation belongs to them. Not to the platform. Not to the manager. Not to the system.

VelaClaw enforces this architecturally: each member runs in an isolated Docker container with `cap_drop: ALL`, read-only filesystem, no Docker socket access. The control plane cannot read raw conversations.

### 2. Knowledge should flow, but with governance

The opposite of privacy isn't transparency — it's chaos. VelaClaw uses a governed publication flow:

```
draft → review → approve → publish → distribute
```

Members propose knowledge. Managers review it. Approved assets become part of the team's shared intelligence.

### 3. The system should evolve through use

VelaClaw's evolution engine periodically reads anonymized session summaries, distills patterns through an LLM, and generates shared knowledge assets automatically. The team gets smarter every day, without anyone doing extra work.

## Design Principles

1. **Control plane first.** Governance happens in one place.
2. **Isolation by default.** Member runtimes are ephemeral containers with minimal privileges.
3. **Governed flow over free sharing.**
4. **Evolution over documentation.**
5. **Audit everything.** Every action is logged.
6. **Run locally.** No cloud dependency.

---

_Built for teams that take AI seriously — and take privacy seriously too._
