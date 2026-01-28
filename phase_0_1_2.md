# PHASE 0, 1 & 2 — **Very deep, intricate, end-to-end implementation plan**
---

# PHASE 0 — Discovery, Preparation & Agreement (the foundation)

## Goal

Lock down requirements, success criteria, stakeholders, data ownership, security/compliance and non-functional constraints so Phase 1 & 2 can be built without rework.

## Primary deliverables

1. **Final Requirements Document (FRD)** — canonicalised from the Problem Statement and Implementation you provided. Contains all fields, decisions, flows + examples.
2. **Data Dictionary** — every field, type, units, allowed values, mandatory/optional and validation rules (example: `itc_expiry_date: date, required, must be >= received_date`).
3. **Glossary** — GRN, FEFO, ITC expiry, Sub-inventory, Sub-batch, Master Batch, FG Batch, Wet/Dry waste etc.
4. **Stakeholder & Role Matrix** — who can do what (Gate security, Weighbridge, L1, L2, QA, Stores Exec, Planner, Operator, Supervisor, Maintenance, FG In-charge, Dispatch, Inventory Auditor).
5. **Success Criteria / Acceptance Tests** — high level pass/fail rules per flow (Gate → GRN, FEFO allocation, Sub-Batch start, FG creation, Dispatch).
6. **Non-Functional Requirements (NFRs)** — uptime, latency (UI <200ms for critical tablet screens), photo upload size limits, retention, offline RT capability.
7. **Integration Inventory** — hardware to integrate: weighbridge, barcode scanners, pallet printers, optional RPM sensors.
8. **Security & Compliance Checklist** — audit logging, RLS, data retention, encryption, backups.
9. **Cutover & Migration Plan** — how legacy paper/spreadsheet GRNs will be brought in (CSV import mapping template).
10. **Pilot Plan** — SKU/Line selected for pilot, scope, success gates.

---

## Key stakeholder decisions to finalise in Phase 0 (must be explicit)

* **Primary key format**: use UUIDv4 for global uniqueness. Human readable numbers for GRN/FG/Dispatch (like `GRN-20260126-0001`).
* **Canonical time storage**: store UTC in DB + `plant_timezone` (Asia/Kolkata) in plant metadata. Always show local time on UI but store UTC.
* **Photo retention policy**: e.g., keep weighbridge & pallet photos 7 years (audit), sample photos 2 years — define legal retention.
* **Offline scope**: support operator tablets offline for the line with limited capabilities (Start sub-batch, premix logs, mixing logs, cutting logs, packing logs) and queued uploads. Admin operations must be online.
* **Authentication**: Supabase Auth with SSO (OIDC/SAML) optional; fallback passwordless/email + 2FA for managers.

---

## Concrete artifacts to produce in Phase 0

* `FRD_v1.pdf`
* `data_dictionary.csv` (columns: field_name, table, type, units, required, validation rule, allowed values, UI label)
* `role_matrix.xlsx`
* `pilot_checklist.md`
* `migration_template.csv` (for importing historical GRNs and inventory)
* `hardware_spec_sheet.pdf` (weighbridge webhook format, camera resolution, RPM sensor spec)
* `acceptance_criteria.md` (signed by plant managers)

---

## Example items from data dictionary (short sample)

* `grns.grn_no`: string, format `GRN-YYYYMMDD-XXXX`, required, unique.
* `grns.itc_expiry_date`: date, required, validated: `itc_expiry_date >= received_date`.
* `sub_batches.status`: enum(`CREATED`,`STARTED`,`MIXED`,`REJECTED`,`COMPLETED`).
* `packing_logs.packs_produced`: integer, cannot be negative.

---

## Acceptance Criteria (Phase 0 sign-off)

* FRD signed by Production Manager, QA Head, Stores Head and IT.
* Pilot SKU & single line selected.
* All hardware vendors and integration spec signed.
* Migration CSV sample accepted by plant auditor (one full GRN import demo).
* Security posture accepted: RLS outline & audit log policy approved.

---

# PHASE 1 — Core Data Model, Supabase Setup & Backend Foundation

## Goal

Implement the database schema, storage buckets, auth, RLS, main Postgres functions and initial seed data. Build the backbone so business logic can be implemented in Phase 2.

