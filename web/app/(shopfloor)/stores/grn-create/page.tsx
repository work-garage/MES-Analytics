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
    const [existingGrn, setExistingGrn] = useState<{
        id: string
        grn_no: string
        status: string | null
        net_qty: number | null
        itc_expiry_date: string | null
        created_at: string | null
    } | null>(null)
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
                    .select('id, grn_no, status, net_qty, itc_expiry_date, created_at')
                    .eq('gate_entry_id', gateEntryId)
                    .maybeSingle()

                setExistingGrn(existing ?? null)
                return data
            } else {
                setExistingGrn(null)
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
                    .select('gate_entry_id, grn_no, status, created_at')
                    .in('gate_entry_id', ids)

                if (grnError) {
                    toast.error('Failed to validate existing GRNs', { description: grnError.message })
                    setPendingEntries(pendingRows)
                    return
                }

                const latestGrnByEntry = new Map<string, any>()
                for (const grn of existingGrns || []) {
                    const prev = latestGrnByEntry.get(grn.gate_entry_id)
                    if (!prev || new Date(grn.created_at || 0).getTime() > new Date(prev.created_at || 0).getTime()) {
                        latestGrnByEntry.set(grn.gate_entry_id, grn)
                    }
                }

                const rowsToShow = pendingRows
                    .filter((row: any) => {
                        const linkedGrn = latestGrnByEntry.get(row.id)
                        if (!linkedGrn) return true
                        return linkedGrn.status === 'DRAFT'
                    })
                    .map((row: any) => {
                        const linkedGrn = latestGrnByEntry.get(row.id)
                        return {
                            ...row,
                            pending_grn_no: linkedGrn?.grn_no ?? null,
                            pending_grn_status: linkedGrn?.status ?? null
                        }
                    })

                setPendingEntries(rowsToShow)
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

        const containerCount = Number(values.container_count)
        const unitWeight = Number(values.unit_weight)
        const storageLocation = String(values.storage_location || '').trim()

        if (!values.pallet_photo) {
            toast.error('Pallet / stacking photo is required before finalizing GRN.')
            return
        }
        if (!Number.isFinite(containerCount) || containerCount <= 0) {
            toast.error('Container count must be greater than 0.')
            return
        }
        if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
            toast.error('Unit weight must be greater than 0.')
            return
        }
        if (!storageLocation) {
            toast.error('Storage location is required.')
            return
        }

        setIsSubmitting(true)
        try {
            // Upload Photo
            let photoPath = null
            if (values.pallet_photo) {
                photoPath = `grn/${Date.now()}_pallet.jpg`
                const { error: uploadError } = await supabase.storage.from('weighbridge-photos').upload(photoPath, values.pallet_photo) // Reusing bucket for now
                if (uploadError) throw uploadError
            }

            if (existingGrn) {
                if (existingGrn.status && existingGrn.status !== 'DRAFT') {
                    toast.error(`GRN ${existingGrn.grn_no} is already finalized (${existingGrn.status}).`)
                    return
                }

                const nowIso = new Date().toISOString()

                const { error: updateGrnError } = await supabase
                    .from('grns')
                    .update({
                        pallet_barcode: values.pallet_barcode || null,
                        container_type: values.container_type,
                        container_count: containerCount,
                        unit_weight: unitWeight,
                        storage_location: storageLocation,
                        sign_off_manager_id: user.id,
                        status: 'RECEIVED',
                        updated_at: nowIso
                    })
                    .eq('id', existingGrn.id)

                if (updateGrnError) throw updateGrnError

                const { data: existingContainerRows, error: containerFetchError } = await supabase
                    .from('container_inventory')
                    .select('id')
                    .eq('grn_id', existingGrn.id)
                    .limit(1)

                if (containerFetchError) throw containerFetchError

                if ((existingContainerRows?.length || 0) > 0) {
                    const { error: updateContainerError } = await supabase
                        .from('container_inventory')
                        .update({
                            container_type: values.container_type,
                            units: containerCount,
                            status: 'AVAILABLE'
                        })
                        .eq('id', existingContainerRows![0].id)

                    if (updateContainerError) throw updateContainerError
                } else {
                    const { error: insertContainerError } = await supabase
                        .from('container_inventory')
                        .insert({
                            grn_id: existingGrn.id,
                            container_type: values.container_type,
                            units: containerCount,
                            reusable: true,
                            status: 'AVAILABLE'
                        })

                    if (insertContainerError) throw insertContainerError
                }

                const { data: inventoryRows, error: inventoryFetchError } = await supabase
                    .from('main_inventory')
                    .select('id')
                    .eq('grn_id', existingGrn.id)

                if (inventoryFetchError) throw inventoryFetchError

                if ((inventoryRows?.length || 0) === 0) {
                    const { error: insertInventoryError } = await supabase
                        .from('main_inventory')
                        .insert({
                            material_id: gateEntry.material_id,
                            grn_id: existingGrn.id,
                            available_qty: Number(existingGrn.net_qty || gateEntry.net_weight || 0),
                            reserved_qty: 0,
                            location_bin: storageLocation,
                            lot_expiry: existingGrn.itc_expiry_date || null,
                            last_updated: nowIso
                        })

                    if (insertInventoryError) throw insertInventoryError
                }

                setExistingGrn({
                    ...existingGrn,
                    status: 'RECEIVED'
                })

                toast.success(`GRN Finalized: ${existingGrn.grn_no}`)
                router.push('/stores/inventory')
                return
            }

            const nowIso = new Date().toISOString()
            const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8)
            const suffix = Math.random().toString(16).slice(2, 6)
            const generatedGrnNo = `GRN-${ts}-${suffix}`

            const { data: latestQa } = await supabase
                .from('qa_inspections')
                .select('itc_expiry_date, vendor_expiry_date, vendor_mfg_date')
                .eq('gate_entry_id', gateEntryId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            const { data: createdGrn, error: createGrnError } = await supabase
                .from('grns')
                .insert({
                    grn_no: generatedGrnNo,
                    gate_entry_id: gateEntryId,
                    vendor_id: gateEntry.vendor_id ?? null,
                    vehicle_no: gateEntry.vehicle_number ?? null,
                    challan_no: gateEntry.challan_no ?? null,
                    challan_date: gateEntry.challan_date ?? null,
                    expected_qty: Number(gateEntry.expected_qty || 0),
                    gross_weight: Number(gateEntry.gross_weight || 0),
                    tare_weight: Number(gateEntry.tare_weight || 0),
                    net_qty: Number(gateEntry.net_weight || 0),
                    weighbridge_slip_no: gateEntry.weighbridge_slip_no ?? gateEntryId,
                    vendor_expiry_date: latestQa?.vendor_expiry_date ?? null,
                    itc_expiry_date: latestQa?.itc_expiry_date ?? null,
                    pallet_barcode: values.pallet_barcode || null,
                    container_type: values.container_type,
                    container_count: containerCount,
                    unit_weight: unitWeight,
                    storage_location: storageLocation,
                    sign_off_manager_id: user.id,
                    created_by: user.id,
                    status: 'RECEIVED',
                    updated_at: nowIso,
                })
                .select('id, grn_no, status, net_qty, itc_expiry_date, created_at')
                .single()

            if (createGrnError) {
                if (/duplicate|unique/i.test(createGrnError.message || '')) {
                    const { data: linkedExisting } = await supabase
                        .from('grns')
                        .select('id, grn_no, status, net_qty, itc_expiry_date, created_at')
                        .eq('gate_entry_id', gateEntryId)
                        .maybeSingle()
                    if (linkedExisting) {
                        setExistingGrn(linkedExisting)
                        toast.warning(`GRN already exists for this entry: ${linkedExisting.grn_no}`)
                        return
                    }
                }
                throw createGrnError
            }

            const { error: insertContainerError } = await supabase
                .from('container_inventory')
                .insert({
                    grn_id: createdGrn.id,
                    container_type: values.container_type,
                    units: containerCount,
                    reusable: true,
                    status: 'AVAILABLE'
                })

            if (insertContainerError) throw insertContainerError

            const { error: insertInventoryError } = await supabase
                .from('main_inventory')
                .insert({
                    material_id: gateEntry.material_id,
                    grn_id: createdGrn.id,
                    available_qty: Number(createdGrn.net_qty || gateEntry.net_weight || 0),
                    reserved_qty: 0,
                    location_bin: storageLocation,
                    lot_expiry: createdGrn.itc_expiry_date || null,
                    last_updated: nowIso
                })

            if (insertInventoryError) throw insertInventoryError

            toast.success('GRN Created Successfully')
            setExistingGrn({
                id: createdGrn?.id || '',
                grn_no: createdGrn?.grn_no || generatedGrnNo,
                status: createdGrn?.status || 'RECEIVED',
                net_qty: createdGrn?.net_qty || null,
                itc_expiry_date: createdGrn?.itc_expiry_date || null,
                created_at: createdGrn?.created_at || null
            })
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
                        <CardTitle>Pending GRN Actions (QA Cleared + Draft Finalization)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No QA-cleared or draft GRNs pending action.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/stores/grn-create?entry_id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.materials?.name}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} - {entry.vehicle_number}</div>
                                            {entry.pending_grn_status === 'DRAFT' && (
                                                <div className="text-xs text-blue-700 mt-1">
                                                    Draft exists: {entry.pending_grn_no}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-mono text-xs px-2 py-1 rounded mb-1 ${entry.pending_grn_status === 'DRAFT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                                {entry.pending_grn_status === 'DRAFT' ? 'READY_TO_FINALIZE' : entry.status}
                                            </div>
                                            <Button size="sm" variant="outline">
                                                {entry.pending_grn_status === 'DRAFT' ? 'Finalize GRN' : 'Create GRN'}
                                            </Button>
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
                        {existingGrn && (
                            <div className="space-y-3 p-3 text-sm bg-blue-50 border border-blue-200 rounded text-blue-900">
                                {existingGrn.status === 'DRAFT' ? (
                                    <div>
                                        Existing draft GRN found: <strong>{existingGrn.grn_no}</strong>. Complete details below and click <strong>Finalize GRN</strong>.
                                    </div>
                                ) : (
                                    <div>
                                        GRN already finalized for this entry: <strong>{existingGrn.grn_no}</strong> ({existingGrn.status}).
                                    </div>
                                )}
                                <div className="text-blue-800">
                                    Gate Entry ID: <strong>{gateEntry.id}</strong> | Challan: <strong>{gateEntry.challan_no || 'N/A'}</strong>
                                </div>
                                <Button type="button" variant="outline" onClick={() => router.push('/stores/grn-create')}>
                                    Back to Pending GRN Queue
                                </Button>
                            </div>
                        )}

                        {existingGrn?.status && existingGrn.status !== 'DRAFT' ? (
                            <div className="space-y-3">
                                <Button type="button" className="w-full" onClick={() => router.push('/stores/inventory')}>
                                    View in Inventory
                                </Button>
                            </div>
                        ) : (
                            <>
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

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="animate-spin" />
                                    ) : existingGrn?.status === 'DRAFT' ? (
                                        'Finalize GRN'
                                    ) : (
                                        'Generate GRN'
                                    )}
                                </Button>
                            </>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
