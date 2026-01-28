# Implementation plan — **Unified Manufacturing, Inventory, Production & Capacity Management Platform**

*(Deep, end-to-end, phased — follows your system-info & implementation doc exactly; Next.js + Supabase stack.)*

Below is a comprehensive implementation plan divided into phases. Every process step and required field from your specification is included, plus precise data models, business rules, API/RPC ideas, UI screens, validation, sign-off mechanics, RLS and infra notes, sync/offline considerations, analytics design, QA and rollout artifacts.
---

# PHASE 0 — Discovery & Preparation (pre-development)

Goals: lock requirements, stakeholders, glossary, success criteria, non-functional requirements.

Deliverables (artifact list)

* Final Requirements Document (this spec confirmed).
* Data dictionary (term → definition): GRN, Sub-Inventory, Sub-Batch, FG Batch, FEFO, ITC expiry.
* User & role matrix (Gate Security, Weighbridge Op, L1/L2 inspector, QA, Stores Exec/Manager, Planner, Operator, Supervisor, Maintenance, Packing Supervisor, Dispatch).
* Acceptance criteria per screen/process (pass/fail rules).
* Integration inventory (weighbridge, barcode scanners, HMI sensors, camera).
* Security & compliance checklist (audit trail, tamper-proof sign-offs).
* Cutover plan & data migration strategy for historical GRNs/inventory.

Key decisions to make now (must be finalized)

* Primary key patterns (UUID vs serial). Recommendation: UUIDv4 for distributed writes.
* Canonical time zone for timestamps (plant local; include offset). You must store UTC + local offset in all records.
* Photo/attachment retention policy and storage tiers.
* Offline mode scope for tablets (yes/no). Recommend limited offline for line tablets with sync queues.

---

# PHASE 1 — Core Data Model & Backend Foundation (Supabase)

Goal: implement robust Postgres schema, RLS, Storage buckets, Edge Functions, and initial seeded data.

## 1.1 Data model (high-level tables; fields include all required ones from your doc)

Key tables (core columns shown — all include `created_by`, `created_at`, `updated_at`):

### `vendors`

* `id` (uuid)
* `name`, `vendor_code`
* contact fields, default lead times

### `materials` (master)

* `id`, `material_code`, `name`, `category` (RM/packaging)
* `unit` (kg, pcs), `container_type` (bag/drum/roll)
* `tolerance_pct`, `shelf_life_days`, `fefo_priority` flags

### `grns` (Goods Received Note)

* `id` (uuid), `grn_no` (unique), `vendor_id`, `vehicle_no`, `challan_no`, `challan_date`
* `expected_qty`, `net_qty` (kg), `gross_weight`, `tare_weight`
* `weighbridge_slip_no`, `weighbridge_photo_path` (storage ref)
* `driver_name`, `driver_mobile`
* `itc_expiry_date`, `vendor_expiry_date`, `storage_location`, `status` (RECEIVED/HELD/REJECTED)
* `gate_photo_path`, `seal_photo_path`
* `hold_reason` nullable
* `signed_by` (user id), `signed_at`

### `grn_items` (if multiple materials per GRN)

* `id`, `grn_id`, `material_id`, `qty`, `container_count`, `container_unit_weight`

### `container_inventory`

* `id`, `grn_id`, `container_type`, `units_available`, `reusable_flag`, `linked_location`

### `main_inventory` (material + grn granularity)

* `id`, `material_id`, `grn_id`, `available_qty`, `reserved_qty`, `location_bin`, `lot_expiry` (ITC primary)

### `sub_inventories` / `sub_inventory_transfers`

* `id`, `transfer_no`, `from_location`, `to_location` (sub-inv), `transfer_date`
* `items`: array of `{grn_id, material_id, qty}` (or use `sub_inventory_transfer_items`)

### `recipe_templates`

* `id`, `name`, `sku_id`, `version`, `components` JSON array `{material_id, qty_per_subbatch, tolerance_pct}`, `notes`, `created_by`

### `production_orders`

* `id`, `po_no`, `sku_id`, `planned_qty`, `shift`, `planner_id`, `status`

### `master_batches` (SKU level master batch referencing sub-batches)

* `id`, `master_batch_no` (`Date_SKU_Shift`), `sku_id`, `shift`, `created_by`

