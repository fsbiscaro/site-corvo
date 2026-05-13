import argparse
import codecs
import json
import re
import shutil
import unicodedata
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


COLOR_ORDER = ["W", "U", "B", "R", "G", "C"]
OUTPUT_ROOT = Path("assets/data/card-catalog")


def main():
    parser = argparse.ArgumentParser(description="Build a compact local MTG card catalog for the Grimorio deck analyzer.")
    parser.add_argument("source_zip", help="Path to a Scryfall/MTGJSON-style all-cards zip file.")
    parser.add_argument("--out", default=str(OUTPUT_ROOT), help="Output directory for the generated catalog.")
    args = parser.parse_args()

    source_zip = Path(args.source_zip)
    output_root = Path(args.out)
    if not source_zip.exists():
        raise SystemExit(f"Source zip not found: {source_zip}")

    cards_by_oracle = {}
    aliases_by_oracle = defaultdict(set)
    total_prints = 0

    with zipfile.ZipFile(source_zip) as archive:
        members = [info for info in archive.infolist() if info.filename.lower().endswith(".json")]
        if not members:
            raise SystemExit("No JSON file found inside zip.")
        member = members[0]
        with archive.open(member) as raw:
            for card in iter_json_array(raw):
                total_prints += 1
                if not isinstance(card, dict):
                    continue
                key = card.get("oracle_id") or card.get("id")
                if not key:
                    continue

                collect_aliases(card, aliases_by_oracle[key])
                current = cards_by_oracle.get(key)
                if should_replace_card(current, card):
                    cards_by_oracle[key] = compact_card(card)

                if total_prints % 50000 == 0:
                    print(f"Processed {total_prints:,} prints, {len(cards_by_oracle):,} unique cards...")

    buckets = defaultdict(lambda: {"aliases": {}, "cards": []})
    for oracle_id, card in cards_by_oracle.items():
      aliases = sorted(alias for alias in aliases_by_oracle[oracle_id] if alias)
      if card["name"] not in aliases:
          aliases.insert(0, card["name"])
      card["printedNames"] = sorted(name for name in aliases if name != card["name"])[:40]

      target_buckets = defaultdict(list)
      for alias in aliases:
          normalized = normalize_card_name(alias)
          if normalized:
              target_buckets[bucket_key(normalized)].append(normalized)

      for bucket, normalized_aliases in target_buckets.items():
          bucket_data = buckets[bucket]
          index = len(bucket_data["cards"])
          bucket_data["cards"].append(card)
          for normalized in normalized_aliases:
              bucket_data["aliases"][normalized] = index

    if output_root.exists():
        shutil.rmtree(output_root)
    (output_root / "buckets").mkdir(parents=True, exist_ok=True)

    alias_count = 0
    for key, data in sorted(buckets.items()):
        alias_count += len(data["aliases"])
        write_json(output_root / "buckets" / f"{key}.json", data)

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source_zip.name),
        "sourceKind": "scryfall-all-cards-compatible",
        "printsRead": total_prints,
        "uniqueCards": len(cards_by_oracle),
        "aliasCount": alias_count,
        "bucketCount": len(buckets),
        "bucketStrategy": "first-two-normalized-characters"
    }
    write_json(output_root / "meta.json", meta)
    print(json.dumps(meta, indent=2, ensure_ascii=False))


def iter_json_array(raw_file, chunk_size=1024 * 1024):
    decoder = json.JSONDecoder()
    utf8_decoder = codecs.getincrementaldecoder("utf-8")()
    buffer = ""
    started = False
    eof = False

    while True:
        if not eof and (not started or len(buffer) < chunk_size):
            chunk = raw_file.read(chunk_size)
            if chunk:
                buffer += utf8_decoder.decode(chunk)
            else:
                buffer += utf8_decoder.decode(b"", final=True)
                eof = True

        if not started:
            buffer = buffer.lstrip()
            if not buffer:
                if eof:
                    break
                continue
            if buffer[0] != "[":
                raise ValueError("Expected JSON array.")
            buffer = buffer[1:]
            started = True

        buffer = buffer.lstrip()
        if buffer.startswith(","):
            buffer = buffer[1:].lstrip()
        if buffer.startswith("]"):
            break

        try:
            value, index = decoder.raw_decode(buffer)
        except json.JSONDecodeError:
            if eof:
                raise
            continue

        yield value
        buffer = buffer[index:]


