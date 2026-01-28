'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Edit, Settings, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'

export default function MachinesPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const { register, handleSubmit, reset, setValue } = useForm()

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
            toast.success("Machine Saved")
        },
        onError: (err: any) => toast.error(err.message)
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('code', item.code)
        setValue('name', item.name)
        setValue('type', item.type)
        setValue('line_id', item.line_id) // Assuming simple string for now
        setIsOpen(true)
    }

    const openNew = () => {
        setEditingId(null)
        reset()
        setIsOpen(true)
    }

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Machine Master</h1>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Machine</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Machine</DialogTitle></DialogHeader>
                        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Asset Code</Label>
                                    <Input {...register('code', { required: true })} placeholder="MIX-01" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Line ID</Label>
                                    <Select onValueChange={v => setValue('line_id', v)}>
                                        <SelectTrigger><SelectValue placeholder="Select Line" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="LINE-A">Line A</SelectItem>
                                            <SelectItem value="LINE-B">Line B</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Machine Name</Label>
                                <Input {...register('name', { required: true })} placeholder="High Speed Mixer" />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select onValueChange={v => setValue('type', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MIXER">Mixer</SelectItem>
                                        <SelectItem value="CUTTER">Cutter / Moulder</SelectItem>
                                        <SelectItem value="OVEN">Oven</SelectItem>
                                        <SelectItem value="PACKER">Packing Machine</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full" disabled={mutation.isPending}>
                                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Line</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : machines?.map((m: any) => (
                                <TableRow key={m.id}>
                                    <TableCell className="font-mono text-xs">{m.code}</TableCell>
                                    <TableCell className="font-medium">{m.name}</TableCell>
                                    <TableCell>{m.type}</TableCell>
                                    <TableCell>{m.line_id}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