### `sub_batches`

* `id`, `sub_batch_no`, `master_batch_id`, `recipe_template_id`, `num_sub_batches`?
* `allocations` JSON / link table showing `{grn_id, material_id, qty_allocated}`
* `status` (CREATED/STARTED/MIXED/REJECTED/COMPLETED)
* `start_time`, `end_time`, `operator_id`, `supervisor_ack`

### `premix_logs`

* `id`, `sub_batch_id`, `grn_allocations`, `target_qty`, `actual_weighed_qty`, `operator_id`, `start_time`, `end_time`, `photo_path`

### `mixing_logs`

* `id`, `sub_batch_id`, `start_time`, `end_time`, `mixer_speed`, `dough_temp`, `pH`, `result` (OK/HOLD/REJECT), `dough_waste_kg`, `operator_id`, `qa_signoff_id`

### `cutting_logs`

* `id`, `sub_batch_id`, `start_time`, `stop_time`, `rpm`, `downtimes` JSON, `wet_waste_kg`, `stack_samples` JSON `{sample_id, weight, photo}`, `operator_id`

### `downtime_tickets`

* `id`, `machine_id`, `start_ts`, `end_ts`, `reason_code`, `affects_capacity` (boolean), `parts_used` JSON, `photos`, `closed_by`, `status` (OPEN/CLOSED)

### `oven_logs`

* `id`, `sub_batch_id`, `bake_start`, `bake_end`, `gauge`, `moisture_pct`, `sample_stack_weight`, `color_rating`, `taste_check`, `qa_action` (OK/HOLD), `operator_id`

### `packing_logs`

* `id`, `machine_id`, `sku_id`, `pack_size`, `start_ts`, `stop_ts`, `packs_produced`, `wrapper_lot`, `wrapper_consumption`, `wrapper_waste`, `md_reject_count`, `operator_id`

### `fg_batches`

* `id`, `fg_batch_no`, `sku_id`, `shift`, `produced_qty`, `good_qty`, `scrap_qty`, `md_qty`, `sub_batches_used` (array or link table), `manufacture_datetime`, `expiry_date`, `storage_loc`, `sign_off_by` (fg_incharge)

### `dispatches`

* `id`, `dispatch_no`, `fg_batch_id`, `quantity`, `destination`, `truck_no`, `transporter`, `lr_no`, `dispatch_datetime`, `driver_name`, `photos`

### `inventory_audits`

* `id`, `type` (DAILY/GRN_MONTHLY), `performed_by`, `performed_at`, `items` array `{material_id, grn_id, system_qty, physical_qty, variance, reason}`, `approvals`

### `analytics_events` / `audit_logs`

* append-only logs capturing every critical action (who, what, previous_state, new_state, timestamp, signature_hash)

> Implementation note: Many fields can be stored as normalized tables or JSONB arrays depending on query needs. Prefer normalized for critical numeric fields to allow proper aggregation in SQL.

## 1.2 DB constraints & triggers (enforce business rules)

* Constraint: GRN must have `itc_expiry_date` and `vendor_expiry_date`.
* Trigger `grn_after_insert` to update `main_inventory` and `container_inventory`.
* Trigger to prevent negative `available_qty`.
* Trigger or stored function to allocate FEFO (select from `main_inventory` ordered by `itc_expiry_date` asc, then grn_date asc).

## 1.3 Supabase specific items

* Use Supabase Auth for user management (SAML/SSO optional for corporate).
* Supabase Storage buckets for `weighbridge_photos`, `pallet_photos`, `stack_photos`, `attachments`.
* Edge Functions (Deno) for compute-heavy RPC (capacity calc, FEFO allocation preview, inventory reconciliation routines) and for external integrations (weighbridge REST hook).
* Postgres functions exposed via Supabase RPC for atomic operations: `rpc_allocate_subbatch`, `rpc_create_grn`, `rpc_transfer_to_subinventory`, `rpc_close_downtime_ticket`.

## 1.4 Row Level Security (RLS)

* Policy examples:

  * `grns`: only Stores role + QA role can insert; gate role can insert limited fields; sign-off columns require higher privilege.
  * `sub_batches`: operators may create with `created_by = auth.uid()`; only supervisors or managers can change status from REJECTED → override.
