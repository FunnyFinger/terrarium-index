-- Articles catalog (guides / editorial content)
-- Run in Supabase SQL editor after supabase-security-hardening.sql helpers exist.

create table if not exists public.articles (
  id bigint primary key,
  slug text unique not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists articles_slug_idx on public.articles (slug);
create index if not exists articles_updated_at_idx on public.articles (updated_at desc);

alter table public.articles enable row level security;

drop policy if exists "Allow all for articles" on public.articles;
drop policy if exists "Public read articles" on public.articles;
drop policy if exists "Editors write articles" on public.articles;

create policy "Public read articles" on public.articles
  for select using (true);

create policy "Editors write articles" on public.articles
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;

-- Seed starter articles (skip rows that already exist)
insert into public.articles (id, slug, data)
values
(
  70001,
  'closed-terrarium-basics',
  '{
    "id": 70001,
    "slug": "closed-terrarium-basics",
    "title": "Closed Terrarium Basics: Building a Self-Sustaining World",
    "excerpt": "Learn how sealed terrariums cycle water, why plant choice matters, and how to avoid the most common beginner failures.",
    "category": "Guides",
    "publishedAt": "2026-03-12",
    "readMinutes": 7,
    "coverImage": null,
    "hidden": false,
    "bodyHtml": "<p>A closed terrarium is a sealed (or mostly sealed) glass enclosure where moisture recycles through evaporation and condensation. Done well, it can stay healthy for months with very little watering.</p><h2>How the water cycle works</h2><p>Plants release moisture through transpiration. That vapor condenses on cooler glass and returns to the substrate. Your job is to set the starting moisture level correctly—not to water constantly.</p><h2>Choose the right plants</h2><p>Favor compact tropicals that tolerate high humidity and moderate light. Avoid fast growers that will quickly outgrow the glass, and skip succulents—they usually rot in sealed setups.</p><ul><li>Good fits: mosses, ferns, Fittonia, Peperomia, small Begonia</li><li>Risky: cacti, succulents, large climbing aroids</li><li>Start with fewer plants than you think you need</li></ul><h2>Layering that actually helps</h2><p>A drainage layer, a barrier (mesh), and an airy substrate reduce waterlogging. Activated charcoal is optional but can help keep the mix fresher in a sealed system.</p><h2>Common beginner mistakes</h2><ul><li>Overwatering on day one</li><li>Placing the jar in direct hot sun</li><li>Opening the lid daily and breaking the cycle</li><li>Ignoring mold early—ventilate briefly, then reseal once leaves are dry</li></ul>"
  }'::jsonb
),
(
  70002,
  'vivarium-substrate-guide',
  '{
    "id": 70002,
    "slug": "vivarium-substrate-guide",
    "title": "Choosing Substrate for Terrariums and Vivariums",
    "excerpt": "Drainage, moisture retention, and root health start with the mix. Here is a practical way to pick substrate for open, closed, and bioactive setups.",
    "category": "Care",
    "publishedAt": "2026-04-02",
    "readMinutes": 6,
    "coverImage": null,
    "hidden": false,
    "bodyHtml": "<p>Substrate is not one recipe for every enclosure. Open terrariums, closed jars, and bioactive vivariums each need different moisture and airflow behavior.</p><h2>What a good mix should do</h2><ul><li>Hold moisture without becoming mud</li><li>Allow oxygen to reach roots</li><li>Stay structurally stable as plants grow</li><li>Support clean drainage so water does not pool around stems</li></ul><h2>Closed terrariums</h2><p>Use a lighter, airy mix that will not stay soggy. Combine coco coir or peat alternatives with fine bark, perlite or pumice, and a little charcoal. Keep the profile shallow enough for your vessel.</p><h2>Open terrariums and arid accents</h2><p>Open vessels dry faster. Increase mineral content (pumice, sand, grit) if you grow drought-tolerant plants, and water more deliberately because there is less recycled humidity.</p><h2>Bioactive vivariums</h2><p>Leaf litter, chunky bark, and a drainage layer help cleanup crews thrive. Match the mix to the animal and plant humidity targets rather than copying a houseplant potting soil bag.</p>"
  }'::jsonb
),
(
  70003,
  'humidity-and-airflow',
  '{
    "id": 70003,
    "slug": "humidity-and-airflow",
    "title": "Humidity and Airflow: Finding the Balance",
    "excerpt": "High humidity without stagnant air is the difference between lush growth and constant mold. Learn how to tune both.",
    "category": "Care",
    "publishedAt": "2026-05-18",
    "readMinutes": 5,
    "coverImage": null,
    "hidden": false,
    "bodyHtml": "<p>Many tropical plants love humidity, but stagnant wet air invites mold and soft rot. The goal is moist air that still moves.</p><h2>Read the leaves, not only the gauge</h2><p>Crispy edges can mean air that is too dry. Persistent wet spots, gray fuzz, or mushy stems usually mean too much moisture and too little exchange.</p><h2>Simple ways to raise humidity</h2><ul><li>Group plants</li><li>Use a shallow water tray nearby (not sitting in water)</li><li>Mist lightly if leaves dry quickly—avoid soaking crowns</li><li>Choose an enclosure style that matches the plant</li></ul><h2>Give the air a path</h2><p>Crack lids periodically on closed builds, leave vents on vivariums, and avoid packing foliage so densely that nothing dries after watering. A small USB fan across—not blasting into—the canopy can help in larger setups.</p>"
  }'::jsonb
),
(
  70004,
  'lighting-tropical-plants',
  '{
    "id": 70004,
    "slug": "lighting-tropical-plants",
    "title": "Lighting Tropical Plants Indoors",
    "excerpt": "Bright indirect light is the default for many vivarium plants—but distance, duration, and spectrum matter more than a vague window description.",
    "category": "Guides",
    "publishedAt": "2026-06-08",
    "readMinutes": 6,
    "coverImage": null,
    "hidden": false,
    "bodyHtml": "<p>Most tropical foliage plants used in terrariums prefer bright, filtered light. Direct midday sun through glass can cook leaves; a dark corner stalls growth and invites stretch.</p><h2>Natural light cues</h2><p>East windows are often gentle. South and west exposures may need sheer curtains. If a plant leans hard toward the window or new leaves are pale and distant, increase light.</p><h2>Grow lights without guesswork</h2><ul><li>Start with a full-spectrum LED rated for foliage</li><li>Keep fixtures far enough to avoid bleaching (often 20–40 cm depending on strength)</li><li>Run 10–14 hours on a timer for consistency</li><li>Watch new growth for two weeks before making big changes</li></ul><h2>Enclosure tip</h2><p>Tall closed jars cast shadows. Place light-loving plants higher and shade lovers lower, or use a top-mounted bar light so the canopy is even.</p>"
  }'::jsonb
),
(
  70005,
  'paludarium-intro',
  '{
    "id": 70005,
    "slug": "paludarium-intro",
    "title": "What Is a Paludarium?",
    "excerpt": "Part aquarium, part terrarium—paludariums blend water and land. Here is when this style shines and what to plan for first.",
    "category": "Vivarium Types",
    "publishedAt": "2026-07-01",
    "readMinutes": 5,
    "coverImage": null,
    "hidden": false,
    "bodyHtml": "<p>A paludarium combines an aquatic section with a terrestrial or semi-aquatic shoreline. It is ideal when you want emergent plants, water features, and a richer sense of habitat.</p><h2>Who it is for</h2><p>Choose a paludarium if you enjoy aquascaping and land plants together, or if your animals need both swimming space and dry ledges. It is more complex than a closed jar, but visually rewarding.</p><h2>Core planning points</h2><ul><li>Decide water depth and land height before buying hardscape</li><li>Separate aquatic filtration needs from land humidity needs</li><li>Use plants suited to each zone—fully submerged, marginal, and terrestrial</li><li>Plan maintenance access for both water changes and land pruning</li></ul><h2>Plant ideas by zone</h2><p>Aquatic and marginal plants belong near the waterline. Keep moisture-loving terrestrials on the bank, and reserve drier shelves for species that dislike wet feet.</p>"
  }'::jsonb
)
on conflict (id) do nothing;
