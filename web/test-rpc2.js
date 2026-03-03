const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/rpc_submit_qa_inspection`;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

fetch(url, {
    method: 'POST',
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        p_gate_entry_id: 'a',
        p_result: 'ACCEPT',
        p_inspector_id: 'a',
        p_auto_hold: false,
        p_lab_photos: []
    })
}).then(async r => {
    console.log(r.status);
    console.log(await r.text());
});
