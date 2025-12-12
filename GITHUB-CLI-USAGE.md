# Using GitHub CLI to Push Your Code

## Step 1: Restart Your Terminal

After installing GitHub CLI, **close and reopen** your PowerShell/terminal window so it can recognize the `gh` command.

## Step 2: Verify Installation

Open a new terminal and run:
```powershell
gh --version
```

You should see the version number (e.g., `gh version 2.83.1`).

## Step 3: Authenticate with GitHub

Run this command to log in:
```powershell
gh auth login
```

You'll be prompted to:
1. **Choose GitHub.com** (press Enter)
2. **Choose authentication method:**
   - **HTTPS** (recommended) - press Enter
   - Or **SSH** if you prefer
3. **Authenticate Git:**
   - Choose **Yes** to authenticate Git with your GitHub credentials
4. **Choose preferred protocol:**
   - **Login with a web browser** (easiest) - press Enter
   - Or **Paste an authentication token** if you have one
5. **Press Enter** to open your browser
6. **Authorize GitHub CLI** in your browser
7. Return to terminal - you should see "✓ Authentication complete"

## Step 4: Create Repository and Push Code

Once authenticated, run this single command from your project directory:

```powershell
gh repo create terrarium-index --public --source=. --remote=origin --push
```

This command will:
- ✅ Create a new public repository called `terrarium-index` on GitHub
- ✅ Set it as the remote origin
- ✅ Push your code to GitHub

**Alternative options:**

**Create private repository:**
```powershell
gh repo create terrarium-index --private --source=. --remote=origin --push
```

**Create repository without pushing (if you want to push manually later):**
```powershell
gh repo create terrarium-index --public --source=. --remote=origin
git push -u origin main
```

## Step 5: Verify

After pushing, you can:
- Visit your repository: `https://github.com/YOUR_USERNAME/terrarium-index`
- Or open it directly: `gh repo view --web`

## Troubleshooting

**If `gh` command not found after restart:**
- Make sure GitHub CLI was installed successfully
- Try restarting your computer
- Or manually add to PATH: `C:\Program Files\GitHub CLI\`

**If authentication fails:**
- Make sure you're logged into GitHub in your browser
- Try: `gh auth login --web`
- Or use token method: `gh auth login --with-token < token.txt`

