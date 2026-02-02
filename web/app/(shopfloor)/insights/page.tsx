'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ScatterChart, Scatter, ReferenceLine
} from 'recharts'
import {
    TrendingUp, AlertTriangle, Clock, Truck, Package, Activity, DollarSign, Percent,
    Scale, Thermometer, Droplets, AlertCircle, CheckCircle2, Factory, Hammer
} from 'lucide-react'

// --- ADVANCED MOCK DATA GENERATOR ---

const GENERATE_DAYS = 30
const VENDORS = ['AgroCorp', 'PureFlour Ltd', 'SweetSugar Co', 'GlobalOils', 'PackRight']
const MATERIALS = ['Wheat Flour', 'Sugar', 'Palm Oil', 'Cocoa Powder', 'Wrapper Roll']
const MACHINES = ['Mixer A', 'Mixer B', 'Cutter 1', 'Oven Band 1', 'Packing Delta', 'Packing FlowWrap']
const SHIFTS = ['A', 'B', 'C']

// Metric Targets
const TARGET_OEE = 85
const TARGET_YIELD = 98
const TARGET_GATE_TIME = 30 // mins
const TARGET_MOISTURE = 3.5 // %
const SPEC_MOISTURE = 0.5 // +/-
const TARGET_WEIGHT = 11.5 // g
const SPEC_WEIGHT = 0.2 // +/-

// Helper to get random int
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
// Helper to get random float
const rndF = (min: number, max: number) => Number((Math.random() * (max - min) + min).toFixed(2))

const generateDetailedData = () => {
    const today = new Date()
    const inbound = []
    const quality = []
    const production = []
    const maintenance = []
    const financial = []
    const alerts = []

    for (let i = 0; i < GENERATE_DAYS; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - (GENERATE_DAYS - i))
        const dateStr = date.toISOString().split('T')[0]

        // --- 1. INBOUND & VENDOR ANALYTICS ---
        const numDeliveries = rnd(3, 8)
        for (let j = 0; j < numDeliveries; j++) {
            const vendor = VENDORS[rnd(0, VENDORS.length - 1)]
            const material = MATERIALS[rnd(0, MATERIALS.length - 1)]
            const challanQty = rnd(1000, 5000)
            const variance = rndF(-2.5, 3.5) // % Variance
            const netWeight = challanQty * (1 + (variance / 100))
            const gateTime = rnd(15, 90) // minutes
            const hasPhotos = Math.random() > 0.05 // 95% compliance
            const isHeld = Math.random() < 0.1 // 10% hold rate

            let holdReason = null
            if (isHeld) {
                const reasons = ['Docs Missing', 'High Variance', 'Suspect Seal', 'Quality Alert']
                holdReason = reasons[rnd(0, reasons.length - 1)]
                alerts.push({ date: dateStr, type: 'INBOUND', msg: `Gate Hold: ${vendor} (${holdReason})`, severity: 'Medium' })
            }
            if (Math.abs(variance) > 1.0) {
                alerts.push({ date: dateStr, type: 'INBOUND', msg: `High Variance: ${vendor} (${variance.toFixed(2)}%)`, severity: 'High' })
            }

            inbound.push({ date: dateStr, vendor, material, variance, gateTime, hasPhotos, isHeld, holdReason, netWeight })
        }

        // --- 2. QUALITY & SPC ---
        // Samples taken per shift
        for (let s = 0; s < 3; s++) {
            const shift = SHIFTS[s]
            // Moisture & Weight Samples
            const moisture = rndF(2.5, 5.0) // Target 3.5
            const weight = rndF(11.0, 12.0) // Target 11.5
            const ph = rndF(6.8, 7.4) // Target 7.1
            const foreignMatter = Math.random() < 0.02 // 2% risk

            if (moisture > TARGET_MOISTURE + SPEC_MOISTURE) alerts.push({ date: dateStr, type: 'QUALITY', msg: `Moisture Drift High: ${moisture.toFixed(2)}%`, severity: 'Medium' })
            if (foreignMatter) alerts.push({ date: dateStr, type: 'QUALITY', msg: `Foreign Matter Detected! (Shift ${shift})`, severity: 'Critical' })

            quality.push({ date: dateStr, shift, moisture, weight, ph, foreignMatter })
        }

        // --- 3. PRODUCTION & OEE ---
        let dailyGoodKg = 0
        let dailyWasteKg = 0

        MACHINES.forEach(machine => {
            if (machine.startsWith('Packing')) {
                const speed = rnd(180, 220) // Packs/min
                const runtime = rnd(400, 480) // Mins per shift (8hr = 480)
                const plannedTime = 480
                const downtime = 480 - runtime
                const output = speed * runtime
                const rejects = rnd(50, 500) // Packs
                const goodOutput = output - rejects

                const availability = (runtime / plannedTime) * 100
                const performance = (speed / 220) * 100
                const qualityScore = (goodOutput / output) * 100
                const oee = (availability * performance * qualityScore) / 10000

                dailyGoodKg += (goodOutput * 0.1) // 100g packs
                dailyWasteKg += (rejects * 0.1)

                production.push({ date: dateStr, machine, oee, output, rejects, downtime, availability, performance, qualityScore })

                if (downtime > 60) alerts.push({ date: dateStr, type: 'PRODUCTION', msg: `High Downtime: ${machine} (${downtime}m)`, severity: 'High' })
            }
        })

        // --- 4. FINANCIAL & COST ---
        const costWaste = dailyWasteKg * 2.5 // $2.5/kg avg material cost
        const costDowntime = maintenance.filter(m => m.date === dateStr).reduce((sum, m) => sum + m.cost, 0)
        financial.push({ date: dateStr, costWaste, costDowntime, revenue: dailyGoodKg * 5.0 }) // $5/kg sales

        // --- 5. MAINTENANCE ---
        const breakdowns = rnd(0, 3)
        for (let k = 0; k < breakdowns; k++) {
            const machine = MACHINES[rnd(0, MACHINES.length - 1)]
            const duration = rnd(10, 180)
            const type = Math.random() > 0.3 ? 'Unplanned' : 'Preventive'
            const cost = duration * 15 // $15/min est loss + parts
            maintenance.push({ date: dateStr, machine, duration, type, cost, reason: ['Sensor', 'Motor', 'Belt', 'Jam', 'Elec'].at(rnd(0, 4)) })
        }
    }

    return { inbound, quality, production, maintenance, financial, alerts: alerts.reverse() }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ff4d4f', '#d9d9d9']

