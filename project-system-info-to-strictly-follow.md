Project Title

Unified Manufacturing, Inventory, Production & Capacity Management Platform

Overview

A comprehensive manufacturing execution and operations management platform designed to digitize and unify raw material handling, production execution, quality control, inventory management, capacity monitoring, maintenance, and analytics across multiple production lineups.

The platform is built to closely mirror actual shop-floor processes, enabling real-time visibility, accurate production forecasting, physical versus system inventory comparison, and data-driven decision-making. It aims to provide a scalable, practical, and manufacturing-focused alternative to fragmented ERP setups and manual tracking systems.

Problem Statement

Manufacturing units operating multiple production lines often rely on a mix of manual registers, spreadsheets, and disconnected systems to manage raw material receipt, inventory, production, quality checks, and maintenance activities. This fragmented approach leads to limited real-time visibility, inconsistencies between physical inventory and system records, and difficulty in accurately tracking production performance.

Capacity monitoring is typically retrospective, making it challenging to determine expected versus actual output, adjust production based on downtime, or identify where losses and inefficiencies occur. Physical inventory audits frequently reveal mismatches without clear traceability or root-cause analysis.

Existing software solutions are either too generic, overly complex, or not aligned with actual shop-floor workflows. There is a clear need for a unified, process-driven digital platform that reflects real manufacturing operations, supports accurate capacity and inventory comparisons, and delivers actionable insights across all production lineups.

Core Objectives

Digitization of end-to-end manufacturing process flows
Raw material traceability from gate entry to finished goods
Batch and sub-batch level production tracking
Recipe management with controlled carry-forward logic
Real-time capacity monitoring based on machine RPM and speed
Theoretical versus actual production comparison
Downtime-adjusted expected output calculation
Physical inventory and system inventory comparison
Waste tracking and loss analysis
Maintenance, breakdown, and spare part management
Centralized analytics and performance dashboards

Target Users

Manufacturing organizations across food and FMCG sectors, including:

Small and mid-sized manufacturing units
Multi-line production facilities
Large-scale plants requiring detailed traceability and analytics
Quality, production, maintenance, and operations teams

Primary Platforms

Web Application (Factory & Management Dashboards) and Mobile application

Product Overview — Manufacturing & Production Management Platform

The platform provides a single integrated system to manage raw material receipt, inventory control, production execution, quality assurance, capacity monitoring, downtime handling, and reporting. Designed around actual factory workflows, it enables accurate forecasting, audit-ready traceability, and continuous performance improvement across all production lineups.




IMPLEMENTATION DETAILS: STRICTLY FOLLOW ALL OF THESE BELOW


This project is focused on factories like of Biscuits etc.


End-to-End Process Flow – Digitization Blueprint (Plant Sign-Off Version) 

Purpose: 
Plain-language, stepwise blueprint explaining how the MES/tablet system will replace paper registers and how every station will operate and 
sign-off. It defines inputs, outputs, decisions and who signs when. Use as the single source-of-truth for operations. 
Primary rules (the unwavering truths): 
1. GRN is the unit of consumption. All raw material movement is tracked by GRN. 
2. Expiry priority: ITC / Factory expiry is PRIMARY, Vendor expiry is SECONDARY. FEFO decisions use ITC expiry first. 
3. Output drives truth. Production truth = physical output (packing/FG). Capacity = theoretical from RPM × runtime (adjusted for logged 
downtime). 
4. Everything you enter is accountable. Every critical entry requires an electronic sign-off (operator/supervisor/QA).

Summary 
• GRN — Goods Received Note (unique receipt record). 
• Sub-Inventory / Day Store — line buffer used for today’s production. 
• Sub-Batch — a production unit created by clicking Add Sub-Batch. 
• FG Batch — Finished Goods batch; one per shift per SKU (Shift A / Shift B). 
• Wet Waste — cutting-stage scrap (dough/steel). 
• Dry Waste — baking/packing rejects, metal-detect rejects. 
Flow map (high level) 
1. Gate Entry → 2. Weighbridge → 3. Vehicle Inspection (L1→L2) → 4. QA / Lab → 5. GRN Creation → 6. Main Inventory (FEFO, ITC expiry primary) → 7. 
Transfer to Sub-Inventory → 8. Operator: Add Sub-Batch (premix auto GRN allocation) → 9. Mixing → 10. Cutting (stack sample weight + RPM 
capacity) → 11. Baking (oven sample + live dry waste) → 12. Packing + MD (machine-wise counts + live waste) → 13. FG Batch creation (shift
wise) → 14. Dispatch → 15. Physical vs System reconciliation & audits. 

