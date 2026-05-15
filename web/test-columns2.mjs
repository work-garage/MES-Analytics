import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gtwquyzkejmmretrpaka.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0d3F1eXprZWptbXJldHJwYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzU5MTMsImV4cCI6MjA4NTAxMTkxM30.9P3Su3xxAMgRD2ouj5ayvn4tFe7YtE6sYwrrs9jIZQE'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    // try inserting with nothing just to get a helpful error message with column info if possible, or try options
    const { data: row, error } = await supabase.from('stack_samples').select('*').limit(1)
    if (error) {
        console.error("Select error:", error)
    } else {
        console.log("Rows:", row)
    }
}
test()