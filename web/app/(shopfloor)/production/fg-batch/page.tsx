'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PackageCheck, ShieldCheck } from 'lucide-react'
import { WORKFLOW_SEQUENCE } from '@/lib/workflow/sequence'

type SKUOption = { id: string; sku: string; name: string | null }

type AggregatedData = {
    packs: number
    rejects: number
    waste: number
    goodQty: number
    subBatchIds: string[]
}

type RecipeIngredient = {
    material_name: string
    material_code: string
    shelf_life_days: number
}

const formatDateOnly = (date: Date) => date.toISOString().split('T')[0]

function expiryFromShelfLife(items: RecipeIngredient[]) {
    const shelfLives = items
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
    const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
    const [manualProducedPacks, setManualProducedPacks] = useState(0)
    const [manualGoodPacks, setManualGoodPacks] = useState(0)
    const [usedGlobalPackingFallback, setUsedGlobalPackingFallback] = useState(false)

    useEffect(() => {
        supabase
            .from('recipe_templates')
            .select('id, sku, name')
            .eq('is_active', true)
            .then(({ data }) => setSkus((data || []) as SKUOption[]))
    }, [])

    const fetchBatchContext = async (selectedSkuId: string) => {
        setSkuId(selectedSkuId)
        setAggregatedData(null)
        setIngredients([])
        setIsLoadingData(true)

        try {
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

            const [{ data: packingLogsBySku }, { data: subBatches }, { data: recipeItems, error: itemsError }] = await Promise.all([
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
                    .select('materials(name, material_code, shelf_life_days)')
                    .eq('template_id', selectedSkuId),
            ])

            if (itemsError) throw itemsError

            let effectivePackingLogs = packingLogsBySku || []
            let fallbackUsed = false

            const packsBySku = effectivePackingLogs.reduce((sum: number, row: any) => sum + Number(row.packs_produced || 0), 0)
            if (packsBySku <= 0) {
                const { data: allPackingLogs } = await supabase
                    .from('packing_process_logs')
                    .select('packs_produced, md_reject_count, wrapper_waste_kg')
                    .gt('created_at', twelveHoursAgo)
                if ((allPackingLogs || []).length > 0) {
                    effectivePackingLogs = allPackingLogs || []
                    fallbackUsed = true
                }
            }

            const normalizedIngredients: RecipeIngredient[] = (recipeItems || []).map((item: any) => ({
                material_name: item.materials?.name ?? 'Unknown',
                material_code: item.materials?.material_code ?? '',
                shelf_life_days: Number(item.materials?.shelf_life_days || 0),
            }))
            setIngredients(normalizedIngredients)

            const totalPacks = effectivePackingLogs.reduce((sum: number, row: any) => sum + Number(row.packs_produced || 0), 0)
            const totalRejects = effectivePackingLogs.reduce((sum: number, row: any) => sum + Number(row.md_reject_count || 0), 0)
            const totalWaste = effectivePackingLogs.reduce((sum: number, row: any) => sum + Number(row.wrapper_waste_kg || 0), 0)

            setUsedGlobalPackingFallback(fallbackUsed)
            setAggregatedData({
                packs: totalPacks,
                rejects: totalRejects,
                waste: totalWaste,
                goodQty: Math.max(totalPacks - totalRejects, 0),
                subBatchIds: (subBatches || []).map((batch: any) => batch.id),
            })

            setManualProducedPacks(totalPacks)
            setManualGoodPacks(Math.max(totalPacks - totalRejects, 0))
            setExpiry(expiryFromShelfLife(normalizedIngredients))
        } catch (error: any) {
            toast.error('Failed to load FG context', { description: error.message })
        } finally {
            setIsLoadingData(false)
        }
    }

    const createBatch = async () => {
        if (!skuId || !aggregatedData) {
            toast.error('Select SKU and wait for context load.')
            return
        }

        if (aggregatedData.subBatchIds.length === 0) {
            toast.error('No sub-batches found for this SKU. Start Sub-Batch Run first.')
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

            toast.success(`FG Batch Created: ${data?.fg_batch_no || 'Success'}`)
            setTimeout(() => router.push(WORKFLOW_SEQUENCE.afterFgBatchSubmit), 1200)
        } catch (error: any) {
            toast.error('Failed to Create FG Batch', { description: error.message })
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
                                    {skus.map(sku => (
                                        <SelectItem key={sku.id} value={sku.id}>{sku.name || sku.sku}</SelectItem>
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
                            Loading packing output and sub-batch linkage...
                        </div>
                    )}

                    {skuId && aggregatedData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded border">
                                <div>
                                    <Label className="text-slate-500">Total Packs Produced</Label>
                                    <div className="text-3xl font-bold text-slate-800">{aggregatedData.packs}</div>
                                    <div className="text-xs text-slate-500 mt-1">MD Rejects: {aggregatedData.rejects}</div>
                                </div>
                                <div>
                                    <Label className="text-slate-500">Calculated Expiry</Label>
                                    <div className="text-3xl font-bold text-slate-800">{expiry}</div>
                                    <div className="text-xs text-slate-500 mt-1">From recipe shelf-life baseline</div>
                                </div>
                            </div>

                            {usedGlobalPackingFallback && (
                                <div className="p-3 text-sm bg-blue-50 border border-blue-200 rounded text-blue-800">
                                    SKU-specific packing logs were empty, so we used total output from the last 12 hours. Adjust values below before finalizing.
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border rounded p-4">
                                <div className="space-y-1">
                                    <Label className="text-xs">Produced Packs (Final)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={manualProducedPacks}
                                        onChange={event => setManualProducedPacks(Number(event.target.value || 0))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Good Packs (After Rejects)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={manualGoodPacks}
                                        onChange={event => setManualGoodPacks(Number(event.target.value || 0))}
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded flex gap-3">
                                <ShieldCheck className="text-yellow-600 h-6 w-6 shrink-0" />
                                <div className="text-sm text-yellow-800">
                                    <strong>Raw materials are issued at Sub-Batch start:</strong> FG finalization only records finished output, expiry, and sub-batch linkage.
                                </div>
                            </div>

                            <div className="border rounded p-4 bg-white">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Recipe Materials</div>
                                {ingredients.length === 0 ? (
                                    <div className="text-sm text-slate-500">No recipe material metadata found for this SKU.</div>
                                ) : (
                                    <div className="space-y-1 text-sm">
                                        {ingredients.map((item, index) => (
                                            <div key={`${item.material_code}-${index}`} className="flex items-center justify-between">
                                                <span>{item.material_name} <span className="text-slate-400">({item.material_code})</span></span>
                                                <span className="text-slate-500">Shelf life: {item.shelf_life_days || 0} days</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button
                                size="lg"
                                className="w-full bg-green-600 hover:bg-green-700"
                                onClick={createBatch}
                                disabled={isSubmitting || manualProducedPacks <= 0}
                            >
                                <PackageCheck className="mr-2 h-5 w-5" /> {isSubmitting ? 'Generating...' : 'Generate FG Batch'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}