export default function InsightsPage() {
    const data = useMemo(() => generateDetailedData(), [])
    const [timeRange, setTimeRange] = useState('30d')

    // --- KPI CALCULATIONS ---
    const totalRevenue = data.financial.reduce((s, i) => s + i.revenue, 0)
    const totalWasteCost = data.financial.reduce((s, i) => s + i.costWaste, 0)
    const avgOEE = data.production.reduce((s, i) => s + i.oee, 0) / data.production.length
    const holdRate = (data.inbound.filter(i => i.isHeld).length / data.inbound.length) * 100
    const varianceAvg = data.inbound.reduce((s, i) => s + Math.abs(i.variance), 0) / data.inbound.length
    const downtimeTotal = data.maintenance.reduce((s, i) => s + i.duration, 0)

    // Charts Data Prep
    const revenueTrend = data.financial.map(f => ({ date: f.date.split('-')[2], revenue: f.revenue, waste: f.costWaste }))
    const spcData = data.quality.map((q, i) => ({ i, val: q.weight, upper: TARGET_WEIGHT + SPEC_WEIGHT, lower: TARGET_WEIGHT - SPEC_WEIGHT, target: TARGET_WEIGHT }))
    const vendorScores = Array.from(new Set(data.inbound.map(i => i.vendor))).map(v => {
        const tx = data.inbound.filter(i => i.vendor === v)
        const avgVar = tx.reduce((s, i) => s + Math.abs(i.variance), 0) / tx.length
        return { name: v, variance: avgVar, volume: tx.length, holds: tx.filter(i => i.isHeld).length }
    })
    const downtimePareto = Object.entries(data.maintenance.reduce((acc: any, curr) => {
        acc[curr.reason] = (acc[curr.reason] || 0) + curr.duration
        return acc
    }, {})).map(([k, v]) => ({ reason: k, minutes: v })).sort((a: any, b: any) => b.minutes - a.minutes)

    return (
        <div className="p-4 md:p-8 space-y-8 bg-slate-50 min-h-screen">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Enterprise Analytics</h1>
                    <p className="text-slate-500">Integrated Intelligence: Inbound, Quality, Production, & Financials</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline"><Clock className="mr-2 h-4 w-4" /> Real-time</Button>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 Days</SelectItem>
                            <SelectItem value="30d">Last 30 Days</SelectItem>
                            <SelectItem value="90d">Last Quarter</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* LEFT: MAIN CONTENT TABS */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Executive KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-sm text-slate-500">Avg OEE Efficiency</div>
                                <div className="text-3xl font-bold text-blue-600">{avgOEE.toFixed(1)}%</div>
                                <div className="text-xs text-slate-400 mt-1">Target: {TARGET_OEE}%</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-sm text-slate-500">Cost of Waste (30d)</div>
                                <div className="text-3xl font-bold text-red-600">${totalWasteCost.toLocaleString()}</div>
                                <div className="text-xs text-slate-400 mt-1">Production Loss</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-sm text-slate-500">Gate Hold Rate</div>
                                <div className="text-3xl font-bold">{holdRate.toFixed(1)}%</div>
                                <div className="text-xs text-green-600 mt-1">-0.5% vs last month</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-sm text-slate-500">Maint. Downtime</div>
                                <div className="text-3xl font-bold text-amber-600">{Math.round(downtimeTotal / 60)} hrs</div>
                                <div className="text-xs text-slate-400 mt-1">Total Impact</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Tabs defaultValue="executive" className="w-full">
                        <TabsList className="w-full justify-start bg-white p-1 rounded-lg border overflow-x-auto">
                            <TabsTrigger value="executive">Executive</TabsTrigger>
                            <TabsTrigger value="inbound">Inbound & Vendors</TabsTrigger>
                            <TabsTrigger value="quality">Quality (SPC)</TabsTrigger>
                            <TabsTrigger value="production">Production</TabsTrigger>
                            <TabsTrigger value="financial">Financials</TabsTrigger>
                        </TabsList>

                        {/* 1. EXECUTIVE TAB */}
                        <TabsContent value="executive" className="space-y-4 pt-4">
                            <Card>
                                <CardHeader><CardTitle>Revenue vs Waste Cost Trend</CardTitle></CardHeader>
                                <CardContent className="h-[350px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={revenueTrend}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="date" />
                                            <YAxis />
                                            <Tooltip formatter={(val) => `$${val.toLocaleString()}`} />
                                            <Legend />
                                            <Area type="monotone" dataKey="revenue" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Est. Revenue" />
                                            <Area type="monotone" dataKey="waste" stackId="2" stroke="#ff4d4f" fill="#ff4d4f" name="Cost of Waste" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* 2. INBOUND TAB */}
                        <TabsContent value="inbound" className="space-y-4 pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card>
                                    <CardHeader><CardTitle>Vendor Scorecard (Variance vs Volume)</CardTitle></CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ScatterChart>
                                                <CartesianGrid />
                                                <XAxis type="number" dataKey="volume" name="Deliveries" />
                                                <YAxis type="number" dataKey="variance" name="Avg Variance %" />
                                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                <Scatter name="Vendors" data={vendorScores} fill="#8884d8">
                                                    {vendorScores.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                </Scatter>
                                            </ScatterChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                    <CardFooter className="text-xs text-slate-500">X: No. Deliveries, Y: Avg Variance %. Size: Hold Count.</CardFooter>
                                </Card>
                                <Card>
                                    <CardHeader><CardTitle>Gate Hold Distribution</CardTitle></CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={vendorScores} layout="vertical">
                                                <XAxis type="number" />
                                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                                                <Bar dataKey="holds" fill="#FF8042" name="Holds" radius={[0, 4, 4, 0]} />
                                                <Tooltip />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* 3. QUALITY TAB (SPC) */}
                        <TabsContent value="quality" className="space-y-4 pt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>SPC Control Chart: Biscuit Weight (g)</CardTitle>
                                    <CardDescription>Monitoring process capability against Target {TARGET_WEIGHT}g (+/-{SPEC_WEIGHT})</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[350px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={spcData.slice(-50)}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="i" tick={false} />
                                            <YAxis domain={[10.5, 12.5]} />
                                            <Tooltip />
                                            <ReferenceLine y={TARGET_WEIGHT} stroke="green" strokeDasharray="3 3" label="Target" />
                                            <ReferenceLine y={TARGET_WEIGHT + SPEC_WEIGHT} stroke="red" label="USL" />
                                            <ReferenceLine y={TARGET_WEIGHT - SPEC_WEIGHT} stroke="red" label="LSL" />
                                            <Line type="monotone" dataKey="val" stroke="#8884d8" dot={{ r: 2 }} name="Sample Weight" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* 4. PRODUCTION TAB */}
                        <TabsContent value="production" className="space-y-4 pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="col-span-2">
                                    <CardHeader><CardTitle>OEE by Machine</CardTitle></CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.production.slice(0, 50)}> {/* Sample subset for charts */}
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="machine" tick={{ fontSize: 10 }} />
                                                <YAxis domain={[50, 100]} />
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="availability" stackId="a" fill="#8884d8" name="Availability" />
                                                <Bar dataKey="performance" stackId="a" fill="#82ca9d" name="Performance" />
                                                <Bar dataKey="qualityScore" stackId="a" fill="#ffc658" name="Quality" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader><CardTitle>Downtime Causes</CardTitle></CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    // @ts-ignore
                                                    data={downtimePareto}
                                                    innerRadius={40}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="minutes"
                                                    nameKey="reason"
                                                >
                                                    {downtimePareto.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* 5. FINANCIAL TAB */}
                        <TabsContent value="financial" className="space-y-4 pt-4">
                            <Card>
                                <CardHeader><CardTitle>Financial Losses Breakdown</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold text-slate-700">Cost of Waste</h3>
                                        <div className="text-4xl font-bold text-red-500">${totalWasteCost.toLocaleString()}</div>
                                        <p className="text-sm text-slate-500">Material scrap from production defects.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold text-slate-700">Maintenance Cost</h3>
                                        <div className="text-4xl font-bold text-amber-500">${data.maintenance.reduce((s, i) => s + i.cost, 0).toLocaleString()}</div>
                                        <p className="text-sm text-slate-500">Parts & Labour for unplanned downtime.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                    </Tabs>
                </div>

                {/* RIGHT: INTELLIGENT ALERTS PANEL (FAULT INDICATORS) */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="h-full border-blue-200 bg-blue-50/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-blue-800">
                                <AlertCircle className="h-5 w-5" />
                                System Insights
                            </CardTitle>
                            <CardDescription>Auto-detected anomalies & suggested decisions.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[800px] overflow-y-auto pr-2">
                            {data.alerts.slice(0, 10).map((alert, idx) => (
                                <div key={idx} className={`p-3 rounded-md border text-sm shadow-sm bg-white ${alert.severity === 'Critical' ? 'border-red-500 border-l-4' :
                                        alert.severity === 'High' ? 'border-orange-400 border-l-4' :
                                            'border-blue-400 border-l-4'
                                    }`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <Badge variant="outline" className="text-[10px]">{alert.type}</Badge>
                                        <span className="text-[10px] text-slate-400">{alert.date.split('-').slice(1).join('/')}</span>
                                    </div>
                                    <div className="font-medium text-slate-800">{alert.msg}</div>
                                    <div className="mt-2 text-xs text-slate-500 flex gap-1 items-center">
                                        <TrendingUp className="h-3 w-3" />
                                        {alert.severity === 'Critical' ? 'Action: Quarantine & Recall' :
                                            alert.severity === 'High' ? 'Action: Supervisor Review' :
                                                'Action: Monitor Trend'}
                                    </div>
                                </div>
                            ))}
                            {data.alerts.length === 0 && (
                                <div className="text-center text-slate-500 py-8">System Nominal. No Active Alerts.</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