---

## 1.1 DB philosophy & design principles

* **Normalized, audit-friendly design**: No destructive updates to GRN/master inventory without logged adjustments. Use `inventory_adjustments` table for corrections.
* **Append-only audit**: `audit_logs` table stores before/after snapshots for critical tables.
* **Atomic operations via Postgres functions**: allocations, transfers, batch creation should be atomic transactions inside RPCs.
* **Indexes on hot queries**: e.g., `itc_expiry_date`, `grn_no`, `material_id`, `sku_id`, `machine_id`, `status` fields.
* **JSONB for flexible nested structures**: e.g., `allocations` or `stack_samples` we prefer normalized tables unless real-time queries require JSONB.

---

## 1.2 Full table list (comprehensive) — with field sets and types

I'll provide the central tables; these capture your full process. (Use `uuid_generate_v4()` extension.)

### `users` (supabase auth + profile)

* `id uuid PRIMARY KEY`
* `email text`, `full_name text`, `role text` (enum), `plant_id uuid`, `disabled boolean`.

### `vendors`

* `id uuid PK`, `vendor_code text unique`, `name text`, `contact jsonb`.

### `materials`

* `id uuid PK`, `material_code text unique`, `name text`, `category text` (`RAW`, `PACKAGING`), `unit text`, `container_type text`, `tolerance_pct numeric`, `shelf_life_days int`, `is_food boolean`.

### `grns`

* `id uuid PK`
* `grn_no text UNIQUE NOT NULL`
* `vendor_id uuid REFERENCES vendors(id)`
* `vehicle_no text`
* `challan_no text`
* `challan_date date`
* `expected_qty numeric`
* `gross_weight numeric`
* `tare_weight numeric`
* `net_qty numeric`
* `weighbridge_slip_no text`
* `weighbridge_photo text` (storage path)
* `gate_photo text`, `seal_photo text`
* `driver_name text`, `driver_mobile text`
* `itc_expiry_date date NOT NULL`
* `vendor_expiry_date date`
* `status text CHECK (status IN ('RECEIVED','HELD','REJECTED'))`
* `created_by uuid`, `created_at timestamptz DEFAULT now()`

### `grn_items`

* `id uuid`, `grn_id uuid REFERENCES grns(id)`, `material_id uuid`, `qty numeric`, `container_count int`, `container_unit_weight numeric`.

### `main_inventory`  (GRN-level stock)

* `id uuid`, `material_id`, `grn_id`, `available_qty numeric`, `reserved_qty numeric DEFAULT 0`, `location_bin text`, `lot_expiry date`, `last_updated timestamptz`.

### `container_inventory`

* `id uuid`, `grn_id`, `container_type text`, `units int`, `reusable boolean`, `status text`.

### `sub_inventories`

* `id uuid`, `name text`, `plant_id uuid`

### `sub_inventory_transfers` + items:

* `id uuid`, `transfer_no text`, `from_location text`, `to_location text`, `created_by uuid`, `created_at`
* `sub_inventory_transfer_items`: `transfer_id`, `grn_id`, `material_id`, `qty`

### `recipe_templates`

* `id uuid`, `name text`, `sku_id uuid`, `version int`, `components jsonb`
  where `components` is array `{material_id, qty_per_subbatch, tolerance_pct}`

### `production_orders`

* `id uuid`, `po_no text`, `sku_id`, `planned_qty`, `shift text`, `planner_id`, `status`

### `master_batches`

* `id uuid`, `master_batch_no text`, `sku_id`, `shift text`, `created_by`, `created_at`

### `sub_batches`

* `id uuid`, `sub_batch_no text`, `master_batch_id`, `recipe_template_id`, `status text`, `allocations jsonb`
  `allocations` example: `[{"grn_id":"...","material_id":"...","qty_allocated":100}]`

### `premix_logs` / `mixing_logs` / `cutting_logs` / `oven_logs` / `packing_logs`

Each has fields described earlier: start/end timestamps, operator, photos (storage path), measured values (dough_temp, mixer_speed, pH, rpm), waste values, sample attachments.

Add `stack_samples` table (sample_id, sub_batch_id, weight_g, photo_path, timestamp, stack_type).

### `downtime_tickets`

