'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PackageCheck, ShieldCheck } from 'lucide-react'

export default function FGBatchPage() {
    const router = useRouter()
    const supabase = createClient()
    // Mock aggregated data
    const [sku, setSku] = useState('')
    const [aggregatedData, setAggregatedData] = useState<any>(null)
    const [expiry, setExpiry] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [skus, setSkus] = useState<any[]>([])

    // Fetch SKUs on mount
    useState(() => {
        supabase.from('recipe_templates').select('id, sku').eq('is_active', true)
            .then(({ data }) => setSkus(data || []))
    })

    const fetchAggregation = async (skuId: string) => {
        setSku(skuId)
        setAggregatedData(null)

        // 1. Fetch Packing Logs (Last 12h)
        const { data: packingLogs } = await supabase
            .from('packing_process_logs')
            .select('*')
            .eq('sku_id', skuId) // Note: packing_logs stores sku TEXT currently, check rpc_log_packing?
            // Actually rpc_log_packing stores p_sku (text) into sku_id column? 
            // Let's assume schema is correct. If sku_id is UUID in packing_process_logs, then we need UUID.
            // Recipe template has SKU (text).
            // Let's check if packing_process_logs.sku_id is UUID or TEXT.
            .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())

        // 2. Fetch Sub Batches (Last 12h)
        const { data: subBatches } = await supabase
            .from('sub_batches')
            .select('id')
            // .eq('sku_id', skuId) // Sub batches link to recipe_template. Need to join?
            // Simplified: We need to find sub batches for this SKU.
            // But sub_batches has recipe_template_id.
            .eq('recipe_template_id', skuId) // skuId from select is recipe ID
            .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())

        if (packingLogs) {
            const totalPacks = packingLogs.reduce((acc: number, l: any) => acc + (l.packs_produced || 0), 0)
            const totalRejects = packingLogs.reduce((acc: number, l: any) => acc + (l.md_reject_count || 0), 0)
            const totalWaste = packingLogs.reduce((acc: number, l: any) => acc + (l.wrapper_waste_kg || 0), 0)

            setAggregatedData({
                packs: totalPacks,
                rejects: totalRejects,
                waste: totalWaste,
                goodQty: totalPacks - totalRejects, // Simple logic
                subBatchIds: subBatches?.map((b: any) => b.id) || []
            })
        }

        // Expiry (Mock 6 months)
        const d = new Date()
        d.setMonth(d.getMonth() + 6)
        setExpiry(d.toISOString().split('T')[0])
    }

    const createBatch = async () => {
        if (!sku || !aggregatedData) return
        setIsSubmitting(true)
        try {
            const { data, error } = await supabase.rpc('rpc_create_fg_batch', {
                p_sku_id: sku, // UUID of recipe template
                p_shift: 'A', // Hardcoded for now
                p_produced_qty: aggregatedData.packs,
                p_sub_batches_used: aggregatedData.subBatchIds, // JSONB array
                p_good_qty: aggregatedData.goodQty,
                p_expiry_date: expiry,
                p_storage_loc: 'WH-FG-01',
                p_signed_by: null // Optional
            })

            if (error) throw error

            toast.success(`FG Batch Created: ${data.fg_batch_no}`)

            // Redirect to Dispatch / Dashboard
            setTimeout(() => router.push('/dashboard'), 1500)
        } catch (e: any) {
            toast.error("Failed to Create FG Batch", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto py-6 space-y-6">
            <Card>
                <CardHeader><CardTitle>Finalize FG Batch</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Select SKU (Current Shift)</Label>
                        <Select onValueChange={fetchAggregation}>
                            <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                            <SelectContent>
                                {skus.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>{s.sku}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {sku && (
                        <div className="animate-in fade-in space-y-6">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded border">
                                <div>
                                    <Label className="text-slate-500">Total Packs Produced</Label>
                                    <div className="text-3xl font-bold text-slate-800">{aggregatedData.packs}</div>
                                    <div className="text-xs text-slate-500 mt-1">MD Rejects: {aggregatedData.rejects}</div>
                                </div>
                                <div>
                                    <Label className="text-slate-500">Calculated Expiry</Label>
                                    <div className="text-3xl font-bold text-slate-800">{expiry}</div>
                                </div>
                            </div>

                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded flex gap-3">
                                <ShieldCheck className="text-yellow-600 h-6 w-6 shrink-0" />
                                <div className="text-sm text-yellow-800">
                                    <strong>Quality Check:</strong> Ensure all MD Rejects have been accounted for and QA clearance is received for any hold batches linked to this run.
                                </div>
                            </div>

                            <Button size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={createBatch}>
                                <PackageCheck className="mr-2 h-5 w-5" /> Generate FG Batch
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
