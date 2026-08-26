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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Missing authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration. Missing Supabase keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT token & extract authentic user ID
    const token = authHeader.replace(/^Bearer\s+/i, "")
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Invalid or expired authentication token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const authenticatedUserId = user.id

    // Fetch user profile securely
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .or(`auth_user_id.eq.${authenticatedUserId},id.eq.${authenticatedUserId}`)
      .maybeSingle()

    // Administrative safety check: Sole Administrator Guard
    if (profile && profile.role === "professor") {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "professor")

      if (count !== null && count <= 1) {
        return new Response(
          JSON.stringify({
            error: "You cannot delete the only administrator account. Create another administrator before deleting this account.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    }

    if (profile) {
      // Clean up records where CASCADE foreign keys might not be set
      await supabaseAdmin.from("credit_transactions").delete().eq("student_id", profile.id)

      // Delete user profile row (cascades related notifications, submissions, enrollments)
      const { error: profileDeleteErr } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", profile.id)

      if (profileDeleteErr) {
        console.error("Error deleting profile row:", profileDeleteErr)
      }
    }

    // Delete Supabase Auth User
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(authenticatedUserId)

    if (authDeleteErr) {
      console.error("Error deleting auth user:", authDeleteErr)
      return new Response(
        JSON.stringify({ error: `Failed to delete authentication account: ${authDeleteErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Your account has been permanently deleted.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    console.error("Exception in delete-account edge function:", err)
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
