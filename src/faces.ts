/**
 * Famous faces: photos of well known people, blended two at a time.
 *
 * The list of names is ours. Photos come from Wikipedia's page summary and
 * must be hosted on Wikimedia Commons (free licences, reuse allowed with
 * credit). Fair use images that only live on Wikipedia are skipped.
 * Each photo comes with its credit line (author + licence) for the reveal.
 */

import type { FaceGroup, Language } from "./types";

export type Face = { name: string; imageUrl: string; credit: string; group: FaceGroup };

type Person = { title: string; fr?: boolean; group?: FaceGroup };

/** English Wikipedia page titles. fr = French personality. */
const PEOPLE: Record<FaceGroup, Person[]> = {
  music: [
    { title: "Beyoncé" }, { title: "Madonna" }, { title: "Michael Jackson" },
    { title: "Elvis Presley" }, { title: "Freddie Mercury" }, { title: "David Bowie" },
    { title: "Rihanna" }, { title: "Lady Gaga" }, { title: "Taylor Swift" },
    { title: "Ed Sheeran" }, { title: "Adele" }, { title: "Bruno Mars" },
    { title: "Elton John" }, { title: "Paul McCartney" }, { title: "John Lennon" },
    { title: "Mick Jagger" }, { title: "Bob Marley" }, { title: "Shakira" },
    { title: "Britney Spears" }, { title: "Justin Bieber" }, { title: "Billie Eilish" },
    { title: "Dua Lipa" }, { title: "Eminem" }, { title: "Snoop Dogg" },
    { title: "Prince (musician)" }, { title: "Whitney Houston" }, { title: "Céline Dion" },
    { title: "Stevie Wonder" }, { title: "Tina Turner" }, { title: "Ariana Grande" },
    { title: "Harry Styles" }, { title: "Kylie Minogue" }, { title: "Bob Dylan" },
    { title: "Jimi Hendrix" }, { title: "Kurt Cobain" }, { title: "Amy Winehouse" },
    { title: "Frank Sinatra" }, { title: "Dolly Parton" }, { title: "Cher" },
    { title: "Johnny Hallyday", fr: true }, { title: "Édith Piaf", fr: true },
    { title: "Charles Aznavour", fr: true }, { title: "Serge Gainsbourg", fr: true },
    { title: "Jacques Brel", fr: true }, { title: "Stromae", fr: true },
    { title: "Mylène Farmer", fr: true }, { title: "Aya Nakamura", fr: true },
    { title: "Jean-Jacques Goldman", fr: true }, { title: "Zaz (singer)", fr: true },
    { title: "Angèle (singer)", fr: true }, { title: "Orelsan", fr: true },
    { title: "Michel Sardou", fr: true }, { title: "Sylvie Vartan", fr: true },
    { title: "Claude François", fr: true }, { title: "Patrick Bruel", fr: true },
    { title: "Gims", fr: true }, { title: "Indila", fr: true },
    { title: "Christine and the Queens", fr: true }, { title: "Vianney (singer)", fr: true },
  ],
  screen: [
    { title: "Leonardo DiCaprio" }, { title: "Brad Pitt" }, { title: "Angelina Jolie" },
    { title: "Tom Cruise" }, { title: "Meryl Streep" }, { title: "Will Smith" },
    { title: "Scarlett Johansson" }, { title: "Johnny Depp" }, { title: "Julia Roberts" },
    { title: "Morgan Freeman" }, { title: "Keanu Reeves" }, { title: "Dwayne Johnson" },
    { title: "Jennifer Lawrence" }, { title: "Robert Downey Jr." }, { title: "Tom Hanks" },
    { title: "Nicole Kidman" }, { title: "Margot Robbie" }, { title: "Zendaya" },
    { title: "Denzel Washington" }, { title: "Arnold Schwarzenegger" }, { title: "Marilyn Monroe" },
    { title: "Audrey Hepburn" }, { title: "Charlie Chaplin" }, { title: "Sylvester Stallone" },
    { title: "Emma Watson" }, { title: "Daniel Radcliffe" }, { title: "Ryan Gosling" },
    { title: "Hugh Jackman" }, { title: "Jackie Chan" }, { title: "Oprah Winfrey" },
    { title: "Omar Sy", fr: true }, { title: "Marion Cotillard", fr: true },
    { title: "Jean Dujardin", fr: true }, { title: "Audrey Tautou", fr: true },
    { title: "Catherine Deneuve", fr: true }, { title: "Brigitte Bardot", fr: true },
    { title: "Alain Delon", fr: true }, { title: "Louis de Funès", fr: true },
    { title: "Sophie Marceau", fr: true }, { title: "Jean Reno", fr: true },
    { title: "Vincent Cassel", fr: true }, { title: "Léa Seydoux", fr: true },
    { title: "Juliette Binoche", fr: true }, { title: "Isabelle Adjani", fr: true },
    { title: "Jamel Debbouze", fr: true }, { title: "Dany Boon", fr: true },
    { title: "Eva Green", fr: true }, { title: "Timothée Chalamet", fr: true },
  ],
  sport: [
    { title: "Lionel Messi" }, { title: "Cristiano Ronaldo" }, { title: "Serena Williams" },
    { title: "Roger Federer" }, { title: "Usain Bolt" }, { title: "Michael Jordan" },
    { title: "LeBron James" }, { title: "Rafael Nadal" }, { title: "Novak Djokovic" },
    { title: "Neymar" }, { title: "David Beckham" }, { title: "Muhammad Ali" },
    { title: "Tiger Woods" }, { title: "Lewis Hamilton" }, { title: "Simone Biles" },
    { title: "Mike Tyson" }, { title: "Michael Phelps" }, { title: "Pelé" },
    { title: "Diego Maradona" }, { title: "Zinedine Zidane", fr: true },
    { title: "Kylian Mbappé", fr: true }, { title: "Antoine Griezmann", fr: true },
    { title: "Tony Parker", fr: true }, { title: "Teddy Riner", fr: true },
    { title: "Léon Marchand", fr: true }, { title: "Victor Wembanyama", fr: true },
    { title: "Thierry Henry", fr: true }, { title: "Karim Benzema", fr: true },
    { title: "Yannick Noah", fr: true }, { title: "Sébastien Loeb", fr: true },
  ],
};

