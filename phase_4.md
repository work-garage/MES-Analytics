# Phase 4 — Expanded: complete sensor / scanner / photo / machine input design + manual fallbacks (full, end-to-end)

Nice — below is a single, comprehensive, actionable expansion of **Phase 4** that *adds every sensor, scan, photo, image and other machine input* you listed, and also builds fallback flows so nothing breaks when the gateway or sensor is unavailable. I include: data fields, message schemas, Edge/DB ingestion tables, UI fallbacks, gateway behaviour, security, smoothing/validation rules, commissioning & test steps, runbooks and monitoring/alerts. Treat this as the canonical engineering + commissioning spec for the hardware+software integration layer.

---

# 1 — Design principles (short & firm)

1. **Sensor data is authoritative where available, but every sensor input records its source.** `source` = `sensor|gateway|plc|manual|app-camera|app-scan`.
2. **Everything has an idempotency/message_id** so repeated webhooks are safe.
3. **Fail-open for operations, fail-safe for accounting**: if sensor fails, allow manual entry for operation continuity, but flag records as `manual_override` and route to reconciliation.
4. **HMAC/mTLS for device authentication**, timestamp window, and server-side validation.
5. **Audit trail**: every input (sensor or manual) produces an `audit_logs` entry with signature, device metadata and retention metadata.
6. **UI fallback**: every sensor type has a required manual fallback control on the tablet/app (scan, manual numeric input, photo capture), plus explicit `source` recorded.

---

# 2 — Integration architecture (summary)

* On-prem **Gateway** (industrial PC / Raspberry Pi class) collects RS232, Modbus/OPC-UA, digital IO, GPIO, camera streams, MQTT from PLCs and sensors.
* Gateway signs and posts messages to **Edge Functions** (`edge/weighbridge`, `edge/sensor_ingest`, `edge/plc_ingest`, `edge/md_ingest`, `edge/scan_ingest`).
* Edge functions validate HMAC/mTLS + timestamp + `message_id`, write to `ingest_*` tables and then call transactional Postgres RPCs (e.g., `fn_create_grn`, `rpc_log_cutting_interval`, `rpc_create_packing_log`).
* Frontend tablets/apps directly upload photos to Supabase Storage (signed URL) and call RPCs if online; offline they store attachments in IndexedDB and replay via gateway or client sync when online.
* All events are stored with `device_meta` (device_id, firmware_version, gateway_id, sensor_type, signal_strength, confidence).

---

# 3 — Universal message contract (every sensor/webhook)

Common JSON fields for all hardware/webhooks. All messages MUST include these top-level fields:

```json
{
  "message_id": "uuid-v4",           // mandatory idempotency key
  "client_id": "gateway-01",         // device or gateway id
  "device_id": "weighbridge-01",     // specific sensor id (optional for gateways)
  "source": "sensor|gateway|plc|manual|app-camera|app-scan",
  "timestamp": "2026-01-26T08:15:00Z",
  "payload": { /* sensor specific body */ },
  "signature": "hmac-sha256-hex",    // HMAC of payload + timestamp by device secret
  "firmware_version": "v1.2.3",      // useful for debugging
  "confidence": 0.99                 // optional numeric confidence
}
```

Edge function checks:

* `timestamp` within allowed window (e.g., ±5 min default, configurable).
* `signature` verifies with device secret.
* `message_id` not processed before (idempotency check).
* `client_id` in allowlist.

If any check fails: 4xx returned and logged; the gateway retries according to exponential backoff.

---

# 4 — Specific sensor/message schemas & DB routing

I list each device/sensor from your flows, the exact fields to send, DB target table suggestion, and fallback manual UI behavior.

## 4.1 Weighbridge (primary)

**Where used**: Gate → GRN creation.

**Sensor fields (payload):**

