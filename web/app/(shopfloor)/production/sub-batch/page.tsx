'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, PlayCircle, Box, CheckCircle2, Factory, Layers, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { WORKFLOW_SEQUENCE } from '@/lib/workflow/sequence'

// --- Animation Variants ---
const fadeUpContainer = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
} satisfies Variants

const fadeUpItem = {
    hidden: { y: 10, opacity: 0 },
    show: { 
        y: 0, 
        opacity: 1, 
        transition: { type: "tween", ease: "easeOut", duration: 0.3 } 
    }
} satisfies Variants

type IngredientRequirement = {
    material_id: string
    material_name: string
    material_code: string
    required_qty: number
}

type InventoryLot = {
    inventory_id: string
    material_id: string
    grn_id: string
    grn_no: string
    available_qty: number
    grn_net_qty: number
    unit_weight: number
    container_type: string
    container_units_available: number
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

const ALLOCATABLE_GRN_STATUSES = new Set(['RECEIVED', 'AVAILABLE'])

export default function SubBatchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <p className="text-sm font-medium text-gray-500">Loading Production Module...</p>
                </div>
            </div>
        }>
            <SubBatchContent />
        </Suspense>
    )
}

function SubBatchContent() {
    const router = useRouter()
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [allocationResult, setAllocationResult] = useState<any>(null)
    const [recentBatches, setRecentBatches] = useState<any[]>([])
    const [isMounted, setIsMounted] = useState(false)
    const [isLoadingMaterials, setIsLoadingMaterials] = useState(false)
    const [ingredients, setIngredients] = useState<IngredientRequirement[]>([])
    const [lots, setLots] = useState<InventoryLot[]>([])
    const [allocations, setAllocations] = useState<AllocationRow[]>([])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Fetch Active Recipes
    const { data: recipes } = useQuery({
        queryKey: ['recipes'],
        queryFn: async () => {
            const { data } = await supabase.from('recipe_templates').select('*').eq('is_active', true)
            return data || []
        }
    })

    // Fetch Recent Batches (Today)
    const { refetch: refetchBatches } = useQuery({
        queryKey: ['recent-batches'],
        queryFn: async () => {
            const { data } = await supabase
                .from('sub_batches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)
            setRecentBatches(data || [])
            return data
        },
        enabled: true
    })

    const form = useForm({
        defaultValues: {
            recipe_id: '',
            batch_count: 5,
            shift: 'A'
        }
    })

    const selectedRecipeId = form.watch('recipe_id')
    const selectedBatchCount = form.watch('batch_count')

    const lotsByInventoryId = useMemo(() => {
        const map = new Map<string, InventoryLot>()
        for (const lot of lots) map.set(lot.inventory_id, lot)
        return map
    }, [lots])

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

    const loadMaterialPlan = async (recipeId: string, batchCountValue: number) => {
        if (!recipeId) {
            setIngredients([])
            setLots([])
            setAllocations([])
            return
        }

        setIsLoadingMaterials(true)
        try {
            const requestedCount = Math.max(1, Number(batchCountValue) || 1)

            const { data: recipeItems, error: itemsError } = await supabase
                .from('recipe_items')
                .select('material_id, qty_per_batch, materials(name, material_code)')
                .eq('template_id', recipeId)

            if (itemsError) throw itemsError

            const ingredientReqs: IngredientRequirement[] = (recipeItems || [])
                .filter((item: any) => item.material_id)
                .map((item: any) => ({
                    material_id: String(item.material_id),
                    material_name: item.materials?.name ?? 'Unknown',
                    material_code: item.materials?.material_code ?? '',
                    required_qty: Number(item.qty_per_batch || 0) * requestedCount,
                }))

            setIngredients(ingredientReqs)

            const materialIds = [...new Set(ingredientReqs.map(i => i.material_id))]
            if (materialIds.length === 0) {
                setLots([])
                setAllocations([])
                return
            }

            const { data: invRows, error: invError } = await supabase
                .from('main_inventory')
                .select(`
                    id,
                    grn_id,
                    material_id,
                    available_qty,
                    grns ( id, grn_no, net_qty, unit_weight, container_type, status, container_inventory ( units ) )
                `)
                .in('material_id', materialIds)
                .gt('available_qty', 0)

            if (invError) throw invError

            const availableLots: InventoryLot[] = (invRows || [])
                .filter((row: any) => {
                    const status = String(row.grns?.status || '').toUpperCase()
                    return !status || ALLOCATABLE_GRN_STATUSES.has(status)
                })
                .map((row: any) => ({
                    inventory_id: String(row.id),
                    material_id: String(row.material_id),
                    grn_id: String(row.grn_id),
                    grn_no: row.grns?.grn_no ?? 'N/A',
                    available_qty: Number(row.available_qty || 0),
                    grn_net_qty: Number(row.grns?.net_qty || 0),
                    unit_weight: Number(row.grns?.unit_weight || 0),
                    container_type: row.grns?.container_type ?? 'units',
                    container_units_available: Number(row.grns?.container_inventory?.[0]?.units || 0),
                }))

            setLots(availableLots)

            const initialAllocations: AllocationRow[] = ingredientReqs.map(req => {
                const firstLot = availableLots.find(lot => lot.material_id === req.material_id)
                const allocQty = firstLot ? Math.min(req.required_qty, firstLot.available_qty) : 0
                let allocUnits = firstLot && firstLot.unit_weight > 0 ? Math.ceil(allocQty / firstLot.unit_weight) : 0

                // Clamp to prevent exceeding container count when bulk quantity is still available
                if (firstLot && allocUnits > firstLot.container_units_available) {
                    allocUnits = firstLot.container_units_available
                }

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
        } catch (error: any) {
            toast.error('Failed to load material requirements', { description: error.message })
        } finally {
            setIsLoadingMaterials(false)
        }
    }

    useEffect(() => {
        if (!selectedRecipeId) {
            setIngredients([])
            setLots([])
            setAllocations([])
            return
        }
        loadMaterialPlan(selectedRecipeId, selectedBatchCount)
    }, [selectedRecipeId, selectedBatchCount])

    const applyMaterialIssue = async () => {
        if (ingredients.length === 0) {
            throw new Error('No raw materials found for selected recipe.')
        }

        const byInventory = new Map<string, { lot: InventoryLot; qty: number; containerUnits: number; materialName: string }>()
        const byGrnContainer = new Map<string, { grnId: string; units: number; available: number }>()
        const byGrnQty = new Map<string, { grnId: string; qty: number; netQty: number }>()
        const summaryRows: Array<{ material_name: string; grn: string; qty: number }> = []

        for (const ingredient of ingredients) {
            const rows = allocations.filter(a => a.material_id === ingredient.material_id)
            if (rows.length === 0) {
                throw new Error(`Allocation missing for ${ingredient.material_name}`)
            }

            const totalForMaterial = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
            if (totalForMaterial < ingredient.required_qty) {
                throw new Error(`Insufficient allocation for ${ingredient.material_name}. Required ${ingredient.required_qty.toFixed(2)} kg.`)
            }

            for (const row of rows) {
                if (!row.inventory_id) {
                    throw new Error(`Select GRN lot for ${ingredient.material_name}`)
                }
                if (Number(row.qty || 0) <= 0) {
                    throw new Error(`Allocated quantity must be greater than zero for ${ingredient.material_name}`)
                }

                const lot = lotsByInventoryId.get(row.inventory_id)
                if (!lot) {
                    throw new Error(`Selected lot is not valid anymore for ${ingredient.material_name}`)
                }

                const invEntry = byInventory.get(row.inventory_id) || {
                    lot,
                    qty: 0,
                    containerUnits: 0,
                    materialName: ingredient.material_name,
                }
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

                const grnEntry = byGrnQty.get(lot.grn_id) || {
                    grnId: lot.grn_id,
                    qty: 0,
                    netQty: lot.grn_net_qty,
                }
                grnEntry.qty += Number(row.qty)
                byGrnQty.set(lot.grn_id, grnEntry)

                summaryRows.push({
                    material_name: ingredient.material_name,
                    grn: lot.grn_no,
                    qty: Number(row.qty),
                })
            }
        }

        for (const { lot, qty } of byInventory.values()) {
            if (qty > lot.available_qty) {
                throw new Error(`Allocated qty exceeds availability for GRN ${lot.grn_no}`)
            }
            if (qty > lot.grn_net_qty) {
                throw new Error(`Allocated qty exceeds GRN net qty for ${lot.grn_no}`)
            }
        }

        for (const entry of byGrnContainer.values()) {
            if (entry.units > entry.available) {
                throw new Error('Allocated container units exceed available container count for one or more GRNs.')
            }
        }

        const nowIso = new Date().toISOString()

        for (const [inventoryId, entry] of byInventory.entries()) {
            const nextAvailable = Math.max(entry.lot.available_qty - entry.qty, 0)
            const { error } = await supabase
                .from('main_inventory')
                .update({ available_qty: nextAvailable, last_updated: nowIso })
                .eq('id', inventoryId)
            if (error) throw error
        }

        for (const entry of byGrnQty.values()) {
            const nextNetQty = Math.max(entry.netQty - entry.qty, 0)
            const { error } = await supabase
                .from('grns')
                .update({ net_qty: nextNetQty })
                .eq('id', entry.grnId)
            if (error) throw error
        }

        for (const entry of byGrnContainer.values()) {
            if (entry.units <= 0) continue
            const nextUnits = Math.max(entry.available - entry.units, 0)
            const { error } = await supabase
                .from('container_inventory')
                .update({ units: nextUnits })
                .eq('grn_id', entry.grnId)
            if (error) throw error
        }

        return summaryRows
    }

    const createSubBatchRows = async (values: any) => {
        const requestedCount = Math.max(1, Number(values.batch_count) || 1)
        const batchStamp = Date.now().toString().slice(-8)
        const masterBatchNo = `MB-${batchStamp}`
        const batchPrefix = `SB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`

        const { data: masterBatch, error: masterBatchError } = await supabase
            .from('master_batches')
            .insert({
                master_batch_no: masterBatchNo,
                sku_id: values.recipe_id,
                shift: values.shift,
                created_by: user?.id ?? null
            })
            .select('id, master_batch_no')
            .single()

        if (masterBatchError) throw masterBatchError

        const candidateStatuses = ['PENDING', 'IN_PROGRESS', 'CREATED', 'READY', 'OPEN', 'QUEUED', 'DRAFT']
        let insertedRows: Array<{ id: string; sub_batch_no: string }> | null = null
        let insertError: any = null

        for (const status of candidateStatuses) {
            const rows = Array.from({ length: requestedCount }, (_, index) => ({
                sub_batch_no: `${batchPrefix}-${Date.now().toString().slice(-6)}-${(index + 1).toString().padStart(2, '0')}`,
                master_batch_id: masterBatch.id,
                recipe_template_id: values.recipe_id,
                status,
                operator_id: user?.id ?? null
            }))

            const attempt = await supabase
                .from('sub_batches')
                .insert(rows)
                .select('id, sub_batch_no')

            if (!attempt.error) {
                insertedRows = attempt.data || []
                insertError = null
                break
            }

            insertError = attempt.error
            const msg = (attempt.error.message || '').toLowerCase()
            const isStatusConstraint = msg.includes('sub_batches_status_check') || msg.includes('invalid input value for enum')
            if (!isStatusConstraint) break
        }

        if (!insertedRows) {
            await supabase.from('master_batches').delete().eq('id', masterBatch.id)
            throw insertError || new Error('Unable to create sub-batch with compatible status value')
        }

        return {
            masterBatchNo: masterBatch.master_batch_no,
            insertedRows,
        }
    }

    const onStartBatch = async (values: any) => {
        if (!user?.id) {
            toast.error('You must be logged in to start a sub-batch.')
            return
        }

        setIsSubmitting(true)
        setAllocationResult(null)
        try {
            const selectedRecipe = recipes?.find((r: any) => r.id === values.recipe_id)
            const issuedSummary = await applyMaterialIssue()
            const created = await createSubBatchRows(values)

            setAllocationResult({
                batch_id: created.insertedRows?.[0]?.sub_batch_no || created.masterBatchNo,
                allocations: issuedSummary,
            })

            toast.success('Sub-batch started and raw materials issued', {
                description: `${created.insertedRows.length} run(s) created for ${selectedRecipe?.sku || 'selected recipe'}.`
            })

            // Redirect to Mixing Queue after a brief pause so user can see issued materials.
            setTimeout(() => router.push(WORKFLOW_SEQUENCE.afterSubBatchStart), 2000)
            refetchBatches()
        } catch (error: any) {
            toast.error('Failed to Start Batch', { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isMounted) return null

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-[#111827] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                
                {/* --- Page Header --- */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                        Production Execution
                    </h1>
                    <p className="text-base text-gray-500 max-w-2xl">
                        Select a recipe to initiate a new sub-batch run. The system will automatically allocate required materials via FEFO logic.
                    </p>
                </motion.div>

                <motion.div 
                    variants={fadeUpContainer}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12"
                >
                    {/* --- Execution Form (Left Column) --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-7">
                        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm h-full flex flex-col">
                            <div className="flex items-center gap-3 mb-8 border-b border-gray-100 pb-4">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <PlayCircle className="h-5 w-5" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold">Start Sub-Batch Run</h2>
                            </div>

                            <form onSubmit={form.handleSubmit(onStartBatch)} className="space-y-6 flex-grow flex flex-col">
                                <div className="space-y-2.5">
                                    <Label className="text-gray-700 font-semibold">Select Target Recipe / SKU</Label>
                                    <Select onValueChange={v => form.setValue('recipe_id', v)}>
                                        <SelectTrigger className="h-12 bg-gray-50/50 border-gray-200 focus:ring-black">
                                            <SelectValue placeholder="Choose SKU/Recipe" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {recipes?.map((r: any) => (
                                                <SelectItem key={r.id} value={r.id} className="cursor-pointer">
                                                    <span className="font-medium text-gray-900">{r.name}</span>
                                                    <span className="ml-2 text-gray-400 font-mono text-xs">({r.sku})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2.5">
                                        <Label className="text-gray-700 font-semibold">Number of Batches</Label>
                                        <Input 
                                            type="number" 
                                            className="h-12 bg-gray-50/50 border-gray-200 font-mono text-lg focus-visible:ring-black" 
                                            {...form.register('batch_count')} 
                                            min={1}
                                        />
                                    </div>

                                    <div className="space-y-2.5">
                                        <Label className="text-gray-700 font-semibold">Current Shift</Label>
                                        <Select onValueChange={v => form.setValue('shift', v)} defaultValue="A">
                                            <SelectTrigger className="h-12 bg-gray-50/50 border-gray-200 focus:ring-black">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="A">Shift A (Morning)</SelectItem>
                                                <SelectItem value="B">Shift B (Evening)</SelectItem>
                                                <SelectItem value="C">Shift C (Night)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-4 border border-gray-200 rounded-xl p-4 bg-gray-50/60">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">Raw Material Source Selection</h3>
                                        <p className="text-xs text-gray-500 mt-1">Choose GRN lots for each recipe item. Inventory is deducted immediately on sub-batch start.</p>
                                    </div>

                                    {isLoadingMaterials && (
                                        <div className="text-sm text-gray-500">Loading recipe materials and available lots...</div>
                                    )}

                                    {!isLoadingMaterials && selectedRecipeId && ingredients.length === 0 && (
                                        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                                            No recipe materials found for this SKU. Configure recipe items before starting production.
                                        </div>
                                    )}

                                    {!isLoadingMaterials && ingredients.map((ingredient) => {
                                        const rows = allocations.filter(a => a.material_id === ingredient.material_id)
                                        const allocatedQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
                                        const lotOptions = lots.filter(lot => lot.material_id === ingredient.material_id)

                                        return (
                                            <div key={ingredient.material_id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-semibold text-sm text-gray-900">{ingredient.material_name} <span className="text-xs text-gray-500">({ingredient.material_code})</span></p>
                                                        <p className="text-xs text-gray-500">Required: {ingredient.required_qty.toFixed(2)} kg</p>
                                                    </div>
                                                    <p className={`text-xs font-semibold ${allocatedQty >= ingredient.required_qty ? 'text-green-700' : 'text-amber-700'}`}>
                                                        Allocated: {allocatedQty.toFixed(2)} kg
                                                    </p>
                                                </div>

                                                {rows.map((row, rowIndex) => {
                                                    const selectedLot = row.inventory_id ? lotsByInventoryId.get(row.inventory_id) : undefined

                                                    return (
                                                        <div key={row.row_id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                                            <div className="md:col-span-6 space-y-1">
                                                                <Label className="text-xs">GRN Lot</Label>
                                                                <Select
                                                                    value={row.inventory_id}
                                                                    onValueChange={(inventoryId) => {
                                                                        const lot = lotsByInventoryId.get(inventoryId)
                                                                        setAllocationPatch(row.row_id, {
                                                                            inventory_id: inventoryId,
                                                                            grn_id: lot?.grn_id ?? '',
                                                                            container_units: 0,
                                                                        })
                                                                    }}
                                                                    disabled={lotOptions.length === 0}
                                                                >
                                                                    <SelectTrigger className="h-10 bg-white">
                                                                        <SelectValue placeholder="Select GRN lot" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {lotOptions.map((opt) => (
                                                                            <SelectItem key={opt.inventory_id} value={opt.inventory_id}>
                                                                                {opt.grn_no} | {opt.available_qty.toFixed(2)} kg | {opt.container_units_available} {opt.container_type}
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
                                                                    className="h-10"
                                                                    value={row.qty}
                                                                    onChange={(event) => setAllocationPatch(row.row_id, { qty: Number(event.target.value || 0) })}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-3 space-y-1">
                                                                <Label className="text-xs">Containers</Label>
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    className="h-10"
                                                                    value={row.container_units}
                                                                    onChange={(event) => setAllocationPatch(row.row_id, { container_units: Number(event.target.value || 0) })}
                                                                />
                                                                {selectedLot && (
                                                                    <p className="text-[11px] text-gray-500">Available: {selectedLot.container_units_available} {selectedLot.container_type}</p>
                                                                )}
                                                            </div>

                                                            <div className="md:col-span-1 flex items-end">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    className="h-10 w-full"
                                                                    disabled={rowIndex === 0 && rows.length === 1}
                                                                    onClick={() => removeSourceRow(row.row_id)}
                                                                >
                                                                    -
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}

                                                {lotOptions.length === 0 && (
                                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                                                        No allocatable GRN lots found for this material. Finalize the GRN in Stores or verify stock exists in main inventory.
                                                    </div>
                                                )}

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-9"
                                                    onClick={() => addSourceRow(ingredient.material_id)}
                                                    disabled={lotOptions.length === 0}
                                                >
                                                    Add Source Lot
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="mt-auto pt-8">
                                    <Button 
                                        type="submit" 
                                        className="w-full h-14 text-base font-semibold bg-black hover:bg-gray-800 text-white shadow-md transition-all group" 
                                        disabled={isSubmitting || isLoadingMaterials || !selectedRecipeId || ingredients.length === 0}
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="animate-spin h-5 w-5" />
                                        ) : (
                                            <>Verify Recipe & Allocate <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </motion.div>

                    {/* --- Allocation Summary (Right Column) --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-5">
                        <div className="bg-[#F8F9FA] border border-gray-200 rounded-2xl p-6 sm:p-8 h-full relative overflow-hidden">
                            {/* Decorative background grid */}
                            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(#000_1px,transparent_1px),linear-gradient(90deg,#000_1px,transparent_1px)] bg-[size:20px_20px]"></div>
                            
                            <div className="flex items-center gap-3 mb-8 relative z-10">
                                <div className="p-2 bg-white border border-gray-200 rounded-lg text-gray-700 shadow-sm">
                                    <Layers className="h-5 w-5" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold">FEFO Allocation</h2>
                            </div>

                            <div className="relative z-10 h-[calc(100%-4rem)]">
                                <AnimatePresence mode="wait">
                                    {!allocationResult ? (
                                        <motion.div 
                                            key="empty"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="h-full flex flex-col items-center justify-center text-center px-4"
                                        >
                                            <Box className="h-12 w-12 text-gray-300 mb-4" strokeWidth={1} />
                                            <p className="text-gray-500 font-medium">Awaiting Execution</p>
                                            <p className="text-sm text-gray-400 mt-2 max-w-[250px]">
                                                Once the batch starts, First-Expiry-First-Out (FEFO) material reservations will appear here.
                                            </p>
                                        </motion.div>
                                    ) : (
                                        <motion.div 
                                            key="result"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="space-y-6"
                                        >
                                            <div className="bg-white border border-green-200 rounded-xl p-5 shadow-sm">
                                                <div className="flex items-start gap-3">
                                                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                                                    <div>
                                                        <h3 className="font-bold text-green-900">Reservation Confirmed</h3>
                                                        <div className="mt-2 text-sm text-gray-600">
                                                            <span className="block text-xs uppercase tracking-wider text-gray-400 mb-1">Generated Batch ID</span>
                                                            <span className="font-mono font-bold text-black bg-gray-100 px-2 py-1 rounded">
                                                                {allocationResult.batch_id}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                                                    Reserved Materials 
                                                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{allocationResult.allocations?.length || 0}</span>
                                                </h4>
                                                
                                                {/* Digital Receipt Styling for GRNs */}
                                                <div className="bg-white border border-gray-200 rounded-lg p-1 max-h-[220px] overflow-y-auto custom-scrollbar">
                                                    {allocationResult.allocations?.map((a: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center p-3 border-b border-dashed border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] text-gray-600 font-semibold">{a.material_name}</span>
                                                                <span className="text-[10px] text-gray-400 font-semibold uppercase">GRN Lot</span>
                                                                <span className="font-mono text-sm text-gray-900">{a.grn}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-mono font-bold text-black">{a.qty}</span>
                                                                <span className="text-xs text-gray-500 ml-1">kg</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-center text-gray-400 pt-2 animate-pulse">Redirecting to mixing floor...</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* --- Recent Batches Table --- */}
                <motion.div variants={fadeUpItem}>
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <Factory className="h-5 w-5 text-gray-400" />
                                <h3 className="font-bold text-lg">Recent Sub-Batches</h3>
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-500 bg-white">
                                        <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Batch Reference</th>
                                        <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Product SKU</th>
                                        <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {recentBatches.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                                No batches have been initiated today.
                                            </td>
                                        </tr>
                                    ) : (
                                        recentBatches.map((batch) => (
                                            <tr key={batch.id} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-6 py-4 font-mono font-medium text-gray-900">
                                                    {batch.sub_batch_no || batch.id.slice(0, 8).toUpperCase()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-medium text-gray-700">{batch.sku}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                                                        batch.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                        batch.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {batch.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-500 font-mono text-xs">
                                                    {new Date(batch.created_at).toLocaleString('en-US', {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </motion.div>
                
            </div>
            
            {/* Minimalist scrollbar styles for the FEFO box */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #E5E7EB;
                    border-radius: 20px;
                }
            `}</style>
        </div>
    )
}