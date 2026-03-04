# Reducing Supabase storage egress

Storage **egress** is data transferred from Supabase (e.g. images) to users. Your plan’s cached egress limit applies to this.

## What uses egress here

- **Image transform URLs** (`/storage/v1/render/image/public/...`) – every card thumbnail and gallery image requested from Supabase counts.
- **Direct object URLs** – any `object/public` image loads also count.

## What we did in code to reduce egress

- **Card thumbnails** use smaller size and lower quality:
  - Max width 360px (desktop), 280px (mobile).
  - Quality 60 for card thumbs (was 75).
- Gallery/preview images still use higher quality (85) and larger width (1200) because they’re only loaded when a user opens a product.

## What you can do in Supabase

1. **Dashboard**  
   [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings** → **Usage** to see what’s using egress.

2. **Upgrade plan**  
   If you need more than 5GB egress per month, upgrade your plan for a higher egress allowance.

3. **CDN**  
   Putting a CDN (e.g. Cloudflare) in front of your site can cache Supabase image responses so repeat visitors don’t hit Supabase every time (cache hits reduce egress from Supabase).

4. **Tweak code**  
   In `script.js`, `getCardThumbUrl()` defaults:
   - Lower `quality` (e.g. 50) or max width further to reduce bytes per image.
   - Card thumb width is set in `getCardThumbWidth()` (currently 280/360).

## Optional: serve thumbnails from a CDN

If you use Cloudflare or another CDN with caching, make sure your image URLs are requested through your domain so the CDN can cache them. Same URLs = cache hits = less egress from Supabase.
