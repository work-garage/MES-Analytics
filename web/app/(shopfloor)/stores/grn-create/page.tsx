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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null): value is string {
    return !!value && UUID_RE.test(value)
}

function CreateGRNContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const rawGateEntryId = searchParams.get('entry_id')
    const gateEntryId = isUuid(rawGateEntryId) ? rawGateEntryId : null
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [existingGrnNo, setExistingGrnNo] = useState<string | null>(null)
    const supabase = createClient()

    useEffect(() => {
        if (rawGateEntryId && !gateEntryId) {
            toast.error('Invalid GRN link. Please choose an item from pending list.')
            router.replace('/stores/grn-create')
        }
    }, [rawGateEntryId, gateEntryId, router])

    // Fetch Gate Entry OR Pending List
    const { data: gateEntry, isLoading } = useQuery({
        queryKey: ['gate-entry', gateEntryId],
        queryFn: async () => {
            if (gateEntryId) {
                const { data, error } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .eq('id', gateEntryId)
                    .single()
                if (error) throw error

                const { data: existing } = await supabase
                    .from('grns')
                    .select('grn_no')
                    .eq('gate_entry_id', gateEntryId)
                    .maybeSingle()

                setExistingGrnNo(existing?.grn_no ?? null)
                return data
            } else {
                setExistingGrnNo(null)
                return null
            }
        },
        enabled: true
    })

    // Fetch Pending if no ID
    useEffect(() => {
        if (!gateEntryId) {
            const fetchPending = async () => {
                const { data: pending, error: pendingError } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .in('status', ['QA_OK', 'QA_ACCEPTED'])
                    .order('updated_at', { ascending: true })

                if (pendingError) {
                    toast.error('Failed to load pending entries', { description: pendingError.message })
                    setPendingEntries([])
                    return
                }

                const pendingRows = pending || []
                if (pendingRows.length === 0) {
                    setPendingEntries([])
                    return
                }

                const ids = pendingRows.map((row: any) => row.id)
                const { data: existingGrns, error: grnError } = await supabase
                    .from('grns')
                    .select('gate_entry_id')
                    .in('gate_entry_id', ids)

                if (grnError) {
                    toast.error('Failed to validate existing GRNs', { description: grnError.message })
                    setPendingEntries(pendingRows)
                    return
                }

                const createdGateEntries = new Set((existingGrns || []).map((g: any) => g.gate_entry_id))
                setPendingEntries(pendingRows.filter((row: any) => !createdGateEntries.has(row.id)))
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
        if (!gateEntryId) {
            toast.error('Invalid gate entry ID. Re-open GRN from pending list.')
            return
        }
        if (!user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }
        if (existingGrnNo) {
            toast.error(`GRN already created for this entry: ${existingGrnNo}`)
            return
        }

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
                p_manager_id: user.id
            })

            if (error) throw error
            toast.success("GRN Created Successfully")
            setExistingGrnNo(data?.grn_no ?? 'CREATED')
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
                        <CardTitle>Pending GRN Finalization (QA Accepted)</CardTitle>
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
                                            <div className="font-mono text-xs bg-green-100 text-green-800 px-2 py-1 rounded mb-1">QA ACCEPTED</div>
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
                        <div className="col-span-2">
                            <span className="text-slate-500 block">Challan No</span>
                            <span className="font-semibold">{gateEntry.challan_no}</span>
                        </div>
                    </div>

                    {/* Container Math Helper */}
                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg mb-6 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-slate-500">Total Received Net Weight</p>
                            <p className="font-bold text-lg text-blue-900">{gateEntry.net_weight || 0} kg</p>
                        </div>
                        {form.watch('unit_weight') > 0 && gateEntry.net_weight > 0 && (
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Containers Needed (Approx)</p>
                                <p className="font-bold text-lg text-blue-900">
                                    {Math.ceil(gateEntry.net_weight / form.watch('unit_weight'))} <span className="text-sm font-normal">containers</span>
                                </p>
                            </div>
                        )}
                    </div>

                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {existingGrnNo && (
                            <div className="p-3 text-sm bg-amber-50 border border-amber-200 rounded text-amber-800">
                                GRN already exists for this gate entry: <strong>{existingGrnNo}</strong>. Duplicate GRN creation is blocked.
                            </div>
                        )}

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

                        <Button type="submit" className="w-full" disabled={isSubmitting || !!existingGrnNo}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Generate GRN"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
