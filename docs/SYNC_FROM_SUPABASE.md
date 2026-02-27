# Supabase as single source of truth – local backup

When you use Supabase (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)), **Supabase is the single source of truth** for:

- Inventory (prices, stock, visibility, plant/supply/vivarium overrides and **images**)
- Custom equipment (supplies) and their **images**
- Custom vivariums and their **images**

The hosted site reads and writes this data (and uploads new images to Supabase Storage). The **local repo can act as a backup** by pulling that data and a copy of the images into the repo.

## What the sync script does

Run:

```bash
npm run sync-from-supabase
```

Or with env vars (if you don’t want to rely on `js/config.js`):

```bash
SUPABASE_URL=https://your-project.supabase.co SUPABASE_ANON_KEY=your_publishable_key node scripts/sync-from-supabase.js
```

The script:

1. **Fetches** from Supabase: `inventory`, `custom_equipment`, `custom_vivariums`.
2. **Downloads** every image URL (Supabase Storage or any http(s) URL) from that data into:
   - `images/plants/{plantId}/` for plants (inventory with `plant_id` &lt; 50001)
   - `images/supplies/equipment-{id}/` for supplies (inventory 50001–60000 and custom equipment)
   - `images/vivariums/vivarium-{id}/` for vivariums (inventory ≥ 60001 and custom vivariums)
3. **Writes** backup JSON under `data/backup/`:
   - `inventory.json`
   - `custom_equipment.json`
   - `custom_vivariums.json`

Existing image files are skipped (only missing ones are downloaded).

## When to run it

- **Start local site with backup** – pull from Supabase first, then start the dev server:
  ```bash
  npm run local-backup
  ```
  This runs `sync-from-supabase` then `sync-server` (so the local site starts with the latest data and images).

- **Only pull backup** (no server):
  ```bash
  npm run sync-from-supabase
  ```
  Then start your dev server separately if needed (e.g. `npm run sync-server`).
- **After changes on the hosted site** – to refresh the backup (new items, new images, edits).
- **On a schedule** – e.g. a cron job or CI that runs the script and commits `data/backup/` and `images/` so the repo stays a backup of Supabase.

## Single source of truth

| Data | Source of truth | Local backup |
|------|-----------------|--------------|
| Inventory (prices, stock, overrides, image URLs) | Supabase `inventory` | `data/backup/inventory.json` |
| Custom equipment + image URLs | Supabase `custom_equipment` | `data/backup/custom_equipment.json` |
| Custom vivariums + image URLs | Supabase `custom_vivariums` | `data/backup/custom_vivariums.json` |
| Image files (uploaded via site) | Supabase Storage `vivarium-assets` | `images/plants/`, `images/supplies/`, `images/vivariums/` (after sync) |
| Plant catalog (base data) | Repo (e.g. plant-loader, data files) | Already in repo |

The **hosted site** always uses Supabase (and Storage) when `js/config.js` is set. The **local site** can use the same config and talk to Supabase, or run without config and use only repo data; after `sync-from-supabase`, the repo contains a backup of Supabase data and a copy of the images so the local site can double as a backup of the “database” and the images.
