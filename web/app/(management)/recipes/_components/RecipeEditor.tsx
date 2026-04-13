'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Plus, Trash2, Save } from 'lucide-react'

type RecipeEditorProps = {
    recipeId?: string
}

type RecipeItemRow = {
    material_id: string
    qty_per_batch: number
    tolerance_pct: number
}

export default function RecipeEditor({ recipeId }: RecipeEditorProps) {
    const supabase = createClient()
    const router = useRouter()

    const isEdit = Boolean(recipeId)
    const [name, setName] = useState('')
    const [sku, setSku] = useState('')
    const [version, setVersion] = useState('v1')
    const [isActive, setIsActive] = useState(true)
    const [items, setItems] = useState<RecipeItemRow[]>([])
    const [isSaving, setIsSaving] = useState(false)

    const { data: materials } = useQuery({
        queryKey: ['materials-for-recipes-editor'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('materials')
                .select('id, name, material_code')
                .order('name')
            if (error) throw error
            return data || []
        },
    })

    const { data: existingRecipe, isLoading: isLoadingRecipe } = useQuery({
        queryKey: ['recipe-editor', recipeId],
        queryFn: async () => {
            const { data: recipe, error: recipeError } = await supabase
                .from('recipe_templates')
                .select('id, name, sku, version, is_active')
                .eq('id', recipeId)
                .single()
            if (recipeError) throw recipeError

            const { data: recipeItems, error: itemsError } = await supabase
                .from('recipe_items')
                .select('material_id, qty_per_batch, tolerance_pct')
                .eq('template_id', recipeId)
            if (itemsError) throw itemsError

            return { recipe, items: recipeItems || [] }
        },
        enabled: isEdit,
    })

    useEffect(() => {
        if (!existingRecipe) return
        setName(existingRecipe.recipe.name || '')
        setSku(existingRecipe.recipe.sku || '')
        setVersion(existingRecipe.recipe.version || 'v1')
        setIsActive(Boolean(existingRecipe.recipe.is_active))
        setItems(
            existingRecipe.items.map((item: any) => ({
                material_id: item.material_id,
                qty_per_batch: Number(item.qty_per_batch || 0),
                tolerance_pct: Number(item.tolerance_pct || 0),
            }))
        )
    }, [existingRecipe])

    const materialLookup = useMemo(() => {
        const map = new Map<string, { name: string; material_code: string }>()
        for (const material of materials || []) {
            map.set(material.id, { name: material.name, material_code: material.material_code })
        }
        return map
    }, [materials])

    const addRow = () => {
        setItems(prev => [...prev, { material_id: '', qty_per_batch: 0, tolerance_pct: 2 }])
    }

    const updateRow = (index: number, patch: Partial<RecipeItemRow>) => {
        setItems(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }

    const removeRow = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index))
    }

    const saveRecipe = async () => {
        if (!name.trim()) {
            toast.error('Recipe name is required.')
            return
        }
        if (!sku.trim()) {
            toast.error('SKU is required.')
            return
        }
        if (items.length === 0) {
            toast.error('Add at least one recipe item.')
            return
        }
        if (items.some(item => !item.material_id || Number(item.qty_per_batch) <= 0)) {
            toast.error('Each row needs a material and qty per batch > 0.')
            return
        }

        setIsSaving(true)
        try {
            let templateId = recipeId

            if (isEdit) {
                const { error: updateError } = await supabase
                    .from('recipe_templates')
                    .update({
                        name: name.trim(),
                        sku: sku.trim(),
                        version: version.trim() || 'v1',
                        is_active: isActive,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', recipeId)
                if (updateError) throw updateError

                const { error: deleteItemsError } = await supabase
                    .from('recipe_items')
                    .delete()
                    .eq('template_id', recipeId)
                if (deleteItemsError) throw deleteItemsError
            } else {
                const { data: inserted, error: insertError } = await supabase
                    .from('recipe_templates')
                    .insert({
                        name: name.trim(),
                        sku: sku.trim(),
                        version: version.trim() || 'v1',
                        is_active: isActive,
                    })
                    .select('id')
                    .single()
                if (insertError) throw insertError
                templateId = inserted.id
            }

            const { error: insertItemsError } = await supabase
                .from('recipe_items')
                .insert(
                    items.map(item => ({
                        template_id: templateId,
                        material_id: item.material_id,
                        qty_per_batch: Number(item.qty_per_batch),
                        tolerance_pct: Number(item.tolerance_pct || 0),
                    }))
                )
            if (insertItemsError) throw insertItemsError

            toast.success(isEdit ? 'Recipe updated successfully' : 'Recipe created successfully')
            router.push(`/recipes/${templateId}`)
        } catch (e: any) {
            toast.error('Failed to save recipe', { description: e.message })
        } finally {
            setIsSaving(false)
        }
    }

    if (isEdit && isLoadingRecipe) {
        return <div className="max-w-5xl mx-auto py-6">Loading recipe...</div>
    }

    return (
        <div className="max-w-5xl mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{isEdit ? 'Edit Recipe' : 'New Recipe'}</h1>
                <Button onClick={saveRecipe} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Recipe'}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Template Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2">
                        <Label>Recipe Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marie Gold" />
                    </div>
                    <div className="space-y-2">
                        <Label>SKU</Label>
                        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. MARIE-500" />
                    </div>
                    <div className="space-y-2">
                        <Label>Version</Label>
                        <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1" />
                    </div>
                    <div className="space-y-2 md:col-span-4 flex items-center gap-3">
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                        <Label>Active recipe</Label>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Recipe Items</CardTitle>
                        <Button type="button" variant="outline" onClick={addRow}>
                            <Plus className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {items.length === 0 && (
                        <div className="text-sm text-slate-500">No items added yet.</div>
                    )}

                    {items.map((row, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 border rounded p-3">
                            <div className="md:col-span-6 space-y-1">
                                <Label className="text-xs">Material</Label>
                                <Select value={row.material_id} onValueChange={(value) => updateRow(index, { material_id: value })}>
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

                            <div className="md:col-span-2 space-y-1">
                                <Label className="text-xs">Qty / Batch</Label>
                                <Input
                                    type="number"
                                    step="0.001"
                                    value={row.qty_per_batch}
                                    onChange={(e) => updateRow(index, { qty_per_batch: Number(e.target.value || 0) })}
                                />
                            </div>

                            <div className="md:col-span-3 space-y-1">
                                <Label className="text-xs">Tolerance %</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={row.tolerance_pct}
                                    onChange={(e) => updateRow(index, { tolerance_pct: Number(e.target.value || 0) })}
                                />
                                {row.material_id && (
                                    <div className="text-[11px] text-slate-500">
                                        {materialLookup.get(row.material_id)?.name ?? ''}
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-1 flex items-end">
                                <Button type="button" variant="outline" className="w-full" onClick={() => removeRow(index)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
