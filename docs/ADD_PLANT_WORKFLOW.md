# Adding a New Plant (streamlined)

Plant data lives in **Supabase** (`plants_catalog`). To add a plant with no manual steps:

1. **You say**: e.g. "Add Red Ruby Aglaonema" or "Add Monstera Thai Constellation".

2. **The assistant**:
   - Searches the web for the plant’s scientific name, care, description, taxonomy, etc.
   - Builds a plant JSON (name, scientificName, description, careTips, taxonomy, category, and any other known fields).
   - Writes that JSON to a file (e.g. `data/new-plant.json`).
   - Runs: `npm run add-plant-to-supabase -- data/new-plant.json`

3. **The script** (`scripts/add-plant-to-supabase.js`):
   - Reads Supabase config from `js/config.js` (or env).
   - Gets the next free plant ID from `plants_catalog`.
   - Fills in any missing fields with safe defaults.
   - POSTs the new row to `plants_catalog`.

4. **Result**: The plant appears on the hosted site immediately (no redeploy). You can add images later in the app.

## Manual use

If you have a plant JSON file (without `id`):

```bash
npm run add-plant-to-supabase -- path/to/plant.json
```

Or from stdin:

```bash
echo '{"name":"My Plant","scientificName":"Genus species","description":"...","careTips":["Tip 1"]}' | node scripts/add-plant-to-supabase.js --stdin
```

## Required in JSON

At minimum: `name`, `scientificName`, `description`, `careTips` (array). The script adds defaults for `category`, `taxonomy`, `images`, `imageUrl`, and all range fields if missing.
