import { z } from 'zod'

export const gateEntrySchema = z.object({
    vendor_id: z.string().uuid("Invalid Vendor ID"),
    vehicle_no: z.string().min(4, "Vehicle plate required"),
    material_id: z.string().uuid("Invalid Material ID"),
    challan_no: z.string().min(1, "Challan No required"),
    // store as ISO date string but ensure it's a valid date
    challan_date: z
        .string()
        .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid Date"),
    driver_name: z.string().min(2, "Driver name too short"),
    driver_mobile: z.string().min(10, "Invalid Mobile"),
    expected_qty: z.number().positive("Must be positive"),
    gate_photo: z.any().refine(val => {
        if (!val) return false
        if (typeof val === 'string') return val.length > 0
        return typeof val === 'object' && 'size' in val && val.size > 0
    }, "Vehicle Photo Required"),
    seal_photo: z.any().refine(val => {
        if (!val) return false
        if (typeof val === 'string') return val.length > 0
        return typeof val === 'object' && 'size' in val && val.size > 0
    }, "Seal Photo Required"),
    status: z.enum(["ALLOW", "HOLD"]).default("ALLOW"),
    hold_reason: z.string().optional()
}).refine(data => {
    if (data.status === 'HOLD' && (!data.hold_reason || data.hold_reason.length < 5)) {
        return false
    }
    return true
}, { message: "Hold Reason required when Status is HOLD", path: ["hold_reason"] })


export const vehicleInspectionSchema = z.object({
    floor_clean: z.boolean(),
    walls_clean: z.boolean(),
    tarpaulin_intact: z.boolean(),
    odour_ok: z.boolean(),
    moisture_absent: z.boolean(),
    seal_intact: z.boolean(),
    hazardous_history_ok: z.boolean(),
    remarks: z.string().optional(),
}).refine(data => {
    // If any checklist item fails, remarks are mandatory and must be meaningful
    const anyFailed =
        !data.floor_clean ||
        !data.walls_clean ||
        !data.tarpaulin_intact ||
        !data.odour_ok ||
        !data.moisture_absent ||
        !data.seal_intact ||
        !data.hazardous_history_ok;

    if (!anyFailed) return true;

    return !!data.remarks && data.remarks.trim().length >= 5;
}, { message: "Remarks mandatory if any check fails", path: ["remarks"] })

export const weighbridgeSchema = z.object({
    weighbridge_slip_no: z.string().min(1),
    gross_weight: z.number().positive(),
    tare_weight: z.number().min(0),
    net_weight: z.number(), // Derived but validated
    photo: z.any().refine(val => {
        if (!val) return false
        if (typeof val === 'string') return val.length > 0
        // Accept File or Blob (checking for size ensures it's a valid binary object)
        return typeof val === 'object' && 'size' in val && val.size > 0
    }, "Weighbridge Photo Required"),
    // Optional Manual Override Fields
    scale_photo_evidence: z.any().optional(),
    manual_override_reason: z.string().optional()
})