```json
{
  "weighbridge_slip_no": "WB-0001",
  "gross_weight": 1100.0,
  "tare_weight": 100.0,
  "net_weight": 1000.0, // optional, server recomputes if missing
  "photo_paths": ["weighbridge/20260126/xyz.jpg"], // pref upload or base64 (gateway)
  "scale_status": "OK|ERROR|CALIB_REQUIRED",
  "scale_temperature_c": 24.5
}
```

**Edge function**: `edge/weighbridge_webhook`
**Ingest table**: `ingest_weighbridge(message_id, client_id, device_id, gross_weight, tare_weight, net_weight, slip_no, photos, scale_status, firmware_version, timestamp)`
**Transaction RPC**: calls `fn_create_grn` if gate entry exists or returns operation token so frontend can continue GRN creation.

**Checks & validation**:

* If `net_weight` not provided → compute net = gross − tare.
* Compare `net_weight` with `expected_qty` from challan (if provided in gate entry). If discrepancy > per-material tolerance → set `status='DISCREPANCY'`, create `discrepancy_ticket`, notify Stores.
* If `scale_status != OK` → reject ingestion and create `maintenance_ticket`.

**Manual fallback (app)**:

* Tablet GRN UI shows "Fetch weighbridge data" button. If gateway fails, operator sees manual fields: `gross`, `tare`, optional photo. When saving from manual, set `source=manual` and `manual_reason` required.
* App records `weighbridge_manual_override=true` and requires Stores Supervisor signature for acceptance.

---

## 4.2 Vehicle camera photos (gate / pallet)

**Where used**: Gate entry, pallet photos for GRN.

**Payload**

* If gateway pushes: `photo_base64` or `photo_path` after gateway upload to storage.
* Meta: `camera_angle`, `resolution`, `exposure`, `timestamp`.

**DB**: `ingest_photos` storing `photo_path`, `thumb_path`, EXIF + `linked_entity` (`gate_entry`/`grn`/`pallet`).

**Manual fallback**:

* App camera modal → capture photo (mandatory), compress, upload to signed URL; if offline, store locally and show strong visual queue until upload done.

---

## 4.3 Barcode scans and pallet printing/scanning

**Where used**: GRN pallet barcode, container bag codes, wrapper lot, storage bin scans, FG storage location, dispatch LR/challan.

**Payload**

```json
{
  "scan_type": "barcode|qrcode|rfid",
  "code_value": "GRN-20260126-0001",
  "scanner_id": "scanner-01",
  "scan_method": "keyboard|camera|scanner_api",
  "timestamp":"..."
}
```

**DB**: `scan_events(entity_type, entity_id, code_value, device_id, user_id, timestamp)`

**Manual fallback**:

* App input field with on-screen keyboard plus camera-scan button. If scanning fails, manual entry required + capture photo of barcode.

---

## 4.4 Transfer to Sub-Inventory (pallet/bin scan)

**Where used**: Step 8 transfer.

**Sensor inputs**:

* Pallet barcode scanned (maps to `grn_id`).
* Destination bin scan (location barcode).
* Operator confirmation scan (operator badge scan) or tablet button.
* Gate presence detection optional.

**Payload** (gateway or app):

```json
{
  "transfer_no": "TR-20260126-0001",
  "grn_allocations": [{"grn_id":"...", "qty": 200}],
  "destination_bin": "BIN-12-A",
  "pallet_photo": "path",
  "operator_id": "user-uuid"
}
```

**RPC**: `rpc_transfer_to_subinventory` which calls FEFO allocation as validation (the UI shows FEFO, but RPC enforces it).

**Manual fallback**:

* If scanner offline, show manual `grn_no` dropdown + `enter qty` with reasons & supervisor ack for split picks. Mark transfer record with `source=manual`.

---

## 4.5 Premix & Mixing HMI + weigh scales + pH sensors

**Where used**: Step 11 premix & mixing tracking.

**Inputs (HMI + sensors)**