* All write operations must be logged into `audit_logs` with `auth.uid()`.

## 1.5 Seed data

* Machines, reason codes, downtime categories, biscuits per revolution master data, SKU master, sample tolerance values.

Deliverables: DB schema SQL, RLS policies, Postgres functions, Edge functions scaffold, storage bucket config.

---

# PHASE 2 — Business Logic & Serverless APIs

Goal: implement transactional RPCs and business logic to enforce FEFO, expiry precedence (ITC primary), capacity calculations, and sign-off flows.

## 2.1 Core RPCs / Functions (atomic transactions)

* `rpc_create_grn(grn_payload)`: validates fields, computes net weight, inserts `grns` and `grn_items`, stores attachments URLs, triggers `main_inventory` update.
* `rpc_accept_qa_sample(sample_payload)`: sets QA decision; if ACCEPT → calls `rpc_create_grn`.
* `rpc_transfer_to_subinventory(transfer_payload)`: FEFO allocation logic (select GRNs ordered by `itc_expiry_date` asc, then grn_date asc), create transfer records, reserve quantities.
* `rpc_create_subbatch(master_batch_id, num_subbatches, operator_id)`: creates `sub_batches`, computes `allocations` (read-only to operator), locks reserved quantities.
* `rpc_start_premix(sub_batch_id)`, `rpc_end_premix(...)`, `rpc_end_mixing(...)`: update logs and status.
* `rpc_log_cutting_interval(...)`: append rpm, start/stop, downtimes.
* `rpc_create_downtime_ticket(ticket_payload)`: creates ticket, notifies maintenance channel.
* `rpc_close_downtime_ticket(ticket_id)`: compute downtime minutes, mark affects capacity flag, update capacity aggregates.
* `rpc_create_fg_batch(packing_summary)`: verifies packing counts equal produced_qty; creates FG batch; computes expiry_date from SKU shelf life.
* `rpc_dispatch_fg(dispatch_payload)`: reduces FG inventory, records photos.

## 2.2 Business rules enforced in RPCs

* FEFO allocation must always use `itc_expiry_date` as primary sort key. If `itc_expiry_date` missing — auto-hold GRN.
* Overrides require `supervisor_approval` record stored with reason and approver id.
* Output drives truth: `rpc_create_fg_batch` uses packing counts as final source of truth; cutter theoretical counts only for analytics.
* Downtime `affects_capacity` flagged → subtract from runtime in capacity formulas.
* All critical operations must include `signature` (user id hash) and `signed_at`.

## 2.3 Notifications & workflows

* Use Supabase Realtime / Edge Functions to push notifications to web sockets for:

  * GRN Hold/Reject notifications to Stores + QA.
  * FEFO allocation switch during active sub-batch.
  * MD reject spikes alert to QA.
  * Downtime tickets with affects_capacity to Production Manager.

Deliverables: API spec, JSON contracts, Postgres RPCs, event hooks, notification channels.

---

# PHASE 3 — Frontend Implementation (Next.js)

Goal: build web UI for management dashboards and tablet/mobile UI for shopfloor; ensure offline sync for tablets.

## 3.1 High level architecture

* Next.js app (App Router recommended). Typescript.
* Component system (Atomic): `FormField`, `SignaturePad`, `AttachmentUploader`, `ScannerInput`, `CapacityCard`.
* State management: use React Query or SWR for server state; offline queue for tablets (IndexedDB + service worker) to queue actions when offline.
* Auth: Supabase Auth integration with passwordless or SSO; roles mapped to Supabase claims.

## 3.2 Screens / Pages (each maps to process step)

1. **Gate Entry** (tablet/mobile)

   * Auto Date/Time, Vehicle number, Vendor dropdown, Material dropdown, Challan no & date, Driver, Expected qty, Photo capture (vehicle & seal).
   * Actions: `Allow → Weighbridge` or `Hold` (reason required).
   * Sign-off: gate operator signature component (digital sign captures `user_id`, `timestamp`, stores signature image + hash).

2. **Weighbridge**

   * Inputs: weighbridge slip scan/photo, gross, tare (net auto), weighbridge photo.
   * Compare net vs challan; if discrepancy > tolerance → flag.
   * Sign-off: weighbridge op & stores supervisor (dual signature flow).

