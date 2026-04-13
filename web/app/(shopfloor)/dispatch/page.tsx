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

function generateDispatchNo() {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const rand = Math.floor(Math.random() * 900 + 100)
    return `DSP-${date}-${time}-${rand}`
}

export default function DispatchPage() {
    const router = useRouter()
    const supabase = createClient()

    const { data: batches } = useQuery({
        queryKey: ['fg-batches-avail'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('fg_batches')
                .select('id, fg_batch_no, sku_id, good_qty, produced_qty')
                .gt('good_qty', 0)

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
        try {
            if (!values.selectedBatch) {
                toast.error('Select an FG batch to dispatch.')
                return
            }
            const qty = Number(values.dispatchQty)
            if (qty <= 0) {
                toast.error('Dispatch quantity must be greater than zero.')
                return
            }

            const { data: batchRow, error: batchError } = await supabase
                .from('fg_batches')
                .select('id, good_qty, produced_qty')
                .eq('id', values.selectedBatch)
                .single()
            if (batchError) throw batchError

            const available = Number(batchRow.good_qty ?? batchRow.produced_qty ?? 0)
            if (qty > available) {
                toast.error(`Dispatch qty exceeds available stock (${available}).`)
                return
            }

            const { error: updateError } = await supabase
                .from('fg_batches')
                .update({ good_qty: Math.max(available - qty, 0) })
                .eq('id', values.selectedBatch)
            if (updateError) throw updateError

            const { error: insertError } = await supabase
                .from('dispatches')
                .insert({
                    dispatch_no: generateDispatchNo(),
                    fg_batch_id: values.selectedBatch,
                    quantity: qty,
                    destination: values.lrNo || 'Customer Dispatch',
                    truck_no: values.truckNo,
                    transporter: 'Internal',
                    lr_no: values.lrNo || null,
                    dispatch_datetime: new Date().toISOString(),
                    driver_name: values.driverName || null,
                    photos: null,
                })
            if (insertError) throw insertError

            toast.success("Dispatch Created")
            router.push('/dashboard')
        } catch (error: any) {
            toast.error("Dispatch Failed", { description: error.message })
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
                                                    {b.fg_batch_no} ({(b.sku_id ?? '').slice(0, 8)}) - Avail: {b.good_qty ?? b.produced_qty ?? 0}
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
