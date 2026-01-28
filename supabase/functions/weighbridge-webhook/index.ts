
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../shared/crypto.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Get Gateway Secret (In prod, fetch from DB by client_id header)
        const GATEWAY_SECRET = "test-secret-123";

        // 2. Validate HMAC
        const { isValid, body, error } = await validateRequest(req, GATEWAY_SECRET);
        if (!isValid) {
            return new Response(JSON.stringify({ error }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const {
            message_id, client_id, device_id, source, timestamp,
            payload
        } = body;

        // Safety check for payload shape
        if (!payload) throw new Error("Missing payload");
        const { slip_no, vehicle_no, gross_weight, tare_weight, net_weight, scale_status, photo_paths } = payload;

        // 3. Idempotency Check
        const { data: existing } = await supabaseClient
            .from('ingest_weighbridge')
            .select('id')
            .eq('message_id', message_id)
            .single();

        if (existing) {
            return new Response(JSON.stringify({ message: "Already processed" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 4. Insert to Ingest
        const finalNet = net_weight ?? (gross_weight - tare_weight);

        const { data: inserted, error: insertError } = await supabaseClient
            .from('ingest_weighbridge')
            .insert({
                message_id,
                client_id,
                device_id,
                source,
                slip_no,
                vehicle_no,
                gross_weight,
                tare_weight,
                net_weight: finalNet,
                scale_status,
                photo_ids: photo_paths,
                timestamp,
                processed: false
            })
            .select('id')
            .single();

        if (insertError) throw insertError;

        // 5. Trigger Processing RPC
        const { error: rpcError } = await supabaseClient.rpc('process_weighbridge_ingest', {
            p_ingest_id: inserted.id
        });

        if (rpcError) {
            console.error("RPC Error", rpcError);
            // We don't fail the request, as ingestion succeeded. Processing can be retried.
        }

        return new Response(JSON.stringify({ success: true, messageId: message_id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
