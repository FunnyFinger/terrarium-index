# Google API Setup Script with Clipboard Support
# This script automatically reads from clipboard if available!

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Google Image Search API Setup" -ForegroundColor Cyan
Write-Host "  (Enhanced with Clipboard Support)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Add clipboard helper
Add-Type -AssemblyName System.Windows.Forms

# Function to try reading from clipboard
function Get-ClipboardText {
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            return [System.Windows.Forms.Clipboard]::GetText()
        }
    } catch {
        return $null
    }
    return $null
}

# Check if variables are already set
$currentApiKey = $env:GOOGLE_API_KEY
$currentCseId = $env:GOOGLE_CSE_ID

if ($currentApiKey -and $currentCseId) {
    Write-Host "✅ Environment variables are already set!" -ForegroundColor Green
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
    Write-Host "📝 Step 1: Google API Key" -ForegroundColor Cyan
    Write-Host "   Get it from: https://console.cloud.google.com/apis/credentials" -ForegroundColor Gray
    Write-Host ""
    
    # Try to read from clipboard first
    $clipboard = Get-ClipboardText
    if ($clipboard -and $clipboard.Length -gt 20) {
        Write-Host "💡 Found text in clipboard. Use it? (y/n)" -ForegroundColor Yellow
        Write-Host "   Clipboard preview: $($clipboard.Substring(0, [Math]::Min(30, $clipboard.Length)))..." -ForegroundColor Gray
        $useClipboard = Read-Host "   "
        if ($useClipboard -eq 'y' -or $useClipboard -eq 'Y') {
            $apiKey = $clipboard.Trim()
            Write-Host "✅ Using clipboard value!" -ForegroundColor Green
        } else {
            Write-Host "💡 Tip: Copy your API key, then RIGHT-CLICK in PowerShell to paste" -ForegroundColor Yellow
            $apiKey = Read-Host "Enter your GOOGLE_API_KEY"
        }
    } else {
        Write-Host "💡 Tip: Copy your API key, then RIGHT-CLICK in PowerShell to paste" -ForegroundColor Yellow
        $apiKey = Read-Host "Enter your GOOGLE_API_KEY"
    }
    
    if ($apiKey) {
        $env:GOOGLE_API_KEY = $apiKey
        Write-Host "✅ API Key set!" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "⚠️ No API key entered. Skipping..." -ForegroundColor Yellow
    }
}

# Get CSE ID
if (-not $currentCseId -or $response -eq 'y' -or $response -eq 'Y') {
    Write-Host "📝 Step 2: Custom Search Engine ID (CSE ID)" -ForegroundColor Cyan
    Write-Host "   Get it from: https://programmablesearchengine.google.com/controlpanel" -ForegroundColor Gray
    Write-Host "   (Under Setup → Advanced → Search engine ID)" -ForegroundColor Gray
    Write-Host ""
    
    # Try to read from clipboard again
    $clipboard = Get-ClipboardText
    if ($clipboard -and $clipboard.Length -gt 10) {
        Write-Host "💡 Found text in clipboard. Use it? (y/n)" -ForegroundColor Yellow
        Write-Host "   Clipboard preview: $($clipboard.Substring(0, [Math]::Min(30, $clipboard.Length)))..." -ForegroundColor Gray
        $useClipboard = Read-Host "   "
        if ($useClipboard -eq 'y' -or $useClipboard -eq 'Y') {
            $cseId = $clipboard.Trim()
            Write-Host "✅ Using clipboard value!" -ForegroundColor Green
        } else {
            Write-Host "💡 Tip: Copy your CSE ID, then RIGHT-CLICK in PowerShell to paste" -ForegroundColor Yellow
            $cseId = Read-Host "Enter your GOOGLE_CSE_ID"
        }
    } else {
        Write-Host "💡 Tip: Copy your CSE ID, then RIGHT-CLICK in PowerShell to paste" -ForegroundColor Yellow
        $cseId = Read-Host "Enter your GOOGLE_CSE_ID"
    }
    
    if ($cseId) {
        $env:GOOGLE_CSE_ID = $cseId
        Write-Host "✅ CSE ID set!" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "⚠️ No CSE ID entered. Skipping..." -ForegroundColor Yellow
    }
}

# Verify
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($env:GOOGLE_API_KEY -and $env:GOOGLE_CSE_ID) {
    Write-Host "✅ All environment variables are set!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️ IMPORTANT: These variables are set for THIS PowerShell session only." -ForegroundColor Yellow
    Write-Host "   To make them permanent:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', '$env:GOOGLE_API_KEY', 'User')" -ForegroundColor Gray
    Write-Host "   [System.Environment]::SetEnvironmentVariable('GOOGLE_CSE_ID', '$env:GOOGLE_CSE_ID', 'User')" -ForegroundColor Gray
    Write-Host ""
    
    $makePermanent = Read-Host "Make these permanent? (y/n)"
    if ($makePermanent -eq 'y' -or $makePermanent -eq 'Y') {
        [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', $env:GOOGLE_API_KEY, 'User')
        [System.Environment]::SetEnvironmentVariable('GOOGLE_CSE_ID', $env:GOOGLE_CSE_ID, 'User')
        Write-Host "✅ Environment variables saved permanently!" -ForegroundColor Green
        Write-Host "   (You may need to restart PowerShell for changes to take effect)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🚀 You can now run:" -ForegroundColor Cyan
    Write-Host "   node scripts/fetch-images-local-ai.js 'creeping fig'" -ForegroundColor White
} else {
    Write-Host "❌ Some environment variables are missing." -ForegroundColor Red
    Write-Host "   Please run this script again and enter all values." -ForegroundColor Yellow
}

Write-Host ""

