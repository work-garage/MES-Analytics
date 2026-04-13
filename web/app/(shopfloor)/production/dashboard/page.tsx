'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Line,
    ResponsiveContainer,
    CartesianGrid,
    ReferenceLine,
    Cell,
} from 'recharts'
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    Clock,
    Database,
    Package,
    Scale,
    Truck,
    Wrench,
} from 'lucide-react'
import { getDowntimeReasonLabel } from '@/lib/constants/maintenance'

type PackingLogRow = {
    created_at?: string
    sku_id?: string | null
    packs_produced?: number | string
    wrapper_waste_kg?: number | string
    md_reject_count?: number | string
}

type DowntimeTicketRow = {
    created_at?: string
    start_ts?: string | null
    end_ts?: string | null
    status?: string | null
    reason_code?: string | null
    remarks?: string | null
    machine_id?: string | null
    machines?: { name?: string | null; code?: string | null } | null
}

type GateEntryRow = {
    status?: string | null
    expected_qty?: number | string | null
}

type QaInspectionRow = {
    result?: string | null
}

type DispatchRow = {
    quantity?: number | string | null
}

type FgBatchRow = {
    produced_qty?: number | string | null
    good_qty?: number | string | null
}

type TrendPoint = {
    time: string
    output: number
    target: number
}

type ParetoPoint = {
    reason: string
    mins: number
}

type RecipeMixRow = {
    recipe: string
    packs: number
}

type MachineDowntimeRow = {
    machine: string
    totalMins: number
    ticketCount: number
    activeCount: number
    lastStart: string | null
}

type SourceCoverageRow = {
    route: string
    table: string
    records: number
    capturedFields: string
}

type InventoryBlockRow = {
    recipe: string
    material: string
    requiredKg: number
    availableKg: number
    shortageKg: number
}

type InventoryReadinessSummary = {
    totalActiveRecipes: number
    blockedRecipeCount: number
    readyRecipeCount: number
    totalShortageKg: number
    topBlockedRows: InventoryBlockRow[]
}

type AllTimeKpis = {
    totalGateEntries: number
    totalExpectedIntakeKg: number
    qaAcceptedCount: number
    qaRejectedCount: number
    totalSubBatches: number
    totalPackingRuns: number
    totalPacksProduced: number
    totalRejects: number
    totalWasteKg: number
    totalDowntimeTickets: number
    totalDowntimeMins: number
    totalDispatches: number
    totalDispatchedPacks: number
    dispatchVsProductionPct: number
}