* Weigh scale reading (per bag / bulk)
* Scale barcode (bag code)
* Premix start/end timestamps (HMI)
* Mixer speed (rpm) if mixer has tacho or provided by HMI/PCL
* Dough temperature (thermocouple)
* pH value (lab instrument or inline)
* Creaming time (operator or sensor)
* Batch counters from premix machine (if available)
* Weighed bag photo (optional)

**Payload examples**:
Premix:

```json
{
  "sub_batch_id":"sb-uuid",
  "weigh_scale_readings":[{"material_id":"m1","qty":100,"bag_code":"BC-123"}],
  "premix_start":"...",
  "premix_end":"...",
  "operator_id":"...",
  "photos":["..."]
}
```

Mixing:

```json
{
  "sub_batch_id":"sb-uuid",
  "mix_start":"...",
  "mix_end":"...",
  "mixer_speed_rpm":50,
  "dough_temp_c":28.2,
  "ph":6.1,
  "creaming_time_sec":180,
  "dough_waste_kg":2.4,
  "result":"OK|HOLD|REJECT",
  "operator_id":"...",
  "qa_signoff_id":"..." // required if HOLD or REJECT
}
```

**DB target**: `premix_logs`, `mixing_logs`.

**Validations & logic**:

* When premix readings are posted, lock the corresponding GRN allocations and decrement `available_qty` -> `reserved_qty` as `consumed_premix`.
* If mixing result = REJECT:

  * Mark sub-batch status = `REJECTED`.
  * Record analytics: GRN allocations are considered consumed for that batch (but flagged REJECTED) — this affects counts.
  * Create waste record under `wet_waste` with photos & reason.

**Manual fallback**:

* If HMI offline: operator uses tablet to input `weigh scale reading` manually and captures photo of scale showing reading. App requires operator signature. QA must sign if mixing result is HOLD/REJECT.

---

## 4.6 Cutting — RPM sensor & stack sampling & waste logging

**Where used**: Step 12 capacity + quality.

**Sensor inputs**:

1. **RPM sensor** (optical/tachometer; or HMI tag)

   * `rpm`, `interval_start`, `interval_end`, `sample_count` optional
2. **Downtime digital input** from machine (start/end) or operator manual events
3. **Stack sample** via operator: weight (g) + photo + sample type
4. **Wet waste** manual entries with photo + reason

**Cutting payloads**:

RPM interval (sensor):

```json
{
  "machine_id":"cutter-01",
  "interval_start":"2026-01-26T09:00:00Z",
  "interval_end":"2026-01-26T09:10:00Z",
  "rpm_samples":[120,121,119,118], // optional
  "source":"sensor",
  "message_id":"..."
}
```

Cutting log (operator):

```json
{
  "sub_batch_id":"...",
  "start_ts":"...",
  "stop_ts":"...",
  "rpm_entered":120, // if operator manual
  "downtimes":[{"start":"...","end":"...","reason":"jam","affects_capacity":true}],
  "wet_waste_kg":1.5,
  "stack_samples":[{"sample_id":"s-001","stack_type":"working","weight_g":320,"photo":"path"}]
}
```

**DB**: `cutting_logs`, `rpm_intervals`, `stack_samples`, `wet_waste_records`.

**Capacity logic**:

* `biscuits_per_rev` master data used; compute theoretical biscuits/min = rpm * biscuits_per_rev.
* Running minutes = total interval − downtime where `affects_capacity=true`.
* expected_production = theoretical * running_minutes.
* Store per-interval expected_production in `capacity_aggregates`.

**Sensor smoothing & validation**:

* If RPM samples present, compute median or trimmed mean; discard outliers beyond ±20% before aggregation.
* If sample_count low or noisy, set `quality='low'` and mark as `requires_verification`.

**Manual fallback**:

* Operator can enter RPM manually and must capture `start`/`stop` times, plus provide stack photo for QC. If RPM sensor fails for >1 interval, auto-notify maintenance.

---

## 4.7 Oven (Baking) inputs

**Sensors & inputs**:

