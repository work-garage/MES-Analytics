'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ClipboardCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { vehicleInspectionSchema } from '@/lib/validators/inbound'
import { zodResolver } from '@hookform/resolvers/zod'

export default function VehicleInspectionPage() {
    const router = useRouter()
    // Mock Data
    const [vehicleNo, setVehicleNo] = useState('MH-12-AB-1234')

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
        resolver: zodResolver(vehicleInspectionSchema),
        defaultValues: {
            floor_clean: false,
            walls_clean: false,
            tarpaulin_intact: false,
            odour_ok: false,
            moisture_absent: false,
            seal_intact: false,
            remarks: ''
        }
    })

    // Watch for validation logic
    const values = watch()
    const allChecksPass = Object.values(values).slice(0, 6).every(Boolean)

    const onSubmit = async (data: any) => {
        // If checks fail, ensure remarks are present (handled by zod, but double check)
        if (!allChecksPass && (!data.remarks || data.remarks.length < 5)) {
            return toast.error("Remarks Mandatory for Failed Checks")
        }

        const status = allChecksPass ? 'PASSED' : 'REJECTED'

        // RPC Call log_vehicle_inspection
        toast.success(`Inspection Status: ${status}`)

        if (status === 'PASSED') {
            router.push('/weighbridge')
        } else {
            router.push('/dashboard') // Reject flow
        }
    }

    return (
        <div className="max-w-xl mx-auto py-6 space-y-6">
            <Card className={!allChecksPass ? 'border-orange-200' : 'border-green-200'}>
                <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Vehicle Inspection (L1/L2)</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded border">
                        <div className="text-xs text-slate-500">Vehicle No</div>
                        <div className="font-bold text-lg">{vehicleNo}</div>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="floor_clean" onCheckedChange={c => setValue('floor_clean', c === true)} />
                                <Label htmlFor="floor_clean">Floor Clean / No Debris</Label>
                            </div>
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="walls_clean" onCheckedChange={c => setValue('walls_clean', c === true)} />
                                <Label htmlFor="walls_clean">Side Walls Clean / No Rust</Label>
                            </div>
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="tarpaulin_intact" onCheckedChange={c => setValue('tarpaulin_intact', c === true)} />
                                <Label htmlFor="tarpaulin_intact">Tarpaulin Intact (No Holes)</Label>
                            </div>
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="odour_ok" onCheckedChange={c => setValue('odour_ok', c === true)} />
                                <Label htmlFor="odour_ok">No Abnormal Odour (Chemical/Petrol)</Label>
                            </div>
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="moisture_absent" onCheckedChange={c => setValue('moisture_absent', c === true)} />
                                <Label htmlFor="moisture_absent">No Visible Moisture / Water Damage</Label>
                            </div>
                            <div className="flex items-center space-x-2 border-b pb-2">
                                <Checkbox id="seal_intact" onCheckedChange={c => setValue('seal_intact', c === true)} />
                                <Label htmlFor="seal_intact">Vendor Seal Intact</Label>
                            </div>
                        </div>

                        {!allChecksPass && (
                            <div className="p-4 bg-orange-50 border border-orange-200 rounded animate-in fade-in">
                                <div className="flex items-center gap-2 text-orange-800 font-bold mb-2">
                                    <AlertTriangle className="h-4 w-4" /> Inspection Failed
                                </div>
                                <Label className="text-sm">Remarks (Mandatory)</Label>
                                <Input {...register('remarks')} placeholder="Describe the issue (e.g. Broken seal, wet floor)..." />
                                {errors.remarks && <span className="text-red-500 text-xs">{errors.remarks.message as string}</span>}
                            </div>
                        )}

                        <Button size="lg" className={`w-full ${allChecksPass ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            {allChecksPass ? 'Approve & Gate Pass' : 'Reject Vehicle'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
