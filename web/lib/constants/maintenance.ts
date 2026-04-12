export const DOWNTIME_STAGES = [
    { value: 'MIXING', label: 'Mixing' },
    { value: 'CUTTING', label: 'Cutting' },
    { value: 'BAKING', label: 'Baking' },
    { value: 'PACKING', label: 'Packing' },
] as const

export const DOWNTIME_CATEGORIES = [
    { value: 'MECHANICAL', label: 'Mechanical' },
    { value: 'ELECTRICAL', label: 'Electrical' },
    { value: 'OPERATIONAL', label: 'Operational' },
] as const

export const DOWNTIME_REASONS = [
    { value: 'BELT_BROKEN', label: 'Belt Broken' },
    { value: 'MOTOR_TRIP', label: 'Motor Trip' },
    { value: 'NO_MATERIAL', label: 'No Material' },
    { value: 'CLEANING', label: 'Cleaning' },
    { value: 'OTHER', label: 'Other' },
] as const

export function getDowntimeReasonLabel(reasonCode: string | null | undefined): string {
    if (!reasonCode) return '-'
    const match = DOWNTIME_REASONS.find(item => item.value === reasonCode)
    return match?.label ?? reasonCode
}