* Oven start/end times, oven gauge values, inside oven temp sensors, moisture analyzer reading (lab instrument)
* Sample stack weight + photo + QA comments

**Payload**:

```json
{
  "sub_batch_id":"...",
  "bake_start":"...",
  "bake_end":"...",
  "oven_temp_avg_c":220,
  "moisture_pct":1.8,
  "sample_stack_weight_g":315,
  "qa_result":"OK|HOLD|REJECT",
  "photos":["..."]
}
```

**Manual fallback**:

* Capture readings manually on app and attach a photo of oven control panel; QA signature required when `qa_result != OK`.

---

## 4.8 Packing machine inputs & Metal Detector (MD)

**Sensors & tags**:

* Pack counter (PLC / pulse counter) produces cumulative `packs_count` and runtime start/stop.
* MD counters produce `md_reject_count` events and optionally `md_reject_images` (if camera).
* Wrapper roll sensors provide `wrapper_reel_id` (scanned) and `meters_consumed` from encoder.

**Packing payload**:

```json
{
  "machine_id":"pack-02",
  "interval_start":"2026-01-26T10:00:00Z",
  "interval_end":"2026-01-26T10:30:00Z",
  "packs_produced":2400,
  "runtime_seconds":1800,
  "wrapper_reel":"WR-202601-01",
  "wrapper_consumption_m": 350,
  "wrapper_waste_m": 5,
  "md_reject_count": 3,
  "md_reject_photos": ["md/20260126/....jpg"]
}
```

**DB**: `packing_logs`, `packing_md_rejects`, `wrapping_consumption`.

**MD spike detection**:

* If `md_reject_count` rate > threshold (configurable per SKU) → create alert to QA + auto-generate MD trend graph for last N hours.

**Manual fallback**:

* Operator manual pack count entry with signature and photo of machine display. If MD camera offline, operator must capture photo of reject samples.

---

## 4.9 FG Batch creation (packing counts are final truth)

**Inputs**:

* Packing logs (from sensors or manual) are aggregated shift-wise to form FG batch.

**RPC**: `rpc_create_fg_batch` expects `packing_summary` (produced_qty, md_qty, scrap_qty), list of `sub_batch_ids`, `grns_used` (proportionally derived).

**Key rule**: If packing logs (sensor) exist, they are the canonical source. If manual packing counts applied, mark `source=manual` and require supervisor sign-off.

**Payload example**:

```json
{
  "shift":"A",
  "sku_id":"sku-123",
  "produced_qty":12000,
  "good_qty":11970,
  "scrap_qty":20,
  "md_qty":10,
  "packing_logs":[ "packlog-id-1","packlog-id-2" ],
  "sub_batches":["sb-1","sb-2"]
}
```

---

# 5 — Database ingestion tables (suggested structure)

Create these `ingest_*` tables as raw append-only records with minimal mutation (Edge writes here); downstream RPCs reference them.

* `ingest_weighbridge(...)`
* `ingest_photos(...)`
* `ingest_scans(...)`
* `ingest_rpm_intervals(...)`
* `ingest_cutting_logs_raw(...)`
* `ingest_packing_logs_raw(...)`
* `ingest_md_rejects(...)`
* `ingest_plc_tags(...)` (generic)

Each row: `(id SERIAL, message_id UUID, client_id text, device_id text, payload jsonb, signature text, created_at timestamptz default now(), processed boolean default false, process_notes text)`

Edge function marks `processed=true` after successful transactional RPC.

---

# 6 — Edge functions (concrete names & responsibilities)

