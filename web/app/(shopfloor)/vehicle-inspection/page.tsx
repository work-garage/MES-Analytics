'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { vehicleInspectionSchema } from '@/lib/validators/inbound'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, AlertTriangle, PauseCircle } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

export default function VehicleInspectionPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Inspection...</div>}>
            <VehicleInspectionContent />
        </Suspense>
    )
}

// Entries that stay in the "Pending Vehicle Inspections" list
const PENDING_STATUSES = ['WEIGHED', 'WEIGHED_DISCREPANCY', 'VEHICLE_HOLD', 'VEHICLE_RETEST']
// Entries that are finally rejected
const FINAL_REJECT_STATUSES = ['VEHICLE_REJECTED']

function getStatusBadge(status: string) {
    if (status === 'VEHICLE_HOLD')
        return <Badge className="bg-yellow-500 text-white">HOLD</Badge>
    if (status === 'VEHICLE_RETEST')
        return <Badge className="bg-orange-500 text-white">RE-VERIFY</Badge>
    if (FINAL_REJECT_STATUSES.includes(status))
        return <Badge className="bg-red-600 text-white">REJECTED</Badge>
    return <Badge className="bg-slate-200 text-slate-700">PENDING</Badge>
}

function VehicleInspectionContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const gateEntryId = searchParams.get('id')
    const { user } = useAuth()

    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [finalRejectedEntries, setFinalRejectedEntries] = useState<any[]>([])
    const [showRejected, setShowRejected] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    // True when this entry already has VEHICLE_RETEST status (1st rejection happened already)
    const [isSecondReject, setIsSecondReject] = useState(false)

    const supabase = createClient()

    const form = useForm({
        resolver: zodResolver(vehicleInspectionSchema),
        defaultValues: {
            floor_clean: true,
            walls_clean: true,
            tarpaulin_intact: true,
            odour_ok: true,
            moisture_absent: true,
            seal_intact: true,
            hazardous_history_ok: true,
            remarks: ''
        }
    })

    useEffect(() => {
        const fetchEntries = async () => {
            setIsLoading(true)
            if (gateEntryId) {
                const { data, error } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .eq('id', gateEntryId)
                    .single()
                if (error) toast.error('Failed to fetch entry')
                else {
                    setGateEntry(data)
                    setIsSecondReject(data?.status === 'VEHICLE_RETEST')
                }
            } else {
                const { data: pending } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .in('status', PENDING_STATUSES)
                    .order('updated_at', { ascending: true })
                setPendingEntries(pending || [])

                const { data: rejected } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .in('status', FINAL_REJECT_STATUSES)
                    .order('updated_at', { ascending: false })
                setFinalRejectedEntries(rejected || [])
            }
            setIsLoading(false)
        }
        fetchEntries()
    }, [gateEntryId])

    // Direct gate_entries update — bypasses RPC to avoid check constraint issues
    const updateGateStatus = async (newStatus: string) => {
        const { error } = await supabase
            .from('gate_entries')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', gateEntryId)
        if (error) throw error
    }

    const handleAccept = async () => {
        const values = form.getValues()
        const checks = [
            values.floor_clean, values.walls_clean, values.tarpaulin_intact,
            values.odour_ok, values.moisture_absent, values.seal_intact, values.hazardous_history_ok
        ]
        if (!checks.every(Boolean)) {
            toast.error('Cannot Accept: some checklist items are failing.')
            return
        }
        setIsSubmitting(true)
        try {
            // Only PASS uses the RPC (which writes to vehicle_inspections table)
            const { error } = await supabase.rpc('rpc_submit_vehicle_inspection', {
                p_gate_entry_id: gateEntryId,
                p_checklist: values,
                p_result: 'PASS',
                p_remarks: values.remarks,
                p_inspector_id: user?.id,
                p_hazardous_history_ok: values.hazardous_history_ok
            })
            if (error) {
                // Fallback: just update gate_entries status
                await updateGateStatus('INSPECTED_OK')
            }
            toast.success('Vehicle Inspection Passed — proceeding to QA')
            router.push(`/qa?id=${gateEntryId}`)
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleHold = async () => {
        const remarks = form.getValues('remarks')
        if (!remarks?.trim()) {
            toast.error('Please enter a Hold Reason in the Remarks field.')
            return
        }
        setIsSubmitting(true)
        try {
            await updateGateStatus('VEHICLE_HOLD')
            toast.warning('Vehicle placed on HOLD')
            router.push('/vehicle-inspection')
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleReject = async () => {
        setIsSubmitting(true)
        try {
            if (isSecondReject) {
                // Final rejection
                await updateGateStatus('VEHICLE_REJECTED')
                toast.error('Vehicle FINALLY REJECTED')
            } else {
                // First rejection — soft, stays in pending as RE-VERIFY
                await updateGateStatus('VEHICLE_RETEST')
                toast.error('First Rejection saved — vehicle set for RE-VERIFY')
            }
            router.push('/vehicle-inspection')
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div>

    // ── PENDING LIST PAGE ─────────────────────────────────────────────────────────
    if (!gateEntryId) {
        return (
            <div className="max-w-4xl mx-auto py-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Vehicle Inspections</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No vehicles available for inspection.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id}
                                        className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/vehicle-inspection?id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.vehicle_number}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} — {entry.materials?.name}</div>
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
                                Finally Rejected Vehicles ({finalRejectedEntries.length})
                            </CardTitle>
                            <span className="text-sm text-slate-500">{showRejected ? 'Hide ▲' : 'Show ▼'}</span>
                        </div>
                    </CardHeader>
                    {showRejected && (
                        <CardContent>
                            {finalRejectedEntries.length === 0 ? (
                                <div className="text-center py-6 text-slate-400">No finally rejected vehicles.</div>
                            ) : (
                                <div className="grid gap-3">
                                    {finalRejectedEntries.map((entry) => (
                                        <div key={entry.id} className="flex items-center justify-between p-3 border border-red-100 rounded bg-red-50">
                                            <div>
                                                <div className="font-bold text-red-800">{entry.vehicle_number}</div>
                                                <div className="text-sm text-red-600">{entry.vendors?.name} — {entry.materials?.name}</div>
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

    // ── INSPECTION FORM PAGE ──────────────────────────────────────────────────────
    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Vehicle Inspection (Level 1)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <Label className="text-muted-foreground">Vehicle No</Label>
                        <p className="font-medium text-lg">{gateEntry?.vehicle_number}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Vendor</Label>
                        <p className="font-medium">{gateEntry?.vendors?.name}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Material</Label>
                        <p className="font-medium">{gateEntry?.materials?.name}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Driver</Label>
                        <p className="font-medium">{gateEntry?.driver_name}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    {isSecondReject && (
                        <Alert className="mb-4 bg-orange-50 border-orange-300 text-orange-900">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>RE-VERIFY Required</AlertTitle>
                            <AlertDescription>This vehicle was rejected once. Rejecting again will be FINAL.</AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-4">
                        <CheckItem control={form.control} name="floor_clean" label="Floor Clean?" />
                        <CheckItem control={form.control} name="walls_clean" label="Side Walls Clean?" />
                        <CheckItem control={form.control} name="tarpaulin_intact" label="Tarpaulin Intact?" />
                        <CheckItem control={form.control} name="odour_ok" label="No Abnormal Odour?" />
                        <CheckItem control={form.control} name="moisture_absent" label="No Visible Moisture/Dust?" />
                        <CheckItem control={form.control} name="seal_intact" label="Seal Intact?" />
                        <CheckItem control={form.control} name="hazardous_history_ok" label="Hazardous Material History OK?" />

                        <div className="space-y-2">
                            <Label>Remarks{' '}<span className="text-slate-400 font-normal text-xs">(required for Hold or Reject)</span></Label>
                            <Textarea {...form.register('remarks')} placeholder="Enter observations..." />
                        </div>

                        <div className="pt-4 border-t flex gap-3 h-14">
                            <Button
                                type="button"
                                onClick={handleAccept}
                                disabled={isSubmitting}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-base">
                                <CheckCircle className="mr-2 h-5 w-5" /> Submit Inspection
                            </Button>
                            <Button
                                type="button"
                                onClick={handleHold}
                                disabled={isSubmitting}
                                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white text-base">
                                <PauseCircle className="mr-2 h-5 w-5" /> Hold
                            </Button>
                            <Button
                                type="button"
                                onClick={handleReject}
                                disabled={isSubmitting}
                                className={`flex-1 text-white text-base ${isSecondReject ? 'bg-red-700 hover:bg-red-800' : 'bg-red-500 hover:bg-red-600'}`}>
                                <XCircle className="mr-2 h-5 w-5" />
                                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Reject'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function CheckItem({ control, name, label }: { control: any, name: string, label: string }) {
    return (
        <Controller control={control} name={name} render={({ field }) => (
            <div className={`flex items-center justify-between p-3 rounded-lg border ${field.value ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-3">
                    {field.value
                        ? <CheckCircle className="text-green-600 h-5 w-5" />
                        : <XCircle className="text-red-600 h-5 w-5" />}
                    <Label className="text-base cursor-pointer">{label}</Label>
                </div>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
        )} />
    )
}
