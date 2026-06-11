const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = require("node-fetch");

const DATA_URL = "https://raw.githubusercontent.com/arab2A/stream/main/data.json";

const manifest = {
  id: "community.arabp2p.addon.seriesfix",
  version: "2.0.1",
  name: "🎬 ArabP2P Series Fix",
  description: "أفلام ومسلسلات مع دعم حلقات التورنت",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "arabp2p_movies",
      name: "أفلام ArabP2P",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "series",
      id: "arabp2p_series",
      name: "مسلسلات ArabP2P",
      extra: [{ name: "search", isRequired: false }]
    }
  ],
  behaviorHints: {
    configurable: false
  }
};

const builder = new addonBuilder(manifest);
let cachedItems = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getItems() {
  const now = Date.now();
  if (cachedItems && now - lastFetch < CACHE_TTL) return cachedItems;

  const res = await fetch(DATA_URL, { timeout: 15000 });
  if (!res.ok) throw new Error(`Failed to fetch DATA_URL: ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("movies.json must be an array");

  cachedItems = data;
  lastFetch = now;
  return cachedItems;
}

function searchItems(items, q) {
  if (!q) return items;
  const s = String(q).toLowerCase();
  return items.filter(i => String(i.title || "").toLowerCase().includes(s));
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const expectedCatalog = type === "movie" ? "arabp2p_movies" : type === "series" ? "arabp2p_series" : null;
  if (!expectedCatalog || id !== expectedCatalog) return { metas: [] };

  const items = await getItems();
  let filtered = items.filter(i => i.type === type);
  filtered = searchItems(filtered, extra && extra.search);

  return {
    metas: filtered.map(i => ({
      id: i.id,
      type: i.type,
      name: i.title,
      poster: i.poster,
      year: i.year
    }))
  };
});

builder.defineMetaHandler(async ({ type, id }) => {
  const items = await getItems();
  const item = items.find(i => i.id === id && i.type === type);
  if (!item) return { meta: null };

  const meta = {
    id: item.id,
    type: item.type,
    name: item.title,
    poster: item.poster,
    year: item.year,
    description: item.description || "",
    genres: Array.isArray(item.genre) ? item.genre : []
  };

  if (item.type === "series" && Array.isArray(item.videos)) {
    meta.videos = item.videos.map(v => ({
      id: `${item.id}:${v.season}:${v.episode}`,
      title: v.title || `S${v.season}E${v.episode}`,
      season: v.season,
      episode: v.episode,
      released: v.released || undefined
    }));
  }

  return { meta };
});

builder.defineStreamHandler(async ({ type, id }) => {
  const items = await getItems();

  if (type === "movie") {
    const item = items.find(i => i.id === id && i.type === "movie");
    if (!item || !Array.isArray(item.streams)) return { streams: [] };

    return {
      streams: item.streams
        .map(s => ({
          title: s.title || "Stream",
          infoHash: s.infoHash,
          fileIdx: Number.isInteger(s.fileIdx) ? s.fileIdx : undefined,
          sources: s.sources
        }))
        .filter(s => s.infoHash || s.sources)
    };
  }

  if (type === "series") {
    const [seriesId, season, episode] = String(id).split(":");
    const item = items.find(i => i.id === seriesId && i.type === "series");
    if (!item || !Array.isArray(item.videos)) return { streams: [] };

    const video = item.videos.find(
      v => String(v.season) === String(season) && String(v.episode) === String(episode)
    );
    if (!video) return { streams: [] };

    return {
      streams: [
        {
          title: video.title || `S${season}E${episode}`,
          infoHash: video.infoHash,
          fileIdx: Number.isInteger(video.fileIdx) ? video.fileIdx : undefined,
          sources: video.sources
        }
      ].filter(s => s.infoHash || s.sources)
    };
  }

  return { streams: [] };
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Addon running on http://localhost:${PORT}/manifest.json`);
