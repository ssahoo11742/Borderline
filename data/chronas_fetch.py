#!/usr/bin/env python3
"""
chronas_fetch.py
----------------
Fetches Chronas data for any year range, batches files locally, uploads
each batch to Hugging Face in a single commit, then cleans up.

Setup (one time):
    pip install huggingface_hub
    huggingface-cli login   (use a WRITE token from huggingface.co/settings/tokens)

Usage:
    # Upload base files first (provinces + metadata, run once)
    python chronas_fetch.py --hf-repo SSSAHOO/mapguessr2 upload-base

    # Fetch all years -2000 to 2000 in batches of 50
    python chronas_fetch.py --hf-repo SSSAHOO/mapguessr2 fetch -2000 --to 2000

    # Custom batch size
    python chronas_fetch.py --hf-repo SSSAHOO/mapguessr2 fetch -2000 --to 2000 --batch 100

    # Skip markers (faster, smaller)
    python chronas_fetch.py --hf-repo SSSAHOO/mapguessr2 fetch -2000 --to 2000 --no-markers

    # Check progress
    python chronas_fetch.py --hf-repo SSSAHOO/mapguessr2 status

HOW TO GET FILES FROM BROWSER (if auto-download is blocked)
-----------------------------------------------------------
Open chronas.org, DevTools -> Network tab, save:
  chronas_metadata.json  <-  /v1/metadata?type=g&f=provinces,ruler,culture,religion,...
  851.json               <-  /v1/areas/851
  851_markers.json       <-  /v1/markers?year=851&limit=10000  (optional)
Then run fetch normally — it will find the local files automatically.
"""

import json
import argparse
import urllib.request
import urllib.error
import time
import shutil
from pathlib import Path

BASE        = "https://d24mkpax7rmotx.cloudfront.net/v1"
AREAS_URL   = BASE + "/areas/{year}"
META_URL    = BASE + "/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral"
MARKERS_URL = BASE + "/markers?year={year}&limit=10000"
EVENTS_URL  = BASE + "/metadata?type=e&end=3000&subtype=ew,ei,ps"

META_CACHE    = "chronas_metadata.json"
EVENTS_CACHE  = "chronas_events.json"
PROVINCES_OUT = "provinces.geojson"
BATCH_DIR     = Path("_batch")          # temp folder, deleted after each upload
FALLBACK_COLOR = "#888888"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin":  "https://www.chronas.org",
    "Referer": "https://www.chronas.org/",
    "Accept":  "application/json, */*",
}


# ── I/O helpers ────────────────────────────────────────────────────────────────

def try_fetch(url, retries=3, backoff=2.0):
    """Fetch JSON from URL with retry on failure."""
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt < retries:
                wait = backoff * attempt
                print(f"    warning: attempt {attempt} failed ({e}), retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"    warning: all {retries} attempts failed ({e})")
                return None


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data, compact=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, ensure_ascii=False)


def fetch_or_local(url, local_path, label, force=False):
    p = Path(local_path)
    if p.exists() and not force:
        print(f"  Using cached {local_path}")
        return load_json(p)
    print(f"  Fetching {label}...")
    data = try_fetch(url)
    if data is not None:
        save_json(p, data)
        print(f"  Saved {local_path}")
        return data
    if p.exists():
        print(f"  Falling back to local {local_path}")
        return load_json(p)
    raise SystemExit(
        f"\n  Could not fetch {label} and no local file at '{local_path}'.\n"
        f"  Download it manually from your browser and save as: {local_path}"
    )


def fetch_year_raw(year, force=False):
    local = Path(f"{year}.json")
    if local.exists() and not force:
        return load_json(local), local
    data = try_fetch(AREAS_URL.format(year=year))
    if data is not None:
        save_json(local, data)
        return data, local
    if local.exists():
        return load_json(local), local
    return None, None   # soft fail — will be recorded as skipped


def fetch_markers_raw(year, force=False):
    local = Path(f"{year}_markers.json")
    if local.exists() and not force:
        return load_json(local), local
    data = try_fetch(MARKERS_URL.format(year=year))
    if data is not None:
        save_json(local, data)
        return data, local
    if local.exists():
        return load_json(local), local
    return None, None


