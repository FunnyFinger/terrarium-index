# Set Pexels API Key Permanently
# Run: .\set-pexels-permanent.ps1

Write-Host "Setting Pexels API Key Permanently" -ForegroundColor Cyan
Write-Host ""

# Get API key from user
$apiKey = Read-Host "Enter your Pexels API key"

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "ERROR: No API key provided. Exiting." -ForegroundColor Red
    exit 1
}

# Set for current session
$env:PEXELS_API_KEY = $apiKey
Write-Host "OK: Set for current session" -ForegroundColor Green

# Set permanently
try {
    [System.Environment]::SetEnvironmentVariable("PEXELS_API_KEY", $apiKey, "User")
    Write-Host "OK: Saved permanently to user environment variables" -ForegroundColor Green
    Write-Host ""
    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "NOTE: You may need to restart PowerShell for it to work in new sessions" -ForegroundColor Yellow
    Write-Host "Current session is already set and ready to use!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Test it now:" -ForegroundColor Cyan
    Write-Host "  node test-pexels-api.js" -ForegroundColor White
} catch {
    Write-Host "ERROR: Error setting environment variable: $_" -ForegroundColor Red
    Write-Host "Try running PowerShell as Administrator" -ForegroundColor Yellow
    exit 1
}
