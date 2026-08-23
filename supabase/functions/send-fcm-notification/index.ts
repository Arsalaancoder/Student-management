import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface RequestPayload {
  assignment_id?: string
  submission_id?: string
}

function normalizeDepartment(deptStr: string): string[] {
  if (!deptStr) return []
  const clean = deptStr.toLowerCase().trim()

  if (clean.includes("computer science") || clean.includes("cse")) {
    return ["cse", "computer science", "computer science & engineering"]
  }
  if (clean.includes("data science") || clean.includes("ai & ds") || clean.includes("aids") || clean.includes("ai & data science") || clean.includes("ds")) {
    return ["aids", "ai & ds", "data science", "ds", "artificial intelligence & data science"]
  }
  if (clean.includes("machine learning") || clean.includes("ai & ml") || clean.includes("aiml") || clean.includes("ai & machine learning")) {
    return ["aiml", "ai & ml", "ai & machine learning", "artificial intelligence & machine learning"]
  }
  if (clean.includes("information technology") || clean === "it") {
    return ["it", "information technology"]
  }
  if (clean.includes("electronics & communication") || clean === "ece") {
    return ["ece", "electronics & communication"]
  }
  if (clean.includes("electrical") || clean === "eee") {
    return ["eee", "electrical & electronics"]
  }
  if (clean.includes("mechanical") || clean === "mech") {
    return ["mech", "mechanical engineering"]
  }
  if (clean.includes("civil")) {
    return ["civil", "civil engineering"]
  }
  return [clean]
}

