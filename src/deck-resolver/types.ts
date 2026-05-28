export type ResolutionSource =
  | "cache"
  | "local_alias_then_scryfall_collection"
  | "parenthetical_then_scryfall_collection"
  | "split_face_then_scryfall_collection"
  | "scryfall_collection"
  | "scryfall_fuzzy";

export type ParsedDeckCard = {
  quantity: number;
  inputName: string;
  rawLine: string;
};

export type ResolvedDeckCard = {
  quantity: number;
  inputName: string;
  normalizedInput: string;
  lookupName: string;
  resolvedBy: ResolutionSource;
  canonicalName: string;
  scryfallId: string;
  manaValue: number | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  imageUris: Record<string, string> | null;
  legalities: Record<string, string>;
  raw: unknown;
};

export type UnresolvedCard = {
  quantity: number;
  inputName: string;
  normalizedInput: string;
  attempts: string[];
  reason: "not_found" | "scryfall_error";
  suggestions: string[];
};

export type ResolvedDeck = {
  status: "complete" | "partial";
  total: number;
  resolvedCount: number;
  unresolvedCount: number;
  cards: ResolvedDeckCard[];
  unresolved: UnresolvedCard[];
};

export type ResolverCache = {
  get(name: string): Promise<ResolvedDeckCard | null> | ResolvedDeckCard | null;
  set(name: string, card: ResolvedDeckCard): Promise<void> | void;
};

export type ScryfallClientOptions = {
  fetchFn?: typeof fetch;
  fuzzyLimit?: number;
};