export const USER_AGENT = "Geekasong/1.0 ( https://geekasong.com )";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type Summary = {
  title?: string;
  type?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string; width?: number };
};

/** "Prince (musician)" -> "Prince" */
function displayName(title: string) {
  return title.replace(/\s*\(.*?\)\s*$/, "").trim();
}

/** "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/File.jpg/320px-File.jpg" -> "File.jpg" */
function commonsFileName(url: string): string | null {
  const m = url.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Look up one person: photo on Commons or nothing. */
async function lookUp(
  person: Person
): Promise<{ name: string; imageUrl: string; file: string; group: FaceGroup } | null> {
  const s = await getJson<Summary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(person.title.replace(/ /g, "_"))}`
  );
  const thumb = s?.thumbnail?.source;
  if (!s || s.type === "disambiguation" || !thumb) return null;
  const file = commonsFileName(thumb);
  if (!file) return null; // not on Commons (e.g. fair use): skip
  // Prefer a sharp photo: the original if it's small, else the 960px size
  // (a standard Wikimedia size; the photo route falls back to 330px if refused).
  const original = s.originalimage;
  const imageUrl =
    original?.source && (original.width ?? 0) > 0 && (original.width ?? 0) <= 1100
      ? original.source
      : thumb.replace(/\/\d+px-/, "/960px-");
  return { name: displayName(s.title ?? person.title), imageUrl, file, group: person.group ?? "music" };
}

/** Author and licence for each Commons file, in one request. */
async function credits(files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const titles = batch.map((f) => `File:${f}`).join("|");
    const data = await getJson<{
      query?: {
        normalized?: { from: string; to: string }[];
        pages?: Record<string, {
          title?: string;
          imageinfo?: { extmetadata?: Record<string, { value?: string }> }[];
        }>;
      };
    }>(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(titles)}`
    );
    const back = new Map<string, string>();
    for (const n of data?.query?.normalized ?? []) back.set(n.to, n.from);
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!page.title || !meta) continue;
      const artist = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
      const licence = stripHtml(meta.LicenseShortName?.value ?? "");
      const requested = (back.get(page.title) ?? page.title).replace(/^File:/, "");
      out.set(requested.replace(/ /g, "_"), `${artist}${licence ? `, ${licence}` : ""}`);
    }
  }
  return out;
}

