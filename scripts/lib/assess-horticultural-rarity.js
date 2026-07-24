/**
 * Horticultural / trade rarity for vivarium & houseplant retail.
 * Canonical: common | uncommon | rare | very-rare
 *
 * Scoring reflects how easy the plant is to source in specialty trade
 * (not wild IUCN status). Tissue-culture availability is considered.
 */
const { normalizeRarity } = require('./normalize-rarity.js');

const RANK = { common: 1, uncommon: 2, rare: 3, 'very-rare': 4 };

/** Genus → default trade rarity when no species override matches. */
const GENUS_BASELINE = {
  // Mass-market / easy specialty
  callisia: 'common',
  chlorophytum: 'common',
  epipremnum: 'common',
  fittonia: 'common',
  hypoestes: 'common',
  lemna: 'common',
  maranta: 'common',
  pistia: 'common',
  plectranthus: 'common',
  salvinia: 'common',
  saxifraga: 'common',
  scindapsus: 'common',
  selaginella: 'common',
  soleirolia: 'common',
  tradescantia: 'common',
  taxiphyllum: 'common',
  vesicularia: 'common',
  hypnum: 'common',
  leucobryum: 'common',
  dicranum: 'common',
  sphagnum: 'common',
  azolla: 'common',
  ceratophyllum: 'common',
  elodea: 'common',
  chaetomorpha: 'common',
  riccia: 'common',
  riccardia: 'common',
  aloe: 'common',
  echeveria: 'common',
  sempervivum: 'common',
  opuntia: 'common',
  crassula: 'common',
  sedum: 'common',
  haworthia: 'common',
  haworthiopsis: 'common',
  asplenium: 'common',
  nephrolepis: 'common',
  pteris: 'common',
  dryopteris: 'common',
  hedera: 'common',
  ficus: 'common',
  peperomia: 'common',
  pilea: 'common',
  anubias: 'common',
  syngonium: 'common',
  aglaonema: 'common',
  dracaena: 'common',
  chamedorea: 'common',
  chamaedorea: 'common',
  asparagus: 'common',
  ananas: 'common',
  aechmea: 'common',
  saintpaulia: 'common',
  streptocarpus: 'common',
  phalaenopsis: 'common',

  // Specialty but regularly stocked
  adiantum: 'uncommon',
  davallia: 'uncommon',
  humata: 'uncommon',
  microsorum: 'uncommon',
  leptochilus: 'uncommon',
  platycerium: 'uncommon',
  phlebodium: 'uncommon',
  bolbitis: 'uncommon',
  cryptanthus: 'uncommon',
  cryptocoryne: 'uncommon',
  dischidia: 'uncommon',
  cissus: 'uncommon',
  columnea: 'uncommon',
  aeschynanthus: 'uncommon',
  episcia: 'uncommon',
  goeppertia: 'uncommon',
  calathea: 'uncommon',
  oxalis: 'uncommon',
  ceropegia: 'uncommon',
  rhipsalis: 'uncommon',
  hoya: 'uncommon',
  tillandsia: 'uncommon',
  neoregelia: 'uncommon',
  vriesea: 'uncommon',
  wallisia: 'uncommon',
  marcgravia: 'uncommon',
  rhaphidophora: 'uncommon',
  monstera: 'uncommon',
  philodendron: 'uncommon',
  alocasia: 'uncommon',
  anthurium: 'uncommon',
  begonia: 'uncommon',
  dionaea: 'uncommon',
  drosera: 'uncommon',
  sarracenia: 'uncommon',
  pinguicula: 'uncommon',
  nepenthes: 'uncommon',
  ludisia: 'uncommon',
  macodes: 'rare',
  goodyera: 'rare',
  agave: 'uncommon',
  adenium: 'uncommon',
  euphorbia: 'uncommon',
  mammillaria: 'uncommon',
  aeonium: 'uncommon',
  albuca: 'uncommon',
  biophytum: 'uncommon',
  ardisia: 'uncommon',
  labisia: 'uncommon',
  mentha: 'uncommon',
  bacopa: 'uncommon',
  hygrophila: 'uncommon',
  rotala: 'uncommon',
  ludwigia: 'uncommon',
  sagittaria: 'uncommon',
  echinodorus: 'uncommon',
  aquarius: 'uncommon',
  ceratopteris: 'uncommon',
  eleocharis: 'uncommon',
  limnobium: 'uncommon',
  hydrocharis: 'uncommon',
  phyllanthus: 'uncommon',
  aegagropila: 'uncommon',
  monosolenium: 'uncommon',
  fissidens: 'uncommon',
  plagiomnium: 'uncommon',
  thuidium: 'uncommon',
  syntrichia: 'uncommon',
  cladonia: 'uncommon',
  dichondra: 'uncommon',
  pellaea: 'uncommon',
  hemionitis: 'uncommon',
  doryopteris: 'uncommon',
  acrostichum: 'uncommon',
  blechnum: 'uncommon',
  neoblechnum: 'uncommon',
  dicksonia: 'uncommon',
  cyathea: 'uncommon',
  sphaeropteris: 'uncommon',
  drynaria: 'uncommon',
  aglaomorpha: 'uncommon',
  elaphoglossum: 'rare',
  actiniopteris: 'uncommon',
  acanthostachys: 'uncommon',
  catopsis: 'uncommon',
  racinaea: 'rare',
  achimenes: 'uncommon',
  aristolochia: 'uncommon',
  asarum: 'uncommon',
  arisaema: 'rare',
  medinilla: 'uncommon',
  myrmecodia: 'rare',
  dioscorea: 'uncommon',
  kleinia: 'uncommon',
  senecio: 'uncommon',
  kroenleinia: 'uncommon',
  alluaudia: 'rare',
  adromischus: 'uncommon',
  epiphyllum: 'uncommon',
  procris: 'uncommon',
  pellionia: 'uncommon',
  astilboides: 'uncommon',
  gracilaria: 'uncommon',
  halymenia: 'uncommon',

  // Collector / specialty orchids & rarities
  anoectochilus: 'rare',
  dossinia: 'very-rare',
  lepanthes: 'very-rare',
  masdevallia: 'rare',
  bulbophyllum: 'rare',
  restrepia: 'rare',
  pleurothallis: 'rare',
  platystele: 'very-rare',
  specklinia: 'rare',
  anathallis: 'rare',
  acianthera: 'rare',
  aspidogyne: 'rare',
  dendrochilum: 'rare',
  coelogyne: 'uncommon',
  adenia: 'rare',
  argostemma: 'very-rare',
  macrocentrum: 'rare',
  lecanopteris: 'rare',
  cephalotus: 'rare',
  darlingtonia: 'rare',
  heliamphora: 'rare',
  byblis: 'rare',
  genlisea: 'rare',
  drosophyllum: 'rare',
  roridula: 'very-rare',
  aldrovanda: 'rare',
  utricularia: 'uncommon',
  mycena: 'rare',
  panellus: 'uncommon'
};

