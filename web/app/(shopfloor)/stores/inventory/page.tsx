'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { 
    ArrowRightLeft, 
    Package, 
    Search, 
    ChevronLeft, 
    Clock, 
    BarChart3, 
    Loader2, 
    Archive, 
    ClipboardList,
    AlertTriangle,
    Layers
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
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

// ── Helpers ──────────────────────────────────────────────────────────────────────

function daysLeft(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ date }: { date: string }) {
    const days = daysLeft(date)
    if (days < 0) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 border border-red-200 shadow-sm">Expired</span>
    if (days <= 7) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm"><AlertTriangle className="h-3 w-3" /> {days}d left</span>
    if (days <= 30) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">{days}d left</span>
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{days}d left</span>
}

function getMaterialName(item: any): string {
    const m = Array.isArray(item.gate_entries?.materials)
        ? item.gate_entries?.materials[0]
        : item.gate_entries?.materials
    return m?.name ?? 'Unknown'
}

function getMaterialCode(item: any): string {
    const m = Array.isArray(item.gate_entries?.materials)
        ? item.gate_entries?.materials[0]
        : item.gate_entries?.materials
    return m?.code ?? ''
}

// ── Main Component ────────────────────────────────────────────────────────────────

export default function MainInventoryPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <p className="text-sm font-medium text-gray-500">Loading Inventory Ledger...</p>
                </div>
            </div>
        }>
            <InventoryContent />
        </Suspense>
    )
}

