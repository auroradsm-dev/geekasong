/**
 * Finds the ORIGINAL release year of a song.
 *
 * Deezer often has the date of a remaster or a compilation (Bohemian Rhapsody
 * shows up as 2011), so we ask MusicBrainz, the free open music database, for
 * every recording of that song by that artist and keep the earliest year.
 * Deezer's own date is the fallback when MusicBrainz knows nothing.
 *
 * MusicBrainz allows about 1 request per second, so calls are queued.
 */

import type { DeezerTrack } from "./deezer";

const USER_AGENT =
  "Geekasong/1.0 ( https://geekasong.com )";
const MIN_YEAR = 1900;

/* ---------------- polite MusicBrainz queue ---------------- */

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function mbFetch<T>(url: string): Promise<T | null> {
  const run = async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------- helpers ---------------- */

function yearOf(date: unknown): number | null {
  if (typeof date !== "string") return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  const max = new Date().getFullYear();
  return Number.isFinite(y) && y >= MIN_YEAR && y <= max ? y : null;
}

/** "Bohemian Rhapsody (Remastered 2011)" -> "bohemian rhapsody" */
export function cleanTitle(title: string) {
  return title
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s[-–]\s.*(remaster|version|edit|mix|live|mono|stereo|from).*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Lucene search needs quotes and special characters removed. */
function luceneSafe(s: string) {
  return s.replace(/[+\-!(){}[\]^"~*?:\\/]|&&|\|\|/g, " ").replace(/\s+/g, " ").trim();
}

/* ---------------- sources ---------------- */

type MbRecording = {
  title?: string;
  score?: number;
  "first-release-date"?: string;
  "artist-credit"?: { name?: string; artist?: { name?: string } }[];
  releases?: { date?: string }[];
};

/** Earliest year among MusicBrainz recordings of this title by this artist. */
async function musicBrainzYear(artist: string, title: string) {
  const t = cleanTitle(title);
  const query = `recording:"${luceneSafe(t)}" AND artist:"${luceneSafe(artist)}"`;
  const data = await mbFetch<{ recordings?: MbRecording[] }>(
    `https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=${encodeURIComponent(query)}`
  );
  const wantTitle = norm(t);
  const wantArtist = norm(artist);
  let best: number | null = null;

  for (const rec of data?.recordings ?? []) {
    if ((rec.score ?? 0) < 80) continue;
    const recTitle = norm(cleanTitle(rec.title ?? ""));
    if (recTitle !== wantTitle) continue;
    const credits = (rec["artist-credit"] ?? [])
      .map((c) => norm(c.name ?? c.artist?.name ?? ""))
      .join(" ");
    // "Queen" must appear in the credit; also accept "Queen & David Bowie".
    if (!credits) continue;
    if (!credits.includes(wantArtist) && !wantArtist.includes(credits)) continue;

    const years = [
      yearOf(rec["first-release-date"]),
      ...(rec.releases ?? []).map((r) => yearOf(r.date)),
    ].filter((y): y is number => y !== null);
    for (const y of years) {
      if (best === null || y < best) best = y;
    }
  }
  return best;
}

/** Deezer's release date for the track (often a remaster, so only a fallback). */
async function deezerYear(trackId: string) {
  try {
    const res = await fetch(`https://api.deezer.com/track/${trackId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { release_date?: string };
    return yearOf(data.release_date);
  } catch {
    return null;
  }
}

/**
 * Original release year, or null if nobody knows.
 * Takes the earliest of the MusicBrainz and Deezer answers.
 */
export async function originalYear(track: DeezerTrack): Promise<number | null> {
  const [mb, dz] = await Promise.all([
    musicBrainzYear(track.artist, track.title),
    deezerYear(track.id),
  ]);
  const candidates = [mb, dz].filter((y): y is number => y !== null);
  return candidates.length ? Math.min(...candidates) : null;
}