* `id uuid`, `ticket_no text`, `machine_id`, `start_ts`, `end_ts`, `reason_code`, `affects_capacity boolean`, `parts_used jsonb`, `status` , `created_by`, `closed_by`.

### `fg_batches`

* `id uuid`, `fg_batch_no text`, `sku_id`, `shift`, `produced_qty integer`, `good_qty integer`, `scrap_qty integer`, `md_qty integer`, `sub_batches jsonb`, `grns_used jsonb`, `manufacture_datetime`, `expiry_date`, `storage_loc text`, `signed_by uuid`, `signed_at timestamptz`.

### `dispatches`

* `id uuid`, `dispatch_no text`, `fg_batch_id`, `quantity`, `destination text`, `truck_no`, `transporter`, `lr_no`, `dispatch_datetime`, `driver_name`, `photos text[]`.

### `inventory_audits`

* `id uuid`, `audit_type text`, `performed_by uuid`, `items jsonb`, `approvals jsonb`, `created_at`.

### `inventory_adjustments`

* `id uuid`, `material_id`, `grn_id`, `old_qty`, `new_qty`, `reason text`, `approved_by uuid`.

### `audit_logs` (append-only)

* `id bigserial PK`, `entity text`, `entity_id uuid`, `action text`, `user_id uuid`, `timestamp timestamptz`, `payload jsonb` (before/after snapshot).

---

## 1.3 Indexes and performance

* Index `main_inventory(material_id, lot_expiry, available_qty)` for FEFO allocation queries.
* Index `grns(itc_expiry_date, created_at)`.
* Partial index on `sub_batches(status)` for quick retrieval of active batches.
* Index `packing_logs(machine_id, start_ts)`.

---

## 1.4 Constraints & Triggers (business enforcements)

* Constraint: `grn.itc_expiry_date IS NOT NULL`.
* Trigger `grn_after_insert` → create `main_inventory` rows & container inventory entries.
* Trigger to prevent negative `main_inventory.available_qty`.
* Trigger `fg_after_insert` to reduce reserved quantities and mark GRNs usage proportionally.
* Use Postgres `EXCLUDE` constraints or optimistic locking (`version` integer) for race conditions on allocations.

---

## 1.5 Postgres Functions & RPCs (for atomic ops)

Implement these as `plpgsql` functions exposed via Supabase RPC:

### `fn_create_grn(grn_payload jsonb) RETURNS grn_id`

Responsibilities:

* Validate mandatory fields (itc_expiry_date, net_qty).
* Insert into `grns` and `grn_items`.
* Insert into `main_inventory` (create available_qty row).
* Save photos to Supabase Storage (frontend uploads first and passes storage paths; or server can verify existence).
* Insert audit log.

### `fn_allocate_to_subinventory(production_order_id uuid, requested_items jsonb, created_by uuid) RETURNS transfer_id`

Responsibilities:

* FEFO algorithm to pick GRN rows with `available_qty > 0` ordered by `itc_expiry_date ASC`, `created_at ASC`.
* Reserve quantities by decrementing `available_qty` and incrementing `reserved_qty` within same transaction.
* Create `sub_inventory_transfer` and `transfer_items`.
* If insufficient overall qty — generate allocation with partial and return `insufficient` flag.

### `fn_create_subbatch(master_batch_id, recipe_id, num_subbatches, operator_id) RETURNS sub_batch_id`

Responsibilities:

* Compute required quantities per component = `qty_per_subbatch * num_subbatches`.
* Call `fn_allocate_to_subinventory` to reserve required GRN quantities.
* Create `sub_batch` with `allocations` JSON locked read-only for operator.
* Insert audit log.

### `fn_close_downtime_ticket(ticket_id, closed_by, parts_used_json)`

* Update ticket, compute downtime minutes, if `affects_capacity=true` mark in capacity aggregation table.

### `fn_create_fg_batch(packing_summary jsonb)`

* Validate packing counts present.
* Create `fg_batch` record using `packing_logs` counts as source of truth.
* Update `main_inventory` reserved → consumed for GRNs used proportional to allocations.
* Record expiry_date based on SKU shelf life.

