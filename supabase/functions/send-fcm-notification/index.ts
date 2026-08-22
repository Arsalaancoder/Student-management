import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface RequestPayload {
  assignment_id: string
}

// Generate Google OAuth2 Token for FCM HTTP v1 API using RS256 Service Account JWT
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }

  const base64UrlEncode = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")

  const encodedHeader = base64UrlEncode(header)
  const encodedClaimSet = base64UrlEncode(claimSet)
  const stringToSign = `${encodedHeader}.${encodedClaimSet}`

  // Format PEM private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  let pemContents = privateKey.trim()

  if (pemContents.startsWith(pemHeader)) {
    pemContents = pemContents.substring(pemHeader.length)
  }
  if (pemContents.endsWith(pemFooter)) {
    pemContents = pemContents.substring(0, pemContents.length - pemFooter.length)
  }
  pemContents = pemContents.replace(/\s/g, "")

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(stringToSign)
  )

  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  const jwt = `${stringToSign}.${base64Signature}`

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResp.json()
  if (!tokenResp.ok) {
    throw new Error(`Google OAuth token exchange failed: ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "edutrack-c69ba"
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || ""
    const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") || ""

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { assignment_id }: RequestPayload = await req.json()

    if (!assignment_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 1. Fetch assignment details
    const { data: assignment, error: assignErr } = await supabase
      .from("assignments")
      .select("*, assignment_sections(section)")
      .eq("id", assignment_id)
      .single()

    if (assignErr || !assignment) {
      return new Response(
        JSON.stringify({ error: `Assignment not found: ${assignErr?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Fetch professor name
    const { data: professor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assignment.created_by)
      .single()

    const professorName = professor?.full_name || "Professor"

    // 3. Fetch all students matching targeting rules
    const { data: allStudents, error: studentErr } = await supabase
      .from("profiles")
      .select("id, department, year, section")
      .eq("role", "student")

    if (studentErr || !allStudents) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch students: ${studentErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const allowedSections = assignment.all_sections
      ? null
      : (assignment.assignment_sections || []).map((s: any) => s.section.trim().toUpperCase())

    const targetStudents = allStudents.filter((student) => {
      // Branch check
      if (assignment.target_branch && student.department) {
        const tNorm = assignment.target_branch.toLowerCase()
        const sNorm = student.department.toLowerCase()
        if (!tNorm.includes(sNorm) && !sNorm.includes(tNorm)) return false
      }
      // Year check
      if (assignment.target_year && student.year) {
        if (Number(assignment.target_year) !== Number(student.year)) return false
      }
      // Section check
      if (!assignment.all_sections && allowedSections && allowedSections.length > 0) {
        if (!student.section || !allowedSections.includes(student.section.trim().toUpperCase())) {
          return false
        }
      }
      return true
    })

    if (targetStudents.length === 0) {
      return new Response(
        JSON.stringify({ message: "No eligible targeted students found.", sent_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const studentIds = targetStudents.map((s) => s.id)

    // 4. Fetch active FCM tokens for target students
    const { data: tokenRecords, error: tokenErr } = await supabase
      .from("student_fcm_tokens")
      .select("student_id, fcm_token")
      .in("student_id", studentIds)
      .eq("is_active", true)

    if (tokenErr || !tokenRecords || tokenRecords.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No active FCM tokens registered for target students.",
          sent_count: 0,
          target_students_count: targetStudents.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 5. Deduplication check via fcm_notifications_log
    const { data: existingLogs } = await supabase
      .from("fcm_notifications_log")
      .select("student_id")
      .eq("assignment_id", assignment_id)

    const alreadyNotifiedStudentIds = new Set(existingLogs?.map((l) => l.student_id) || [])
    const eligibleTokens = tokenRecords.filter((tr) => !alreadyNotifiedStudentIds.has(tr.student_id))

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "All eligible students already notified.", sent_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 6. If Service Account Credentials are missing, log gracefully and return helpful state
    if (!firebaseClientEmail || !firebasePrivateKey) {
      console.warn("FCM credentials missing (FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY). Skipping push notification dispatch.")
      return new Response(
        JSON.stringify({
          status: "pending_credentials",
          message: "FCM token records retrieved, but FIREBASE_CLIENT_EMAIL/PRIVATE_KEY secret is required for HTTP v1 push sending.",
          eligible_tokens_count: eligibleTokens.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 7. Obtain Google OAuth2 access token
    const accessToken = await getAccessToken(firebaseClientEmail, firebasePrivateKey)

    let sentCount = 0
    let failureCount = 0

    // 8. Dispatch FCM notification for each token
    for (const record of eligibleTokens) {
      const fcmPayload = {
        message: {
          token: record.fcm_token,
          notification: {
            title: "New Assignment",
            body: `${professorName} posted "${assignment.title}"`,
          },
          data: {
            notification_type: "assignment",
            assignment_id: String(assignment.id),
            professor_id: String(assignment.created_by),
            deadline: String(assignment.deadline),
          },
          android: {
            priority: "HIGH",
            notification: {
              sound: "default",
              channel_id: "edutrack_assignments",
            },
          },
        },
      }

      const fcmResp = await fetch(
        `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fcmPayload),
        }
      )

      const fcmData = await fcmResp.json()

      if (fcmResp.ok) {
        sentCount++
        await supabase.from("fcm_notifications_log").insert({
          assignment_id: assignment_id,
          student_id: record.student_id,
          fcm_token: record.fcm_token,
          status: "sent",
        })
      } else {
        failureCount++
        const errorDetail = fcmData.error?.message || JSON.stringify(fcmData)
        console.error(`FCM send failed for token ${record.fcm_token.slice(0, 10)}...: ${errorDetail}`)

        // If token is invalid or unregistered, deactivate it
        if (
          errorDetail.includes("UNREGISTERED") ||
          errorDetail.includes("INVALID_ARGUMENT") ||
          errorDetail.includes("not found")
        ) {
          await supabase
            .from("student_fcm_tokens")
            .update({ is_active: false })
            .eq("fcm_token", record.fcm_token)
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        sent_count: sentCount,
        failed_count: failureCount,
        eligible_tokens: eligibleTokens.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    console.error("Exception in send-fcm-notification function:", err)
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