function InventoryContent() {
    const supabase = createClient()
    const router = useRouter()
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => setIsMounted(true), [])

    // Per-tab search values
    const [materialSearch, setMaterialSearch] = useState('')
    const [drillSearch, setDrillSearch] = useState('')
    const [allSearch, setAllSearch] = useState('')
    const [containerSearch, setContainerSearch] = useState('')
    const [containerDrillSearch, setContainerDrillSearch] = useState('')

    const [showAll, setShowAll] = useState(false)
    const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null)
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null)

    const { data: inventory, isLoading } = useQuery({
        queryKey: ['inventory_full'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('grns')
                .select(`
                    id, grn_no, net_qty, itc_expiry_date, storage_location, created_at,
                    gate_entries ( materials (name, code) ),
                    container_inventory(units, container_type),
                    reservations(qty, status)
                `)
                .eq('status', 'RECEIVED')
                .order('itc_expiry_date', { ascending: true })
            if (error) throw error
            return (data ?? []).map((item: any) => {
                const reserved = item.reservations?.reduce((sum: number, r: any) =>
                    r.status === 'ACTIVE' ? sum + r.qty : sum, 0) || 0
                return {
                    ...item,
                    available: item.net_qty - reserved,
                    container_count: item.container_inventory?.[0]?.units || 0,
                    container_type: item.container_inventory?.[0]?.container_type || 'N/A',
                    material_name: getMaterialName(item),
                    material_code: getMaterialCode(item),
                }
            }).filter((i: any) => i.available > 0)
        }
    })

    // ── Derived datasets ──────────────────────────────────────────────────────────

    const allMaterialsData = useMemo(() => {
        if (!inventory) return []
        let data = inventory
        if (!showAll) {
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - 30)
            data = data.filter((i: any) => new Date(i.created_at) >= cutoff)
        }
        if (allSearch) {
            const q = allSearch.toLowerCase()
            data = data.filter((i: any) =>
                i.material_name.toLowerCase().includes(q) ||
                i.material_code.toLowerCase().includes(q) ||
                (i.grn_no ?? '').toLowerCase().includes(q)
            )
        }
        return data
    }, [inventory, showAll, allSearch])

    const distinctMaterials = useMemo(() => {
        if (!inventory) return []
        const map = new Map<string, { name: string; code: string; count: number; nextExpiry: string; totalStock: number }>()
        for (const item of inventory) {
            const key = item.material_name
            if (!map.has(key)) {
                map.set(key, { name: item.material_name, code: item.material_code, count: 0, nextExpiry: item.itc_expiry_date, totalStock: 0 })
            }
            const entry = map.get(key)!
            entry.count += 1
            entry.totalStock += item.available
            if (item.itc_expiry_date < entry.nextExpiry) entry.nextExpiry = item.itc_expiry_date
        }
        let result = [...map.values()].sort((a, b) => daysLeft(a.nextExpiry) - daysLeft(b.nextExpiry))
        if (materialSearch) {
            const q = materialSearch.toLowerCase()
            result = result.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))
        }
        return result
    }, [inventory, materialSearch])

    const materialDrilldown = useMemo(() => {
        if (!inventory || !selectedMaterial) return []
        let data = inventory.filter((i: any) => i.material_name === selectedMaterial)
        if (drillSearch) {
            const q = drillSearch.toLowerCase()
            data = data.filter((i: any) =>
                (i.grn_no ?? '').toLowerCase().includes(q) ||
                (i.storage_location ?? '').toLowerCase().includes(q) ||
                i.itc_expiry_date.toLowerCase().includes(q)
            )
        }
        return data
    }, [inventory, selectedMaterial, drillSearch])

    const materialStats = useMemo(() => {
        if (!inventory || !selectedMaterial) return null
        const rows = inventory.filter((i: any) => i.material_name === selectedMaterial)
        const totalStock = rows.reduce((s: number, i: any) => s + i.available, 0)
        const nextExpiry = rows[0]?.itc_expiry_date ?? null
        return { totalStock, nextExpiry }
    }, [inventory, selectedMaterial])

    const distinctContainers = useMemo(() => {
        if (!inventory) return []
        const map = new Map<string, { type: string; count: number; totalUnits: number }>()
        for (const item of inventory) {
            const ct = item.container_type
            if (!ct || ct === 'N/A') continue
            if (!map.has(ct)) map.set(ct, { type: ct, count: 0, totalUnits: 0 })
            const entry = map.get(ct)!
            entry.count += 1
            entry.totalUnits += item.container_count
        }
        let result = [...map.values()]
        if (containerSearch) {
            const q = containerSearch.toLowerCase()
            result = result.filter(c => c.type.toLowerCase().includes(q))
        }
        return result
    }, [inventory, containerSearch])

    const containerDrilldown = useMemo(() => {
        if (!inventory || !selectedContainer) return []
        let data = inventory.filter((i: any) => i.container_type === selectedContainer)
        if (containerDrillSearch) {
            const q = containerDrillSearch.toLowerCase()
            data = data.filter((i: any) =>
                i.material_name.toLowerCase().includes(q) ||
                (i.grn_no ?? '').toLowerCase().includes(q) ||
                (i.storage_location ?? '').toLowerCase().includes(q)
            )
        }
        return data
    }, [inventory, selectedContainer, containerDrillSearch])

    if (!isMounted) return null

    // ── Layout ────────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-[#111827] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Page Header */}
                <motion.div initial="hidden" animate="show" variants={fadeUpItem} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">Inventory Ledger</h1>
                        <p className="text-slate-500 text-base">Real-time FEFO tracking, GRN storage, and container oversight.</p>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <Button variant="outline" className="flex-1 md:flex-none border-gray-200 hover:bg-gray-50 hover:text-black" onClick={() => router.push('/stores/transfer')}>
                            <ArrowRightLeft className="h-4 w-4 mr-2 text-gray-500" /> Transfer
                        </Button>
                        <Button className="flex-1 md:flex-none bg-black hover:bg-gray-800 text-white shadow-md" onClick={() => router.push('/production/sub-batch')}>
                            <Package className="h-4 w-4 mr-2" /> Start Production
                        </Button>
                    </div>
                </motion.div>

                {/* ── Segmented Control Tabs ── */}
                <Tabs defaultValue="material" className="w-full">
                    <TabsList className="w-full sm:w-auto h-12 inline-flex p-1 bg-gray-100/80 rounded-xl mb-8">
                        <TabsTrigger value="material" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black text-gray-500 font-semibold transition-all">
                            <Layers className="h-4 w-4 mr-2" /> Material View
                        </TabsTrigger>
                        <TabsTrigger value="all" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black text-gray-500 font-semibold transition-all">
                            <ClipboardList className="h-4 w-4 mr-2" /> All Records
                        </TabsTrigger>
                        <TabsTrigger value="container" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black text-gray-500 font-semibold transition-all">
                            <Archive className="h-4 w-4 mr-2" /> Containers
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Tab 1: Material Wise ── */}
                    <TabsContent value="material" className="focus-visible:outline-none">
                        <AnimatePresence mode="wait">
                            {selectedMaterial ? (
                                <motion.div 
                                    key="drilldown"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >
                                    <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-gray-200" onClick={() => { setSelectedMaterial(null); setDrillSearch('') }}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <div>
                                            <h2 className="text-2xl font-bold text-gray-900">{selectedMaterial}</h2>
                                            <p className="text-sm text-gray-500 font-mono mt-0.5">Stock Drill-down</p>
                                        </div>
                                    </div>

                                    {materialStats && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                                                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                                    <BarChart3 className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Available Stock</div>
                                                    <div className="text-3xl font-bold text-gray-900 font-mono">{materialStats.totalStock.toLocaleString()} <span className="text-base font-sans text-gray-400 font-medium">kg</span></div>
                                                </div>
                                            </div>
                                            {materialStats.nextExpiry && (
                                                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                                                    <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                                                        <Clock className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Next Expiry (FEFO)</div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl font-bold text-gray-900 font-mono">{new Date(materialStats.nextExpiry).toLocaleDateString()}</span>
                                                            <ExpiryBadge date={materialStats.nextExpiry} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search within material records..."
                                            value={drillSearch}
                                            onChange={e => setDrillSearch(e.target.value)}
                                            className="pl-9 h-11 bg-white border-gray-200 focus:ring-black shadow-sm"
                                        />
                                    </div>

                                    <InventoryTable rows={materialDrilldown} isLoading={isLoading} />
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="picker"
                                    variants={fadeUpContainer}
                                    initial="hidden"
                                    animate="show"
                                    exit={{ opacity: 0 }}
                                    className="space-y-6"
                                >
                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search materials by name or code..."
                                            value={materialSearch}
                                            onChange={e => setMaterialSearch(e.target.value)}
                                            className="pl-9 h-11 bg-white border-gray-200 focus:ring-black shadow-sm"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {isLoading ? (
                                            Array.from({ length: 8 }).map((_, i) => (
                                                <div key={i} className="animate-pulse h-36 bg-gray-100 rounded-xl border border-gray-200" />
                                            ))
                                        ) : distinctMaterials.length === 0 ? (
                                            <div className="col-span-full text-center py-20 text-gray-400">
                                                <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                                <p className="font-medium">No materials found in inventory.</p>
                                            </div>
                                        ) : distinctMaterials.map(m => (
                                            <motion.div variants={fadeUpItem} key={m.name}>
                                                <div 
                                                    className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-md cursor-pointer transition-all h-full flex flex-col group"
                                                    onClick={() => { setSelectedMaterial(m.name); setDrillSearch('') }}
                                                >
                                                    <div className="mb-4">
                                                        <h3 className="font-bold text-gray-900 group-hover:text-black line-clamp-1">{m.name}</h3>
                                                        <p className="text-xs text-gray-500 font-mono mt-1">{m.code}</p>
                                                    </div>
                                                    
                                                    <div className="mt-auto space-y-3">
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-gray-500">Total Stock</span>
                                                            <span className="font-bold font-mono text-gray-900">{m.totalStock.toLocaleString()} kg</span>
                                                        </div>
                                                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                                            <span className="text-xs text-gray-400 font-medium">{m.count} Active GRNs</span>
                                                            <ExpiryBadge date={m.nextExpiry} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </TabsContent>

                    {/* ── Tab 2: All Materials ── */}
                    <TabsContent value="all" className="focus-visible:outline-none">
                        <motion.div initial="hidden" animate="show" variants={fadeUpContainer} className="space-y-6">
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <motion.div variants={fadeUpItem} className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Total Enterprise Stock</p>
                                    <p className="text-3xl font-bold font-mono text-gray-900">
                                        {inventory ? inventory.reduce((s: number, i: any) => s + i.available, 0).toLocaleString() : '...'} <span className="text-base font-sans text-gray-400 font-medium">kg</span>
                                    </p>
                                </motion.div>
                                <motion.div variants={fadeUpItem} className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Impending Expiry</p>
                                    <div className="flex items-center gap-3">
                                        <p className="text-2xl font-bold font-mono text-gray-900">{inventory?.[0] ? new Date(inventory[0].itc_expiry_date).toLocaleDateString() : '–'}</p>
                                        {inventory?.[0] && <ExpiryBadge date={inventory[0].itc_expiry_date} />}
                                    </div>
                                </motion.div>
                                <motion.div variants={fadeUpItem} className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Active GRN Lines</p>
                                    <p className="text-3xl font-bold font-mono text-gray-900">{inventory?.length ?? '...'}</p>
                                </motion.div>
                            </div>

                            <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                <div className="relative w-full sm:max-w-md">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        placeholder="Search across all records..."
                                        value={allSearch}
                                        onChange={e => setAllSearch(e.target.value)}
                                        className="pl-9 h-10 border-gray-200 focus:ring-black"
                                    />
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <span className="text-sm font-medium text-gray-500 hidden sm:block">{showAll ? 'Viewing All Time' : 'Viewing Last 30 Days'}</span>
                                    <Button variant={showAll ? "default" : "outline"} className={showAll ? "bg-black text-white" : "border-gray-200"} onClick={() => setShowAll(v => !v)}>
                                        {showAll ? 'Show Recent Only' : 'Load All History'}
                                    </Button>
                                </div>
                            </motion.div>

                            <motion.div variants={fadeUpItem}>
                                <InventoryTable rows={allMaterialsData} isLoading={isLoading} />
                            </motion.div>

                        </motion.div>
                    </TabsContent>

                    {/* ── Tab 3: Container Wise ── */}
                    <TabsContent value="container" className="focus-visible:outline-none">
                        <AnimatePresence mode="wait">
                            {selectedContainer ? (
                                <motion.div 
                                    key="container-drilldown"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >
                                    <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-gray-200" onClick={() => { setSelectedContainer(null); setContainerDrillSearch('') }}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-100 rounded-lg">
                                                <Archive className="h-5 w-5 text-gray-700" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-bold text-gray-900">{selectedContainer}</h2>
                                                <p className="text-sm text-gray-500 font-mono mt-0.5">Container Allocation</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search contents..."
                                            value={containerDrillSearch}
                                            onChange={e => setContainerDrillSearch(e.target.value)}
                                            className="pl-9 h-11 bg-white border-gray-200 focus:ring-black shadow-sm"
                                        />
                                    </div>

                                    <InventoryTable rows={containerDrilldown} isLoading={isLoading} />
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="container-picker"
                                    variants={fadeUpContainer}
                                    initial="hidden"
                                    animate="show"
                                    exit={{ opacity: 0 }}
                                    className="space-y-6"
                                >
                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search container types..."
                                            value={containerSearch}
                                            onChange={e => setContainerSearch(e.target.value)}
                                            className="pl-9 h-11 bg-white border-gray-200 focus:ring-black shadow-sm"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {isLoading ? (
                                            Array.from({ length: 4 }).map((_, i) => (
                                                <div key={i} className="animate-pulse h-32 bg-gray-100 rounded-xl border border-gray-200" />
                                            ))
                                        ) : distinctContainers.length === 0 ? (
                                            <div className="col-span-full text-center py-20 text-gray-400">
                                                <Archive className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                                <p className="font-medium">No active containers found.</p>
                                            </div>
                                        ) : distinctContainers.map(c => (
                                            <motion.div variants={fadeUpItem} key={c.type}>
                                                <div 
                                                    className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:border-gray-400 hover:shadow-md cursor-pointer transition-all group"
                                                    onClick={() => { setSelectedContainer(c.type); setContainerDrillSearch('') }}
                                                >
                                                    <div className="h-12 w-12 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-black group-hover:text-white transition-colors">
                                                        <Archive className="h-6 w-6 text-gray-400 group-hover:text-white" />
                                                    </div>
                                                    <h3 className="font-bold text-gray-900 text-lg mb-1">{c.type}</h3>
                                                    <p className="text-sm font-medium text-gray-500 mb-1">{c.totalUnits} <span className="font-normal text-gray-400">Units Total</span></p>
                                                    <p className="text-xs text-gray-400">{c.count} Active GRNs</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </TabsContent>

                </Tabs>
            </div>
        </div>
    )
}

// ── Shared Inventory Table ────────────────────────────────────────────────────────

function InventoryTable({ rows, isLoading }: { rows: any[], isLoading: boolean }) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Material</th>
                            <th className="px-6 py-4 font-bold text-xs text-gray-500 uppercase tracking-wider">GRN / Location</th>
                            <th className="px-6 py-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-right">Available (kg)</th>
                            <th className="px-6 py-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Containers</th>
                            <th className="px-6 py-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Expiry (ITC)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-100 rounded mb-2"></div><div className="h-3 w-16 bg-gray-100 rounded"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-100 rounded mb-2"></div><div className="h-4 w-12 bg-gray-100 rounded-full"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-100 rounded ml-auto"></div></td>
                                    <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-100 rounded-full mx-auto"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-100 rounded mb-2"></div><div className="h-4 w-16 bg-gray-100 rounded-full"></div></td>
                                </tr>
                            ))
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium">No inventory records match your criteria.</td>
                            </tr>
                        ) : (
                            rows.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 mb-0.5">{item.material_name}</div>
                                        <div className="text-xs font-mono text-gray-500">{item.material_code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-mono text-sm text-gray-900 mb-1">{item.grn_no || item.id.substring(0, 8).toUpperCase()}</div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                            {item.storage_location || 'Unassigned'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-mono text-base font-bold text-gray-900">{item.available.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center gap-1.5 text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md text-xs font-semibold">
                                            <Archive className="h-3.5 w-3.5 text-gray-400" />
                                            {item.container_count} <span className="font-normal text-gray-500">{item.container_type}</span>
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-900 mb-1">{new Date(item.itc_expiry_date).toLocaleDateString()}</div>
                                        <ExpiryBadge date={item.itc_expiry_date} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}