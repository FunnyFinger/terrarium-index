# AI-Powered Image Fetcher Setup Guide

## Option 1: Simple Free Version (Recommended)

Uses free image APIs with smart search terms - no AI required, fast and simple.

### Setup:
```bash
npm install axios
```

### Get Free API Keys (Optional but Recommended):
1. **Pexels** (Recommended - easiest):
   - Go to: https://www.pexels.com/api/
   - Sign up (free)
   - Copy your API key
   
2. **Pixabay**:
   - Go to: https://pixabay.com/api/docs/
   - Sign up (free)
   - Get your API key

3. **Unsplash**:
   - Go to: https://unsplash.com/developers
   - Create app (free)
   - Get Access Key

### Set Environment Variables:
```bash
# Windows PowerShell
$env:PEXELS_API_KEY="your_pexels_key"
$env:PIXABAY_API_KEY="your_pixabay_key"
$env:UNSPLASH_ACCESS_KEY="your_unsplash_key"

# Then run:
node scripts/fetch-images-simple.js
```

### Usage:
```bash
# Fetch images for all plants
node scripts/fetch-images-simple.js

# Fetch images for specific plant (by ID)
node scripts/fetch-images-simple.js 1

# Fetch images for plants matching name
node scripts/fetch-images-simple.js fittonia
```

---

## Option 2: AI Vision Version (Advanced)

Uses OpenAI GPT-4 Vision to validate images for accuracy and quality.

### Requirements:
- OpenAI API key (costs money - ~$0.01-0.05 per plant)
- npm install openai axios

### Setup:
```bash
npm install openai axios
```

### Set API Key:
```bash
# Windows PowerShell
$env:OPENAI_API_KEY="your_openai_key"

# Then run:
node scripts/fetch-images-ai-openai.js
```

### How It Works:
1. **Generates optimal search terms** using GPT-4
2. **Searches** free image APIs
3. **Validates each image** with GPT-4 Vision:
   - Checks if it's the correct plant
   - Rates quality (1-10)
   - Rates aesthetic appeal (1-10)
4. **Selects top 3** highest-scoring images
5. **Downloads** to plant folders

### Cost Estimate:
- ~112 plants × $0.02 = **~$2-5 total**
- Very accurate results

---

## Option 3: Hybrid Approach (Best of Both)

Combine free APIs with AI validation only for uncertain cases.

---

## Recommended: Start with Option 1

The simple version works great and is free! It:
- ✅ Uses smart search terms
- ✅ Searches multiple free APIs
- ✅ Ranks by quality indicators (likes, source)
- ✅ Downloads automatically
- ✅ No AI costs
- ✅ Fast processing

Try it first, then upgrade to AI vision if needed for better accuracy.