3. **Vehicle Inspection L1/L2**

   * Checklist (Yes/No), mandatory remarks when No.
   * Decisions: Pass → to QA; Fail → Final reject — capture reason and photos.
   * Dual sign-off L2 + Stores In-charge.

4. **QA Sample & Lab**

   * Auto Sample ID.
   * Fields: sampling time/loc, vendor mfg date, vendor expiry, ITC expiry (auto highlighted), appearance, moisture %, odour, foreign matter (Y/N), attachments.
   * Decision buttons: Accept/Hold/Reject. Hold -> schedule re-test (date field).
   * On Accept → `Create GRN` flow.

5. **GRN Creation**

   * Pre-fill fields; approve, print pallet barcode, link to photos.
   * FEFO key shown (itc_expiry + grn_date).
   * Sign-off Stores Exec + Stores Manager.

6. **Main Inventory & Container View**

   * GRN-wise listing, quantity, expiry, container units.
   * Actions: transfer to Sub-Inventory (opens allocation preview using FEFO RPC).
   * Alerts on near depletion.

7. **Transfer to Sub-Inventory**

   * Pick production order, show FEFO pick list; allow partial GRN allocation; scan destination bin; confirm at line (operator scan).
   * Sign-off: Stores Issuer + Line-In-charge.

8. **Recipe Template Builder**

   * Drag & drop materials, set qty per sub-batch, set tolerances, save versions.

9. **Add Sub-Batch (Operator Tablet)**

   * Select recipe, enter number of sub-batches, show allocation summary (GRN numbers).
   * Confirm recipe shown (Yes/No) -> operator acknowledges allocations.
   * Start Sub-Batch (button) -> creates sub-batch and locks allocations. No manual GRN picking.
   * Override modal requires Supervisor approval; log reason.

10. **Premix & Mixing Screen**

    * Premix: weigh scale photo upload, target vs actual.
    * Mixing: mixer speed, dough temp, pH, start/end.
    * Buttons: Mark REJECT/HOLD; on REJECT -> logs elimination reason.
    * QA sign-off if HOLD.

11. **Cutting Screen (Capacity Card + Sampling)**

    * Capacity card: live RPM input, biscuits/rev master data, theoretical biscuits/min computed and displayed.
    * Start/stop interval, downtime log modal (start auto with timestamp), stack sampling modal (photo mandatory).
    * Live waste logging UI with photo and reason picklist.
    * Sign-off: operator + supervisor.

12. **Downtime Ticket Screen**

    * Create/Update tickets, upload photos, parts used (select from spare parts catalog).
    * Checkbox: “affects_capacity” required for oven/cutter.
    * On close: maintenance engineer + line in-charge sign-off.

13. **Oven Screen**

    * Bake start/end, gauge, moisture, sample stack weight, QA acceptance/reject flow.

14. **Packing & MD Screen**

    * Per machine: run button, packs produced counter, wrapper lot scan, wrapper consumption, MD reject count capture + photo, live waste entries.

15. **FG Batch Creation**

    * Auto generated FG batch per SKU per shift, shows packing counts (final truth), sub-batches used list, GRNs used proportionally, expiry calculation.
    * Sign-off FG in-charge + Warehouse Supervisor.

16. **Dispatch**

    * Link FG batch, select qty, truck details, LR/challan, photo of loaded pallet (photo mandatory), sign-off dispatch + QA clearance if needed.

17. **Inventory Reconciliation**

    * Daily short count screen: operator inputs physical opening/closing, system shows system balances; adjustments capture reason & approval.
    * Monthly audit workflow with two-level approval & audit ticket.

18. **Dashboards & Analytics**

    * Shift Summary, Capacity vs Actual, GRN expiry exposure, MD Reject spike charts, Downtime RCA lists, Waste & Loss dashboards.
    * Drilldown from high-level KPI to GRN → sub-batch → packing.

## 3.3 UI/UX details & constraints

* Tablet UI: large touch targets, offline queue indicator, camera access for mandatory photos.
* Mobile responsive: for supervisors/managers.
* Data validation: prevent save unless required photos and fields present.
* Signature pad: capture vector signature + `user_id` hash store in `audit_logs`.

## 3.4 Offline & Sync

