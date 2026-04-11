'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { 
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, 
    ResponsiveContainer, CartesianGrid, ReferenceLine, Cell 
} from 'recharts'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Package } from 'lucide-react'

export default function ProductionDashboard() {
    const supabase = createClient()
    const [isMounted, setIsMounted] = useState(false)
    const [currentTime, setCurrentTime] = useState("")

    useEffect(() => {
        setIsMounted(true)
        const updateTime = () => setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
        updateTime()
        const timer = setInterval(updateTime, 1000)
        return () => clearInterval(timer)
    }, [])

    // 1. Fetch KPI Stats
    const { data: stats } = useQuery({
        queryKey: ['kpi-stats'],
        queryFn: async () => {
            const { data } = await supabase.rpc('rpc_get_production_stats', { p_date: new Date().toISOString() })
            return data || {}
        }
    })

    // 2. Mock Trend Data
    const trendData = [
        { time: '08:00', output: 1200, target: 1500 },
        { time: '09:00', output: 1450, target: 1500 },
        { time: '10:00', output: 1100, target: 1500 }, 
        { time: '11:00', output: 1550, target: 1500 },
        { time: '12:00', output: 1500, target: 1500 },
        { time: '13:00', output: 1620, target: 1500 },
        { time: '14:00', output: 1480, target: 1500 },
    ]

    const paretoData = [
        { reason: 'Mechanical Fault', mins: 45 },
        { reason: 'Electrical Issue', mins: 30 },
        { reason: 'Material Shortage', mins: 15 },
        { reason: 'Changeover', mins: 10 },
    ]

    // High-end dark tooltip
    const CustomTooltip = ({ active, payload, label, unit = '' }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#111827] text-white border border-gray-800 p-3 rounded shadow-xl text-sm min-w-[150px]">
                    <p className="font-semibold text-gray-400 mb-2 border-b border-gray-700 pb-1">{label}</p>
                    <div className="space-y-1.5">
                        {payload.map((entry: any, index: number) => (
                            <div key={index} className="flex justify-between items-center gap-4">
                                <span className="flex items-center gap-2 text-gray-300">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                    {entry.name}
                                </span>
                                <span className="font-mono font-medium text-white">
                                    {entry.value.toLocaleString()} {unit}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }
        return null
    }

    if (!isMounted) return null

    return (
        <div className="min-h-screen bg-[#F9FAFB] font-sans text-[#111827] py-8 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-500">
            <div className="max-w-[1440px] mx-auto space-y-6">
                
                {/* --- Executive Header --- */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Production Telemetry</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1">Live factory performance and bottleneck analysis.</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium">
                        <div className="flex items-center gap-2 text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="font-mono">{currentTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Line Active
                        </div>
                    </div>
                </div>

                {/* --- Unified Telemetry Ribbon --- */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                    
                    {/* Metric 1 */}
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Output</p>
                            <Package className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-gray-900">
                                {(stats?.packs_produced || 0).toLocaleString()}
                            </span>
                            <span className="text-sm text-gray-500">packs</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> 5.2%
                            </span>
                            <span className="text-gray-500">Waste: <span className="font-mono text-gray-900">{stats?.waste_kg || 0} kg</span></span>
                        </div>
                    </div>

                    {/* Metric 2 */}
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aggregate Downtime</p>
                            <AlertTriangle className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-red-600">
                                {stats?.oven_downtime_mins || 0}
                            </span>
                            <span className="text-sm text-gray-500">mins</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="inline-flex items-center text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-medium">
                                <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" /> 12 mins
                            </span>
                            <span className="text-gray-500">vs yesterday</span>
                        </div>
                    </div>

                    {/* Metric 3 */}
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Line OEE</p>
                            <Activity className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-gray-900">
                                87.4<span className="text-2xl text-gray-400">%</span>
                            </span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mr-4">
                                <div className="bg-black h-1.5 rounded-full" style={{ width: '87.4%' }}></div>
                            </div>
                            <span className="text-gray-500 whitespace-nowrap">Target: 85%</span>
                        </div>
                    </div>
                </div>

                {/* --- Data Visualization --- */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Area Chart: Production Flow */}
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Throughput Velocity</h2>
                                <p className="text-xs text-gray-500 mt-1">Hourly production vs baseline capacity</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-600"></div> Actual</div>
                                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-gray-400"></div> Target</div>
                            </div>
                        </div>
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/>
                                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                    <XAxis 
                                        dataKey="time" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#6B7280', fontSize: 12 }} 
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'monospace' }} 
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '3 3' }} />
                                    <ReferenceLine y={1500} stroke="#9CA3AF" strokeDasharray="3 3" />
                                    <Area 
                                        type="monotone" 
                                        dataKey="output" 
                                        name="Output"
                                        stroke="#2563EB" 
                                        strokeWidth={2}
                                        fillOpacity={1} 
                                        fill="url(#colorOutput)" 
                                        activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Bar Chart: Loss Analysis */}
                    <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <div className="mb-6">
                            <h2 className="text-base font-bold text-gray-900">Loss Attribution</h2>
                            <p className="text-xs text-gray-500 mt-1">Downtime reasons by duration</p>
                        </div>
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={paretoData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                                    <XAxis 
                                        type="number" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'monospace' }}
                                    />
                                    <YAxis 
                                        dataKey="reason" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        width={100}
                                        tick={{ fill: '#4B5563', fontSize: 11, fontWeight: 500 }} 
                                    />
                                    <Tooltip content={<CustomTooltip unit="mins" />} cursor={{ fill: '#F9FAFB' }} />
                                    <Bar 
                                        dataKey="mins" 
                                        name="Duration"
                                        radius={[0, 4, 4, 0]} 
                                        barSize={24}
                                    >
                                        {paretoData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#111827' : '#6B7280'} fillOpacity={1 - (index * 0.2)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}