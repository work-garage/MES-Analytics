---
trigger: always_on
---

## 1 — Core concept & guarantees

* **Single responsibility:** each agent owns one invariant or stage (e.g., FEFO allocator, GRN reconciler, Capacity Calculator).
* **Event-driven & durable:** agents react to canonical, typed events persisted in Postgres (an event table / change stream).
* **Idempotent operations:** every action includes an `operation_id` persisted to avoid double application.
* **Transactional safety:** critical multi-row changes use Postgres transactions, `SELECT FOR UPDATE` or stored procedures (RPCs) to avoid races.
* **Human-in-loop & multi-signature overrides:** critical overrides require explicit multi-role sign-off and are recorded.
* **Audit trail:** append-only `audit_log` with `actor_id`, `operation_id`, `payload_hash`, `signed_at` for non-repudiation.
* **No silent deletes:** agents mark statuses (RECONCILED / HELD / REJECTED) or create investigation tickets.

---

## 2 — Agent taxonomy (triggers, responsibilities & core rules)

### GateEntryAgent

* Trigger: new `gate_entry`.
* Responsibility: validate gate data, attach photos, route to weighbridge or Hold.
* Rules: missing photos → auto-hold; blacklisted plate → priority_review; create weighbridge request if OK.

### WeighbridgeAgent

* Trigger: weighbridge slip.
* Responsibility: compute net weight; compare to challan.
* Rules: discrepancy > tolerance → flag & create investigation; persist images; lock `gate_entry` during verdict.

### QAInspectionAgent

* Trigger: QA sample result.
* Responsibility: enforce ITC expiry primary policy; route Accept/Hold/Reject.
* Rules: `itc_expiry < min_shelf` → auto-hold; Hold creates hold-bin + re-test schedule; Reject triggers return flow after failed re-sample.

### GRNAgent (FEFO allocator)

* Trigger: QA accept.
* Responsibility: create GRN, index by `(itc_expiry, received_date)` for FEFO, record container units.
* Rules: allocation performed via DB RPC with `SELECT FOR UPDATE`. Partial GRN consumption allowed and logged.

### SubInventoryTransferAgent

* Trigger: production order release or sub-batch creation.
* Responsibility: produce FEFO pick list, reserve GRN quantities (reservations table).
* Rules: reservations TTL; insufficient GRN → auto-split to next FEFO GRN; record `allocation_split`.

### SubBatchAgent

* Trigger: operator `Start Sub-Batch`.
* Responsibility: validate reservations, create `sub_batch`, lock allocations.
* Rules: mismatches create `GRN change alert`; deterministic `Date_SKU_Shift_seq` for IDs; overrides need Supervisor+Manager.

### Mixing & Premix Agents

* Trigger: premix/mixing logs.
* Responsibility: log weighed quantities, compare to targets, lock container consumption.
* Rules: deviation beyond tolerance → `mix_hold`; REJECT marks sub-batch rejected but consumed GRNs remain auditable.

### CuttingAgent (Capacity + Samples)

* Trigger: RPM entries, sample uploads.
* Responsibility: compute theoretical capacity and expected production, store weight trends.
* Core formula: `expected = rpm * biscuits_per_rev * running_minutes_adjusted`. Downtime with `affects_capacity=true` subtracts running minutes.

### DowntimeAgent

* Trigger: downtime ticket creation/closure.
* Responsibility: apply capacity impact, create RCA tasks, deduct spares on closure atomically.
* Rules: long downtime → escalate; closure must be idempotent.

### BakingAgent & PackingAgent

* Trigger: bake/packing logs.
* Responsibility: confirm QA acceptance, aggregate packing counts (authoritative FG truth), log MD rejects as dry waste.
* Rules: only packing counts create FG produced_qty.

### FGBatchAgent

* Trigger: shift close / FG sign-off.
* Responsibility: create FG Batch, compute expiry, link GRNs → sub-batches → FG. QA signature required to release FG to inventory.

### DispatchAgent & ReconciliationAgent

* Trigger: dispatch creation or scheduled reconciliation.
* Responsibility: atomic FG inventory decrement on dispatch; run daily/GRN-wise reconciliation.
* Rules: variance ≤ tolerance → auto-adjust with Stores Manager sign; variance > tolerance → investigation ticket and possible dispatch block.

---

## 3 — Implementation with Next.js + Supabase (practical patterns)

