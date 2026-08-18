import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { action, payload } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI provider not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let systemPrompt = ""
    let userPrompt = ""

    switch (action) {
      case 'explain_assignment':
        systemPrompt = "You are an AI Academic Assistant. Explain this assignment to the student. Break down: What the professor is asking, required tasks, important concepts, expected deliverables, suggested preparation topics, and common mistakes. DO NOT generate a complete answer or solve the assignment."
        userPrompt = `Title: ${payload.title}\nDescription: ${payload.description}\nInstructions: ${payload.instructions}`
        break
      case 'review_submission':
        systemPrompt = "You are an AI Academic Assistant. Review the student's work before submission. Output exactly 5 scores out of 100 for: Structure, Completeness, Clarity, Formatting, References. Then list 3 specific potential issues. Do not claim the review is perfect."
        userPrompt = `Assignment: ${payload.title}\nInstructions: ${payload.instructions}\n\nStudent Work:\n${payload.studentWork}`
        break
      case 'feedback_summary':
        systemPrompt = "You are an AI Academic Assistant. Based on the professor's grade and feedback, generate a concise explanation for the student. Focus on: Strong areas, Areas to improve, Recommended focus for next assignment. Do not change the grade."
        userPrompt = `Assignment: ${payload.title}\nStudent Score: ${payload.score}/${payload.maxMarks}\nProfessor Feedback: ${payload.feedback || "No specific feedback provided."}`
        break
      case 'class_summary':
        systemPrompt = "You are an AI Academic Assistant helping a Professor. Summarize the class performance for this assignment based on the provided statistics. Include insights on: Average score, Common weaknesses, Common strengths, Submission rate, and Similarity statistics."
        userPrompt = `Assignment: ${payload.title}\nStats: ${JSON.stringify(payload.stats)}`
        break
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    // Call Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
        }],
        generationConfig: {
          temperature: 0.3
        }
      })
    })

    const geminiData = await response.json()
    
    if (!response.ok) {
      throw new Error(geminiData.error?.message || "AI Request Failed")
    }

    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated."

    return new Response(JSON.stringify({ result: aiText }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("AI Assistant Error:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
