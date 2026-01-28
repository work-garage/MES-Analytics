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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, Flame } from 'lucide-react'

export default function BakingPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Oven Controls...</div>}>
            <BakingContent />
        </Suspense>
    )
}

function BakingContent() {
    const supabase = createClient()
    const { user } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Recent Baking Logs
    const { data: recentLogs, refetch: refetchLogs } = useQuery({
        queryKey: ['baking-logs'],
        queryFn: async () => {
            const { data } = await supabase.from('baking_process_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            machine_id: 'OVEN-01',
            gauge_setting: 0,
            moisture: 0,
            sample_weight: 0,
            color: 'GOLDEN',
            taste: 'OK',
            decision: 'PASS'
        }
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            const { error } = await supabase.rpc('rpc_log_baking', {
                p_machine_id: values.machine_id,
                p_gauge_setting: Number(values.gauge_setting),
                p_moisture_pct: Number(values.moisture),
                p_sample_weight: Number(values.sample_weight),
                p_color_rating: values.color,
                p_taste_check: values.taste,
                p_result: values.decision,
                p_user_id: user?.id
            })

            if (error) throw error
            toast.success("Baking Check Logged")
            form.reset({ ...values, moisture: 0, sample_weight: 0 }) // Keep machine settings, reset measurements
            refetchLogs()

        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Baking Oven Control</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Form Card */}
                <Card className="md:col-span-2">
                    <CardHeader><CardTitle className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-600" /> Process Check</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Oven ID</Label>
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
                                                    <SelectItem value="OVEN-01">Oven Line 1</SelectItem>
                                                    <SelectItem value="OVEN-02">Oven Line 2</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Gauge Setting (mm)</Label>
                                    <Input type="number" step="0.1" {...form.register('gauge_setting', { valueAsNumber: true })} />
                                </div>
                            </div>

                            <Separator />
                            <h3 className="font-medium text-sm text-slate-500">Quality Checks (Post-Bake)</h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Moisture (%)</Label>
                                    <Input type="number" step="0.1" {...form.register('moisture', { valueAsNumber: true })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Ascot Wt (10pc) (g)</Label>
                                    <Input type="number" step="0.1" {...form.register('sample_weight', { valueAsNumber: true })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Color</Label>
                                    <Controller
                                        control={form.control}
                                        name="color"
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PALE">Pale / Under</SelectItem>
                                                    <SelectItem value="GOLDEN">Golden / OK</SelectItem>
                                                    <SelectItem value="DARK">Dark / Over</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Taste/Texture</Label>
                                    <Controller
                                        control={form.control}
                                        name="taste"
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OK">Crisp / OK</SelectItem>
                                                    <SelectItem value="SOFT">Soft / Damp</SelectItem>
                                                    <SelectItem value="BURNT">Burnt</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <Label className="mb-2 block">Final Decision</Label>
                                <Controller
                                    control={form.control}
                                    name="decision"
                                    render={({ field }) => (
                                        <div className="flex gap-4">
                                            {['PASS', 'ADJUST', 'HOLD'].map((type) => (
                                                <div key={type} className="flex items-center space-x-2 border p-3 rounded cursor-pointer hover:bg-slate-50"
                                                    onClick={() => field.onChange(type)}>
                                                    <input type="radio" value={type} checked={field.value === type} readOnly className="h-4 w-4" />
                                                    <span className="text-sm font-bold">{type}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                />
                            </div>

                            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : "Log Check"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Recent Logs List */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader><CardTitle className="text-base">Recent Logs</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {recentLogs?.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm italic">No logs today.</div>
                                ) : (
                                    recentLogs?.map((log: any) => (
                                        <div key={log.id} className="p-3 border rounded bg-slate-50 text-sm">
                                            <div className="flex justify-between font-bold mb-1">
                                                <span>{log.machine_id}</span>
                                                <span className={log.result === 'PASS' ? 'text-green-600' : 'text-orange-600'}>{log.result}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                                <div>Moisture: {log.moisture_pct}%</div>
                                                <div>Color: {log.color_rating}</div>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-2 text-right">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    )
}
