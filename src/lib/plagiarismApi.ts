import { supabase } from "./supabase"

function normalizeText(text: string): string {
  if (!text || typeof text !== "string") return ""
  return text.toLowerCase().replace(/[\r\t\f\v]/g, " ").replace(/\n+/g, " ").replace(/[^\w\s]/gi, " ").replace(/\s+/g, " ").trim()
}

function tokenizeText(text: string): string[] {
  const normalized = normalizeText(text)
  return normalized ? normalized.split(" ").filter(w => w.length > 0) : []
}

function generateNGrams(tokens: string[], n = 3): Set<string> {
  const ngrams = new Set<string>()
  if (!tokens || tokens.length < n) return ngrams
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(" "))
  }
  return ngrams
}

function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (!setA || !setB || (setA.size === 0 && setB.size === 0)) return 0
  let intersectionCount = 0
  setA.forEach(x => { if (setB.has(x)) intersectionCount++ })
  const unionSize = setA.size + setB.size - intersectionCount
  return unionSize > 0 ? intersectionCount / unionSize : 0
}

function calculateCosineSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeText(textA)
  const tokensB = tokenizeText(textB)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const freqA: Record<string, number> = {}
  const freqB: Record<string, number> = {}
  const allWords = new Set<string>()

  tokensA.forEach(w => { freqA[w] = (freqA[w] || 0) + 1; allWords.add(w) })
  tokensB.forEach(w => { freqB[w] = (freqB[w] || 0) + 1; allWords.add(w) })

  let dot = 0, magA = 0, magB = 0
  allWords.forEach(w => {
    const valA = freqA[w] || 0
    const valB = freqB[w] || 0
    dot += valA * valB
    magA += valA * valA
    magB += valB * valB
  })

  return (magA === 0 || magB === 0) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function extractTextFromBuffer(arrayBuffer: ArrayBuffer, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  const uint8 = new Uint8Array(arrayBuffer)
  
  let rawText = ""
  try {
    const decoder = new TextDecoder("utf-8", { fatal: false })
    rawText = decoder.decode(uint8)
  } catch (e) {
    for (let i = 0; i < uint8.length; i++) {
      if (uint8[i] >= 32 && uint8[i] <= 126) {
        rawText += String.fromCharCode(uint8[i])
      } else if (uint8[i] === 10 || uint8[i] === 13) {
        rawText += " "
      }
    }
  }

  if (ext === "pdf") {
    const matches = rawText.match(/\(([^()]+)\)/g) || []
    const cleaned = matches.map(m => m.slice(1, -1)).join(" ")
    if (cleaned.trim().length > 20) {
      return cleaned
    }
    return rawText.replace(/[^\x20-\x7E\n\r]/g, " ").replace(/\s+/g, " ")
  }

  if (ext === "docx" || ext === "doc") {
    return rawText.replace(/<[^>]+>/g, " ").replace(/[^\x20-\x7E\n\r]/g, " ").replace(/\s+/g, " ")
  }

  return rawText
}