/**
 * Exact scientificName (without cultivar quotes preferred) → rarity.
 * Keys normalized: lowercase, × → x, collapse spaces.
 */
const SPECIES_OVERRIDE = {
  // —— Clearly common houseplants / aquatics ——
  'acalypha hispida': 'common',
  'aechmea fasciata': 'common',
  'aloe vera': 'common',
  'ananas comosus': 'common',
  'anthurium andraeanum': 'common',
  'anthurium scherzerianum': 'common',
  'anubias barteri': 'common',
  'asplenium nidus': 'common',
  'asplenium bulbiferum': 'common',
  'asplenium scolopendrium': 'common',
  'callisia repens': 'common',
  'ceratophyllum demersum': 'common',
  'chamaedorea elegans': 'common',
  'chlorophytum comosum': 'common',
  'crassula ovata': 'common',
  'cryptocoryne wendtii': 'common',
  'dionaea muscipula': 'common',
  'dischidia nummularia': 'common',
  'dracaena sanderiana': 'common',
  'dracaena trifasciata': 'common',
  'dracaena fragrans': 'common',
  'drosera capensis': 'common',
  'echeveria elegans': 'common',
  'elodea densa': 'common',
  'epipremnum aureum': 'common',
  'ficus pumila': 'common',
  'ficus microcarpa': 'common',
  'fittonia albivenis': 'common',
  'haworthia attenuata': 'common',
  'hedera helix': 'common',
  'hoya carnosa': 'common',
  'hypoestes phyllostachya': 'common',
  'lemna minor': 'common',
  'maranta leuconeura': 'common',
  'monstera deliciosa': 'common',
  'monstera adansonii': 'common',
  'nephrolepis exaltata': 'common',
  'nephrolepis cordifolia': 'common',
  'opuntia microdasys': 'common',
  'oxalis triangularis': 'common',
  'peperomia argyreia': 'common',
  'peperomia caperata': 'common',
  'peperomia obtusifolia': 'common',
  'phalaenopsis amabilis': 'common',
  'philodendron hederaceum': 'common',
  'philodendron bipinnatifidum': 'common',
  'pilea peperomioides': 'common',
  'pilea cadierei': 'common',
  'pilea depressa': 'common',
  'pilea glauca': 'common',
  'pilea involucrata': 'common',
  'pilea microphylla': 'common',
  'pistia stratiotes': 'common',
  'plectranthus verticillatus': 'common',
  'pteris cretica': 'common',
  'saintpaulia ionantha': 'common',
  'salvinia minima': 'common',
  'saxifraga stolonifera': 'common',
  'scindapsus pictus': 'common',
  'sedum morganianum': 'common',
  'selaginella kraussiana': 'common',
  'senecio rowleyanus': 'common',
  'soleirolia soleirolii': 'common',
  'syngonium podophyllum': 'common',
  'taxiphyllum barbieri': 'common',
  'tillandsia usneoides': 'common',
  'tillandsia ionantha': 'common',
  'tradescantia zebrina': 'common',
  'ceropegia woodii': 'common',
  'aglaonema commutatum': 'common',
  'goeppertia makoyana': 'common',
  'asparagus setaceus': 'common',
  'alocasia macrorrhizos': 'common',
  'alocasia cucullata': 'common',
  'begonia maculata': 'common',
  'begonia rex': 'common',
  'begonia bowerae': 'uncommon',
  'aeschynanthus radicans': 'common',
  'cryptanthus bivittatus': 'common',
  'davallia fejeensis': 'common',
  'humata tyermanii': 'common',
  'microsorum pteropus': 'common',
  'platycerium bifurcatum': 'common',
  'ardisia japonica': 'common',
  'azolla filiculoides': 'common',
  'columnea gloriosa': 'uncommon',
  'vesicularia montagnei': 'common',
  'adiantum raddianum': 'common',
  'adiantum hispidulum': 'common',

  // —— Uncommon (specialty but regularly available) ——
  'alocasia reginula': 'uncommon',
  'alocasia micholitziana': 'uncommon',
  'alocasia cuprea': 'uncommon',
  'alocasia sanderiana': 'uncommon',
  'alocasia zebrina': 'uncommon',
  'alocasia baginda': 'uncommon',
  'alocasia longiloba': 'uncommon',
  'alocasia lauterbachiana': 'uncommon',
  'anthurium clarinervium': 'uncommon',
  'anthurium crystallinum': 'uncommon',
  'anthurium magnificum': 'uncommon',
  'anthurium veitchii': 'uncommon',
  'anthurium vittariifolium': 'uncommon',
  'anthurium scandens': 'uncommon',
  'anthurium gracile': 'uncommon',
  'anthurium bakeri': 'uncommon',
  'anthurium hookeri': 'uncommon',
  'anthurium pedatoradiatum': 'uncommon',
  'anthurium wendlingeri': 'rare',
  'anthurium warocqueanum': 'rare',
  'anthurium regale': 'rare',
  'anthurium papillilaminum': 'rare',
  'anthurium pallidiflorum': 'rare',
  'philodendron gloriosum': 'uncommon',
  'philodendron brandtianum': 'uncommon',
  'philodendron erubescens': 'common',
  'philodendron hastatum': 'uncommon',
  'philodendron billietiae': 'uncommon',
  'philodendron squamiferum': 'uncommon',
  'philodendron sodiroi': 'rare',
  'philodendron pastazanum': 'rare',
  'philodendron mamei': 'rare',
  'monstera dubia': 'uncommon',
  'monstera siltepecana': 'uncommon',
  'monstera standleyana': 'uncommon',
  'monstera obliqua': 'rare',
  'hoya australis': 'common',
  'hoya bella': 'uncommon',
  'hoya linearis': 'uncommon',
  'hoya callistophylla': 'uncommon',
  'ludisia discolor': 'uncommon',
  'macodes petola': 'rare',
  'anoectochilus formosanus': 'rare',
  'anoectochilus roxburghii': 'rare',
  'pinguicula moranensis': 'uncommon',
  'pinguicula primuliflora': 'uncommon',
  'nepenthes ventricosa': 'uncommon',
  'sarracenia flava': 'uncommon',
  'cephalotus follicularis': 'rare',
  'adenium arabicum': 'uncommon',
  'agave victoriae-reginae': 'uncommon',
  'begonia luxurians': 'uncommon',
  'begonia amphioxus': 'rare',
  'begonia ferox': 'rare',
  'peperomia prostrata': 'uncommon',
  'peperomia albovittata': 'uncommon',
  'rhaphidophora hayi': 'uncommon',
  'cissus discolor': 'uncommon',
  'dracaena masoniana': 'uncommon',
  'dracaena angolensis': 'uncommon',
  'aeschynanthus speciosus': 'uncommon',
  'episcia cupreata': 'uncommon',
  'goeppertia lietzei': 'uncommon',
  'hygrophila difformis': 'common',
  'cryptocoryne parva': 'uncommon',
  'bolbitis heteroclita': 'uncommon',
  'dischidia oiantha': 'uncommon',
  'aglaonema pictum': 'rare',
  'aglaonema rotundum': 'rare',
  'aglaonema pumilum': 'rare',
  'syngonium erythrophyllum': 'rare',
  'syngonium rayi': 'uncommon',
  'syngonium steyermarkii': 'rare',
  'tillandsia xerographica': 'uncommon',
  'tillandsia caput-medusae': 'uncommon',
  'tillandsia bulbosa': 'uncommon',
  'tillandsia streptophylla': 'uncommon',
  'microsorum thailandicum': 'rare',
  'microsorum musifolium': 'uncommon',
  'elaphoglossum metallicum': 'rare',
  'elaphoglossum crinitum': 'uncommon',
  'marcgravia evenia': 'rare',
  'marcgravia umbellata': 'uncommon',
  'acanthostachys strobilacea': 'uncommon',
  'acanthostachys pitcairnioides': 'rare',
  'achimenes erecta': 'uncommon',
  'adiantum pedatum': 'uncommon',
  'adiantum reniforme': 'uncommon',
  'actiniopteris radiata': 'uncommon',
  'actiniopteris australis': 'uncommon',
  'vesicularia ferriei': 'uncommon',
  'pinguicula alpina': 'uncommon',
  'haworthia cooperi': 'uncommon',
  'albuca spiralis': 'uncommon',
  'medinilla magnifica': 'uncommon',
  'neoregelia carolinae': 'uncommon',
  'wallisia cyanea': 'uncommon',
  'phlebodium aureum': 'common',
  'asplenium antiquum': 'uncommon',
  'dicksonia antarctica': 'uncommon',
  'darlingtonia californica': 'rare',
  'heliamphora nutans': 'rare',
  'byblis liniflora': 'rare',
  'aldrovanda vesiculosa': 'rare',
  'utricularia gibba': 'uncommon',
  'labisia pumila': 'uncommon',
  'mentha requienii': 'uncommon',
  'procris repens': 'uncommon',
  'aristolochia fimbriata': 'uncommon',
  'aristolochia littoralis': 'uncommon',
  'biophytum sensitivum': 'uncommon',
  'ananas comosus var. microstachys': 'uncommon',

  // —— Rare / very-rare specialty ——
  'adenia lanceolata': 'very-rare',
  'adenia lindiensis': 'very-rare',
  'adenia viridiflora': 'very-rare',
  'adenia spinosa': 'rare',
  'alocasia azlanii': 'rare',
  'alocasia chaii': 'very-rare',
  'alocasia infernalis': 'rare',
  'alocasia melo': 'rare',
  'alocasia scalprum': 'rare',
  'alocasia sinuata': 'rare',
  'alocasia boyceana': 'rare',
  'alocasia brancifolia': 'uncommon',
  'alocasia gageana': 'rare',
  'alocasia heterophylla': 'rare',
  'alocasia princeps': 'rare',
  'anthurium besseae': 'rare',
  'anthurium amnicola': 'rare',
  'anthurium fornicifolium': 'rare',
  'anthurium kunayalense': 'very-rare',
  'anthurium vanderknaapii': 'very-rare',
  'anthurium lineolatum': 'rare',
  'anthurium minarum': 'rare',
  'anthurium plowmanii': 'rare',
  'anthurium ranchoanum': 'rare',
  'anthurium variegatum': 'rare',
  'anthurium pentaphyllum': 'rare',
  'anthurium balaoanum': 'rare',
  'anthurium arisaemoides': 'rare',
  'anthurium truncicola': 'rare',
  'anthurium clidemioides': 'rare',
  'anthurium friedrichsthalii': 'uncommon',
  'anthurium radicans': 'uncommon',
  'anthurium polyschistum': 'rare',
  'anthurium obtusum': 'uncommon',
  'anthurium acaule': 'uncommon',
  'begonia melanobullata': 'very-rare',
  'begonia kingiana': 'rare',
  'begonia burkillii': 'rare',
  'begonia chingipengii': 'very-rare',
  'begonia subnummularifolia': 'rare',
  'begonia thelmae': 'rare',
  'begonia turrialbae': 'rare',
  'begonia mazae': 'rare',
  'begonia elaeagnifolia': 'rare',
  'begonia bipinnatifida': 'rare',
  'begonia albopicta': 'rare',
  'begonia convolvulacea': 'rare',
  'begonia hatacoa': 'uncommon',
  'begonia hemsleyana': 'uncommon',
  'begonia conchifolia': 'uncommon',
  'begonia dregei': 'uncommon',
  'begonia foliosa': 'uncommon',
  'begonia dietrichiana': 'uncommon',
  'begonia schmidtiana': 'uncommon',
  'anoectochilus albolineatus': 'rare',
  'anoectochilus burmanicus': 'very-rare',
  'anoectochilus reinwardtii': 'rare',
  'dossinia marmorata': 'very-rare',
  'lepanthes calodictyon': 'very-rare',
  'lepanthes pelvis': 'very-rare',
  'lepanthes regularis': 'very-rare',
  'lepanthes tentacula': 'very-rare',
  'lepanthes uxoria': 'very-rare',
  'masdevallia garciae': 'rare',
  'masdevallia guttulata': 'rare',
  'masdevallia oreas': 'rare',
  'masdevallia minuta': 'rare',
  'masdevallia nidifica': 'rare',
  'masdevallia veitchiana': 'uncommon',
  'goodyera daibuzanensis': 'rare',
  'goodyera hispida': 'rare',
  'goodyera schlechtendaliana': 'uncommon',
  'hoya archboldiana': 'rare',
  'hoya blashernaezii': 'rare',
  'hoya brevialata': 'uncommon',
  'hoya burtoniae': 'uncommon',
  'hoya calycina': 'rare',
  'hoya waymaniae': 'rare',
  'hoya albiflora': 'rare',
  'argostemma bicolor': 'very-rare',
  'arisaema filiforme': 'rare',
  'roridula gorgonias': 'very-rare',
  'drosera fimbriata': 'very-rare',
  'pinguicula ehlersiae': 'rare',
  'pinguicula laueana': 'rare',
  'pinguicula moctezumae': 'rare',
  'pinguicula esseriana': 'uncommon',
  'pinguicula jaumavensis': 'rare',
  'pinguicula gypsicola x moctezumae': 'rare',
  'pinguicula leptoceras': 'uncommon',
  'drynaria brooksii': 'rare',
  'lecanopteris sinuosa': 'rare',
  'racinaea dyeriana': 'rare',
  'restrepia tsubatae': 'rare',
  'pleurothallis rubella': 'rare',
  'anathallis minutalis': 'rare',
  'acianthera recurva': 'rare',
  'bulbophyllum depressum': 'rare',
  'dendrochilum tenellum': 'rare',
  'asplenium parvisorum': 'rare',
  'aeschynanthus humilis': 'rare',
  'tillandsia abdita': 'rare',
  'tillandsia andreana': 'rare',
  'monstera aureopinnata': 'rare',
  'monstera acacoyaguensis': 'rare',
  'monstera egregia': 'rare',
  'monstera dissecta': 'rare',
  'monstera lechleriana': 'uncommon',
  'monstera subpinnata': 'rare',
  'philodendron grandipes': 'rare',
  'philodendron holtonianum': 'uncommon',
  'philodendron microstictum': 'rare',
  'philodendron polypodioides': 'uncommon',
  'macrocentrum droseroides': 'rare',
  'mycena chlorophos': 'rare'
};

