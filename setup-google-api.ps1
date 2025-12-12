# Google API Setup Script
# This script helps you set Google API environment variables

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Google Image Search API Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if variables are already set
$currentApiKey = $env:GOOGLE_API_KEY
$currentCseId = $env:GOOGLE_CSE_ID

if ($currentApiKey -and $currentCseId) {
    Write-Host "[OK] Environment variables are already set!" -ForegroundColor Green
    Write-Host "   GOOGLE_API_KEY: $($currentApiKey.Substring(0, [Math]::Min(20, $currentApiKey.Length)))..." -ForegroundColor Gray
    Write-Host "   GOOGLE_CSE_ID: $($currentCseId.Substring(0, [Math]::Min(20, $currentCseId.Length)))..." -ForegroundColor Gray
    Write-Host ""
    $response = Read-Host "Do you want to update them? (y/n)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Keeping existing values." -ForegroundColor Yellow
        exit
    }
}

Write-Host "Please enter your Google API credentials:" -ForegroundColor Yellow
Write-Host ""

# Get API Key
if (-not $currentApiKey -or $response -eq 'y' -or $response -eq 'Y') {
    Write-Host "Step 1: Google API Key" -ForegroundColor Cyan
    Write-Host "   Get it from: https://console.cloud.google.com/apis/credentials" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[TIP] Paste tip: Right-click to paste (or Shift+Insert)" -ForegroundColor Yellow
    $apiKey = Read-Host "Enter your GOOGLE_API_KEY"
    
    if ($apiKey) {
        $env:GOOGLE_API_KEY = $apiKey
        Write-Host "[OK] API Key set!" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "[WARN] No API key entered. Skipping..." -ForegroundColor Yellow
    }
}

# Get CSE ID
if (-not $currentCseId -or $response -eq 'y' -or $response -eq 'Y') {
    Write-Host "Step 2: Custom Search Engine ID (CSE ID)" -ForegroundColor Cyan
    Write-Host "   Get it from: https://programmablesearchengine.google.com/controlpanel" -ForegroundColor Gray
    Write-Host "   (Under Setup -> Advanced -> Search engine ID)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[TIP] Paste tip: Right-click to paste (or Shift+Insert)" -ForegroundColor Yellow
    $cseId = Read-Host "Enter your GOOGLE_CSE_ID"
    
    if ($cseId) {
        $env:GOOGLE_CSE_ID = $cseId
        Write-Host "[OK] CSE ID set!" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "[WARN] No CSE ID entered. Skipping..." -ForegroundColor Yellow
    }
}

# Verify
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($env:GOOGLE_API_KEY -and $env:GOOGLE_CSE_ID) {
    Write-Host "[OK] All environment variables are set!" -ForegroundColor Green
    Write-Host ""
    Write-Host "[INFO] IMPORTANT: These variables are set for THIS PowerShell session only." -ForegroundColor Yellow
    Write-Host "   To make them permanent:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', '$env:GOOGLE_API_KEY', 'User')" -ForegroundColor Gray
    Write-Host "   [System.Environment]::SetEnvironmentVariable('GOOGLE_CSE_ID', '$env:GOOGLE_CSE_ID', 'User')" -ForegroundColor Gray
    Write-Host ""
    
    $makePermanent = Read-Host "Make these permanent? (y/n)"
    if ($makePermanent -eq 'y' -or $makePermanent -eq 'Y') {
        [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', $env:GOOGLE_API_KEY, 'User')
        [System.Environment]::SetEnvironmentVariable('GOOGLE_CSE_ID', $env:GOOGLE_CSE_ID, 'User')
        Write-Host "[OK] Environment variables saved permanently!" -ForegroundColor Green
        Write-Host "   (You may need to restart PowerShell for changes to take effect)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "[READY] You can now run:" -ForegroundColor Cyan
    Write-Host "   node scripts/fetch-images-local-ai.js 'creeping fig'" -ForegroundColor White
} else {
    Write-Host "[ERROR] Some environment variables are missing." -ForegroundColor Red
    Write-Host "   Please run this script again and enter all values." -ForegroundColor Yellow
}

Write-Host ""
