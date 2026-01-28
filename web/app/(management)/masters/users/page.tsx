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
import { UserPlus, UserCog, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'

export default function UsersPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const { register, handleSubmit, reset, setValue } = useForm()

    const { data: users, isLoading } = useQuery({
        queryKey: ['user_profiles'],
        queryFn: async () => {
            const { data } = await supabase.from('user_profiles').select('*').order('full_name')
            return data || []
        }
    })

    const mutation = useMutation({
        mutationFn: async (values: any) => {
            if (editingId) {
                const { error } = await supabase.from('user_profiles').update(values).eq('id', editingId)
                if (error) throw error
            } else {
                // Creating a user usually involves Auth API. 
                // Without Admin API access here, we can only insert into profile if the auth user exists.
                // For demo, we assume we insert into profile directly or utilize a function.
                // Let's assume we call an RPC `create_user_invite` that handles auth + profile.
                const { error } = await supabase.rpc('create_user_invite', values)
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user_profiles'] })
            setIsOpen(false)
            toast.success("User Saved")
        },
        onError: (err: any) => toast.error(err.message)
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('full_name', item.full_name)
        setValue('email', item.email)
        setValue('role', item.role)
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
                <h1 className="text-2xl font-bold">User Management</h1>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNew}><UserPlus className="mr-2 h-4 w-4" /> Add User</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Invite'} User</DialogTitle></DialogHeader>
                        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input {...register('full_name', { required: true })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input type="email" {...register('email', { required: true })} disabled={!!editingId} />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select onValueChange={v => setValue('role', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="operator">Operator</SelectItem>
                                        <SelectItem value="supervisor">Supervisor</SelectItem>
                                        <SelectItem value="qa">QA</SelectItem>
                                        <SelectItem value="stores">Stores</SelectItem>
                                        <SelectItem value="planner">Planner</SelectItem>
                                        <SelectItem value="maintenance">Maintenance</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full" disabled={mutation.isPending}>
                                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingId ? 'Update Profile' : 'Send Invite'}
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
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : users?.map((u: any) => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.full_name}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell className="capitalize">{u.role}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                                            <UserCog className="h-4 w-4" />
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