* For line tablets: local IndexedDB queue and optimistic UI.
* Sync strategy: idempotent RPCs with client UUIDs; conflict resolution rules (server wins for allocations).
* Attachments: save as base64 locally until upload on network restore.

Deliverables: Next.js repo scaffold, component library, pages, mobile/tablet UI flows, offline sync module.

---

# PHASE 4 — Integrations & Hardware

Goal: connect weighbridge, barcode scanners, simple HMI sensor input, and optional PLCs.

## 4.1 Weighbridge & vehicle camera

* Integration via Edge Function endpoint that receives weighbridge slips and photos (POST).
* Weighbridge integration must call `rpc_create_grn` or update weighbridge fields on an existing gate entry.
* If hardware can emit webhooks — register secure webhook with HMAC verification.

## 4.2 Barcode & pallet printers

* Use standard USB/Bluetooth printers; Next.js front-end triggers print via browser print or native app wrapper on tablets.
* Pallet barcode generation: use deterministic `GRN` + `container_seq` encoded to Code128.

## 4.3 Simple sensor/HMI (RPM)

* If sensor available, connect to a local edge device that POSTs RPM data to the `rpc_log_cutting_interval` endpoint in near real-time.
* Fallback: operator manual enter.

## 4.4 Mobile scanning & camera

* Use browser Media API for camera capture; implement scanning with `@zxing/library` or use native app wrapper if needed.

Deliverables: integration adapters, Edge Function connectors, hardware config docs.

---

# PHASE 5 — Quality, Testing & Validation

Goal: exhaustive testing according to acceptance criteria.

## 5.1 Test types

* Unit tests for all RPCs (simulate concurrent allocation to ensure FEFO).
* Integration tests: end-to-end flow from Gate → GRN → Sub-Inventory → Sub-Batch → FG → Dispatch.
* Load testing: simulate many concurrent packing logs and allocate transactions.
* Security tests: RLS rules validation, privilege escalation checks.
* Offline sync tests: conflict resolution scenarios.

## 5.2 Test cases (examples)

* GRN with ITC expiry earlier than vendor expiry: ensure FEFO sorts using ITC first.
* Partial GRN allocation across multiple transfers: check correct split logging.
* Sub-batch allocation: operator cannot change allocations; override path requires supervisor + manager approval.
* Downtime flagged affects_capacity: capacity calculation subtracts downtime minutes.
* Mixing REJECT: sub-batch flagged rejected and not advanced; GRN allocations consumed but analytics reflect elimination.
* FG Batch creation: packing counts override cutter theoretical counts.

Deliverables: Test plan, automated test suites, QA sign-off report.

---

# PHASE 6 — Analytics, Reports & Alerts

Goal: central analytics engine & actionable alerts.

## 6.1 Key KPIs & computations

* **Capacity expected** = `biscuits_per_rev * RPM * (running_minutes - downtime_affecting_capacity_minutes)`
* **Capacity vs Actual** = expected_biscuits - packing_count
* **Downtime minutes per machine** and % downtime affecting capacity
* **Waste by stage** = sum(wet_waste + dry_waste) by process
* **GRN expiry exposure** = qty by nearest ITC expiry buckets
* **Physical vs System variance** = variance% per material/grn

## 6.2 Implementation

* Use Postgres materialized views / scheduled processes (Edge Functions) to compute aggregates.
* Use Supabase Realtime + Next.js charts for near-real-time dashboards.
* Alerts:

  * GRN near depletion → Planner & Stores (email/SMS/WS).
  * Variance > tolerance → auto create inventory investigation ticket.
  * MD reject spike threshold breach → QA alert + email.

Deliverables: dashboard pages, API endpoints for reports, scheduled refresh jobs.

---

# PHASE 7 — Security, Compliance & Operations

Goal: secure, auditable system with backups and monitoring.

## 7.1 Security & audit

* All critical actions logged in `audit_logs` and immutable append-only table.
* Attach digital signature metadata (user id, timestamp, hash of payload + server salt).
* RLS policies per table; minimal privileges for each role.
* Encryption at rest (Supabase storage) and TLS in transit.

## 7.2 Backups & DR

* Regular DB backups (point-in-time if needed), storage backups for attachments.
* Disaster recovery playbook.

## 7.3 Monitoring