/** Cultivar epithet (inside quotes, lowercased) → rarity bump or set. */
const CULTIVAR_OVERRIDE = {
  'red ruby': 'uncommon',
  'lady valentine': 'uncommon',
  'tom pride': 'uncommon',
  'red tiger': 'rare',
  'white wonder': 'uncommon',
  'tricolor': 'uncommon',
  'pepperspot': 'uncommon',
  'piccolo banda': 'uncommon',
  'variegata': 'uncommon',
  'quercifolia': 'uncommon',
  'compacta': 'common',
  'ripple red': 'uncommon',
  'pixie': 'common',
  'difformis': 'uncommon'
};

function normSci(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[×x]/g, 'x')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCultivar(sci) {
  return normSci(sci).replace(/\s+'[^']+'\s*$/, '').trim();
}

function extractCultivar(sci) {
  const m = String(sci || '').match(/'([^']+)'/);
  return m ? m[1].toLowerCase().trim() : null;
}

function extractGenus(plant) {
  const fromTax = plant.taxonomy && plant.taxonomy.genus;
  if (fromTax) return String(fromTax).toLowerCase().trim();
  const sci = stripCultivar(plant.scientificName || '');
  return (sci.split(/\s+/)[0] || '').toLowerCase();
}

function clampRarity(r) {
  return normalizeRarity(r) || 'uncommon';
}

