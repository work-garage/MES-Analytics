# PHASE 3 & PHASE 4 — Extremely detailed, end-to-end implementation plan

# PHASE 3 — Frontend, UX, Offline, Tablet & Mobile Apps (Next.js)

Primary objective: deliver responsive, tablet-optimized shop-floor apps + management web dashboards which strictly implement the process flows and fields you specified, including mandatory photos, sign-offs, FEFO allocation previews, sample collection, capacity card, downtime UI and all data fields.

## 3.0 High-level architecture & approach

* Next.js (App Router) + TypeScript.
* UI component library: Tailwind + shadcn/ui primitives (Card, Button, Modal, Input). Use lucide-react icons. Charts: recharts.
* Client state: React Query (server state) + local cache + IndexedDB queue for offline.
* Authentication: Supabase Auth; token stored in secure HTTPOnly cookie for server-side rendering and client fetch.
* API layer: use Supabase client for direct DB queries when permitted, otherwise call Edge Functions for atomic operations (allocations, batch creation). Use RPC endpoints already defined in Phase 1/2.
* File uploads: direct-to-Supabase-Signed-URL flow, with upload progress and local caching for offline.
* Signature: signature captured as vector (SVG) + hashed metadata (`sha256(user_id|timestamp|payload)`) saved in `audit_logs`.
* Tablet-first design: large touch targets, camera modals, scan/print integration.
* Accessibility: WCAG AA for critical screens (contrast, keyboard navigation, labels).

## 3.1 Folder & component architecture

* `app/` (Next.js App Router)

  * `app/layout.tsx` (auth-aware layout)
  * `app/(shopfloor)/` — tablet flows (Gate, Weighbridge, QA, Sub-batch, Premix, Mixing, Cutting, Oven, Packing)
  * `app/(management)/` — Planner, Stores, Maintenance, Inventory Auditor, Analytics
* `components/`:

  * `SignaturePad.tsx` (SVG + save)
  * `PhotoCapture.tsx` (camera + compression + store in IndexedDB if offline)
  * `ScanInput.tsx` (barcode/QRCode scanning using zxing)
  * `CapacityCard.tsx` (rpm input, computed expected production)
  * `AllocationPreview.tsx` (FEFO allocation preview table)
  * `OfflineQueueIndicator.tsx`
* `lib/`:

  * `api/` wrappers for RPCs (`createGRN`, `previewAlloc`, `allocateCreateSubbatch`, `createFGBatch`, `createDowntimeTicket`)
  * `dbSync/` — IndexedDB sync queue + idempotency logic
  * `validators/` — schema validation using Zod
* `styles/` & `i18n/` for translation if needed.

## 3.2 Critical UI Pages & required fields (complete mapping)

### 1) Gate Entry page (tablet)

Fields (all per your doc):

* Date (auto, display local tz)
* Time (auto)
* Vehicle number (plate) — string
* Vendor name & code (dropdown/search)
* Material name & code (dropdown)
* Challan / Invoice no & date
* Driver name & mobile
* Expected quantity (per challan)
* Photo of vehicle & seal (mandatory)
* Decision: Allow to weighbridge / Hold
* If Hold — `hold_reason` (text) and `notify` (automatic)
  Sign-offs: Gate operator signs (signature component)
  UI specifics:
* Photo capture modal pre-validates resolution (min 1024px).
* If Hold chosen, disable `Allow` flow and emit realtime notification to Stores + QA.

### 2) Weighbridge page

Fields:

* Weighbridge slip no (scan / photo)
* Gross weight (kg)
* Tare weight (kg)
* Net weight (auto)
* Photo of truck on scale (mandatory)
* Compare net vs challan; tolerance threshold configurable per material
* Decision: Proceed / Hold
  Sign-offs: Weighbridge operator + Stores Supervisor (two signature inputs)
  UI specifics:
* Auto-calc net; highlight `% difference` if > tolerance.
* Provide “Discrepancy workflow” button to create a discrepancy ticket.

### 3) Vehicle Inspection (L1 / L2)

Checklist (Yes / No):