/**
 * Pick `count` people with a usable photo.
 * English: international names. French: French names first, topped up with
 * international ones. Both: everyone.
 */
export async function loadFaces(
  groups: FaceGroup[],
  language: Language,
  count: number
): Promise<Face[]> {
  const pool = groups.flatMap((g) => (PEOPLE[g] ?? []).map((p) => ({ ...p, group: g })));
  const intl = pool.filter((p) => !p.fr);
  const french = pool.filter((p) => p.fr);
  const ordered =
    language === "en"
      ? shuffle(intl)
      : language === "fr"
        ? [...shuffle(french), ...shuffle(intl)]
        : shuffle(pool);

  // Look up a few more than needed: some pages have no free photo.
  const candidates = ordered.slice(0, Math.ceil(count * 1.5) + 4);
  const found: { name: string; imageUrl: string; file: string; group: FaceGroup }[] = [];
  for (let i = 0; i < candidates.length && found.length < count; i += 8) {
    const batch = await Promise.all(candidates.slice(i, i + 8).map(lookUp));
    for (const f of batch) if (f && found.length < count) found.push(f);
  }

  const creditMap = await credits(found.map((f) => f.file));
  return shuffle(
    found.map((f) => ({
      name: f.name,
      imageUrl: f.imageUrl,
      credit: creditMap.get(f.file.replace(/ /g, "_")) ?? "Wikimedia Commons",
      group: f.group,
    }))
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Photos go through our own server: /face/<code>. Hides the file name too. */
export function proxied(url: string) {
  return `/face/${btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** Worker side of the photo proxy: only Wikimedia images, cached for a week. */
export async function servePhoto(path: string): Promise<Response> {
  let url: string;
  try {
    const code = path.slice("/face/".length).replace(/-/g, "+").replace(/_/g, "/");
    url = atob(code + "=".repeat((4 - (code.length % 4)) % 4));
  } catch {
    return new Response("Bad photo", { status: 400 });
  }
  // Wikimedia serves photos from upload.wikimedia.org and thumb.wikimedia.org.
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return new Response("Bad photo", { status: 400 });
  }
  if (url.slice(0, 8) !== "https://" || !/^(upload|thumb)\.wikimedia\.org$/.test(host)) {
    return new Response("Not allowed", { status: 403 });
  }
  const get = async (u: string) => {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
        cf: { cacheEverything: true, cacheTtl: 604800 },
      } as RequestInit);
      return r.ok ? r : null;
    } catch {
      return null;
    }
  };
  let res = await get(url);
  // Big size refused? Try Wikipedia's standard 330px thumbnail instead.
  const small = url.replace(/\/960px-/, "/330px-");
  if (!res && small !== url) res = await get(small);
  // Still nothing: let the phone load it straight from Wikimedia.
  if (!res) return Response.redirect(small, 302);
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=604800",
    },
  });
}

/**
 * Diagnostic page: /face-debug
 * Shows what Wikipedia and Wikimedia answer our server for one famous person.
 */
export async function photoDebug(): Promise<Response> {
  const report: Record<string, unknown> = {};
  const summaryUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/Beyonc%C3%A9";
  try {
    const r = await fetch(summaryUrl, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    report.summaryStatus = r.status;
    const data = (await r.json()) as { thumbnail?: { source?: string } };
    report.thumbnail = data.thumbnail?.source ?? null;
    if (data.thumbnail?.source) {
      const img = await fetch(data.thumbnail.source, { headers: { "User-Agent": USER_AGENT, Accept: "image/*" } });
      report.imageStatus = img.status;
      report.imageType = img.headers.get("Content-Type");
      if (!img.ok) report.imageBody = (await img.text()).slice(0, 300);
      report.proxiedPath = proxied(data.thumbnail.source);
    }
  } catch (err) {
    report.error = String(err);
  }
  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
