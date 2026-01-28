'use client'

import { useState, Suspense, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Package } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import PhotoCapture from '@/components/business/PhotoCapture'

export default function CreateGRNPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading GRN...</div>}>
            <CreateGRNContent />
        </Suspense>
    )
}

function CreateGRNContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const gateEntryId = searchParams.get('entry_id')
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const supabase = createClient()

    // Fetch Gate Entry OR Pending List
    const { data: gateEntry, isLoading } = useQuery({
        queryKey: ['gate-entry', gateEntryId],
        queryFn: async () => {
            if (gateEntryId) {
                const { data } = await supabase.from('gate_entries').select('*, vendors(name), materials(name)').eq('id', gateEntryId).single()
                return data
            } else {
                return null
            }
        },
        enabled: true
    })

    // Fetch Pending if no ID
    useEffect(() => {
        if (!gateEntryId) {
            const fetchPending = async () => {
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .eq('status', 'QA_OK')
                    .order('updated_at', { ascending: true })
                setPendingEntries(data || [])
            }
            fetchPending()
        }
    }, [gateEntryId])

    const form = useForm({
        defaultValues: {
            pallet_barcode: '',
            container_type: 'BAG',
            container_count: 0,
            unit_weight: 0,
            storage_location: 'MAIN_STORE_A1',
            pallet_photo: null
        }
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            // Upload Photo
            let photoPath = null
            if (values.pallet_photo) {
                photoPath = `grn/${Date.now()}_pallet.jpg`
                await supabase.storage.from('weighbridge-photos').upload(photoPath, values.pallet_photo) // Reusing bucket for now
            }

            const { error, data } = await supabase.rpc('rpc_create_grn_final', {
                p_gate_entry_id: gateEntryId,
                p_pallet_barcode: values.pallet_barcode,
                p_container_type: values.container_type,
                p_container_count: Number(values.container_count),
                p_unit_weight: Number(values.unit_weight),
                p_storage_location: values.storage_location,
                p_manager_id: user?.id
            })

            if (error) throw error
            toast.success("GRN Created Successfully")
            router.push('/stores/inventory')

        } catch (error: any) {
            toast.error("Failed to Create GRN", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return <div className="p-8">Loading...</div>

    if (!gateEntryId && !gateEntry) {
        return (
            <div className="max-w-4xl mx-auto py-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending GRN Finalization (QA Passed)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No approved materials pending GRN.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/stores/grn-create?entry_id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.materials?.name}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} - {entry.vehicle_number}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono text-xs bg-green-100 text-green-800 px-2 py-1 rounded mb-1">QA PASSED</div>
                                            <Button size="sm" variant="outline">Create GRN</Button>
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

    if (!gateEntry) return <div className="p-8">Entry Not Found</div>

    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Finalize GRN (Stores)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="bg-slate-50 p-4 rounded mb-6 text-sm grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-slate-500 block">Material</span>
                            <span className="font-semibold">{gateEntry.materials?.name}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Vendor</span>
                            <span className="font-semibold">{gateEntry.vendors?.name}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Challan No</span>
                            <span className="font-semibold">{gateEntry.challan_no}</span>
                        </div>
                    </div>

                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Container Type</Label>
                                <Controller
                                    control={form.control}
                                    name="container_type"
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BAG">Bag</SelectItem>
                                                <SelectItem value="DRUM">Drum</SelectItem>
                                                <SelectItem value="BOX">Box</SelectItem>
                                                <SelectItem value="ISO_TANK">ISO Tank</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Pallet Barcode</Label>
                                <Input {...form.register('pallet_barcode')} placeholder="Scan..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Container Count</Label>
                                <Input type="number" {...form.register('container_count', { valueAsNumber: true })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Unit Weight (kg)</Label>
                                <Input type="number" step="0.01" {...form.register('unit_weight', { valueAsNumber: true })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Storage Location</Label>
                            <Input {...form.register('storage_location')} placeholder="Main Store Location" />
                        </div>

                        <Controller
                            control={form.control}
                            name="pallet_photo"
                            render={({ field }) => (
                                <PhotoCapture
                                    label="Pallet / Stacking Photo"
                                    onCapture={field.onChange}
                                    required
                                />
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Generate GRN"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
