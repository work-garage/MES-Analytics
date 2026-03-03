import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
    const { data, error } = await supabase.from('qa_inspections').select('*').limit(1)
    console.log(data ? Object.keys(data[0]) : error)
}
run()
