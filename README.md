# Dryvn Atlas — BPO

Enterprise Intelligence Platform for Industrial Businesses. This is **Atlas BPO**:
DRYVN's business outsourcing machine that manages our Freelancer.com account —
finding projects, writing bids, handling client chats, and protecting delivery
capacity — with Claude-powered agents and a human approval gate.

All work is delivered in-house by DRYVN. Atlas books it; we build it.

## Agents

| Agent | Job |
|---|---|
| **Scout** | Polls Freelancer for new projects, filters the bid window, scores fit 0–100 |
| **Bid** | Writes outcome-priced proposals for good fits |
| **Comms** | Drafts chat replies; escalates pricing/scope/deadline decisions to the human |
| **Governor** | Enforces capacity rules — agents cannot override it |

## Guardrails (enforced in `src/lib/governor.ts`)

- Month 1: bid only on projects in the **$150–$600** band
- Max **3 concurrent** awarded/active projects
- Exception: up to **5 projects** when each is **$200–$300** and the combined
  delivery estimate fits inside **5 days**
- **Award acceptance is always a human click** — Atlas never signs work
- Approval gate on by default: bids and replies queue for review until the
  auto toggles are switched on in Settings

## Run it

```bash
npm install
cp .env.example .env.local   # add keys — or skip for demo mode
npm run dev                  # http://localhost:3000
```

Without keys Atlas runs in **demo mode**: sample projects, template proposals,
nothing sent anywhere — the full pipeline is clickable end-to-end.

## Stack

Next.js (App Router, TS, Tailwind) · SQLite (better-sqlite3, `data/atlas.db`) ·
Anthropic API · official Freelancer.com API
