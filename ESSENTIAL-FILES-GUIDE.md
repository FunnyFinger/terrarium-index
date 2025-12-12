# Essential Files Guide

## Files Required to Run the Site

### Core Files (REQUIRED)
- `index.html` - Main page
- `definitions.html` - Definitions page
- `styles.css` - All styling
- `script.js` - Main application logic
- `data.js` - Plant data (fallback if JSON files fail)
- `data/plant-loader.js` - Loads plant data from JSON files
- `data/plant-data-loader.js` - Additional data loader
- `data/plants-merged/index.json` - Index of all plant files
- `data/plants-merged/*.json` - All 372 plant data files
- `data/rarity-cache.json` - Rarity information
- `images/` - Directory with all plant images (~1,332 images)
- `favicon.png`, `favicon.svg`, `favicon.ico` - Site icons
- `package.json` - Project configuration

**Total Essential Files: ~1,710 files** (372 JSON + 1,332 images + ~6 core files)

---

## Files You Can Remove (Optional)

### Documentation Files (18+ .md files)
All markdown documentation files can be removed:
- `*.md` files in root (ARAFLORA-*.md, GBIF-*.md, PEXELS-*.md, etc.)
- `README-*.md` files
- Documentation in `scripts/` directory

**Impact:** None - these are just documentation

### Development Scripts (193+ files in scripts/)
- `scripts/` directory - All maintenance/processing scripts
- These are for data processing, not required to run the site

**Impact:** None - site runs without these

### Test Files (7 files)
- `test-*.js` files in root
- `test-*.js` files in scripts/
- `temp-selection.html`

**Impact:** None - these are for testing only

### PowerShell Scripts (6 files)
- `*.ps1` files (setup scripts, download scripts)
- `download-images.js`, `download-images.ps1`

**Impact:** None - these are setup/utility scripts

### Data Processing Files
- `data/size-updates/` directory (72+ JSON files)
- These are historical processing data, not needed for site

**Impact:** None - these are backup/processing files

### Node Modules
- `node_modules/` directory
- Can be regenerated with `npm install` if needed

**Impact:** Only needed if you run scripts. Site runs without it.

---

## Summary

**To run the site, you need:**
- ✅ ~1,710 essential files (core HTML/CSS/JS + 372 plant JSON files + 1,332 images)

**You can safely remove:**
- ❌ ~300+ optional files (documentation, scripts, test files, processing data)

**Space savings:** Removing optional files could free up significant space, but the site will work perfectly without them.

---

## Recommendation

If you want to clean up:
1. **Keep everything** if you plan to maintain/update the site
2. **Remove only documentation** if you just want to run the site
3. **Remove scripts + documentation** if you're just deploying the site

The site will work identically with or without the optional files.

