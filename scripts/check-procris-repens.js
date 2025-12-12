/**
 * Check if Procris repens is the accepted name for Elatostema pulchrum
 */

const axios = require('axios');

async function checkNames() {
    console.log('Checking Elatostema pulchrum...\n');
    
    try {
        // Check Elatostema pulchrum
        const response1 = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name: 'Elatostema pulchrum', rank: 'SPECIES' }
        });
        
        console.log('Elatostema pulchrum match result:');
        console.log(JSON.stringify(response1.data, null, 2));
        
        if (response1.data.usageKey) {
            const taxonInfo1 = await axios.get(`https://api.gbif.org/v1/species/${response1.data.usageKey}`);
            console.log('\nElatostema pulchrum taxon info:');
            console.log(`Status: ${taxonInfo1.data.status}`);
            console.log(`Scientific Name: ${taxonInfo1.data.scientificName}`);
            console.log(`Canonical Name: ${taxonInfo1.data.canonicalName}`);
            if (taxonInfo1.data.acceptedUsageKey) {
                console.log(`Accepted Usage Key: ${taxonInfo1.data.acceptedUsageKey}`);
                const accepted1 = await axios.get(`https://api.gbif.org/v1/species/${taxonInfo1.data.acceptedUsageKey}`);
                console.log(`Accepted Name: ${accepted1.data.scientificName}`);
            }
        }
        
        console.log('\n\nChecking Procris repens...\n');
        
        // Check Procris repens
        const response2 = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name: 'Procris repens', rank: 'SPECIES' }
        });
        
        console.log('Procris repens match result:');
        console.log(JSON.stringify(response2.data, null, 2));
        
        if (response2.data.usageKey) {
            const taxonInfo2 = await axios.get(`https://api.gbif.org/v1/species/${response2.data.usageKey}`);
            console.log('\nProcris repens taxon info:');
            console.log(`Status: ${taxonInfo2.data.status}`);
            console.log(`Scientific Name: ${taxonInfo2.data.scientificName}`);
            console.log(`Canonical Name: ${taxonInfo2.data.canonicalName}`);
            if (taxonInfo2.data.acceptedUsageKey) {
                console.log(`Accepted Usage Key: ${taxonInfo2.data.acceptedUsageKey}`);
                const accepted2 = await axios.get(`https://api.gbif.org/v1/species/${taxonInfo2.data.acceptedUsageKey}`);
                console.log(`Accepted Name: ${accepted2.data.scientificName}`);
            }
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkNames();

