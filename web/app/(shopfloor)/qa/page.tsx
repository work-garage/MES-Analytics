'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
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

function QAPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const gateEntryId = searchParams.get('id')
    const { user } = useAuth()

    const [status, setStatus] = useState<'ACCEPT' | 'HOLD' | 'REJECT'>('ACCEPT')
    const [autoHoldReason, setAutoHoldReason] = useState<string | null>(null)
    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
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

    // Fetch Gate Entry OR List Pending
    useEffect(() => {
        const fetchEntries = async () => {
            setIsLoading(true)
            if (gateEntryId) {
                const { data } = await supabase.from('gate_entries').select('*, materials(name), vendors(name)').eq('id', gateEntryId).single()
                setGateEntry(data)
            } else {
                // Pending List: entries passed inspection
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*, materials(name), vendors(name)')
                    .eq('status', 'INSPECTED_OK')
                    .order('updated_at', { ascending: true })

                setPendingEntries(data || [])
            }
            setIsLoading(false)
        }
        fetchEntries()
    }, [gateEntryId])

    // Auto-Hold Logic
    useEffect(() => {
        if (!itcExpiry) return
        const expiry = new Date(itcExpiry)
        const warningDate = new Date()
        warningDate.setDate(warningDate.getDate() + 30) // 30 Day policy

        if (expiry < warningDate) {
            setStatus('HOLD')
            if (expiry < new Date()) {
                setAutoHoldReason("ITC Expiry date is in the PAST. Material is already expired.")
            } else {
                setAutoHoldReason("ITC Expiry is below minimum shelf life threshold (30 days).")
            }
        } else {
            if (status === 'HOLD' && autoHoldReason?.includes("ITC")) {
                setStatus('ACCEPT') // Release if date fixed, unless blocked by other logic
                setAutoHoldReason(null)
            }
        }
    }, [itcExpiry, status])

    const onSubmit = async (values: any) => {
        if (!user) return
        setIsSubmitting(true)

        try {
            // Photos
            let photoPaths = []
            if (values.lab_photo) {
                const path = `qa/${Date.now()}_lab.jpg`
                await supabase.storage.from('weighbridge-photos').upload(path, values.lab_photo)
                photoPaths.push(path)
            }

            const payload = {
                p_gate_entry_id: gateEntryId,
                p_vendor_mfg_date: values.vendor_mfg_date,
                p_vendor_expiry_date: values.vendor_expiry_date,
                p_itc_expiry_date: values.itc_expiry_date,
                p_appearance: values.appearance,
                p_odour: values.odour,
                p_moisture_pct: values.moisture_pct,
                p_foreign_matter: values.foreign_matter,
                p_lab_photos: photoPaths,
                p_result: status,
                p_inspector_id: user.id,
                p_hold_reason: autoHoldReason || values.manual_hold_reason,
                p_auto_hold: !!autoHoldReason
            }

            const { data, error } = await supabase.rpc('rpc_submit_qa_inspection', payload)
            if (error) throw error

            toast.success(`QA Result: ${status}`)
            // If ACCEPT -> GRN Draft created, forward to GRN
            if (status === 'ACCEPT') {
                router.push(`/stores/grn-create?entry_id=${gateEntryId}`)
            } else {
                router.push('/dashboard')
            }

        } catch (error: any) {
            toast.error("Submission Failed", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div>

    if (!gateEntryId && !gateEntry) {
        return (
            <div className="max-w-4xl mx-auto py-6">
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
                                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/qa?id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.materials?.name}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} - {entry.vehicle_number}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded mb-1">{entry.status}</div>
                                            <Button size="sm" variant="outline">Inspect</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto py-6">
            <Card className={`border-2 ${status === 'HOLD' ? 'border-yellow-400' : status === 'REJECT' ? 'border-red-400' : 'border-green-400'}`}>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>QA Inspection</span>
                        <span className="text-sm font-normal text-slate-500">Material: {gateEntry?.materials?.name}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                        {/* Dates - Critical Block */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                            <div className="space-y-2">
                                <Label>Vendor Mfg Date</Label>
                                <Input type="date" {...register('vendor_mfg_date', { required: true })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Vendor Expiry Date</Label>
                                <Input type="date" {...register('vendor_expiry_date', { required: true })} />
                            </div>
                            <div className="space-y-2 relative">
                                <Label className="text-blue-600 font-bold">ITC Expiry (Primary)</Label>
                                <Input type="date" {...register('itc_expiry_date', { required: true })} />
                            </div>
                        </div>

                        {/* Physical Checks */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Appearance</Label>
                                <Controller
                                    control={control}
                                    name="appearance"
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="OK">OK</SelectItem>
                                                <SelectItem value="NOT_OK">Not OK</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Odour</Label>
                                <Controller
                                    control={control}
                                    name="odour"
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NORMAL">Normal</SelectItem>
                                                <SelectItem value="ABNORMAL">Abnormal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Moisture %</Label>
                                <Input type="number" step="0.1" {...register('moisture_pct', { valueAsNumber: true })} />
                            </div>
                            <div className="space-y-4 pt-4">
                                <Controller
                                    control={control}
                                    name="foreign_matter"
                                    render={({ field }) => (
                                        <div className="flex items-center justify-between border p-3 rounded bg-red-50/50">
                                            <Label className="text-red-700">Foreign Matter Detected?</Label>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </div>
                                    )}
                                />
                            </div>
                        </div>

                        <Controller
                            control={control}
                            name="lab_photo"
                            render={({ field }) => (
                                <PhotoCapture
                                    label="Lab Report / Sample (Optional)"
                                    onCapture={field.onChange}
                                />
                            )}
                        />

                        {/* Status Decision Block */}
                        <div className="pt-6 border-t space-y-4">
                            {autoHoldReason && (
                                <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>System Auto-Hold Active</AlertTitle>
                                    <AlertDescription>{autoHoldReason}</AlertDescription>
                                </Alert>
                            )}

                            {status === 'HOLD' && !autoHoldReason && (
                                <div className="space-y-2">
                                    <Label>Manual Hold Reason</Label>
                                    <Input {...register('manual_hold_reason')} placeholder="Why is this held?" />
                                </div>
                            )}

                            <div className="flex gap-2 h-14">
                                <Button
                                    type="button"
                                    onClick={() => setStatus('ACCEPT')}
                                    disabled={!!autoHoldReason} // Cannot force accept if auto-hold active
                                    className={`flex-1 ${status === 'ACCEPT' ? 'bg-green-600' : 'bg-slate-200 text-slate-500'}`}
                                >
                                    <CheckCircle className="mr-2" /> Accept
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => setStatus('HOLD')}
                                    className={`flex-1 ${status === 'HOLD' ? 'bg-yellow-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                                >
                                    <PauseCircle className="mr-2" /> Hold / Re-test
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => setStatus('REJECT')}
                                    className={`flex-1 ${status === 'REJECT' ? 'bg-red-600' : 'bg-slate-200 text-slate-500'}`}
                                >
                                    <XCircle className="mr-2" /> Reject
                                </Button>
                            </div>

                            <Button type="submit" size="lg" className="w-full mt-4" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : `Submit Result: ${status}`}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
