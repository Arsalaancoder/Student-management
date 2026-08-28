import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { fullName, email, password, accessKey } = await req.json().catch(() => ({}))

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     req.headers.get("x-real-ip") || 
                     "unknown_ip"

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Unable to verify professor access key. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Rate Limiting Check: Max 5 failed attempts per IP within the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count: failedAttempts } = await supabaseAdmin
      .from("professor_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", clientIp)
      .gte("attempted_at", fifteenMinutesAgo)

    if (failedAttempts !== null && failedAttempts >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Key Presence Check
    if (!accessKey || typeof accessKey !== "string" || !accessKey.trim()) {
      return new Response(
        JSON.stringify({ error: "Professor access key is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Retrieve server secret key (defaults to NBKRIST-2K27)
    const expectedKey = Deno.env.get("PROFESSOR_SIGNUP_KEY") || "NBKRIST-2K27"

    // Secure Key Comparison
    if (accessKey.trim() !== expectedKey.trim()) {
      // Record failed attempt for rate limiting
      await supabaseAdmin.from("professor_signup_attempts").insert({
        ip_address: clientIp,
        attempted_at: new Date().toISOString()
      })

      return new Response(
        JSON.stringify({ error: "Invalid professor access key. Please contact the administrator." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Server-side validation succeeded! Create Supabase Auth User with service role
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "professor"
      },
      app_metadata: {
        role: "professor",
        is_verified_professor: true
      }
    })

    if (authErr || !authData.user) {
      return new Response(
        JSON.stringify({ error: authErr?.message || "Unable to verify professor access key. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Explicitly update/upsert profile row with role='professor'
    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      auth_user_id: authData.user.id,
      email: email,
      full_name: fullName,
      role: "professor"
    }, { onConflict: "auth_user_id" })

    if (profileErr) {
      console.error("Error creating professor profile:", profileErr)
    }

    // Clean up failed attempts for this IP after successful registration
    await supabaseAdmin
      .from("professor_signup_attempts")
      .delete()
      .eq("ip_address", clientIp)

    return new Response(
      JSON.stringify({
        success: true,
        user: authData.user
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("register-professor exception:", err)
    return new Response(
      JSON.stringify({ error: "Unable to verify professor access key. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