* `edge/weighbridge_webhook` — validate + insert to `ingest_weighbridge` + call `fn_create_grn` or queue GRN creation flow if gate entry missing.
* `edge/photo_ingest` — validate image metadata, store on Supabase storage (or gateway forwards path), create `ingest_photos`.
* `edge/scan_ingest` — receive scans from scanners/gateway, write to `ingest_scans`.
* `edge/sensor_ingest` — generic endpoint for RPM, oven temp, packing counters; writes to ingest tables and triggers `rpc_log_cutting_interval` or `rpc_create_packing_log`.
* `edge/md_ingest` — MD reject messages with photos; triggers alert if threshold exceeded.
* `edge/plc_ingest` — accepts OPC-UA/MQTT tag pushes and maps tags to domain events.
* `edge/replay` — used by gateway to replay cached messages; must accept `message_id` same idempotency checks.

All edge functions must:

* Verify signature & timestamp.
* Verify `message_id` uniqueness.
* Write raw ingest record, then call the appropriate RPC inside try/catch.
* On RPC failure: write `process_notes` and return appropriate HTTP code; gateway will retry later.

---

# 7 — Manual fallback UX patterns (for each input type)

Across flows: UI always shows sensor status and fallback button beside each expected sensor readout.

Examples:

* Weighbridge: [Fetch weight] — if unreachable → `Enter gross/tare manually`, `Attach weigh scale photo` (mandatory), `Supervisor signature` required for manual entry.
* RPM: show live RPM if sensor present; else show `Enter RPM` numeric field + `Start/Stop` time picker.
* Barcode scan: camera scan button; if camera fails, display `Enter code manually` + `Capture barcode photo`.
* Packing counts: if PLC present, autopopulate counts; else show manual count input + machine display photo.
* MD rejects: if MD camera offline require operator photo of rejected sample + reason + QA sign-off to treat as MD reject.

For every manual override:

* `manual_override_reason` mandatory (picklist + free-text).
* `manual_override_approver` required for high-impact fields (GRN weight, FG produced_qty) with digital signature.
* Records include `source=manual`, `manual_provenance` JSON (who, when, evidence photos).

---

# 8 — Validation, smoothing, and anomaly detection

Sensors are noisy. Implement standard routines in Edge or Postgres:

* RPM smoothing: compute median of last N samples; discard outliers beyond ±25% of median.
* Pack counter monotonic check: counter must not go backwards; if it does, treat as rollover or sensor fault — flag and notify.
* Weighbridge drift detection: if scale frequently reports `scale_status != OK` or net changes > tolerance for same truck, flag maintenance.
* MD spike detection: sliding window rate per 1000 packs; if rate > threshold → auto alert.
* Photo verification: simple checksum on image upload; compute basic image blur detection (edge/gateway) — if blurred, request new photo from operator.

When anomaly detected:

* Create `anomaly_event` record with severity and suggested action.
* Notify Slack/Email/WS to assigned roles.

---

# 9 — Commissioning & testing steps (per-site)

For each plant, perform the following commissioning steps (exact sequence):

1. Install & secure gateway; connect UPS; configure NTP; provision device secret; register `client_id` in allowlist.
2. Connect weighbridge RS232/USB; run raw stream test; gateway captures slips and posts test message; Edge validates signature.
3. Install IP cameras; test photo capture, upload to storage via gateway; confirm thumbnail generation.
4. Attach RPM sensor to cutter; run known RPM test (spin at controlled rate); compare received RPM to known.
5. Connect PLC (optional): configure `plc_adapter` to map tags to expected message schema and test.
6. Barcode printer: send test print; scan with tablet camera.
7. MD integration: send test reject events and photos; validate alerting.
8. Run **E2E test sequence**:

   * Mock truck enters: gate entry on tablet → weighbridge sends webhook → QA sample created → GRN created → transfer to sub-inventory (scan) → Add sub-batch (allocation preview) → premix/mixing logs (HMI or manual) → cutting with RPM intervals → baking logs → packing logs → FG batch; verify inventories change as expected.
9. Offline simulation: disconnect gateway network; run a set of manual entries on tablet including photos; reconnect and ensure ingest replay handled and idempotent.
10. Security test: replay old `message_id` to edge and verify rejection; attempt invalid signature -> reject.

Record commissioning results in a `commissioning_report` (CSV + screenshots).