* Floor clean?
* Side walls clean?
* Tarpaulin intact?
* Odour? (none/abnormal)
* Visible dust/moisture?
* Seal intact?
* Hazardous material history OK?
  Mandatory `remarks` if any No; Decision: Pass → QA; Fail → Final Reject.
  Sign-offs: L2 + Stores In-charge.

### 4) QA — Raw Material Quality Check

Auto Sample creation with `SampleID`.
Fields:

* `sample_id` (auto)
* sampling time & location
* vendor manufacturing date
* vendor expiry date
* ITC/factory expiry date (primary) — mandatory
* appearance OK/not OK
* moisture % (numeric)
* odour (OK/abnormal)
* foreign matter (Y/N)
* attachments / photos / instrument printout
  Decision: Accept / Hold / Reject
  Sign-offs: QA Inspector (+ QA Manager if Hold/Reject)
  UI specifics:
* If `itc_expiry_date < plant_policy_minimum` -> auto mark HOLD & show reason modal.
* Attach instrument PDF uploads (signed).

### 5) GRN Creation (Stores)

Fields (auto-generation):

* `grn_no` (auto)
* Date/time (auto)
* Material code & name
* Net received quantity (kg)
* Vendor expiry date
* ITC expiry date
* Storage location / bin
* Pallet barcode (print/scan)
* Photos attached (weighbridge, pallet)
  Business rule: FEFO key = (itc_expiry_date, grn_received_date)
  Sign-off: Stores Exec + Stores Manager

UI specifics:

* “Print Pallet Barcode” button uses browser print or a native print helper.
* Show FEFO key and expiry exposure graph.

### 6) Main Inventory (GRN-wise) view

Displays:

* GRN number, material, ITC expiry, vendor expiry, available qty, reserved qty, containers, location
  Actions:
* Transfer to Sub-inventory (opens FEFO pick preview)
  UI specifics:
* Bulk actions for multiple GRNs (transfer, hold, mark contaminated).

### 7) Transfer to Sub-Inventory

Fields:

* Transfer date/time (auto)
* GRN numbers & allocated qty (auto FEFO)
* Destination sub-inv bin (scan)
* Physical receipt confirmation at line (operator scan)
  Sign-offs: Stores Issuer + Line In-charge

UI specifics:

* "Auto FEFO pick list" modal showing if multiple GRNs selected and split details.
* If a GRN is split, show `split_trace` UI.

### 8) Recipe Templates (Planner)

UI: drag & drop builder.
Fields:

* Template name & version
* SKU
* Components list: material_id, qty per sub-batch, tolerance pct, notes
  Sign-off: Planner signs save/version.

### 9) Add Sub-Batch (Operator tablet)

Fields:

* Number of sub-batches (input)
  System auto:
* Creates `MasterBatchID` format `YYYYMMDD_SKU_SHIFT`
* References recipe template
* Calculates material quantities
* Allocates GRN-wise via FEFO (allocations read-only)
  Operator must:
* Verify recipe shown (Yes/No)
* Acknowledge GRN allocation alerts
  Sign-off: Operator clicks `Start Sub-Batch` and signature captured.

UI specifics:

* Allocation read-only with option "Request Override" which triggers supervisor+manager approvals.

### 10) Premix & Mixing screens

Premix fields:

* `sub_batch_id`, `grn_ids`, `target_qty`, `actual_weighed_qty`, `bag/container code` scanned, start/end timestamps, operator signature, photo of weigh scale.
  Mixing fields:
* start/end, mixer_speed, dough_temperature, pH, result (OK/HOLD/REJECT), dough_waste_kg, operator sign-off, QA sign-off if HOLD.

UI specifics:

* Photos mandatory on weigh step.
* If `REJECT` selected: show elimination dialog (reason, attachments); flag sub-batch REJECTED.

### 11) Cutting screen (Capacity + sampling)

Two parallel UI elements:
A. Capacity card:

* RPM input (manual or sensor), biscuits_per_rev (from master), start/stop times, dynamic expected biscuits.
* Downtime button to log an interval (start auto).
  B. Sampling modal:
* Sample ID, stack type (working/non-working/rework), stack weight (g), rpm optional, photo mandatory.
  Live waste logging:
* wet_waste_kg with reason and photo

Sign-offs: Operator + Shift Supervisor

### 12) Downtime ticket modal