(We'll expand these with SQL in Phase 2.)

---

## 1.6 Supabase setup specifics

* **Auth**: Supabase Auth with roles mapped to custom claims: `role: gate, weighbridge, inspector, stores, planner, operator, supervisor, maintenance, fg_incharge, dispatch, auditor, admin`.
* **Storage**: Buckets:

  * `weighbridge-photos` (private, retention 7 years)
  * `pallet-photos` (private)
  * `samples` (private)
  * `tmp-uploads` (signed URLs for direct frontend upload)
* **Edge Functions**: Deno functions for API endpoints to integrate hardware and perform long-running tasks (e.g., mass allocation, migration script).
* **Realtime**: Use Supabase Realtime for notifications (FEFO switch, new downtime tickets, GRN holds).
* **Policies (RLS)**: implement granular RLS per table (examples in next section).

---

## 1.7 Row Level Security (RLS) — examples (concrete)

* `grns`:

  * Insert: allowed for `role = 'weighbridge'` or `role = 'stores'` (with field filters).
  * Update: only `stores_manager` can change `status` to `RECEIVED` or `HELD`.
  * Read: `role in ('stores','qa','planner','supervisor','auditor','admin')`.
* `sub_batches`:

  * Operator can create where `created_by = auth.uid()`.
  * Only supervisors/managers can set status to `REJECTED → OVERRIDE`.
* `inventory_adjustments`: Only `auditor` or `stores_head` can approve adjustments.

**Implementation pattern**: create Postgres policies that check `auth.role` claims from Supabase JWT, e.g. `auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'stores')` or read role claim directly if set.

---

## 1.8 Seed data & master data

* Machines list, `biscuits_per_rev` per die, SKU master, sample tolerance values, downtime reason codes, packaging materials master.
* Insert initial roles and admin users.

---

## 1.9 Observability & Monitoring (Phase 1)

* Enable database slow query logging and set up alerts.
* Tracing for Edge Functions and RPCs (Sentry + Prometheus for latency).
* Create health checks that verify: DB connection, Storage bucket access, Edge Function availability, Realtime connectivity.

---

## 1.10 Testing & QA for Phase 1

* Unit tests for DB functions (Postgres `pgTAP` or test harness).
* Concurrency tests: multiple `fn_allocate_to_subinventory` requests for same GRN to validate no negative available_qty.
* Security tests: RLS policies validation with multiple role tokens.
* Data migration dry-run test: import sample CSV and validate `main_inventory` rows.

---

## 1.11 Phase 1 Acceptance criteria

* All core tables created + migrations committed + tested.
* RPCs stubbed and unit tested (create_grn, allocate_subinventory, create_subbatch).
* RLS policies enforced for all critical tables and passed security audit.
* Storage buckets created; sample photo upload/download works via signed URL.
* Seed data loaded for machines, SKUs, reason codes.

---

# PHASE 2 — Business Logic, Atomic Flows & API Surface (FEFO, expiry rules, capacity rules)

## Goal

Implement all business rules as transactional Postgres functions or Edge Functions, expose them via Supabase RPCs, define API contracts that Next.js will use, and ensure the important “unwavering truths” are enforced at DB level.

---

## 2.1 Core Business Rules (coded explicitly)

1. **GRN is unit of consumption**: every consumption must reference `grn_id`. (Prevent operations consuming without GRN reference.)
2. **Expiry priority**: `ITC expiry` primary; FEFO allocation sorts by `itc_expiry_date` ASC, then `grns.created_at` ASC (older GRNs first for same expiry).
3. **Output drives truth**: `packing_logs.packs_produced` → used in `fn_create_fg_batch` to decide final `fg_batch.produced_qty`. Cutter theoretical numbers are for analytics only.
4. **Downtime logic**: only downtime tickets with `affects_capacity = true` subtract from runtime for capacity calculations. Other downtime recorded for RCA but not subtracted.
5. **All critical entries require electronic sign-off**: every critical RPC includes `signed_by` and `signed_at`. Audit logs include signature hash.
6. **No manual GRN picking**: Sub-batch creation auto allocates by FEFO. Overrides require supervisor + manager approval and a reason logged.
7. **Container tracking**: when GRN arrives in containers (bags/drums), container units recorded and consumed when materials are used; returns for reusable containers must be recorded.

---

## 2.2 FEFO Allocation algorithm (detailed)

**Goal**: Given required material amounts, produce a deterministic list of `(grn_id, qty_allocated)` respecting ITC expiry primary and not exceeding available_qty.

### SQL pseudocode (transactional)

```sql
-- input: material_id, required_qty
BEGIN;
SELECT id, available_qty, itc_expiry_date, created_at
FROM main_inventory
WHERE material_id = :material_id AND available_qty > 0
ORDER BY itc_expiry_date ASC, created_at ASC
FOR UPDATE; -- lock rows to avoid races

total_needed := required_qty;
allocations := [];

FOR each row IN cursor LOOP
  take_qty := LEAST(row.available_qty, total_needed);
  UPDATE main_inventory SET available_qty = available_qty - take_qty, reserved_qty = reserved_qty + take_qty WHERE id = row.id;
  allocations := allocations || jsonb_build_object('grn_id', row.grn_id, 'qty', take_qty);
  total_needed := total_needed - take_qty;
  EXIT WHEN total_needed <= 0;
END LOOP;

IF total_needed > 0 THEN
  -- not enough stock: rollback or create partial allocation (business decision)
  RAISE NOTICE 'Insufficient stock: required % but only allocated %', required_qty, required_qty - total_needed;
END IF;

-- create transfer record in sub_inventory_transfers and items
COMMIT;
```

**Notes:**

* Use `FOR UPDATE SKIP LOCKED` for high-concurrency environments (allows other transactions to skip locked rows).
* Provide a `preview_allocation` RPC that returns allocations but does not mutate (helpful UI preview).
* For partial allocations, return `insufficient` flag and require planner/Supervisor action.

---

## 2.3 Capacity calculation (exact)

**Formula** (clear, stepwise):

* `biscuits_per_rev` = master data for die.
* `rpm` = operator input or sensor average.
* `theoretical_per_minute = rpm * biscuits_per_rev`.
* `runtime_minutes = total_interval_minutes - sum(downtime_minutes where affects_capacity = true)`.
* `expected_production = theoretical_per_minute * runtime_minutes`.

**Edge cases**:

* If `rpm` missing, use last known rpm or `NULL` → mark capacity card as `INSUFFICIENT_DATA`.
* Downtime intervals outside the recorded interval must be capped.

**Implementation**:

* Keep `capacity_aggregates` materialized view updated every minute or on cutting_logs insert.
* Compute capacity deltas over shift windows by SQL.

---

## 2.4 RPCs & API Contracts (detailed)

I'll list the critical RPCs with JSON inputs and outputs. Implement as Postgres functions or Edge Functions where external integrations or longer processing are needed.

### 1) `rpc_create_grn` (atomic)

**Input**:

```json
{
  "vendor_id": "uuid",
  "vehicle_no": "KA-01-AB-1234",
  "challan_no":"CH-123",
  "challan_date":"2026-01-25",
  "items":[{"material_id":"uuid", "qty":1000, "container_count":100, "container_unit_weight":10}],
  "gross_weight":1100, "tare_weight":100, "weighbridge_slip_no":"WB-001",
  "weighbridge_photos":["path1","path2"], "gate_photo":"path", "seal_photo":"path",
  "itc_expiry_date":"2027-01-01", "vendor_expiry_date":"2027-06-01",
  "created_by":"user_uuid"
}
```

**Output**:

```json
{"grn_id":"uuid","grn_no":"GRN-20260125-0001","status":"RECEIVED"}
```

**Behavior**:

* Validate expiries; auto-set `status` to `HELD` if `itc_expiry_date` < policy threshold.
* Insert grn & items; update `main_inventory`.
* Audit log entry.

**Errors**:

* 400 if missing ITC expiry.
* 409 if duplicate `grn_no`.

---

### 2) `rpc_preview_allocation`

**Input**:

```json
{"sku_id":"uuid","num_subbatches":5}
```

**Output**:

```json
{
 "components":[
   {"material_id":"uuid","required_qty":500,"allocations":[{"grn_id":"...", "qty":300},{"grn_id":"...", "qty":200}]},
   ...
 ]
}
```

* Preview does *not* reserve; UI must show `Reserve` action triggers actual allocate.

---

### 3) `rpc_allocate_and_create_subbatch`

**Input**:

```json
{"master_batch_id":"uuid","recipe_template_id":"uuid","num_subbatches":5,"created_by":"uuid"}
```

**Output**:

```json
{"sub_batch_id":"uuid","allocations":[{"material_id":"uuid","grn_id":"...","qty":...}], "status":"CREATED"}
```

* Transactional: executes FEFO allocation and creates `sub_batch` with allocations locked read-only.

---

### 4) `rpc_log_cutting_interval`

**Input**:

```json
{"sub_batch_id":"uuid","machine_id":"uuid","rpm":120,"start_ts":"...","stop_ts":"...","downtimes":[{"start":"...","end":"...","reason_code":"...","affects_capacity":true}], "operator_id":"uuid"}
```

**Output**:
`{"cutting_log_id":"uuid","expected_biscuits":12345}`

Behavior: compute theoretical capacity for this interval and store.

---

### 5) `rpc_create_fg_batch`

**Input**:

```json
{"packing_summary":{"machine_id":"uuid","sku_id":"uuid","produced_qty":12000,"md_reject_count":12,"packs":{"gross":12012,"good":12000}},"shift":"A","created_by":"uuid"}
```

**Output**:
`{"fg_batch_id":"uuid","fg_batch_no":"20260126-A-MARIE"}`
Behavior:

* Validates packing logs exist and produced_qty matches sum of packing logs for given interval.
* Computes expiry_date, stores `grns_used` (proportional to allocations).
* Updates main_inventory reserved→consumed.

---

### 6) `rpc_create_downtime_ticket` / `rpc_close_downtime_ticket`

* Create ticket with `affects_capacity boolean` required if machine is oven/cutter.
* Close ticket updates aggregates, triggers maintenance reports.

---

### 7) `rpc_inventory_reconciliation`

* Accepts physical counts for sub-inventory or main store; computes variance; if within tolerance, creates an `inventory_adjustment` automatically requiring Stores Manager sign-off for larger variances.

---

## 2.5 Atomicity, concurrency & race conditions

* Use `SELECT ... FOR UPDATE SKIP LOCKED` inside allocation transactions.
* All mutating RPCs must run inside a single DB transaction and create an audit log entry at end.
* For high concurrency scenarios (multiple lines consuming same GRN), adopt `advisory locks` per `material_id` inside allocation function to avoid deadlocks and ensure deterministic allocation order.

---

## 2.6 Stored procedures: example `fn_allocate_to_subinventory` (sketch)

I'll provide a plpgsql skeleton for clarity (you'll expand to production quality with error handling).

