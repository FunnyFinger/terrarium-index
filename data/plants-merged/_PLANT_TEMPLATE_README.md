# Plant Data Template - Master Reference File

## Purpose
This file (`_PLANT_TEMPLATE.json`) serves as the **master reference** for all plant data files. Every plant file in the `plants-merged` directory MUST follow this exact structure with the same fields. Only the **VALUES** should differ between plants.

## Field Descriptions

### Core Identification
- **id**: Unique numeric identifier for the plant
- **name**: Common name of the plant
- **scientificName**: Scientific name - can be a **STRING** (e.g., `"Genus species"`) OR an **OBJECT** with detailed taxonomy data (for some plants with complex scientific name structures)
- **commonNames**: Array of alternative common names (empty array `[]` if none)

### Categorization
- **category**: Array of category strings (e.g., `["carnivorous", "flowering", "aquatic"]`)
- **substrate**: Substrate type description (e.g., `"Well Draining Mix"`, `"Carnivorous Mix"`)
- **substrateType**: Substrate type classification (e.g., `"wet"`, `"dry"`, `"moist"`, `"epiphytic"`, `"aquatic"`)

### Physical Characteristics
- **size**: Size range string (e.g., `"5-15 cm"`, `"23-30 cm"`)
- **growthRate**: Growth rate description (e.g., `"Moderate"`, `"Fast"`, `"Slow"`)
- **growthPattern**: Growth pattern (e.g., `"rosette"`, `"upright-bushy"`, `"clumping"`, `"carpeting"`)
- **growthHabit**: Growth habit (e.g., `"ground-dwelling"`, `"tree-dwelling"`, `"fully-aquatic"`, `"semi-aquatic"`)
- **plantType**: Plant type (e.g., `"flowering-plant"`, `"moss"`, `"fern"`)
- **colors**: Color description (e.g., `"Green, Red, White"`)

### Description & Care
- **description**: Full description of the plant
- **careTips**: Array of care tip strings
- **specialNeeds**: Special care needs description or `"none"`

### Taxonomy
- **taxonomy**: Object containing:
  - **kingdom**: Taxonomic kingdom
  - **phylum**: Taxonomic phylum
  - **class**: Taxonomic class
  - **order**: Taxonomic order
  - **family**: Taxonomic family
  - **genus**: Taxonomic genus
  - **species**: Full species name

### Plant Characteristics
- **hazard**: Hazard level (e.g., `"non-toxic"`, `"toxic-if-ingested"`)
- **rarity**: Rarity level (e.g., `"common"`, `"uncommon"`, `"rare"`, `"very-rare"`)
- **floweringPeriod**: Flowering period (e.g., `"seasonal"`, `"irregular"`, `"does-not-flower"`)
- **propagation**: Propagation methods (e.g., `"Division, Seed, Stem Cuttings"`)
- **carnivorous**: Boolean - `true` if plant is carnivorous, `false` otherwise

### Range Objects (0-100 scale unless otherwise noted)
All range objects have the structure: `{ "min": number, "max": number, "ideal": number }`

- **humidityRange**: Humidity requirements (0-100 scale)
- **lightRange**: Light requirements (0-100 scale)
- **airCirculationRange**: Air circulation needs (0-100 scale)
- **waterNeedsRange**: Water needs (0-100 scale)
- **temperatureRange**: Temperature range (in appropriate units, not 0-100)
- **difficultyRange**: Care difficulty (0-100 scale)
- **soilPhRange**: Soil pH requirements (0-100 scale)
- **growthRateRange**: Growth rate (0-100 scale)

### Aquatic Plant Fields (Optional)
These fields are present in ALL files but are set to `null` for non-aquatic plants. For aquatic plants, they contain range objects:

- **waterCirculationRange**: Water circulation range object with `min`, `max`, `ideal` OR `null`
- **waterTemperatureRange**: Water temperature range object with `min`, `max`, `ideal` OR `null`
- **waterPhRange**: Water pH range object with `min`, `max`, `ideal` OR `null`
- **waterHardnessRange**: Water hardness range object with `min`, `max`, `ideal` OR `null`
- **salinityRange**: Salinity range object with `min`, `max`, `ideal` OR `null`

### Additional Fields
- **geographicOrigin**: Geographic origin description OR `null`
- **additionalInfo**: Additional info object OR `null`

## Important Notes

1. **All fields must be present**: Every plant file must contain ALL fields shown in this template
2. **Field order**: While JSON doesn't require a specific order, maintaining consistency helps readability
3. **scientificName flexibility**: The `scientificName` field can be either:
   - A simple string: `"Genus species"`
   - An object with detailed taxonomy metadata (for some plants)
4. **Water-related fields**: These are always present but set to `null` for non-aquatic plants
5. **Arrays**: Empty arrays should be `[]`, not `null`
6. **Null values**: Use `null` (not empty string `""`) for optional fields that don't apply

## Validation

When adding or updating plant files, ensure:
- ✅ All fields from the template are present
- ✅ Field types match the template (string, number, boolean, array, object, null)
- ✅ Range objects have `min`, `max`, and `ideal` properties
- ✅ Arrays are arrays (even if empty), not null
- ✅ Boolean fields (`carnivorous`) are actual booleans, not strings

