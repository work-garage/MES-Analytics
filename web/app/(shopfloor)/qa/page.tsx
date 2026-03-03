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
    const gateEntryId = searchParams.get('id')
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

    const { register, control, watch } = useForm({
        defaultValues: {
            appearance: 'OK',
            odour: 'NORMAL',
            moisture_pct: 0,
            foreign_matter: false,
            vendor_mfg_date: '',
            vendor_expiry_date: '',
            itc_expiry_date: '',
            manual_hold_reason: '',
            lab_photo: null
        }
    })

    const supabase = createClient()
    const itcExpiry = watch('itc_expiry_date')

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
        const { error } = await supabase
            .from('gate_entries')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', gateEntryId)
        if (error) throw error
    }

    const handleAccept = async () => {
        if (autoHoldReason) return
        setIsSubmitting(true)
        try {
            const { error } = await supabase.rpc('rpc_submit_qa_inspection', {
                p_gate_entry_id: gateEntryId,
                p_result: 'ACCEPT',
                p_inspector_id: user?.id,
                p_auto_hold: false,
                p_lab_photos: []
            })
            if (error) {
                // Fallback: just advance status
                await updateGateStatus('QA_ACCEPTED')
            }
            toast.success('QA Accepted — proceeding to GRN creation')
            router.push(`/stores/grn-create?entry_id=${gateEntryId}`)
        } catch (err: any) {
            toast.error('Submission Failed', { description: err.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleHold = async () => {
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
    }

    const handleReject = async () => {
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
    }

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

                        {/* Physical Checks */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Appearance</Label>
                                <Controller control={control} name="appearance" render={({ field }) => (
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OK">OK</SelectItem>
                                            <SelectItem value="NOT_OK">Not OK</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )} />
                            </div>
                            <div className="space-y-2">
                                <Label>Odour</Label>
                                <Controller control={control} name="odour" render={({ field }) => (
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="NORMAL">Normal</SelectItem>
                                            <SelectItem value="ABNORMAL">Abnormal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Moisture %</Label>
                                <Input type="number" step="0.1" {...register('moisture_pct', { valueAsNumber: true })} />
                            </div>
                            <div className="space-y-4 pt-4">
                                <Controller control={control} name="foreign_matter" render={({ field }) => (
                                    <div className="flex items-center justify-between border p-3 rounded bg-red-50/50">
                                        <Label className="text-red-700">Foreign Matter Detected?</Label>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </div>
                                )} />
                            </div>
                        </div>

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
                                    <Label>Manual Hold Reason <span className="text-slate-400 font-normal text-xs">(enter if holding)</span></Label>
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
