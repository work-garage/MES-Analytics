'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { weighbridgeSchema } from '@/lib/validators/inbound'
import { useAuth } from '@/lib/store/auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import PhotoCapture from '@/components/business/PhotoCapture'
import { useRouter, useSearchParams } from 'next/navigation'
import { SensorStatusBadge } from '@/components/ui/sensor-status-badge'
import { ManualFallbackToggle } from '@/components/ui/manual-fallback-toggle'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertTriangle, Lock, Loader2 } from 'lucide-react'

export default function WeighbridgePage() {
    return (
        <Suspense fallback={<div className="p-8">Loading...</div>}>
            <WeighbridgeContent />
        </Suspense>
    )
}

function WeighbridgeContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const entryId = searchParams.get('entry_id')

    console.log("Weighbridge Params:", searchParams.toString())
    console.log("Detected Entry ID:", entryId)

    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [netWeight, setNetWeight] = useState(0)
    const [discrepancy, setDiscrepancy] = useState<number | null>(null)
    const [showSupervisorModal, setShowSupervisorModal] = useState(false)
    const [supervisorPin, setSupervisorPin] = useState('')

    const [isManual, setIsManual] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [sensorStatus, setSensorStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE')

    const supabase = createClient()
    const form = useForm({
        resolver: zodResolver(weighbridgeSchema),
        defaultValues: {
            weighbridge_slip_no: '',
            gross_weight: 0,
            tare_weight: 0,
            net_weight: 0,
            photo: null,
            scale_photo_evidence: null,
            manual_override_reason: ''
        }
    })

    const gross = form.watch('gross_weight')
    const tare = form.watch('tare_weight')

    // Register Photo field manually since it doesn't have a native input


    // Fetch Gate Entry OR List Pending
    useEffect(() => {
        const fetchEntries = async () => {
            if (entryId) {
                const { data } = await supabase.from('gate_entries').select('*').eq('id', entryId).single()
                setGateEntry(data)
            } else {
                // Pull-based: List all vehicles waiting at dock
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*')
                    .eq('status', 'CHECKED_IN')
                    .order('created_at', { ascending: true })

                setPendingEntries(data || [])
            }
        }
        fetchEntries()
    }, [entryId])

    // Calc Net & Discrepancy
    useEffect(() => {
        if (gross > 0 && tare >= 0) {
            const net = gross - tare
            setNetWeight(net)
            form.setValue('net_weight', net)

            // Discrepancy
            if (gateEntry?.expected_qty) {
                const diff = Math.abs(net - gateEntry.expected_qty)
                const pct = (diff / gateEntry.expected_qty) * 100
                setDiscrepancy(pct)
            }
        }
    }, [gross, tare, gateEntry])


    const onSubmit = (values: any) => {
        // Check Discrepancy
        if (discrepancy !== null && discrepancy > 5) {
            setShowSupervisorModal(true) // Trigger Modal
            return
        }
        processSubmission(values)
    }

    const processSubmission = async (values: any, supervisorId: string | null = null) => {
        try {
            setIsSubmitting(true)

            // Upload Photo
            let photoPath = null
            if (values.photo) {
                photoPath = `weighbridge/${Date.now()}_truck.jpg`
                await supabase.storage.from('weighbridge-photos').upload(photoPath, values.photo)
            }

            const { error } = await supabase.rpc('rpc_submit_weighbridge', {
                p_gate_entry_id: entryId,
                p_slip_no: values.weighbridge_slip_no,
                p_gross_weight: values.gross_weight,
                p_tare_weight: values.tare_weight,
                p_net_weight: values.net_weight,
                p_truck_photo: photoPath,
                p_scale_proof: null, // Add if manual
                p_supervisor_id: supervisorId
            })

            if (error) throw error

            toast.success("Weighbridge Entry Confirmed")
            // Fix redirect path here too while we are at it
            router.push(`/vehicle-inspection?id=${entryId}`)

        } catch (error: any) {
            toast.error("Submission Failed", { description: error.message })
        } finally {
            setIsSubmitting(false)
            setShowSupervisorModal(false)
        }
    }

    const handleSupervisorAuth = () => {
        if (supervisorPin === '1234') { // Mock PIN
            processSubmission(form.getValues(), '00000000-0000-0000-0000-000000000000') // Dummy UUID or fetch real supervisor ID
        } else {
            toast.error("Invalid PIN")
        }
    }

    if (!entryId && !gateEntry) {
        return (
            <div className="max-w-4xl mx-auto py-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Weighbridge Entries</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No vehicles waiting at dock.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/weighbridge?entry_id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.vehicle_number}</div>
                                            <div className="text-sm text-slate-500">{entry.driver_name}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono text-sm">{entry.challan_no}</div>
                                            <Button size="sm" variant="outline">Select</Button>
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
        <div className="max-w-xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle>Weighbridge Entry</CardTitle>
                        <SensorStatusBadge status={sensorStatus} lastSeen={new Date()} sensorName="WB-01" />
                    </div>
                    {gateEntry && (
                        <div className="text-sm bg-slate-50 p-2 rounded mt-2">
                            <div className="flex justify-between">
                                <span>Expected: <strong>{gateEntry.expected_qty} kg</strong></span>
                                <span>Vehicle: <strong>{gateEntry.vehicle_number}</strong></span>
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                        console.error("Validation Errors:", errors)
                        toast.error("Please fill all required fields", { description: Object.keys(errors).join(', ') })
                    })} className="space-y-4">
                        <ManualFallbackToggle enabled={isManual} onToggle={setIsManual} />

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Gross (kg)</Label>
                                <Input type="number" {...form.register('gross_weight', { valueAsNumber: true })} readOnly={!isManual} />
                                {form.formState.errors.gross_weight && <p className="text-red-500 text-xs">{form.formState.errors.gross_weight.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Tare (kg)</Label>
                                <Input type="number" {...form.register('tare_weight', { valueAsNumber: true })} readOnly={!isManual} />
                                {form.formState.errors.tare_weight && <p className="text-red-500 text-xs">{form.formState.errors.tare_weight.message}</p>}
                            </div>
                        </div>

                        <div className={`p-4 rounded text-center my-4 ${discrepancy && discrepancy > 5 ? 'bg-red-50 border border-red-200' : 'bg-green-50'
                            }`}>
                            <span className="block text-sm text-slate-500">Net Weight</span>
                            <span className="text-3xl font-bold text-slate-900">{netWeight} kg</span>
                            {discrepancy !== null && (
                                <div className={`text-xs font-bold mt-1 ${discrepancy > 5 ? 'text-red-600' : 'text-green-600'}`}>
                                    Variance: {discrepancy.toFixed(2)}%
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Slip No</Label>
                            <Input {...form.register('weighbridge_slip_no')} readOnly={!isManual} placeholder="Scan..." />
                            {form.formState.errors.weighbridge_slip_no && <p className="text-red-500 text-xs">Slip Number required</p>}
                        </div>

                        <div className="space-y-1">
                            <Controller
                                control={form.control}
                                name="photo"
                                render={({ field }) => (
                                    <PhotoCapture
                                        label="Truck on Scale"
                                        onCapture={(f) => {
                                            field.onChange(f)
                                        }}
                                        required
                                    />
                                )}
                            />
                            {form.formState.errors.photo && <p className="text-red-500 text-xs">{form.formState.errors.photo.message as string}</p>}
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
                            Confirm Weight
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Dialog open={showSupervisorModal} onOpenChange={setShowSupervisorModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Discrepancy Detected ({discrepancy?.toFixed(2)}%)
                        </DialogTitle>
                        <DialogDescription>
                            The net weight exceeds the tolerance threshold (5%).
                            Supervisor authorization is required to proceed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Supervisor PIN</Label>
                            <div className="relative">
                                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                                <Input
                                    type="password"
                                    className="pl-9"
                                    value={supervisorPin}
                                    onChange={(e) => setSupervisorPin(e.target.value)}
                                    placeholder="Enter Sign-off PIN"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSupervisorModal(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleSupervisorAuth} disabled={isSubmitting}>
                            Authorize & Proceed
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
