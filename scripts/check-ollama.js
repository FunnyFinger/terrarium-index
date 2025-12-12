// Quick check if Ollama is set up correctly
const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

async function checkOllama() {
    console.log('Checking Ollama setup...\n');
    
    try {
        // Check if Ollama is running
        const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
        const models = response.data.models || [];
        
        console.log('✅ Ollama is running!\n');
        console.log(`📦 Available models (${models.length}):`);
        models.forEach(m => {
            const size = (m.size / 1024 / 1024 / 1024).toFixed(2);
            console.log(`   - ${m.name} (${size} GB)`);
        });
        
        // Check for vision models
        const visionModels = models.filter(m => 
            m.name.includes('llava') || 
            m.name.includes('vision') || 
            m.name.includes('bakllava')
        );
        
        console.log('\n🔍 Vision-capable models:');
        if (visionModels.length > 0) {
            visionModels.forEach(m => {
                console.log(`   ✅ ${m.name}`);
            });
            console.log('\n✅ Ready to use! Run: node scripts/fetch-images-local-ai.js');
        } else {
            console.log('   ⚠️ No vision models found');
            console.log('\n📥 Install a vision model:');
            console.log('   ollama pull llava');
            console.log('   or');
            console.log('   ollama pull llama3.2-vision:1b');
        }
        
    } catch (err) {
        console.error('❌ Ollama is not running or not accessible');
        console.error(`   URL: ${OLLAMA_URL}`);
        console.error('\n📥 To install Ollama:');
        console.error('   1. Download from: https://ollama.ai');
        console.error('   2. Install and start Ollama');
        console.error('   3. Run: ollama pull llava');
        process.exit(1);
    }
}

checkOllama();

