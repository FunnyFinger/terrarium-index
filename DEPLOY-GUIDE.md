# Quick Deploy Guide

After accepting code changes from AI, use these scripts to automatically deploy to Netlify.

## Method 1: PowerShell Script (Recommended)

### Basic Usage:
```powershell
.\deploy.ps1
```

The script will:
1. ✅ Check for changes
2. ✅ Show what will be committed
3. ✅ Ask for commit message (or auto-generate)
4. ✅ Ask for confirmation
5. ✅ Add, commit, and push to GitHub
6. ✅ Trigger Netlify auto-deployment

### With Custom Message:
```powershell
.\deploy.ps1 -Message "Fix plant loading issue"
```

### Skip Confirmation (for automation):
```powershell
.\deploy.ps1 -Message "Update files" -SkipConfirm
```

## Method 2: Batch File (Double-click)

Just double-click `deploy.bat` - it will run the PowerShell script automatically.

## Method 3: Manual Commands

If you prefer manual control:
```powershell
git add .
git commit -m "Your commit message"
git push origin master
```

## Workflow Example

1. **AI makes changes** → Files edited locally
2. **You accept changes** → Files saved locally
3. **Run deploy script:**
   ```powershell
   .\deploy.ps1
   ```
4. **Enter commit message** (or press Enter for auto)
5. **Confirm** → Script pushes to GitHub
6. **Netlify auto-deploys** → Site updates in 1-3 minutes

## Tips

- **Quick deploy:** Just run `.\deploy.ps1` and press Enter twice (uses auto message)
- **Custom message:** Use `-Message "Your message here"`
- **Check status:** Script shows what files changed before committing
- **Safe:** Script asks for confirmation before pushing

## Troubleshooting

**If script fails:**
- Make sure you're in the project root directory
- Check that git is installed: `git --version`
- Verify GitHub remote: `git remote -v`

**If Netlify doesn't deploy:**
- Check Netlify dashboard for build logs
- Verify site is connected to GitHub repo
- Check that you pushed to the correct branch (usually `master`)

