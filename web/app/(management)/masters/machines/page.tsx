'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Edit, Settings, Loader2, Server, Database, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useForm, Controller } from 'react-hook-form'
import { motion, type Variants } from 'framer-motion'

// --- Animation Variants ---
const fadeUpItem = {
    hidden: { y: 10, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "tween", ease: "easeOut", duration: 0.3 } }
} satisfies Variants

export default function MachinesPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => setIsMounted(true), [])

    const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm()

    const { data: machines, isLoading } = useQuery({
        queryKey: ['machines'],
        queryFn: async () => {
            const { data } = await supabase.from('machines').select('*').order('line_id')
            return data || []
        }
    })

    const mutation = useMutation({
        mutationFn: async (values: any) => {
            if (editingId) {
                const { error } = await supabase.from('machines').update(values).eq('id', editingId)
                if (error) throw error
            } else {
                const { error } = await supabase.from('machines').insert(values)
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['machines'] })
            setIsOpen(false)
            toast.success(editingId ? "Machine Updated" : "Machine Added")
        },
        onError: (err: any) => toast.error("Failed to save", { description: err.message })
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('code', item.code)
        setValue('name', item.name)
        setValue('type', item.type)
        setValue('line_id', item.line_id)
        setIsOpen(true)
    }

    const openNew = () => {
        setEditingId(null)
        reset({ code: '', name: '', type: '', line_id: '' })
        setIsOpen(true)
    }

    // Helper to color-code machine types
    const getTypeColor = (type: string) => {
        switch (type) {
            case 'MIXER': return 'bg-blue-50 text-blue-700 ring-blue-600/20'
            case 'CUTTER': return 'bg-amber-50 text-amber-700 ring-amber-600/20'
            case 'OVEN': return 'bg-red-50 text-red-700 ring-red-600/20'
            case 'PACKER': return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
            default: return 'bg-gray-50 text-gray-600 ring-gray-500/20'
        }
    }

    if (!isMounted) return null

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-[#111827] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                
                {/* --- Page Header --- */}
                <motion.div initial="hidden" animate="show" variants={fadeUpItem} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Machine Master</h1>
                        <p className="text-gray-500 text-sm max-w-xl">
                            Configure and manage physical plant assets, production lines, and machine telemetry identifiers.
                        </p>
                    </div>
                    
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openNew} className="bg-black hover:bg-gray-800 text-white shadow-sm font-semibold h-11 px-6">
                                <Plus className="mr-2 h-4 w-4" /> Add Asset
                            </Button>
                        </DialogTrigger>
                        
                        <DialogContent className="sm:max-w-[500px] border-gray-200 shadow-xl">
                            <DialogHeader className="pb-4 border-b border-gray-100">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-2 bg-gray-100 rounded-md">
                                        <Server className="h-4 w-4 text-gray-700" />
                                    </div>
                                    <DialogTitle className="text-xl">{editingId ? 'Edit Asset Configuration' : 'Register New Asset'}</DialogTitle>
                                </div>
                                <p className="text-sm text-gray-500">
                                    {editingId ? 'Update telemetry identifiers and logical groupings.' : 'Enter equipment details to register it on the plant network.'}
                                </p>
                            </DialogHeader>
                            
                            <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6 pt-2">
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <Label className="text-gray-700 font-semibold">Asset Code <span className="text-red-500">*</span></Label>
                                        <Input 
                                            {...register('code', { required: "Code is required" })} 
                                            placeholder="e.g. MIX-01" 
                                            className={`h-11 font-mono uppercase bg-gray-50 focus:bg-white ${errors.code ? 'border-red-300 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                        />
                                        {errors.code && <p className="text-xs text-red-500">{errors.code.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-gray-700 font-semibold">Production Line <span className="text-red-500">*</span></Label>
                                        <Controller
                                            control={control}
                                            name="line_id"
                                            rules={{ required: "Line is required" }}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger className={`h-11 bg-gray-50 focus:bg-white ${errors.line_id ? 'border-red-300 focus:ring-red-500' : 'border-gray-200'}`}>
                                                        <SelectValue placeholder="Select Line" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="LINE-A">Line A (Main)</SelectItem>
                                                        <SelectItem value="LINE-B">Line B (Secondary)</SelectItem>
                                                        <SelectItem value="LINE-C">Line C (Specialty)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.line_id && <p className="text-xs text-red-500">{errors.line_id.message as string}</p>}
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-semibold">Equipment Name <span className="text-red-500">*</span></Label>
                                    <Input 
                                        {...register('name', { required: "Name is required" })} 
                                        placeholder="e.g. High Speed Dough Mixer" 
                                        className={`h-11 bg-gray-50 focus:bg-white ${errors.name ? 'border-red-300 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                    />
                                    {errors.name && <p className="text-xs text-red-500">{errors.name.message as string}</p>}
                                </div>
                                
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-semibold">Equipment Class <span className="text-red-500">*</span></Label>
                                    <Controller
                                        control={control}
                                        name="type"
                                        rules={{ required: "Type is required" }}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger className={`h-11 bg-gray-50 focus:bg-white ${errors.type ? 'border-red-300 focus:ring-red-500' : 'border-gray-200'}`}>
                                                    <SelectValue placeholder="Select Category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MIXER">Mixing Station</SelectItem>
                                                    <SelectItem value="CUTTER">Cutting / Moulding</SelectItem>
                                                    <SelectItem value="OVEN">Industrial Oven</SelectItem>
                                                    <SelectItem value="PACKER">Packaging Line</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    {errors.type && <p className="text-xs text-red-500">{errors.type.message as string}</p>}
                                </div>

                                <div className="pt-4 mt-6 border-t border-gray-100 flex justify-end gap-3">
                                    <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-black">
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={mutation.isPending} className="bg-black hover:bg-gray-800 text-white min-w-[100px]">
                                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Asset'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </motion.div>

                {/* --- Data Table --- */}
                <motion.div initial="hidden" animate="show" variants={fadeUpItem} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    
                    {/* Table Toolbar */}
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-500">
                            <Database className="h-4 w-4" />
                            <span className="text-sm font-medium">Registered Assets ({machines?.length || 0})</span>
                        </div>
                        {/* Optional: Add search bar here later */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input placeholder="Search assets..." className="h-9 pl-9 w-[250px] bg-white border-gray-200 text-sm" disabled />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-gray-200 bg-white">
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Asset Code</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Equipment Name</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Class / Type</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Production Line</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    // Loading Skeleton
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-100 rounded"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 w-48 bg-gray-100 rounded"></div></td>
                                            <td className="px-6 py-4"><div className="h-5 w-24 bg-gray-100 rounded-full"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-100 rounded"></div></td>
                                            <td className="px-6 py-4 text-right"><div className="h-8 w-8 bg-gray-100 rounded inline-block"></div></td>
                                        </tr>
                                    ))
                                ) : machines?.length === 0 ? (
                                    // Empty State
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center text-gray-500">
                                            <Settings className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
                                            <p className="text-base font-medium text-gray-900 mb-1">No machines configured</p>
                                            <p className="text-sm">Click "Add Asset" to register your first piece of equipment.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    // Data Rows
                                    machines?.map((m: any) => (
                                        <tr key={m.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="font-mono font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                                    {m.code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-semibold text-gray-700">{m.name}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ring-1 ring-inset ${getTypeColor(m.type)}`}>
                                                    {m.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-gray-600 font-medium flex items-center gap-1.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400"></div>
                                                    {m.line_id}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => openEdit(m)}
                                                    className="text-gray-400 hover:text-black hover:bg-gray-100 h-8 px-2"
                                                >
                                                    <Edit className="h-4 w-4 mr-2" /> Edit
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}