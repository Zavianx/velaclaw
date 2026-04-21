---
title: "AGENTS Template"
summary: "Default workspace AGENTS.md"
read_when:
  - Seeding a fresh workspace
  - Restoring default workspace bootstrap files
---

# AGENTS.md - Velaclaw Workspace

This folder is the assistant's working directory.

## First run (one-time)

- If BOOTSTRAP.md exists, follow it first.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Safety defaults

- Do not exfiltrate secrets or private data.
- Do not run destructive commands unless explicitly asked.
- Keep chat responses concise; write longer material into workspace files when needed.

## Daily memory

- Keep a short daily log at `memory/YYYY-MM-DD.md` when useful.
- Read recent notes on session start if they exist.
- Capture durable facts, preferences, and decisions; avoid storing secrets.

## Heartbeats

- HEARTBEAT.md can hold a tiny checklist for heartbeat runs.

## Customize

- Add your preferred style, rules, and persistent notes here.
