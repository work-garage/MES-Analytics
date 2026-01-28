'use client'

import { useState, Suspense } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Truck, Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PhotoCapture from '@/components/business/PhotoCapture'

export default function DispatchPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Dispatch System...</div>}>
            <DispatchContent />
        </Suspense>
    )
}

function DispatchContent() {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Available FG Batches
    const { data: batches } = useQuery({
        queryKey: ['fg-batches-avail'],
        queryFn: async () => {
            const { data } = await supabase.from('fg_batches')
                .select('id, batch_no, sku_code, quantity_units')
                .gt('quantity_units', 0)
            return data || []
        }
    })

    // Fetch Recent Dispatches
    const { data: recentDispatches, refetch: refetchDispatches } = useQuery({
        queryKey: ['recent-dispatches'],
        queryFn: async () => {
            const { data } = await supabase.from('dispatches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            customer: '',
            truck: '',
            driver: '',
            mobile: '',
            items: [{ batch_id: '', qty: 0 }],
            photo: null
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            let photoPath = null
            if (values.photo) {
                photoPath = `dispatch/${Date.now()}.jpg`
                await supabase.storage.from('production-photos').upload(photoPath, values.photo)
            }

            const { error } = await supabase.rpc('rpc_create_dispatch', {
                p_customer: values.customer,
                p_truck: values.truck,
                p_driver: values.driver,
                p_driver_mobile: values.mobile,
                p_items: values.items,
                p_user_id: (await supabase.auth.getUser()).data.user?.id,
                p_photo: photoPath
            })

            if (error) throw error
            toast.success("Dispatch Created Successfully")
            form.reset({
                customer: '',
                truck: '',
                driver: '',
                mobile: '',
                items: [{ batch_id: '', qty: 0 }],
                photo: null
            })
            refetchDispatches()

        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Dispatch Form */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Create Dispatch
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Customer Name</Label>
                                <Input {...form.register('customer')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Transporter / Truck No</Label>
                                <Input {...form.register('truck')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Driver Name</Label>
                                <Input {...form.register('driver')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Driver Mobile</Label>
                                <Input {...form.register('mobile')} />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded border">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-sm">Items to Dispatch</h3>
                                <Button type="button" size="sm" variant="outline" onClick={() => append({ batch_id: '', qty: 0 })}>
                                    <Plus className="h-4 w-4 mr-1" /> Add Batch
                                </Button>
                            </div>

                            {fields.map((field, index) => (
                                <div key={field.id} className="grid grid-cols-12 gap-2 items-end mb-2">
                                    <div className="col-span-7">
                                        <Label className="text-xs">Select FG Batch</Label>
                                        <Controller
                                            control={form.control}
                                            name={`items.${index}.batch_id`}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue placeholder="Batch..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {batches?.map((b: any) => (
                                                            <SelectItem key={b.id} value={b.id}>
                                                                {b.batch_no} ({b.sku_code}) - {b.quantity_units} Avl
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <Label className="text-xs">Qty (Packs)</Label>
                                        <Input type="number" {...form.register(`items.${index}.qty`, { valueAsNumber: true })} />
                                    </div>
                                    <div className="col-span-2">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Controller
                            control={form.control}
                            name="photo"
                            render={({ field }) => (
                                <PhotoCapture
                                    label="Loaded Pallet Photo"
                                    onCapture={field.onChange}
                                    required
                                />
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirm Dispatch"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Recent Dispatches List */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Dispatches</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {recentDispatches?.length === 0 ? (
                            <div className="text-center text-slate-500 text-sm italic">No dispatches today.</div>
                        ) : (
                            recentDispatches?.map((d: any) => (
                                <div key={d.id} className="p-3 border rounded bg-white hover:bg-slate-50 text-sm">
                                    <div className="flex justify-between font-bold mb-1">
                                        <span>{d.vehicle_no}</span>
                                        <span className="text-blue-600">{d.status}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-600">
                                        <span>Customer: {d.customer_name}</span>
                                        <span>Driver: {d.driver_name}</span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-2 text-right">
                                        {new Date(d.created_at).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