function checkBranchMatch(targetBranch: string | null | undefined, studentDept: string | null | undefined): boolean {
  if (!targetBranch || !targetBranch.trim()) return true
  if (!studentDept || !studentDept.trim()) return false

  const targetTokens = normalizeDepartment(targetBranch)
  const studentTokens = normalizeDepartment(studentDept)

  return targetTokens.some(t => studentTokens.includes(t)) ||
    targetBranch.toLowerCase().trim() === studentDept.toLowerCase().trim() ||
    targetBranch.toLowerCase().includes(studentDept.toLowerCase().trim()) ||
    studentDept.toLowerCase().includes(targetBranch.toLowerCase().trim())
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
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "firebase-adminsdk-fbsvc@edutrack-c69ba.iam.gserviceaccount.com"
    const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") || `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQClLFD/6xe40F6j\nNSiTUSRyxth0MY/BeCF54mc6V5ep4x617WN4iMyCGQ5SALBQFq2TBe9JxLre43I3\nZDOCoIWWfrsf4SoNfeU3+YRsPjQyK55b/89MB6l2Hhlio1/WxSejW0jDJfqXxuJh\nlNVac2XMqZuLnLK+zWyFktmbqvZivDwscPNvuW93Ey3mwVWQz/0GEtQJvkZgva5i\n26ckqctw//jhN/AoLNlvgCoKMQTHkyGAZmxvOaKZ9wM0BfnUgM0kmCcF4WSMgSOR\nzRB1pigkMfZiZtHxpF91ZDv23oPTmUrCqLaNyczZiLax0k7X2mskjop0w/+0mh7e\nyGonQJrPAgMBAAECggEAHQyMOlYYV/KdkkqZFj+hD2aVTuoghEAicxM0YHhjPgep\nsQlNAzfb782ETTu9xngWktLqYKjuzKBnyAIhZQniNLOZKWQqRzErDQsfFQJjn6c4\nNKnqxU5bqWBlyok9I8KM1BgL1fZp+iOKUOsiEsRU1QfHSWiHrzLlsSBAkTYiGv8D\nlnPsxxQVZ/ulBZBfcNAIA/Cr3xps7z4Bjcc/7CzzFeaNd3+0v7gnJuHGrdB1U2HX\n+iDoDBiWpWB901FWLBeAI5vQpO0okaaZdprJ8SrrHuTiZCuEwpoJoIny8iCk3dY4\n9i4AB3iFAdLAod/18nyGF1rPFIMo70MZNA1jsuqvAQKBgQDXO2nRSiM3XEIDjfb9\nEKKTB5OgdQ2yE334vK4R3CPx2v0nsd8hTX1JRTk+kJ+2tuDmIgBpKRQF/ObQVDVD\n75CapVmQ2LAbUQbvYcFx5COZ7KPHgKAeuFmhG+cV3GMkuHfOWt17/RE4V/swjQ/n\nI7JSXLN/VSWC4JYgleXwnxacwQKBgQDEdYwl2x4X2ni+pIrNCS83iDtrM4ikyhil\nQzCFhsg7VqE80Q8QKpRnAg4dXn1g/gNnZBCWMosCVs7UCf1dgjJsnrIe7usRMveJ\nOk0VkvTvGqMTt5PzRtKfjYQATJkn9+zI2HgoAktLBo45gL4lBHW7f6apO+j+ks3s\nF0C+BdLLjwKBgQC2IMeFW6f7M62E1n/XW1lG85VfpU2Gj+n8LqVZ5Z/hC/9GtMRs\nqObItrQfFkCgW5ZqBwGz+xe/jWc/iNJd/32s7xigckxrgSBONrl8B6J8oPtiWZyl\nAjiOFU9xd0HKE/MFgmyDe/0zYXfkeKmpXNKL0Xfu2v1YB3XicxXVjLmUwQKBgQC3\nP5XMMciuI0CBQuWdPrXmLJKP+e+5FjFK5ZM62W+nubSID9DnGXB3bLlRt7NnZ0gx\nhmraTqbPNb2SlwbX0/vIyXYH2H82+b1fKRyBxSPma4g1egTs5ODNpqi7xrcNSvp4\nlUHuv8UPZDwBcw7pZHGUxQrlzFYWL0UYtM/U74WiDQKBgQDAmgQnB3czQVM4oguR\nWQB7iwVuwBfGDFeIwxPH1RMrMLAUnGiAzQewOyZcP0C08OmDkK0gSAkB2ZI5wgc/\nrQq0VrmJORVV11OGj3xp4dbK+cZlenMghsc+92F/4JbpHxHsV5PD/27AyQ3UWpEy\n4enSaG3lAPfWireFLE8aBQZuYQ==\n-----END PRIVATE KEY-----\n`

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const payload: RequestPayload = await req.json()

    // --- 0. HANDLE DIRECT FCM TEST NOTIFICATION ---
    if ((payload as any).test_token) {
      const testToken = (payload as any).test_token
      const testTitle = (payload as any).test_title || "EduTrack Direct Test"
      const testBody = (payload as any).test_body || "Native FCM direct push test"

      const accessToken = await getAccessToken(firebaseClientEmail, firebasePrivateKey)
      const fcmPayload = {
        message: {
          token: testToken,
          notification: {
            title: testTitle,
            body: testBody,
          },
          data: {
            notification_type: "test",
            title: testTitle,
            body: testBody,
            url: "/student/assignments",
          },
          android: {
            priority: "HIGH",
            notification: {
              sound: "default",
              channel_id: "edutrack_assignments",
              default_sound: true,
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_HIGH",
            },
          },
        },
      }

      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(fcmPayload),
      })

      const resData = await res.json()
      if (res.ok) {
        return new Response(JSON.stringify({ status: "success", sent_count: 1, message_id: resData.name }), { status: 200, headers: corsHeaders })
      } else {
        return new Response(JSON.stringify({ status: "error", error: resData.error }), { status: 400, headers: corsHeaders })
      }
    }
    if (payload.submission_id) {
      const { data: sub, error: subErr } = await supabase
        .from("submissions")
        .select("*, assignments(title, created_by), profiles(full_name)")
        .eq("id", payload.submission_id)
        .single()

      if (subErr || !sub) {
        return new Response(JSON.stringify({ error: "Submission not found" }), { status: 404, headers: corsHeaders })
      }

      const profId = sub.assignments?.created_by
      const studentName = sub.profiles?.full_name || "A student"
      const assignmentTitle = sub.assignments?.title || "Assignment"

      // Fetch ALL active FCM tokens for professor (BOTH Web & Android)
      const { data: profTokens } = await supabase
        .from("student_fcm_tokens")
        .select("fcm_token, platform")
        .eq("student_id", profId)
        .eq("is_active", true)

      if (!profTokens || profTokens.length === 0) {
        return new Response(JSON.stringify({ message: "No active FCM tokens for professor.", sent_count: 0 }), { status: 200, headers: corsHeaders })
      }

      const accessToken = await getAccessToken(firebaseClientEmail, firebasePrivateKey)
      let sentCount = 0
      let webSentCount = 0
      let androidSentCount = 0

      for (const record of profTokens) {
        const fcmPayload = {
          message: {
            token: record.fcm_token,
            notification: {
              title: "Assignment Submitted",
              body: `${studentName} submitted "${assignmentTitle}"`,
            },
            data: {
              notification_type: "submission",
              submission_id: String(payload.submission_id),
              assignment_id: String(sub.assignment_id),
              title: "Assignment Submitted",
              body: `${studentName} submitted "${assignmentTitle}"`,
              url: `/professor/submissions`,
            },
            android: {
              priority: "HIGH",
              notification: {
                sound: "default",
                channel_id: "edutrack_assignments",
                notification_priority: "PRIORITY_HIGH",
              },
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                title: "Assignment Submitted",
                body: `${studentName} submitted "${assignmentTitle}"`,
                icon: "/icon-192.png",
                badge: "/favicon.svg",
              },
              fcm_options: {
                link: `https://student-management-swart-one.vercel.app/professor/submissions`,
              },
            },
          },
        }

        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(fcmPayload),
        })

        if (res.ok) {
          sentCount++
          if (record.platform === "web") webSentCount++
          else if (record.platform === "android") androidSentCount++
        }
      }

      return new Response(JSON.stringify({
        status: "success",
        sent_count: sentCount,
        web_sent_count: webSentCount,
        android_sent_count: androidSentCount,
      }), { status: 200, headers: corsHeaders })
    }

    // --- 2. HANDLE NEW ASSIGNMENT NOTIFICATION TO STUDENTS (BOTH WEB & ANDROID) ---
    const { assignment_id } = payload

    if (!assignment_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id or submission_id" }), {
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

    // 3. Dynamically query student profiles
    const allowedSections = assignment.all_sections
      ? null
      : (assignment.assignment_sections || []).map((s: any) => s.section.trim().toUpperCase())

    const { data: allStudents, error: studentErr } = await supabase
      .from("profiles")
      .select("id, department, year, section")
      .eq("role", "student")

    if (studentErr || !allStudents || allStudents.length === 0) {
      return new Response(
        JSON.stringify({ message: "No registered student profiles found.", sent_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Filter target students using dynamic branch + year + section matching
    const targetStudents = allStudents.filter(student => {
      if (assignment.target_branch && !checkBranchMatch(assignment.target_branch, student.department)) {
        return false
      }
      if (assignment.target_year && student.year) {
        if (Number(assignment.target_year) !== Number(student.year)) return false
      }
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

    // 4. Fetch ALL active FCM tokens for target students (BOTH Web & Android platforms)
    const { data: tokenRecords, error: tokenErr } = await supabase
      .from("student_fcm_tokens")
      .select("student_id, fcm_token, platform")
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

    // 5. Deduplicate tokens by fcm_token
    const uniqueTokenMap = new Map<string, { student_id: string; fcm_token: string; platform: string }>()
    for (const tr of tokenRecords) {
      if (!uniqueTokenMap.has(tr.fcm_token)) {
        uniqueTokenMap.set(tr.fcm_token, tr)
      }
    }
    const deduplicatedTokens = Array.from(uniqueTokenMap.values())

    // 6. Deduplication check via fcm_notifications_log to avoid double-notifying same assignment
    const { data: existingLogs } = await supabase
      .from("fcm_notifications_log")
      .select("fcm_token")
      .eq("assignment_id", assignment_id)

    const alreadyNotifiedTokens = new Set(existingLogs?.map((l) => l.fcm_token) || [])
    const eligibleTokens = deduplicatedTokens.filter((tr) => !alreadyNotifiedTokens.has(tr.fcm_token))

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "All eligible student tokens already notified.", sent_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 7. Obtain Google OAuth2 access token
    const accessToken = await getAccessToken(firebaseClientEmail, firebasePrivateKey)

    let sentCount = 0
    let failureCount = 0
    let webSentCount = 0
    let androidSentCount = 0

    // 8. Dispatch FCM notification for each token (Dual Channel: Web + Android)
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
            title: "New Assignment",
            body: `${professorName} posted "${assignment.title}"`,
            url: `/student/assignments/${assignment.id}`,
          },
          android: {
            priority: "HIGH",
            notification: {
              sound: "default",
              channel_id: "edutrack_assignments",
              default_sound: true,
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_HIGH",
            },
          },
          webpush: {
            headers: {
              Urgency: "high",
            },
            notification: {
              title: "New Assignment",
              body: `${professorName} posted "${assignment.title}"`,
              icon: "/icon-192.png",
              badge: "/favicon.svg",
              tag: `assignment-${assignment.id}`,
              renotify: true,
              data: {
                assignment_id: String(assignment.id),
                notification_type: "assignment",
                url: `/student/assignments/${assignment.id}`,
              },
            },
            fcm_options: {
              link: `https://student-management-swart-one.vercel.app/student/assignments/${assignment.id}`,
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
        if (record.platform === "web") webSentCount++
        else if (record.platform === "android") androidSentCount++

        await supabase.from("fcm_notifications_log").insert({
          assignment_id: assignment_id,
          student_id: record.student_id,
          fcm_token: record.fcm_token,
          status: "sent",
        })
      } else {
        failureCount++
        const errorDetail = fcmData.error?.message || JSON.stringify(fcmData)
        console.error(`FCM send failed for ${record.platform} token ${record.fcm_token.slice(0, 10)}...: ${errorDetail}`)

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
        web_sent_count: webSentCount,
        android_sent_count: androidSentCount,
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
