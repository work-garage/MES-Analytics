'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { weighbridgeSchema } from '@/lib/validators/inbound'
import { useAuth } from '@/lib/store/auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import PhotoCapture from '@/components/business/PhotoCapture'
import { useRouter, useSearchParams } from 'next/navigation'
import { SensorStatusBadge } from '@/components/ui/sensor-status-badge'
import { ManualFallbackToggle } from '@/components/ui/manual-fallback-toggle'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertTriangle, Lock, Loader2, ArrowLeft, Truck, FileText, Scale, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function WeighbridgePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <p className="text-sm font-medium text-gray-500">Loading Weighbridge Module...</p>
                </div>
            </div>
        }>
            <WeighbridgeContent />
        </Suspense>
    )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null): value is string {
    return !!value && UUID_RE.test(value)
}

function WeighbridgeContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const rawEntryId = searchParams.get('entry_id')
    const entryId = isUuid(rawEntryId) ? rawEntryId : null
    const { user } = useAuth()

    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [netWeight, setNetWeight] = useState(0)
    const [discrepancy, setDiscrepancy] = useState<number | null>(null)
    const [showSupervisorModal, setShowSupervisorModal] = useState(false)
    const [supervisorPin, setSupervisorPin] = useState('')

    const [isManual, setIsManual] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [sensorStatus, setSensorStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE')

    const supabase = createClient()
    const form = useForm({
        resolver: zodResolver(weighbridgeSchema),
        defaultValues: {
            weighbridge_slip_no: '',
            gross_weight: 0,
            tare_weight: 0,
            net_weight: 0,
            photo: null,
            scale_photo_evidence: null,
            manual_override_reason: ''
        }
    })

    const gross = form.watch('gross_weight')
    const tare = form.watch('tare_weight')

    useEffect(() => {
        if (rawEntryId && !entryId) {
            toast.error('Invalid weighbridge link. Please select a vehicle from queue.')
            router.replace('/weighbridge')
        }
    }, [rawEntryId, entryId, router])

    // Fetch Gate Entry OR List Pending
    useEffect(() => {
        const fetchEntries = async () => {
            if (entryId) {
                const { data } = await supabase.from('gate_entries').select('*').eq('id', entryId).single()
                setGateEntry(data)
            } else {
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*')
                    .eq('status', 'CHECKED_IN')
                    .order('created_at', { ascending: true })

                setPendingEntries(data || [])
            }
        }
        fetchEntries()
    }, [entryId])

    // Calc Net & Discrepancy
    useEffect(() => {
        if (gross > 0 && tare >= 0) {
            const net = gross - tare
            setNetWeight(net)
            form.setValue('net_weight', net)

            if (gateEntry?.expected_qty) {
                const diff = Math.abs(net - gateEntry.expected_qty)
                const pct = (diff / gateEntry.expected_qty) * 100
                setDiscrepancy(pct)
            }
        }
    }, [gross, tare, gateEntry])

    const onSubmit = (values: any) => {
        if (discrepancy !== null && discrepancy > 5) {
            setShowSupervisorModal(true)
            return
        }
        processSubmission(values)
    }

    const processSubmission = async (values: any, supervisorId: string | null = null) => {
        if (!entryId) {
            toast.error('Invalid gate entry ID. Please reopen from queue.')
            return
        }
        if (!supervisorId && !user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }

        try {
            setIsSubmitting(true)

            let photoPath = null
            if (values.photo) {
                photoPath = `weighbridge/${Date.now()}_truck.jpg`
                await supabase.storage.from('weighbridge-photos').upload(photoPath, values.photo)
            }

            const { error } = await supabase.rpc('rpc_submit_weighbridge', {
                p_gate_entry_id: entryId,
                p_slip_no: values.weighbridge_slip_no,
                p_gross_weight: values.gross_weight,
                p_tare_weight: values.tare_weight,
                p_net_weight: values.net_weight,
                p_truck_photo: photoPath,
                p_scale_proof: null,
                p_supervisor_id: supervisorId ?? user!.id
            })

            if (error) throw error

            toast.success("Weighbridge Entry Confirmed")
            router.push(`/vehicle-inspection?id=${entryId}`)

        } catch (error: any) {
            toast.error("Submission Failed", { description: error.message })
        } finally {
            setIsSubmitting(false)
            setShowSupervisorModal(false)
        }
    }

    const handleSupervisorAuth = () => {
        if (supervisorPin === '1234') { // Mock PIN
            processSubmission(form.getValues(), '00000000-0000-0000-0000-000000000000')
        } else {
            toast.error("Invalid PIN")
        }
    }

    // --- View 1: Pending Queue ---
    if (!entryId && !gateEntry) {
        return (
            <div className="min-h-screen bg-[#FDFDFD] py-10 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Weighbridge Queue</h1>
                        <p className="text-gray-500 mt-1">Select a checked-in vehicle to record scale data.</p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card className="border-gray-200 shadow-sm overflow-hidden">
                            <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-3 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Vehicles ({pendingEntries.length})</span>
                            </div>
                            <CardContent className="p-0">
                                {pendingEntries.length === 0 ? (
                                    <div className="text-center py-16">
                                        <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
                                        <p className="text-gray-500 font-medium">No vehicles waiting at dock.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {pendingEntries.map((entry) => (
                                            <div key={entry.id} className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors group">
                                                <div className="flex items-center gap-5">
                                                    <div className="h-12 w-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
                                                        <Truck className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-lg text-gray-900">{entry.vehicle_number}</div>
                                                        <div className="text-sm text-gray-500 font-medium">{entry.driver_name}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <div className="text-right hidden sm:block">
                                                        <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Challan No</div>
                                                        <div className="font-mono text-sm text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded">{entry.challan_no}</div>
                                                    </div>
                                                    <Button 
                                                        onClick={() => router.push(`/weighbridge?entry_id=${entry.id}`)}
                                                        className="bg-black hover:bg-gray-800 text-white shadow-none group-hover:px-6 transition-all"
                                                    >
                                                        Weigh <ArrowRight className="h-4 w-4 ml-2" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        )
    }

    // --- View 2: Weighing Interface ---
    return (
        <div className="min-h-screen bg-[#FDFDFD] py-10 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                
                {/* Header Context */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
                    <Button variant="ghost" className="text-gray-500 hover:text-black -ml-4" onClick={() => router.push('/weighbridge')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Queue
                    </Button>
                    <SensorStatusBadge status={sensorStatus} lastSeen={new Date()} sensorName="SCALE-01" />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="border-gray-200 shadow-sm">
                        <CardHeader className="border-b border-gray-100 pb-6 bg-white rounded-t-xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gray-100 rounded-lg text-black">
                                    <Scale className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-2xl font-bold">Record Weight</CardTitle>
                            </div>

                            {/* Manifest Summary Box */}
                            {gateEntry && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Truck className="h-5 w-5 text-gray-400" />
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase">Vehicle</p>
                                            <p className="text-base font-bold text-gray-900">{gateEntry.vehicle_number}</p>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block w-px h-8 bg-gray-300"></div>
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-5 w-5 text-gray-400" />
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase">Expected Net Qty</p>
                                            <p className="text-base font-bold text-gray-900">{gateEntry.expected_qty} <span className="text-sm font-normal text-gray-500">kg</span></p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardHeader>
                        
                        <CardContent className="pt-6">
                            <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                                toast.error("Please fill all required fields")
                            })} className="space-y-8">
                                
                                {/* Sensor & Manual Override Area */}
                                <div className="flex justify-end">
                                    <ManualFallbackToggle enabled={isManual} onToggle={setIsManual} />
                                </div>

                                {/* Digital Scale Readout */}
                                <div className={`relative overflow-hidden rounded-2xl border-2 transition-colors duration-300 ${
                                    discrepancy !== null && discrepancy > 5 
                                        ? 'bg-red-50 border-red-200' 
                                        : 'bg-[#F8F9FA] border-gray-200'
                                } p-8 text-center shadow-inner`}>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Net Weight</p>
                                    <h2 className="text-6xl font-mono font-medium tracking-tight text-black">
                                        {netWeight} <span className="text-2xl text-gray-400 font-sans font-normal">kg</span>
                                    </h2>
                                    
                                    <AnimatePresence>
                                        {discrepancy !== null && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className={`mt-4 pt-4 border-t ${discrepancy > 5 ? 'border-red-200' : 'border-gray-200'}`}
                                            >
                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                                                    discrepancy > 5 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {discrepancy > 5 && <AlertTriangle className="h-4 w-4" />}
                                                    Variance: {discrepancy.toFixed(2)}%
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Input Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-gray-600 font-semibold">Gross Weight (kg)</Label>
                                        <Input 
                                            type="number" 
                                            className="h-12 text-lg font-mono bg-white"
                                            {...form.register('gross_weight', { valueAsNumber: true })} 
                                            readOnly={!isManual} 
                                        />
                                        {form.formState.errors.gross_weight && <p className="text-red-500 text-xs mt-1">{form.formState.errors.gross_weight.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-gray-600 font-semibold">Tare Weight (kg)</Label>
                                        <Input 
                                            type="number" 
                                            className="h-12 text-lg font-mono bg-white"
                                            {...form.register('tare_weight', { valueAsNumber: true })} 
                                            readOnly={!isManual} 
                                        />
                                        {form.formState.errors.tare_weight && <p className="text-red-500 text-xs mt-1">{form.formState.errors.tare_weight.message}</p>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                    <div className="space-y-2">
                                        <Label className="text-gray-600 font-semibold">Slip Number</Label>
                                        <Input 
                                            className="h-12 bg-white"
                                            {...form.register('weighbridge_slip_no')} 
                                            readOnly={!isManual} 
                                            placeholder="Scan barcode or enter manually..." 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-gray-600 font-semibold">Photo Evidence</Label>
                                        <Controller
                                            control={form.control}
                                            name="photo"
                                            render={({ field }) => (
                                                <div className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-1">
                                                    <PhotoCapture
                                                        label="Capture Scale & Truck"
                                                        onCapture={(f) => field.onChange(f)}
                                                        required
                                                    />
                                                </div>
                                            )}
                                        />
                                    </div>
                                </div>

                                <Button 
                                    type="submit" 
                                    className="w-full h-14 text-base font-semibold bg-black hover:bg-gray-800 text-white shadow-md transition-all" 
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
                                    Confirm Verified Weight
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Supervisor Override Modal */}
                <Dialog open={showSupervisorModal} onOpenChange={setShowSupervisorModal}>
                    <DialogContent className="sm:max-w-md border-red-100">
                        <DialogHeader>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                                <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <DialogTitle className="text-center text-xl">Tolerance Exceeded</DialogTitle>
                            <DialogDescription className="text-center pt-2">
                                Discrepancy is <strong className="text-red-600">{discrepancy?.toFixed(2)}%</strong> (Limit: 5%). <br/>
                                Supervisor sign-off is required to proceed.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4 px-2">
                            <div className="space-y-2">
                                <Label className="text-gray-700 font-semibold text-center block">Supervisor Authorization PIN</Label>
                                <div className="relative max-w-xs mx-auto">
                                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                    <Input
                                        type="password"
                                        className="pl-10 h-12 text-center text-lg tracking-[0.5em] font-mono font-bold border-gray-300 focus-visible:ring-black"
                                        value={supervisorPin}
                                        onChange={(e) => setSupervisorPin(e.target.value)}
                                        placeholder="••••"
                                        maxLength={4}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <DialogFooter className="sm:justify-between px-2 pb-2">
                            <Button variant="ghost" onClick={() => setShowSupervisorModal(false)} className="text-gray-500 hover:text-black">
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleSupervisorAuth} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
                                Authorize Variance
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </div>
    )
}