```sql
CREATE OR REPLACE FUNCTION fn_allocate_to_subinventory(material_id uuid, required_qty numeric, request_id uuid, created_by uuid)
RETURNS jsonb AS $$
DECLARE
  cur record;
  remain numeric := required_qty;
  allocations jsonb := '[]'::jsonb;
BEGIN
  FOR cur IN 
    SELECT id, grn_id, available_qty FROM main_inventory
    WHERE material_id = $1 AND available_qty > 0
    ORDER BY lot_expiry, created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF remain <= 0 THEN EXIT; END IF;
    IF cur.available_qty >= remain THEN
      UPDATE main_inventory SET available_qty = available_qty - remain, reserved_qty = reserved_qty + remain WHERE id = cur.id;
      allocations := allocations || jsonb_build_object('grn_id', cur.grn_id, 'qty', remain);
      remain := 0;
    ELSE
      UPDATE main_inventory SET available_qty = 0, reserved_qty = reserved_qty + cur.available_qty WHERE id = cur.id;
      allocations := allocations || jsonb_build_object('grn_id', cur.grn_id, 'qty', cur.available_qty);
      remain := remain - cur.available_qty;
    END IF;
  END LOOP;

  IF remain > 0 THEN
    -- insufficient stock; rollback or store partial allocation
    RETURN jsonb_build_object('status','partial','allocations',allocations,'remaining',remain);
  ELSE
    RETURN jsonb_build_object('status','ok','allocations',allocations);
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.7 Expiry priority & automatic holds

* On `fn_create_grn`, check `itc_expiry_date` against `plant_minimum_shelf_policy` (config). If `itc_expiry_date` < threshold, set `status = 'HELD'` and send notification to Stores + QA. Store `hold_reason`.
* FEFO allocation will ignore `HELD` GRNs unless override. Overrides require supervisor + manager approvals, stored in `overrides` table with `reason`.

---

## 2.8 Capacity & downtime handling implementation details

* `cutting_logs` collects rpm intervals. Use `materialized view capacity_by_shift AS (...)` aggregating expected vs actual.
* Downtime tickets have `affects_capacity` bool. `fn_close_downtime_ticket` calculates downtime minutes and updates `capacity_by_shift` derivatives for the machine.
* Storage of downtime reasons: `downtime_reason_master` table with codes, descriptions, RCA categories.

---

## 2.9 Audit & Sign-off design

* Every RPC that changes critical tables requires `signed_by` and `signed_at`. The `audit_logs` entry contains `signature_hash = sha256(user_id || '|' || timestamp || '|' || secret_salt)` to make later tampering detectable.
* `audit_logs` is append-only. Implement DB policy to prevent deletion except by `super_admin` under strict process.

---

## 2.10 Notifications & realtime events

* Trigger events for:

  * GRN `HELD` or `REJECTED` → notify Stores & QA.
  * FEFO switch during active sub-batch → notify Line Supervisor (ack required).
  * Downtime tickets with `affects_capacity` → Production Manager.
  * Variance > tolerance → Inventory Auditor.
* Implementation: use Supabase Realtime or Edge Function webhook push to internal messaging (Slack/email) and frontend sockets.

---

## 2.11 Error handling & retry semantics

* All RPCs return structured error codes:

  * `400` — validation error (missing fields).
  * `409` — concurrency / insufficient stock allocation.
  * `500` — server error.
* For file uploads: use signed URLs; if upload fails, RPC should reject and meaningful error message returned.
* Implement idempotency keys for client calls: clients send `client_request_id` (UUID) and server stores idempotency table to prevent double allocations.

---

## 2.12 Security & RLS (detailed for Phase 2)

* Place critical functions behind roles: use `SECURITY DEFINER` functions with internal checks reading `auth.uid()` from JWT. Example: only `role = 'stores'` can call `rpc_create_grn`.
* Additional checks:

  * If `rpc_allocate_and_create_subbatch` called by `operator`, verify `operator` belongs to `line` assigned to the `production_order`.
  * Overrides require `api` to ensure both `supervisor_id` and `manager_id` are provided & valid.

---

## 2.13 Testing & QA (Phase 2 intensive)

Design test suites and sample test cases; include concurrency scenarios and invariants.

### Unit tests:

* `fn_create_grn`: valid & invalid (missing expiry) tests.
* `fn_allocate_to_subinventory`: single GRN, multiple GRNs, exact fit, partial stock, high concurrency (simulate N concurrent allocators).

### Integration tests:

* End-to-end: Gate Entry (with photo) → Weighbridge → QA Accept → GRN creation → Transfer to subinventory → Create subbatch → Premix → Mixing → Cutting logs with downtime → Packing → Create FG → Dispatch. Validate inventory transitions.

### Concurrency stress tests:

* Simulate 50 parallel allocation requests for the same material to verify no negative `available_qty`.

### Security tests:

* RLS checks: attempt unauthorized updates/reads with different role tokens.
* Tamper tests: attempt to delete `audit_logs`.

### Acceptance tests:

* FEFO allocation picks earlier ITC expiry first (explicit test case with GRN A expiry 2026-05-01 qty 1000; GRN B expiry 2027-01-01 qty 1000; request 1500 -> allocate A:1000, B:500).
* Downtime with `affects_capacity=true` reduces expected production in capacity view.
* Sub-batch allocation locked and override requires two approvals.

---

## 2.14 Observability for Phase 2

* Track RPC latency, allocation function time (should be <=200ms for typical allocations).
* Create dashboards for:

  * Number of unresolved downtime tickets.
  * Number of HE LDs (held GRNs).
  * Pending allocations and partial allocations.

---

## 2.15 Migration & Backfill tools (Phase 2)

* Build Edge Function `migration_import_grns(csv_payload)` to import historical GRNs. It must:

  * Validate data mapping to `grns` and `grn_items`.
  * Create `main_inventory` rows.
  * Mark `created_by` as `migration_user`.
  * Produce a migration report with mapping from legacy IDs to new `grn_no`.
* Run a dry-run mode with preview only.

---

## 2.16 Deployment & infra notes (Phase 1→2 transition)

* Use Infrastructure-as-Code (IaC) for Supabase config and Edge functions.
* Database migrations via a migration tool (Sqitch, Flyway, or Supabase migrations). Keep migration scripts idempotent.
* Staging environment mirrors production schema, with sample data and hardware integration in simulation mode.

---

## 2.17 Risks & Mitigations (specific)

1. **Race conditions on allocation** — use `FOR UPDATE SKIP LOCKED` and advisory locks; design idempotency.
2. **Photo upload failures** — use signed URL flows and local temporary caching on tablet; fail RPC with clear message if required photos missing.
3. **Offline sync conflicts** — use server-wins for allocations; queued client requests must include `client_request_id` and `created_at` to detect duplicates.
4. **Operator mistakes (wrong GRN or qty)** — restrict manual edits of allocations; require two-level approval for any adjustments.
5. **Regulatory/audit non-compliance** — store immutable audit logs and require all sign-offs.

---

## 2.18 Implementation checklist for Phase 2

* [ ] Implement FEFO allocation function with `FOR UPDATE SKIP LOCKED`.
* [ ] Implement `rpc_create_grn`, `rpc_preview_allocation`, `rpc_allocate_and_create_subbatch`, `rpc_create_fg_batch`, `rpc_log_cutting_interval`, `rpc_create_downtime_ticket`.
* [ ] Implement `audit_logs` append-only table and ensure all RPCs write audit entries.
* [ ] Implement idempotency table & logic for RPCs.
* [ ] Implement RLS policies for all critical tables and test with role tokens.
* [ ] Implement capacity materialized views and test downtime adjustments.
* [ ] Build migration Edge Function & dry-run import.
* [ ] Implement notifications (Realtime) for major events.
* [ ] Implement test harness (unit & integration), run stress tests, and document results.

---

# Deliverables at end of Phase 2

* Production-grade DB schema with constraints, indexes and Postgres functions.
* Supabase storage buckets + access rules.
* Complete RPC list with code + OpenAPI or RPC docs.
* Seed data for SKUs, machines, reason codes.
* Test suite and test reports for concurrency and acceptance criteria.
* Migration tool & sample imported GRN dataset.
* Security review report (RLS policies validated).
* Observability dashboards for RPC performance and critical health metrics.

---

# Short Examples & Quick Reference

### Example: FEFO allocation SQL query (select)

```sql
SELECT id, grn_id, available_qty, lot_expiry, created_at
FROM main_inventory
WHERE material_id = :material_id
  AND available_qty > 0
