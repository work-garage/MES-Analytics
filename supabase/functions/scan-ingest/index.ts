
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
        const { scan_type, code_value, scan_method, location_context } = payload;

        const { error: insertError } = await supabaseClient
            .from('ingest_scans')
            .insert({
                message_id,
                client_id,
                scan_type, // BARCODE, RFID
                code_value,
                scan_method,
                location_context,
                timestamp,
                processed: false
            });

        if (insertError) {
            if (insertError.code === '23505') return new Response(JSON.stringify({ message: "Already processed" }), { status: 200, headers: corsHeaders });
            throw insertError;
        }

        return new Response(JSON.stringify({ success: true, messageId: message_id }), { headers: corsHeaders, status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    }
});
