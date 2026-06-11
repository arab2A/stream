const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = require("node-fetch");

// ====================================================
// ⚙️ غيّر هذا الرابط برابط movies.json على GitHub
// ====================================================
const DATA_URL = "https://raw.githubusercontent.com/arab2A/stream/main/movies.json";

const manifest = {
  id: "community.arabp2p.addon",
  version: "1.0.0",
  name: "🎬 ArabP2P Movies",
  description: "أفلام من ArabP2P",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  catalogs: [
    {
      type: "movie",
      id: "arabp2p_catalog",
      name: "أفلام ArabP2P",
      extra: [{ name: "search", isRequired: false }]
    }
  ],
  behaviorHints: { p2p: true }
};

const builder = new addonBuilder(manifest);

let cachedMovies = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getMovies() {
  const now = Date.now();
  if (cachedMovies && (now - lastFetch) < CACHE_TTL) return cachedMovies;
  try {
    const res = await fetch(DATA_URL);
    cachedMovies = await res.json();
    lastFetch = now;
    return cachedMovies;
  } catch (err) {
    console.error("خطأ في جلب البيانات:", err.message);
    return cachedMovies || [];
  }
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "movie" || id !== "arabp2p_catalog") return { metas: [] };
  const movies = await getMovies();
  let filtered = movies;
  if (extra && extra.search) {
    const q = extra.search.toLowerCase();
    filtered = movies.filter(m => m.title.toLowerCase().includes(q));
  }
  return {
    metas: filtered.map(m => ({
      id: m.id, type: "movie", name: m.title, poster: m.poster, year: m.year
    }))
  };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "movie") return { meta: null };
  const movies = await getMovies();
  const movie = movies.find(m => m.id === id || m.imdb_id === id);
  if (!movie) return { meta: null };
  return {
    meta: {
      id: movie.id, type: "movie", name: movie.title,
      poster: movie.poster, year: movie.year,
      description: movie.description || "", genres: movie.genre || []
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "movie") return { streams: [] };
  const movies = await getMovies();
  const movie = movies.find(m => m.id === id || m.imdb_id === id);
  if (!movie || !movie.streams) return { streams: [] };
  return {
    streams: movie.streams.map(s => ({
      title: s.title || "تشغيل",
      externalUrl: s.torrentUrl
    }))
  };
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`✅ الإضافة شغالة على المنفذ ${PORT}`);
