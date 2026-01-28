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
import { Plus, Edit, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'

export default function VendorsPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const { register, handleSubmit, reset, setValue } = useForm()

    const { data: vendors, isLoading } = useQuery({
        queryKey: ['vendors', search],
        queryFn: async () => {
            let query = supabase.from('vendors').select('*').order('name')
            if (search) query = query.ilike('name', `%${search}%`)
            const { data } = await query
            return data || []
        }
    })

    const mutation = useMutation({
        mutationFn: async (values: any) => {
            if (editingId) {
                const { error } = await supabase.from('vendors').update(values).eq('id', editingId)
                if (error) throw error
            } else {
                const { error } = await supabase.from('vendors').insert(values)
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendors'] })
            setIsOpen(false)
            toast.success("Vendor Saved")
        },
        onError: (err: any) => toast.error(err.message)
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('code', item.code)
        setValue('name', item.name)
        setValue('contact_person', item.contact_person)
        setValue('email', item.email)
        setValue('phone', item.phone)
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
                <h1 className="text-2xl font-bold">Vendor Master</h1>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Vendor</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Vendor</DialogTitle></DialogHeader>
                        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vendor Code</Label>
                                    <Input {...register('code', { required: true })} placeholder="VEN-001" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input {...register('name', { required: true })} placeholder="ABC Supplies" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Contact Person</Label>
                                <Input {...register('contact_person')} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input {...register('email')} type="email" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input {...register('phone')} />
                                </div>
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
                <CardHeader className="pb-3">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search vendors..."
                            className="pl-8 max-w-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : vendors?.map((v: any) => (
                                <TableRow key={v.id}>
                                    <TableCell className="font-mono text-xs">{v.code}</TableCell>
                                    <TableCell className="font-medium">{v.name}</TableCell>
                                    <TableCell>{v.contact_person}</TableCell>
                                    <TableCell>{v.email}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
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
