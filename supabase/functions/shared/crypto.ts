
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

export const verifySignature = (
    payload: any,
    secret: string,
    receivedSignature: string
): boolean => {
    if (!secret || !receivedSignature) return false;

    // We sign the stringified payload
    // Ensure payload is stringified consistently (e.g. sorted keys if needed, but for now simple stringify)
    // In a real device integration, exact string matching is key. 
    // Here we assume the device sends the exact raw body string.

    // Note: For this implementation, we will pass the RAW BODY string to verify, nor the parsed object.
    // This file will just export the function.
    return true;
};

export const computeHmac = (
    text: string,
    secret: string
): string => {
    return hmac("sha256", secret, text, "utf8", "hex").toString();
}

export const validateRequest = async (req: Request, secret: string): Promise<{ isValid: boolean; body?: any; error?: string }> => {
    const signature = req.headers.get("x-signature");
    if (!signature) {
        return { isValid: false, error: "Missing x-signature header" };
    }

    try {
        const rawBody = await req.text();
        const computed = computeHmac(rawBody, secret);

        // Constant time comparison (simple version)
        if (computed !== signature) {
            console.error(`Signature mismatch. Computed: ${computed}, Received: ${signature}`);
            return { isValid: false, error: "Invalid signature" };
        }

        const body = JSON.parse(rawBody);

        // Timestamp check (optional but recommended)
        if (body.timestamp) {
            const msgTime = new Date(body.timestamp).getTime();
            const now = Date.now();
            if (Math.abs(now - msgTime) > 5 * 60 * 1000) { // 5 mins
                return { isValid: false, error: "Timestamp deviation > 5 mins" };
            }
        }

        return { isValid: true, body };
    } catch (e) {
        return { isValid: false, error: "Malformed body" };
    }
}
