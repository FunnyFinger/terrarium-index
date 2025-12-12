# Plant Detail Categorization Guide

This document describes the **refined, non-overlapping** standardized categories for plant detail fields. All plants in the database must use these exact category values.

## Categorized Fields

The following fields have standardized categories (excluding `size` and `colors`):

### 1. Plant Type (`plantType`)

**Botanical classification** - Based on major plant groups. Each plant belongs to exactly ONE botanical group. No overlap.

**Valid Categories:**
- `flowering-plant` - All flowering plants (includes orchids, herbs, trees, cacti, succulents, bromeliads, carnivorous plants, etc.)
- `conifer` - Cone-bearing plants (conifers, cycads, ginkgo, etc.)
- `fern` - True ferns
- `spikemoss` - Clubmosses and spikemosses (Selaginella, Lycopodium, etc.)
- `moss` - True mosses
- `liverwort` - Liverworts
- `algae` - Algae (not true plants but photosynthetic)
- `fungus` - Fungi (not plants but often included in collections)

**Key Points:**
- Orchids are `flowering-plant` (not a separate type)
- Cacti are `flowering-plant` (not a separate type)
- Succulents are `flowering-plant` (not a separate type - it's a growth form, not a botanical group)
- Selaginella (spikemoss) is `spikemoss` (not fern or moss)

### 2. Growth Pattern (`growthPattern`)

**Physical form and structure** - How the plant grows and spreads. Each describes a distinct growth form. No overlap.

**Valid Categories:**
- `upright-columnar` - Tall, narrow, tree-like or columnar form
- `upright-bushy` - Multiple stems, full bushy appearance
- `upright-single-stem` - Single main stem, upright growth
- `vining-climbing` - Climbs with support (aerial roots, tendrils, etc.)
- `vining-trailing` - Hangs down, trailing growth
- `rosette` - Circular leaf arrangement from central point
- `clumping` - Forms tight clusters or clumps
- `carpeting` - Low-growing, dense horizontal mat
- `spreading` - Spreads horizontally but not as dense as carpeting
- `pendent` - Hangs down from attachment point (epiphytic)

**Key Points:**
- `vining-climbing` vs `vining-trailing`: Climbing uses support, trailing hangs freely
- `carpeting` vs `spreading`: Carpeting is dense mat, spreading is looser
- `upright-bushy` vs `upright-columnar`: Bushy has multiple stems, columnar is narrow/tree-like

### 3. Growth Habit (`growthHabit`)

**Environmental relationship** - Where/how the plant grows in relation to substrate. Each describes a distinct environmental relationship. No overlap.

**Valid Categories:**
- `ground-dwelling` - Grows in soil/substrate with roots in ground
- `tree-dwelling` - Grows on other plants (trees) without being parasitic
- `rock-dwelling` - Grows on or among rocks
- `fully-aquatic` - Fully submerged in water
- `emergent-aquatic` - Roots in water, leaves/stems above water
- `semi-aquatic` - Can grow in both aquatic and terrestrial conditions
- `semi-epiphytic` - Starts tree-dwelling, later becomes ground-dwelling (or vice versa)

**Key Points:**
- `fully-aquatic` vs `emergent-aquatic`: Fully-aquatic is completely underwater, emergent-aquatic has parts above water
- `semi-aquatic` vs `emergent-aquatic`: Semi-aquatic can grow in both conditions, emergent-aquatic is always in water
- `tree-dwelling` vs `semi-epiphytic`: Tree-dwelling stays on trees, semi-epiphytic transitions

### 4. Hazard (`hazard`)

Safety information regarding potential toxicity or harm to humans and pets.

**Valid Categories:**
- `non-toxic` - Safe for humans and pets
- `toxic-if-ingested` - Contains substances that can cause harm if eaten
- `handle-with-care` - May cause skin irritation or other reactions

### 5. Rarity (`rarity`)

Indicates how commonly available or easy to find this plant is in cultivation and trade.

**Valid Categories:**
- `common` - Widely available in nurseries and garden centers
- `uncommon` - Available but may require searching specialty stores
- `rare` - Difficult to find, typically available only from specialty growers
- `very-rare` - Extremely difficult to obtain, often limited to collectors

### 6. Flowering Period (`floweringPeriod`)

When and how often the plant produces flowers.

**Valid Categories:**
- `seasonal` - Flowers during specific seasons on a regular annual cycle
- `year-round` - Can flower continuously throughout the year
- `irregular` - Flowering occurs unpredictably or infrequently
- `does-not-flower` - Plant does not produce flowers (e.g., ferns, mosses)
- `does-not-flower-in-cultivation` - May flower in nature but rarely flowers when grown indoors

### 7. CO2 (`co2`)

CO2 supplementation requirements (primarily for aquatic plants).

**Valid Categories:**
- `not-required` - CO2 supplementation is not needed
- `beneficial` - CO2 supplementation is helpful but optional
- `recommended` - CO2 supplementation is recommended
- `required` - CO2 supplementation is necessary

## Usage

### Refined Categorization Script

Run the refined categorization script to automatically map existing values to standardized categories using taxonomy-based detection:

```bash
node scripts/categorize-plant-details-refined.js
```

This script will:
1. Scan all plant files in `data/plants-merged/`
2. Use taxonomy data to accurately determine plant type
3. Map existing values to standardized categories
4. Update plant files with standardized values
5. Report statistics

### Validation Script

Run the validation script to verify all plants use valid categories:

```bash
node scripts/validate-plant-categories.js
```

This script will:
1. Check all plant files for valid category values
2. Report any plants with invalid or missing categories
3. Exit with code 0 if all plants are valid, 1 if errors are found

## Key Improvements

### Non-Overlapping Categories

The refined system ensures:
- **Plant Type** is based on botanical classification, not growth forms
- **Growth Pattern** describes physical structure, not environment
- **Growth Habit** describes environmental relationship, not structure

### Examples

- **Orchid**: `plantType: flowering-plant` (not "orchid" - orchids are flowering plants)
- **Cactus**: `plantType: flowering-plant` (not "cactus" - cacti are flowering plants)
- **Selaginella**: `plantType: spikemoss` (not "fern" or "moss" - it's a spikemoss)
- **Philodendron**: `plantType: flowering-plant`, `growthPattern: vining-climbing`, `growthHabit: tree-dwelling`

## Adding New Plants

When adding new plants:
1. Use taxonomy data to determine `plantType` accurately
2. Observe the plant's physical form for `growthPattern`
3. Note where it grows naturally for `growthHabit`
4. Always use the exact category values listed above

### 8. Propagation (`propagation`)

Methods used to create new plants from an existing plant. Multiple methods may be listed, separated by commas.

**Valid Categories (comma-separated):**
- `Stem cuttings` - Cut a section of stem with nodes
- `Leaf cuttings` - Remove a healthy leaf and place in soil or water
- `Division` - Separate a mature plant into smaller sections
- `Offsets` - Small plants that grow from the base of the parent
- `Pups` - Small offshoots (especially in bromeliads)
- `Runners` - Horizontal stems that produce new plants at nodes
- `Layering` - Bend a stem to ground and cover part with soil
- `Spores` - Reproductive cells (ferns, mosses)
- `Seed` - Reproduction through seeds
- `Fragmentation` - Breaking apart the plant into pieces
- `Plantlets` - Small plants that form on flower stalks
- `Rhizomes` - Underground stems (includes corms, tubers)
- `Mycelial culture` - For fungi

**Note:** Multiple methods can be combined (e.g., "Stem cuttings, Division, Seed")

### 9. Substrate (`substrate`)

The type of growing medium or surface the plant needs.

**Valid Categories:**
- `Well-draining mix` - Soil that allows water to flow through easily
- `Rich, moisture-retentive` - Nutrient-rich soil that holds moisture well
- `Fine substrate` - Small-grained substrate for delicate roots
- `Epiphytic mix` - Bark, perlite, sphagnum moss mix for epiphytes
- `Attach to driftwood, rocks, or mesh` - Epiphytic/aquatic plants that attach to hardscape
- `No substrate needed` - Floating plants or plants that don't require anchoring
- `Sphagnum moss` - Live sphagnum moss or peat-based mixes
- `Carnivorous mix` - Nutrient-poor, acidic mix for carnivorous plants
- `Decaying wood` - For fungi and some epiphytes

## Notes

- **Size** and **Colors** fields are NOT categorized and can contain free-form text
- Category values are case-sensitive and use kebab-case (hyphens, not spaces or underscores)
- **Propagation** can contain multiple comma-separated methods
- The refined system uses taxonomy-based detection for maximum accuracy