Detailed step-by-step process (fields, decisions, sign-offs, exceptions) 

1. Gate Entry  
Who: Gate security 
Where: Gate tablet / register 
Fields to enter (once per truck): 
• Date (auto) 
• Time (auto) 
• Vehicle number (plate) 
• Vendor name & code 
• Material name & material code 
• Challan / Invoice no & date 
• Driver name & mobile 
• Expected quantity (per challan) 
• Photo of vehicle & seal (mandatory) 
Decision: Allow to weighbridge / Hold 
Sign-off: Gate operator signs (electronic). If Hold, record reason and notify Stores + QA. 


2. Weighbridge 
Who: Weighbridge operator 
Fields: 
• Weighbridge slip no (scan / photo) 
• Gross weight (kg) 
• Tare weight (kg) 
• Net weight (auto = gross − tare) 
• Photo of truck on scale (mandatory) 
Checks: Compare net vs challan; if discrepancy > tolerance, flag to Stores. 
Decision: Proceed to vehicle inspection / Hold 
Sign-off: Weighbridge operator + Stores Supervisor 

3. Vehicle Inspection (Level 1) 
Who: Vehicle inspector L1 
Checklist (Yes / No): 
• Floor clean? 
• Side walls clean? 
• Tarpaulin intact (top / bottom)? 
• Odour? (none/abnormal) 
• Visible dust / moisture? 
• Seal intact? 
• Hazardous material history OK? 
Remarks (mandatory if any No). 
Decision: Pass → send to QA; Fail again → Final Reject (truck returned). 
Sign-off: L2 + Stores In-charge. 

4. QA – Raw Material Quality Check 
Who: QA Inspector 
Sample creation: System auto-creates SampleID linked to Gate Entry 
Fields (must be filled): 
• Sample ID (auto) 
• Sampling time & location 
• Vendor manufacturing date (mandatory) 
• Vendor expiry date (mandatory) 
• ITC / Factory expiry date (mandatory) — PRIMARY expiry 
• Appearance (OK / not OK) 
• Moisture % (numeric) 
• Odour (OK / abnormal) 
• Foreign matter (Y/N) 
• Lab attachments / photos / instrument printout 
Decision (QA): Accept / Hold / Reject 
• Accept: proceed to GRN creation. 
• Hold: stock moved to Hold bin; schedule re-test and record hold reason; no GRN. 
• Reject: re-sample/re-test once; if rejected again → Final Reject and return goods. 
Sign-off: QA Inspector (and QA Manager for Hold/Reject).
Notes: System highlights ITC expiry; if ITC expiry < minimum required shelf policy → auto-hold. 

6. GRN Creation (after QA Accept) 
Who: Stores Executive 
System auto-generates: GRN number 
Fields stored: 
• GRN No (auto) 
• Date/time (auto) 
• Material code & name 
• Net received quantity (kg) 
• Vendor expiry date 
• ITC expiry date (primary) 
• Storage location / bin 
• Pallet barcode (print/scan) 
• Photos attached (weighbridge, pallet) 
Business rule: FEFO key = (ITC expiry, GRN received date). Allocation will use ITC expiry first. 
Sign-off: Stores Exec + Stores Manager 