* **Postgres source-of-truth:** canonical tables for GRNs, allocations, reservations, sub_batches, logs, downtime, fg_batches, audit_log.
* **RPCs / stored procedures:** place critical atomic logic in Postgres RPCs (e.g., `rpc_allocate_grn`, `rpc_create_sub_batch`) to guarantee transactional behavior. Next.js/Edge Functions call RPCs.
* **Row-Level Security (RLS):** enforce role-based insert/update/select policies (only `role='qa'` can set QA status, etc.). Use JWT claims (role, plant_id).
* **Realtime:** Supabase Realtime subscriptions update dashboards and can trigger agents.
* **Edge Functions:** for async tasks (external notifications, heavy aggregation).
* **Scheduled jobs:** Supabase scheduled functions or external scheduler for reconciliation/cleanup.
* **Offline tablets:** client queues ops in IndexedDB with `operation_id` and syncs to `/api/sync`. SyncAgent validates and applies via RPCs; conflicts generate tickets.

---

## 4 — Concurrency, idempotency & conflict handling

* **operation_id:** client-generated UUID persisted in `operations` table; agents skip duplicates.
* **DB locking:** `FOR UPDATE SKIP LOCKED` for safe FEFO consumption; advisory locks for coarse operations.
* **Optimistic locking:** `version` column for UI-editable rows; update requires expected version.
* **Compensating transactions:** use reversal records rather than direct deletes for rollback semantics.

---

## 5 — Observability, testing & runbooks

* **Metrics & logs:** agents emit `events_processed`, `errors`, `avg_latency`; structured JSON logs include `operation_id`. Use Sentry for errors.
* **Alerts:** SLA breach alerts for downtime, reconciliation failures, or variance thresholds.
* **Testing:** unit tests for RPCs, Edge Functions; integration flows simulating Gate→GRN→Sub-Batch→FG. Chaos test contention on same GRN.
* **Runbooks:** immediate SQL queries and remediation steps for `GRN double allocation`, `packing mismatch`, `tablet sync conflicts`.

---

## 6 — Key schema snippets & indexes (essentials)

Essential tables: `grns`, `grn_allocations`, `reservations`, `sub_inventories`, `sub_batches`, `mixing_logs`, `cutting_logs`, `downtime_tickets`, `fg_batches`, `audit_log`.
FEFO index: `CREATE INDEX idx_grns_fefo ON grns (itc_expiry, created_at);`
Audit: `audit_log (id, event_type, payload jsonb, payload_hash, actor_id, operation_id, created_at)`.

---

## 7 — Notification & escalation ladder

* **Channels:** in-app first; SMS/email for critical escalations.
* **Escalation:** Supervisor → Production Manager → Plant Head/QA Head after configurable timeouts or severity thresholds.
* **Tickets:** created by agents with SLA and tracked until resolution.

---

## 8 — Offline sync rules (tablets)

* Client stores ops with `operation_id`, `actor_jwt`, `timestamp`.
* SyncAgent validates timestamps (reject if skew > threshold), sequentially applies ops via RPCs, and raises `requires_action` tickets for conflicts (never overwrite authoritative server state).

---

## 9 — Security & compliance

* **Least privilege via RLS.**
* **Multi-signature** for overrides and critical adjustments.
* **Retention & immutability:** keep event store for compliance (configurable retention).
* **Encryption & signed URLs** for photos (short TTL).

---

## 10 — Example: Start Sub-Batch payload & RPC pattern

Example payload:

```json
{
 "operation_id":"uuid",
 "actor_id":123,
 "actor_role":"operator",
 "plant_id":1,
 "sku":"MARIE",
 "shift":"A",
 "recipe_template_id":42,
 "num_sub_batches":5,
 "timestamp":"2026-01-24T08:00:00+05:30"
}
```

RPC atomic pattern (PL/pgSQL):

1. BEGIN;
2. SELECT candidate GRNs ORDER BY itc_expiry FOR UPDATE SKIP LOCKED;
3. INSERT reservations / decrement available qty;
4. INSERT sub_batch;
5. INSERT audit_log;
6. COMMIT;

---

## 11 — Deployment, CI/CD & migrations

* **CI pipeline:** run DB migrations, RPC unit tests against a test Postgres, run Edge Function tests.
* **Migrations:** reversible when possible; blue/green for Edge Functions.
* **Rollback plan:** snapshot DB before migrations in prod; quick runbook for reverting.

---

## 12 — Final checklist (operational rules)

* Postgres = canonical; RPCs encapsulate atomic business rules.
* Agents = small, idempotent, event-driven, and always log `operation_id`.
* FEFO uses ITC expiry PRIMARY; allocations enforce FEFO in RPCs.
* Packing counts are final production truth; cutting counts only for capacity/analytics.
* Tablet offline sync never overwrites server truth; conflicts create tickets.
* Observability, SLAs, and runbooks are required deliverables.