const url = "https://gtwquyzkejmmretrpaka.supabase.co/rest/v1/gate_entries?select=status";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0d3F1eXprZWptbXJldHJwYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzU5MTMsImV4cCI6MjA4NTAxMTkxM30.9P3Su3xxAMgRD2ouj5ayvn4tFe7YtE6sYwrrs9jIZQE";

fetch(url, {
    headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
    }
}).then(r => r.json()).then(data => {
    const statuses = new Set(data.map(d => d.status));
    console.log("Distinct statuses:", [...statuses]);
}).catch(console.error);
