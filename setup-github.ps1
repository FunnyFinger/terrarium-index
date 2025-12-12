# GitHub CLI Setup Script
# This script adds GitHub CLI to PATH and helps you authenticate

Write-Host "Adding GitHub CLI to PATH..." -ForegroundColor Green
$env:Path += ";C:\Program Files\GitHub CLI"

Write-Host "`nChecking GitHub CLI installation..." -ForegroundColor Green
gh --version

Write-Host "`nChecking authentication status..." -ForegroundColor Green
gh auth status

Write-Host "`n" -NoNewline
$authenticated = $LASTEXITCODE -eq 0

if (-not $authenticated) {
    Write-Host "You need to authenticate with GitHub." -ForegroundColor Yellow
    Write-Host "Running 'gh auth login'..." -ForegroundColor Yellow
    Write-Host "`nPlease follow these steps:" -ForegroundColor Cyan
    Write-Host "1. Choose 'GitHub.com' (press Enter)" -ForegroundColor Cyan
    Write-Host "2. Choose 'HTTPS' (press Enter)" -ForegroundColor Cyan
    Write-Host "3. Choose 'Yes' to authenticate Git" -ForegroundColor Cyan
    Write-Host "4. Choose 'Login with a web browser' (press Enter)" -ForegroundColor Cyan
    Write-Host "5. Press Enter to open browser and authorize" -ForegroundColor Cyan
    Write-Host "`n"
    
    gh auth login
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ Authentication successful!" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Authentication failed. Please try again." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nReady to create repository!" -ForegroundColor Green
Write-Host "Run this command to create and push your repository:" -ForegroundColor Cyan
Write-Host "  gh repo create terrarium-index --public --source=. --remote=origin --push" -ForegroundColor Yellow
Write-Host "`nOr run this script with -CreateRepo parameter to do it automatically." -ForegroundColor Gray

# Check if user wants to create repo automatically
if ($args -contains "-CreateRepo") {
    Write-Host "`nCreating repository and pushing code..." -ForegroundColor Green
    gh repo create terrarium-index --public --source=. --remote=origin --push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ Repository created and code pushed successfully!" -ForegroundColor Green
        Write-Host "`nYour repository is available at:" -ForegroundColor Cyan
        gh repo view --web
    } else {
        Write-Host "`n✗ Failed to create repository. Please check the error above." -ForegroundColor Red
    }
}

