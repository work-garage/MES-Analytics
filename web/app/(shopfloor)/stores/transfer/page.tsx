'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { useRouter } from 'next/navigation'

type TransferFormValues = {
    material_id: string
    source_inventory_id: string
    qty: number
    destination_id: string
    destination_name: string
}

type SourceLot = {
    inventory_id: string
    material_id: string
    material_name: string
    material_code: string
    grn_id: string
    grn_no: string
    available_qty: number
    storage_location: string
    expiry_date: string | null
}

const NEW_DESTINATION = '__new__'

function generateTransferNo() {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const rand = Math.floor(Math.random() * 900 + 100)
    return `TR-${date}-${time}-${rand}`
}

export default function TransferPage() {
    const router = useRouter()
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [selectedMaterial, setSelectedMaterial] = useState<string>('')

    const { data: materials } = useQuery({
        queryKey: ['materials'],
        queryFn: async () => {
            const { data } = await supabase.from('materials').select('id, name, material_code').eq('category', 'RAW')
            return data || []
        }
    })

    const { data: sourceLots } = useQuery({
        queryKey: ['transfer-source-lots', selectedMaterial],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('main_inventory')
                .select(`
                    id,
                    material_id,
                    available_qty,
                    materials(name, material_code),
                    grns(id, grn_no, storage_location, itc_expiry_date, status)
                `)
                .eq('material_id', selectedMaterial)
                .gt('available_qty', 0)

            if (error) throw error

            return (data || [])
                .filter((row: any) => row.grns?.status === 'RECEIVED')
                .map((row: any) => ({
                    inventory_id: row.id,
                    material_id: row.material_id,
                    material_name: row.materials?.name ?? 'Unknown',
                    material_code: row.materials?.material_code ?? '',
                    grn_id: row.grns?.id ?? '',
                    grn_no: row.grns?.grn_no ?? 'N/A',
                    available_qty: Number(row.available_qty || 0),
                    storage_location: row.grns?.storage_location ?? 'MAIN_STORE',
                    expiry_date: row.grns?.itc_expiry_date ?? null,
                } as SourceLot))
                .sort((a: SourceLot, b: SourceLot) => {
                    const ad = a.expiry_date || '9999-12-31'
                    const bd = b.expiry_date || '9999-12-31'
                    return ad.localeCompare(bd)
                })
        },
        enabled: !!selectedMaterial,
    })

    const { data: destinations } = useQuery({
        queryKey: ['sub-inventories'],
        queryFn: async () => {
            const { data, error } = await supabase.from('sub_inventories').select('id, name').order('name')
            if (error) throw error
            return data || []
        },
    })

    const form = useForm<TransferFormValues>({
        defaultValues: {
            material_id: '',
            source_inventory_id: '',
            qty: 0,
            destination_id: '',
            destination_name: '',
        }
    })

    const onTransfer = async (values: TransferFormValues) => {
        if (!user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }
        if (!values.material_id) {
            toast.error('Select what to transfer (material).')
            return
        }
        if (!values.source_inventory_id) {
            toast.error('Select source GRN lot to transfer from.')
            return
        }
        if (Number(values.qty) <= 0) {
            toast.error('Transfer quantity must be greater than zero.')
            return
        }

        const selectedLot = (sourceLots || []).find(lot => lot.inventory_id === values.source_inventory_id)
        if (!selectedLot) {
            toast.error('Selected source lot is invalid. Refresh and retry.')
            return
        }
        if (Number(values.qty) > selectedLot.available_qty) {
            toast.error(`Transfer qty cannot exceed available qty (${selectedLot.available_qty.toFixed(2)} kg).`)
            return
        }

        const isNewDestination = values.destination_id === NEW_DESTINATION
        if (!isNewDestination && !values.destination_id) {
            toast.error('Select destination sub-inventory.')
            return
        }
        if (isNewDestination && !values.destination_name.trim()) {
            toast.error('Enter new destination name.')
            return
        }

        setIsSubmitting(true)
        try {
            let destinationName = ''

            if (isNewDestination) {
                const { data: newDest, error: newDestError } = await supabase
                    .from('sub_inventories')
                    .insert({
                        name: values.destination_name.trim(),
                        plant_id: null,
                    })
                    .select('id, name')
                    .single()

                if (newDestError) throw newDestError
                destinationName = newDest.name
            } else {
                const existingDest = (destinations || []).find(dest => dest.id === values.destination_id)
                destinationName = existingDest?.name ?? 'SUB_INVENTORY'
            }

            const transferQty = Number(values.qty)
            const nextAvailable = Math.max(selectedLot.available_qty - transferQty, 0)

            const { error: invError } = await supabase
                .from('main_inventory')
                .update({ available_qty: nextAvailable, last_updated: new Date().toISOString() })
                .eq('id', selectedLot.inventory_id)
            if (invError) throw invError

            const { data: grnRow, error: grnFetchError } = await supabase
                .from('grns')
                .select('net_qty')
                .eq('id', selectedLot.grn_id)
                .single()
            if (grnFetchError) throw grnFetchError

            const nextNetQty = Math.max(Number(grnRow.net_qty || 0) - transferQty, 0)
            const { error: grnUpdateError } = await supabase
                .from('grns')
                .update({ net_qty: nextNetQty })
                .eq('id', selectedLot.grn_id)
            if (grnUpdateError) throw grnUpdateError

            const { error: transferLogError } = await supabase
                .from('sub_inventory_transfers')
                .insert({
                    transfer_no: generateTransferNo(),
                    from_location: `${selectedLot.grn_no} | ${transferQty.toFixed(2)} kg | ${selectedLot.storage_location}`,
                    to_location: destinationName,
                    created_by: user.id,
                })
            if (transferLogError) throw transferLogError

            toast.success('Transfer Recorded and Inventory Updated')
            setTimeout(() => router.push('/stores/inventory'), 800)
            setSelectedMaterial('')
            form.reset({
                material_id: '',
                source_inventory_id: '',
                qty: 0,
                destination_id: '',
                destination_name: '',
            })
        } catch (error: any) {
            toast.error("Transfer Failed", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ArrowRight className="h-5 w-5" />
                        Transfer to Sub-Inventory
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onTransfer)} className="space-y-4">
                        <div className="space-y-2">
                            <Label>What to Transfer (Material)</Label>
                            <Select
                                onValueChange={(value) => {
                                    form.setValue('material_id', value)
                                    form.setValue('source_inventory_id', '')
                                    setSelectedMaterial(value)
                                }}
                                value={form.watch('material_id')}
                            >
                                <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                                <SelectContent>
                                    {(materials || []).map((material: any) => (
                                        <SelectItem key={material.id} value={material.id}>
                                            {material.name} ({material.material_code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>From Where (Source GRN Lot)</Label>
                            <Select
                                onValueChange={(value) => form.setValue('source_inventory_id', value)}
                                value={form.watch('source_inventory_id')}
                                disabled={!selectedMaterial}
                            >
                                <SelectTrigger><SelectValue placeholder={selectedMaterial ? 'Select source lot' : 'Select material first'} /></SelectTrigger>
                                <SelectContent>
                                    {(sourceLots || []).map((lot: SourceLot) => (
                                        <SelectItem key={lot.inventory_id} value={lot.inventory_id}>
                                            {lot.grn_no} | {lot.available_qty.toFixed(2)}kg | {lot.storage_location}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500">FEFO lots shown based on selected material</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Transfer Qty (kg)</Label>
                            <Input type="number" step="0.001" {...form.register('qty', { valueAsNumber: true })} placeholder="e.g. 50" />
                        </div>

                        <div className="space-y-2">
                            <Label>To Where (Sub-Inventory)</Label>
                            <Select
                                onValueChange={(value) => form.setValue('destination_id', value)}
                                value={form.watch('destination_id')}
                            >
                                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                                <SelectContent>
                                    {(destinations || []).map((destination: any) => (
                                        <SelectItem key={destination.id} value={destination.id}>{destination.name}</SelectItem>
                                    ))}
                                    <SelectItem value={NEW_DESTINATION}>+ Create new destination</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {form.watch('destination_id') === NEW_DESTINATION && (
                            <div className="space-y-2">
                                <Label>New Destination Name</Label>
                                <Input {...form.register('destination_name')} placeholder="e.g. Sub Store - Mixing" />
                            </div>
                        )}

                        {form.watch('source_inventory_id') && (
                            <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                Transfer reduces source lot stock in both <strong>main_inventory</strong> and <strong>grns</strong>, and logs the movement in <strong>sub_inventory_transfers</strong>.
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirm Transfer"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