Fields:

* `machine_id`, auto start_ts, expected_end, reason_code (dropdown), stage, checkbox `Oven shutdown?`, parts_used (select from spare parts catalog), notes, photo(s)
  Business logic:
* If `Oven shutdown` true -> downtime is capacity affecting by default.
  Sign-offs: Maintenance engineer + Line In-charge on closure

### 13) Baking / Oven screen

Fields:

* bake start/end, gauge, moisture %, sample stack weight, color rating, taste check (QA), accept/h o ld
  Effect on capacity: if downtime affects capacity -> adjust capacity totals.

### 14) Packing & Metal Detection screen

Fields per packing machine:

* Machine ID, SKU, pack size, packs produced (count), runtime, operator, wrapper lot (scan), wrapper consumption, wrapper waste, MD reject count + photo
  Live logging for dry waste; MD rejects treated as non-reworkable unless QA authorises

Sign-offs: Packing Operator + Packing Supervisor

### 15) FG Batch creation

Fields:

* FG batch no (auto e.g., `20260126-A-MARIE`)
* SKU, shift, produced qty (auto from packing logs), good qty, scrap qty, MD qty, sub-batches used, GRNs used (proportion), manufacturing datetime, expiry date (calculated from sku shelf life), storage location (scan)
  Sign-offs: FG in-charge + Warehouse Supervisor

### 16) Dispatch

Fields:

* Dispatch ID (auto), FG Batch No, quantity dispatched, destination, truck no, transporter, LR/challan no & date, dispatch datetime, driver name & mobile, photo of pallets loaded
  Sign-offs: Dispatch in-charge + QA clearance (optional)

### 17) Physical vs System reconciliation screens

Daily short counts:

* Fields: material code, grn_no, system_qty, physical_qty, variance (kg & %), tolerance pct
* Actions: If variance <= tolerance -> auto-adjust with reason; if > tolerance => create investigation ticket
  Monthly audit:
* Full GRN-wise count entry, adjustments require 2-level approvals
  Sign-offs: Inventory Auditor + Stores Head (and Audit when > threshold)

### 18) Dashboards (Management)

* Shift Summary: RM consumed (GRN-wise), sub-batches created, FG created, waste by stage, downtime minutes, packaging counts
* Capacity vs actual: Cutter theoretical vs packing counts (trend)
* GRN expiry exposure (by ITC expiry buckets)
* Variance & Investigation tickets
* MD reject spike alerts & RCA
  UI specifics:
* Drilldown from any visualization to records (`grn_no`, `sub_batch`, `fg_batch`).

---

## 3.3 Forms, validation, and rejections (client rules)

* Use Zod schemas for client + server validation. Every critical field is validated both client & server.
* Mandatory photos enforceable by UI; server checks file attachments present for required actions (e.g., GRN create).
* Signatures captured as base64+metadata; server validates signature hash presence.
* Use consistent error codes and UI-friendly error messages (e.g., `ERR_MISSING_ITC_EXPIRY`, `ERR_INSUFFICIENT_ALLOCATION`).

---

## 3.4 Offline-first design & sync model (essential)

* Offline capability must allow: Add Sub-batch creation, premix/mixing logs, cutting logs, packing logs, photo capture. Gate/Weighbridge/QA/GRN creation should be online but allow offline `draft` save.
* Mechanism:

  * Local queue (IndexedDB) of actions with `client_request_id` UUID, `created_at`, `payload`, `attachments` stored as blobs (compressed).
  * Sync worker (service worker or foreground job) that uploads attachments to signed URL when online and then calls RPC with `client_request_id`.
  * Server stores idempotency key and rejects duplicates.
  * Conflict resolution:

    * For allocations: server takes precedence. If allocation fails (insufficient stock) on sync, client shows `allocation_failed` with required action: `retry after planner adjusts` or `request override`.
    * For packing logs: if server shows duplicate packing counts, present admin reconcile flow.
* Queue UI:

  * Show pending items, progress, errors, retry buttons.
  * Force user to connect before starting a new sub-batch if allocation preview would be inconsistent.

---

## 3.5 Client-to-server RPC mapping (standardized)

Make the client call these RPCs (Edge Functions or Supabase RPC):