def should_replace_card(current, candidate):
    if current is None:
        return True
    candidate_lang = candidate.get("lang") == "en"
    current_lang = current.get("lang") == "en"
    if candidate_lang and not current_lang:
        return True
    if candidate_lang == current_lang:
        current_image = bool(current.get("imageUrl") or current.get("thumbnailUrl"))
        candidate_image = bool(extract_image(candidate, "normal") or extract_image(candidate, "small"))
        if candidate_image and not current_image:
            return True
    return False


def compact_card(card):
    type_line = card.get("type_line") or face_value(card, "type_line") or ""
    oracle_text = card.get("oracle_text") or face_join(card, "oracle_text")
    colors = normalize_colors(card.get("colors") or face_colors(card, "colors"))
    color_identity = normalize_colors(card.get("color_identity") or [])
    card_types = extract_card_types(type_line)
    tags = classify_tags(card.get("name") or "", type_line, oracle_text, card.get("keywords") or [])

    return {
        "id": card.get("id"),
        "oracleId": card.get("oracle_id") or card.get("id"),
        "lang": card.get("lang") or "en",
        "name": card.get("name") or face_value(card, "name") or "",
        "manaValue": card.get("cmc"),
        "typeLine": type_line,
        "oracleText": oracle_text,
        "cardTypes": card_types,
        "colors": colors,
        "colorIdentity": color_identity,
        "keywords": card.get("keywords") or [],
        "legalities": compact_legalities(card.get("legalities") or {}),
        "imageUrl": extract_image(card, "normal"),
        "thumbnailUrl": extract_image(card, "small") or extract_image(card, "normal"),
        "pngUrl": extract_image(card, "png"),
        "power": card.get("power") or face_value(card, "power"),
        "toughness": card.get("toughness") or face_value(card, "toughness"),
        "isLegendary": "Legendary" in type_line,
        "canBeCommander": can_be_commander(type_line, oracle_text),
        "tags": tags
    }


def collect_aliases(card, aliases):
    add_alias(aliases, card.get("name"))
    if card.get("lang") == "pt":
        add_alias(aliases, card.get("printed_name"))
    for face in card.get("card_faces") or []:
        add_alias(aliases, face.get("name"))
        if card.get("lang") == "pt":
            add_alias(aliases, face.get("printed_name"))


def add_alias(aliases, value):
    value = str(value or "").strip()
    if value:
        aliases.add(value)


def extract_image(card, size):
    if card.get("image_uris", {}).get(size):
        return card["image_uris"][size]
    for face in card.get("card_faces") or []:
        if face.get("image_uris", {}).get(size):
            return face["image_uris"][size]
    return None


def face_value(card, field):
    for face in card.get("card_faces") or []:
        if face.get(field):
            return face[field]
    return None


def face_join(card, field):
    values = [face.get(field) for face in card.get("card_faces") or [] if face.get(field)]
    return "\n".join(values)


def face_colors(card, field):
    colors = []
    for face in card.get("card_faces") or []:
        colors.extend(face.get(field) or [])
    return colors


def compact_legalities(legalities):
    keep = ["standard", "pioneer", "modern", "historic", "timeless", "explorer", "pauper", "commander", "brawl", "legacy", "vintage"]
    return {key: legalities.get(key, "unknown") for key in keep if key in legalities}


def extract_card_types(type_line):
    found = []
    for card_type in ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"]:
        if card_type in type_line:
            found.append(card_type)
    return found


