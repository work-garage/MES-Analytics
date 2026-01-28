
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../shared/crypto.ts";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const GATEWAY_SECRET = "test-secret-123";

        const { isValid, body, error } = await validateRequest(req, GATEWAY_SECRET);
        if (!isValid) return new Response(JSON.stringify({ error }), { status: 401, headers: corsHeaders });

        const { message_id, client_id, payload, timestamp } = body;

        // For now we just log these to a generic JSON store or audit log
        // In real implementation this might map to specific tags
        // Let's assume we have an 'ingest_plc_generic' table (I should create this)

        /* 
        CREATE TABLE ingest_plc_generic (
            id uuid primary key default gen_random_uuid(),
            message_id uuid unique,
            client_id text,
            tags jsonb,
            timestamp timestamptz
        );
        */

        // For now, return success to simulate ingestion
        console.log("PLC Ingest", payload);

        return new Response(JSON.stringify({ success: true, messageId: message_id }), { headers: corsHeaders, status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    }
});
