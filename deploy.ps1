# Auto Deploy Script
# Automatically commits and pushes changes to GitHub (which triggers Netlify deployment)

param(
    [string]$Message = "",
    [switch]$SkipConfirm
)

# Colors for output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "[*] Auto Deploy Script"
Write-Info "===================="

# Check if we're in a git repository
if (-not (Test-Path .git)) {
    Write-Error "[X] Not a git repository! Please run this from your project root."
    exit 1
}

# Check for changes
Write-Info "`n[*] Checking for changes..."
$status = git status --porcelain

if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Warning "[!] No changes detected. Nothing to commit."
    exit 0
}

# Show what will be committed
Write-Info "`n[*] Changes to be committed:"
git status --short

# Get commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Info "`n[?] Enter commit message (or press Enter for auto-generated):"
    $Message = Read-Host
    
    if ([string]::IsNullOrWhiteSpace($Message)) {
        # Auto-generate commit message based on changed files
        $changedFiles = git diff --name-only --cached 2>$null
        if (-not $changedFiles) {
            $changedFiles = git status --porcelain | ForEach-Object { ($_ -split '\s+')[1] }
        }
        
        $fileTypes = $changedFiles | ForEach-Object { 
            $ext = [System.IO.Path]::GetExtension($_)
            if ($ext) { $ext.TrimStart('.') } else { 'files' }
        } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1
        
        if ($fileTypes) {
            $Message = "Update $($fileTypes.Name) files"
        } else {
            $Message = "Update files"
        }
        
        Write-Info "   Auto-generated message: $Message"
    }
}

# Confirm before proceeding
if (-not $SkipConfirm) {
    Write-Info "`n[?] Commit and push these changes? (Y/n)"
    $confirm = Read-Host
    if ($confirm -eq 'n' -or $confirm -eq 'N') {
        Write-Warning "[X] Cancelled by user."
        exit 0
    }
}

# Add all changes
Write-Info "`n[+] Adding changes..."
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Error "[X] Failed to add changes!"
    exit 1
}
Write-Success "[OK] Changes added"

# Commit
Write-Info "`n[*] Committing changes..."
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Error "[X] Failed to commit! (Maybe no changes to commit?)"
    exit 1
}
Write-Success "[OK] Changes committed: $Message"

# Get current branch
$branch = git branch --show-current
Write-Info "`n[*] Current branch: $branch"

# Push to GitHub
Write-Info "`n[>] Pushing to GitHub..."
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "[X] Failed to push! Check your git credentials and remote."
    exit 1
}
Write-Success "[OK] Pushed to GitHub"

# Success message
Write-Success "`n[OK] Deployment initiated!"
Write-Info "`n[*] Next steps:"
Write-Info "   1. Check Netlify dashboard for deployment status"
Write-Info "   2. Your site will auto-update when deployment completes"
Write-Info "   3. Usually takes 1-3 minutes"

# Try to get Netlify site URL from git remote
$remoteUrl = git remote get-url origin 2>$null
if ($remoteUrl -match 'github\.com[:/]([^/]+)/([^/]+)') {
    $repoName = $matches[2] -replace '\.git$', ''
    Write-Info "`n[*] Your Netlify site: https://$repoName.netlify.app"
}

Write-Info "`n[OK] Done! Check your Netlify dashboard for deployment progress."

