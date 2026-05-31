export const HF_BASE = "https://huggingface.co/datasets/SSSAHOO/mapguessr2/resolve/main";
export const PROVINCES_URL = `${HF_BASE}/provinces.geojson`;
export const METADATA_URL = `${HF_BASE}/chronas_metadata.json`;

export const MIN_YEAR = -2000;
export const MAX_YEAR = 2000;
export const MAX_ROUNDS = 5;
export const ADJACENCY_THRESHOLD = 4.0;
export const OCEAN_COLOR = "#2c4a6e";

export const TYPE_COLORS = { c: "#f0c040", p: "#60c0f0", b: "#f08060", default: "#aaaaaa" };
export const COLOR_MODES = ["ruler", "religion", "culture"];

export function pickRandomYear() {
  return MIN_YEAR + Math.floor(Math.random() * (MAX_YEAR - MIN_YEAR + 1));
}

export function calcScore(guess, actual) {
  const diff = Math.abs(guess - actual);
  if (diff === 0) return 1000;
  if (diff >= 500) return 0;
  return Math.round(1000 * Math.pow(1 - diff / 500, 2));
}

export function yearLabel(y) {
  if (y < 0) return `${Math.abs(y)} BCE`;
  if (y === 0) return "1 CE";
  return `${y} CE`;
}

export function resolveFullName(metadata, category, key) {
  const entry = metadata?.[category]?.[key];
  if (!entry) return key;
  return Array.isArray(entry) ? entry[0] : entry;
}

export function resolveColor(metadata, category, key) {
  const entry = metadata?.[category]?.[key];
  if (!entry) return "#1e3248";
  return (Array.isArray(entry) ? entry[1] : entry) || "#1e3248";
}

export function extractCoords(geometry) {
  const coords = [];
  const recurse = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") coords.push(c);
    else c.forEach(recurse);
  };
  recurse(geometry.coordinates);
  return coords;
}

export function bboxOf(coords) {
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  return {
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
    minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    spanLat: Math.max(...lats) - Math.min(...lats),
    spanLng: Math.max(...lngs) - Math.min(...lngs),
  };
}

export function makeUF(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  function find(x) { return p[x] === x ? x : (p[x] = find(p[x])); }
  function union(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    p[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  }
  return { find, union };
}

export function bboxesAdjacent(a, b, threshold) {
  const latGap = Math.max(0, Math.max(a.minLat, b.minLat) - Math.min(a.maxLat, b.maxLat));
  const lngGap = Math.max(0, Math.max(a.minLng, b.minLng) - Math.min(a.maxLng, b.maxLng));
  return latGap <= threshold && lngGap <= threshold;
}

export function clusterIntoConnectedBodies(features, labelName) {
  if (!features.length) return [];
  const bboxes = features.map(f => {
    const coords = extractCoords(f.geometry);
    return coords.length ? bboxOf(coords) : null;
  });
  const n = features.length;
  const uf = makeUF(n);
  for (let i = 0; i < n; i++) {
    if (!bboxes[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!bboxes[j]) continue;
      if (bboxesAdjacent(bboxes[i], bboxes[j], ADJACENCY_THRESHOLD)) uf.union(i, j);
    }
  }
  const clusters = {};
  for (let i = 0; i < n; i++) {
    if (!bboxes[i]) continue;
    const root = uf.find(i);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(bboxes[i]);
  }
  return Object.values(clusters).map(bbs => {
    let wLat = 0, wLng = 0, totalW = 0, maxSpan = 0;
    for (const bb of bbs) {
      const w = bb.spanLat * bb.spanLng;
      wLat += bb.lat * w; wLng += bb.lng * w; totalW += w;
      maxSpan = Math.max(maxSpan, bb.spanLat, bb.spanLng);
    }
    return { label: labelName, lat: totalW > 0 ? wLat / totalW : bbs[0].lat, lng: totalW > 0 ? wLng / totalW : bbs[0].lng, span: maxSpan, totalArea: totalW };
  });
}

export function computeGroupedLabels(features, colorMode) {
  const buckets = {};
  for (const f of features) {
    const p = f.properties;
    if (!p) continue;
    const key = colorMode === "ruler" ? p.rulerKey : colorMode === "culture" ? p.cultureKey : p.religionKey;
    const name = colorMode === "ruler" ? p.rulerName : colorMode === "culture" ? p.cultureName : p.religionName;
    if (!key || !name) continue;
    if (!buckets[key]) buckets[key] = { name, features: [] };
    buckets[key].features.push(f);
  }
  const labels = [];
  for (const { name, features: fs } of Object.values(buckets)) {
    const bodies = clusterIntoConnectedBodies(fs, name);
    const maxArea = Math.max(...bodies.map(b => b.totalArea));
    for (const body of bodies) {
      if (body.totalArea < maxArea * 0.05) continue;
      labels.push(body);
    }
  }
  return labels;
}
