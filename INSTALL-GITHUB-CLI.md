# Installing GitHub CLI on Windows

## Method 1: Using Winget (Recommended - Windows 10/11)

Open PowerShell as Administrator and run:
```powershell
winget install --id GitHub.cli
```

## Method 2: Using Chocolatey

If you have Chocolatey installed:
```powershell
choco install gh
```

## Method 3: Using Scoop

If you have Scoop installed:
```powershell
scoop install gh
```

## Method 4: Manual Installation

1. Download the installer from: https://cli.github.com/
2. Run the installer (.msi file)
3. Follow the installation wizard
4. Restart your terminal/PowerShell

## After Installation

1. Verify installation:
```powershell
gh --version
```

2. Authenticate with GitHub:
```powershell
gh auth login
```
   - Follow the prompts to authenticate
   - Choose your preferred authentication method (browser or token)

3. Create and push your repository:
```powershell
gh repo create terrarium-index --public --source=. --remote=origin --push
```