7. Main Inventory (GRN-wise) & Container inventory 
What is tracked automatically on GRN: 
• Raw material weight (kg) per GRN (Expiry date ITC + Vendor also Vendor details) 
Examples: 
• Container units (bags/tins/drums) recorded on GRN: when material arrives in bags/tins, system records container units automatically linked to 
GRN. 
• 100 bags × 10 kg = 1000 kg Maida → Stored as: RM: 1000 kg Maida (GRN-001) ; Container inventory: Bags: 100 units (linked to GRN-001). 
Container inventory types: 
• Reusable (to be returned / washed) 
• Scrap (to be sold) 
• Saleable scrap (if allowed) 
Packaging materials inventory: (laminates, cartons, trays) tracked separately by GRN/lot and consumed at packing. Packaging inventory uses FIFO. 
Physical vs system: 
• Daily operational counts will be taken at Sub-Inventory and main store start/end of shift (short counts). 
• Monthly full GRN-wise audit counts (formal audit) required. 

8. Transfer to Sub-Inventory (for production) 
Who: Stores Issuer & Line In-charge 
Trigger: Production Planner releases production order. 
System action (auto FEFO): 
• System shows FEFO pick list (ITC expiry first). 
• Stores issues GRN-wise quantities to Sub-Inventory (pallet/bin scan). Partial GRN allocations allowed. 
Fields to capture: 
• Transfer date/time 
• GRN numbers & allocated quantities (auto) 
• Destination sub-inv bin (scan) 
• Physical receipts confirmed at line (operator scan) 
Sign-off: Stores Issuer + Line In-charge 
Exception: If a GRN is insufficient, system auto-picks next GRN and logs split. Alert sent to Planner/Stores. 

9. Recipe Templates (master) — create & use 
Who: Planner / Production Manager / Authorized user 
Function: Build recipe templates (drag-drop style) per SKU and version; templates define material components + quantities + tolerances. 
Fields in template: 
• Template name & version 
• SKU 
• List of materials & required qty per sub-batch 
• Tolerance for each material (percent) 
• Notes (special instructions) 
Usage: When Planner/Operator starts production, they select a recipe template for the production order. System then auto-reserves required GRNs 
from Sub-Inventory by FEFO. 
Sign-off: Template saved by Planner and version recorded. 

10. Add Sub-Batch  
Who: Line Operator 
Action: Operator enters number of sub batches is needed to be created ex. 5 sub batches from A recipe template. 
System does automatically: 
• Creates SKU based Master Batch ID (Date_SKU_Shift) 
• References recipe template & SKU 
• Calculates required material quantities 
• Allocates GRN-wise quantities from Sub-Inventory using FEFO (ITC expiry primary) 
• Reserves quantities (transactional) allocations shown read-only to operator 
• Prints / displays allocation summary (GRN numbers + qty used per GRN) 
Operator check (must do): 
• Verify recipe shown (Yes/No) 
• Acknowledge GRN allocation alert(s) (OK/Seen) 
Sign-off: Operator registers “Start Sub-Batch” (click) and Shift Supervisor sees allocation. No manual GRN picking allowed. Overrides require 
Supervisor + Manager approval & reason. 

11. Maida Batch Premix & Mixing (parallel operations) 
Who: Premix operator / Mixing operator / QA 
Through recipe GRN for Maida used is locked but through HMI machine data we will also log number of batches of Maida used comparative to 
premix batches made and mixing batches made parallel 
Premix log fields (per premix batch): 
• Sub-batch ID (auto) 
• GRN(s) used per material (auto) 
• Target quantity vs actual weighed quantity (operator entry) 
• Stock code for bag/container captured automatically when consumed 
• Premix start & end timestamp 
• Operator name & signature (electronic) 
• Photo of weigh scale / premix 
Mixing log fields (per sub-batch): 
• Mixing start & end time 
• Creaming time 
• Mixer speed (entered) 
• Dough temperature 
• pH (if measured) 
• Result: OK / HOLD / REJECT 
• Dough waste (kg) logged live 
• Operator sign-off; QA sign-off if HOLD
NOTE – These fields will get referenced until rewrite is needed and once new rewrite has occurred that is taken as reference for next sub 
batches this will be based on premix mix sub batches dependency. 
Batch elimination case: If mixing result = REJECT, operator marks the sub-batch as Rejected. System logs that the sub-batch’s GRN allocations were 
consumed but the sub-batch is flagged Rejected and will not advance to cutting/packing. This elimination is captured under analytics and counts 
(e.g., 50 premix vs 49 final). 
Sign-offs: Premix operator + Mixing operator + QA (if hold/reject).

