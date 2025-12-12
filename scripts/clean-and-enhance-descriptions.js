const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Plant-specific interesting facts and style notes with unique traits
const PLANT_FACTS = {
  // Ferns
  'asplenium nidus': {
    style: 'creates a stunning architectural focal point with its wavy, elegant fronds that spiral outward',
    fact: 'Named "bird\'s nest" for its rosette shape that collects organic matter, mimicking a bird\'s nest',
    unique: 'This epiphytic fern naturally grows on trees and rocks, forming vase-like rosettes that trap falling debris as natural fertilizer'
  },
  'microsorum': {
    style: 'adds exotic fern texture with its leathery, sometimes iridescent fronds',
    fact: 'Many Microsorum species have thick, leathery fronds that help retain moisture',
    unique: 'Some species exhibit iridescent blue or metallic sheen on their fronds due to specialized surface structures'
  },
  'elaphoglossum': {
    style: 'brings unique metallic shimmer with its dark, glossy fronds',
    fact: 'Known for their tongue-shaped fronds and epiphytic growth habit',
    unique: 'The metallic sheen comes from specialized scales and cuticle layers that reflect light beautifully'
  },
  'platycerium': {
    style: 'creates a dramatic prehistoric aesthetic with its antler-like fronds',
    fact: 'Commonly called "staghorn fern" for its distinctive forked fronds resembling deer antlers',
    unique: 'Produces two types of fronds: shield fronds that anchor to surfaces and fertile fronds that bear spores'
  },
  
  // Aroids
  'alocasia': {
    style: 'adds a dramatic, tropical jungle vibe with its arrow-shaped leaves and striking veination',
    fact: 'Commonly called "elephant ear" plants for their large, ear-shaped foliage',
    unique: 'Many species have distinctive leaf textures - some are velvety, others have metallic or iridescent surfaces that change color with viewing angle'
  },
  'monstera': {
    style: 'brings modern minimalist elegance with its distinctive fenestrated leaves',
    fact: 'The holes in Monstera leaves (fenestrations) allow light to pass through to lower leaves in dense tropical forests',
    unique: 'Young leaves emerge solid and develop fenestrations as they mature - the plant "decides" where to place holes based on light conditions'
  },
  'philodendron': {
    style: 'provides lush, heart-shaped foliage that creates a warm, welcoming atmosphere',
    fact: 'The name Philodendron means "tree lover" in Greek, referring to its epiphytic growth habit',
    unique: 'Many species exhibit dramatic color changes as leaves mature, with new growth often showing vibrant red, pink, or orange hues that fade to green'
  },
  'anthurium': {
    style: 'adds vibrant color and exotic beauty with its glossy, heart-shaped leaves and colorful spathes',
    fact: 'The colorful "flowers" are actually modified leaves called spathes - the true flowers are tiny and cluster on the spadix',
    unique: 'Many species have velvety leaves with prominent white or silver veins that create stunning contrast, and some produce fragrant blooms'
  },
  'syngonium': {
    style: 'adds dynamic visual interest with leaves that change shape dramatically as the plant matures',
    fact: 'Known as "arrowhead plant" for its juvenile arrow-shaped leaves that develop into deeply lobed adult leaves',
    unique: 'Exhibits heteroblastic growth - juvenile leaves are simple and arrow-shaped, while mature leaves become deeply divided with multiple lobes'
  },
  
  // Carnivorous
  'pinguicula': {
    style: 'offers unique intrigue with its rosette form and dewy, jewel-like appearance',
    fact: 'These carnivorous plants secrete sticky mucilage that not only traps insects but also has antibacterial properties',
    unique: 'The leaves curl inward when an insect is trapped, increasing contact area for digestion, and some species produce beautiful violet or purple flowers'
  },
  'nepenthes': {
    style: 'creates an exotic, otherworldly atmosphere with its hanging pitcher traps',
    fact: 'These carnivorous plants produce modified leaves that form pitcher-shaped traps filled with digestive enzymes',
    unique: 'Each pitcher is a complex trap with a waxy interior that prevents prey from climbing out, and some species can trap small vertebrates'
  },
  'drosera': {
    style: 'adds fascinating movement and texture with its tentacle-covered leaves',
    fact: 'Commonly called "sundew" for the glistening, dew-like droplets on each tentacle',
    unique: 'The sticky tentacles can move to wrap around trapped insects, and the entire leaf can curl around larger prey within minutes'
  },
  
  // Air Plants & Epiphytes
  'tillandsia': {
    style: 'creates a modern, sculptural aesthetic when mounted or displayed artistically',
    fact: 'Air plants absorb water and nutrients directly through their leaves using specialized structures called trichomes',
    unique: 'Trichomes not only absorb moisture but also reflect light, giving many species a silvery or fuzzy appearance that helps reduce water loss'
  },
  'bromeliad': {
    style: 'adds tropical flair with its colorful, architectural rosettes and vibrant inflorescences',
    fact: 'Many bromeliads form a central "tank" or cup that collects water and organic debris',
    unique: 'The water-filled rosettes create mini ecosystems, supporting everything from bacteria to small frogs in their native habitats'
  },
  
  // Other Popular Genera
  'begonia': {
    style: 'provides vibrant colors and intricate patterns that add visual interest and texture',
    fact: 'Many begonia species have asymmetrical leaves - a unique trait in the plant world',
    unique: 'Leaves often feature striking patterns including spirals, spots, stripes, and iridescent sheens, with some species having translucent "windows" in their leaves'
  },
  'hoya': {
    style: 'adds tropical charm with its waxy, star-shaped flowers and trailing vines',
    fact: 'Hoya flowers produce sweet nectar that drips like honey - hence the nickname "wax plant"',
    unique: 'The flowers have a distinctive star shape with a waxy texture and often emit strong, pleasant fragrances, especially at night'
  },
  'peperomia': {
    style: 'adds lush greenery with its diverse leaf patterns and compact growth habit',
    fact: 'Peperomia leaves are often thick and succulent-like, storing water in their foliage',
    unique: 'Includes species with textured leaves (rippled, corrugated, quilted), unique patterns, and some with translucent windows that allow light to pass through'
  },
  'soleirolia': {
    style: 'creates a lush carpet effect perfect for miniature landscapes',
    fact: 'Forms dense mats of tiny leaves, creating a moss-like appearance ideal for terrariums',
    unique: 'One of the fastest-spreading terrarium plants, it can quickly cover soil surfaces and even climb over small obstacles'
  },
  'rotala': {
    style: 'adds vibrant color and dynamic growth to aquatic setups',
    fact: 'Leaves can change from green to red based on light intensity, creating stunning color displays',
    unique: 'Under high light and optimal conditions, stems and leaves develop intense red, orange, or pink coloration, making it a favorite in aquascaping'
  },
  'selaginella': {
    style: 'adds ancient, prehistoric texture with its primitive fern-like appearance',
    fact: 'These are not true ferns but primitive vascular plants called "spike mosses"',
    unique: 'Can survive near-complete desiccation and revive when rehydrated - a process called poikilohydry shared with true mosses'
  },
  'cryptanthus': {
    style: 'adds vibrant star-shaped rosettes with stunning striped patterns',
    fact: 'Known as "earth stars" for their low-growing, star-shaped rosettes',
    unique: 'Leaves display incredible color variations and patterns - some are banded, others have zebra stripes, and many have metallic or iridescent qualities'
  },
  'pilea': {
    style: 'adds modern appeal with its unique leaf shapes and textures',
    fact: 'The famous "Chinese money plant" (Pilea peperomioides) has circular, coin-like leaves',
    unique: 'Many species have leaves that "dance" or move slightly throughout the day, responding to light changes with subtle movements'
  },
  
  // Aquatics
  'hygrophila': {
    style: 'adds lush underwater forests with its fast-growing, feathery foliage',
    fact: 'Known for rapid growth and ability to thrive both submerged and emersed',
    unique: 'The emersed form produces flowers and has different leaf shapes than the submerged form - a dramatic transformation'
  },
  'ludwigia': {
    style: 'adds vibrant red-orange accents to aquatic setups',
    fact: 'Leaves develop intense red coloration under high light conditions',
    unique: 'Stems can grow horizontally across substrate, creating dense carpets, or vertically as background plants, offering versatile aquascaping options'
  },
  'cryptocoryne': {
    style: 'adds natural, wild appearance with its variable leaf shapes and colors',
    fact: 'Known for "crypt melt" - a natural process where leaves die back when conditions change, then regrow',
    unique: 'Extremely variable species - the same plant can produce vastly different leaf shapes and colors depending on growing conditions'
  },
  
  // Orchids
  'jewel orchid': {
    style: 'adds exotic elegance with its stunning veined foliage and unique growth habit',
    fact: 'Prized more for their beautiful leaves than flowers, unlike most orchids',
    unique: 'The intricate vein patterns on leaves resemble precious metalwork, with some species having iridescent or metallic-looking patterns'
  },
  'masdevallia': {
    style: 'adds unique floral displays with its bizarre, often fuzzy flowers',
    fact: 'Flowers have distinctive triangular shapes with elongated tails or "ears"',
    unique: 'Many species produce flowers in unusual colors (orange, red, yellow) and have fuzzy or hairy textures that make them look otherworldly'
  },
  
  // Succulents
  'echeveria': {
    style: 'adds rosette perfection with its symmetrical, geometric forms',
    fact: 'Forms perfect rosettes that can change color based on light and temperature',
    unique: 'Many species produce "farina" - a powdery, waxy coating that gives leaves a soft, pastel appearance and protects from sun'
  },
  'haworthia': {
    style: 'adds unique texture with its windowed leaves and striped patterns',
    fact: 'Many species have translucent "windows" at leaf tips that allow light to penetrate into the plant',
    unique: 'The windowed leaves are an adaptation to growing partially buried in soil - light enters through the windows to reach inner photosynthetic tissue'
  }
};