* `POST /rpc/create_grn` — body: createGRNPayload (see earlier)
* `POST /rpc/preview_allocation` — body: {sku_id, num_subbatches}
* `POST /rpc/allocate_and_create_subbatch` — body: {master_batch_id, recipe_template_id, num_subbatches, created_by, client_request_id}
* `POST /rpc/log_premix`, `POST /rpc/log_mixing`, `POST /rpc/log_cutting_interval`, `POST /rpc/log_oven`, `POST /rpc/log_packing` — each with required fields and attachments
* `POST /rpc/create_downtime_ticket`
* `POST /rpc/create_fg_batch`
* `POST /rpc/create_dispatch`
* `POST /rpc/inventory_reconciliation`

Include `client_request_id` in each to support idempotency.

Sample minimal payload for `allocate_and_create_subbatch`:

```json
{
  "master_batch_id":"uuid",
  "recipe_template_id":"uuid",
  "num_subbatches":5,
  "created_by":"user_uuid",
  "client_request_id":"uuid-v4"
}
```

---

## 3.6 Signature capture & audit

* Signature component stores: `signature_svg`, `signed_by` (auth.uid), `user_name`, `signed_at` timestamp.
* Before sending final RPC, compute `signature_hash` = `sha256(user_id + '|' + signed_at + '|' + JSON.stringify(payload) + '|' + server_salt)` — server recomputes and stores hash in `audit_logs`.
* The hash prevents tampering; `audit_logs` are append-only.

---

## 3.7 Camera & attachments handling

* Photo capture compress to JPEG (target 800–1200 KB) preserve EXIF timestamp, orientation.
* Upload flow:

  * `GET /edge/get_signed_upload_url?bucket=samples&file=...` returns signed URL.
  * Client `PUT` file, then call RPC with `file_path`.
* For offline: store base64 blob in IndexedDB -> on sync upload first then call RPC with path.

---

## 3.8 Barcode & scanner integration

* Use web camera scanning (zxing) on tablets.
* Support external bluetooth scanners via keyboard mode for rapid entry.
* Pallet barcode printing: generate a Code128 barcode (text: `GRN-XXXX`) and print via browser print or native print helper.

---

## 3.9 Testing & QA for Phase 3

Create test plans and test cases:

### Unit / Component tests:

* Form validation (missing ITC expiry rejected).
* Signature pad captures svg; signature hash computed.

### Integration tests:

* End-to-end: Gate Entry → Weighbridge → QA Accept → Create GRN → Transfer -> Add Sub-batch -> allocate -> premix -> mixing -> cutting -> packing -> FG batch -> Dispatch.
* Offline sync: create sub-batch offline and sync with partial allocation failure -> display error & instructions.

### Load tests:

* Simulate 100 concurrent packing log inserts, ensure DB functions handle and audit log remains consistent.

### UX acceptance:

* Mandatory photo enforcement: attempt to submit GRN without photo -> UI prevents save.
* Overrides: operator asks override -> two-level approval required.

### Security tests:

* Attempt unauthorized RPC with low-privilege token -> ensure RLS blocks.

---

## 3.10 CI/CD & deploy

* Repo uses GH Actions:

  * `lint`, `type-check`, `unit-tests`, `end-to-end-tests` (Playwright).
  * Build artifacts for staging & production.
* Deploy Next.js to Vercel (or self-hosted), supabase infra via migrations.
* Edge Functions versioned and tested in staging first.
* Feature flags for pilot SKU/line.

---

## 3.11 Observability & Frontend metrics

* Instrument Sentry for errors + performance tracing.
* Log events: `sub_batch.created`, `allocation.failed`, `grn.held`, `downtime.created`.
* Frontend performance: measure TTFB, hydration, and critical route times.

---

## 3.12 Training materials & in-app help

* Contextual help on each screen: small info icons explaining fields (e.g., why ITC expiry primary).
* Video walkthroughs embedded in management UI (short clips).
* Quick cheat sheets for operators (printable).

---

## 3.13 Acceptance criteria for Phase 3

* All shop-floor screens available and validated against field list.
* Offline queue tested with attachments for at least 3 error scenarios.
* Required sign-offs produce `audit_logs` entries with tamper-evident signature hash.
* FEFO preview matches server allocation logic in all test cases.
* UI prevents any production progress without mandatory sign-offs/photos where specified.

