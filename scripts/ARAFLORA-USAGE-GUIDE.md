# Using Araflora.com as a Data Source

## Overview

[Araflora.com](https://www.araflora.com) is an excellent source for:
- **Terrarium plants**
- **Vivarium plants**
- **Carnivorous plants**
- **Orchids**
- **Cacti and succulents**
- **Aquarium, pond, and bog plants**

## Important Considerations

⚠️ **Before using data from Araflora:**

1. **Check Terms of Service**: Review Araflora's terms of service before scraping
2. **Respect robots.txt**: Check `https://www.araflora.com/robots.txt`
3. **Rate Limiting**: Always include delays between requests (2+ seconds)
4. **Attribution**: If using their data, provide proper attribution
5. **Permission**: Consider reaching out to Araflora for API access or permission

## Usage Options

### Option 1: Manual Reference (Recommended)
- Use Araflora as a reference to manually add plants
- Cross-reference their plant listings with your database
- Add missing plants manually with proper attribution

### Option 2: Automated Data Extraction (Use with Caution)
- Use `fetch-araflora-data.js` script
- Extracts plant names, scientific names, descriptions, images
- Requires `cheerio` package: `npm install cheerio axios`

### Option 3: API Access (Best)
- Contact Araflora to request API access
- They may provide structured data in JSON/XML format
- Most professional and sustainable approach

## Installation

If using automated extraction:

```bash
npm install cheerio axios
```

## Running the Script

```bash
node scripts/fetch-araflora-data.js
```

**Note**: You'll need to update the category URLs in the script based on Araflora's actual URL structure.

## What Data Can Be Extracted

- Plant names
- Scientific names
- Prices (reference only)
- Stock status
- Descriptions
- Images
- Categories

## Data Integration

After fetching data:

1. Review each plant manually
2. Verify scientific names
3. Match with existing plants in your database
4. Add missing plants using your plant data structure
5. Update taxonomy and care information
6. Add proper vivariumType classifications

## Categories Available on Araflora

Based on their site:
- Terrarium plants
- Vivarium plants
- Carnivorous plants
- Orchids
- Cacti and succulents
- Aquarium plants
- Houseplants
- Accessories

## Next Steps

1. **Explore their categories** to identify missing plants
2. **Manual addition**: Add new plants manually using Araflora as reference
3. **Image sourcing**: Use Araflora product images with permission
4. **Care information**: Cross-reference care tips from Araflora

## Ethical Use

- Always attribute sources
- Don't overload their servers
- Respect copyright on images and descriptions
- Consider becoming an affiliate if you use their product links