function cleanDescription(description) {
  if (!description) return '';
  
  let cleaned = String(description);
  
  // Remove citation marks [1], [2], [3], etc. and content in brackets like [5°C], [10.2 cm]
  cleaned = cleaned.replace(/\[\d+\]/g, ''); // [1], [2], etc.
  cleaned = cleaned.replace(/\[[^\]]*\d+[^\]]*\]/g, ''); // [5°C], [10.2 cm], etc.
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ''); // Any remaining brackets
  
  // Remove care instructions that shouldn't be in description
  const carePatterns = [
    /should be watered.*?\./gi,
    /watering.*?regularly.*?\./gi,
    /keep.*?moist.*?\./gi,
    /place.*?pot.*?\./gi,
    /mist.*?regularly.*?\./gi,
    /caring for.*?simple.*?\./gi,
    /the plant prefers.*?\./gi,
    /as soon as.*?\./gi,
    /since.*?species.*?\./gi,
    /it should be kept.*?\./gi
  ];
  
  carePatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Fix broken sentences with isolated words (e.g., "native to.  Brazil." becomes "native to Brazil.")
  cleaned = cleaned.replace(/\.\s+([A-Z][a-z]+)\s*\./g, ' $1.');
  cleaned = cleaned.replace(/to\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, p1) => 'to ' + p1.replace(/\s+/g, ' '));
  cleaned = cleaned.replace(/the\.\s+([A-Z][a-z]+)/g, 'the $1');
  cleaned = cleaned.replace(/\s+([A-Z][a-z]+)\s*\.\s*$/g, ' $1.');
  // Fix "Native to. Brazil." or "Native to. El." patterns - need to handle multi-word locations
  cleaned = cleaned.replace(/Native to\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\./g, (match, location) => {
    // If location is just one short word like "El", "South", try to find the rest
    if (location.length < 5 && !cleaned.includes(location + ' ')) {
      return 'Native to ' + location;
    }
    return 'Native to ' + location + '.';
  });
  // Fix "Native to. El. Salvador" becomes "Native to El Salvador"
  cleaned = cleaned.replace(/Native to\.\s+([A-Z][a-z]+)\.\s+([A-Z][a-z]+)/g, 'Native to $1 $2');
  // Fix "Native to. Mexico and. Central" becomes "Native to Mexico and Central"
  cleaned = cleaned.replace(/Native to\.\s+([A-Z][a-z]+)\s+and\.\s+([A-Z][a-z]+)/g, 'Native to $1 and $2');
  // Fix "In its native. Borneo" becomes "In its native Borneo"
  cleaned = cleaned.replace(/In its native\.\s+([A-Z][a-z]+)/g, 'In its native $1');
  // Fix "on the." patterns
  cleaned = cleaned.replace(/on the\.\s+([A-Z][a-z]+)/g, 'on the $1');
  // Fix "The name. Philodendron means" pattern
  cleaned = cleaned.replace(/The name\.\s+([A-Z][a-z]+)/g, 'The name $1');
  cleaned = cleaned.replace(/in\.\s+([A-Z][a-z]+)/g, 'in $1');
  // Fix "Many. Microsorum" or "Native to." with nothing after
  cleaned = cleaned.replace(/([a-z])\.\s+([A-Z][a-z]+)/g, '$1. $2');
  // Fix "Native to." with nothing or incomplete after
  cleaned = cleaned.replace(/Native to\.\s*$/g, '');
  
  // Fix truncated sentences ending with "to." or "in." followed by nothing
  if (cleaned.match(/\s(to|in|from|with|for)\.\s*$/)) {
    cleaned = cleaned.replace(/\s(to|in|from|with|for)\.\s*$/, '');
  }
  
  // Remove duplicate sentences
  const sentences = cleaned.split(/\.\s+/).filter(s => s.trim());
  const uniqueSentences = [];
  const seen = new Set();
  for (const sent of sentences) {
    const normalized = sent.toLowerCase().trim();
    if (normalized.length > 10 && !seen.has(normalized)) {
      seen.add(normalized);
      uniqueSentences.push(sent.trim());
    }
  }
  cleaned = uniqueSentences.join('. ');
  if (!cleaned.endsWith('.')) cleaned += '.';
  
  // Fix sentences starting with lowercase
  cleaned = cleaned.replace(/^([a-z])/, (match) => match.toUpperCase());
  
  // Remove multiple spaces and clean up
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\.\s*\./g, '.');
  cleaned = cleaned.replace(/\s+\./g, '.');
  cleaned = cleaned.replace(/\.\s+/g, '. ');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // If description is clearly truncated or very short, mark for full rebuild
  if (cleaned.length < 50 || cleaned.match(/\s(to|in|from|with|for)\.\s*$/) || 
      cleaned.match(/^[a-z]/) || cleaned.endsWith(' to.') || cleaned.endsWith(' in.')) {
    return ''; // Force full rebuild
  }
  
  return cleaned;
}

