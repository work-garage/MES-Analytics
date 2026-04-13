'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle, XCircle, PauseCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/store/auth'
import PhotoCapture from '@/components/business/PhotoCapture'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { WORKFLOW_SEQUENCE } from '@/lib/workflow/sequence'

export default function QAPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading QA...</div>}>
            <QAPageContent />
        </Suspense>
    )
}

// Only items that have cleared Vehicle Inspection and are in QA-specific states
// Note: 'INSPECTED_OK' is set by the vehicle inspection RPC on PASS
const PENDING_STATUSES = ['INSPECTED_OK', 'QA_HOLD', 'QA_RETEST']
const FINAL_REJECT_STATUSES = ['QA_REJECTED']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null): value is string {
    return !!value && UUID_RE.test(value)
}

function getStatusBadge(status: string) {
    if (status === 'QA_HOLD')
        return <Badge className="bg-yellow-500 text-white">HOLD</Badge>
    if (status === 'QA_RETEST')
        return <Badge className="bg-orange-500 text-white">RE-VERIFY</Badge>
    if (status === 'INSPECTED_OK')
        return <Badge className="bg-slate-200 text-slate-700">PENDING</Badge>
    return <Badge className="bg-slate-200 text-slate-700">PENDING</Badge>
}

function QAPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const rawGateEntryId = searchParams.get('id')
    const gateEntryId = isUuid(rawGateEntryId) ? rawGateEntryId : null
    const { user } = useAuth()

    const [autoHoldReason, setAutoHoldReason] = useState<string | null>(null)
    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [finalRejectedEntries, setFinalRejectedEntries] = useState<any[]>([])
    const [showRejected, setShowRejected] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    // Detected from DB: entry already had a first rejection
    const [isSecondReject, setIsSecondReject] = useState(false)

    const { register, control, watch, handleSubmit } = useForm({
        defaultValues: {
            appearance: 'OK',
            appearance_description: '',
            taste_and_smell: 'Sweet, free from objectionable odour/taste',
            taste_and_smell_other: '',
            free_from: 'None',
            free_from_other: '',
            packing_condition: 'OK',
            moisture_pct: 0,
            foreign_matter: false,
            foreign_matter_description: '',
            vendor_mfg_date: '',
            vendor_expiry_date: '',
            itc_expiry_date: '',
            manual_hold_reason: '',
            defect_type: 'None',
            defect_other_description: '',
            remarks: '',
            sugar_appearance: 'OK',
            sugar_taste: 'OK',
            sugar_free_from: 'OK',
            sugar_moisture: 0,
            sugar_sucrose_pct: 98,
            sugar_water_insoluble_pct: 0,
            sugar_so2_ppm: 0,
            sugar_packing: 'OK',
            wheat_appearance: 'OK',
            wheat_infestation: 'OK',
            wheat_free_from: 'OK',
            wheat_taste: 'OK',
            wheat_moisture: 0,
            wheat_ash: 0,
            wheat_ash_insoluble: 0,
            wheat_alcoholic_acidity: 0,
            wheat_gluten: 0,
            wheat_sedimentation: 0,
            wheat_packing: 'OK',
            lab_photo: null
        }
    })

    const supabase = createClient()
    const itcExpiry = watch('itc_expiry_date')
    const appearanceValue = watch('appearance')
    const defectTypeValue = watch('defect_type')
    const tasteAndSmellValue = watch('taste_and_smell')
    const freeFromValue = watch('free_from')
    const moistureValue = watch('moisture_pct')
    const foreignMatterValue = watch('foreign_matter')

    useEffect(() => {
        if (rawGateEntryId && !gateEntryId) {
            toast.error('Invalid QA link. Please select an item from pending list.')
            router.replace('/qa')
        }
    }, [rawGateEntryId, gateEntryId, router])

    useEffect(() => {
        const fetchEntries = async () => {
            setIsLoading(true)
            if (gateEntryId) {
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*, materials(name), vendors(name)')
                    .eq('id', gateEntryId)
                    .single()
                setGateEntry(data)
                setIsSecondReject(data?.status === 'QA_RETEST')
            } else {
                const { data: pending } = await supabase
                    .from('gate_entries')
                    .select('*, materials(name), vendors(name)')
                    .in('status', PENDING_STATUSES)
                    .order('updated_at', { ascending: true })
                setPendingEntries(pending || [])

                const { data: rejected } = await supabase
                    .from('gate_entries')
                    .select('*, materials(name), vendors(name)')
                    .in('status', FINAL_REJECT_STATUSES)
                    .order('updated_at', { ascending: false })
                setFinalRejectedEntries(rejected || [])
            }
            setIsLoading(false)
        }
        fetchEntries()
    }, [gateEntryId])

    // Auto-Hold: threshold is 7 days
    useEffect(() => {
        if (!itcExpiry) return
        const expiry = new Date(itcExpiry)
        const warningDate = new Date()
        warningDate.setDate(warningDate.getDate() + 7)
        if (expiry < warningDate) {
            setAutoHoldReason(expiry < new Date()
                ? 'ITC Expiry date is in the PAST. Material is already expired.'
                : 'ITC Expiry is below minimum shelf life threshold (7 days).')
        } else {
            setAutoHoldReason(null)
        }
    }, [itcExpiry])

    // Direct gate_entries status update — safe, no check-constraint issues
    const updateGateStatus = async (newStatus: string) => {
        if (!gateEntryId) throw new Error('Invalid gate entry ID')
        const { error } = await supabase
            .from('gate_entries')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', gateEntryId)
        if (error) throw error
    }

    const handleAccept = handleSubmit(async (values: any) => {
        if (!gateEntryId) {
            toast.error('Invalid gate entry ID. Re-open QA from pending list.')
            return
        }
        if (!user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }

        if (autoHoldReason) return

        const failedChecks = []
        if (!values.vendor_mfg_date) failedChecks.push('Vendor Mfg Date (Missing)')
        if (!values.vendor_expiry_date) failedChecks.push('Vendor Expiry (Missing)')
        if (!values.itc_expiry_date) failedChecks.push('ITC Expiry (Primary) (Missing)')

        const matName = gateEntry?.materials?.name?.toUpperCase() || '';
        const isSugar = matName.includes('SUGAR');
        const isWheat = matName.includes('WHEAT FLOUR') || matName.includes('MAIDA');

        if (isSugar) {
            if (values.sugar_appearance !== 'OK') failedChecks.push('Appearance')
            if (values.sugar_taste !== 'OK') failedChecks.push('Taste & Smell')
            if (values.sugar_free_from !== 'OK') failedChecks.push('Free From Contaminants')
            if (Number(values.sugar_moisture) > 0.1) failedChecks.push(`Moisture (${values.sugar_moisture}% > 0.1%)`)
            if (Number(values.sugar_sucrose_pct) < 98) failedChecks.push(`Sucrose (${values.sugar_sucrose_pct}% < 98%)`)
            if (Number(values.sugar_water_insoluble_pct) > 0.1) failedChecks.push(`Water Insoluble (${values.sugar_water_insoluble_pct}% > 0.1%)`)
            if (Number(values.sugar_so2_ppm) > 70) failedChecks.push(`SO2 (${values.sugar_so2_ppm}ppm > 70)`)
            if (values.sugar_packing !== 'OK') failedChecks.push('Packing Condition')
        } else if (isWheat) {
            if (values.wheat_appearance !== 'OK') failedChecks.push('Appearance')
            if (values.wheat_infestation !== 'OK') failedChecks.push('Infestation')
            if (values.wheat_free_from !== 'OK') failedChecks.push('Free From')
            if (values.wheat_taste !== 'OK') failedChecks.push('Taste & Smell')
            if (Number(values.wheat_moisture) > 14) failedChecks.push(`Moisture (${values.wheat_moisture}% > 14%)`)
            if (Number(values.wheat_ash) > 1.0) failedChecks.push(`Total Ash (${values.wheat_ash}% > 1.0%)`)
            if (Number(values.wheat_ash_insoluble) > 0.05) failedChecks.push(`Ash Insoluble (${values.wheat_ash_insoluble}% > 0.05%)`)
            if (Number(values.wheat_alcoholic_acidity) > 0.1) failedChecks.push(`Alcoholic Acidity (${values.wheat_alcoholic_acidity}% > 0.1%)`)
            const gluten = Number(values.wheat_gluten);
            if (gluten < 7.5 || gluten > 11.0) failedChecks.push(`Gluten (${gluten}% out of 7.5-11.0% range)`)
            if (Number(values.wheat_sedimentation) < 20) failedChecks.push(`Sedimentation (${values.wheat_sedimentation} < 20)`)
            if (values.wheat_packing !== 'OK') failedChecks.push('Packing Condition')
        } else {
            if (values.appearance !== 'OK') failedChecks.push('Appearance')
            if (!['Sweet, free from objectionable odour/taste', 'OK', 'Normal'].includes(values.taste_and_smell)) failedChecks.push('Taste & Smell')
            if (!['None', 'Yes'].includes(values.free_from)) failedChecks.push('Contaminants')
            if (values.packing_condition !== 'OK') failedChecks.push('Packing Condition')
            if (Number(values.moisture_pct) > 0.1) failedChecks.push(`Moisture (${values.moisture_pct}%)`)
            if (values.foreign_matter) failedChecks.push('Foreign Matter Detected')
        }

        if (values.defect_type !== 'None') failedChecks.push('Defect Category')

        if (failedChecks.length > 0) {
            toast.error(`Cannot Accept. Fix or HOLD/REJECT due to: ${failedChecks.join(', ')}`)
            return
        }

        setIsSubmitting(true)

        try {
            const { error: insertQaError } = await supabase
                .from('qa_inspections')
                .insert({
                    gate_entry_id: gateEntryId,
                    vendor_mfg_date: values.vendor_mfg_date || null,
                    vendor_expiry_date: values.vendor_expiry_date || null,
                    itc_expiry_date: values.itc_expiry_date || null,
                    appearance: values.appearance,
                    odour: values.taste_and_smell === 'Other' ? values.taste_and_smell_other : values.taste_and_smell,
                    moisture_pct: Number(values.moisture_pct),
                    foreign_matter_detected: (values.free_from !== 'None' && values.free_from !== 'Yes') || values.foreign_matter,
                    lab_photos: [],
                    result: 'ACCEPT',
                    hold_reason: null,
                    inspector_id: user.id,
                })

            if (insertQaError) {
                console.error('QA direct insert error:', insertQaError)
            }

            await updateGateStatus('QA_OK')

            if (insertQaError) {
                toast.warning('QA accepted. GRN creation is unlocked. QA log insert failed; please inform admin if this repeats.')
            } else {
                toast.success('QA accepted. Proceed to Stores and click Create GRN.')
            }

            router.push(`${WORKFLOW_SEQUENCE.afterQaAccept}?entry_id=${gateEntryId}`)
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    })

    const handleHold = handleSubmit(async (values: any) => {
        if (values.defect_type === 'None' && !autoHoldReason && !values.manual_hold_reason) {
            toast.error('Please select a Defect Type or provide a hold reason.')
            return
        }
        setIsSubmitting(true)
        try {
            await updateGateStatus('QA_HOLD')
            toast.warning('Material placed on HOLD — returning to pending list')
            router.push('/qa')
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    })

    const handleReject = handleSubmit(async (values: any) => {
        if (values.defect_type === 'None') {
            toast.error('Please select a Defect Type for Rejection.')
            return
        }
        setIsSubmitting(true)
        try {
            if (isSecondReject) {
                await updateGateStatus('QA_REJECTED')
                toast.error('Material FINALLY REJECTED')
            } else {
                await updateGateStatus('QA_RETEST')
                toast.error('First Rejection — material set for RE-VERIFY')
            }
            router.push('/qa')
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    })

    if (isLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div>

    // ── PENDING LIST PAGE ──────────────────────────────────────────────────────────
    if (!gateEntryId) {
        return (
            <div className="max-w-4xl mx-auto py-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending QA Inspections</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No materials pending QA inspection.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id}
                                        className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/qa?id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.materials?.name}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} — {entry.vehicle_number}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(entry.status)}
                                            <Button size="sm" variant="outline">Inspect</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Finally Rejected */}
                <Card className="border-red-200">
                    <CardHeader className="cursor-pointer" onClick={() => setShowRejected(v => !v)}>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-red-700 flex items-center gap-2">
                                <XCircle className="h-5 w-5" />
                                Finally Rejected QA ({finalRejectedEntries.length})
                            </CardTitle>
                            <span className="text-sm text-slate-500">{showRejected ? 'Hide ▲' : 'Show ▼'}</span>
                        </div>
                    </CardHeader>
                    {showRejected && (
                        <CardContent>
                            {finalRejectedEntries.length === 0 ? (
                                <div className="text-center py-6 text-slate-400">No finally rejected materials.</div>
                            ) : (
                                <div className="grid gap-3">
                                    {finalRejectedEntries.map((entry) => (
                                        <div key={entry.id} className="flex items-center justify-between p-3 border border-red-100 rounded bg-red-50">
                                            <div>
                                                <div className="font-bold text-red-800">{entry.materials?.name}</div>
                                                <div className="text-sm text-red-600">{entry.vendors?.name} — {entry.vehicle_number}</div>
                                            </div>
                                            <Badge className="bg-red-600 text-white">FINAL REJECT</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    )}
                </Card>
            </div>
        )
    }

    // ── INSPECTION FORM PAGE ───────────────────────────────────────────────────────
    return (
        <div className="max-w-3xl mx-auto py-6">
            <Card className={`border-2 ${autoHoldReason ? 'border-yellow-400' : isSecondReject ? 'border-orange-400' : 'border-green-300'}`}>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>QA Inspection</span>
                        <span className="text-sm font-normal text-slate-500">{gateEntry?.materials?.name}</span>
                    </CardTitle>
                    {isSecondReject && (
                        <Alert className="mt-2 bg-orange-50 border-orange-300 text-orange-900">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>RE-VERIFY Required</AlertTitle>
                            <AlertDescription>This material was rejected once. Rejecting again will be FINAL.</AlertDescription>
                        </Alert>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Dates */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                            <div className="space-y-2">
                                <Label>Vendor Mfg Date</Label>
                                <Input type="date" {...register('vendor_mfg_date')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Vendor Expiry Date</Label>
                                <Input type="date" {...register('vendor_expiry_date')} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-blue-700 font-bold">ITC Expiry (Primary)</Label>
                                <Input type="date" {...register('itc_expiry_date')} />
                            </div>
                        </div>

                        {/* Physical Checks Section */}
                        <div className="bg-slate-50/80 border border-slate-200 p-5 md:p-6 rounded-xl space-y-6">
                            <h3 className="text-lg font-bold text-slate-800 border-b pb-3">Physical & Chemical Parameters</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 1. Appearance */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">1. Appearance</Label>
                                        <Controller control={control} name="appearance" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OK">OK</SelectItem>
                                                    <SelectItem value="Not OK">Not OK (Requires Description)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                    {appearanceValue === 'Not OK' && (
                                        <div className="pt-2">
                                            <Input {...register('appearance_description')} placeholder="Detail the appearance issue..." className="border-red-300 bg-red-50/30" />
                                        </div>
                                    )}
                                </div>

                                {/* 2. Taste & Smell */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">2. Taste & Smell</Label>
                                        <Controller control={control} name="taste_and_smell" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Sweet, free from objectionable odour/taste">Normal</SelectItem>
                                                    <SelectItem value="Other">Other (Specify)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                    {tasteAndSmellValue === 'Other' && (
                                        <div className="pt-2">
                                            <Input {...register('taste_and_smell_other')} placeholder="Describe unexpected taste/smell..." className="border-red-300 bg-red-50/30" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 3. Free from Contaminants */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">3. Free from Contaminants</Label>
                                        <Controller control={control} name="free_from" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="None">None (Clean)</SelectItem>
                                                    <SelectItem value="Dirt">Dirt</SelectItem>
                                                    <SelectItem value="Filth">Filth</SelectItem>
                                                    <SelectItem value="Iron Filings">Iron Filings</SelectItem>
                                                    <SelectItem value="Added colouring matter">Added colouring matter</SelectItem>
                                                    <SelectItem value="Other">Other (Specify)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                    {freeFromValue === 'Other' && (
                                        <div className="pt-2">
                                            <Input {...register('free_from_other')} placeholder="Specify contaminant found..." className="border-red-300 bg-red-50/30" />
                                        </div>
                                    )}
                                </div>

                                {/* 4. Packing Condition */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-start">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">4. Packing Condition</Label>
                                        <Controller control={control} name="packing_condition" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OK">OK</SelectItem>
                                                    <SelectItem value="Not OK">Not OK</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 5. Moisture & Foreign Matter */}
                                <div className="space-y-4 bg-white p-4 rounded-lg border shadow-sm col-span-1 md:col-span-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className={`font-semibold text-base ${moistureValue > 0.1 ? 'text-orange-600' : 'text-slate-700'}`}>
                                                5. Moisture % (0.1% max)
                                            </Label>
                                            <Input type="number" step="0.01" {...register('moisture_pct', { valueAsNumber: true })}
                                                className={`bg-slate-50 border-slate-200 ${moistureValue > 0.1 ? 'border-orange-400 focus-visible:ring-orange-400 bg-orange-50/30' : ''}`} />
                                            {moistureValue > 0.1 && (
                                                <div className="flex items-center gap-1.5 mt-2 text-orange-600 bg-orange-50 p-2 rounded text-sm font-medium border border-orange-100">
                                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                                    <p>Warning: Moisture exceeds maximum allowed threshold.</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-3 pt-1">
                                            <Controller control={control} name="foreign_matter" render={({ field }) => (
                                                <div className="flex items-center justify-between border-b pb-3 mb-3">
                                                    <Label className={`font-medium text-base ${field.value ? 'text-red-700' : 'text-slate-600'}`}>
                                                        Other Foreign Matter Detected?
                                                    </Label>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} className={field.value ? '!bg-red-500' : ''} />
                                                </div>
                                            )} />
                                            {foreignMatterValue && (
                                                <div className="mt-2 text-sm space-y-2">
                                                    <Label className="text-red-700">Specify foreign material</Label>
                                                    <Input {...register('foreign_matter_description')} placeholder="Describe foreign material..." className="border-red-300 bg-red-50/30" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 6. Defect Category */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">6. Defect Category</Label>
                                        <Controller control={control} name="defect_type" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Select Defect Type" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="None">None</SelectItem>
                                                    <SelectItem value="Damage">Damage</SelectItem>
                                                    <SelectItem value="Contamination">Contamination</SelectItem>
                                                    <SelectItem value="Moisture">Moisture</SelectItem>
                                                    <SelectItem value="Short_Shelf_Life">Short shelf life</SelectItem>
                                                    <SelectItem value="Other">Any other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                    {defectTypeValue === 'Other' && (
                                        <div className="pt-2">
                                            <Input {...register('defect_other_description')} placeholder="Specifically define the defect..." className="border-red-300 bg-red-50/30" />
                                        </div>
                                    )}
                                </div>

                                {/* 7. Remarks */}
                                <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-slate-700 text-base">7. Remarks</Label>
                                        <Textarea {...register('remarks')} placeholder="Add any specific notes or observations..." className="bg-slate-50 border-slate-200 resize-none" rows={2} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 8. Material Specific Checks */}
                        {(() => {
                            const matName = gateEntry?.materials?.name?.toUpperCase() || '';
                            const isSugar = matName.includes('SUGAR');
                            const isWheat = matName.includes('WHEAT FLOUR');

                            if (!isSugar && !isWheat) return null;

                            return (
                                <div className="space-y-4 bg-white p-4 rounded-lg border shadow-sm">
                                    <Label className="font-semibold text-slate-700 text-base border-b pb-2 block">
                                        8. Material Specific QA ({gateEntry?.materials?.name})
                                    </Label>

                                    {isSugar && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">1. Appearance</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">White translucent crystals free from dirt & extraneous matter</p>
                                                <Controller control={control} name="sugar_appearance" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">2. Taste & Smell</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">Sweet in taste free from any fermented/objectionable odour</p>
                                                <Controller control={control} name="sugar_taste" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">3. Free from</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">Dirt, filth, iron filings and added colouring matter</p>
                                                <Controller control={control} name="sugar_free_from" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">4. Moisture (0.1% max)</Label>
                                                <Input type="number" step="0.01" {...register('sugar_moisture', { valueAsNumber: true })}
                                                    className={Number(watch('sugar_moisture')) > 0.1 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('sugar_moisture')) > 0.1 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (0.1%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">5. Sucrose % (Min 98%)</Label>
                                                <Input type="number" step="0.01" {...register('sugar_sucrose_pct', { valueAsNumber: true })}
                                                    className={Number(watch('sugar_sucrose_pct')) < 98 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('sugar_sucrose_pct')) < 98 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Below min threshold (98%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">6. Water Insoluble % (Max 0.1%)</Label>
                                                <Input type="number" step="0.01" {...register('sugar_water_insoluble_pct', { valueAsNumber: true })}
                                                    className={Number(watch('sugar_water_insoluble_pct')) > 0.1 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('sugar_water_insoluble_pct')) > 0.1 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (0.1%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">7. Sulphur Di-oxide ppm (Max 70)</Label>
                                                <Input type="number" step="1" {...register('sugar_so2_ppm', { valueAsNumber: true })}
                                                    className={Number(watch('sugar_so2_ppm')) > 70 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('sugar_so2_ppm')) > 70 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (70 ppm)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">8. Packing Condition</Label>
                                                <Controller control={control} name="sugar_packing" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">Ok</SelectItem>
                                                            <SelectItem value="Not OK">Not ok</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                        </div>
                                    )}

                                    {isWheat && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">1. Appearance</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">White/creamy, no dusted bran, free flowing, no lumps</p>
                                                <Controller control={control} name="wheat_appearance" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">2. Infestation & Extraneous matter</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">No insect, fungus, rodent contamination, dirt</p>
                                                <Controller control={control} name="wheat_infestation" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">3. Free from</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">Rodent hair and excreta</p>
                                                <Controller control={control} name="wheat_free_from" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">4. Taste & Smell (Drink Test)</Label>
                                                <p className="text-xs text-slate-500 line-clamp-2">No off/musty flavour, bitter/rancid taste</p>
                                                <Controller control={control} name="wheat_taste" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">OK</SelectItem>
                                                            <SelectItem value="Not OK">Not OK</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">5. Moisture % (max 14.0%)</Label>
                                                <Input type="number" step="0.1" {...register('wheat_moisture', { valueAsNumber: true })}
                                                    className={Number(watch('wheat_moisture')) > 14 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('wheat_moisture')) > 14 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (14.0%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">6. Total ash % (max 1.0%)</Label>
                                                <Input type="number" step="0.01" {...register('wheat_ash', { valueAsNumber: true })}
                                                    className={Number(watch('wheat_ash')) > 1.0 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('wheat_ash')) > 1.0 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (1.0%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">7. Ash Insoluble in dilute HCL % (max 0.05%)</Label>
                                                <Input type="number" step="0.01" {...register('wheat_ash_insoluble', { valueAsNumber: true })}
                                                    className={Number(watch('wheat_ash_insoluble')) > 0.05 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('wheat_ash_insoluble')) > 0.05 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (0.05%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">8. Alcoholic acidity % (max 0.1%)</Label>
                                                <Input type="number" step="0.01" {...register('wheat_alcoholic_acidity', { valueAsNumber: true })}
                                                    className={Number(watch('wheat_alcoholic_acidity')) > 0.1 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('wheat_alcoholic_acidity')) > 0.1 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Exceeds max threshold (0.1%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">9. Gluten Content %</Label>
                                                <p className="text-xs text-slate-500 line-clamp-1">7.5-9 (short), 8.5-10 (hard)</p>
                                                <Input type="number" step="0.1" {...register('wheat_gluten', { valueAsNumber: true })}
                                                    className={(Number(watch('wheat_gluten')) < 7.5 || Number(watch('wheat_gluten')) > 11.0) ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {(Number(watch('wheat_gluten')) < 7.5 || Number(watch('wheat_gluten')) > 11.0) && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Outside acceptable range (7.5-11.0%)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">10. Sedimentation Value (&gt;=20 ml)</Label>
                                                <Input type="number" step="1" {...register('wheat_sedimentation', { valueAsNumber: true })}
                                                    className={Number(watch('wheat_sedimentation')) < 20 ? 'border-orange-400 bg-orange-50/30' : ''} />
                                                {Number(watch('wheat_sedimentation')) < 20 && (
                                                    <div className="flex items-center gap-1.5 mt-1 text-orange-600 text-xs font-medium bg-orange-50 p-1.5 rounded border border-orange-100"><AlertTriangle className="h-3 w-3 shrink-0" /><p>Below min threshold (20 ml)</p></div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-medium text-slate-700">11. Packing Condition</Label>
                                                <Controller control={control} name="wheat_packing" render={({ field }) => (
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="OK">Ok</SelectItem>
                                                            <SelectItem value="Not OK">Not ok</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <Controller control={control} name="lab_photo" render={({ field }) => (
                            <PhotoCapture label="Lab Report / Sample (Optional)" onCapture={field.onChange} />
                        )} />

                        {/* Decision Block */}
                        <div className="pt-6 border-t space-y-4">
                            {autoHoldReason && (
                                <Alert className="bg-yellow-50 border-yellow-300 text-yellow-900">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>System Auto-Hold Active</AlertTitle>
                                    <AlertDescription>{autoHoldReason}</AlertDescription>
                                </Alert>
                            )}

                            {!autoHoldReason && (
                                <div className="space-y-2">
                                    <Label>Manual Hold Reason <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
                                    <Input {...register('manual_hold_reason')} placeholder="Why is this being held?" />
                                </div>
                            )}


                            <div className="flex gap-3 h-14">
                                <Button type="button" onClick={handleAccept}
                                    disabled={!!autoHoldReason || isSubmitting}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white text-base">
                                    <CheckCircle className="mr-2 h-5 w-5" /> Accept
                                </Button>
                                <Button type="button" onClick={handleHold}
                                    disabled={isSubmitting}
                                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white text-base">
                                    <PauseCircle className="mr-2 h-5 w-5" /> Hold
                                </Button>
                                <Button type="button" onClick={handleReject}
                                    disabled={isSubmitting}
                                    className={`flex-1 text-white text-base ${isSecondReject ? 'bg-red-700 hover:bg-red-800' : 'bg-red-500 hover:bg-red-600'}`}>
                                    {isSubmitting
                                        ? <Loader2 className="animate-spin h-5 w-5" />
                                        : <><XCircle className="mr-2 h-5 w-5" /> Reject</>
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function SelectCheckItem({ control, name, label, options }: { control: any, name: string, label: string, options: { label: string, value: string, isGood: boolean }[] }) {
    return (
        <Controller control={control} name={name} render={({ field }) => {
            const selectedOption = options.find(o => o.value === field.value)
            const isGood = selectedOption?.isGood ?? false
            return (
                <div className={`flex items-center justify-between p-3 rounded-lg border ${isGood ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                        {isGood
                            ? <CheckCircle className="text-green-600 h-5 w-5" />
                            : <XCircle className="text-red-600 h-5 w-5" />}
                        <Label className="text-base font-semibold">{label}</Label>
                    </div>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {options.map((o: any) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )
        }} />
    )
}
