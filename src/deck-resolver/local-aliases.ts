import { normalizeCardName } from "./normalize-card-name.ts";

export const LOCAL_ALIASES: Record<string, string> = {
  "pantano": "Swamp",
  "pântano": "Swamp",
  "ritual sombrio": "Dark Ritual",
  "tutor diabolico": "Diabolic Tutor",
  "tutor diabólico": "Diabolic Tutor",
  "pedra da mente": "Mind Stone",
  "diamante de carvao": "Charcoal Diamond",
  "diamante de carvão": "Charcoal Diamond",
  "gavinhas da agonia": "Tendrils of Agony",
  "mercador cinzento de asfodelos": "Gray Merchant of Asphodel",
  "cidadela de nicol bolas": "Bolas's Citadel",
  "maquinacoes de gonti": "Gonti's Machinations",
  "maquinações de gonti": "Gonti's Machinations",
  "alimentar o enxame": "Feed the Swarm",
  "malignidade imortal": "Undying Malice",
  "armadura de sombras": "Armor of Shadows",
  "presenca medonha": "Dread Presence",
  "presença medonha": "Dread Presence",
  "lente prismatica": "Prismatic Lens",
  "lente prismática": "Prismatic Lens",
  "pluma do paraiso": "Paradise Plume",
  "pluma do paraíso": "Paradise Plume",
  "chifre de demonio": "Demon's Horn",
  "chifre de demônio": "Demon's Horn",
  "promessa de poder": "Promise of Power",
  "chainer mestre da demencia": "Chainer, Dementia Master",
  "chainer mestre da demência": "Chainer, Dementia Master",
  "pestilencia": "Pestilence",
  "pestilência": "Pestilence",
  "elixir da imortalidade": "Elixir of Immortality",
  "passagem do ladino": "Rogue's Passage",
  "parasita thrull": "Thrull Parasite",
  "sibilador da basilica": "Basilica Screecher",
  "sibilador da basílica": "Basilica Screecher",
  "impositor do sindicato": "Syndicate Enforcer",
  "pontifice do flagelo": "Pontiff of Blight",
  "pontífice do flagelo": "Pontiff of Blight",
  "cajado do magus da morte": "Staff of the Death Magus",
  "fonte radiante": "Radiant Fountain",
  "anel de prisma": "Prism Ring",
  "fonte das agonias": "Font of Agonies",
  "macular": "Defile",
  "rito de razaketh": "Razaketh's Rite",
  "dragao decadente": "Decadent Dragon",
  "dragão decadente": "Decadent Dragon",
  "gosto refinado": "Expensive Taste"
};

const NORMALIZED_ALIASES = new Map<string, string>(
  Object.entries(LOCAL_ALIASES).map(([input, canonical]) => [normalizeCardName(input), canonical])
);

export function applyLocalAlias(name: string): string | null {
  return NORMALIZED_ALIASES.get(normalizeCardName(name)) || null;
}
