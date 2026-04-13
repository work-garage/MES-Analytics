'use client'

import { useState, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { gateEntrySchema } from '@/lib/validators/inbound'
import { useAuth } from '@/lib/store/auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import PhotoCapture from '@/components/business/PhotoCapture'
import { Loader2, Fingerprint, PauseCircle, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { WORKFLOW_SEQUENCE } from '@/lib/workflow/sequence'

export default function GateEntryPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Gate Entry...</div>}>
            <GateEntryContent />
        </Suspense>
    )
}

const GATE_HOLD_STATUSES = ['HOLD', 'GATE_HOLD', 'PRIORITY_REVIEW']

function GateEntryContent() {
    const router = useRouter()
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── Master data ──────────────────────────────────────────────────────────────
    const { data: vendors } = useQuery({
        queryKey: ['vendors'],
        queryFn: async () => {
            const { data } = await supabase.from('vendors').select('id, name')
            return data || []
        }
    })
    const { data: materials } = useQuery({
        queryKey: ['materials'],
        queryFn: async () => {
            const { data } = await supabase.from('materials').select('id, name').eq('category', 'RAW')
            return data || []
        }
    })

    // ── Held entries ─────────────────────────────────────────────────────────────
    const { data: heldEntries, isLoading: loadingHeld, refetch } = useQuery({
        queryKey: ['gate_held'],
        queryFn: async () => {
            const { data } = await supabase
                .from('gate_entries')
                .select('*, vendors(name), materials(name)')
                .in('status', GATE_HOLD_STATUSES)
                .order('created_at', { ascending: false })
            return data || []
        }
    })

    // ── Form ─────────────────────────────────────────────────────────────────────
    const form = useForm({
        resolver: zodResolver(gateEntrySchema),
        defaultValues: {
            vehicle_no: '',
            challan_no: '',
            challan_date: new Date().toISOString().split('T')[0],
            driver_name: '',
            driver_mobile: '',
            expected_qty: 0,
            vendor_id: '',
            material_id: '',
            gate_photo: null,
            seal_photo: null,
            status: 'ALLOW',
            hold_reason: ''
        }
    })

    const onSubmit = async (values: any) => {
        if (!user) { toast.error('You must be logged in'); return }
        setIsSubmitting(true)
        try {
            const gatePhotoName = `gate/${Date.now()}_${values.vehicle_no}.jpg`
            const sealPhotoName = `seal/${Date.now()}_${values.vehicle_no}.jpg`

            await Promise.all([
                supabase.storage.from('weighbridge-photos').upload(gatePhotoName, values.gate_photo),
                supabase.storage.from('weighbridge-photos').upload(sealPhotoName, values.seal_photo)
            ])

            const { data, error } = await supabase.rpc('rpc_create_gate_entry', {
                p_vehicle_no: values.vehicle_no,
                p_driver_name: values.driver_name,
                p_driver_mobile: values.driver_mobile,
                p_vendor_id: values.vendor_id,
                p_material_id: values.material_id,
                p_challan_no: values.challan_no,
                p_challan_date: values.challan_date,
                p_expected_qty: values.expected_qty,
                p_gate_photo: gatePhotoName,
                p_seal_photo: sealPhotoName,
                p_user_id: user.id,
                p_status: values.status,
                p_hold_reason: values.status === 'HOLD' ? values.hold_reason : null
            })

            if (error) throw error

            if (values.status === 'HOLD') {
                toast.warning('Gate Entry placed on HOLD')
                form.reset()
                refetch() // Refresh held entries list
            } else {
                toast.success('Gate Entry Recorded', { description: `Entry No: ${data?.entry_number ?? ''}` })
                router.push(`${WORKFLOW_SEQUENCE.afterGateSubmit}?entry_id=${data?.id}`)
            }
        } catch (error: any) {
            toast.error('Submission Failed', { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto py-6 space-y-8">

            {/* ── SECTION 1: New Gate Entry Form ── */}
            <div>
                <h1 className="text-2xl font-bold mb-4">Inbound Gate Entry</h1>
                <Card>
                    <CardHeader className="bg-slate-50 border-b">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Fingerprint className="h-4 w-4 text-blue-600" />
                            Gate Operator: {user?.email || 'Guest'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={form.handleSubmit(onSubmit, () => toast.error('Please fill all required fields'))}
                            className="space-y-6">

                            {/* Truck Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Vehicle No (Plate)</Label>
                                    <Input {...form.register('vehicle_no')} placeholder="MH-12-AB-1234" className="uppercase" />
                                    <Err msg={form.formState.errors.vehicle_no?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Driver Name</Label>
                                    <Input {...form.register('driver_name')} />
                                    <Err msg={form.formState.errors.driver_name?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Driver Mobile</Label>
                                    <Input {...form.register('driver_mobile')} placeholder="10 digits" />
                                    <Err msg={form.formState.errors.driver_mobile?.message} />
                                </div>
                            </div>

                            {/* Order Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vendor</Label>
                                    <Controller control={form.control} name="vendor_id" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Select Vendor" /></SelectTrigger>
                                            <SelectContent>
                                                {vendors?.map((v: any) => (
                                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )} />
                                    <Err msg={form.formState.errors.vendor_id?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Material</Label>
                                    <Controller control={form.control} name="material_id" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                                            <SelectContent>
                                                {materials?.map((m: any) => (
                                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )} />
                                    <Err msg={form.formState.errors.material_id?.message} />
                                </div>
                            </div>

                            {/* Challan Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                                <div className="space-y-2">
                                    <Label>Challan No</Label>
                                    <Input {...form.register('challan_no')} />
                                    <Err msg={form.formState.errors.challan_no?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Challan Date</Label>
                                    <Input type="date" {...form.register('challan_date')} />
                                    <Err msg={form.formState.errors.challan_date?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Expected Qty (kg)</Label>
                                    <Input type="number" {...form.register('expected_qty', { valueAsNumber: true })} />
                                    <Err msg={form.formState.errors.expected_qty?.message} />
                                </div>
                            </div>

                            {/* Photos */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Controller control={form.control} name="gate_photo" render={({ field }) => (
                                        <PhotoCapture label="Vehicle Front (Mandatory)" onCapture={field.onChange} required />
                                    )} />
                                    <Err msg={form.formState.errors.gate_photo?.message} />
                                </div>
                                <div className="space-y-2">
                                    <Controller control={form.control} name="seal_photo" render={({ field }) => (
                                        <PhotoCapture label="Seal Condition (Mandatory)" onCapture={field.onChange} required />
                                    )} />
                                    <Err msg={form.formState.errors.seal_photo?.message} />
                                </div>
                            </div>

                            {/* Gate Decision */}
                            <div className="bg-slate-50 p-6 rounded-lg border space-y-4">
                                <Label className="text-lg font-semibold">Gate Decision</Label>
                                <Controller control={form.control} name="status" render={({ field }) => (
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-6">
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="ALLOW" id="allow" />
                                            <Label htmlFor="allow" className="text-green-700 font-bold">Allow to Weighbridge</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="HOLD" id="hold" />
                                            <Label htmlFor="hold" className="text-red-600 font-bold">HOLD VEHICLE</Label>
                                        </div>
                                    </RadioGroup>
                                )} />

                                {form.watch('status') === 'HOLD' && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <Label>Reason for Holding (Mandatory)</Label>
                                        <Textarea {...form.register('hold_reason')}
                                            placeholder="Explain why the vehicle is held (e.g., Damaged Seal, Wrong Material)" />
                                        <Err msg={form.formState.errors.hold_reason?.message} />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 pt-4 border-t">
                                <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                                    {form.watch('status') === 'HOLD' ? 'Confirm & Hold' : 'Sign & Allow Entry'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* ── SECTION 2: Held Gate Entries Dashboard ── */}
            <div>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-yellow-700">
                            <PauseCircle className="h-5 w-5" />
                            Held Gate Entries
                            {heldEntries && heldEntries.length > 0 && (
                                <Badge className="bg-yellow-500 text-white ml-1">{heldEntries.length}</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingHeld ? (
                            <div className="flex items-center gap-2 py-4 text-slate-400">
                                <Loader2 className="animate-spin h-4 w-4" /> Loading held entries...
                            </div>
                        ) : heldEntries?.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <PauseCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                <p>No held gate entries.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {heldEntries?.map((entry: any) => (
                                    <div key={entry.id}
                                        className="flex items-center justify-between p-4 border border-yellow-200 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/gate/inspection?id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold text-yellow-900">{entry.vehicle_number}</div>
                                            <div className="text-sm text-yellow-700">
                                                {entry.vendors?.name} — {entry.materials?.name}
                                            </div>
                                            {entry.hold_reason && (
                                                <div className="text-xs text-red-600 mt-1">Reason: {entry.hold_reason}</div>
                                            )}
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {new Date(entry.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge className={
                                                entry.status === 'PRIORITY_REVIEW'
                                                    ? 'bg-red-600 text-white'
                                                    : 'bg-yellow-500 text-white'
                                            }>
                                                {entry.status === 'PRIORITY_REVIEW' ? 'PRIORITY' : 'HELD'}
                                            </Badge>
                                            <Button size="sm" variant="outline" className="gap-1">
                                                Continue <ArrowRight className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function Err({ msg }: { msg?: any }) {
    if (!msg) return null
    return <span className="text-red-500 text-xs font-semibold">{msg}</span>
}
