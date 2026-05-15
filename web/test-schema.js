import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkData() {
    const { data: row } = await supabase.from('stack_samples').select('*').limit(1).single()
    console.log("stack_samples columns:", row ? Object.keys(row) : 'no data')
}
checkData()
