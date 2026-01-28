
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

        // Validate Signature
        const { isValid, body, error } = await validateRequest(req, GATEWAY_SECRET);
        if (!isValid) return new Response(JSON.stringify({ error }), { status: 401, headers: corsHeaders });

        const { message_id, client_id, payload, timestamp } = body;
        const { photo_base64, linked_entity_type, linked_entity_id, meta, exif } = payload;

        // 1. Upload to Storage
        // Decode base64 to buffer (simplified)
        const binary = Uint8Array.from(atob(photo_base64), c => c.charCodeAt(0));
        const path = `hardware-uploads/${new Date().toISOString().split('T')[0]}/${message_id}.jpg`;

        const { error: uploadError } = await supabaseClient.storage
            .from('hmi-attachments') // Ensure bucket exists!
            .upload(path, binary, { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        // 2. Insert to Ingest
        const { error: insertError } = await supabaseClient
            .from('ingest_photos')
            .insert({
                message_id,
                client_id,
                linked_entity_type,
                linked_entity_id,
                photo_path: path,
                meta,
                exif,
                timestamp,
                processed: false
            });

        if (insertError) {
            if (insertError.code === '23505') return new Response(JSON.stringify({ message: "Already processed" }), { status: 200, headers: corsHeaders });
            throw insertError;
        }

        return new Response(JSON.stringify({ success: true, messageId: message_id, path }), { headers: corsHeaders, status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    }
});