type DashboardData = {
    packsProduced: number
    rejects: number
    wrapperWasteKg: number
    downtimeWasteKg: number
    totalWasteKg: number
    outputLossKg: number
    downtimeMins: number
    outputDeltaPct: number
    downtimeDeltaMins: number
    oeePct: number
    availabilityPct: number
    performancePct: number
    qualityPct: number
    oeeBaselinePct: number
    targetRatePerHour: number
    trendData: TrendPoint[]
    paretoData: ParetoPoint[]
    recipeMix: RecipeMixRow[]
    activeDowntimeCount: number
    allTime: AllTimeKpis
    machineDowntime: MachineDowntimeRow[]
    allTimeRecipeMix: RecipeMixRow[]
    sourceCoverage: SourceCoverageRow[]
    inventoryReadiness: InventoryReadinessSummary
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const toNumber = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function toDayKey(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

function parseDowntimeMetrics(remarks: string | null | undefined) {
    if (!remarks) return null
    const marker = '__METRICS__'
    const line = remarks.split('\n').find((entry) => entry.startsWith(marker))
    if (!line) return null
    try {
        return JSON.parse(line.slice(marker.length))
    } catch {
        return null
    }
}

function getDurationMins(ticket: DowntimeTicketRow, openEndMs: number) {
    const startMs = ticket.start_ts ? new Date(ticket.start_ts).getTime() : NaN
    const closed = String(ticket.status || '').toUpperCase() === 'CLOSED'
    const endMsRaw = ticket.end_ts ? new Date(ticket.end_ts).getTime() : (closed ? NaN : openEndMs)

    const hasDuration = Number.isFinite(startMs) && Number.isFinite(endMsRaw) && endMsRaw > startMs
    const actualMins = hasDuration ? Math.round((endMsRaw - startMs) / 60000) : 0

    if (actualMins > 0) return actualMins

    const metrics = parseDowntimeMetrics(ticket.remarks)
    return Math.max(Math.round(toNumber(metrics?.estimated_duration_mins)), 0)
}

function getDateMs(value: string | undefined) {
    if (!value) return NaN
    return new Date(value).getTime()
}

function clampPct(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(value, 100))
}

function buildRecipeMix(rows: PackingLogRow[], recipeNameMap: Map<string, string>, limit: number) {
    const byRecipe = new Map<string, number>()
    for (const row of rows) {
        const key = String(row.sku_id || 'UNMAPPED')
        byRecipe.set(key, (byRecipe.get(key) || 0) + toNumber(row.packs_produced))
    }

    return Array.from(byRecipe.entries())
        .map(([key, packs]) => ({
            recipe: key === 'UNMAPPED' ? 'Unmapped Recipe' : (recipeNameMap.get(key) || key.slice(0, 8)),
            packs: Math.round(packs),
        }))
        .sort((a, b) => b.packs - a.packs)
        .slice(0, limit)
}

export default function ProductionDashboard() {
    const supabase = createClient()
    const [isMounted, setIsMounted] = useState(false)
    const [currentTime, setCurrentTime] = useState('')

    useEffect(() => {
        setIsMounted(true)
        const updateTime = () => setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
        updateTime()
        const timer = setInterval(updateTime, 1000)
        return () => clearInterval(timer)
    }, [])

    const { data: dashboardData } = useQuery<DashboardData>({
        queryKey: ['production-dashboard-live', new Date().toDateString()],
        refetchInterval: 15_000,
        queryFn: async () => {
            const now = new Date()
            const nowMs = now.getTime()
            const todayStart = new Date(now)
            todayStart.setHours(0, 0, 0, 0)

            const yesterdayStart = new Date(todayStart)
            yesterdayStart.setDate(yesterdayStart.getDate() - 1)

            const weekStart = new Date(todayStart)
            weekStart.setDate(weekStart.getDate() - 7)

            const tomorrowStart = new Date(todayStart)
            tomorrowStart.setDate(tomorrowStart.getDate() + 1)

            const [
                packingWeekRes,
                packingAllRes,
                downtimeAllRes,
                gateRes,
                qaRes,
                subBatchRes,
                cuttingRes,
                bakingRes,
                fgBatchRes,
                dispatchRes,
                recipeTemplateRes,
                recipeItemsRes,
                inventoryRes,
            ] = await Promise.all([
                supabase
                    .from('packing_process_logs')
                    .select('created_at, sku_id, packs_produced, wrapper_waste_kg, md_reject_count')
                    .gte('created_at', weekStart.toISOString())
                    .lt('created_at', tomorrowStart.toISOString()),
                supabase
                    .from('packing_process_logs')
                    .select('created_at, sku_id, packs_produced, wrapper_waste_kg, md_reject_count'),
                supabase
                    .from('downtime_tickets')
                    .select('created_at, start_ts, end_ts, status, reason_code, remarks, machine_id, machines(name, code)'),
                supabase
                    .from('gate_entries')
                    .select('status, expected_qty'),
                supabase
                    .from('qa_inspections')
                    .select('result'),
                supabase
                    .from('sub_batches')
                    .select('id'),
                supabase
                    .from('cutting_logs')
                    .select('id'),
                supabase
                    .from('baking_process_logs')
                    .select('id'),
                supabase
                    .from('fg_batches')
                    .select('produced_qty, good_qty'),
                supabase
                    .from('dispatches')
                    .select('quantity'),
                supabase
                    .from('recipe_templates')
                    .select('id, sku, name, is_active')
                    .eq('is_active', true),
                supabase
                    .from('recipe_items')
                    .select('template_id, material_id, qty_per_batch, materials(name, material_code)'),
                supabase
                    .from('main_inventory')
                    .select('material_id, available_qty, grns(status)'),
            ])

            if (packingWeekRes.error) throw packingWeekRes.error
            if (packingAllRes.error) throw packingAllRes.error
            if (downtimeAllRes.error) throw downtimeAllRes.error
            if (gateRes.error) throw gateRes.error
            if (qaRes.error) throw qaRes.error
            if (subBatchRes.error) throw subBatchRes.error
            if (cuttingRes.error) throw cuttingRes.error
            if (bakingRes.error) throw bakingRes.error
            if (fgBatchRes.error) throw fgBatchRes.error
            if (dispatchRes.error) throw dispatchRes.error
            if (recipeTemplateRes.error) throw recipeTemplateRes.error
            if (recipeItemsRes.error) throw recipeItemsRes.error
            if (inventoryRes.error) throw inventoryRes.error

            const packingRows = (packingWeekRes.data || []) as PackingLogRow[]
            const packingAllRows = (packingAllRes.data || []) as PackingLogRow[]
            const downtimeRows = (downtimeAllRes.data || []) as DowntimeTicketRow[]
            const gateRows = (gateRes.data || []) as GateEntryRow[]
            const qaRows = (qaRes.data || []) as QaInspectionRow[]
            const dispatchRows = (dispatchRes.data || []) as DispatchRow[]
            const fgBatchRows = (fgBatchRes.data || []) as FgBatchRow[]
            const recipeTemplateRows = (recipeTemplateRes.data || []) as Array<{ id?: string; sku?: string | null; name?: string | null; is_active?: boolean | null }>
            const recipeItemRows = (recipeItemsRes.data || []) as Array<{ template_id?: string | null; material_id?: string | null; qty_per_batch?: number | string | null; materials?: { name?: string | null; material_code?: string | null } | null }>
            const inventoryRows = (inventoryRes.data || []) as Array<{ material_id?: string | null; available_qty?: number | string | null; grns?: { status?: string | null } | null }>

            const todayStartMs = todayStart.getTime()
            const yesterdayStartMs = yesterdayStart.getTime()
            const tomorrowStartMs = tomorrowStart.getTime()

            const overlapsWindow = (row: DowntimeTicketRow, windowStartMs: number, windowEndMs: number) => {
                const startMs = row.start_ts ? new Date(row.start_ts).getTime() : getDateMs(row.created_at)
                const rawEndMs = row.end_ts ? new Date(row.end_ts).getTime() : nowMs

                if (!Number.isFinite(startMs)) return false
                const endMs = Number.isFinite(rawEndMs) ? rawEndMs : nowMs
                return startMs < windowEndMs && endMs > windowStartMs
            }

            const overlapMins = (row: DowntimeTicketRow, windowStartMs: number, windowEndMs: number) => {
                const startMsRaw = row.start_ts ? new Date(row.start_ts).getTime() : getDateMs(row.created_at)
                const endMsRaw = row.end_ts ? new Date(row.end_ts).getTime() : nowMs

                if (!Number.isFinite(startMsRaw)) return 0
                const startMs = Math.max(startMsRaw, windowStartMs)
                const endMs = Math.min(Number.isFinite(endMsRaw) ? endMsRaw : nowMs, windowEndMs)
                if (endMs <= startMs) return 0
                return Math.max(Math.round((endMs - startMs) / 60000), 0)
            }

            const todayPacking = packingRows.filter((row) => {
                const ms = getDateMs(row.created_at)
                return Number.isFinite(ms) && ms >= todayStartMs && ms < tomorrowStartMs
            })
            const yesterdayPacking = packingRows.filter((row) => {
                const ms = getDateMs(row.created_at)
                return Number.isFinite(ms) && ms >= yesterdayStartMs && ms < todayStartMs
            })

            const todayTickets = downtimeRows.filter((row) => overlapsWindow(row, todayStartMs, tomorrowStartMs))
            const yesterdayTickets = downtimeRows.filter((row) => overlapsWindow(row, yesterdayStartMs, todayStartMs))

            const packsProduced = todayPacking.reduce((sum, row) => sum + toNumber(row.packs_produced), 0)
            const yesterdayPacks = yesterdayPacking.reduce((sum, row) => sum + toNumber(row.packs_produced), 0)
            const rejects = todayPacking.reduce((sum, row) => sum + toNumber(row.md_reject_count), 0)
            const wrapperWasteKg = todayPacking.reduce((sum, row) => sum + toNumber(row.wrapper_waste_kg), 0)

            const downtimeMins = todayTickets.reduce((sum, row) => sum + overlapMins(row, todayStartMs, tomorrowStartMs), 0)
            const yesterdayDowntimeMins = yesterdayTickets.reduce((sum, row) => sum + overlapMins(row, yesterdayStartMs, todayStartMs), 0)

            const downtimeWasteKg = todayTickets.reduce((sum, row) => {
                const metrics = parseDowntimeMetrics(row.remarks)
                return sum + toNumber(metrics?.estimated_wastage_kg)
            }, 0)

            const outputLossKg = todayTickets.reduce((sum, row) => {
                const metrics = parseDowntimeMetrics(row.remarks)
                return sum + toNumber(metrics?.estimated_output_loss_kg)
            }, 0)

            const totalWasteKg = wrapperWasteKg + downtimeWasteKg

            const outputDeltaPct = yesterdayPacks > 0
                ? ((packsProduced - yesterdayPacks) / yesterdayPacks) * 100
                : (packsProduced > 0 ? 100 : 0)

            const downtimeDeltaMins = downtimeMins - yesterdayDowntimeMins

            const historicalRows = packingRows.filter((row) => {
                const ms = getDateMs(row.created_at)
                return Number.isFinite(ms) && ms >= weekStart.getTime() && ms < todayStartMs
            })

            const todayHourlyMap = new Map<number, number>()
            for (const row of todayPacking) {
                if (!row.created_at) continue
                const hour = new Date(row.created_at).getHours()
                todayHourlyMap.set(hour, (todayHourlyMap.get(hour) || 0) + toNumber(row.packs_produced))
            }

            const hourBaselineMap = new Map<number, { sum: number; days: Set<string> }>()
            for (const row of historicalRows) {
                if (!row.created_at) continue
                const stamp = new Date(row.created_at)
                const hour = stamp.getHours()
                const key = toDayKey(stamp)
                const existing = hourBaselineMap.get(hour) || { sum: 0, days: new Set<string>() }
                existing.sum += toNumber(row.packs_produced)
                existing.days.add(key)
                hourBaselineMap.set(hour, existing)
            }

            const elapsedHours = Math.max(now.getHours() + 1, 1)
            const baselineHourTargets = Array.from(hourBaselineMap.values())
                .map((entry) => entry.days.size > 0 ? (entry.sum / entry.days.size) : 0)
                .filter((value) => value > 0)

            const fallbackTargetPerHour = baselineHourTargets.length > 0
                ? (baselineHourTargets.reduce((sum, value) => sum + value, 0) / baselineHourTargets.length)
                : (packsProduced > 0 ? (packsProduced / elapsedHours) : 0)

            const getTargetForHour = (hour: number) => {
                const baseline = hourBaselineMap.get(hour)
                if (!baseline || baseline.days.size === 0) return fallbackTargetPerHour
                return baseline.sum / baseline.days.size
            }

            const trendStartHour = Math.max(0, now.getHours() - 7)
            const trendData: TrendPoint[] = []
            for (let hour = trendStartHour; hour <= now.getHours(); hour += 1) {
                trendData.push({
                    time: `${String(hour).padStart(2, '0')}:00`,
                    output: Math.round(todayHourlyMap.get(hour) || 0),
                    target: Math.round(getTargetForHour(hour)),
                })
            }

            const targetSoFar = Array.from({ length: elapsedHours }, (_, hour) => hour)
                .reduce<number>((sum, hour) => sum + getTargetForHour(hour), 0)

            const plannedMins = Math.max(Math.round((nowMs - todayStartMs) / 60000), 1)
            const availabilityPct = clampPct(((plannedMins - Math.min(downtimeMins, plannedMins)) / plannedMins) * 100)
            const performancePct = targetSoFar > 0 ? clampPct((packsProduced / targetSoFar) * 100) : 0
            const qualityPct = packsProduced > 0 ? clampPct(((packsProduced - rejects) / packsProduced) * 100) : 0
            const oeePct = clampPct((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100)

            const historicalTotalPacks = historicalRows.reduce((sum, row) => sum + toNumber(row.packs_produced), 0)
            const historicalDistinctDays = new Set(
                historicalRows
                    .filter((row) => Boolean(row.created_at))
                    .map((row) => toDayKey(new Date(String(row.created_at))))
            )
            const historicalAvgPacksPerDay = historicalDistinctDays.size > 0
                ? (historicalTotalPacks / historicalDistinctDays.size)
                : 0

            const dayMs = 24 * 60 * 60 * 1000
            const baselineSamples: number[] = []
            for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
                const dayStartMs = todayStartMs - (dayOffset * dayMs)
                const dayEndMs = dayStartMs + dayMs

                const dayPacking = packingRows.filter((row) => {
                    const ms = getDateMs(row.created_at)
                    return Number.isFinite(ms) && ms >= dayStartMs && ms < dayEndMs
                })

                const dayPacks = dayPacking.reduce((sum, row) => sum + toNumber(row.packs_produced), 0)
                const dayRejects = dayPacking.reduce((sum, row) => sum + toNumber(row.md_reject_count), 0)
                const dayDowntime = downtimeRows.reduce((sum, row) => sum + overlapMins(row, dayStartMs, dayEndMs), 0)

                if (dayPacks <= 0 && dayDowntime <= 0) continue

                const dayAvailability = clampPct(((1440 - Math.min(dayDowntime, 1440)) / 1440) * 100)
                const dayPerformance = historicalAvgPacksPerDay > 0
                    ? clampPct((dayPacks / historicalAvgPacksPerDay) * 100)
                    : (dayPacks > 0 ? 100 : 0)
                const dayQuality = dayPacks > 0 ? clampPct(((dayPacks - dayRejects) / dayPacks) * 100) : 0
                const dayOee = clampPct((dayAvailability / 100) * (dayPerformance / 100) * (dayQuality / 100) * 100)
                baselineSamples.push(dayOee)
            }

            const oeeBaselinePct = baselineSamples.length > 0
                ? (baselineSamples.reduce((sum, value) => sum + value, 0) / baselineSamples.length)
                : oeePct

            const paretoMap = new Map<string, number>()
            for (const row of todayTickets) {
                const reason = getDowntimeReasonLabel(row.reason_code)
                const mins = overlapMins(row, todayStartMs, tomorrowStartMs)
                paretoMap.set(reason, (paretoMap.get(reason) || 0) + mins)
            }

            const paretoData = Array.from(paretoMap.entries())
                .map(([reason, mins]) => ({ reason, mins: Math.round(mins) }))
                .sort((a, b) => b.mins - a.mins)
                .slice(0, 5)

            const recipeKeys = Array.from(new Set([
                ...todayPacking.map((row) => String(row.sku_id || 'UNMAPPED')),
                ...packingAllRows.map((row) => String(row.sku_id || 'UNMAPPED')),
            ])).filter((key) => key !== 'UNMAPPED')

            const recipeIdKeys = recipeKeys.filter((key) => UUID_REGEX.test(key))
            const recipeSkuKeys = recipeKeys.filter((key) => !UUID_REGEX.test(key))
            const recipeNameMap = new Map<string, string>()

            if (recipeIdKeys.length > 0) {
                const { data: recipesById, error: byIdError } = await supabase
                    .from('recipe_templates')
                    .select('id, sku, name')
                    .in('id', recipeIdKeys)

                if (byIdError) throw byIdError

                for (const row of recipesById || []) {
                    const label = String(row.name || row.sku || row.id)
                    recipeNameMap.set(String(row.id), label)
                    if (row.sku) recipeNameMap.set(String(row.sku), label)
                }
            }

            if (recipeSkuKeys.length > 0) {
                const { data: recipesBySku, error: bySkuError } = await supabase
                    .from('recipe_templates')
                    .select('id, sku, name')
                    .in('sku', recipeSkuKeys)

                if (bySkuError) throw bySkuError

                for (const row of recipesBySku || []) {
                    const label = String(row.name || row.sku || row.id)
                    recipeNameMap.set(String(row.sku || row.id), label)
                    recipeNameMap.set(String(row.id), label)
                }
            }

            const recipeMix = buildRecipeMix(todayPacking, recipeNameMap, 4)
            const allTimeRecipeMix = buildRecipeMix(packingAllRows, recipeNameMap, 6)

            const activeDowntimeCount = downtimeRows.filter((row) => String(row.status || '').toUpperCase() !== 'CLOSED').length

            const allTimePacks = packingAllRows.reduce((sum, row) => sum + toNumber(row.packs_produced), 0)
            const allTimeRejects = packingAllRows.reduce((sum, row) => sum + toNumber(row.md_reject_count), 0)
            const allTimeWrapperWasteKg = packingAllRows.reduce((sum, row) => sum + toNumber(row.wrapper_waste_kg), 0)
            const allTimeDowntimeMins = downtimeRows.reduce((sum, row) => sum + getDurationMins(row, nowMs), 0)
            const allTimeDowntimeWasteKg = downtimeRows.reduce((sum, row) => {
                const metrics = parseDowntimeMetrics(row.remarks)
                return sum + toNumber(metrics?.estimated_wastage_kg)
            }, 0)

            const machineMap = new Map<string, MachineDowntimeRow & { lastStartMs: number }>()
            for (const row of downtimeRows) {
                const machineLabel = row.machines?.name
                    ? `${row.machines.name}${row.machines.code ? ` (${row.machines.code})` : ''}`
                    : (row.machine_id ? `Machine ${String(row.machine_id).slice(0, 8)}` : 'Unassigned')

                const mins = getDurationMins(row, nowMs)
                const status = String(row.status || '').toUpperCase()
                const isActive = status !== 'CLOSED'
                const lastStartMs = row.start_ts ? new Date(row.start_ts).getTime() : 0

                const existing = machineMap.get(machineLabel) || {
                    machine: machineLabel,
                    totalMins: 0,
                    ticketCount: 0,
                    activeCount: 0,
                    lastStart: null,
                    lastStartMs: 0,
                }

                existing.totalMins += mins
                existing.ticketCount += 1
                if (isActive) existing.activeCount += 1

                if (lastStartMs > existing.lastStartMs) {
                    existing.lastStartMs = lastStartMs
                    existing.lastStart = row.start_ts || null
                }

                machineMap.set(machineLabel, existing)
            }

            const machineDowntime = Array.from(machineMap.values())
                .map(({ lastStartMs: _ignore, ...row }) => row)
                .sort((a, b) => b.totalMins - a.totalMins)
                .slice(0, 8)

            const qaAcceptedCount = qaRows.filter((row) => String(row.result || '').toUpperCase() === 'ACCEPT').length
            const qaRejectedCount = gateRows.filter((row) => String(row.status || '').toUpperCase().includes('REJECT')).length
            const totalExpectedIntakeKg = gateRows.reduce((sum, row) => sum + toNumber(row.expected_qty), 0)
            const totalDispatches = dispatchRows.length
            const totalDispatchedPacks = dispatchRows.reduce((sum, row) => sum + toNumber(row.quantity), 0)

            const allTime: AllTimeKpis = {
                totalGateEntries: gateRows.length,
                totalExpectedIntakeKg: Number(totalExpectedIntakeKg.toFixed(2)),
                qaAcceptedCount,
                qaRejectedCount,
                totalSubBatches: subBatchRes.data?.length || 0,
                totalPackingRuns: packingAllRows.length,
                totalPacksProduced: Math.round(allTimePacks),
                totalRejects: Math.round(allTimeRejects),
                totalWasteKg: Number((allTimeWrapperWasteKg + allTimeDowntimeWasteKg).toFixed(2)),
                totalDowntimeTickets: downtimeRows.length,
                totalDowntimeMins: Math.round(allTimeDowntimeMins),
                totalDispatches,
                totalDispatchedPacks: Math.round(totalDispatchedPacks),
                dispatchVsProductionPct: allTimePacks > 0 ? clampPct((totalDispatchedPacks / allTimePacks) * 100) : 0,
            }

            const availableByMaterial = new Map<string, number>()
            for (const row of inventoryRows) {
                const materialId = String(row.material_id || '')
                if (!materialId) continue

                const status = String(row.grns?.status || '').toUpperCase()
                if (status && status !== 'RECEIVED') continue

                const available = toNumber(row.available_qty)
                availableByMaterial.set(materialId, (availableByMaterial.get(materialId) || 0) + available)
            }

            const recipeNameById = new Map<string, string>()
            for (const recipe of recipeTemplateRows) {
                const recipeId = String(recipe.id || '')
                if (!recipeId) continue
                recipeNameById.set(recipeId, String(recipe.name || recipe.sku || recipeId.slice(0, 8)))
            }

            const itemsByTemplateId = new Map<string, Array<{ materialId: string; materialName: string; requiredKg: number }>>()
            for (const row of recipeItemRows) {
                const templateId = String(row.template_id || '')
                const materialId = String(row.material_id || '')
                if (!templateId || !materialId) continue

                const requiredKg = toNumber(row.qty_per_batch)
                if (requiredKg <= 0) continue

                const materialName = String(row.materials?.name || row.materials?.material_code || materialId.slice(0, 8))
                const existing = itemsByTemplateId.get(templateId) || []
                existing.push({ materialId, materialName, requiredKg })
                itemsByTemplateId.set(templateId, existing)
            }

            let blockedRecipeCount = 0
            const blockRows: InventoryBlockRow[] = []

            for (const recipe of recipeTemplateRows) {
                const recipeId = String(recipe.id || '')
                if (!recipeId) continue

                const items = itemsByTemplateId.get(recipeId) || []
                if (items.length === 0) continue

                let blockedForRecipe = false
                for (const item of items) {
                    const availableKg = availableByMaterial.get(item.materialId) || 0
                    if (availableKg + 0.0001 < item.requiredKg) {
                        blockedForRecipe = true
                        blockRows.push({
                            recipe: recipeNameById.get(recipeId) || recipeId.slice(0, 8),
                            material: item.materialName,
                            requiredKg: Number(item.requiredKg.toFixed(3)),
                            availableKg: Number(availableKg.toFixed(3)),
                            shortageKg: Number((item.requiredKg - availableKg).toFixed(3)),
                        })
                    }
                }

                if (blockedForRecipe) {
                    blockedRecipeCount += 1
                }
            }

            const totalActiveRecipes = recipeTemplateRows.length
            const inventoryReadiness: InventoryReadinessSummary = {
                totalActiveRecipes,
                blockedRecipeCount,
                readyRecipeCount: Math.max(totalActiveRecipes - blockedRecipeCount, 0),
                totalShortageKg: Number(blockRows.reduce((sum, row) => sum + row.shortageKg, 0).toFixed(3)),
                topBlockedRows: blockRows
                    .sort((a, b) => b.shortageKg - a.shortageKg)
                    .slice(0, 5),
            }

            const sourceCoverage: SourceCoverageRow[] = [
                {
                    route: '/gate',
                    table: 'gate_entries',
                    records: gateRows.length,
                    capturedFields: 'vehicle/vendor/material/challan/expected_qty/status',
                },
                {
                    route: '/qa',
                    table: 'qa_inspections',
                    records: qaRows.length,
                    capturedFields: 'result/moisture/odour/expiry/inspector',
                },
                {
                    route: '/production/sub-batch',
                    table: 'sub_batches',
                    records: subBatchRes.data?.length || 0,
                    capturedFields: 'recipe/shift/batch_no/start_ts/operator',
                },
                {
                    route: '/production/cutting',
                    table: 'cutting_logs',
                    records: cuttingRes.data?.length || 0,
                    capturedFields: 'stack_type/weight/rpm/photo/machine',
                },
                {
                    route: '/production/oven',
                    table: 'baking_process_logs',
                    records: bakingRes.data?.length || 0,
                    capturedFields: 'gauge/moisture/color/taste/result/machine',
                },
                {
                    route: '/production/packing',
                    table: 'packing_process_logs',
                    records: packingAllRows.length,
                    capturedFields: 'sku/packs/waste/rejects/disposition/photo',
                },
                {
                    route: '/maintenance/downtime',
                    table: 'downtime_tickets',
                    records: downtimeRows.length,
                    capturedFields: 'machine/reason/start/end/status/remarks',
                },
                {
                    route: '/dispatch/create',
                    table: 'dispatches',
                    records: totalDispatches,
                    capturedFields: 'dispatch_no/fg_batch/qty/truck/driver/datetime',
                },
                {
                    route: '/production/fg-batch',
                    table: 'fg_batches',
                    records: fgBatchRows.length,
                    capturedFields: 'sku/produced_qty/good_qty/reject_count/expiry',
                },
            ]

            return {
                packsProduced: Math.round(packsProduced),
                rejects: Math.round(rejects),
                wrapperWasteKg: Number(wrapperWasteKg.toFixed(2)),
                downtimeWasteKg: Number(downtimeWasteKg.toFixed(2)),
                totalWasteKg: Number(totalWasteKg.toFixed(2)),
                outputLossKg: Number(outputLossKg.toFixed(2)),
                downtimeMins: Math.round(downtimeMins),
                outputDeltaPct,
                downtimeDeltaMins,
                oeePct,
                availabilityPct,
                performancePct,
                qualityPct,
                oeeBaselinePct,
                targetRatePerHour: Number(fallbackTargetPerHour.toFixed(0)),
                trendData,
                paretoData,
                recipeMix,
                activeDowntimeCount,
                allTime,
                machineDowntime,
                allTimeRecipeMix,
                sourceCoverage,
                inventoryReadiness,
            }
        },
    })

    const defaultDashboard: DashboardData = {
        packsProduced: 0,
        rejects: 0,
        wrapperWasteKg: 0,
        downtimeWasteKg: 0,
        totalWasteKg: 0,
        outputLossKg: 0,
        downtimeMins: 0,
        outputDeltaPct: 0,
        downtimeDeltaMins: 0,
        oeePct: 0,
        availabilityPct: 0,
        performancePct: 0,
        qualityPct: 0,
        oeeBaselinePct: 0,
        targetRatePerHour: 0,
        trendData: [],
        paretoData: [],
        recipeMix: [],
        activeDowntimeCount: 0,
        allTime: {
            totalGateEntries: 0,
            totalExpectedIntakeKg: 0,
            qaAcceptedCount: 0,
            qaRejectedCount: 0,
            totalSubBatches: 0,
            totalPackingRuns: 0,
            totalPacksProduced: 0,
            totalRejects: 0,
            totalWasteKg: 0,
            totalDowntimeTickets: 0,
            totalDowntimeMins: 0,
            totalDispatches: 0,
            totalDispatchedPacks: 0,
            dispatchVsProductionPct: 0,
        },
        machineDowntime: [],
        allTimeRecipeMix: [],
        sourceCoverage: [],
        inventoryReadiness: {
            totalActiveRecipes: 0,
            blockedRecipeCount: 0,
            readyRecipeCount: 0,
            totalShortageKg: 0,
            topBlockedRows: [],
        },
    }

    const dashboard: DashboardData = {
        ...defaultDashboard,
        ...(dashboardData || {}),
        trendData: dashboardData?.trendData ?? defaultDashboard.trendData,
        paretoData: dashboardData?.paretoData ?? defaultDashboard.paretoData,
        recipeMix: dashboardData?.recipeMix ?? defaultDashboard.recipeMix,
        machineDowntime: dashboardData?.machineDowntime ?? defaultDashboard.machineDowntime,
        allTimeRecipeMix: dashboardData?.allTimeRecipeMix ?? defaultDashboard.allTimeRecipeMix,
        sourceCoverage: dashboardData?.sourceCoverage ?? defaultDashboard.sourceCoverage,
        inventoryReadiness: dashboardData?.inventoryReadiness ?? defaultDashboard.inventoryReadiness,
        allTime: { ...defaultDashboard.allTime, ...(dashboardData?.allTime || {}) },
    }

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
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Production Telemetry</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1">Live + accumulated manufacturing KPIs sourced from submitted shopfloor records.</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium">
                        <div className="flex items-center gap-2 text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="font-mono">{currentTime}</span>
                        </div>
                        {dashboard.activeDowntimeCount > 0 ? (
                            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-md shadow-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                {dashboard.activeDowntimeCount} Active Downtime
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md shadow-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                Line Active
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Today Output</p>
                            <Package className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-gray-900">{dashboard.packsProduced.toLocaleString()}</span>
                            <span className="text-sm text-gray-500">packs</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${dashboard.outputDeltaPct >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                                {dashboard.outputDeltaPct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> : <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />}
                                {Math.abs(dashboard.outputDeltaPct).toFixed(1)}%
                            </span>
                            <span className="text-gray-500">Waste: <span className="font-mono text-gray-900">{dashboard.totalWasteKg.toFixed(2)} kg</span></span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">MD rejects: <span className="font-mono text-gray-900">{dashboard.rejects}</span></div>
                    </div>

                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Today Downtime</p>
                            <AlertTriangle className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-red-600">{dashboard.downtimeMins}</span>
                            <span className="text-sm text-gray-500">mins</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${dashboard.downtimeDeltaMins <= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                                {dashboard.downtimeDeltaMins <= 0 ? <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> : <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />}
                                {Math.abs(dashboard.downtimeDeltaMins)} mins
                            </span>
                            <span className="text-gray-500">vs yesterday</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Estimated output loss: <span className="font-mono text-gray-900">{dashboard.outputLossKg.toFixed(2)} kg</span></div>
                    </div>

                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Line OEE</p>
                            <Activity className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-semibold font-mono text-gray-900">{dashboard.oeePct.toFixed(1)}<span className="text-2xl text-gray-400">%</span></span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mr-4">
                                <div className="bg-black h-1.5 rounded-full" style={{ width: `${dashboard.oeePct}%` }}></div>
                            </div>
                            <span className="text-gray-500 whitespace-nowrap">Baseline: {dashboard.oeeBaselinePct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">All-Time Output</div>
                        <div className="mt-2 text-3xl font-mono font-semibold text-gray-900">{dashboard.allTime.totalPacksProduced.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">from {dashboard.allTime.totalPackingRuns.toLocaleString()} packing logs</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">All-Time Downtime</div>
                        <div className="mt-2 text-3xl font-mono font-semibold text-red-700">{dashboard.allTime.totalDowntimeMins.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">mins across {dashboard.allTime.totalDowntimeTickets.toLocaleString()} tickets</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">All-Time Dispatch</div>
                        <div className="mt-2 text-3xl font-mono font-semibold text-gray-900">{dashboard.allTime.totalDispatchedPacks.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">packs in {dashboard.allTime.totalDispatches.toLocaleString()} dispatches</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dispatch / Production</div>
                        <div className="mt-2 text-3xl font-mono font-semibold text-gray-900">{dashboard.allTime.dispatchVsProductionPct.toFixed(1)}%</div>
                        <div className="text-xs text-gray-500">formula: dispatched packs / produced packs</div>
                    </div>
                </div>

                <div className={`border rounded-xl shadow-sm p-5 ${dashboard.inventoryReadiness.blockedRecipeCount > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">Post-GRN Start Readiness</div>
                            <h3 className="text-lg font-bold text-gray-900 mt-1">Blocked by Inventory Status</h3>
                        </div>
                        {dashboard.inventoryReadiness.blockedRecipeCount > 0 ? (
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-red-100 text-red-800 border border-red-200 text-sm font-medium">
                                <AlertTriangle className="h-4 w-4" />
                                {dashboard.inventoryReadiness.blockedRecipeCount} recipe(s) blocked
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-sm font-medium">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70"></span>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
                                </span>
                                All active recipes ready
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
                        <div className="bg-white/80 border border-white rounded-md p-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Active Recipes</div>
                            <div className="text-2xl font-mono font-semibold text-gray-900 mt-1">{dashboard.inventoryReadiness.totalActiveRecipes}</div>
                        </div>
                        <div className="bg-white/80 border border-white rounded-md p-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Ready Now</div>
                            <div className="text-2xl font-mono font-semibold text-emerald-700 mt-1">{dashboard.inventoryReadiness.readyRecipeCount}</div>
                        </div>
                        <div className="bg-white/80 border border-white rounded-md p-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Total Shortage</div>
                            <div className="text-2xl font-mono font-semibold text-red-700 mt-1">{dashboard.inventoryReadiness.totalShortageKg.toFixed(3)} kg</div>
                        </div>
                    </div>
                    {dashboard.inventoryReadiness.topBlockedRows.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {dashboard.inventoryReadiness.topBlockedRows.map((row, index) => (
                                <div key={`${row.recipe}-${row.material}-${index}`} className="bg-white/90 border border-red-100 rounded-md p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                                    <div className="text-gray-700">
                                        <span className="font-semibold text-gray-900">{row.recipe}</span>
                                        <span className="mx-2 text-gray-400">|</span>
                                        <span>{row.material}</span>
                                    </div>
                                    <div className="font-mono text-red-800">
                                        need {row.requiredKg.toFixed(3)} kg / avail {row.availableKg.toFixed(3)} kg / short {row.shortageKg.toFixed(3)} kg
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 text-xs text-gray-600 space-y-1">
                    <div className="font-semibold text-gray-900 mb-1">Formula & Data Lineage</div>
                    <p>OEE = Availability x Performance x Quality, where Availability = (Planned Mins - Downtime Mins) / Planned Mins, Performance = Actual Packs / Target Packs, and Quality = (Packs - MD Rejects) / Packs.</p>
                    <p>All-Time Waste (kg) = SUM(packing_process_logs.wrapper_waste_kg) + SUM(downtime_tickets.remarks.__METRICS__.estimated_wastage_kg).</p>
                    <p>All-Time Downtime (mins) = SUM((end_ts - start_ts) in minutes) using live now for open tickets.</p>
                    <p>Dispatch / Production % = SUM(dispatches.quantity) / SUM(packing_process_logs.packs_produced) x 100.</p>
                    <p>Sources: gate_entries, qa_inspections, sub_batches, cutting_logs, baking_process_logs, packing_process_logs, downtime_tickets, fg_batches, dispatches, recipe_templates, recipe_items, main_inventory.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Throughput Velocity</h2>
                                <p className="text-xs text-gray-500 mt-1">Hourly production vs baseline capacity</p>
                            </div>
                        </div>
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height={300} minWidth={0}>
                                <AreaChart data={dashboard.trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'monospace' }} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '3 3' }} />
                                    <ReferenceLine y={dashboard.targetRatePerHour} stroke="#9CA3AF" strokeDasharray="3 3" />
                                    <Area type="monotone" dataKey="output" name="Output" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorOutput)" activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} />
                                    <Line type="monotone" dataKey="target" name="Target" stroke="#6B7280" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <div className="mb-6">
                            <h2 className="text-base font-bold text-gray-900">Loss Attribution</h2>
                            <p className="text-xs text-gray-500 mt-1">Today downtime reasons by duration</p>
                        </div>
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height={300} minWidth={0}>
                                <BarChart data={dashboard.paretoData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'monospace' }} />
                                    <YAxis dataKey="reason" type="category" axisLine={false} tickLine={false} width={100} tick={{ fill: '#4B5563', fontSize: 11, fontWeight: 500 }} />
                                    <Tooltip content={<CustomTooltip unit="mins" />} cursor={{ fill: '#F9FAFB' }} />
                                    <Bar dataKey="mins" name="Duration" radius={[0, 4, 4, 0]} barSize={24}>
                                        {dashboard.paretoData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#111827' : '#6B7280'} fillOpacity={1 - (index * 0.2)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Wrench className="h-4 w-4" />Machine Downtime (All-Time)</h3>
                        {dashboard.machineDowntime.length === 0 ? (
                            <p className="text-sm text-gray-500">No downtime tickets found.</p>
                        ) : (
                            <div className="space-y-2">
                                {dashboard.machineDowntime.map((row) => (
                                    <div key={row.machine} className="border rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium text-sm text-gray-900">{row.machine}</div>
                                            <div className="text-sm font-mono text-red-700">{row.totalMins.toLocaleString()} mins</div>
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500 flex items-center gap-4">
                                            <span>tickets: <span className="font-mono text-gray-900">{row.ticketCount}</span></span>
                                            <span>active: <span className="font-mono text-gray-900">{row.activeCount}</span></span>
                                            <span>last start: <span className="font-mono text-gray-900">{row.lastStart ? new Date(row.lastStart).toLocaleString() : 'N/A'}</span></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Scale className="h-4 w-4" />Recipe-Wise Output (All-Time)</h3>
                        {dashboard.allTimeRecipeMix.length === 0 ? (
                            <p className="text-sm text-gray-500">No recipe-linked packs found.</p>
                        ) : (
                            <div className="space-y-2">
                                {dashboard.allTimeRecipeMix.map((row) => (
                                    <div key={row.recipe} className="border rounded-lg p-3 bg-gray-50 flex items-center justify-between">
                                        <span className="text-sm text-gray-700 truncate pr-4">{row.recipe}</span>
                                        <span className="font-mono text-sm font-semibold text-gray-900">{row.packs.toLocaleString()} packs</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Database className="h-4 w-4" />Data Collection Coverage (Supervisor)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="py-2 pr-3">Route</th>
                                    <th className="py-2 pr-3">Table</th>
                                    <th className="py-2 pr-3">Records</th>
                                    <th className="py-2 pr-3">Captured Parameters</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboard.sourceCoverage.map((row) => (
                                    <tr key={`${row.route}-${row.table}`} className="border-b last:border-0">
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-700">{row.route}</td>
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-700">{row.table}</td>
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-900">{row.records.toLocaleString()}</td>
                                        <td className="py-2 pr-3 text-xs text-gray-600">{row.capturedFields}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 text-xs text-gray-600">
                    <div className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Truck className="h-4 w-4" />Additional All-Time Operational KPIs</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                        <div className="border rounded p-3 bg-gray-50">Gate Entries: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.totalGateEntries.toLocaleString()}</span></div>
                        <div className="border rounded p-3 bg-gray-50">Expected Intake: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.totalExpectedIntakeKg.toFixed(2)} kg</span></div>
                        <div className="border rounded p-3 bg-gray-50">QA Accepted: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.qaAcceptedCount.toLocaleString()}</span></div>
                        <div className="border rounded p-3 bg-gray-50">QA Rejected: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.qaRejectedCount.toLocaleString()}</span></div>
                        <div className="border rounded p-3 bg-gray-50">Sub-Batches: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.totalSubBatches.toLocaleString()}</span></div>
                        <div className="border rounded p-3 bg-gray-50">Total Rejects: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.totalRejects.toLocaleString()}</span></div>
                        <div className="border rounded p-3 bg-gray-50">All-Time Waste: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.totalWasteKg.toFixed(2)} kg</span></div>
                        <div className="border rounded p-3 bg-gray-50">Dispatch Fill %: <span className="font-mono font-semibold text-gray-900">{dashboard.allTime.dispatchVsProductionPct.toFixed(1)}%</span></div>
                    </div>
                </div>
            </div>
        </div>
    )
}
