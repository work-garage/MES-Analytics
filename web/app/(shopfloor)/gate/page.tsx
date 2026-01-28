'use client'

import { useState, useEffect, Suspense } from 'react'
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
import { toast } from 'sonner'
import PhotoCapture from '@/components/business/PhotoCapture'
import { Loader2, Fingerprint } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

export default function GateEntryPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Gate Entry...</div>}>
            <GateEntryContent />
        </Suspense>
    )
}

function GateEntryContent() {
    const router = useRouter()
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Debug URL params
    const searchParams = useSearchParams()
    console.log("Gate Entry Params:", searchParams.toString())



    // Fetch Master Data
    const supabase = createClient()
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
        console.log("Submitting Gate Entry:", values) // Debug logging
        if (!user) {
            toast.error("You must be logged in to sign off")
            return
        }
        setIsSubmitting(true)
        try {
            // 1. Upload Photos
            const gatePhotoName = `gate/${Date.now()}_${values.vehicle_no}.jpg`
            const sealPhotoName = `seal/${Date.now()}_${values.vehicle_no}.jpg`

            // Parallel Upload
            await Promise.all([
                supabase.storage.from('weighbridge-photos').upload(gatePhotoName, values.gate_photo),
                supabase.storage.from('weighbridge-photos').upload(sealPhotoName, values.seal_photo)
            ])

            // 2. Call RPC
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

            console.log("RPC Response Data:", data)
            toast.success("Gate Entry Recorded", { description: `Entry No: ${data.entry_number}` })
            console.log(`Redirecting to: /weighbridge?entry_id=${data.id}`)
            router.push(`/weighbridge?entry_id=${data.id}`) // Forward to WB

        } catch (error: any) {
            console.error("Gate Entry Submit Error:", error) // Debug logging
            toast.error('Submission Failed', { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Inbound Gate Entry</h1>
            <Card>
                <CardHeader className="bg-slate-50 border-b">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-blue-600" />
                        Gate Operator: {user?.email || 'Guest'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                        console.error("Form Validation Errors:", errors)
                        toast.error("Please fill all required fields")
                    })} className="space-y-6">
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
                                <Controller
                                    control={form.control}
                                    name="vendor_id"
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Select Vendor" /></SelectTrigger>
                                            <SelectContent>
                                                {vendors?.map((v: any) => (
                                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                <Err msg={form.formState.errors.vendor_id?.message} />
                            </div>
                            <div className="space-y-2">
                                <Label>Material</Label>
                                <Controller
                                    control={form.control}
                                    name="material_id"
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                                            <SelectContent>
                                                {materials?.map((m: any) => (
                                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
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
                                <Controller
                                    control={form.control}
                                    name="gate_photo"
                                    render={({ field }) => (
                                        <PhotoCapture
                                            label="Vehicle Front (Mandatory)"
                                            onCapture={field.onChange}
                                            required
                                        />
                                    )}
                                />
                                <Err msg={form.formState.errors.gate_photo?.message} />
                            </div>
                            <div className="space-y-2">
                                <Controller
                                    control={form.control}
                                    name="seal_photo"
                                    render={({ field }) => (
                                        <PhotoCapture
                                            label="Seal Condition (Mandatory)"
                                            onCapture={field.onChange}
                                            required
                                        />
                                    )}
                                />
                                <Err msg={form.formState.errors.seal_photo?.message} />
                            </div>
                        </div>

                        {/* Decision */}
                        <div className="bg-slate-50 p-6 rounded-lg border space-y-4">
                            <Label className="text-lg font-semibold">Gate Decision</Label>
                            <Controller
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <RadioGroup
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        className="flex gap-6"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="ALLOW" id="allow" />
                                            <Label htmlFor="allow" className="text-green-700 font-bold">Allow to Weighbridge</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="HOLD" id="hold" />
                                            <Label htmlFor="hold" className="text-red-600 font-bold">HOLD VEHICLE</Label>
                                        </div>
                                    </RadioGroup>
                                )}
                            />

                            {form.watch('status') === 'HOLD' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <Label>Reason for Holding (Mandatory)</Label>
                                    <Textarea
                                        {...form.register('hold_reason')}
                                        placeholder="Explain why the vehicle is held (e.g., Damaged Seal, Wrong Material)"
                                    />
                                    <Err msg={form.formState.errors.hold_reason?.message} />
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 pt-4 border-t">
                            <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                                Sign & Allow Entry
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

function Err({ msg }: { msg?: any }) {
    if (!msg) return null
    return <span className="text-red-500 text-xs font-semibold">{msg}</span>
}
