# Quick script to set Pexels API key
# Run: .\SET-PEXELS-API.ps1

Write-Host "🔑 Setting up Pexels API Key" -ForegroundColor Cyan
Write-Host ""

# Get API key from user
$apiKey = Read-Host "Enter your Pexels API key"

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "❌ No API key provided. Exiting." -ForegroundColor Red
    exit 1
}

# Set for current session
$env:PEXELS_API_KEY = $apiKey
Write-Host "✅ Pexels API key set for current session" -ForegroundColor Green

# Ask if user wants to make it permanent
$makePermanent = Read-Host "Make it permanent (available in all PowerShell sessions)? (y/n)"

if ($makePermanent -eq 'y' -or $makePermanent -eq 'Y') {
    [System.Environment]::SetEnvironmentVariable('PEXELS_API_KEY', $apiKey, 'User')
    Write-Host "✅ Pexels API key saved permanently!" -ForegroundColor Green
    Write-Host "⚠️  Restart PowerShell for it to take effect in new sessions" -ForegroundColor Yellow
} else {
    Write-Host "ℹ️  API key is set for this session only. Close PowerShell and it will be gone." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Setup complete! You can now use Pexels image search." -ForegroundColor Green
Write-Host ""
Write-Host "Test it:"
Write-Host "  node scripts/fetch-images-local-ai.js fittonia" -ForegroundColor Cyan