# ── Data builders ──────────────────────────────────────────────────────────────

def extract_provinces(metadata):
    features = []
    for feat in metadata.get("provinces", {}).get("features", []):
        name = feat.get("properties", {}).get("name", "")
        geom = feat.get("geometry")
        if geom:
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {"name": name},
            })
    return {"type": "FeatureCollection", "features": features}


def build_markers_geojson(markers):
    TYPE_LABELS = {"a": "Person", "p": "Political figure", "b": "Battle",
                   "c": "City", "r": "Religion event", "e": "Empire"}
    features = []
    for m in markers:
        coo = m.get("coo") or m.get("coo2")
        if not coo or len(coo) < 2:
            continue
        mtype = m.get("type", "")
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [coo[0], coo[1]]},
            "properties": {
                "id":         m.get("_id", ""),
                "name":       m.get("name", ""),
                "type":       mtype,
                "type_label": TYPE_LABELS.get(mtype, mtype),
                "year":       m.get("year"),
                "end":        m.get("end"),
                "wiki":       f"https://en.wikipedia.org/wiki/{m.get('_id','').replace(' ','_')}",
            },
        })
    return {"type": "FeatureCollection", "features": features}


# ── Hugging Face helpers ───────────────────────────────────────────────────────

def get_hf_api(repo_id):
    try:
        from huggingface_hub import HfApi
        return HfApi(), repo_id
    except ImportError:
        raise SystemExit(
            "\n  huggingface_hub not installed.\n"
            "  Run: pip install huggingface_hub\n"
            "  Then: huggingface-cli login"
        )


def hf_upload_single(api, repo_id, local_path, repo_path, commit_msg):
    """Upload a single file — used for base files only."""
    try:
        api.upload_file(
            path_or_fileobj=str(local_path),
            path_in_repo=repo_path,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=commit_msg,
        )
        print(f"  ✓ Uploaded {repo_path}")
        return True
    except Exception as e:
        print(f"  ✗ Upload failed for {repo_path}: {e}")
        return False


def hf_upload_folder(api, repo_id, local_folder, repo_folder, commit_msg, retries=3):
    """
    Upload an entire local folder to HF in a SINGLE commit.
    This is the key to avoiding rate limits — 50 files = 1 API call, not 50.
    """
    for attempt in range(1, retries + 1):
        try:
            api.upload_folder(
                folder_path=str(local_folder),
                path_in_repo=repo_folder,
                repo_id=repo_id,
                repo_type="dataset",
                commit_message=commit_msg,
            )
            return True
        except Exception as e:
            if attempt < retries:
                wait = 10 * attempt
                print(f"    HF upload attempt {attempt} failed ({e}), retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ✗ Batch upload failed after {retries} attempts: {e}")
                return False


def hf_list_years(api, repo_id):
    """Return set of year ints already in attrs/ on HF."""
    try:
        files = api.list_repo_files(repo_id=repo_id, repo_type="dataset")
        years = set()
        for f in files:
            if f.startswith("attrs/") and f.endswith(".json") and "_markers" not in f:
                try:
                    years.add(int(f.replace("attrs/", "").replace(".json", "")))
                except ValueError:
                    pass
        return years
    except Exception as e:
        print(f"  warning: could not list HF files ({e})")
        return set()


def hf_file_exists(api, repo_id, repo_path):
    try:
        files = list(api.list_repo_files(repo_id=repo_id, repo_type="dataset"))
        return repo_path in files
    except Exception:
        return False


# ── Commands ───────────────────────────────────────────────────────────────────