12. Cutting — capacity and sample-based quality (parallel) 
Who: Cutting operator & Shift Supervisor & QA 
Two parallel activities run simultaneously: 
A — Capacity monitoring (mechanical) 
Inputs (manual entry): 
• RPM reading (entered by operator or auto via simple sensor if available) 
• Cutter Start time & Stop time for the running interval 
• If downtime occurs, operator records downtime start/end and reason and checks if downtime affects capacity (see Downtime section). 
System computes: 
• Biscuits per revolution (master data for die) — e.g., 1 rev = 12 biscuits 
• Theoretical biscuits/min = RPM × biscuits/rev 
• Actual running minutes = Total time − Sum(downtime intervals marked “affects capacity”) 
• Expected production (capacity) = biscuits/min × running minutes 
Display: Capacity card on cutting screen shows current RPM, running minutes, expected biscuits for the period. Supervisor can view trend. 
B — Quality sampling (stack weight) 
Observation (sample) fields: 
• Observation timestamp (auto) 
• Sample ID 
• Stack Type (Working area / Non-working & Rework area) — select 
• Stack weight (grams) — operator measures & enters 
• RPM (optional) — helpful for correlation 
• Photo of stack (mandatory) 
System derives: Average biscuit weight trend, quality checks. 
Important rule: Stack sampling is only for quality and weight trend — it does NOT substitute for production count. 
Waste logging at cutting (live): 
• Wet waste (kg) entries — dough trimming, steel scrap — recorded with reason & photo. 
Sign-offs: Cutting operator + Shift Supervisor 

13. Downtime & capacity effect 
Who: Operator / Supervisor / Maintenance 
When raising downtime ticket: 
• Machine ID 
• Start timestamp (auto) 
• Dropdown of Category of Downtime + Stage which section downtime is happening. 
• Expected/Actual end timestamp 
• Reason code (dropdown) 
• Checkbox: “Oven shutdown?” (Yes/No) — required field where applicable 
• Parts used (if any) 
• Notes / Photo 
Business logic: 
• If Oven Shut down = Yes, system subtracts downtime minutes from running minutes used in capacity calculation of the affected machine 
(cutter or oven). 
• If No, the downtime is recorded for RCA, but capacity remains unchanged. 
Sign-off: Maintenance engineer + Line In-charge on closure 

14. Baking / Oven 
Who: Oven operator & QA 
Fields: 
• Bake start & end time 
• Gauge  
• Moisture content 
• Sample stack weight & colour rating & taste check (QA) 
Effect on capacity: If oven downtime ticket has “affects capacity = Yes” (checkbox set), system reduces available baking time when calculating 
expected output. 
Acceptance rules (example): 
• Avg weight within ±X% of standard → OK. 
• Moisture within SKU spec → OK. 
• If Not OK → QA holds sub-batch for rework/disposition. 
Sign-off: Oven operator & QA inspector 

15. Packing & Metal Detection (machine-wise) 
Who: Packing operator, Packing supervisor, QA 
Machine-wise fields (per packing machine): 
• Machine ID 
• SKU being packed 
• Pack size (g/pcs) 
• Packs produced (count) during shift / period 
• Runtime (start/stop times) 
• Operator name 
• Wrapper lot / reel number (scan) 
• Wrapper consumption (meters / rolls) 
• Wrapper waste (kg or meters) 
• MD reject count & disposition (photo) 
Live waste logging: Dry waste entries with reasons. MD rejects logged as Dry Waste and treated as non-reworkable unless QA authorizes. 
Sign-off: Packing Operator + Packing Supervisor


FINISHED GOODS QUALITY CHECK 

After FG Quality acceptance then only it will go to FG inventory 

