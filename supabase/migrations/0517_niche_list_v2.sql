-- Move every stored niche onto the 23-niche list (+ Other / Not Listed).
--
-- Replaces the 12-niche list 0514 canonicalised onto. The CASE below is
-- GENERATED from apps/web/lib/niches.ts (NICHES + NICHE_ALIASES +
-- LEGACY_SPLITS), so the database and the app map words identically.
--
-- ── One value becomes two ───────────────────────────────────────────────────
-- 'Fashion / Beauty' was one bucket and is now 'Fashion & Apparel' and
-- 'Beauty & Skincare'. We cannot tell which a creator meant, so they get BOTH:
-- findable under either filter, and they can untick the one that does not
-- apply. Guessing one would hide them from brands looking for the other.
--
-- Unrecognised values are kept as typed, as in 0514. Idempotent: canonical
-- values map to themselves.

CREATE OR REPLACE FUNCTION canonical_niches_v2(raw text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]', '', 'g')
    WHEN 'animecomicsgeekculture' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'artcraftscreativedesign' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'automotivemotorsports' THEN ARRAY['Automotive & Motorsports']
    WHEN 'beautyskincare' THEN ARRAY['Beauty & Skincare']
    WHEN 'businesssaasentrepreneurship' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'careereducation' THEN ARRAY['Career & Education']
    WHEN 'entertainmentcomedypopculture' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'familyparentingkids' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'fashionapparel' THEN ARRAY['Fashion & Apparel']
    WHEN 'financecryptoinvesting' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'fitnesssportsbodybuilding' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'foodbeveragecooking' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'gamingesports' THEN ARRAY['Gaming & Esports']
    WHEN 'homeinteriordesigndiy' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'lifestyleluxury' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'mentalhealthmindfulness' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'musicdanceperformingarts' THEN ARRAY['Music, Dance & Performing Arts']
    WHEN 'petsanimalcare' THEN ARRAY['Pets & Animal Care']
    WHEN 'photographyvideography' THEN ARRAY['Photography & Videography']
    WHEN 'realestateproperty' THEN ARRAY['Real Estate & Property']
    WHEN 'sustainabilityecogardening' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'technologyaigadgets' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'travelhospitalityadventure' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'othernotlisted' THEN ARRAY['Other / Not Listed']
    WHEN 'financeinvesting' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'fintech' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'cryptoweb3' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'techgadgets' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'businessstartups' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'education' THEN ARRAY['Career & Education']
    WHEN 'lifestyle' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'fitness' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'food' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'travel' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'entertainment' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'other' THEN ARRAY['Other / Not Listed']
    WHEN 'anime' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'manga' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'comics' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'cosplay' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'geek' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'otaku' THEN ARRAY['Anime, Comics & Geek Culture']
    WHEN 'art' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'crafts' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'craft' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'design' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'illustration' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'painting' THEN ARRAY['Art, Crafts & Creative Design']
    WHEN 'auto' THEN ARRAY['Automotive & Motorsports']
    WHEN 'automotive' THEN ARRAY['Automotive & Motorsports']
    WHEN 'cars' THEN ARRAY['Automotive & Motorsports']
    WHEN 'bikes' THEN ARRAY['Automotive & Motorsports']
    WHEN 'motorsports' THEN ARRAY['Automotive & Motorsports']
    WHEN 'motorsport' THEN ARRAY['Automotive & Motorsports']
    WHEN 'beauty' THEN ARRAY['Beauty & Skincare']
    WHEN 'makeup' THEN ARRAY['Beauty & Skincare']
    WHEN 'skincare' THEN ARRAY['Beauty & Skincare']
    WHEN 'cosmetics' THEN ARRAY['Beauty & Skincare']
    WHEN 'grooming' THEN ARRAY['Beauty & Skincare']
    WHEN 'hair' THEN ARRAY['Beauty & Skincare']
    WHEN 'haircare' THEN ARRAY['Beauty & Skincare']
    WHEN 'business' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'startup' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'startups' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'saas' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'entrepreneurship' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'marketing' THEN ARRAY['Business, SaaS & Entrepreneurship']
    WHEN 'career' THEN ARRAY['Career & Education']
    WHEN 'careers' THEN ARRAY['Career & Education']
    WHEN 'edtech' THEN ARRAY['Career & Education']
    WHEN 'learning' THEN ARRAY['Career & Education']
    WHEN 'study' THEN ARRAY['Career & Education']
    WHEN 'exams' THEN ARRAY['Career & Education']
    WHEN 'jobs' THEN ARRAY['Career & Education']
    WHEN 'comedy' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'memes' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'film' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'movies' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'popculture' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'bollywood' THEN ARRAY['Entertainment, Comedy & Pop Culture']
    WHEN 'family' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'parenting' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'kids' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'mom' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'momlife' THEN ARRAY['Family, Parenting & Kids']
    WHEN 'fashion' THEN ARRAY['Fashion & Apparel']
    WHEN 'apparel' THEN ARRAY['Fashion & Apparel']
    WHEN 'style' THEN ARRAY['Fashion & Apparel']
    WHEN 'clothing' THEN ARRAY['Fashion & Apparel']
    WHEN 'streetwear' THEN ARRAY['Fashion & Apparel']
    WHEN 'finance' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'investing' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'investment' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'personalfinance' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'stocks' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'stockmarket' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'trading' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'mutualfunds' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'money' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'wealth' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'insurance' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'banking' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'payments' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'crypto' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'cryptocurrency' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'web3' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'blockchain' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'nft' THEN ARRAY['Finance, Crypto & Investing']
    WHEN 'gym' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'sports' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'bodybuilding' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'workout' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'yoga' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'health' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'nutrition' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'cricket' THEN ARRAY['Fitness, Sports & Bodybuilding']
    WHEN 'cooking' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'recipes' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'foodie' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'baking' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'restaurants' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'beverage' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'drinks' THEN ARRAY['Food, Beverage & Cooking']
    WHEN 'gaming' THEN ARRAY['Gaming & Esports']
    WHEN 'esports' THEN ARRAY['Gaming & Esports']
    WHEN 'games' THEN ARRAY['Gaming & Esports']
    WHEN 'home' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'interior' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'interiordesign' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'diy' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'homedecor' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'decor' THEN ARRAY['Home, Interior Design & DIY']
    WHEN 'liefestyle' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'lifestlye' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'luxury' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'vlog' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'vlogs' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'dailyvlogs' THEN ARRAY['Lifestyle & Luxury']
    WHEN 'mentalhealth' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'mindfulness' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'meditation' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'wellness' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'selfcare' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'therapy' THEN ARRAY['Mental Health & Mindfulness']
    WHEN 'music' THEN ARRAY['Music, Dance & Performing Arts']
    WHEN 'dance' THEN ARRAY['Music, Dance & Performing Arts']
    WHEN 'singing' THEN ARRAY['Music, Dance & Performing Arts']
    WHEN 'theatre' THEN ARRAY['Music, Dance & Performing Arts']
    WHEN 'pets' THEN ARRAY['Pets & Animal Care']
    WHEN 'pet' THEN ARRAY['Pets & Animal Care']
    WHEN 'dogs' THEN ARRAY['Pets & Animal Care']
    WHEN 'cats' THEN ARRAY['Pets & Animal Care']
    WHEN 'animals' THEN ARRAY['Pets & Animal Care']
    WHEN 'photography' THEN ARRAY['Photography & Videography']
    WHEN 'videography' THEN ARRAY['Photography & Videography']
    WHEN 'filmmaking' THEN ARRAY['Photography & Videography']
    WHEN 'realestate' THEN ARRAY['Real Estate & Property']
    WHEN 'property' THEN ARRAY['Real Estate & Property']
    WHEN 'sustainability' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'eco' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'gardening' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'environment' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'plants' THEN ARRAY['Sustainability, Eco & Gardening']
    WHEN 'tech' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'technology' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'gadgets' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'mobile' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'ai' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'software' THEN ARRAY['Technology, AI & Gadgets']
    WHEN 'tourism' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'adventure' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'hospitality' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'hotels' THEN ARRAY['Travel, Hospitality & Adventure']
    WHEN 'fashionbeauty' THEN ARRAY['Fashion & Apparel', 'Beauty & Skincare']
    WHEN '' THEN ARRAY[]::text[]
    ELSE ARRAY[btrim(raw)]
  END;
