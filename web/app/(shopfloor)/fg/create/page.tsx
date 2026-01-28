'use client'

import { useState, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, PackageCheck } from 'lucide-react'

export default function FGBatchPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Batch System...</div>}>
            <FGBatchContent />
        </Suspense>
    )
}

function FGBatchContent() {
    const supabase = createClient()
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [stats, setStats] = useState<any>(null)

    // Fetch Recent Batches
    const { data: recentBatches, refetch: refetchBatches } = useQuery({
        queryKey: ['fg-batches'],
        queryFn: async () => {
            const { data } = await supabase.from('fg_batches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            sku: 'MARIE-100g', // Default for easier testing
            shift: 'A',
            batch_no: `FG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`,
            expiry_date: ''
        }
    })

    const onGenerate = async (values: any) => {
        setIsSubmitting(true)
        try {
            const { data, error } = await supabase.rpc('rpc_create_fg_batch', {
                p_sku: values.sku,
                p_shift: values.shift,
                p_batch_no: values.batch_no,
                p_mfg_date: new Date().toISOString(),
                p_expiry_date: values.expiry_date ? new Date(values.expiry_date).toISOString() : null,
                p_operator_id: user?.id
            })

            if (error) throw error

            setStats(data)
            toast.success(`FG Batch Created: ${data.packs} packs`)
            refetchBatches()

        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Creation Form */}
            <Card className="bg-green-50/20 border-green-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                        <PackageCheck className="h-5 w-5" />
                        Create Finished Goods Batch
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!stats ? (
                        <form onSubmit={form.handleSubmit(onGenerate)} className="space-y-4">
                            <div className="alert bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">
                                This will aggregate all recent Packing Logs for this SKU/Shift.
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>SKU Code</Label>
                                    <Select
                                        defaultValue={form.getValues('sku')}
                                        onValueChange={v => form.setValue('sku', v)}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MARIE-100g">Marie Gold 100g</SelectItem>
                                            <SelectItem value="MARIE-300g">Marie Gold 300g</SelectItem>
                                            <SelectItem value="CREAM-100g">Cream Cracker 100g</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Shift</Label>
                                    <Select onValueChange={v => form.setValue('shift', v)} defaultValue="A">
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="A">Shift A</SelectItem>
                                            <SelectItem value="B">Shift B</SelectItem>
                                            <SelectItem value="C">Shift C</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Batch Number</Label>
                                <Input {...form.register('batch_no')} />
                            </div>

                            <div className="space-y-2">
                                <Label>Expiry Date</Label>
                                <Input type="date" {...form.register('expiry_date')} />
                            </div>

                            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : "Aggregate & Create Batch"}
                            </Button>
                        </form>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="text-4xl font-bold text-green-700">{stats.packs} Packs</div>
                            <p className="text-slate-500">Successfully Batched</p>
                            <Button variant="outline" onClick={() => { setStats(null); form.reset(); }}>Create Another</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Batches List */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent FG Batches</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {recentBatches?.length === 0 ? (
                            <div className="text-center text-slate-500 text-sm italic">No batches created today.</div>
                        ) : (
                            recentBatches?.map((batch: any) => (
                                <div key={batch.id} className="p-3 border rounded bg-white hover:bg-slate-50 text-sm">
                                    <div className="flex justify-between font-bold mb-1">
                                        <span>{batch.batch_no}</span>
                                        <span className="text-green-600">{batch.quantity_units} units</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-600">
                                        <span>SKU: {batch.sku_code}</span>
                                        <span>{batch.quantity_kg} kg</span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-2 text-right">
                                        Exp: {new Date(batch.expiry_date).toLocaleDateString()}
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
