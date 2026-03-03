import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function getRpcDefinition() {
    const { data, error } = await supabase.rpc('rpc_create_grn_final', {
        p_gate_entry_id: 'a', p_pallet_barcode: 'a', p_container_type: 'a', p_container_count: 1, p_unit_weight: 1, p_storage_location: 'a', p_manager_id: 'a'
    })

    console.log(error)
}

getRpcDefinition()