def cmd_upload_base(args):
    """Upload provinces.geojson, metadata, and events to HF (run once)."""
    api, repo_id = get_hf_api(args.hf_repo)
    print(f"\n=== upload-base -> {repo_id} ===\n")

    print("[1] Metadata")
    metadata = fetch_or_local(META_URL, META_CACHE, "metadata")

    prov_path = Path(PROVINCES_OUT)
    if not prov_path.exists():
        print(f"[2] Extracting provinces -> {PROVINCES_OUT}")
        save_json(prov_path, extract_provinces(metadata))
    else:
        print(f"[2] Using existing {PROVINCES_OUT}")

    if not Path(EVENTS_CACHE).exists():
        print("[3] Fetching events")
        fetch_or_local(EVENTS_URL, EVENTS_CACHE, "events")
    else:
        print(f"[3] Using existing {EVENTS_CACHE}")

    print(f"\n[4] Uploading to {repo_id}")
    hf_upload_single(api, repo_id, META_CACHE,    "chronas_metadata.json", "Add metadata")
    hf_upload_single(api, repo_id, PROVINCES_OUT, "provinces.geojson",     "Add province polygons")
    hf_upload_single(api, repo_id, EVENTS_CACHE,  "chronas_events.json",   "Add events")

    print(f"\n=== Done! ===")
    print(f"  Run next: python chronas_fetch.py --hf-repo {repo_id} fetch -2000 --to 2000")


def cmd_fetch(args):
    """
    Fetch years in batches, upload each batch as a single HF commit, delete local files.
    """
    api, repo_id = get_hf_api(args.hf_repo)

    year_from  = args.year
    year_to    = args.to if args.to is not None else args.year
    batch_size = args.batch
    all_years  = list(range(year_from, year_to + 1))
    total      = len(all_years)

    print(f"\n=== fetch {year_from} to {year_to} ({total} years, batch={batch_size}) -> {repo_id} ===\n")

    # Load metadata once
    metadata = fetch_or_local(META_URL, META_CACHE, "metadata")

    # Ensure provinces exists locally
    prov_path = Path(PROVINCES_OUT)
    if not prov_path.exists():
        print(f"Extracting provinces -> {PROVINCES_OUT}")
        save_json(prov_path, extract_provinces(metadata))

    # Check which years already exist on HF
    print("Checking existing years on HF (this may take a moment)...")
    existing = set() if args.force else hf_list_years(api, repo_id)
    todo = [y for y in all_years if y not in existing]
    print(f"  {len(existing)} already uploaded, {len(todo)} to fetch\n")

    if not todo:
        print("Nothing to do — all years already on HF.")
        return

    # Split into batches
    batches = [todo[i:i+batch_size] for i in range(0, len(todo), batch_size)]
    total_batches = len(batches)
    failed_years = []

    for batch_num, batch in enumerate(batches, 1):
        print(f"\n{'='*60}")
        print(f"Batch {batch_num}/{total_batches}  |  years {batch[0]} to {batch[-1]}  ({len(batch)} years)")
        print(f"{'='*60}")

        # Clean/create batch staging folder
        if BATCH_DIR.exists():
            shutil.rmtree(BATCH_DIR)
        BATCH_DIR.mkdir()

        batch_failed = []
        fetched = 0

        for year in batch:
            print(f"\n  [{fetched+1}/{len(batch)}] year {year}")

            # Fetch area data
            year_data, raw_path = fetch_year_raw(year, force=args.force)
            if year_data is None:
                print(f"    Skipping year {year} — could not fetch")
                batch_failed.append(year)
                continue

            # Save compact attrs to batch folder
            attrs_dest = BATCH_DIR / f"{year}.json"
            save_json(attrs_dest, year_data, compact=True)
            kb = attrs_dest.stat().st_size / 1024
            print(f"    attrs: {kb:.1f} KB")

            # Delete raw year file
            if raw_path and raw_path.exists():
                raw_path.unlink()

            # Markers
            if not args.no_markers:
                markers, markers_raw = fetch_markers_raw(year, force=args.force)
                if markers:
                    mg = build_markers_geojson(markers if isinstance(markers, list) else [])
                    if mg["features"]:
                        markers_dest = BATCH_DIR / f"{year}_markers.geojson"
                        save_json(markers_dest, mg, compact=True)
                        kb = markers_dest.stat().st_size / 1024
                        print(f"    markers: {len(mg['features'])} points, {kb:.1f} KB")
                    else:
                        print(f"    markers: none for this year")
                # Always delete raw markers file regardless of content
                if markers_raw and markers_raw.exists():
                    markers_raw.unlink()

            fetched += 1

            # Small pause between Chronas API calls
            time.sleep(0.3)

        if fetched == 0:
            print(f"\n  No files fetched for batch {batch_num}, skipping upload.")
            failed_years.extend(batch_failed)
            continue

        # Upload entire batch folder in ONE commit
        batch_file_count = len(list(BATCH_DIR.iterdir()))
        batch_size_kb = sum(f.stat().st_size for f in BATCH_DIR.iterdir()) / 1024
        print(f"\n  Uploading batch {batch_num} to HF ({batch_file_count} files, {batch_size_kb:.0f} KB)...")

        ok = hf_upload_folder(
            api, repo_id,
            local_folder=BATCH_DIR,
            repo_folder="attrs",
            commit_msg=f"Add years {batch[0]} to {batch[-1]} ({fetched} years)"
        )

        if ok:
            print(f"  ✓ Batch {batch_num} uploaded successfully")
        else:
            print(f"  ✗ Batch {batch_num} upload failed — files kept in {BATCH_DIR} for retry")
            failed_years.extend(batch)
            continue

        # Delete batch folder
        shutil.rmtree(BATCH_DIR)
        failed_years.extend(batch_failed)

        # Pause between batches to respect HF rate limits
        if batch_num < total_batches:
            print(f"  Pausing 3s before next batch...")
            time.sleep(3)

    # Final summary
    print(f"\n{'='*60}")
    print(f"=== All done ===")
    print(f"  Total years requested : {total}")
    print(f"  Already on HF         : {len(existing)}")
    print(f"  Successfully uploaded : {len(todo) - len(failed_years)}")
    if failed_years:
        print(f"  Failed                : {len(failed_years)} years — {failed_years[:20]}")
        print(f"  Re-run the same command to retry failed years (skips already-uploaded ones)")
    print(f"\n  https://huggingface.co/datasets/{repo_id}/tree/main/attrs")