function enhanceDescription(plant, cleanedDesc) {
  const name = String(plant.name || '').toLowerCase();
  const sciName = String(plant.scientificName || '').toLowerCase();
  const categories = (plant.category || []).map(c => String(c).toLowerCase());
  const family = String((plant.taxonomy || {}).family || '').toLowerCase();
  const genus = String((plant.taxonomy || {}).genus || '').toLowerCase();
  const plantType = String(plant.plantType || '').toLowerCase();
  const growthPattern = String(plant.growthPattern || '').toLowerCase();
  const growthHabit = String(plant.growthHabit || '').toLowerCase();
  const size = String(plant.size || '');
  const native = cleanedDesc.match(/native to ([^\.]+)/i);
  
  let description = cleanedDesc;
  
  // If description is too short (< 50 chars) or truncated, enhance it
  if (description.length < 50 || description.match(/[a-z]\s*$/)) {
    description = '';
  }
  
  // Build enhanced description with framework
  
  // 1. Look and Shape
  let lookShape = '';
  
  // Always generate proper look/shape for consistency
  if (growthPattern.includes('rosette')) {
    lookShape = `This plant forms an attractive rosette shape`;
  } else if (growthPattern.includes('vining')) {
    lookShape = `This vining plant features trailing or climbing growth`;
  } else if (growthPattern.includes('upright') || growthPattern.includes('bushy')) {
    lookShape = `This plant displays an upright, bushy growth habit`;
  } else {
    lookShape = `This plant features distinctive foliage`;
  }
  
  if (categories.includes('fern')) {
    lookShape += ' with elegant fronds';
  } else if (categories.includes('succulent')) {
    lookShape += ' with fleshy, water-storing leaves';
  } else if (family === 'araceae') {
    lookShape += ' with large, dramatic leaves';
  } else if (family === 'orchidaceae') {
    lookShape += ' with beautiful, intricate flowers';
  } else if (genus === 'peperomia') {
    lookShape += ' with thick, often patterned leaves in various shapes';
  } else if (categories.includes('mini')) {
    lookShape += ', perfect for compact spaces';
  }
  lookShape += '.';
  
  // 2. General Information & Nativity Traits
  let generalInfo = '';
  let nativityTrait = '';
  
  // Extract native range information
  let nativeRange = '';
  if (description && description.length > 50) {
    const infoMatch = description.match(/(?:native to|found in|grows in|originating from|from) ([^\.]{10,150})/i);
    if (infoMatch) {
      nativeRange = infoMatch[1].trim();
      generalInfo = `Native to ${nativeRange}.`;
    }
  }
  
  if (!generalInfo) {
    if (native) {
      nativeRange = native[1].trim();
      generalInfo = `Native to ${nativeRange}.`;
    } else if (cleanedDesc.includes('native')) {
      const nativeMatch = cleanedDesc.match(/native to ([^\.]+)/i);
      if (nativeMatch && nativeMatch[1].length > 3) {
        nativeRange = nativeMatch[1].trim();
        generalInfo = `Native to ${nativeRange}.`;
      }
    }
    
    if (!generalInfo) {
      // Generic based on category
      if (categories.includes('tropical')) {
        generalInfo = 'Native to tropical regions.';
        nativeRange = 'tropical regions';
      } else if (categories.includes('aquatic')) {
        generalInfo = 'Native to aquatic environments.';
        nativeRange = 'aquatic environments';
      } else if (genus) {
        generalInfo = `Belongs to the ${genus} genus.`;
      } else {
        generalInfo = '';
      }
    }
  }
  
  // Generate nativity trait based on native range and plant characteristics
  if (nativeRange && nativeRange.length > 3) {
    const nativeLower = nativeRange.toLowerCase();
    
    // Habitat-specific traits
    if (nativeLower.includes('rainforest') || nativeLower.includes('rain forest')) {
      nativityTrait = 'In its native rainforest habitat, this plant grows in the humid understory with filtered light and high humidity.';
    } else if (nativeLower.includes('cloud forest') || nativeLower.includes('montane')) {
      nativityTrait = 'Native to cloud forests or montane regions, this plant is adapted to cool, humid conditions with constant mist and moderate temperatures.';
    } else if (nativeLower.includes('tropical') || nativeLower.includes('southeast asia') || nativeLower.includes('south america')) {
      if (family === 'araceae' || growthHabit === 'epiphytic') {
        nativityTrait = 'In tropical forests, this plant typically grows as an epiphyte on tree trunks, receiving filtered sunlight through the dense canopy.';
      } else if (categories.includes('fern')) {
        nativityTrait = 'Thrives in the humid, shaded understory of tropical forests where it receives consistent moisture and protection from direct sunlight.';
      } else {
        nativityTrait = 'Adapted to tropical climates with high humidity, consistent warmth, and filtered light conditions.';
      }
    } else if (nativeLower.includes('desert') || nativeLower.includes('arid') || nativeLower.includes('semi-arid')) {
      nativityTrait = 'Native to arid environments, this plant has evolved water-conserving adaptations to survive periods of drought.';
    } else if (nativeLower.includes('alpine') || nativeLower.includes('high altitude') || nativeLower.includes('mountain')) {
      nativityTrait = 'Found at high elevations, this plant is adapted to cooler temperatures, intense sunlight, and often dramatic temperature fluctuations.';
    } else if (nativeLower.includes('mediterranean')) {
      nativityTrait = 'Native to Mediterranean climates, this plant experiences hot, dry summers and mild, wet winters, influencing its growth patterns.';
    } else if (nativeLower.includes('aquatic') || nativeLower.includes('marshy') || nativeLower.includes('wetland')) {
      nativityTrait = 'In its native wetland or aquatic habitat, this plant grows fully or partially submerged, adapting to fluctuating water levels.';
    } else if (nativeLower.includes('subtropical') || nativeLower.includes('temperate')) {
      nativityTrait = 'Native to subtropical or temperate regions, this plant experiences seasonal variations that influence its growth and dormancy cycles.';
    } else if (growthHabit === 'epiphytic' || categories.includes('air-plant')) {
      nativityTrait = 'As an epiphyte, this plant grows naturally on trees in humid environments, absorbing moisture and nutrients from the air.';
    } else if (family === 'bromeliaceae') {
      nativityTrait = 'Native to tropical and subtropical Americas, bromeliads often grow epiphytically or in well-draining substrates in humid forests.';
    } else if (family === 'orchidaceae') {
      nativityTrait = 'Orchids in the wild grow primarily as epiphytes in humid forests, with some terrestrial species adapted to specific soil conditions.';
    } else if (categories.includes('carnivorous')) {
      nativityTrait = 'Native to nutrient-poor habitats such as bogs, swamps, or sandy soils, where carnivory supplements the limited available nutrients.';
    } else if (nativeLower.includes('africa')) {
      if (categories.includes('succulent')) {
        nativityTrait = 'Native to arid and semi-arid regions of Africa, this plant has developed specialized water storage and conservation mechanisms.';
      } else {
        nativityTrait = 'Adapted to African climates, which vary from tropical rainforests to arid savannas depending on the region.';
      }
    } else if (nativeLower.includes('asia') || nativeLower.includes('southeast')) {
      nativityTrait = 'Native to Asia\'s diverse ecosystems, this plant is adapted to the region\'s varying climates from tropical lowlands to temperate highlands.';
    } else if (nativeLower.includes('australia') || nativeLower.includes('oceania')) {
      nativityTrait = 'Native to Australia and Oceania, this plant has adapted to unique local conditions including dry seasons, fire cycles, or high humidity.';
    } else if (nativeLower.includes('central america') || nativeLower.includes('mexico')) {
      nativityTrait = 'Found in Central America and Mexico, this plant experiences tropical to subtropical conditions with distinct wet and dry seasons.';
    } else if (nativeLower.includes('south america')) {
      nativityTrait = 'Native to South America\'s diverse ecosystems, from Amazonian rainforests to Andean cloud forests, adapting to varied microclimates.';
    } else if (nativeLower.includes('indian') || nativeLower.includes('subcontinent')) {
      nativityTrait = 'Native to the Indian subcontinent, this plant experiences monsoonal climate patterns with distinct wet and dry seasons.';
    }
    
    // If no specific habitat match, create generic nativity trait
    if (!nativityTrait && nativeRange && nativeRange.length > 5) {
      // Clean native range for use in trait
      const cleanRange = nativeRange.replace(/\./g, '').trim();
      
      if (categories.includes('tropical')) {
        nativityTrait = `In its native ${cleanRange}, this plant thrives in warm, humid conditions typical of tropical environments.`;
      } else if (categories.includes('aquatic') || growthHabit === 'aquatic') {
        nativityTrait = `Native to ${cleanRange}, this aquatic plant has adapted to life in water with specialized structures for nutrient uptake.`;
      } else if (categories.includes('succulent')) {
        nativityTrait = `Native to ${cleanRange}, this succulent has developed adaptations for water storage and survival in challenging environments.`;
      } else if (categories.includes('carnivorous')) {
        nativityTrait = `Native to ${cleanRange}, this carnivorous plant evolved in nutrient-poor habitats where capturing insects provides essential nutrients.`;
      } else {
        nativityTrait = `Native to ${cleanRange}, this plant has adapted to local climate and growing conditions of its original habitat.`;
      }
    }
  }
  
  // 3. Interesting Fact & Unique Traits
  let fact = '';
  let uniqueTrait = '';
  const searchTerms = [name, sciName, genus, family].filter(t => t);
  
  // Try to find matching facts
  for (const term of searchTerms) {
    if (PLANT_FACTS[term]) {
      fact = PLANT_FACTS[term].fact || '';
      uniqueTrait = PLANT_FACTS[term].unique || '';
      break;
    }
  }
  
  // Also check partial matches for genus-specific traits
  if (!fact || !uniqueTrait) {
    for (const term of searchTerms) {
      for (const [key, value] of Object.entries(PLANT_FACTS)) {
        if (term.includes(key) || key.includes(term)) {
          if (!fact && value.fact) fact = value.fact;
          if (!uniqueTrait && value.unique) uniqueTrait = value.unique;
          break;
        }
      }
    }
  }
  
  if (!fact) {
    // Generate generic interesting facts
    if (categories.includes('carnivorous')) {
      fact = 'This carnivorous plant traps and digests insects to supplement nutrients from poor soil.';
    } else if (categories.includes('epiphytic') || plantType.includes('epiphytic') || growthHabit === 'epiphytic') {
      fact = 'This epiphytic species grows naturally on trees, absorbing moisture and nutrients from the air.';
    } else if (categories.includes('aquatic') || growthHabit === 'aquatic') {
      fact = 'This aquatic plant can thrive both fully submerged and partially emersed.';
    } else if (genus === 'peperomia') {
      fact = 'Peperomia leaves are often thick and succulent-like, storing water in their foliage.';
    } else if (categories.includes('mini')) {
      fact = 'Perfect for compact terrariums and small spaces.';
    } else if (family === 'bromeliaceae') {
      fact = 'Many bromeliads form central water-holding rosettes that create mini ecosystems.';
    } else if (family === 'orchidaceae') {
      fact = 'Orchids have highly specialized flowers designed for specific pollinators.';
    }
  }
  
  // Generate unique traits if not found
  if (!uniqueTrait) {
    if (categories.includes('carnivorous')) {
      uniqueTrait = 'The trapping mechanism is highly specialized, with some species able to digest prey in just a few hours.';
    } else if (family === 'araceae' && growthHabit === 'epiphytic') {
      uniqueTrait = 'Produces aerial roots that can absorb moisture from the air and anchor to tree bark.';
    } else if (categories.includes('variegated') || name.toLowerCase().includes('variegat')) {
      uniqueTrait = 'The variegation patterns are caused by genetic mutations that reduce chlorophyll in certain areas, creating unique color variations.';
    } else if (categories.includes('colorful') && family === 'begoniaceae') {
      uniqueTrait = 'Leaves can display incredible color combinations including red, silver, green, and even iridescent qualities.';
    }
  }
  
  // 4. Style/Aesthetic Value
  let styleValue = '';
  for (const term of searchTerms) {
    if (PLANT_FACTS[term] && PLANT_FACTS[term].style) {
      styleValue = PLANT_FACTS[term].style;
      break;
    }
  }
  
  // Check partial matches for style
  if (!styleValue) {
    for (const term of searchTerms) {
      for (const [key, value] of Object.entries(PLANT_FACTS)) {
        if ((term.includes(key) || key.includes(term)) && value.style) {
          styleValue = value.style;
          break;
        }
      }
    }
  }
  
  if (!styleValue) {
    // Generate based on characteristics
    if (genus === 'peperomia') {
      styleValue = 'adds lush greenery with its diverse leaf patterns and compact growth habit to any environment';
    } else if (genus === 'soleirolia') {
      styleValue = 'creates a lush carpet effect perfect for miniature landscapes';
    } else if (genus === 'rotala') {
      styleValue = 'adds vibrant color and dynamic growth to aquatic setups';
    } else if (categories.includes('colorful')) {
      styleValue = 'adds vibrant colors and visual interest to any environment';
    } else if (categories.includes('mini')) {
      styleValue = 'perfect for small spaces and terrariums';
    } else if (family === 'araceae') {
      styleValue = 'creates a bold, tropical statement to any environment';
    } else if (family === 'orchidaceae') {
      styleValue = 'brings exotic elegance and sophistication to any environment';
    } else if (categories.includes('fern')) {
      styleValue = 'provides lush, feathery texture to any environment';
    } else if (categories.includes('aquatic')) {
      styleValue = 'adds natural beauty and dynamic movement to aquatic environments';
    } else {
      styleValue = 'adds natural beauty and greenery to any environment';
    }
    if (!styleValue.includes(' to ') && !styleValue.includes(' for ')) {
      styleValue += ' to any environment';
    }
  }
  
  // Combine into structured description
  const parts = [];
  
  // Always start fresh with lookShape for consistency, but incorporate good info from existing description
  parts.push(lookShape);
  
  // Extract and add good general info from existing description if it's useful
  if (description && description.length > 30) {
    const nativeMatch = description.match(/native to ([^\.]+)/i);
    if (nativeMatch && nativeMatch[1].length > 3) {
      generalInfo = `Native to ${nativeMatch[1]}.`;
    }
  }
  
  if (generalInfo && !parts.includes(generalInfo)) {
    parts.push(generalInfo);
  }
  
  // Add fact if not already mentioned
  if (fact && !description.toLowerCase().includes(fact.toLowerCase().substring(0, 20))) {
    parts.push(fact);
  }
  
  // Add unique trait if available (makes description richer)
  if (uniqueTrait && !description.toLowerCase().includes(uniqueTrait.toLowerCase().substring(0, 20))) {
    parts.push(uniqueTrait);
  }
  
  // Add nativity trait (explains how native habitat influences characteristics)
  if (nativityTrait && !description.toLowerCase().includes(nativityTrait.toLowerCase().substring(0, 25))) {
    parts.push(nativityTrait);
  }
  
  // Add style value
  if (styleValue && !description.toLowerCase().includes('style') && !description.toLowerCase().includes('aesthetic') && !description.toLowerCase().includes('terrariums or indoor settings')) {
    parts.push(`In terrariums or indoor settings, this plant ${styleValue}.`);
  }
  
  let finalDesc = parts.join(' ').trim();
  
  // Clean up any remaining issues
  finalDesc = finalDesc.replace(/\s+/g, ' ');
  finalDesc = finalDesc.replace(/\.\s*\./g, '.');
  finalDesc = finalDesc.replace(/\s+\./g, '.');
  // Fix missing periods between sentences (lowercase followed by uppercase)
  finalDesc = finalDesc.replace(/([a-z])\s+([A-Z])/g, '$1. $2');
  // Fix sentences ending without period before next sentence
  finalDesc = finalDesc.replace(/([a-z])\s+([A-Z][a-z]+ [a-z]+)/g, '$1. $2');
  
  // Target length: 250-450 characters for richer descriptions with nativity traits
  if (finalDesc.length < 200) {
    // Too short - add more info
    if (size && !finalDesc.includes(size) && size.length < 30 && size !== 'Varies') {
      finalDesc += ` Matures to ${size}.`;
    }
    // Ensure nativity trait is included if missing
    if (!nativityTrait && nativeRange && nativeRange.length > 5) {
      const cleanRange = nativeRange.replace(/\./g, '').trim();
      if (categories.includes('tropical')) {
        nativityTrait = `In its native ${cleanRange}, this plant thrives in warm, humid conditions typical of tropical environments.`;
      } else if (categories.includes('aquatic') || growthHabit === 'aquatic') {
        nativityTrait = `Native to ${cleanRange}, this aquatic plant has adapted to life in water with specialized structures for nutrient uptake.`;
      } else {
        nativityTrait = `Native to ${cleanRange}, this plant has adapted to local climate and growing conditions of its original habitat.`;
      }
      if (!finalDesc.toLowerCase().includes(nativityTrait.toLowerCase().substring(0, 30))) {
        // Find insertion point (after generalInfo or after fact)
        const insertAfter = fact && finalDesc.includes(fact.substring(0, 30)) ? fact : (generalInfo || '');
        if (insertAfter) {
          const idx = finalDesc.indexOf(insertAfter) + insertAfter.length;
          finalDesc = finalDesc.slice(0, idx) + ' ' + nativityTrait + finalDesc.slice(idx);
        } else {
          finalDesc = nativityTrait + '. ' + finalDesc;
        }
      }
    }
    // Add additional detail if still short
    if (finalDesc.length < 200) {
      if (family === 'araceae' && !finalDesc.toLowerCase().includes('aroid') && !finalDesc.toLowerCase().includes('epiphyte')) {
        finalDesc += ' Belongs to the aroid family, known for their showy inflorescences.';
      } else if (categories.includes('fern') && !finalDesc.toLowerCase().includes('spores') && !finalDesc.toLowerCase().includes('epiphyte')) {
        finalDesc += ' Reproduces via spores on the undersides of fronds.';
      } else if (categories.includes('orchid') && !finalDesc.toLowerCase().includes('epiphytic')) {
        finalDesc += ' Most orchids are epiphytic, growing naturally on trees rather than in soil.';
      }
    }
  } else if (finalDesc.length > 500) {
    // Too long - trim but keep important parts
    const sentences = finalDesc.match(/[^\.]+\./g);
    if (sentences && sentences.length > 4) {
      // Keep first (look), native info if present, fact, and style
      const keep = [];
      keep.push(sentences[0]); // look/shape
      if (sentences.find(s => s.toLowerCase().includes('native'))) {
        keep.push(sentences.find(s => s.toLowerCase().includes('native')));
      }
      if (fact && sentences.find(s => s.toLowerCase().includes(fact.toLowerCase().substring(0, 15)))) {
        keep.push(sentences.find(s => s.toLowerCase().includes(fact.toLowerCase().substring(0, 15))));
      }
      if (styleValue) {
        const styleSent = sentences.find(s => s.toLowerCase().includes('terrariums') || s.toLowerCase().includes('settings'));
        if (styleSent) keep.push(styleSent);
      }
      finalDesc = keep.join(' ');
    }
  }
  
  return finalDesc.trim();
}

function main() {
  console.log('📝 Cleaning and enhancing plant descriptions...\n');
  
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();
  
  console.log(`Found ${files.length} plant files to process\n`);
  
  let processed = 0;
  let updated = 0;
  
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const originalDesc = plantData.description || '';
      
      // Clean the description
      const cleanedDesc = cleanDescription(originalDesc);
      
      // Enhance the description
      const enhancedDesc = enhanceDescription(plantData, cleanedDesc);
      
      if (enhancedDesc && enhancedDesc !== originalDesc) {
        plantData.description = enhancedDesc;
        
        fs.writeFileSync(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf8');
        updated++;
        console.log(`✅ Updated: ${plantData.name || file}`);
      }
      
      processed++;
      
    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
      processed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`\n✨ Description enhancement complete!`);
}

if (require.main === module) {
  main();
}