ORDER BY lot_expiry ASC, created_at ASC
FOR UPDATE SKIP LOCKED;
```

### Example: Capacity computation SQL (single interval)

```sql
WITH interval AS (
  SELECT (EXTRACT(EPOCH FROM (stop_ts - start_ts))/60.0) AS interval_min
  FROM cutting_logs WHERE id = :cutting_log_id
),
downtime AS (
  SELECT SUM(EXTRACT(EPOCH FROM (d->>'end')::timestamptz - (d->>'start')::timestamptz)/60.0) as down_min
  FROM jsonb_array_elements((SELECT downtimes FROM cutting_logs WHERE id = :cutting_log_id)) d
  WHERE (d->>'affects_capacity')::boolean IS TRUE
)
SELECT
   (rpm * biscuits_per_rev) * (interval.interval_min - COALESCE(downtime.down_min,0)) AS expected_biscuits
FROM interval CROSS JOIN downtime
JOIN machines m ON m.id = :machine_id;
```

---

# Final notes & recommendations (practical)

* **Phase 0 completion is critical**: unresolved policy decisions (expiry thresholds, offline scope, photo retention) will cause rework.
* **FEFO must be DB-enforced**: do not rely on frontend to enforce it — implement in `fn_allocate_to_subinventory`.
* **Make audit logs searchable**: index by `entity`, `entity_id`, `timestamp` for fast RCA.
* **Pilot first, then scale**: start with one SKU and one line; iterate quickly.
* **Careful with overrides**: keep overrides rare and auditable — they defeat FEFO if abused.

---