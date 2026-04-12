'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { 
    Loader2, 
    Truck, 
    Plus, 
    Trash2, 
    PackageCheck, 
    User, 
    Phone, 
    MapPin, 
    Box,
    ClipboardList,
    Camera
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PhotoCapture from '@/components/business/PhotoCapture'
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

export default function DispatchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <p className="text-sm font-medium text-gray-500">Loading Dispatch Module...</p>
                </div>
            </div>
        }>
            <DispatchContent />
        </Suspense>
    )
}

function DispatchContent() {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => setIsMounted(true), [])

    // Fetch Available FG Batches
    const { data: batches } = useQuery({
        queryKey: ['fg-batches-avail'],
        queryFn: async () => {
            const { data } = await supabase.from('fg_batches')
                .select('id, fg_batch_no, sku_id, good_qty, produced_qty')
                .gt('good_qty', 0)
            return data || []
        }
    })

    // Fetch Recent Dispatches
    const { data: recentDispatches, refetch: refetchDispatches } = useQuery({
        queryKey: ['recent-dispatches'],
        queryFn: async () => {
            const { data } = await supabase.from('dispatches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(6)
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            customer: '',
            truck: '',
            driver: '',
            mobile: '',
            items: [{ batch_id: '', qty: 0 }],
            photo: null
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    })

    const onSubmit = async (values: any) => {
        // Validate items
        if (values.items.length === 0 || !values.items[0].batch_id) {
            return toast.error("Manifest Error", { description: "Please add at least one valid batch to the manifest." })
        }

        setIsSubmitting(true)
        try {
            let photoPath = null
            if (values.photo) {
                photoPath = `dispatch/${Date.now()}.jpg`
                await supabase.storage.from('production-photos').upload(photoPath, values.photo)
            }

            const { data: userData } = await supabase.auth.getUser()

            const { error } = await supabase.rpc('rpc_create_dispatch', {
                p_customer: values.customer,
                p_truck: values.truck,
                p_driver: values.driver,
                p_driver_mobile: values.mobile,
                p_items: values.items,
                p_user_id: userData.user?.id,
                p_photo: photoPath
            })

            if (error) throw error
            toast.success("Dispatch Created Successfully")
            form.reset({
                customer: '',
                truck: '',
                driver: '',
                mobile: '',
                items: [{ batch_id: '', qty: 0 }],
                photo: null
            })
            refetchDispatches()

        } catch (e: any) {
            toast.error("Dispatch Failed", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isMounted) return null

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-[#111827] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                
                {/* --- Page Header --- */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                        Outbound Dispatch
                    </h1>
                    <p className="text-base text-gray-500 max-w-2xl">
                        Create shipment manifests, allocate finished goods inventory, and record proof of loading.
                    </p>
                </motion.div>

                <motion.div 
                    variants={fadeUpContainer}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                    {/* --- LEFT: Dispatch Form --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-8">
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            
                            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                                <div className="p-2 bg-black rounded-lg text-white">
                                    <Truck className="h-5 w-5" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Shipment Details</h2>
                            </div>

                            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-8">
                                
                                {/* Section 1: Transport Details */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <MapPin className="h-4 w-4" /> 1. Logistics Information
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <Label className="text-gray-700 font-semibold">Customer / Destination</Label>
                                            <div className="relative">
                                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input className="pl-9 h-11 bg-gray-50 focus:bg-white" placeholder="e.g. Acme Corp" {...form.register('customer', { required: true })} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-gray-700 font-semibold">Vehicle Registration</Label>
                                            <div className="relative">
                                                <Truck className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input className="pl-9 h-11 bg-gray-50 focus:bg-white font-mono uppercase" placeholder="e.g. MH-12-AB-1234" {...form.register('truck', { required: true })} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-gray-700 font-semibold">Driver Name</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input className="pl-9 h-11 bg-gray-50 focus:bg-white" placeholder="Name" {...form.register('driver', { required: true })} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-gray-700 font-semibold">Driver Mobile</Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input type="tel" className="pl-9 h-11 bg-gray-50 focus:bg-white font-mono" placeholder="+91..." {...form.register('mobile')} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100"></div>

                                {/* Section 2: Load Manifest (Dynamic Array) */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4" /> 2. Load Manifest
                                        </h3>
                                    </div>

                                    <div className="space-y-3">
                                        <AnimatePresence initial={false}>
                                            {fields.map((field, index) => (
                                                <motion.div 
                                                    key={field.id}
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-end group"
                                                >
                                                    <div className="flex-1 w-full space-y-2">
                                                        <Label className="text-gray-600 font-semibold text-xs uppercase">Select FG Batch</Label>
                                                        <Controller
                                                            control={form.control}
                                                            name={`items.${index}.batch_id`}
                                                            rules={{ required: true }}
                                                            render={({ field }) => (
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <SelectTrigger className="h-11 bg-white border-gray-300">
                                                                        <SelectValue placeholder="Select available batch..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {batches?.map((b: any) => (
                                                                            <SelectItem key={b.id} value={b.id} className="font-medium">
                                                                                <span className="font-mono text-gray-500 mr-2">{b.fg_batch_no}</span>
                                                                                {(b.sku_id ?? '').slice(0, 8)}
                                                                                <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{b.good_qty ?? b.produced_qty ?? 0} Avl</span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        />
                                                    </div>
                                                    <div className="w-full sm:w-32 space-y-2">
                                                        <Label className="text-gray-600 font-semibold text-xs uppercase">Qty (Units)</Label>
                                                        <Input 
                                                            type="number" 
                                                            className="h-11 font-mono text-lg bg-white border-gray-300" 
                                                            placeholder="0"
                                                            min={1}
                                                            {...form.register(`items.${index}.qty`, { valueAsNumber: true, min: 1 })} 
                                                        />
                                                    </div>
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        className="h-11 w-11 shrink-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg sm:opacity-50 sm:group-hover:opacity-100 transition-opacity"
                                                        onClick={() => remove(index)}
                                                        disabled={fields.length === 1} // Prevent deleting last row
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>

                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            className="w-full border-dashed border-gray-300 text-gray-600 hover:border-black hover:text-black hover:bg-gray-50 h-12 rounded-xl"
                                            onClick={() => append({ batch_id: '', qty: 0 })}
                                        >
                                            <Plus className="h-4 w-4 mr-2" /> Add Another Batch
                                        </Button>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100"></div>

                                {/* Section 3: Verification */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Camera className="h-4 w-4" /> 3. Verification
                                    </h3>
                                    <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-4">
                                        <Controller
                                            control={form.control}
                                            name="photo"
                                            render={({ field }) => (
                                                <PhotoCapture
                                                    label="Capture Loaded Vehicle / Pallet"
                                                    onCapture={field.onChange}
                                                    required
                                                />
                                            )}
                                        />
                                    </div>
                                </div>

                                <Button 
                                    type="submit" 
                                    className="w-full h-14 text-lg font-bold bg-black hover:bg-gray-800 text-white shadow-md transition-all" 
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : "Authorize Dispatch"}
                                </Button>
                            </form>
                        </div>
                    </motion.div>

                    {/* --- RIGHT: Recent Dispatches Ledger --- */}
                    <motion.div variants={fadeUpItem} className="lg:col-span-4 flex flex-col h-[calc(100vh-12rem)]">
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <PackageCheck className="h-5 w-5 text-gray-500" />
                                    <h3 className="font-bold text-gray-900">Dispatch Ledger</h3>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[#F8F9FA]">
                                {recentDispatches?.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                        <Box className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm">No dispatches recorded today.</p>
                                    </div>
                                ) : (
                                    recentDispatches?.map((d: any) => (
                                        <div key={d.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
                                            <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-3">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-0.5">Vehicle</span>
                                                    <span className="font-mono font-bold text-gray-900">{d.vehicle_no}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${
                                                        d.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {d.status}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-1.5 mb-3">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-500">Destination</span>
                                                    <span className="font-medium text-gray-900 truncate max-w-[150px]">{d.customer_name}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-500">Driver</span>
                                                    <span className="font-medium text-gray-900">{d.driver_name}</span>
                                                </div>
                                            </div>

                                            <div className="pt-2 flex justify-between items-center text-xs text-gray-400 border-t border-gray-50">
                                                <span className="font-mono">{d.id.slice(0,8).toUpperCase()}</span>
                                                <span>{new Date(d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </div>

            {/* Custom scrollbar for the ledger */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #E5E7EB; border-radius: 20px; }
            `}</style>
        </div>
    )
}