import type { CategoryId, Language } from "./types";

export type DeezerTrack = {
  id: string;
  title: string;
  artist: string;
  previewUrl: string;
  coverUrl: string;
};

type DeezerTrackJson = {
  id: number | string;
  title?: string;
  preview?: string;
  artist?: { name?: string };
  album?: { cover_big?: string; cover_medium?: string };
};

type DeezerList<T> = {
  data?: T[];
  next?: string;
  error?: { message?: string };
};

type DeezerPlaylist = {
  id: number | string;
  title?: string;
  nb_tracks?: number;
  user?: { name?: string };
};

/** Playlist searches per category, in English and in French. */
const QUERIES: Record<CategoryId, { en: string; fr: string }> = {
  "50s": { en: "50s rock n roll hits", fr: "années 50" },
  "60s": { en: "60s hits", fr: "années 60" },
  "70s": { en: "70s hits", fr: "années 70" },
  "80s": { en: "80s hits", fr: "années 80" },
  "90s": { en: "90s hits", fr: "années 90" },
  "2000s": { en: "2000s hits", fr: "années 2000" },
  "2010s": { en: "2010s hits", fr: "années 2010" },
  "2020s": { en: "2020s hits", fr: "années 2020" },
  "hits": { en: "Top Worldwide", fr: "Top France" },
  "pop": { en: "pop hits", fr: "pop française" },
  "variete": { en: "variété française", fr: "variété française" },
  "chanson": { en: "chanson française classiques", fr: "chanson française classiques" },
  "party": { en: "party anthems", fr: "tubes soirée" },
  "summer": { en: "summer hits", fr: "tubes de l'été" },
  "onehit": { en: "one hit wonders", fr: "one hit wonders" },
  "boybands": { en: "boy bands girl groups", fr: "boys bands" },
  "eurovision": { en: "Eurovision", fr: "Eurovision" },
  "kpop": { en: "K-pop hits", fr: "K-pop hits" },
  "classicrock": { en: "classic rock", fr: "classic rock" },
  "rock": { en: "rock hits", fr: "rock français" },
  "hardrock": { en: "hard rock classics", fr: "hard rock classics" },
  "metal": { en: "metal classics", fr: "metal classics" },
  "numetal": { en: "nu metal", fr: "nu metal" },
  "punk": { en: "punk rock", fr: "punk français" },
  "grunge": { en: "grunge", fr: "grunge" },
  "indie": { en: "indie rock alternative", fr: "rock indé" },
  "rap": { en: "hip hop classics", fr: "rap français classiques" },
  "rnb": { en: "R&B classics", fr: "RnB français" },
  "soul": { en: "soul motown classics", fr: "soul classics" },
  "funk": { en: "funk classics", fr: "funk classics" },
  "reggae": { en: "reggae classics", fr: "reggae classics" },
  "afro": { en: "afrobeats hits", fr: "afro hits" },
  "disco": { en: "disco classics", fr: "disco classics" },
  "dance": { en: "dance classics", fr: "tubes dance" },
  "house": { en: "house classics", fr: "house classics" },
  "electro": { en: "electronic hits", fr: "french touch électro" },
  "latin": { en: "latin hits", fr: "latin hits" },
  "portuguese": { en: "Portugal hits", fr: "Portugal hits" },
  "jazz": { en: "jazz classics", fr: "jazz classics" },
  "blues": { en: "blues classics", fr: "blues classics" },
  "country": { en: "country hits", fr: "country hits" },
  "folk": { en: "folk classics", fr: "folk française" },
  "classical": { en: "famous classical music", fr: "musique classique célèbre" },
  "movies": { en: "movie soundtrack hits", fr: "chansons de films" },
  "filmscores": { en: "famous film scores", fr: "musiques de films" },
  "tv": { en: "TV series themes", fr: "génériques séries" },
  "cartoons": { en: "cartoon theme songs", fr: "génériques dessins animés" },
  "kids": { en: "Disney hits", fr: "Disney en français" },
  "musicals": { en: "musicals hits", fr: "comédies musicales" },
  "games": { en: "video game music", fr: "video game music" },
  "christmas": { en: "christmas hits", fr: "chansons de Noël" },
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "blindtest/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Deezer request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function toTrack(raw: DeezerTrackJson): DeezerTrack | null {
  const previewUrl = raw.preview ?? "";
  const title = (raw.title ?? "").trim();
  const artist = (raw.artist?.name ?? "").trim();
  if (!previewUrl || !title || !artist) return null;
  return {
    id: String(raw.id),
    title,
    artist,
    previewUrl,
    coverUrl: raw.album?.cover_big || raw.album?.cover_medium || "",
  };
}

/** Keep one row per song. */
function uniqueSongs(tracks: DeezerTrack[]) {
  const seen = new Set<string>();
  const out: DeezerTrack[] = [];
  for (const track of tracks) {
    const key = `${track.artist.toLowerCase()}|${track.title.toLowerCase()}`;
    if (seen.has(key) || seen.has(track.id)) continue;
    seen.add(key);
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

async function collectTracks(startUrl: string, minCount: number) {
  const collected: DeezerTrack[] = [];
  let url: string | undefined = startUrl;
  while (url && collected.length < Math.max(minCount, 80)) {
    const page: DeezerList<DeezerTrackJson> = await fetchJson(url);
    if (page.error?.message) {
      throw new Error(page.error.message);
    }
    for (const raw of page.data ?? []) {
      const track = toTrack(raw);
      if (track) collected.push(track);
    }
    url = page.next;
  }
  return uniqueSongs(collected);
}

async function tracksFromPlaylistSearch(query: string, minCount: number) {
  const search: DeezerList<DeezerPlaylist> = await fetchJson(
    `https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=8`
  );
  if (search.error?.message) {
    throw new Error(search.error.message);
  }
  // Prefer Deezer's own editorial playlists, then keep search relevance order.
  const playlists = [...(search.data ?? [])].sort((a, b) => {
    const aDeezer = /deezer/i.test(a.user?.name ?? "") ? 1 : 0;
    const bDeezer = /deezer/i.test(b.user?.name ?? "") ? 1 : 0;
    return bDeezer - aDeezer;
  });

  const merged: DeezerTrack[] = [];
  for (const playlist of playlists) {
    try {
      const batch = await collectTracks(
        `https://api.deezer.com/playlist/${playlist.id}/tracks?limit=100`,
        minCount
      );
      merged.push(...batch);
    } catch {
      continue; // one broken playlist shouldn't kill the category
    }
    const unique = uniqueSongs(merged);
    if (unique.length >= minCount) return unique;
  }
  return uniqueSongs(merged);
}

/** Load a pool of playable songs for one category and language. */
export async function loadCategoryTracks(
  category: CategoryId,
  language: Language,
  minCount: number
): Promise<DeezerTrack[]> {
  const q = QUERIES[category];
  if (q.en === q.fr) {
    return tracksFromPlaylistSearch(q.en, minCount);
  }
  if (language !== "both") {
    return tracksFromPlaylistSearch(q[language], minCount);
  }
  // Both languages: load each half and interleave them.
  const half = Math.ceil(minCount / 2) + 2;
  const [en, fr] = await Promise.all([
    tracksFromPlaylistSearch(q.en, half).catch(() => []),
    tracksFromPlaylistSearch(q.fr, half).catch(() => []),
  ]);
  const mixed: DeezerTrack[] = [];
  for (let i = 0; i < Math.max(en.length, fr.length); i++) {
    if (en[i]) mixed.push(en[i]);
    if (fr[i]) mixed.push(fr[i]);
  }
  return uniqueSongs(mixed);
}