def cmd_status(args):
    api, repo_id = get_hf_api(args.hf_repo)
    print(f"\n=== Status: {repo_id} ===\n")

    try:
        files = list(api.list_repo_files(repo_id=repo_id, repo_type="dataset"))
    except Exception as e:
        raise SystemExit(f"  Could not list repo files: {e}")

    base_files   = [f for f in files if not f.startswith("attrs/")]
    attr_files   = [f for f in files if f.startswith("attrs/") and f.endswith(".json") and "_markers" not in f]
    marker_files = [f for f in files if f.startswith("attrs/") and "_markers" in f]

    years = []
    for f in attr_files:
        try:
            years.append(int(f.replace("attrs/", "").replace(".json", "")))
        except ValueError:
            pass

    print(f"  Base files     : {base_files}")
    print(f"  Years uploaded : {len(years)}")
    if years:
        print(f"  Year range     : {min(years)} to {max(years)}")
        all_in_range = set(range(min(years), max(years) + 1))
        missing = sorted(all_in_range - set(years))
        if missing:
            print(f"  Gaps in range  : {len(missing)} missing years")
            if len(missing) <= 20:
                print(f"  Missing years  : {missing}")
    print(f"  Marker files   : {len(marker_files)}")
    print(f"\n  URL: https://huggingface.co/datasets/{repo_id}/tree/main")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch Chronas data in batches, upload to Hugging Face, clean up",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--hf-repo", required=True,
                        help="Hugging Face dataset repo, e.g. SSSAHOO/mapguessr2")
    sub = parser.add_subparsers(dest="command", required=True)

    # upload-base
    sub.add_parser("upload-base",
                   help="Upload provinces.geojson + metadata to HF (run once)")

    # fetch
    p_fetch = sub.add_parser("fetch",
                              help="Fetch year range, batch upload to HF, delete local files")
    p_fetch.add_argument("year", type=int, help="Start year (e.g. -2000)")
    p_fetch.add_argument("--to", type=int, default=None,
                         help="End year inclusive (default: same as start)")
    p_fetch.add_argument("--batch", type=int, default=50,
                         help="Years per HF commit (default: 50)")
    p_fetch.add_argument("--no-markers", action="store_true", help="Skip markers")
    p_fetch.add_argument("--force", action="store_true",
                         help="Re-fetch and re-upload even if year already on HF")

    # status
    sub.add_parser("status", help="Show what years are on Hugging Face")

    args = parser.parse_args()

    if args.command == "upload-base":
        cmd_upload_base(args)
    elif args.command == "fetch":
        cmd_fetch(args)
    elif args.command == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()