'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Activity, Clock, AlertTriangle } from 'lucide-react'

interface CapacityCardProps {
    rpm: number
    biscuitsPerRev: number
    runtimeMinutes: number
    downtimeMinutes: number
    actualPacks?: number
}

export default function CapacityCard({
    rpm,
    biscuitsPerRev,
    runtimeMinutes,
    downtimeMinutes,
    actualPacks
}: CapacityCardProps) {

    // Logic: 
    // Theoretical Biscuits = RPM * BiscuitsPerRev * (Runtime - Downtime)
    // Let's assume 1 Pack = 100g = ~20 Biscuits (Configurable, simplfied here)
    const BISCUITS_PER_PACK = 20

    const effectiveRuntime = Math.max(0, runtimeMinutes - downtimeMinutes)
    const theoreticalBiscuits = rpm * biscuitsPerRev * effectiveRuntime
    const theoreticalPacks = Math.floor(theoreticalBiscuits / BISCUITS_PER_PACK)

    const efficiency = actualPacks && theoreticalPacks > 0
        ? Math.round((actualPacks / theoreticalPacks) * 100)
        : 100

    return (
        <Card className="border-l-4 border-l-blue-600">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase text-slate-500 font-bold tracking-wider flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Capacity Engine
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <div className="text-2xl font-bold text-slate-800">{theoreticalPacks}</div>
                        <div className="text-xs text-slate-500">Expected Packs</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-800">{effectiveRuntime} min</div>
                        <div className="text-xs text-slate-500">Effective Runtime</div>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-slate-100 p-2 rounded text-xs text-slate-600">
                    <span>RPM: <strong>{rpm}</strong></span>
                    <span>Downtime: <strong className="text-red-600">{downtimeMinutes}m</strong></span>
                </div>

                {actualPacks !== undefined && (
                    <div className="mt-4 pt-4 border-t">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium">Efficiency</span>
                            <span className={`font-bold ${efficiency < 85 ? 'text-red-500' : 'text-green-600'}`}>
                                {efficiency}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full ${efficiency < 85 ? 'bg-red-500' : 'bg-green-600'}`}
                                style={{ width: `${Math.min(100, efficiency)}%` }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
