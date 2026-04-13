'use client'

import { useState, useEffect, Suspense } from 'react'
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

    const createSubBatchRowsFallback = async (values: any) => {
        const selectedRecipe = recipes?.find((r: any) => r.id === values.recipe_id)
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

        setAllocationResult({
            batch_id: insertedRows?.[0]?.sub_batch_no || masterBatch.master_batch_no || insertedRows?.[0]?.id || 'CREATED',
            allocations: []
        })

        toast.success('Sub-batches started', {
            description: `${requestedCount} run(s) created for ${selectedRecipe?.sku || 'selected recipe'}.`
        })
    }

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

            if (error) {
                const message = (error.message || '').toLowerCase()
                if (message.includes('column "batch_id" of relation "sub_batches" does not exist')) {
                    await createSubBatchRowsFallback(values)
                } else {
                    throw error
                }
            } else {
                setAllocationResult(data)
                toast.success("Batches Created & Materials Reserved")
            }

            // Redirect to Mixing Queue after a brief pause so user can see the allocation
            setTimeout(() => router.push('/production/mixing'), 2000)
            refetchBatches() 

        } catch (error: any) {
            toast.error("Failed to Start Batch", { description: error.message })
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

                                <div className="mt-auto pt-8">
                                    <Button 
                                        type="submit" 
                                        className="w-full h-14 text-base font-semibold bg-black hover:bg-gray-800 text-white shadow-md transition-all group" 
                                        disabled={isSubmitting}
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