16. Finished Goods (FG) Batch creation — Shift-wise 
Who: Packing Supervisor / FG In-charge 
Rule: FG batch = unique per SKU per shift. Each shift creates a separate FG batch. 
Fields: 
• FG Batch No (auto, e.g., 20260124-A-MARIE) 
• SKU 
• Shift (A/B) 
• Produced quantity (packs / kg) — auto from packing logs 
• Good qty, Scrap qty, MD qty (auto-calculated) 
• Sub-batches used (list) 
• GRNs used (list — proportion from allocations) 
• Manufacturing date/time 
• Batch expiry (calculated based on recipe shelf life and mfg date) 
• Storage location (bin/pallet) — scanned 
Sign-off: FG in-charge + Warehouse Supervisor 
Note: Packing counts are the final production truth for FG. Cutting theoretical numbers are for capacity and RCA only. 

17. Dispatch & Delivery traceability 
Who: Dispatch in-charge / Warehouse 
Fields for dispatch record: 
• Dispatch ID (auto) 
• FG Batch No (linked) 
• Quantity dispatched 
• Destination / customer name 
• Truck number & transporter 
• LR/challan no and date 
• Dispatch datetime 
• Driver name & mobile 
• Photo of pallet(s) loaded (mandatory) 
Effect: FG inventory reduces by dispatched qty. System retains chain: Dispatch → FG Batch → Sub-Batches → GRNs → Vendors. 
Sign-off: Dispatch in-charge + QA clearance signature (if required) 

18. Physical vs System Inventory reconciliation (daily & GRN-wise audit) 
Who: Inventory Auditor / Stores Supervisor / QA 
Daily operational reconciliation (End of shift): 
• Line In-charge or Stores clerk records physical opening and closing balances for Sub-Inventory. 
• System shows system balance (GRN-wise). 
• Fields: Material code, GRN no, system qty, physical qty, variance (kg & %), tolerance pct (material master). 
• If variance ≤ tolerance → auto-adjust with reason code and Stores Manager sign. 
• If variance > tolerance → create Inventory Investigation ticket and Supervisor + Audit involvement required. 
Monthly audit (GRN-wise): 
• Full GRN-wise physical count for main store. 
• All adjustments require audit ticket and two-level approvals. 
Adjustment records must contain: 
• Who performed count 
• Who approved adjustment 
• Old system qty vs new physical qty 
• Reason & attachments (photos) 
• Audit ticket ID 
Sign-off: Inventory Auditor & Stores Head (and Audit when > threshold) 

19. Analytics & flags (what the system will show) 
Auto flags / alerts to users: 
• GRN near depletion (threshold configurable) → Planner & Stores 
• GRN switch during active sub-batch → visible to Supervisor (ack required) 
• Variance > tolerance → Stores Manager + Audit 
• PLC/automatic counts missing — not applicable (no PLC) — manual counts missing → alert 
• MD reject spike → QA + Packing Supervisor 
• Downtime tickets with “affects capacity” → Production Manager 
Reports available to review: 
• Shift Summary: RM consumed (GRN-wise), sub-batches created, FG created, waste by stage, downtime minutes, packaging machine counts 
• Capacity vs actual: cutter theoretical vs packing counts 
• GRN switch log & expiry exposure 
• Physical vs system reconciliation log 

20. Role & responsibility matrix (one-liners) 
• Gate Security: vehicle entry, seal photo, challan match. 
• Weighbridge Operator: gross/tare; photo evidence. 
• Vehicle Inspector L1/L2: vehicle tidiness checks & re-inspection. 
• QA Inspector: sample tests, expiry verification (ITC expiry primary), accept/hold/reject decisions. 
•Stores Executive / Manager: GRN creation, pallet/bin assignment, physical counts. 
• Planner / Production Manager: create production plan, select recipe template, release production orders. 
• Line Operator (Pre-mix/Mix/Cutting/Packing): Add Sub-Batch, enter logs, samples, waste, downtime. 
• Maintenance: close downtime tickets and record repairs & spares used. 
• FG In-charge / Dispatch: FG batch creation, putaway, dispatch. 
• Inventory Auditor / Stores Head: daily checks, monthly audit, adjustments & approvals. 
