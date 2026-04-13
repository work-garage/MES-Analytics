'use client'

import { useState, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, Scissors, Scale } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PhotoCapture from '@/components/business/PhotoCapture'
import { useRouter } from 'next/navigation'
import { WORKFLOW_SEQUENCE } from '@/lib/workflow/sequence'

export default function CuttingPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Cutting Station...</div>}>
            <CuttingContent />
        </Suspense>
    )
}

function CuttingContent() {
    const router = useRouter()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const hasPersistedSample = async (stackType: string, weight: number) => {
        const windowStartIso = new Date(Date.now() - 2 * 60 * 1000).toISOString()
        const { data, error } = await supabase
            .from('cutting_logs')
            .select('id, stack_type, weight, created_at')
            .eq('stack_type', stackType)
            .gte('created_at', windowStartIso)
            .order('created_at', { ascending: false })
            .limit(10)

        if (error) throw error

        return (data || []).some((row: any) => Math.abs(Number(row.weight || 0) - weight) <= 0.01)
    }

    const tryFallbackInsert = async (stackType: string, weight: number, photoPath: string | null) => {
        const richAttempt = await supabase
            .from('cutting_logs')
            .insert({
                machine_id: 'CUTTER-01',
                stack_type: stackType,
                weight,
                rpm,
                photo: photoPath,
            })

        if (!richAttempt.error) return

        const minimalAttempt = await supabase
            .from('cutting_logs')
            .insert({
                stack_type: stackType,
                weight,
            })

        if (minimalAttempt.error) {
            throw minimalAttempt.error
        }
    }

    // Sample Form
    const sampleForm = useForm({
        defaultValues: {
            stack_type: '',
            weight: undefined,
            photo: undefined,
        }
    })

    // Capacity Calculator State
    const [rpm, setRpm] = useState(0)
    const [runMins, setRunMins] = useState(0)

    const biscuitsPerRev = 12 // Master data mock
    const expectedProd = rpm * biscuitsPerRev * runMins

    // Fetch Recent Samples
    const { data: recentSamples, refetch: refetchSamples } = useQuery({
        queryKey: ['cutting-samples'],
        queryFn: async () => {
            const { data } = await supabase.from('cutting_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
            return data || []
        }
    })

    const onLogSample = async (values: any) => {
        setIsSubmitting(true)
        try {
            let photoPath = null
            if (values.photo) {
                photoPath = `cutting-samples/${Date.now()}.jpg`
                const { error: photoError } = await supabase.storage.from('production-photos').upload(photoPath, values.photo)
                if (photoError) throw photoError
            }

            const sampleWeight = Number(values.weight)
            const sampleStackType = String(values.stack_type || '')

            const { error } = await supabase.rpc('rpc_log_cutting_sample', {
                p_machine_id: 'CUTTER-01', // Hardcoded for prototype
                p_stack_type: sampleStackType,
                p_weight: sampleWeight,
                p_photo: photoPath,
                p_rpm: rpm
            })

            if (error) throw error

            const persistedAfterRpc = await hasPersistedSample(sampleStackType, sampleWeight)
            if (!persistedAfterRpc) {
                await tryFallbackInsert(sampleStackType, sampleWeight, photoPath)
            }

            const persistedAfterFallback = await hasPersistedSample(sampleStackType, sampleWeight)
            if (!persistedAfterFallback) {
                throw new Error('Cutting sample did not persist to cutting_logs, so supervisor coverage would stay stale.')
            }

            toast.success("Sample Logged")
            // Redirect to Oven stage next in production sequence.
            setTimeout(() => router.push(WORKFLOW_SEQUENCE.afterCuttingSubmit), 1500)
            sampleForm.reset()
            refetchSamples()
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Cutting Station</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LEFT: Capacity Tool */}
                <div className="space-y-6">
                    <Card className="bg-slate-50 border-blue-200">
                        <CardHeader><CardTitle className="text-blue-800 flex items-center gap-2"><Scissors className="h-5 w-5" /> Capacity Monitor</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label>Current RPM</Label>
                                    <Input type="number" value={rpm} onChange={e => setRpm(Number(e.target.value))} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Running Mins</Label>
                                    <Input type="number" value={runMins} onChange={e => setRunMins(Number(e.target.value))} />
                                </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <span className="text-xs text-slate-500 uppercase">Rate (biscuit/min)</span>
                                    <div className="text-xl font-mono font-bold text-slate-800">
                                        {(rpm * biscuitsPerRev).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 uppercase">Expected Output</span>
                                    <div className="text-xl font-mono font-bold text-green-700">
                                        {expectedProd.toLocaleString()} pcs
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Samples List */}
                    <Card>
                        <CardHeader><CardTitle className="text-base">Recent Quality Checks</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {recentSamples?.map((s: any) => (
                                    <div key={s.id} className="flex justify-between items-center text-sm p-2 border-b last:border-0">
                                        <div>
                                            <div className="font-medium">{s.stack_type}</div>
                                            <div className="text-xs text-slate-500">{new Date(s.created_at).toLocaleTimeString()}</div>
                                        </div>
                                        <div className="font-mono font-bold">{s.weight}g</div>
                                    </div>
                                ))}
                                {recentSamples?.length === 0 && <div className="text-slate-500 italic text-sm">No samples today.</div>}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Quality Sampling */}
                <div>
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Quality Sampling</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={sampleForm.handleSubmit(onLogSample)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Stack Type</Label>
                                    <Controller
                                        control={sampleForm.control}
                                        name="stack_type"
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value || ''}>
                                                <SelectTrigger><SelectValue placeholder="Select Area" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="WORKING_L">Working Side L</SelectItem>
                                                    <SelectItem value="WORKING_R">Working Side R</SelectItem>
                                                    <SelectItem value="REWORK">Rework</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Stack Weight (g)</Label>
                                    <Input type="number" step="0.1" {...sampleForm.register('weight', { valueAsNumber: true })} placeholder="e.g. 120.5" />
                                </div>

                                <Controller
                                    control={sampleForm.control}
                                    name="photo"
                                    render={({ field }) => (
                                        <PhotoCapture
                                            label="Stack Photo"
                                            onCapture={field.onChange}
                                        />
                                    )}
                                />

                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : "Log Sample"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
