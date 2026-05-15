import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkData() {
    console.log("Checking data...")
    // checking fg_batches or packing_process_logs for production
    const { data: packs, error: err1 } = await supabase.from('packing_process_logs').select('packs_produced, md_reject_count')
    let totalPacks = 0
    let totalRejects = 0
    if (packs) {
        packs.forEach(p => {
            totalPacks += Number(p.packs_produced || 0)
            totalRejects += Number(p.md_reject_count || 0)
        })
    }
    console.log("Packing Process Logs - Total Packs:", totalPacks, "Rejects:", totalRejects)

    const { data: fg, error: err2 } = await supabase.from('fg_batches').select('produced_qty, good_qty')
    let fgProduced = 0
    let fgGood = 0
    if (fg) {
        fg.forEach(f => {
            fgProduced += Number(f.produced_qty || 0)
            fgGood += Number(f.good_qty || 0)
        })
    }
    console.log("FG Batches - Produced:", fgProduced, "Good:", fgGood)

    const { data: inv, error: err3 } = await supabase.from('main_inventory').select('available_qty')
    let totalInv = 0
    if (inv) {
        inv.forEach(i => totalInv += Number(i.available_qty || 0))
    }
    console.log("Main Inventory - Available:", totalInv)
}
checkData()