---

# PHASE 4 — Hardware Integration, Edge, Pilot Commissioning & Plant Rollout

Primary objective: integrate weighbridge, RPM sensors, barcode printers/scanners, cameras, and optionally PLCs/SCADA; run pilot; commission multi-line rollout with vendor coordination, maintenance, and governance.

## 4.0 High-level plan & governance

* Responsible parties:

  * Integration Lead (coordinates hardware vendors, Edge Function dev)
  * Field Engineer (on-site hardware install & commissioning)
  * DevOps (Edge infra and network)
  * QA/Plant liaison (tests & sign-off)
  * Procurement/Logistics (spare parts, replacement)
* Key policy: All hardware -> integration endpoints must be secure (HTTPS + HMAC signed messages or mutual TLS). Edge Functions validate signatures.

## 4.1 Hardware list & roles

* Weighbridge (digital output) — integrate via webhook or RS232 -> local gateway.
* Vehicle cameras (gate & pallet) — IP cameras or tablet camera capture.
* Barcode scanners (bluetooth/USB) — operator tablets + warehouse.
* Pallet printers — network/Bluetooth printers.
* RPM sensor (simple optical pickup or tachometer) — optional; if unavailable, operator manual entry allowed.
* Metal detector (MD) counters — integrate with packing machine if possible.
* PLC/SCADA (optional) for full automation of counts — integration via MQTT/Modbus/OPC-UA depending on site.

## 4.2 Integration architecture

* On-prem gateway (recommended) in plant DMZ:

  * Runs a small service (Node/Python) that handles RS232/MQTT from weighbridge/RPM/PLC → POSTS to Supabase Edge Function endpoint with HMAC signature.
  * Gateway caches events during internet outage and retries (store events with idempotency key).
* Edge Functions:

  * `edge/weighbridge_webhook` — verifies HMAC and inserts weighbridge info into DB (calls `fn_create_grn` or updates gate record).
  * `edge/sensor_ingest` — RPM/sensor updates -> `rpc_log_cutting_interval` or `rpc_log_rpm`.
* Protocol & security:

  * Weighbridge/gateway sends signed payload: `{payload, timestamp, signature = HMAC(secret, payload)}`.
  * Edge Function checks timestamp (reject if older than X minutes) and signature.

## 4.3 Webhook / message schemas (exact)

### Weighbridge webhook (POST)

```json
{
  "client_id":"weighbridge-01",
  "gate_entry_id":"optional if created earlier",
  "weighbridge_slip_no":"WB-0001",
  "gross_weight":1100.0,
  "tare_weight":100.0,
  "net_weight":1000.0,
  "photo_paths":["weighbridge/20260126/xyz.jpg"],   // or attach base64 if pushing via gateway
  "timestamp":"2026-01-26T08:15:00Z",
  "signature":"hmac-sha256-..."
}
```

Edge validates signature and calls `fn_create_grn` if gate entry exists and QA accepted.

### RPM sensor message

```json
{
 "machine_id":"cutter-1",
 "timestamp":"2026-01-26T08:20:00Z",
 "rpm":120,
 "interval_start":"2026-01-26T08:10:00Z",
 "interval_end":"2026-01-26T08:20:00Z",
 "signature":"..."
}
```

Edge function aggregates or stores directly in `cutting_logs`.

### MD reject message

```json
{
 "packing_machine_id":"pack-02",
 "interval_start":"2026-01-26T09:00:00Z",
 "interval_end":"2026-01-26T09:15:00Z",
 "reject_count":5,
 "photos":["..."],
 "signature":"..."
}
```

## 4.4 On-site gateway requirements & installation steps

* Hardware: small industrial PC or RaspberryPi-class device with UPS for graceful shutdown.
* Software:

  * Authentication keys stored in hardware keystore.
  * Local caching store (SQLite + file store).
  * Small service that maps hardware events to signed JSON to Edge Functions.
