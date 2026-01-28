'use client'

import { useState, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, PackageOpen } from 'lucide-react'

import PhotoCapture from '@/components/business/PhotoCapture'
import { useRouter } from 'next/navigation'

export default function PackingPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Packing Station...</div>}>
            <PackingContent />
        </Suspense>
    )
}

function PackingContent() {
    const router = useRouter()
    const supabase = createClient()
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Recent Packing Logs
    const { data: recentLogs, refetch: refetchLogs } = useQuery({
        queryKey: ['packing-logs'],
        queryFn: async () => {
            const { data } = await supabase.from('packing_process_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            machine_id: 'PACK-01',
            sku: 'MARIE-100g',
            packs_produced: 0,
            wrapper_usage: 0,
            waste_kg: 0,
            md_reject_count: 0,
            md_reject_disposition: '',
            md_reject_photo: null
        }
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            let photoPath = null
            if (values.md_reject_photo) {
                photoPath = `md-rejects/${Date.now()}.jpg`
                await supabase.storage.from('production-photos').upload(photoPath, values.md_reject_photo)
            }

            const { error } = await supabase.rpc('rpc_log_packing', {
                p_machine_id: values.machine_id,
                p_sku: values.sku,
                p_packs_produced: Number(values.packs_produced),
                p_wrapper_usage: Number(values.wrapper_usage),
                p_waste_kg: Number(values.waste_kg),
                p_user_id: user?.id,
                p_md_reject_count: Number(values.md_reject_count || 0),
                p_md_reject_disposition: values.md_reject_disposition,
                p_md_reject_photo: photoPath
            })
            if (error) throw error
            toast.success("Packing Log Saved")
            form.reset({
                ...values,
                packs_produced: 0,
                wrapper_usage: 0,
                waste_kg: 0
            })
            refetchLogs()
            // Redirect to FG Batch
            setTimeout(() => router.push('/production/fg-batch'), 1500)
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Input Form */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PackageOpen className="h-5 w-5 text-blue-600" />
                        Packing Station Log
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Machine ID</Label>
                                <Controller
                                    control={form.control}
                                    name="machine_id"
                                    render={({ field }) => (
                                        <Select
                                            value={field.value}
                                            onValueChange={field.onChange}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PACK-01">Packer 01</SelectItem>
                                                <SelectItem value="PACK-02">Packer 02</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>SKU</Label>
                                <Controller
                                    control={form.control}
                                    name="sku"
                                    render={({ field }) => (
                                        <Select
                                            value={field.value}
                                            onValueChange={field.onChange}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MARIE-100g">Marie Gold 100g</SelectItem>
                                                <SelectItem value="MARIE-300g">Marie Gold 300g</SelectItem>
                                                <SelectItem value="CREAM-100g">Cream Cracker 100g</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Total Packs Produced</Label>
                            <Input type="number" {...form.register('packs_produced', { valueAsNumber: true })} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Wrapper Usage (m)</Label>
                                <Input type="number" step="0.1" {...form.register('wrapper_usage', { valueAsNumber: true })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Wrapper Waste (kg)</Label>
                                <Input type="number" step="0.01" {...form.register('waste_kg', { valueAsNumber: true })} />
                            </div>
                        </div>


                        {/* MD Rejects Section */}
                        <div className="border-t pt-4 mt-4 space-y-4">
                            <h3 className="font-semibold text-sm">Metal Detector Rejects</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Reject Count</Label>
                                    <Input type="number" {...form.register('md_reject_count', { valueAsNumber: true })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Disposition</Label>
                                    <Controller
                                        control={form.control}
                                        name="md_reject_disposition"
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SCRAP">Scrap</SelectItem>
                                                    <SelectItem value="REWORK">Rework</SelectItem>
                                                    <SelectItem value="INVESTIGATE">Investigate</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                            </div>
                            <Controller
                                control={form.control}
                                name="md_reject_photo"
                                render={({ field }) => (
                                    <PhotoCapture
                                        label="Reject Photo (if any)"
                                        onCapture={field.onChange}
                                    />
                                )}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "End Shift Log"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Recent Logs List */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Packing Logs</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {recentLogs?.length === 0 ? (
                            <div className="text-center text-slate-500 text-sm italic">No packing logs found.</div>
                        ) : (
                            recentLogs?.map((log: any) => (
                                <div key={log.id} className="p-3 border rounded bg-slate-50 hover:bg-white text-sm">
                                    <div className="flex justify-between font-bold mb-1">
                                        <span>{log.sku_id}</span>{/* Assuming sku_id stores the SKU text logic from RPC */}
                                        <span className="text-blue-600">{log.packs_produced} packs</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-600">
                                        <span>Machine: {log.machine_id}</span>
                                        <span>Waste: {log.wrapper_waste_kg} kg</span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-2 text-right">
                                        {new Date(log.created_at).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div >
    )
}