function bump(rarity, delta) {
  const n = RANK[clampRarity(rarity)] + delta;
  const keys = Object.keys(RANK);
  const clamped = Math.max(1, Math.min(4, n));
  return keys.find((k) => RANK[k] === clamped) || 'uncommon';
}

/**
 * Assess horticultural rarity for one plant.
 * @returns {{ rarity: string, reason: string }}
 */
function assessHorticulturalRarity(plant) {
  const sci = normSci(plant.scientificName || plant.name || '');
  const baseSci = stripCultivar(plant.scientificName || plant.name || '');
  const cultivar = extractCultivar(plant.scientificName);
  const genus = extractGenus(plant);

  // 1) Exact species / variety override
  if (SPECIES_OVERRIDE[sci]) {
    let r = SPECIES_OVERRIDE[sci];
    if (cultivar && CULTIVAR_OVERRIDE[cultivar]) {
      // Cultivar override wins if rarer or explicitly set for popular forms
      r = CULTIVAR_OVERRIDE[cultivar];
    }
    return { rarity: clampRarity(r), reason: 'species-override' };
  }
  if (SPECIES_OVERRIDE[baseSci]) {
    let r = SPECIES_OVERRIDE[baseSci];
    if (cultivar && CULTIVAR_OVERRIDE[cultivar]) {
      r = CULTIVAR_OVERRIDE[cultivar];
    } else if (cultivar) {
      // Named cultivar of a known species: usually one step from parent
      // Common parent → uncommon cultivar; already uncommon+ stays
      if (r === 'common') r = 'uncommon';
    }
    return { rarity: clampRarity(r), reason: 'species-override+cultivar' };
  }

  // 2) Cultivar-only known epithet
  if (cultivar && CULTIVAR_OVERRIDE[cultivar] && GENUS_BASELINE[genus]) {
    return { rarity: clampRarity(CULTIVAR_OVERRIDE[cultivar]), reason: 'cultivar-override' };
  }

  // 3) Genus baseline + light heuristics
  let r = GENUS_BASELINE[genus] || null;
  let reason = r ? 'genus-baseline' : 'default';

  if (!r) {
    // Unknown genus: use category / type hints
    const cats = (Array.isArray(plant.category) ? plant.category : []).map((c) => String(c).toLowerCase());
    if (cats.includes('moss') || cats.includes('aquatic')) r = 'common';
    else if (plant.carnivorous) r = 'uncommon';
    else if (cats.includes('orchid')) r = 'rare';
    else r = 'uncommon';
    reason = 'heuristic-default';
  }

  // Jewel-orchid style / micro-orchid bump if description suggests
  const blob = [
    plant.description,
    plant.name,
    ...(plant.commonNames || [])
  ].join(' ').toLowerCase();

  if (/\bjewel orchid\b/.test(blob) && RANK[r] < RANK.rare) {
    r = 'rare';
    reason += '+jewel-orchid';
  }
  if (/\b(critically endangered|extremely rare|near endemic)\b/.test(blob)) {
    r = bump(r, 1);
    reason += '+text-very-scarce';
  }

  // Hybrids of common genera stay at genus baseline (already set)
  return { rarity: clampRarity(r), reason };
}

module.exports = {
  assessHorticulturalRarity,
  GENUS_BASELINE,
  SPECIES_OVERRIDE,
  RANK
};
