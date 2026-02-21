'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import PhotoCapture from '@/components/business/PhotoCapture'
import { Scale, Scan, CheckCircle } from 'lucide-react'
import { SensorStatusBadge } from '@/components/ui/sensor-status-badge'
import { ManualFallbackToggle } from '@/components/ui/manual-fallback-toggle'

export default function PremixLogPage() {
    const router = useRouter()
    const [isManual, setIsManual] = useState(false)
    const sensorStatus = isManual ? 'OFFLINE' : 'ONLINE'

    const form = useForm({
        defaultValues: {
            sub_batch_id: '',
            material_id: '',
            target_qty: 25.0,
            actual_qty: 0,
            bag_code: '',
            scale_photo: null as File | null
        }
    })

    const fetchScaleReading = async () => {
        // Mock IoT Scale
        form.setValue('actual_qty', 25.05) // Near perfect match
        toast.success("Read from IoT Scale")
    }

    const confirmWeighing = async (values: any) => {
        if (!values.scale_photo && isManual) {
            toast.error("Scale Photo Required for Manual Entry")
            return
        }
        if (values.actual_qty <= 0) {
            toast.error("Invalid Weight")
            return
        }

        // Validation: Tolerance check (e.g., +/- 1%)
        const tolerance = values.target_qty * 0.01
        if (Math.abs(values.actual_qty - values.target_qty) > tolerance) {
            toast.warning("Weight Deviation > 1%. Supervisor Approval Needed.")
            // Logic to trigger approval or block
        }

        console.log("Submitting Premix", {
            source: isManual ? 'manual' : 'scale_iot',
            actualQty: values.actual_qty
        })

        toast.success("Premix Weighed & Verified")
        // Reset for next ingredient
        form.reset({
            ...values,
            material_id: '',
            actual_qty: 0,
            bag_code: '',
            scale_photo: null
        })
    }

    return (
        <div className="max-w-xl mx-auto py-6 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Premix Weighing Station</CardTitle>
                        <SensorStatusBadge status={sensorStatus} sensorName="Scale-02" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <form onSubmit={form.handleSubmit(confirmWeighing)} className="space-y-6">
                        <div className="space-y-4">
                            <ManualFallbackToggle enabled={isManual} onToggle={setIsManual} />
                            {!isManual && (
                                <Button type="button" variant="outline" className="w-full" onClick={fetchScaleReading}>
                                    Read from Connected Scale
                                </Button>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Active Sub-Batch</Label>
                            <Controller
                                control={form.control}
                                name="sub_batch_id"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Select Batch" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SB-101">SB-101 (Marie Gold)</SelectItem>
                                            <SelectItem value="SB-102">SB-102 (Nice Time)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Select Ingredient</Label>
                            <Controller
                                control={form.control}
                                name="material_id"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Next Ingredient to Weigh" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MAT-SUGAR">Sugar (Fine)</SelectItem>
                                            <SelectItem value="MAT-CHEM">Leavening Agent A</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        {form.watch('material_id') && (
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded text-center">
                                <div className="text-sm text-blue-600 font-semibold mb-1">Target Weight</div>
                                <div className="text-4xl font-bold text-blue-900">{form.watch('target_qty').toFixed(2)} kg</div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Scanned Bag / Container Check</Label>
                                <div className="relative">
                                    <Scan className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                                    <Input
                                        {...form.register('bag_code')}
                                        className="pl-8"
                                        placeholder="Scan Barcode"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Actual Weight (Scale)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register('actual_qty', { valueAsNumber: true })}
                                    className="font-mono text-lg"
                                    readOnly={!isManual}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Weight Verification {isManual && <span className="text-red-500">*</span>}</Label>
                            <Controller
                                control={form.control}
                                name="scale_photo"
                                render={({ field }) => (
                                    <PhotoCapture
                                        label="Photo of Scale Reading"
                                        onCapture={field.onChange}
                                        required={isManual}
                                    />
                                )}
                            />
                        </div>

                        <Button type="submit" size="lg" className="w-full bg-slate-800 hover:bg-slate-900"
                            disabled={(!form.watch('scale_photo') && isManual) || !form.watch('material_id')}>
                            <CheckCircle className="mr-2 h-4 w-4" /> Confirm & Print Label
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
