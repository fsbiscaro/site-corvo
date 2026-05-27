import { BASIC_LANDS_PT, PT_CARD_ALIASES } from "../deck-analyzer/card-aliases.js";
import { normalizeLookupKey } from "./normalize-card-name.js";

const EXTRA_ALIASES = {
  "pântano": "Swamp",
  "pantano": "Swamp",
  "montanha": "Mountain",
  "planície": "Plains",
  "planicie": "Plains",
  "ilha": "Island",
  "floresta": "Forest",
  "anel solar": "Sol Ring",
  "cidadela de nicol bolas": "Bolas's Citadel",
  "alimentar o enxame": "Feed the Swarm",
  "asmodeus, o arquidemonio": "Asmodeus the Archfiend",
  "asmodeus, o arquidemônio": "Asmodeus the Archfiend",
  "malignidade imortal": "Undying Malice",
  "armadura de sombras": "Armor of Shadows",
  "maquinacoes de gonti": "Gonti's Machinations",
  "maquinações de gonti": "Gonti's Machinations",
  "rito de razaketh": "Razaketh's Rite",
  "macular": "Defile",
  "presenca medonha": "Dread Presence",
  "presença medonha": "Dread Presence",
  "necrofago falcao da noite": "Nighthawk Scavenger",
  "necrófago falcão da noite": "Nighthawk Scavenger",
  "sorte inesperada": "Unexpected Windfall",
  "corrupcao consumidora": "Consuming Corruption",
  "corrupção consumidora": "Consuming Corruption",
  "saqueador amaldicoado": "Accursed Marauder",
  "saqueador amaldiçoado": "Accursed Marauder",
  "respire pela ultima vez": "Breathe Your Last",
  "respire pela última vez": "Breathe Your Last",
  "afinal nem morreu": "Not Dead After All",
  "onda desmanteladora": "Dismantling Wave",
  "redemoinho de pensamentos": "Whirlwind of Thought",
  "mangara, o diplomata": "Mangara, the Diplomat",
  "epifania sublime": "Sublime Epiphany",
  "comando de prismari": "Prismari Command",
  "arquimago emerito": "Archmage Emeritus",
  "arquimago emérito": "Archmage Emeritus",
  "artista da fornalha tempestuosa": "Storm-Kiln Artist",
  "velomaco sapioforte": "Velomachus Lorehold",
  "magma opus": "Magma Opus",
  "iteracao expressiva": "Expressive Iteration",
  "iteração expressiva": "Expressive Iteration",
  "veyran, voz da dualidade": "Veyran, Voice of Duality",
  "considerar": "Consider",
  "lier, discipulo dos afogados": "Lier, Disciple of the Drowned",
  "lier, discípulo dos afogados": "Lier, Disciple of the Drowned",
  "dragao averneo manaforme": "Manaform Hellkite",
  "dragão averneo manaforme": "Manaform Hellkite",
  "sorte grande": "Big Score",
  "genio arrogante": "Haughty Djinn",
  "gênio arrogante": "Haughty Djinn",
  "iconoclasta da terceira via": "Third Path Iconoclast",
  "baral e kari zev": "Baral and Kari Zev",
  "paisagem perigosa": "Perilous Landscape",
  "dragao decadente": "Decadent Dragon",
  "dragão decadente": "Decadent Dragon",
  "gosto refinado": "Expensive Taste"
};

export const LOCAL_CARD_ALIASES = buildAliasMap();

export function resolveLocalAlias(name) {
  return LOCAL_CARD_ALIASES.get(normalizeLookupKey(name)) || null;
}

export function addLocalAlias(target, source, canonicalName) {
  const key = normalizeLookupKey(source);
  if (key && canonicalName) target.set(key, canonicalName);
}

function buildAliasMap() {
  const map = new Map();
  for (const [name, canonical] of BASIC_LANDS_PT) addLocalAlias(map, name, canonical);
  for (const [name, canonical] of PT_CARD_ALIASES) addLocalAlias(map, name, canonical);
  for (const [name, canonical] of Object.entries(EXTRA_ALIASES)) addLocalAlias(map, name, canonical);
  return map;
}
