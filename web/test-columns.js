import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gtwquyzkejmmretrpaka.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0d3F1eXprZWptbXJldHJwYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzU5MTMsImV4cCI6MjA4NTAxMTkxM30.9P3Su3xxAMgRD2ouj5ayvn4tFe7YtE6sYwrrs9jIZQE'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    // Get just one row to inspect keys
    const { data: row } = await supabase.from('cutting_logs').select('*').limit(1).single()
    if (row) {
        console.log("cutting_logs columns:", Object.keys(row))
    } else {
        // Find column by inserting and seeing the error? No, just get all columns using a known row... 
        // If empty, we can get an empty array.
        console.log("No rows")
    }
}
test()