def classify_tags(name, type_line, oracle_text, keywords):
    text = f"{name} {type_line} {oracle_text} {' '.join(keywords)}".lower()
    tags = set()
    for card_type, tag in [
        ("Land", "land"),
        ("Creature", "creature"),
        ("Artifact", "artifact"),
        ("Enchantment", "enchantment"),
        ("Instant", "instant"),
        ("Sorcery", "sorcery"),
        ("Planeswalker", "planeswalker"),
        ("Battle", "battle")
    ]:
        if card_type in type_line:
            tags.add(tag)

    if "Basic Land" in type_line:
        tags.add("basic_land")
    if "Legendary" in type_line:
        tags.add("legendary")
    if can_be_commander(type_line, oracle_text):
        tags.add("commander")
    if "flying" in text:
        tags.update(["flying", "evasive"])
    if "can't be blocked" in text or "unblockable" in text:
        tags.update(["unblockable", "evasive"])
    if "ninja" in text:
        tags.add("ninja")
    if "ninjutsu" in text:
        tags.add("ninjutsu")
    if "deals combat damage to a player" in text:
        tags.add("combat_damage_trigger")
    if re.search(r"\bdraw (a|two|three|\d)", text) or "draw that many" in text:
        tags.add("card_draw")
    if any(term in text for term in ["scry ", "surveil", "look at the top", "impulse draw"]):
        tags.add("card_selection")
    if "counter target" in text:
        tags.add("counterspell")
    if "discard" in text:
        tags.add("discard")
    if any(term in text for term in ["destroy target", "exile target", "deals damage", "deals x damage", "damage to any target"]):
        tags.update(["removal", "single_target_removal"])
    if any(term in text for term in ["destroy all", "exile all", "each creature", "all creatures"]):
        tags.add("board_wipe")
    if "add {" in text or "add one mana" in text or "add two mana" in text:
        if "Instant" in type_line or "Sorcery" in type_line or "ritual" in text:
            tags.add("burst_mana")
        elif "Land" not in type_line:
            tags.update(["ramp", "permanent_ramp"])
        tags.add("mana_fixing")
    if any(term in text for term in ["signet", "talisman", "sol ring", "arcane signet", "fellwar stone"]):
        tags.update(["ramp", "permanent_ramp", "mana_fixing"])
    if "costs " in text and " less" in text:
        tags.add("cost_reducer")
    if any(term in text for term in ["hexproof", "indestructible", "protection from", "phase out"]):
        tags.add("protection")
    if "graveyard" in text:
        tags.add("graveyard_synergy")
    if any(term in text for term in ["return target", "return a card", "from your graveyard", "reanimate"]):
        tags.add("recursion")
    if "create" in text and "token" in text:
        tags.add("token_generator")
    if "sacrifice" in text:
        tags.add("sacrifice")
    if "search your library" in text:
        tags.add("tutor")
    if "lifelink" in text or "gain life" in text:
        tags.add("lifegain")
    if "destroy target artifact" in text or "exile target artifact" in text:
        tags.add("artifact_hate")
    if "destroy target enchantment" in text or "exile target enchantment" in text:
        tags.add("enchantment_hate")

    return sorted(tags)


def can_be_commander(type_line, oracle_text):
    return (
        "Legendary Creature" in type_line
        or "can be your commander" in str(oracle_text or "").lower()
    )


def normalize_colors(colors):
    found = {str(color).upper() for color in colors if str(color).upper() in COLOR_ORDER}
    return [color for color in COLOR_ORDER if color in found]


def normalize_card_name(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.lower()
    text = text.replace("'", "").replace("’", "")
    text = re.sub(r"[^a-z0-9/,\-: ]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def bucket_key(normalized):
    compact = re.sub(r"[^a-z0-9]+", "", normalized)
    return (compact[:2] or "_").ljust(2, "_")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
