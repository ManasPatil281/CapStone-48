$BaseUrl = "http://localhost:8000"
$UserId = "a07bba1d-251b-48be-91de-564841779221"
# Please replace this with an actual learning_object UUID from Supabase!
$LoId = "5d16be5c-b4cf-4590-8fd2-03adf3d0f712"

Write-Host "============================="
Write-Host "   TESTING AI API ENDPOINTS  "
Write-Host "============================="

# 1. Weekly Summary
Write-Host "`n1. Testing Weekly AI Summary (Feature 1)..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/ai/generate-weekly-summary/$UserId" -ContentType "application/json" | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Remediation
Write-Host "`n2. Testing Just-in-Time Remediation (Feature 2)..." -ForegroundColor Cyan
$RemediationBody = @{
    wrong_answer = "O(N^2)"
    question_text = "Which time complexity is fastest?"
    lo_content_text = "O(1) is constant, O(N) is linear, O(N^2) is quadratic."
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/ai/remediation" -Body $RemediationBody -ContentType "application/json" | ConvertTo-Json

# 3. Delivery Variants
Write-Host "`n3. Testing Admin Content Variant Generation (Feature 3)..." -ForegroundColor Cyan
$VariantUri = "$BaseUrl/api/admin/ai/generate-variants/$LoId" + "?target_format=MINDMAP_JSON"
Invoke-RestMethod -Method Post -Uri $VariantUri -ContentType "application/json" | ConvertTo-Json

# 4. Chatbot
Write-Host "`n4. Testing RAG Chatbot (Feature 4)..." -ForegroundColor Cyan
$ChatBody = @{ question = "How do we resolve hash collisions?" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/ai/chat" -Body $ChatBody -ContentType "application/json" | ConvertTo-Json

# 5. Adaptive Router
Write-Host "`n5. Testing Adaptive Routing Agent (Feature 5)..." -ForegroundColor Cyan
$RouteUri = "$BaseUrl/api/ai/route/$UserId" + "?current_lo_id=$LoId"
Invoke-RestMethod -Method Post -Uri $RouteUri -ContentType "application/json" | ConvertTo-Json

# 6. Socratic Grade
Write-Host "`n6. Testing Socratic Grader (Feature 6)..." -ForegroundColor Cyan
$SocraticBody = @{
    concept_name = "Hash Tables"
    user_explanation = "A hash table maps inputs to array indices, but needs lists if collisions happen."
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/ai/socratic-grade" -Body $SocraticBody -ContentType "application/json" | ConvertTo-Json

# 7. Struggle Detection
Write-Host "`n7. Testing Struggle Detection (Feature 7)..." -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/ai/struggle-detection/$UserId/$LoId" -ContentType "application/json" | ConvertTo-Json

# 8. Flashcard
Write-Host "`n8. Testing Dynamic Spaced Repetition (Flashcard) (Feature 8)..." -ForegroundColor Cyan
Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/ai/flashcard/$UserId" | ConvertTo-Json

# 9. Ghost Learner
Write-Host "`n9. Testing AI Ghost Learner Insights (Feature 9)..." -ForegroundColor Cyan
Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/ai/ghost-learner/$LoId" | ConvertTo-Json

# 10. Content Gap
Write-Host "`n10. Testing Admin Content Gap Analyzer (Feature 10)..." -ForegroundColor Cyan
$GapBody = @{ lo_id = $LoId } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/admin/ai/content-gap" -Body $GapBody -ContentType "application/json" | ConvertTo-Json

Write-Host "`n✅ All Endpoints Tested. Review all endpoints via http://localhost:8000/docs." -ForegroundColor Green
