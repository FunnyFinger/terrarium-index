# Setup Local AI with Ollama

Use your local AI (Llama) to validate plant images - **100% free and private!**

## Quick Setup (5 minutes)

### 1. Install Ollama
Download and install from: **https://ollama.ai**
- Windows: Download installer and run it
- It will start automatically in the background

### 2. Pull a Vision Model
Open a new terminal/command prompt and run:

```bash
# Option 1: Llava (recommended, ~4GB)
ollama pull llava

# Option 2: Llama 3.2 Vision (smaller, ~1.5GB)
ollama pull llama3.2-vision:1b

# Option 3: Bakllava (alternative)
ollama pull bakllava
```

This downloads the model (one-time, ~1-5GB depending on model).

### 3. Verify Setup
```bash
ollama list
```
You should see your vision model listed.

### 4. Run the Script
```bash
# Install dependencies (one time)
npm install axios

# Run the fetcher
node scripts/fetch-images-local-ai.js
```

## How It Works

1. ✅ **Searches** free image APIs (Pexels, Pixabay, Unsplash)
2. ✅ **Downloads candidate images** temporarily
3. ✅ **Uses your local AI** (Llama/Llava) to analyze each image:
   - Is it the correct plant? ✅/❌
   - Quality rating (1-10)
   - Aesthetic rating (1-10)
4. ✅ **Selects top 3** highest-scoring images
5. ✅ **Downloads** to correct folders

## Advantages

✅ **100% Free** - No API costs
✅ **100% Private** - All processing local
✅ **Works Offline** - After initial setup
✅ **Accurate** - AI validates images
✅ **No Rate Limits** - Process as many as you want

## Performance

- **Speed**: ~5-15 seconds per plant (depends on your GPU/CPU)
- **GPU Recommended**: Much faster with NVIDIA GPU
- **CPU Works Too**: Slower but still functional

## Troubleshooting

**"Ollama not running"**
- Make sure Ollama app is running
- Check: `ollama list` should work

**"No vision models found"**
- Run: `ollama pull llava`

**"Very slow"**
- Use smaller model: `ollama pull llama3.2-vision:1b`
- Or use GPU-accelerated Ollama (if available)

**"Memory errors"**
- Use smaller model (llama3.2-vision:1b)
- Close other applications

## Optional: Use GPU (Much Faster!)

If you have NVIDIA GPU:
1. Install CUDA drivers
2. Ollama will automatically use GPU
3. Much faster processing!

## Cost Comparison

- **OpenAI API**: ~$2-5 for all plants
- **Local AI (Ollama)**: **$0** (just electricity!)