---

# 10 — Test cases (concise list of high-value tests)

* FEFO with ITC expiry primary: create GRNs with earlier ITC expiries and request allocation > single GRN qty; verify allocation order.
* Weighbridge discrepancy: simulated net differs by > tolerance → `discrepancy_ticket` created and GRN flagged.
* RPM smoothing: send noisy RPM samples; verify aggregated median used and capacity calculation stable.
* Offline sync: create packing logs offline with attachments; on reconnect verify uploaded attachments and RPC success; if allocation failure, verify `allocation_failed` UI path.
* MD spike: feed MD rejects to edge to breach threshold -> verify QA alert.
* Manual override: perform manual GRN entry and ensure `manual_override` flagged and supervisor approval required.

---

# 11 — Monitoring, metrics & alerts (must configure)

Equip SRE with these dashboards / alerts:

* Gateway health: `last_seen` metric per gateway (alert if > 5min).
* Edge ingest error rate per endpoint (alert if > 2%/min).
* Ingest replay queue length on gateway (alert if > 50).
* FEFO partial allocations count per hour (alert).
* Photo upload failure rate (alert).
* MD reject rate per SKU: alert when spike > configured threshold.
* Inventory variance alerts: if daily variance > tolerance → notify Stores + Audit.

---

# 12 — Runbooks (examples)

Runbook: Gateway offline

1. Check gateway `last_seen` on dashboard.
2. If `last_seen` > 5 min, attempt SSH to gateway; if unreachable, dispatch field engineer.
3. If gateway network down but physically on, instruct operator to use tablet offline queue and document manual entries.
4. After gateway is back, run `edge/replay` to ingest queued messages; verify idempotency.

Runbook: Weighbridge high discrepancy

1. Query `ingest_weighbridge` last 24 hours for truck.
2. If scale error pattern, open `maintenance_ticket`, set `scale_status=CALIB_REQUIRED`.
3. For affected GRNs, create `investigation_ticket` and notify Stores & QA.

---

# 13 — Error codes & remediation patterns (structured)

Common Edge responses:

* `400` : invalid schema or signature failed — gateway should log & retry after fix.
* `409` : duplicate message_id (already processed) — gateway stops retry.
* `422` : domain validation failed (e.g., ITC expiry missing) — send to operator UI for manual data.
* `500` : transient server error — gateway uses exponential backoff and retries.

---

# 14 — Data retention & evidence for audits

* Keep raw ingest tables & photos for at least retention windows required by audits (recommend 2–7 years depending on regs). Archive older photos to cold storage.
* Keep `audit_logs` append-only and immutable.
* Expose an `audit_export` Edge function that can produce CSVs per `grn_no`, `sub_batch_no`, `fg_batch_no` for auditors.

---

# 15 — Implementation checklist (developer + integrator quick tasks)

* [ ] Implement `ingest_*` tables and idempotency table.
* [ ] Implement Edge functions named above with HMAC signature checks.
* [ ] Implement sensor smoothing functions (RPM median) and anomaly detector.
* [ ] Implement RPCs with audit logging for weighbridge, cutting, packing, FG creation.
* [ ] Frontend: add fallback UI elements for manual entry & photo capture per sensor.
* [ ] Gateway: secure keystore, local caching SQLite, replay interface, health endpoint.
* [ ] Commissioning test scripts & `commissioning_report` template.
* [ ] Monitoring dashboards and alert rules.
* [ ] Runbook documentation for top 10 incidents.

---

# 16 — Final notes (short)

* Every sensor event must carry `message_id`, `device_meta`, `source`, `signature` and `timestamp`. Implement idempotency and strict validation.
* Manual entry is allowed everywhere but must be **explicit**, **evidence-backed** (photo) and require **supervisor approval** for high-impact fields (GRN weights, FG produced qty).
* Make the FEFO rule and `ITC expiry` primary visible in UIs and in logs so allocations are always traceable back to GRN.

---
