'use client'

import { useState, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, PlayCircle, Layers } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

export default function SubBatchPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading...</div>}>
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

    const onStartBatch = async (values: any) => {
        setIsSubmitting(true)
        setAllocationResult(null)
        try {
            const selectedRecipe = recipes?.find((r: any) => r.id === values.recipe_id)

            const { data, error } = await supabase.rpc('rpc_create_sub_batch', {
                p_recipe_template_id: values.recipe_id,
                p_sku: selectedRecipe?.sku,
                p_shift: values.shift,
                p_batch_count: Number(values.batch_count),
                p_operator_id: user?.id
            })

            if (error) throw error

            setAllocationResult(data)
            toast.success("Batches Created & Materials Reserved")
            // Redirect to Mixing Queue
            setTimeout(() => router.push('/production/mixing'), 1500)
            refetchBatches() // Refresh list

        } catch (error: any) {
            toast.error("Failed to Start Batch", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Production Execution</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PlayCircle className="h-5 w-5 text-blue-600" />
                            Start Sub-Batch
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={form.handleSubmit(onStartBatch)} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Recipe</Label>
                                <Select onValueChange={v => form.setValue('recipe_id', v)}>
                                    <SelectTrigger><SelectValue placeholder="Choose SKU/Recipe" /></SelectTrigger>
                                    <SelectContent>
                                        {recipes?.map((r: any) => (
                                            <SelectItem key={r.id} value={r.id}>{r.name} ({r.sku})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Number of Batches</Label>
                                <Input type="number" {...form.register('batch_count')} />
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

                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : "Verify & Allocate"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Allocation Summary */}
                <Card className="bg-slate-50 border-dashed">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-600">Allocation Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!allocationResult ? (
                            <div className="text-center text-slate-400 py-8 italic">
                                Select recipe to see FEFO allocation
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Alert className="bg-green-50 border-green-200">
                                    <Layers className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-800">Reservation Successful</AlertTitle>
                                    <AlertDescription className="text-green-700">
                                        Batch ID: <span className="font-mono">{allocationResult.batch_id}</span>
                                    </AlertDescription>
                                </Alert>

                                <div className="space-y-2">
                                    <Label>GRNs Allocated (FEFO)</Label>
                                    <div className="border rounded bg-white p-2 text-sm max-h-48 overflow-y-auto">
                                        {allocationResult.allocations?.map((a: any, i: number) => (
                                            <div key={i} className="flex justify-between py-1 border-b last:border-0">
                                                <span>{a.grn}</span>
                                                <span className="font-mono font-bold">{a.qty} kg</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Batches List */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Sub-Batches</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 font-medium">Batch No</th>
                                    <th className="p-3 font-medium">SKU</th>
                                    <th className="p-3 font-medium">Status</th>
                                    <th className="p-3 font-medium">Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentBatches.length === 0 ? (
                                    <tr><td colSpan={4} className="p-4 text-center text-slate-500">No recent batches found.</td></tr>
                                ) : (
                                    recentBatches.map((batch) => (
                                        <tr key={batch.id} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="p-3 font-mono">{batch.sub_batch_no || batch.id.slice(0, 8)}</td>
                                            <td className="p-3">{batch.sku}</td>
                                            <td className="p-3"><span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-bold">{batch.status}</span></td>
                                            <td className="p-3 text-slate-500">{new Date(batch.created_at).toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
