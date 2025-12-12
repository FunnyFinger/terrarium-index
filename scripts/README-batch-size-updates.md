# Batch Size Update System

This system processes plant size updates using web-based searches instead of calculations.

## Workflow

### 1. Process a Batch
Generate search queries for a batch of plants:
```bash
node scripts/batch-update-sizes-web.js process 1 10
```
This creates `data/size-updates/batch-1.json` with search queries for 10 plants.

### 2. Search for Sizes
For each plant in the batch:
- **Flowering plants**: Search for "size when first flowers" to "mature size"
- **Non-flowering plants**: Search for "juvenile size" to "mature size"

Use the provided search queries in `batch-1.json`.

### 3. Create Results File
Create `data/size-updates/batch-1-results.json` with the format:
```json
[
  {
    "file": "acalypha-hispida.json",
    "minSize": 30,
    "maxSize": 200
  },
  {
    "file": "acanthostachys-pitcairnioides.json",
    "minSize": 5,
    "maxSize": 30
  }
]
```

**Important:**
- For **flowering plants**: `minSize` = size when it first flowers
- For **non-flowering plants**: `minSize` = juvenile size
- `maxSize` = fully mature size (in cm)

### 4. Apply Updates
Apply the updates to plant files:
```bash
node scripts/batch-update-sizes-web.js apply 1
```

### 5. Check Status
View progress:
```bash
node scripts/batch-update-sizes-web.js status
```

## Commands

- `process [batch] [size]` - Process a batch (default: batch 1, size 10)
- `apply [batch]` - Apply updates from batch results
- `status` - Show processing status

## Examples

```bash
# Process first batch of 10 plants
node scripts/batch-update-sizes-web.js process 1 10

# Process second batch of 20 plants
node scripts/batch-update-sizes-web.js process 2 20

# Apply updates from batch 1
node scripts/batch-update-sizes-web.js apply 1

# Check how many plants are done
node scripts/batch-update-sizes-web.js status
```

## File Structure

```
data/size-updates/
├── progress.json              # Tracks processed plants
├── size-updates-results.json  # All update results
├── batch-1.json              # Search queries for batch 1
├── batch-1-results.json     # Size updates for batch 1
├── batch-2.json
├── batch-2-results.json
└── ...
```

## Notes

- The system automatically skips already processed plants
- Progress is saved after each batch
- All results are logged in `size-updates-results.json`
- Flowering vs non-flowering is automatically detected

