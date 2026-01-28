'use client'

import { useState, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2, Beaker, Factory } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PhotoCapture from '@/components/business/PhotoCapture' // Reusing component

import { useRouter } from 'next/navigation'

export default function MixingPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Mixing Station...</div>}>
            <MixingContent />
        </Suspense>
    )
}

function MixingContent() {
    const router = useRouter()
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Active Sub-Batches
    const { data: subBatches, refetch: refetchBatches } = useQuery({
        queryKey: ['sub-batches-active'],
        queryFn: async () => {
            const { data } = await supabase.from('sub_batches')
                .select('id, sub_batch_no, recipe_templates(sku), status, created_at')
                .eq('status', 'PENDING') // Or IN_PROGRESS
                .order('created_at', { ascending: false })
            return data || []
        }
    })

    // Premix Form
    const premixForm = useForm()
    // Mixing Form
    const mixingForm = useForm()

    const onLogPremix = async (values: any) => {
        setIsSubmitting(true)
        try {
            // Upload Photo
            let photoPath = null
            if (values.photo) {
                photoPath = `premix/${Date.now()}.jpg`
                await supabase.storage.from('production-photos').upload(photoPath, values.photo) // Ensure bucket exists
            }

            const { error } = await supabase.rpc('rpc_log_premix', {
                p_sub_batch_id: values.sub_batch_id,
                p_material_id: '00000000-0000-0000-0000-000000000000', // Placeholder or add Select for Material.
                p_grn_id: null,
                p_target_qty: Number(values.target_qty),
                p_actual_qty: Number(values.actual_qty),
                p_user_id: user?.id,
                p_photo: photoPath
            })
            if (error) throw error
            toast.success("Premix Logged")
            premixForm.reset()
            refetchBatches()
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const onLogMixing = async (values: any) => {
        setIsSubmitting(true)
        try {
            const { error } = await supabase.rpc('rpc_log_mixing', {
                p_sub_batch_id: values.sub_batch_id,
                p_creaming_time: Number(values.creaming_time),
                p_mixer_speed: Number(values.mixer_speed),
                p_dough_temp: Number(values.dough_temp),
                p_ph: Number(values.ph),
                p_waste: Number(values.waste || 0),
                p_result: values.result,
                p_user_id: user?.id
            })
            if (error) throw error
            toast.success("Mixing Process Logged")
            // Redirect to Cutting Queue
            setTimeout(() => router.push('/production/cutting'), 1500)
            mixingForm.reset()
            refetchBatches()
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* LEFT: Work Queue */}
            <div className="lg:col-span-1">
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle className="text-lg">Pending Batches</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {subBatches?.length === 0 ? (
                                <div className="text-sm text-slate-500 italic">No pending batches. Start one in 'Sub-Batch'.</div>
                            ) : (
                                subBatches?.map((b: any) => (
                                    <div key={b.id} className="p-3 border rounded bg-slate-50 hover:bg-white cursor-pointer transition-colors"
                                        onClick={() => {
                                            premixForm.setValue('sub_batch_id', b.id)
                                            mixingForm.setValue('sub_batch_id', b.id)
                                        }}>
                                        <div className="font-bold text-sm">{b.recipe_templates?.sku}</div>
                                        <div className="text-xs font-mono text-slate-600 mb-1">{b.sub_batch_no || 'ID: ' + b.id.slice(0, 6)}</div>
                                        <div className="text-xs text-slate-400">{new Date(b.created_at).toLocaleTimeString()}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* RIGHT: Actions */}
            <div className="lg:col-span-2">
                <h1 className="text-2xl font-bold mb-6">Mixing & Premix</h1>

                <Tabs defaultValue="premix">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="premix">Premix (Maida)</TabsTrigger>
                        <TabsTrigger value="mixing">Mixing Process</TabsTrigger>
                    </TabsList>

                    {/* PREMIX TAB */}
                    <TabsContent value="premix">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Log Premix Batch</CardTitle></CardHeader>
                            <CardContent>
                                <form onSubmit={premixForm.handleSubmit(onLogPremix)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Sub Batch</Label>
                                        <Controller
                                            control={premixForm.control}
                                            name="sub_batch_id"
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue placeholder="Select Batch" /></SelectTrigger>
                                                    <SelectContent>
                                                        {subBatches?.map((b: any) => (
                                                            <SelectItem key={b.id} value={b.id}>{b.sub_batch_no} ({b.recipe_templates?.sku})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Target Qty (kg)</Label>
                                            <Input type="number" {...premixForm.register('target_qty', { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Actual Weighed (kg)</Label>
                                            <Input type="number" step="0.01" {...premixForm.register('actual_qty', { valueAsNumber: true })} />
                                        </div>
                                    </div>
                                    <Controller
                                        control={premixForm.control}
                                        name="photo"
                                        render={({ field }) => (
                                            <PhotoCapture
                                                label="Weigh Scale Photo"
                                                onCapture={field.onChange}
                                            />
                                        )}
                                    />
                                    <Button type="submit" disabled={isSubmitting}>Save Premix Log</Button>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* MIXING TAB */}
                    <TabsContent value="mixing">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2"><Beaker className="h-5 w-5" /> Log Mixing Params</CardTitle></CardHeader>
                            <CardContent>
                                <form onSubmit={mixingForm.handleSubmit(onLogMixing)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Sub Batch</Label>
                                        <Controller
                                            control={mixingForm.control}
                                            name="sub_batch_id"
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue placeholder="Select Batch" /></SelectTrigger>
                                                    <SelectContent>
                                                        {subBatches?.map((b: any) => (
                                                            <SelectItem key={b.id} value={b.id}>{b.sub_batch_no} ({b.recipe_templates?.sku})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Creaming Time (mins)</Label>
                                            <Input type="number" {...mixingForm.register('creaming_time', { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Mixer Speed (RPM)</Label>
                                            <Input type="number" {...mixingForm.register('mixer_speed', { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Dough Temp (°C)</Label>
                                            <Input type="number" step="0.1" {...mixingForm.register('dough_temp', { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>pH Level</Label>
                                            <Input type="number" step="0.1" {...mixingForm.register('ph', { valueAsNumber: true })} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Result / Outcome</Label>
                                        <Controller
                                            control={mixingForm.control}
                                            name="result"
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="OK">OK - Proceed</SelectItem>
                                                        <SelectItem value="HOLD">HOLD - QA Check</SelectItem>
                                                        <SelectItem value="REJECT">REJECT - Waste</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="animate-spin" /> : "Submit Mixing Log"}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
