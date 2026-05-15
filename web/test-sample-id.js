import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkData() {
    const { data: rows } = await supabase.from('stack_samples').select('id, sample_id').limit(5)
    console.log(rows)
}
checkData()
