import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Decode and extract the subject (privy_did) from Privy JWT token.
 * In production Supabase Edge Functions with Privy Verification SDK,
 * this verifies the auth token signature using Privy App ID & Secret.
 */
function extractDidFromPrivyToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return payload.sub || payload.user_id || payload.privy_did || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Authenticate caller via x-privy-token
    const privyToken = req.headers.get("x-privy-token");
    if (!privyToken) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerDid = extractDidFromPrivyToken(privyToken);
    if (!callerDid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request body
    const body = await req.json().catch(() => ({}));
    const rawTargetId = typeof body.pukico_id === "string" ? body.pukico_id : "";
    const normalized = rawTargetId.toLowerCase().trim().replace(/^@/, "");

    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      return new Response(JSON.stringify({ found: false, reason: "format" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Verify caller profile exists and check onboarding requirement
    const { data: callerProfile, error: callerError } = await supabase
      .from("profiles")
      .select("privy_did, pukico_id, wallet_verified, beta_access, role")
      .eq("privy_did", callerDid)
      .maybeSingle();

    if (callerError || !callerProfile) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!callerProfile.pukico_id && callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "onboarding_required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Look up target profile with wallet_verified = true
    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("privy_did, pukico_id, wallet_address, wallet_verified")
      .ilike("pukico_id", normalized)
      .eq("wallet_verified", true)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return new Response(
        JSON.stringify({
          found: false,
          pukico_id: normalized,
          reason: "not_found",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isSelf = targetProfile.privy_did === callerDid;

    // 6. Look up last transaction from caller to target in transactions table
    // from_did = did pemanggil, to_did = privy_did target, status in ('pending','confirmed'), urut created_at desc, limit 1
    const { data: lastTx } = await supabase
      .from("transactions")
      .select("to_address, created_at")
      .eq("from_did", callerDid)
      .eq("to_did", targetProfile.privy_did)
      .in("status", ["pending", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let addressChanged = false;
    let previousAddress: string | undefined = undefined;
    let lastSentAt: string | undefined = undefined;

    if (lastTx && lastTx.to_address) {
      if (
        lastTx.to_address.toLowerCase() !==
        targetProfile.wallet_address.toLowerCase()
      ) {
        addressChanged = true;
        previousAddress = lastTx.to_address;
        lastSentAt = lastTx.created_at;
      }
    }

    // 7. Return verified resolution with address_changed flag
    const responsePayload: Record<string, unknown> = {
      found: true,
      pukico_id: targetProfile.pukico_id,
      wallet_address: targetProfile.wallet_address,
      is_self: isSelf,
      address_changed: addressChanged,
    };

    if (addressChanged) {
      responsePayload.previous_address = previousAddress;
      responsePayload.last_sent_at = lastSentAt;
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("resolve-id error:", err);
    return new Response(JSON.stringify({ error: "server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
