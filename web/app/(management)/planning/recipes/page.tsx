'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'

export default function RecipeBuilderPage() {
    const supabase = createClient()
    const [recipeName, setRecipeName] = useState('')
    const [items, setItems] = useState<{ material_id: string; qty: number; name: string }[]>([])

    const { data: materials } = useQuery({
        queryKey: ['materials'],
        queryFn: async () => {
            const { data } = await supabase.from('materials').select('id, name')
            return data || []
        }
    })

    const addItem = (materialId: string) => {
        const mat = materials?.find(m => m.id === materialId)
        if (mat) {
            setItems([...items, { material_id: mat.id, qty: 0, name: mat.name }])
        }
    }

    const removeItem = (index: number) => {
        const newItems = [...items]
        newItems.splice(index, 1)
        setItems(newItems)
    }

    const updateQty = (index: number, val: number) => {
        const newItems = [...items]
        newItems[index].qty = val
        setItems(newItems)
    }

    const saveRecipe = async () => {
        if (!recipeName || items.length === 0) return toast.error("Invalid Recipe")

        const { error } = await supabase.from('recipe_templates').insert({
            name: recipeName,
            sku_id: 'd0e9b9c0-1234-4567-8901-234567890abc', // Mock SKU ID or select from dropdown
            components: items
        })

        if (error) toast.error("Failed to save")
        else toast.success("Recipe Saved")
    }

    return (
        <div className="max-w-4xl mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Recipe Manager</h1>
                <Button onClick={saveRecipe}><Save className="mr-2 h-4 w-4" /> Save Template</Button>
            </div>

            <Card>
                <CardHeader><CardTitle>Template Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Recipe Name</Label>
                            <Input value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="e.g. Marie Gold Standard v1" />
                        </div>
                        <div className="space-y-2">
                            <Label>Target SKU</Label>
                            <Select>
                                <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="marie">Marie Gold 200g</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Components (Per Sub-Batch)</CardTitle>
                    <Select onValueChange={addItem}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Add Material" /></SelectTrigger>
                        <SelectContent>
                            {materials?.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead className="w-[150px]">Qty (kg)</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            value={item.qty}
                                            onChange={e => updateQty(idx, Number(e.target.value))}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                                        No components added. Add raw materials to build the recipe.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
