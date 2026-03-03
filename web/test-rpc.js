const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/rpc_create_grn_final`;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

fetch(url, {
    method: 'POST',
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        p_gate_entry_id: '123e4567-e89b-12d3-a456-426614174000',
        p_pallet_barcode: 'a',
        p_container_type: 'a',
        p_container_count: 1,
        p_unit_weight: 1,
        p_storage_location: 'a',
        p_manager_id: '123e4567-e89b-12d3-a456-426614174000'
    })
}).then(async r => {
    console.log(r.status);
    console.log(await r.text());
});
