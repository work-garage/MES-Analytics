'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Edit, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'

type MaterialFormValues = {
    material_code: string
    name: string
    category: string
    unit: string
    container_type: string
    shelf_life_days: number
}

export default function MaterialsPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const { register, handleSubmit, reset, setValue } = useForm<MaterialFormValues>({
        defaultValues: {
            material_code: '',
            name: '',
            category: 'RAW',
            unit: '',
            container_type: 'bag',
            shelf_life_days: 30,
        }
    })

    // Fetch
    const { data: materials, isLoading } = useQuery({
        queryKey: ['materials', search],
        queryFn: async () => {
            let query = supabase
                .from('materials')
                .select('id, material_code, name, category, unit, container_type, shelf_life_days')
                .order('name')
            if (search) query = query.ilike('name', `%${search}%`)
            const { data } = await query
            return data || []
        }
    })

    // Mutation: Create/Update
    const mutation = useMutation({
        mutationFn: async (values: MaterialFormValues) => {
            const payload = {
                material_code: values.material_code,
                name: values.name,
                category: values.category,
                unit: values.unit,
                container_type: values.container_type,
                shelf_life_days: Number(values.shelf_life_days),
            }

            if (editingId) {
                const { error } = await supabase.from('materials').update(payload).eq('id', editingId)
                if (error) throw error
            } else {
                const { error } = await supabase.from('materials').insert(payload)
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials'] })
            setIsOpen(false)
            toast.success(editingId ? "Material Updated" : "Material Created")
        },
        onError: (err: any) => toast.error(err.message)
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('material_code', item.material_code)
        setValue('name', item.name)
        setValue('category', item.category)
        setValue('unit', item.unit)
        setValue('container_type', item.container_type)
        setValue('shelf_life_days', item.shelf_life_days)
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
                <h1 className="text-2xl font-bold">Material Master</h1>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Material</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Material</DialogTitle></DialogHeader>
                        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Material Code</Label>
                                    <Input {...register('material_code', { required: true })} placeholder="RM-001" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select onValueChange={v => setValue('category', v)} defaultValue="RAW">
                                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="RAW">Raw Material</SelectItem>
                                            <SelectItem value="PACKAGING">Packing Material</SelectItem>
                                            <SelectItem value="SFG">Semi-Finished</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input {...register('name', { required: true })} placeholder="Wheat Flour" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Unit</Label>
                                    <Input {...register('unit', { required: true })} placeholder="kg" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Container Type</Label>
                                    <Select onValueChange={v => setValue('container_type', v)} defaultValue="bag">
                                        <SelectTrigger><SelectValue placeholder="Select Container" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="bag">Bag</SelectItem>
                                            <SelectItem value="drum">Drum</SelectItem>
                                            <SelectItem value="roll">Roll</SelectItem>
                                            <SelectItem value="box">Box</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Shelf Life (Days)</Label>
                                    <Input type="number" {...register('shelf_life_days', { required: true, valueAsNumber: true })} placeholder="30" />
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
                            placeholder="Search materials..."
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
                                <TableHead>Type</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Shelf Life</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : materials?.map((m: any) => (
                                <TableRow key={m.id}>
                                    <TableCell className="font-mono text-xs">{m.material_code}</TableCell>
                                    <TableCell className="font-medium">{m.name}</TableCell>
                                    <TableCell>{m.category}</TableCell>
                                    <TableCell>{m.unit}</TableCell>
                                    <TableCell>{m.shelf_life_days} days</TableCell>
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
