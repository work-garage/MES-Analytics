'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PackageCheck, ShieldCheck, Plus, Trash2 } from 'lucide-react'

type SKUOption = { id: string; sku: string; name: string | null }

type AggregatedData = {
    packs: number
    rejects: number
    waste: number
    goodQty: number
    subBatchIds: string[]
}

type IngredientRequirement = {
    material_id: string
    material_name: string
    material_code: string
    shelf_life_days: number
    required_qty: number
}

type InventoryLot = {
    inventory_id: string
    material_id: string
    material_name: string
    material_code: string
    grn_id: string
    grn_no: string
    available_qty: number
    grn_net_qty: number
    unit_weight: number
    container_type: string
    container_units_available: number
    expiry: string
}

type AllocationRow = {
    row_id: string
    material_id: string
    inventory_id: string
    grn_id: string
    qty: number
    container_units: number
}

const newRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const formatDateOnly = (date: Date) => date.toISOString().split('T')[0]

function calculateExpiryDate(
    allocations: AllocationRow[],
    lots: InventoryLot[],
    ingredients: IngredientRequirement[],
) {
    const lotMap = new Map(lots.map(lot => [lot.inventory_id, lot]))
    const candidateExpiries = allocations
        .map(row => lotMap.get(row.inventory_id)?.expiry)
        .filter((value): value is string => Boolean(value))
        .map(value => value.split('T')[0])

    if (candidateExpiries.length > 0) {
        candidateExpiries.sort((a, b) => a.localeCompare(b))
        return candidateExpiries[0]
    }

    const shelfLives = ingredients
        .map(item => Number(item.shelf_life_days || 0))
        .filter(days => Number.isFinite(days) && days > 0)
    const minShelfLife = shelfLives.length > 0 ? Math.min(...shelfLives) : 30
    const date = new Date()
    date.setDate(date.getDate() + minShelfLife)
    return formatDateOnly(date)
}

