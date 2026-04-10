# Velaclaw

<p align="center">
  <strong>Control plane for team AI</strong>
</p>

<p align="center">
  Shared intelligence • Private runtimes • Governed execution
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-early%20development-2ea44f">
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Docker-2496ED">
  <img alt="Foundation" src="https://img.shields.io/badge/foundation-OpenClaw-orange">
</p>

---

## ✨ What is Velaclaw?

Velaclaw is a **team AI control-plane concept** built on top of OpenClaw.

It is designed for teams that want to share AI capabilities **without collapsing privacy, credential, and runtime boundaries**.

Instead of treating AI agents like isolated chatbots, Velaclaw treats them like a governed team:

- 🧠 **shared team intelligence**
- 👤 **private member runtimes**
- 🐳 **isolated execution environments**
- 🗂️ **shared assets and private assets split by default**
- ✅ **approval-oriented handling for high-risk actions**

---

## 🧭 Why it exists

Most team AI products focus on chat, dashboards, or orchestration.

Velaclaw focuses on a harder problem:

> How do you let a team share AI capabilities **without turning the whole system into one giant shared trust boundary**?

Velaclaw is built around that question.

---

## 🏗️ Core ideas

### 1. Control plane + member runtimes
A primary control layer governs a set of member runtimes, instead of placing everything into one shared assistant context.

### 2. Shared assets + private assets
Velaclaw treats digital assets explicitly:

- shared team memory
- private member memory
- shared skills and workflows
- private bindings and credentials
- controlled snapshots for distribution

### 3. Isolation first
Member execution environments are intended to run with strong Docker isolation defaults:

- independent runtime directories
- no host Docker socket exposure
- read-only snapshot distribution where possible
- reduced privileges
- approval-gated high-risk actions

### 4. Governance over chaos
Velaclaw is designed around:

- policies
- approval flow
- clear asset boundaries
- runtime containment
- reproducible provisioning

---

## 🧩 Planned architecture

```text
                ┌─────────────────────────────┐
                │        Velaclaw Core        │
                │      (Control Plane)        │
                ├─────────────────────────────┤
                │ - team policies             │
                │ - shared memory             │
                │ - shared skills/tools       │
                │ - approvals / governance    │
                │ - snapshot distribution     │
                └──────────────┬──────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
      │ Member A    │  │ Member B    │  │ Member C    │
      │ Runtime     │  │ Runtime     │  │ Runtime     │
      ├─────────────┤  ├─────────────┤  ├─────────────┤
      │ private mem │  │ private mem │  │ private mem │
      │ private cfg │  │ private cfg │  │ private cfg │
      │ private sec │  │ private sec │  │ private sec │
      │ isolated ws │  │ isolated ws │  │ isolated ws │
      └─────────────┘  └─────────────┘  └─────────────┘
```

---

## 🚧 Current focus

Velaclaw is currently in **early development**.

Current work areas:

- team control-plane architecture
- isolated member runtime templates
- shared/private asset registry model
- provisioning workflows
- snapshot distribution model
- approval-oriented operation model

---

## 🎯 Product direction

Velaclaw is intended to sit at the intersection of:

- **team AI control plane**
- **shared/private asset governance**
- **isolated runtime management for OpenClaw-based teams**

---

## 💬 Taglines

- **Shared intelligence. Private runtimes.**
- **Govern your AI team, don’t just chat with it.**
- **Control plane for team AI.**

---

## 🌱 Status note

Velaclaw is still young by design.

The goal right now is to build the foundations well:

- a clean control-plane model
- strong runtime boundaries
- clear team/private asset separation
- a product shape that can scale without becoming chaotic
