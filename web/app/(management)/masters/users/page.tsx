'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@supabase/ssr'
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

type UserFormValues = {
    full_name: string
    email: string
    role: string
    password?: string
}

export default function UsersPage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const { register, handleSubmit, reset, setValue, watch } = useForm<UserFormValues>({
        defaultValues: {
            full_name: '',
            email: '',
            role: 'operator',
            password: ''
        }
    })

    const role = watch('role')

    const { data: users, isLoading } = useQuery({
        queryKey: ['user_profiles'],
        queryFn: async () => {
            const { data } = await supabase.from('user_profiles').select('*').order('full_name')
            return data || []
        }
    })

    const mutation = useMutation({
        mutationFn: async (values: UserFormValues) => {
            if (editingId) {
                const { error } = await supabase
                    .from('user_profiles')
                    .update({ full_name: values.full_name, role: values.role })
                    .eq('id', editingId)
                if (error) throw error
            } else {
                const password = values.password?.trim() || ''
                if (password.length < 8) {
                    throw new Error('Password must be at least 8 characters long.')
                }

                const signupClient = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    {
                        auth: {
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false
                        }
                    }
                )

                const email = values.email.trim().toLowerCase()
                const { data: signUpData, error: signUpError } = await signupClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: values.full_name,
                            role: values.role
                        }
                    }
                })

                if (signUpError) throw signUpError

                const createdUserId = signUpData.user?.id
                if (!createdUserId) {
                    throw new Error('User account could not be created. Check auth settings and retry.')
                }

                const { error: profileError } = await supabase.from('user_profiles').upsert(
                    {
                        id: createdUserId,
                        email,
                        full_name: values.full_name,
                        role: values.role
                    },
                    { onConflict: 'id' }
                )

                if (profileError) throw profileError
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user_profiles'] })
            setIsOpen(false)
            reset({
                full_name: '',
                email: '',
                role: 'operator',
                password: ''
            })
            toast.success(editingId ? 'User updated' : 'User created')
        },
        onError: (err: any) => toast.error(err.message)
    })

    const openEdit = (item: any) => {
        setEditingId(item.id)
        setValue('full_name', item.full_name)
        setValue('email', item.email)
        setValue('role', item.role || 'operator')
        setValue('password', '')
        setIsOpen(true)
    }

    const openNew = () => {
        setEditingId(null)
        reset({
            full_name: '',
            email: '',
            role: 'operator',
            password: ''
        })
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
                        <DialogHeader><DialogTitle>{editingId ? 'Edit User' : 'Create User'}</DialogTitle></DialogHeader>
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
                                <Select value={role} onValueChange={v => setValue('role', v as UserFormValues['role'], { shouldValidate: true })}>
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

                            {!editingId && (
                                <div className="space-y-2">
                                    <Label>Temporary Password</Label>
                                    <Input type="password" {...register('password', { required: true, minLength: 8 })} />
                                    <p className="text-xs text-slate-500">Minimum 8 characters. Share securely with the user.</p>
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={mutation.isPending}>
                                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingId ? 'Update Profile' : 'Create Account'}
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
