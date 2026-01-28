
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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const GATEWAY_SECRET = "test-secret-123";

        // Validate
        const { isValid, body, error } = await validateRequest(req, GATEWAY_SECRET);
        if (!isValid) {
            return new Response(JSON.stringify({ error }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { message_id, client_id, payload, source, timestamp } = body;
        if (!payload || !payload.sensor_type) throw new Error("Missing payload or sensor_type");

        // Idempotency
        // Note: We check different tables based on type, or simpler: just catch unique violation on insert.
        // Here we skip read-check for performance, relying on DB Unique constraint on message_id.

        let table = '';
        let record = {};

        if (payload.sensor_type === 'rpm') {
            table = 'ingest_rpm_intervals';

            // Smoothing Logic
            let avg_rpm = payload.rpm_samples ? payload.rpm_samples.reduce((a: number, b: number) => a + b, 0) / payload.rpm_samples.length : 0;
            // Simple outlier filter could go here

            record = {
                message_id, client_id, timestamp,
                machine_id: payload.machine_id,
                interval_start: payload.interval_start,
                interval_end: payload.interval_end,
                avg_rpm,
                raw_samples: payload.rpm_samples
            };

        } else if (payload.sensor_type === 'packing') {
            table = 'ingest_packing_logs';

            // MD Spike Detection (Basic Logic)
            if (payload.md_reject_count > 5) {
                console.warn(`High MD Reject Rate detected: ${payload.md_reject_count} events.`);
                // Trigger Alert here
            }

            record = {
                message_id, client_id, timestamp,
                machine_id: payload.machine_id,
                sku_id: payload.sku_id,
                packs_produced: payload.packs_produced,
                wrapper_consumed_m: payload.wrapper_consumed_m,
                md_reject_count: payload.md_reject_count,
                md_reject_photos: payload.md_reject_photos
            };
        } else if (payload.sensor_type === 'oven') {
            // Placeholder for Oven Temp Ingest
            console.log("Oven Log Reqd", payload);
            return new Response(JSON.stringify({ success: true, message: "Oven log received (placeholder)" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        } else {
            throw new Error(`Unknown sensor type: ${payload.sensor_type}`);
        }

        const { data: inserted, error: insertError } = await supabaseClient
            .from(table)
            .insert(record)
            .select('id') // We need ID for RPC
            .single();

        if (insertError) {
            // Check for unique key violation (PGRST code for constraint violation is usually mapped)
            if (insertError.code === '23505') { // Unique violation
                return new Response(JSON.stringify({ message: "Already processed" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            throw insertError;
        }

        // Trigger Processing RPC based on type
        if (payload.sensor_type === 'rpm') {
            await supabaseClient.rpc('process_rpm_ingest', { p_ingest_id: inserted.id });
        } else if (payload.sensor_type === 'packing') {
            await supabaseClient.rpc('process_packing_ingest', { p_ingest_id: inserted.id });
        }

        return new Response(JSON.stringify({ success: true, messageId: message_id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