$$;

COMMENT ON FUNCTION canonical_niches_v2(text) IS
  'Canonical niche(s) for a value; generated from apps/web/lib/niches.ts. '
  'An array because a retired value can split into two. Unrecognised input is '
  'returned trimmed.';

-- ── creators.niches (text[]) ────────────────────────────────────────────────
UPDATE creators
SET niches = COALESCE((
      SELECT array_agg(DISTINCT v ORDER BY v)
      FROM (SELECT unnest(canonical_niches_v2(n)) AS v FROM unnest(niches) AS n) t
      WHERE v IS NOT NULL AND v <> ''
    ), '{}')
WHERE niches IS NOT NULL
  AND array_length(niches, 1) IS NOT NULL;

-- ── creators.niche (legacy singular, read by AI search) ─────────────────────
-- The first of the mapped values; for a split that is Fashion & Apparel.
UPDATE creators
SET niche = (canonical_niches_v2(niche))[1]
WHERE niche IS NOT NULL AND btrim(niche) <> '';

-- ── creator_storefronts.categories (jsonb; what /browse filters on) ─────────
UPDATE creator_storefronts
SET categories = COALESCE((
      SELECT jsonb_agg(DISTINCT v ORDER BY v)
      FROM (
        SELECT unnest(canonical_niches_v2(c)) AS v
        FROM jsonb_array_elements_text(categories) AS c
      ) t
      WHERE v IS NOT NULL AND v <> ''
    ), '[]'::jsonb)
WHERE jsonb_typeof(categories) = 'array'
  AND jsonb_array_length(categories) > 0;

-- ── pipeline_leads.niche (ops-typed, single) ────────────────────────────────
UPDATE pipeline_leads
SET niche = (canonical_niches_v2(niche))[1]
WHERE niche IS NOT NULL AND btrim(niche) <> '';
