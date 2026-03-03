'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArrowRightLeft, Package, Search, ChevronLeft, Clock, TrendingDown, BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

// ── Helpers ──────────────────────────────────────────────────────────────────────

function daysLeft(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ date }: { date: string }) {
    const days = daysLeft(date)
    if (days < 0) return <Badge className="bg-red-700 text-white font-bold">Expired</Badge>
    if (days <= 7) return <Badge className="bg-red-500 text-white font-bold">{days}d left ⚠️</Badge>
    if (days <= 30) return <Badge className="bg-yellow-500 text-white font-bold">{days}d left</Badge>
    return <Badge className="bg-green-500 text-white font-bold">{days}d left</Badge>
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
    const supabase = createClient()
    const router = useRouter()

    // Per-tab search values
    const [materialSearch, setMaterialSearch] = useState('')   // material picker search
    const [drillSearch, setDrillSearch] = useState('')          // material drill-down search
    const [allSearch, setAllSearch] = useState('')              // all materials search
    const [containerSearch, setContainerSearch] = useState('')  // container picker search
    const [containerDrillSearch, setContainerDrillSearch] = useState('') // container drill-down search

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

    // All Materials tab
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

    // Distinct materials for picker — filtered by materialSearch
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

    // Material drill-down
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

    // Stats for selected material
    const materialStats = useMemo(() => {
        if (!inventory || !selectedMaterial) return null
        const rows = inventory.filter((i: any) => i.material_name === selectedMaterial)
        const totalStock = rows.reduce((s: number, i: any) => s + i.available, 0)
        const nextExpiry = rows[0]?.itc_expiry_date ?? null
        return { totalStock, nextExpiry }
    }, [inventory, selectedMaterial])

    // Distinct container types — filtered by containerSearch
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

    // Container drill-down — filtered by containerDrillSearch
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

    // ── Layout ────────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-6xl mx-auto py-6 space-y-4">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Main Inventory (FEFO View)</h1>
                    <p className="text-slate-500 text-sm">Track GRN-wise stock, Expiry, and Container Units</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push('/stores/transfer')}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer
                    </Button>
                    <Button onClick={() => router.push('/production/sub-batch')}>
                        <Package className="h-4 w-4 mr-2" /> Start Production
                    </Button>
                </div>
            </div>

            {/* ── Tabs ── Material Wise is the default (defaultValue) ── */}
            <Tabs defaultValue="material" className="w-full">
                <TabsList className="w-full h-14 grid grid-cols-3 mb-6 bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger value="material" className="h-full text-base font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        📦 Material Wise
                    </TabsTrigger>
                    <TabsTrigger value="all" className="h-full text-base font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        📋 All Materials
                    </TabsTrigger>
                    <TabsTrigger value="container" className="h-full text-base font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        🗃️ Container Wise
                    </TabsTrigger>
                </TabsList>

                {/* ── Tab 1: Material Wise ── */}
                <TabsContent value="material">
                    {selectedMaterial ? (
                        <div className="space-y-4">
                            {/* Back + header */}
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="sm" onClick={() => { setSelectedMaterial(null); setDrillSearch('') }}>
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                                </Button>
                                <h2 className="text-xl font-bold">{selectedMaterial}</h2>
                            </div>

                            {/* Stats for this material */}
                            {materialStats && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Card className="bg-blue-50 border-blue-200">
                                        <CardContent className="pt-4 pb-3 flex items-center gap-3">
                                            <BarChart3 className="h-8 w-8 text-blue-500" />
                                            <div>
                                                <div className="text-xs font-medium text-blue-600">Total Stock (kg)</div>
                                                <div className="text-3xl font-bold text-blue-900">{materialStats.totalStock.toLocaleString()}</div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    {materialStats.nextExpiry && (
                                        <Card className="bg-amber-50 border-amber-300">
                                            <CardContent className="pt-4 pb-3">
                                                <div className="flex items-start gap-3">
                                                    <Clock className="h-8 w-8 text-amber-500 mt-1" />
                                                    <div>
                                                        <div className="text-xs font-medium text-amber-700">Next Expiry (FEFO First)</div>
                                                        <div className="text-2xl font-bold text-amber-900">{new Date(materialStats.nextExpiry).toLocaleDateString()}</div>
                                                        <div className="mt-1">
                                                            <ExpiryBadge date={materialStats.nextExpiry} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {/* Search within this material's entries */}
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search GRN, location, expiry..."
                                    value={drillSearch}
                                    onChange={e => setDrillSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            <InventoryTable rows={materialDrilldown} isLoading={isLoading} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Search for material picker */}
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search material..."
                                    value={materialSearch}
                                    onChange={e => setMaterialSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {isLoading ? (
                                    [1, 2, 3].map(i => <Card key={i} className="animate-pulse h-28 bg-slate-100" />)
                                ) : distinctMaterials.length === 0 ? (
                                    <div className="col-span-3 text-center py-16 text-slate-400">No materials found.</div>
                                ) : distinctMaterials.map(m => (
                                    <Card key={m.name}
                                        className="hover:shadow-md cursor-pointer transition-all border-2 hover:border-indigo-300"
                                        onClick={() => { setSelectedMaterial(m.name); setDrillSearch('') }}>
                                        <CardContent className="pt-4 pb-4">
                                            <div className="font-bold text-lg">{m.name}</div>
                                            <div className="text-xs text-slate-500 mb-3">{m.code}</div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600 font-medium">{m.count} GRN line{m.count !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="mt-2 text-sm text-slate-500">{m.totalStock.toLocaleString()} kg available</div>
                                            <div className="mt-2 flex items-center gap-1 text-sm font-semibold">
                                                <Clock className="h-4 w-4 text-amber-500" />
                                                <span className="text-slate-600 mr-1">First expiry in</span>
                                                <ExpiryBadge date={m.nextExpiry} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* ── Tab 2: All Materials ── */}
                <TabsContent value="all">
                    <div className="space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Card className="bg-blue-50">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Stock (kg)</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{inventory ? inventory.reduce((s: number, i: any) => s + i.available, 0).toLocaleString() : '...'}</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-amber-50">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Next Expiry</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{inventory?.[0] ? new Date(inventory[0].itc_expiry_date).toLocaleDateString() : '–'}</div>
                                    {inventory?.[0] && <ExpiryBadge date={inventory[0].itc_expiry_date} />}
                                </CardContent>
                            </Card>
                            <Card className="bg-slate-50">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">GRN Lines Active</CardTitle></CardHeader>
                                <CardContent><div className="text-2xl font-bold">{inventory?.length ?? '...'}</div></CardContent>
                            </Card>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search material, GRN, location..."
                                    value={allSearch}
                                    onChange={e => setAllSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-500">{showAll ? 'All records' : 'Recent 30 days'}</span>
                                <Button variant="outline" size="sm" onClick={() => setShowAll(v => !v)}>
                                    {showAll ? 'Show Recent Only' : 'Show All Records'}
                                </Button>
                            </div>
                        </div>
                        <InventoryTable rows={allMaterialsData} isLoading={isLoading} />
                    </div>
                </TabsContent>

                {/* ── Tab 3: Container Wise ── */}
                <TabsContent value="container">
                    {selectedContainer ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="sm" onClick={() => { setSelectedContainer(null); setContainerDrillSearch('') }}>
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                                </Button>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Package className="h-5 w-5 text-indigo-600" /> {selectedContainer}
                                </h2>
                            </div>
                            {/* Search in container drill-down */}
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search material, GRN, location..."
                                    value={containerDrillSearch}
                                    onChange={e => setContainerDrillSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <InventoryTable rows={containerDrilldown} isLoading={isLoading} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Search for container picker */}
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search container type..."
                                    value={containerSearch}
                                    onChange={e => setContainerSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {isLoading ? (
                                    [1, 2, 3, 4].map(i => <Card key={i} className="animate-pulse h-28 bg-slate-100" />)
                                ) : distinctContainers.length === 0 ? (
                                    <div className="col-span-4 text-center py-16 text-slate-400">No containers found.</div>
                                ) : distinctContainers.map(c => (
                                    <Card key={c.type}
                                        className="hover:shadow-md cursor-pointer transition-all border-2 hover:border-indigo-300 text-center"
                                        onClick={() => { setSelectedContainer(c.type); setContainerDrillSearch('') }}>
                                        <CardContent className="pt-6 pb-4">
                                            <Package className="h-10 w-10 mx-auto mb-2 text-indigo-500" />
                                            <div className="font-bold text-lg">{c.type}</div>
                                            <div className="text-sm text-slate-500">{c.count} GRN lines</div>
                                            <div className="text-xs text-slate-400">{c.totalUnits} units total</div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

// ── Shared Inventory Table ────────────────────────────────────────────────────────

function InventoryTable({ rows, isLoading }: { rows: any[], isLoading: boolean }) {
    return (
        <Card>
            <CardContent className="p-0">
                <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="p-3 font-semibold">Material</th>
                                <th className="p-3 font-semibold">GRN / Location</th>
                                <th className="p-3 font-semibold text-right">Available (kg)</th>
                                <th className="p-3 font-semibold text-center">Containers</th>
                                <th className="p-3 font-semibold">Expiry (ITC)</th>
                                <th className="p-3 font-semibold">Days Left</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading Stock...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No records found.</td></tr>
                            ) : rows.map((item: any) => (
                                <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                                    <td className="p-3">
                                        <div className="font-semibold">{item.material_name}</div>
                                        <div className="text-xs text-slate-500">{item.material_code}</div>
                                    </td>
                                    <td className="p-3">
                                        <div className="font-mono text-xs">{item.grn_no || item.id.substring(0, 8)}</div>
                                        <Badge variant="outline" className="text-xs font-normal mt-0.5">{item.storage_location || 'Unassigned'}</Badge>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-slate-800">{item.available.toLocaleString()}</td>
                                    <td className="p-3 text-center">
                                        <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-1 rounded text-xs">
                                            <Package className="h-3 w-3" />{item.container_count} {item.container_type}
                                        </span>
                                    </td>
                                    <td className="p-3 text-sm font-medium">{item.itc_expiry_date}</td>
                                    <td className="p-3"><ExpiryBadge date={item.itc_expiry_date} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )
}
