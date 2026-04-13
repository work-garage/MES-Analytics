'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2, Beaker, Factory, ClipboardList, Activity, Thermometer, Droplets, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PhotoCapture from '@/components/business/PhotoCapture'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

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
    show: { y: 0, opacity: 1, transition: { type: "tween", ease: "easeOut", duration: 0.3 } }
} satisfies Variants

export default function MixingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <p className="text-sm font-medium text-gray-500">Loading Mixing Station...</p>
                </div>
            </div>
        }>
            <MixingContent />
        </Suspense>
    )
}

function MixingContent() {
    const router = useRouter()
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => setIsMounted(true), [])

    // Fetch Active Sub-Batches
    const { data: subBatches, refetch: refetchBatches } = useQuery({
        queryKey: ['sub-batches-active'],
        queryFn: async () => {
            const { data } = await supabase.from('sub_batches')
                .select('id, sub_batch_no, recipe_templates(sku), status, created_at')
                .order('created_at', { ascending: false })
                .limit(30)
            return data || []
        }
    })

    const premixForm = useForm()
    const mixingForm = useForm()

    // Sync selected batch across UI and forms
    const handleBatchSelect = (batchId: string) => {
        setActiveBatchId(batchId)
        premixForm.setValue('sub_batch_id', batchId)
        mixingForm.setValue('sub_batch_id', batchId)
    }

    const getRecipeSku = (batch: any) => {
        if (!batch?.recipe_templates) return 'N/A'
        return Array.isArray(batch.recipe_templates)
            ? (batch.recipe_templates[0]?.sku ?? 'N/A')
            : (batch.recipe_templates?.sku ?? 'N/A')
    }

    const onLogPremix = async (values: any) => {
        if (!values.sub_batch_id) return toast.error("Please select a batch first")
        
        setIsSubmitting(true)
        try {
            let photoPath = null
            if (values.photo) {
                photoPath = `premix/${Date.now()}.jpg`
                await supabase.storage.from('production-photos').upload(photoPath, values.photo)
            }

            const { error } = await supabase.rpc('rpc_log_premix', {
                p_sub_batch_id: values.sub_batch_id,
                p_material_id: '00000000-0000-0000-0000-000000000000',
                p_grn_id: null,
                p_target_qty: Number(values.target_qty),
                p_actual_qty: Number(values.actual_qty),
                p_user_id: user?.id,
                p_photo: photoPath
            })
            if (error) {
                const msg = (error.message || '').toLowerCase()
                if (msg.includes('column "material_id" of relation "premix_logs" does not exist')) {
                    toast.warning('Premix schema is out of sync; continuing without saving this premix log.')
                    premixForm.reset({ sub_batch_id: activeBatchId })
                    return
                }
                throw error
            }
            toast.success("Premix Logged Successfully")
            premixForm.reset({ sub_batch_id: activeBatchId }) // keep context
            refetchBatches()
        } catch (e: any) {
            toast.error("Error logging premix", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const onLogMixing = async (values: any) => {
        if (!values.sub_batch_id) return toast.error("Please select a batch first")

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
            setTimeout(() => router.push('/production/cutting'), 1500)
            mixingForm.reset()
            refetchBatches()
        } catch (e: any) {
            toast.error("Error logging mixing", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const activeBatchData = subBatches?.find((b: any) => b.id === activeBatchId)

    if (!isMounted) return null

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-[#111827] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                
                {/* --- Page Header --- */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                        Mixing Operations
                    </h1>
                    <p className="text-base text-gray-500 max-w-2xl">
                        Select a pending batch from the queue to log premix ingredients and mixing telemetry.
                    </p>
                </motion.div>

                <motion.div 
                    variants={fadeUpContainer}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                    {/* --- LEFT: Work Queue --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-4 flex flex-col h-[calc(100vh-12rem)]">
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-gray-500" />
                                    <h3 className="font-bold text-gray-900">Task Queue</h3>
                                </div>
                                <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                    {subBatches?.length || 0}
                                </span>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {subBatches?.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                        <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm">Queue is empty.</p>
                                    </div>
                                ) : (
                                    subBatches?.map((b: any) => {
                                        const isActive = activeBatchId === b.id;
                                        return (
                                            <div 
                                                key={b.id} 
                                                onClick={() => handleBatchSelect(b.id)}
                                                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border ${
                                                    isActive 
                                                        ? 'bg-black text-white border-black shadow-md ring-1 ring-black scale-[1.02]' 
                                                        : 'bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className={`font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                                                        {getRecipeSku(b)}
                                                    </div>
                                                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                                        isActive ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                        {b.status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div className={`font-mono text-xs ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                                                        {b.sub_batch_no || b.id.slice(0, 8).toUpperCase()}
                                                    </div>
                                                    <div className={`text-xs ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>
                                                        {new Date(b.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* --- RIGHT: Execution Panel --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-8 flex flex-col">
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden min-h-[600px]">
                            
                            {/* Active Context Banner */}
                            <div className="bg-[#F8F9FA] border-b border-gray-200 px-6 py-5">
                                {activeBatchData ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-black text-white rounded-lg flex items-center justify-center">
                                                <Factory className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Batch</p>
                                                <p className="text-lg font-bold text-gray-900">{getRecipeSku(activeBatchData)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ref No</p>
                                            <p className="font-mono text-sm font-semibold text-gray-900">
                                                {activeBatchData.sub_batch_no || activeBatchData.id.slice(0, 8).toUpperCase()}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 text-gray-500 py-2">
                                        <ArrowRight className="h-5 w-5 animate-pulse text-gray-400" />
                                        <span className="font-medium">Select a batch from the queue to begin logging.</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-6">
                                <Tabs defaultValue="premix" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 bg-gray-100/80 p-1 rounded-xl mb-8">
                                        <TabsTrigger value="premix" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black text-gray-500 font-semibold transition-all">
                                            Phase 1: Premix
                                        </TabsTrigger>
                                        <TabsTrigger value="mixing" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black text-gray-500 font-semibold transition-all">
                                            Phase 2: Mixing Params
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* PREMIX TAB */}
                                    <TabsContent value="premix" className="space-y-6 focus-visible:outline-none">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Beaker className="h-5 w-5 text-gray-400" />
                                            <h2 className="text-lg font-bold">Ingredient Scaling</h2>
                                        </div>
                                        
                                        <form onSubmit={premixForm.handleSubmit(onLogPremix)} className="space-y-6">
                                            {/* Hidden input to keep form logic intact without redundant UI */}
                                            <input type="hidden" {...premixForm.register('sub_batch_id')} />
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold">Target Quantity (kg)</Label>
                                                    <Input 
                                                        type="number" 
                                                        className="h-12 bg-gray-50/50 border-gray-200 font-mono text-lg" 
                                                        {...premixForm.register('target_qty', { valueAsNumber: true })} 
                                                        disabled={!activeBatchId}
                                                    />
                                                </div>
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold">Actual Weighed (kg)</Label>
                                                    <Input 
                                                        type="number" step="0.01" 
                                                        className="h-12 bg-white border-gray-300 font-mono text-lg focus:border-black focus:ring-black" 
                                                        {...premixForm.register('actual_qty', { valueAsNumber: true })} 
                                                        disabled={!activeBatchId}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2.5">
                                                <Label className="text-gray-700 font-semibold">Verification Photo</Label>
                                                <div className={`border-2 border-dashed rounded-xl p-2 ${activeBatchId ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-gray-50/50 opacity-50'}`}>
                                                    <Controller
                                                        control={premixForm.control}
                                                        name="photo"
                                                        render={({ field }) => (
                                                            <PhotoCapture
                                                                label="Capture Weigh Scale"
                                                                onCapture={field.onChange}
                                                            />
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            <Button 
                                                type="submit" 
                                                className="w-full h-12 text-base font-semibold bg-black hover:bg-gray-800 text-white transition-all" 
                                                disabled={isSubmitting || !activeBatchId}
                                            >
                                                {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : "Save Premix Log"}
                                            </Button>
                                        </form>
                                    </TabsContent>

                                    {/* MIXING TAB */}
                                    <TabsContent value="mixing" className="space-y-6 focus-visible:outline-none">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Activity className="h-5 w-5 text-gray-400" />
                                            <h2 className="text-lg font-bold">Telemetry & Quality</h2>
                                        </div>

                                        <form onSubmit={mixingForm.handleSubmit(onLogMixing)} className="space-y-8">
                                            {/* Hidden input */}
                                            <input type="hidden" {...mixingForm.register('sub_batch_id')} />

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold flex items-center gap-2">
                                                        <Clock className="h-4 w-4 text-gray-400" /> Creaming Time (mins)
                                                    </Label>
                                                    <Input type="number" className="h-12 font-mono" {...mixingForm.register('creaming_time', { valueAsNumber: true })} disabled={!activeBatchId} />
                                                </div>
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold flex items-center gap-2">
                                                        <Activity className="h-4 w-4 text-gray-400" /> Mixer Speed (RPM)
                                                    </Label>
                                                    <Input type="number" className="h-12 font-mono" {...mixingForm.register('mixer_speed', { valueAsNumber: true })} disabled={!activeBatchId} />
                                                </div>
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold flex items-center gap-2">
                                                        <Thermometer className="h-4 w-4 text-gray-400" /> Dough Temp (°C)
                                                    </Label>
                                                    <Input type="number" step="0.1" className="h-12 font-mono" {...mixingForm.register('dough_temp', { valueAsNumber: true })} disabled={!activeBatchId} />
                                                </div>
                                                <div className="space-y-2.5">
                                                    <Label className="text-gray-700 font-semibold flex items-center gap-2">
                                                        <Droplets className="h-4 w-4 text-gray-400" /> pH Level
                                                    </Label>
                                                    <Input type="number" step="0.1" className="h-12 font-mono" {...mixingForm.register('ph', { valueAsNumber: true })} disabled={!activeBatchId} />
                                                </div>
                                            </div>

                                            <div className="border-t border-gray-100 pt-6">
                                                <div className="space-y-3">
                                                    <Label className="text-gray-700 font-bold">QA Assessment</Label>
                                                    <Controller
                                                        control={mixingForm.control}
                                                        name="result"
                                                        render={({ field }) => (
                                                            <div className="grid grid-cols-3 gap-3">
                                                                <button
                                                                    type="button"
                                                                    disabled={!activeBatchId}
                                                                    onClick={() => field.onChange("OK")}
                                                                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                                                        field.value === "OK" 
                                                                            ? "border-green-500 bg-green-50 text-green-700" 
                                                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                                                    }`}
                                                                >
                                                                    <CheckCircle2 className="h-6 w-6 mb-2" />
                                                                    <span className="font-bold text-sm">OK</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={!activeBatchId}
                                                                    onClick={() => field.onChange("HOLD")}
                                                                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                                                        field.value === "HOLD" 
                                                                            ? "border-amber-500 bg-amber-50 text-amber-700" 
                                                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                                                    }`}
                                                                >
                                                                    <AlertTriangle className="h-6 w-6 mb-2" />
                                                                    <span className="font-bold text-sm">HOLD</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={!activeBatchId}
                                                                    onClick={() => field.onChange("REJECT")}
                                                                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                                                        field.value === "REJECT" 
                                                                            ? "border-red-500 bg-red-50 text-red-700" 
                                                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                                                    }`}
                                                                >
                                                                    <XCircle className="h-6 w-6 mb-2" />
                                                                    <span className="font-bold text-sm">REJECT</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            <Button 
                                                type="submit" 
                                                className="w-full h-14 text-base font-semibold bg-black hover:bg-gray-800 text-white transition-all shadow-md" 
                                                disabled={isSubmitting || !activeBatchId}
                                            >
                                                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
                                                Submit Mixing Telemetry & Proceed
                                            </Button>
                                        </form>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </div>

            {/* Custom scrollbar for the queue to keep it clean */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #E5E7EB; border-radius: 20px; }
            `}</style>
        </div>
    )
}

// Ensure you have Clock imported at the top, adding a fallback just in case:
function Clock(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}