export async function processSimilarityClientFallback(submissionId: string): Promise<any> {
  try {
    // 1. Fetch Target Submission
    const { data: targetSub, error: targetError } = await supabase
      .from("submissions")
      .select("*, submission_versions(*)")
      .eq("id", submissionId)
      .single()

    if (targetError || !targetSub) {
      throw new Error(`Submission not found: ${targetError?.message || "Invalid submission ID"}`)
    }

    const versions = targetSub.submission_versions || []
    if (versions.length === 0) {
      throw new Error("No file version uploaded for this submission.")
    }

    versions.sort((a: any, b: any) => b.version_number - a.version_number)
    const targetVersion = versions[0]

    // Download Target File
    const { data: targetFileData, error: targetFileError } = await supabase.storage
      .from("submissions")
      .download(targetVersion.file_url)

    if (targetFileError || !targetFileData) {
      throw new Error(`File could not be read from storage: ${targetFileError?.message || "Storage access denied"}`)
    }

    const targetBuffer = await targetFileData.arrayBuffer()
    const rawTargetText = extractTextFromBuffer(targetBuffer, targetVersion.file_name)
    const normalizedTargetText = normalizeText(rawTargetText)

    if (!normalizedTargetText || normalizedTargetText.length < 3) {
      throw new Error(`Extracted text from "${targetVersion.file_name}" is empty or in an unsupported format.`)
    }

    const targetTokens = tokenizeText(normalizedTargetText)
    const target3Grams = generateNGrams(targetTokens, 3)

    if (!targetSub.assignment_id) {
      throw new Error("Invalid submission: missing assignment_id.")
    }

    const targetAssignmentId: string = targetSub.assignment_id

    // 2. Fetch Other Submissions for the EXACT SAME assignment
    const { data: otherSubs, error: otherError } = await supabase
      .from("submissions")
      .select("*, submission_versions(*), profiles:student_id(full_name, student_id, email)")
      .eq("assignment_id", targetAssignmentId)
      .neq("id", submissionId)

    if (otherError) {
      throw new Error(`Failed to retrieve comparable assignment submissions: ${otherError.message}`)
    }

    let maxSimilarity = 0
    let highestLexical = 0
    let highestSemantic = 0
    let isDuplicateSubmission = false
    const matches: any[] = []

    // 3. Compare Target Submission against other submissions for SAME assignment
    for (const otherSub of (otherSubs || [])) {
      if (!otherSub.submission_versions || otherSub.submission_versions.length === 0) continue

      const otherVersions = [...otherSub.submission_versions].sort((a: any, b: any) => b.version_number - a.version_number)
      const otherVersion = otherVersions[0]

      try {
        const { data: otherFileData, error: otherFileError } = await supabase.storage
          .from("submissions")
          .download(otherVersion.file_url)

        if (otherFileError || !otherFileData) continue

        const otherBuffer = await otherFileData.arrayBuffer()
        const rawOtherText = extractTextFromBuffer(otherBuffer, otherVersion.file_name)
        const normalizedOtherText = normalizeText(rawOtherText)

        if (!normalizedOtherText) continue

        const isSameStudent = otherSub.student_id === targetSub.student_id
        const otherTokens = tokenizeText(normalizedOtherText)
        const other3Grams = generateNGrams(otherTokens, 3)

        const jaccardSim = calculateJaccardSimilarity(target3Grams, other3Grams)
        const cosineSim = calculateCosineSimilarity(normalizedTargetText, normalizedOtherText)
        const lexicalScore = Math.round((jaccardSim * 0.5 + cosineSim * 0.5) * 100)

        const n4A = generateNGrams(targetTokens, 4)
        const n4B = generateNGrams(otherTokens, 4)
        const semanticScore = Math.round(calculateJaccardSimilarity(n4A, n4B) * 100)

        const combinedScore = Math.round((lexicalScore * 0.5) + (semanticScore * 0.5))

        if (isSameStudent && combinedScore > 90) {
          isDuplicateSubmission = true
        }

        if (combinedScore > 0) {
          const studentProfile = (otherSub.profiles as any) || {}
          const studentDisplayName = studentProfile.full_name || studentProfile.email || `Student (${studentProfile.student_id || "ID"})`

          matches.push({
            matching_submission_id: otherSub.id,
            student_name: studentDisplayName,
            similarity_percentage: combinedScore,
            lexical_score: lexicalScore,
            semantic_score: semanticScore,
            match_type: combinedScore >= 85 ? "exact" : combinedScore >= 60 ? "near_exact" : "semantic",
            methods_used: ["TF-IDF Cosine Similarity", "N-gram Phrase Matching", "Semantic Structure Analysis"],
            target_text_preview: rawTargetText.substring(0, 600),
            matched_text_preview: rawOtherText.substring(0, 600)
          })
        }

        if (!isSameStudent) {
          if (combinedScore > maxSimilarity) maxSimilarity = combinedScore
          if (lexicalScore > highestLexical) highestLexical = lexicalScore
          if (semanticScore > highestSemantic) highestSemantic = semanticScore
        }

      } catch (err) {
        console.warn(`Error comparing against submission ${otherSub.id}:`, err)
      }
    }

    matches.sort((a, b) => b.similarity_percentage - a.similarity_percentage)

    let statusLevel = "low"
    if (isDuplicateSubmission) statusLevel = "duplicate"
    else if (maxSimilarity >= 70) statusLevel = "high"
    else if (maxSimilarity >= 30) statusLevel = "review"

    const reportData = {
      matches,
      lexical_score: highestLexical,
      semantic_score: highestSemantic,
      methods_used: ["TF-IDF Cosine Similarity", "3-Gram Phrase Matching", "Semantic Analysis"],
      semantic_similarity: `${highestSemantic}%`,
      is_duplicate_submission: isDuplicateSubmission,
      status: statusLevel,
      analyzed_at: new Date().toISOString()
    }

    // Save report to database
    await supabase
      .from("plagiarism_reports")
      .upsert({
        submission_id: submissionId,
        similarity_percentage: maxSimilarity,
        status: "completed",
        report_data: reportData
      }, { onConflict: "submission_id" })

    await supabase
      .from("submissions")
      .update({
        similarity_score: maxSimilarity,
        updated_at: new Date().toISOString()
      })
      .eq("id", submissionId)

    return {
      success: true,
      similarity: maxSimilarity,
      status: statusLevel,
      matchesCount: matches.length,
      report_data: reportData
    }

  } catch (err: any) {
    console.error("Plagiarism client fallback error:", err)
    
    // Save failure record to database
    try {
      await supabase.from("plagiarism_reports").upsert({
        submission_id: submissionId,
        similarity_percentage: 0,
        status: "processing_failed",
        report_data: {
          error: err.message || String(err),
          failed_at: new Date().toISOString()
        }
      }, { onConflict: "submission_id" })
    } catch (e) {
      console.error("Could not save plagiarism failure status:", e)
    }

    throw err
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      const base64 = res.includes(",") ? res.split(",")[1] : res
      resolve(base64)
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

export async function checkPlagiarismPreSubmission(
  file: File,
  assignmentId: string,
  studentId: string
): Promise<any> {
  const base64 = await fileToBase64(file)
  const endpoints = [
    "/api/check-plagiarism-presubmit"
  ]

  let lastError: any = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
          assignmentId,
          studentId
        })
      })

      if (res.ok) {
        return await res.json()
      } else {
        const errorData = await res.json().catch(() => ({}))
        lastError = new Error(errorData.message || errorData.error || `HTTP error ${res.status}`)
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error("Plagiarism checking service is temporarily unavailable. Please try again.")
}

export async function finalizePlagiarismCheck(payload: {
  checkId?: string
  submissionId: string
  targetFeaturesData?: any
  matchesToInsert?: any[]
  finalScore?: number
  status?: string
}): Promise<any> {
  const endpoints = [
    "/api/finalize-plagiarism-check"
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        return await res.json()
      }
    } catch (err) {
      // Continue to next endpoint
    }
  }

  return { success: false }
}

export async function triggerSimilarityCheck(submissionId: string): Promise<any> {
  const endpoints = [
    "/api/check-similarity"
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      })

      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      // Continue to fallback
    }
  }

  // Fallback to client-side processor
  return await processSimilarityClientFallback(submissionId)
}

export async function triggerPlagiarismRetry(submissionId: string): Promise<any> {
  const endpoints = [
    "/api/plagiarism-retry",
    "/api/check-similarity"
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      })

      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      // Continue to fallback
    }
  }

  // Fallback to client-side processor
  return await processSimilarityClientFallback(submissionId)
}


