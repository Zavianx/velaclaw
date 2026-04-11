<p align="center">
  <img src="pic/banner.jpg" alt="Velaclaw — A better way for teams to work with AI" width="100%" />
</p>

<h1 align="center">Velaclaw</h1>

<p align="center">
  <strong>A better way for teams to work with AI.</strong><br/>
  <sub>Shared where it should be. Private where it must be.</sub>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-early--access-orange" />
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Docker-blue" />
  <img alt="Built on" src="https://img.shields.io/badge/built%20on-OpenClaw-black" />
</p>

---

> Teams are already using AI.
> Velaclaw gives them a better way to work together.

Velaclaw gives teams a shared system for working with AI together — while keeping assets, runtimes, and boundaries clear.

---

## ✨ What Velaclaw is

Velaclaw is built around four ideas:

- **shared assets** the team can build on together
- **private member runtimes** for work that should stay isolated
- **agent workflows** that can be split, coordinated, and managed over time
- **approvals and boundaries** for actions that carry real risk

In Velaclaw, memory, skills, tools, workflows, documents, and bindings are all treated as **assets**.
Some belong to the team. Others belong to the member.

---

## 🧭 Why it exists

Most teams already use AI across chat windows, scripts, agents, and tools.
What they usually do not have is a shared system the whole team can work from together.

Velaclaw gives teams a shared system they can actually build on together.
It is designed not just for one-off agent runs, but for AI work that can be split, coordinated, and managed over time.

It helps teams:

- build on shared assets over time
- keep member-specific work private where it should be
- introduce structure without turning collaboration into chaos
- put approvals around high-risk actions

---

## 🧩 Core capabilities

- **Shared assets** the team can keep building on together
- **Private runtimes** for member-specific execution
- **Agent workflows** for work that needs to split, coordinate, and run over time
- **Read-only asset distribution** for controlled sharing
- **Approval-aware operations** for higher-risk actions
- **Docker-based isolation** for practical deployment today

---

## 🏗️ Architecture

```text
    ┌─────────────────────────────────────────────────┐
    │              Control Plane (Host)                │
    │                                                  │
    │   policies  ·  shared-assets  ·  approvals       │
    │   asset-distribution  ·  audit                   │
    └──────────┬──────────┬──────────┬─────────────────┘
               │          │          │
         ┌─────▼────┐┌────▼─────┐┌──▼───────┐
         │ Member A ││ Member B ││ Member C │
         │ (Docker) ││ (Docker) ││ (Docker) │
         │          ││          ││          │
         │ private  ││ private  ││ private  │
         │ assets   ││ assets   ││ assets   │
         │ runtime  ││ runtime  ││ runtime  │
         │ secrets  ││ secrets  ││ secrets  │
         └──────────┘└──────────┘└──────────┘
```

---

## 🌱 Status

Velaclaw is in active development.
The public repository is intended to communicate the product direction, architecture, and design principles as the system takes shape.

---

<p align="center">
  <strong>Built on <a href="https://github.com/openclaw/openclaw">OpenClaw</a></strong>
</p>
<p align="center">
  <em>A better way for teams to work with AI.</em>
</p>