* Installation checklist:

  1. Mount gateway in secure cabinet with UPS.
  2. Connect weighbridge RS232/USB; test data stream.
  3. Connect RPM optical sensor output to gateway.
  4. Connect network (prefer wired) and open only necessary outbound endpoints (Edge Function URL).
  5. Configure time sync (NTP) with plant timezone.
  6. Validate HMAC secrets with integration lead.

## 4.5 Printer / scanner setup

* Barcode printers must be reachable by the tablet (Bluetooth or local network).
* Provide a small `print helper` script on the gateway or a web print endpoint so tablet can print via local network using CUPS or API.
* Scanners tested in keyboard mode and HID input.

## 4.6 PLC/SCADA optional integration

* If PLC present:

  * Use OPC-UA or MQTT bridges.
  * Map tags: `packing_count`, `rpm`, `md_reject_count`.
  * Implement a `plc_adapter` service that converts tags to signed messages to Edge Functions.
* If PLC unavailable, rely on manual entry and sensor attachments.

## 4.7 Edge function implementation & security

* Edge function verifies:

  * HMAC signature + timestamp window
  * `client_id` allowed list
  * Idempotency using `message_id`
* Edge then writes data into dedicated `ingest_*` tables and triggers workflow (create or update `cutting_logs`, `weighbridge` record).
* Edge Functions run with service account and only limited DB privileges.

## 4.8 Commissioning & testing (on-site)

* On-site test sequences:

  1. Gate mock truck flow: capture photos, create gate entry, simulate weighbridge webhook → verify GRN created.
  2. Sample QA flow: create sample via UI and attach lab instrument printouts.
  3. Sub-batch allocation test: push allocation preview, then allocate live.
  4. Sensor test: start/stop RPM stream and verify capacity card updates.
  5. Downtime test: open ticket via UI and from maintenance tablet; close and verify capacity adjustments.
  6. Printer & scanner test: print & scan pallet barcode, perform pallet putaway.
  7. Offline test: disconnect network; create sub-batch with attachments; reconnect and verify sync/resolve.

## 4.9 Pilot rollout plan (detailed)

* Scope: 1 line, 1 SKU, 1 shift (2-week run).
* Pre-pilot checklist:

  * All hardware installed & tested.
  * FRD & SOPs signed.
  * All user accounts created and role assignments set.
  * Pilot data seeded (SKUs, machines, biscuits_per_rev).
  * Super users assigned for hypercare.
* Pilot execution steps:

  1. Day 0 — smoke test with sample consignments and mock GRNs.
  2. Day 1–3 — run early shift on digital system with parallel paper logging for audit.
  3. Day 4 — remove paper in pilot line if all critical flows pass.
  4. Day 5–14 — collect issues, perform daily triage, prioritize bug fixes.
  5. Day 14 — pilot review against acceptance criteria; decide to scale.
* Acceptance criteria for pilot:

  * 95% of shop-floor actions completed with required signatures & photos.
  * FEFO allocation matches manual expected allocation in test dataset.
  * No critical data loss in offline sync tests.
  * All downtime tickets closed with parts used logged and capacity adjustments validated.

## 4.10 Plant full rollout plan

* Phased line-by-line roll-out; grid approach:

  * Stage 1: Second line + additional SKUs.
  * Stage 2: All production lines.
  * Stage 3: Warehouse & dispatch integration at scale.
* For each line:

  * Pre-check hardware and network.
  * 48-hour parallel run (paper + system) for critical flows.
  * Full cutover weekend; post-cutover hypercare 2 weeks.

## 4.11 Spare parts & maintenance planning

* Maintain inventory of gateway spares, camera spares, printer heads, barcode scanner replacements.
* Maintenance SOPs for hardware replacement with QR code on devices linking to device health in the system.

## 4.12 SLA, uptime & support model

* SLAs:

  * Edge Function availability 99.9% (monitor).
  * Gateway uptime: monitored and local fallback to manual logging if gateway down.
* Support:

  * Tier 1 support: on-site plant operator (initial troubleshooting).
  * Tier 2 support: Integration lead (remote).
  * Tier 3: vendor escalation.

## 4.13 Security & network rules for hardware

* Put gateways into a DMZ with restricted outbound access (only to Edge function URLs).
* Use mutual TLS or HMAC for device authentication.
* Rotate secrets periodically and have a secure provisioning mechanism.

