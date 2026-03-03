const url = "https://gtwquyzkejmmretrpaka.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0d3F1eXprZWptbXJldHJwYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzU5MTMsImV4cCI6MjA4NTAxMTkxM30.9P3Su3xxAMgRD2ouj5ayvn4tFe7YtE6sYwrrs9jIZQE";

fetch(url)
    .then(r => r.json())
    .then(data => {
        const statusProp = data.definitions.gate_entries?.properties?.status;
        console.log("Status Enum:", statusProp?.enum || statusProp?.description || statusProp);
    })
    .catch(console.error);