* Error tracking (Sentry), Edge Function metrics, DB slow query logs.
* Uptime checks for Edge Functions and web frontends.
* Daily health report: missing manual counts, stuck offline sync items, unclosed downtime tickets.

Deliverables: security policy, DR playbook, monitoring dashboards.

---

# PHASE 8 — Training, Documentation & Rollout

Goal: plant adoption via training, SOP docs, and staged rollouts.

## 8.1 Training

* Create role-specific training modules (Gate, Weighbridge, QA, Operator, Supervisor, Stores, Maintenance).
* Provide pocket SOP quick guides for tablet screens.
* Hands-on UW (user workshops) and cheat-sheets.

## 8.2 Documentation

* API docs (OpenAPI) for internal integrations.
* Admin guide for RLS & user management.
* Troubleshooting guide for sync conflicts, hardware failures.

## 8.3 Rollout strategy (recommended)

* Pilot one line/shift first (test all flows).
* Validate with 2-week parallel run (paper + digital) then cutover.
* Full plant roll-out with support window and hypercare.

Deliverables: training curriculum, user manuals, pilot checklist, cutover plan.

---

# PHASE 9 — Continuous Improvement & Extensions

* Add PLC/SCADA integration for fully automated production counts.
* Predictive maintenance (ML) using downtime & parts usage.
* Advanced shelf-life FEFO optimization (dynamic allocation).
* Multi-plant replication & enterprise roll-up dashboards.

---

# Business logic & validations — condensed authoritative rules (implement exactly)

* **GRN is the unit of consumption**: all raw material movement must reference a `grn_id`.
* **Expiry priority**: sort by `itc_expiry_date` primary; vendor expiry secondary. If ITC expiry missing, auto-hold.
* **Output drives truth**: packing counts inserted in `packing_logs` → `fg_batches` are canonical. Cutting theoretical flows are for capacity/analytics only.
* **All critical entries require electronic sign-off**: each critical action has `signed_by` + `signed_at` + `signature_hash` in `audit_logs`.
* **No manual GRN picking** on sub-batch creation: allocations must be auto FEFO; manual override requires Supervisor + Manager approval and reason saved.

---

# Example SQL snippets (starter)

```sql
-- GRN table
CREATE TABLE grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no text UNIQUE NOT NULL,
  vendor_id uuid NOT NULL,
  vehicle_no text,
  challan_no text,
  challan_date timestamptz,
  gross_weight numeric,
  tare_weight numeric,
  net_qty numeric,
  itc_expiry_date date NOT NULL,
  vendor_expiry_date date,
  storage_location text,
  weighbridge_slip_no text,
  weighbridge_photo text,
  gate_photo text,
  status text CHECK (status IN ('RECEIVED','HELD','REJECTED')),
  hold_reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
```

(You will expand to all tables above; keep numeric types precise, index expiry fields and grn_no.)

---

# Testing & Acceptance criteria (top items)

* FEFO allocation test: when two GRNs exist with differing ITC expiry, sub-inventory transfer must allocate earlier ITC expiry first.
* Downtime capacity test: `affects_capacity = true` reduces expected capacity in dashboard math.
* Packing counts override: when `fg_batch` created, packing counts must be source-of-truth and reconcile with earlier theoretical counts producing analytics mismatch.
* Audit immutability: `audit_logs` entries cannot be deleted and must capture old/new states.

---

# Operational checklists (for plant ops)

* Before enabling production: seed `machines` and `biscuits_per_rev` master data.
* Daily: confirm weighbridge receipts uploaded and QA samples cleared for that day.
* Shift end: operators must complete start/stop logs and upload all mandatory photos (stack, pallet, MD rejects).
* Weekly: run GRN expiry exposure report and plan materials usage.

---

# Final recommendations & quick wins

1. **Start pilot with one SKU & one line.** Complexity is lower; all flows exercised. (Pilot recommended, not scheduled here.)
2. **Enforce mandatory photos by UI** and block sign-off if missing — prevents later disputes.
3. **Use Postgres functions for FEFO** to keep allocation atomic and avoid concurrent race conditions.
4. **Make audit trail searchable** (by grn_no, sub_batch_no, fg_batch_no) for fast RCA.
5. **Design capacity card UI** showing live RPM, expected vs actual, and downtime flag toggle.

---