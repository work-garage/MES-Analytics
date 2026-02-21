'use client'

import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import PhotoCapture from '@/components/business/PhotoCapture'
import { Truck } from 'lucide-react'

export default function DispatchPage() {
    const router = useRouter()
    const supabase = createClient()

    const { data: batches } = useQuery({
        queryKey: ['fg-batches-avail'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('fg_batches')
                .select('id, batch_no, sku_code, quantity_units')
                .gt('quantity_units', 0)

            if (error) throw error
            return data || []
        },
    })

    const form = useForm({
        defaultValues: {
            selectedBatch: '',
            truckNo: '',
            driverName: '',
            lrNo: '',
            dispatchQty: 0,
            loadingPhoto: null as File | null
        }
    })

    const handleDispatch = async (values: any) => {
        // Upload Photo
        // Call RPC rpc_dispatch_fg

        const { error } = await supabase.rpc('rpc_dispatch_fg', {
            p_fg_batch_id: values.selectedBatch,
            p_quantity: values.dispatchQty,
            p_destination: 'Mumbai Depot',
            p_truck_no: values.truckNo,
            p_transporter: 'VRL Logistics',
            p_lr_no: values.lrNo,
            p_driver_name: values.driverName,
            p_photos: ['path/to/uploaded/photo.jpg'] // TODO: Real upload
        })

        if (error) {
            toast.error("Dispatch Failed", { description: error.message })
        } else {
            toast.success("Dispatch Created")
            router.push('/dashboard')
        }
    }

    return (
        <div className="max-w-2xl mx-auto py-6 space-y-6">
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> New Dispatch</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={form.handleSubmit(handleDispatch)} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Select FG Batch</Label>
                            <Controller
                                control={form.control}
                                name="selectedBatch"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Select Batch" /></SelectTrigger>
                                        <SelectContent>
                                            {batches?.map((b: any) => (
                                                <SelectItem key={b.id} value={b.id}>
                                                    {b.batch_no} ({b.sku_code}) - Avail: {b.quantity_units}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Truck No</Label>
                                <Input {...form.register('truckNo')} placeholder="MH-04-XX-0000" />
                            </div>
                            <div className="space-y-2">
                                <Label>LR / Challan No</Label>
                                <Input {...form.register('lrNo')} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Dispatch Quantity (Packs)</Label>
                            <Input type="number" {...form.register('dispatchQty', { valueAsNumber: true })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Driver Name</Label>
                            <Input {...form.register('driverName')} />
                        </div>

                        <Controller
                            control={form.control}
                            name="loadingPhoto"
                            render={({ field }) => (
                                <PhotoCapture
                                    label="Pallets Loaded in Truck"
                                    onCapture={field.onChange}
                                    required
                                />
                            )}
                        />

                        <Button size="lg" className="w-full" type="submit" disabled={!form.watch('selectedBatch')}>
                            Confirm Dispatch
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