## 4.14 Observability & runbook

* Monitor:

  * Number of inbound weighbridge webhook errors.
  * Gateway last seen timestamp.
  * Edge function error rate.
  * Number of offline queue items pending.
* Runbook items:

  * If gateway offline > 15 min → send SMS to plant IT.
  * If FEFO partial allocations > threshold → auto alert Planner.
* Create automated daily health email with top issues.

## 4.15 Data migration & cutover scripts

* Migration scripts must:

  * Map legacy GRN IDs -> new `grn_no`.
  * Validate no negative inventory.
  * Import container inventory counts and associate with GRNs.
* Cutover script:

  * Freeze legacy adjustments window (e.g., last 24h).
  * Import final snapshot, then start live system.

## 4.16 Testing for Phase 4

* Hardware integration tests:

  * HMAC signature verification negative tests (replay attack).
  * Simulate sensor noise and check smoothing/averaging algorithms.
* End-to-end integration tests:

  * Weighbridge via gateway -> create GRN -> FEFO allocation -> Sub-batch -> consumption.
* Failover tests:

  * Simulate gateway network outage and ensure local caching works and replays correctly.
* Security tests:

  * Attempt unauthorized messages to Edge function → must be rejected.

## 4.17 Risk management & mitigations (Phase 4 specific)

* Risk: weighbridge sends malformed data -> Mitigation: gateway validates and rejects; manual data entry flow available.
* Risk: network outage during peak shift -> Mitigation: robust offline queue, local temporary logger, and daily reconciliation scripts.
* Risk: operator non-adoption -> Mitigation: intensive training + incentives + shadowing.
* Risk: hardware vendor delays -> Mitigation: use fallback manual procedure and schedule contingency days.

## 4.18 Training & handover documents (deliverables)

* SOP PDF's for every role and screen (Gate, Weighbridge, QA, Stores, Operator, Supervisor, Maintenance, Dispatch).
* On-site 2-day operator training + 1-day maintenance training per plant.
* Admin guides for user management, audit retrieval and emergency overrides.
* Quick reference laminated cards for each tablet.

## 4.19 Post-rollout continuous improvement

* Establish a change control board (production, QA, IT) to approve recipe/template changes and critical overrides.
* Monthly analytics review to tune `biscuits_per_rev` master data and tolerances.
* Quarterly review for hardware lifecycle and capacity model adjustments.

---

# Practical helper material (quick references for developer/integration agents)

## Required server-side validation checklist (must be coded)

* `itc_expiry_date` present and `>= received_date`
* `grn_no` unique
* Attachments present for mandatory steps (weighbridge photo, pallet photo, stack photo)
* `sub_batch` allocations locked and cannot be manually altered by operator
* Any override requires two approvers and reason logged
* Allocation atomicity: no negative `main_inventory.available_qty`
* Idempotency for all RPCs using `client_request_id`

## Key RPC endpoints to implement (recap)

* `POST /rpc/create_grn` — create GRN + main_inventory rows
* `POST /rpc/preview_allocation` — return FEFO allocations (no mutation)
* `POST /rpc/allocate_and_create_subbatch` — allocate & create subbatch atomically
* `POST /rpc/log_cutting_interval` — add rpm interval and compute expected biscuits
* `POST /rpc/create_downtime_ticket` — create ticket with affects_capacity flag
* `POST /rpc/create_fg_batch` — close FG batch based on packing logs
* `POST /edge/weighbridge_webhook` — HMAC-verified webhook ingestion

---

# Final acceptance & go/no-go criteria for Phase 3+4 combined

1. Core flows run hands-free: Gate → Weighbridge → QA → GRN → Sub-inventory → Add Sub-batch → Premix → Mix → Cut → Bake → Pack → FG → Dispatch must work in end-to-end tests with audit trail.
2. FEFO allocation deterministic and DB-enforced across concurrent requests.
3. Offline sync works for operator tablet actions including attachments and recovers gracefully.
4. All hardware integrations validated by on-site commissioning tests (weighbridge, RPM, printers).
5. Pilot passes (95% coverage of mandatory fields, no critical data loss).
6. RLS & audit logs in place and validated.
7. Training completed with super-users and SOP sign-off.

---