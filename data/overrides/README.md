# Data overrides (synced from local edits)

When you run the **sync server** (`node scripts/sync-server.js`) and use the site at `http://localhost:3131`, any changes you make (new equipment, plant edits, vivarium edits, images) are written here. Commit and push these files so the hosted site shows the same data.

- `equipment.json` – full equipment list (base + custom, with edits and image paths).
- `plant-edits.json` – plant overlays keyed by plant id (name, description, images, etc.).
- `vivarium-overrides.json` – `{ "edits": { "id": {...} }, "custom": [...] }` for vivarium edits and new vivariums.

If a file is missing, the site falls back to the base data (e.g. `data/equipment.json`) and localStorage when available.