export default function FGBatchPage() {
    const router = useRouter()
    const supabase = createClient()

    const [skuId, setSkuId] = useState('')
    const [shift, setShift] = useState('A')
    const [aggregatedData, setAggregatedData] = useState<AggregatedData | null>(null)
    const [expiry, setExpiry] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(false)
    const [skus, setSkus] = useState<SKUOption[]>([])
    const [ingredients, setIngredients] = useState<IngredientRequirement[]>([])
    const [lots, setLots] = useState<InventoryLot[]>([])
    const [allocations, setAllocations] = useState<AllocationRow[]>([])
    const [manualProducedPacks, setManualProducedPacks] = useState(0)
    const [manualGoodPacks, setManualGoodPacks] = useState(0)

    const lotsByInventoryId = useMemo(() => {
        const map = new Map<string, InventoryLot>()
        for (const lot of lots) map.set(lot.inventory_id, lot)
        return map
    }, [lots])

    useEffect(() => {
        supabase
            .from('recipe_templates')
            .select('id, sku, name')
            .eq('is_active', true)
            .then(({ data }) => setSkus((data || []) as SKUOption[]))
    }, [])

    const setAllocationPatch = (rowId: string, patch: Partial<AllocationRow>) => {
        setAllocations(prev => prev.map(row => row.row_id === rowId ? { ...row, ...patch } : row))
    }

    const addSourceRow = (materialId: string) => {
        const firstLot = lots.find(l => l.material_id === materialId)
        setAllocations(prev => [
            ...prev,
            {
                row_id: newRowId(),
                material_id: materialId,
                inventory_id: firstLot?.inventory_id ?? '',
                grn_id: firstLot?.grn_id ?? '',
                qty: 0,
                container_units: 0,
            }
        ])
    }

    const removeSourceRow = (rowId: string) => {
        setAllocations(prev => prev.filter(row => row.row_id !== rowId))
    }

    const fetchBatchContext = async (selectedSkuId: string) => {
        setSkuId(selectedSkuId)
        setAggregatedData(null)
        setIngredients([])
        setLots([])
        setAllocations([])
        setIsLoadingData(true)

        try {
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

            const [{ data: packingLogs }, { data: subBatches }, { data: recipeItems, error: itemsError }] = await Promise.all([
                supabase
                    .from('packing_process_logs')
                    .select('packs_produced, md_reject_count, wrapper_waste_kg')
                    .eq('sku_id', selectedSkuId)
                    .gt('created_at', twelveHoursAgo),
                supabase
                    .from('sub_batches')
                    .select('id')
                    .eq('recipe_template_id', selectedSkuId)
                    .gt('created_at', twelveHoursAgo),
                supabase
                    .from('recipe_items')
                    .select('material_id, qty_per_batch, materials(name, material_code, shelf_life_days)')
                    .eq('template_id', selectedSkuId),
            ])

            if (itemsError) throw itemsError

            const runs = Math.max(subBatches?.length || 0, 1)
            const ingredientReqs: IngredientRequirement[] = (recipeItems || [])
                .filter((i: any) => i.material_id)
                .map((i: any) => ({
                    material_id: i.material_id,
                    material_name: i.materials?.name ?? 'Unknown',
                    material_code: i.materials?.material_code ?? '',
                    shelf_life_days: Number(i.materials?.shelf_life_days || 0),
                    required_qty: Number(i.qty_per_batch || 0) * runs,
                }))

            setIngredients(ingredientReqs)

            const materialIds = [...new Set(ingredientReqs.map(i => i.material_id))]
            let availableLots: InventoryLot[] = []

            if (materialIds.length > 0) {
                const { data: invRows, error: invError } = await supabase
                    .from('main_inventory')
                    .select(`
                        id,
                        grn_id,
                        material_id,
                        available_qty,
                        lot_expiry,
                        grns ( id, grn_no, net_qty, unit_weight, container_type, itc_expiry_date, status, container_inventory ( units ) ),
                        materials ( name, material_code )
                    `)
                    .in('material_id', materialIds)
                    .gt('available_qty', 0)
                    .order('lot_expiry', { ascending: true })

                if (invError) throw invError

                availableLots = (invRows || [])
                    .filter((r: any) => r.grns?.status === 'RECEIVED')
                    .map((r: any) => ({
                        inventory_id: r.id,
                        material_id: r.material_id,
                        material_name: r.materials?.name ?? 'Unknown',
                        material_code: r.materials?.material_code ?? '',
                        grn_id: r.grn_id,
                        grn_no: r.grns?.grn_no ?? 'N/A',
                        available_qty: Number(r.available_qty || 0),
                        grn_net_qty: Number(r.grns?.net_qty || 0),
                        unit_weight: Number(r.grns?.unit_weight || 0),
                        container_type: r.grns?.container_type ?? 'units',
                        container_units_available: Number(r.grns?.container_inventory?.[0]?.units || 0),
                        expiry: r.grns?.itc_expiry_date ?? r.lot_expiry ?? '',
                    }))
            }

            setLots(availableLots)

            const initialAllocations: AllocationRow[] = ingredientReqs.map(req => {
                const firstLot = availableLots.find(l => l.material_id === req.material_id)
                const allocQty = firstLot ? Math.min(req.required_qty, firstLot.available_qty) : 0
                const allocUnits = firstLot && firstLot.unit_weight > 0 ? Math.ceil(allocQty / firstLot.unit_weight) : 0

                return {
                    row_id: newRowId(),
                    material_id: req.material_id,
                    inventory_id: firstLot?.inventory_id ?? '',
                    grn_id: firstLot?.grn_id ?? '',
                    qty: Number(allocQty.toFixed(3)),
                    container_units: allocUnits,
                }
            })

            setAllocations(initialAllocations)

            const totalPacks = (packingLogs || []).reduce((acc: number, l: any) => acc + Number(l.packs_produced || 0), 0)
            const totalRejects = (packingLogs || []).reduce((acc: number, l: any) => acc + Number(l.md_reject_count || 0), 0)
            const totalWaste = (packingLogs || []).reduce((acc: number, l: any) => acc + Number(l.wrapper_waste_kg || 0), 0)

            setAggregatedData({
                packs: totalPacks,
                rejects: totalRejects,
                waste: totalWaste,
                goodQty: Math.max(totalPacks - totalRejects, 0),
                subBatchIds: (subBatches || []).map((b: any) => b.id),
            })
            setManualProducedPacks(totalPacks)
            setManualGoodPacks(Math.max(totalPacks - totalRejects, 0))

            setExpiry(calculateExpiryDate(initialAllocations, availableLots, ingredientReqs))
        } catch (e: any) {
            toast.error('Failed to load FG context', { description: e.message })
        } finally {
            setIsLoadingData(false)
        }
    }

    useEffect(() => {
        if (!skuId || !aggregatedData) return
        setExpiry(calculateExpiryDate(allocations, lots, ingredients))
    }, [skuId, aggregatedData, allocations, lots, ingredients])

    const createBatch = async () => {
        if (!skuId || !aggregatedData) {
            toast.error('Select SKU and wait for context load.')
            return
        }

        if (ingredients.length === 0) {
            toast.error('No recipe materials found for the selected SKU.')
            return
        }

        if (manualProducedPacks <= 0) {
            toast.error('Produced packs must be greater than zero.')
            return
        }

        if (manualGoodPacks < 0 || manualGoodPacks > manualProducedPacks) {
            toast.error('Good packs must be between 0 and produced packs.')
            return
        }

        const byInventory = new Map<string, { lot: InventoryLot; qty: number; containerUnits: number }>()
        const byGrnContainer = new Map<string, { grnId: string; units: number; available: number }>()

        for (const ingredient of ingredients) {
            const rows = allocations.filter(a => a.material_id === ingredient.material_id)
            if (rows.length === 0) {
                toast.error(`Allocation missing for ${ingredient.material_name}`)
                return
            }

            const totalForMaterial = rows.reduce((sum, r) => sum + Number(r.qty || 0), 0)
            if (totalForMaterial < ingredient.required_qty) {
                toast.error(`Insufficient allocation for ${ingredient.material_name}. Required ${ingredient.required_qty.toFixed(2)} kg.`)
                return
            }

            for (const row of rows) {
                if (!row.inventory_id) {
                    toast.error(`Choose GRN lot for ${ingredient.material_name}`)
                    return
                }
                if (Number(row.qty) <= 0) {
                    toast.error(`Allocated qty must be > 0 for ${ingredient.material_name}`)
                    return
                }

                const lot = lotsByInventoryId.get(row.inventory_id)
                if (!lot) {
                    toast.error('Selected lot is not valid anymore. Refresh and retry.')
                    return
                }

                const invEntry = byInventory.get(row.inventory_id) || { lot, qty: 0, containerUnits: 0 }
                invEntry.qty += Number(row.qty)
                invEntry.containerUnits += Number(row.container_units || 0)
                byInventory.set(row.inventory_id, invEntry)

                const containerEntry = byGrnContainer.get(lot.grn_id) || {
                    grnId: lot.grn_id,
                    units: 0,
                    available: lot.container_units_available,
                }
                containerEntry.units += Number(row.container_units || 0)
                byGrnContainer.set(lot.grn_id, containerEntry)
            }
        }

        for (const { lot, qty } of byInventory.values()) {
            if (qty > lot.available_qty) {
                toast.error(`Allocated qty exceeds availability for GRN ${lot.grn_no}`)
                return
            }
            if (qty > lot.grn_net_qty) {
                toast.error(`Allocated qty exceeds GRN net qty for ${lot.grn_no}`)
                return
            }
        }

        for (const entry of byGrnContainer.values()) {
            if (entry.units > entry.available) {
                toast.error('Allocated container units exceed available container count for one or more GRNs.')
                return
            }
        }

        setIsSubmitting(true)
        try {
            const { data, error } = await supabase.rpc('rpc_create_fg_batch', {
                p_sku_id: skuId,
                p_shift: shift,
                p_produced_qty: manualProducedPacks,
                p_sub_batches_used: aggregatedData.subBatchIds,
                p_good_qty: manualGoodPacks,
                p_expiry_date: expiry,
                p_storage_loc: 'WH-FG-01',
                p_signed_by: null,
            })

            if (error) throw error

            for (const [inventoryId, info] of byInventory.entries()) {
                const nextAvailable = Math.max(info.lot.available_qty - info.qty, 0)
                const nextGrnQty = Math.max(info.lot.grn_net_qty - info.qty, 0)

                const { error: invError } = await supabase
                    .from('main_inventory')
                    .update({ available_qty: nextAvailable, last_updated: new Date().toISOString() })
                    .eq('id', inventoryId)
                if (invError) throw invError

                const { error: grnError } = await supabase
                    .from('grns')
                    .update({ net_qty: nextGrnQty })
                    .eq('id', info.lot.grn_id)
                if (grnError) throw grnError
            }

            for (const entry of byGrnContainer.values()) {
                if (entry.units <= 0) continue
                const nextUnits = Math.max(entry.available - entry.units, 0)
                const { error: cError } = await supabase
                    .from('container_inventory')
                    .update({ units: nextUnits })
                    .eq('grn_id', entry.grnId)
                if (cError) throw cError
            }

            toast.success(`FG Batch Created: ${data?.fg_batch_no || 'Success'}`)
            setTimeout(() => router.push('/stores/inventory'), 1200)
        } catch (e: any) {
            toast.error('Failed to Create FG Batch', { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Finalize FG Batch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label>Select SKU (Current Shift)</Label>
                            <Select onValueChange={fetchBatchContext}>
                                <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                                <SelectContent>
                                    {skus.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name || s.sku}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Shift</Label>
                            <Select value={shift} onValueChange={setShift}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="A">Shift A</SelectItem>
                                    <SelectItem value="B">Shift B</SelectItem>
                                    <SelectItem value="C">Shift C</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {skuId && isLoadingData && (
                        <div className="text-sm text-slate-500 bg-slate-50 border rounded p-3">
                            Loading packing, recipe and available GRN lots...
                        </div>
                    )}

                    {skuId && aggregatedData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded border">
                                <div>
                                    <Label className="text-slate-500">Total Packs Produced (from logs)</Label>
                                    <div className="text-3xl font-bold text-slate-800">{aggregatedData.packs}</div>
                                    <div className="text-xs text-slate-500 mt-1">MD Rejects: {aggregatedData.rejects}</div>
                                </div>
                                <div>
                                    <Label className="text-slate-500">Calculated Expiry</Label>
                                    <div className="text-3xl font-bold text-slate-800">{expiry}</div>
                                    <div className="text-xs text-slate-500 mt-1">Based on selected source lots / shelf life</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border rounded p-4">
                                <div className="space-y-1">
                                    <Label className="text-xs">Produced Packs (Final)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={manualProducedPacks}
                                        onChange={e => setManualProducedPacks(Number(e.target.value || 0))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Good Packs (After Rejects)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={manualGoodPacks}
                                        onChange={e => setManualGoodPacks(Number(e.target.value || 0))}
                                    />
                                </div>
                            </div>

                            {aggregatedData.packs <= 0 && (
                                <div className="p-3 text-sm bg-amber-50 border border-amber-200 rounded text-amber-800">
                                    Packing logs for last 12 hours are zero. Enter final produced and good packs manually before generating FG batch.
                                </div>
                            )}

                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded flex gap-3">
                                <ShieldCheck className="text-yellow-600 h-6 w-6 shrink-0" />
                                <div className="text-sm text-yellow-800">
                                    <strong>Material Source Required:</strong> Select the GRN/container source for each recipe material. On submit, selected quantities are deducted from store inventory.
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-semibold">Material Issue Plan (From GRN Lots)</h3>
                                {ingredients.map(ingredient => {
                                    const rows = allocations.filter(a => a.material_id === ingredient.material_id)
                                    const allocated = rows.reduce((sum, r) => sum + Number(r.qty || 0), 0)
                                    const lotOptions = lots.filter(l => l.material_id === ingredient.material_id)

                                    return (
                                        <div key={ingredient.material_id} className="border rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium">{ingredient.material_name} <span className="text-xs text-slate-500">({ingredient.material_code})</span></div>
                                                    <div className="text-xs text-slate-500">Required: {ingredient.required_qty.toFixed(2)} kg</div>
                                                </div>
                                                <div className={`text-xs font-medium ${allocated >= ingredient.required_qty ? 'text-green-600' : 'text-amber-600'}`}>
                                                    Allocated: {allocated.toFixed(2)} kg
                                                </div>
                                            </div>

                                            {rows.map((row, idx) => {
                                                const selectedLot = row.inventory_id ? lotsByInventoryId.get(row.inventory_id) : undefined

                                                return (
                                                    <div key={row.row_id} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                        <div className="md:col-span-6 space-y-1">
                                                            <Label className="text-xs">GRN Lot</Label>
                                                            <Select
                                                                value={row.inventory_id}
                                                                onValueChange={inventoryId => {
                                                                    const lot = lotsByInventoryId.get(inventoryId)
                                                                    setAllocationPatch(row.row_id, {
                                                                        inventory_id: inventoryId,
                                                                        grn_id: lot?.grn_id ?? '',
                                                                        container_units: 0,
                                                                    })
                                                                }}
                                                            >
                                                                <SelectTrigger><SelectValue placeholder="Select GRN" /></SelectTrigger>
                                                                <SelectContent>
                                                                    {lotOptions.map(opt => (
                                                                        <SelectItem key={opt.inventory_id} value={opt.inventory_id}>
                                                                            {opt.grn_no} | {opt.available_qty.toFixed(2)}kg | {opt.container_units_available} {opt.container_type}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="md:col-span-2 space-y-1">
                                                            <Label className="text-xs">Qty (kg)</Label>
                                                            <Input
                                                                type="number"
                                                                step="0.001"
                                                                value={row.qty}
                                                                onChange={e => setAllocationPatch(row.row_id, { qty: Number(e.target.value || 0) })}
                                                            />
                                                        </div>

                                                        <div className="md:col-span-3 space-y-1">
                                                            <Label className="text-xs">Containers Used</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                value={row.container_units}
                                                                onChange={e => setAllocationPatch(row.row_id, { container_units: Number(e.target.value || 0) })}
                                                            />
                                                            {selectedLot && (
                                                                <div className="text-[11px] text-slate-500">Available: {selectedLot.container_units_available} {selectedLot.container_type}</div>
                                                            )}
                                                        </div>

                                                        <div className="md:col-span-1 flex items-end">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="w-full"
                                                                disabled={idx === 0 && rows.length === 1}
                                                                onClick={() => removeSourceRow(row.row_id)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}

                                            <Button type="button" variant="outline" onClick={() => addSourceRow(ingredient.material_id)}>
                                                <Plus className="mr-2 h-4 w-4" /> Add Source GRN
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>

                            <Button
                                size="lg"
                                className="w-full bg-green-600 hover:bg-green-700"
                                onClick={createBatch}
                                disabled={isSubmitting || manualProducedPacks <= 0}
                            >
                                <PackageCheck className="mr-2 h-5 w-5" /> {isSubmitting ? 'Generating & Deducting...' : 'Generate FG Batch'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
