// Shared types for the lobby and gameplay (client and PartyKit server).

export type Player = {
  id: string;
  name: string;
  score: number;
};

export const GAME_MODES = [
  { id: "blindtest", label: "Blind test", ready: true },
  { id: "year", label: "Find the year", ready: true },
  { id: "word", label: "Song with a word", ready: true },
  { id: "mashup", label: "Mashup (2 songs)", ready: true },
  { id: "faces", label: "Famous faces", ready: true },
  { id: "mix", label: "Mixed game", ready: true },
] as const;
export type GameMode = (typeof GAME_MODES)[number]["id"];
/** What a single round is. A mixed game rotates through all of them. */
export type RoundKind = Exclude<GameMode, "mix">;
export const MIX_ORDER: RoundKind[] = ["blindtest", "year", "faces", "mashup", "word"];

/** Famous faces: who can show up. */
export const FACE_GROUPS = [
  { id: "music", label: "Music stars" },
  { id: "screen", label: "Film & TV" },
  { id: "sport", label: "Sport" },
] as const;
export type FaceGroup = (typeof FACE_GROUPS)[number]["id"];

/** Famous faces hints: what each group is known for. */
export const FACE_KIND: Record<FaceGroup, string> = {
  music: "🎤 Music star",
  screen: "🎬 Film & TV",
  sport: "⚽ Athlete",
};
/** Famous faces: seconds into the round before each hint shows. */
export const HINT_KIND_MS = 8_000;
export const HINT_INITIALS_MS = 18_000;

/** "Lionel Messi" -> "L. M.", "Beyoncé" -> "B." */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ");
}

/** A famous person as shown at the reveal. */
export type Person = { name: string; imageUrl: string; credit: string };

/** Custom buzzer recordings: max size of the data URL (about 2 to 3 seconds). */
export const MAX_CLIP_CHARS = 200_000;

/** Song with a word: seconds the others get to vote. */
export const VOTE_MS = 15_000;

/** Find the year: points by how close the guess is. */
export function yearPoints(guess: number | null, actual: number) {
  if (guess === null) return 0;
  const diff = Math.abs(guess - actual);
  if (diff === 0) return 3;
  if (diff <= 2) return 2;
  if (diff <= 5) return 1;
  return 0;
}
export const YEAR_MIN = 1930;

/** How the group plays: buzzers on phones, or everyone around one device. */
export const PLAY_STYLES = [
  { id: "buzzers", label: "Phone buzzers", hint: "Everyone joins with the code and buzzes on their phone" },
  { id: "device", label: "One device only", hint: "Nobody joins. Shout the answer, the host gives the point" },
] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number]["id"];

export const LOCAL_PREFIX = "local:";

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "both", label: "Both" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];

export const CATEGORY_GROUPS = ["Decades", "Pop & party", "Rock & metal", "Urban", "Dance & electro", "World & roots", "Screen & fun"] as const;

export const CATEGORIES = [
  { id: "50s", label: "50s", group: "Decades" },
  { id: "60s", label: "60s", group: "Decades" },
  { id: "70s", label: "70s", group: "Decades" },
  { id: "80s", label: "80s", group: "Decades" },
  { id: "90s", label: "90s", group: "Decades" },
  { id: "2000s", label: "2000s", group: "Decades" },
  { id: "2010s", label: "2010s", group: "Decades" },
  { id: "2020s", label: "2020s", group: "Decades" },
  { id: "hits", label: "Top hits now", group: "Pop & party" },
  { id: "pop", label: "Pop", group: "Pop & party" },
  { id: "variete", label: "Variété française", group: "Pop & party" },
  { id: "chanson", label: "Chanson française", group: "Pop & party" },
  { id: "party", label: "Party anthems", group: "Pop & party" },
  { id: "summer", label: "Summer hits", group: "Pop & party" },
  { id: "onehit", label: "One hit wonders", group: "Pop & party" },
  { id: "boybands", label: "Boy & girl bands", group: "Pop & party" },
  { id: "eurovision", label: "Eurovision", group: "Pop & party" },
  { id: "kpop", label: "K-pop", group: "Pop & party" },
  { id: "classicrock", label: "Classic rock", group: "Rock & metal" },
  { id: "rock", label: "Rock", group: "Rock & metal" },
  { id: "hardrock", label: "Hard rock", group: "Rock & metal" },
  { id: "metal", label: "Metal", group: "Rock & metal" },
  { id: "numetal", label: "Nu metal", group: "Rock & metal" },
  { id: "punk", label: "Punk", group: "Rock & metal" },
  { id: "grunge", label: "Grunge", group: "Rock & metal" },
  { id: "indie", label: "Indie & alternative", group: "Rock & metal" },
  { id: "rap", label: "Rap & hip hop", group: "Urban" },
  { id: "rnb", label: "R&B", group: "Urban" },
  { id: "soul", label: "Soul & Motown", group: "Urban" },
  { id: "funk", label: "Funk", group: "Urban" },
  { id: "reggae", label: "Reggae", group: "Urban" },
  { id: "afro", label: "Afro", group: "Urban" },
  { id: "disco", label: "Disco", group: "Dance & electro" },
  { id: "dance", label: "Dance", group: "Dance & electro" },
  { id: "house", label: "House", group: "Dance & electro" },
  { id: "electro", label: "Electro", group: "Dance & electro" },
  { id: "latin", label: "Latin", group: "World & roots" },
  { id: "portuguese", label: "Portuguese", group: "World & roots" },
  { id: "jazz", label: "Jazz", group: "World & roots" },
  { id: "blues", label: "Blues", group: "World & roots" },
  { id: "country", label: "Country", group: "World & roots" },
  { id: "folk", label: "Folk", group: "World & roots" },
  { id: "classical", label: "Classical", group: "World & roots" },
  { id: "movies", label: "Movie songs", group: "Screen & fun" },
  { id: "filmscores", label: "Film scores", group: "Screen & fun" },
  { id: "tv", label: "TV series themes", group: "Screen & fun" },
  { id: "cartoons", label: "Cartoon themes", group: "Screen & fun" },
  { id: "kids", label: "Kids & Disney", group: "Screen & fun" },
  { id: "musicals", label: "Musicals", group: "Screen & fun" },
  { id: "games", label: "Video games", group: "Screen & fun" },
  { id: "christmas", label: "Christmas", group: "Screen & fun" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Buzzer sounds the host can pick from (generated in the browser). */
export const BUZZ_SOUNDS = [
  { id: "airhorn", label: "Airhorn" },
  { id: "scratch", label: "Record scratch" },
  { id: "gameshow", label: "Game show" },
] as const;
export type BuzzSound = (typeof BUZZ_SOUNDS)[number]["id"];

export const ROUND_OPTIONS = [5, 10, 15, 20, 30] as const;
export type RoundCount = (typeof ROUND_OPTIONS)[number];

/**
 * lobby    waiting room
 * loading  fetching songs
 * playing  music on, everyone can buzz
 * buzzed   someone buzzed, music paused, they shout their answer
 * reveal   answer on screen, host picks who got it
 * finished podium
 */
export type Phase =
  | "lobby"
  | "loading"
  | "playing"
  | "buzzed"
  | "reveal"
  | "finished";

export type Song = { title: string; artist: string; coverUrl: string };

export type RevealInfo = {
  title: string;
  artist: string;
  coverUrl: string;
  /** Mashup only: the second song. */
  second?: Song;
  /** Famous faces only: the two people, with photo credits. */
  people?: Person[];
  /** Song with a word only. */
  word?: string;
  /** Song with a word: who scored by vote (null = nobody, host picks). */
  scorerName?: string | null;
  /** Find the year only. */
  year?: number;
  /** Find the year only: everyone's guess and points, closest first. */
  guesses?: { id: string; name: string; guess: number | null; points: number }[];
};

/** Snapshot pushed to every connection. */
export type StateMessage = {
  type: "state";
  phase: Phase;
  players: Player[];
  hostId: string | null;
  roundIndex: number;
  totalRounds: number;
  /** When the song stops on its own (only while playing). */
  endsAt: number | null;
  /** Time left when the music was paused by a buzz. */
  pausedRemainingMs: number | null;
  /** Who buzzed (during "buzzed", and kept for "reveal"). */
  buzzerId: string | null;
  /** Players who gave a wrong answer this song and can't buzz again. */
  lockedIds: string[];
  /** Who won the previous song (null = nobody). */
  lastAward: { round: number; name: string | null; points?: number } | null;
  buzzSound: BuzzSound;
  /** Kind of the current round (in a mixed game it changes every round). */
  mode: RoundKind;
  gameMode: GameMode;
  /** Famous faces: the two photos to blend (no names until the reveal). */
  faces?: string[];
  /** Famous faces: hints, shown a few seconds into the round. */
  faceHints?: { kind: string; initials: string }[];
  /** Players who recorded their own buzzer sound. */
  customBuzzIds: string[];
  /** Song with a word: the word, shown to everyone during the round. */
  word?: string;
  /** Song with a word: live vote on the buzzer's song. */
  vote?: { yes: number; no: number; voterIds: string[]; votedIds: string[]; endsAt: number };
  /** Find the year: who has locked in a guess this song (not what they guessed). */
  guessedIds: string[];
  error: string | null;
  reveal?: RevealInfo;
  /** Only the host gets the audio link, so nobody can peek at it. */
  host?: { previewUrl: string; previewUrl2?: string };
};

/** Sent to the host only: someone's recorded buzzer (null = removed). */
export type ClipMessage = { type: "clip"; playerId: string; dataUrl: string | null };

export type ServerMessage = StateMessage | ClipMessage;

export type ClientMessage =
  | {
      type: "start";
      categories: CategoryId[];
      rounds: RoundCount;
      language: Language;
      buzzSound: BuzzSound;
      mode: GameMode;
      faceGroups: FaceGroup[];
    }
  | { type: "setBuzz"; dataUrl: string | null }
  | { type: "guess"; year: number }
  | { type: "vote"; yes: boolean }
  | { type: "judge"; valid: boolean }
  | { type: "awardMashup"; first: string | null; second: string | null }
  | { type: "next" }
  | { type: "hostJoin"; name: string }
  | { type: "hostLeave" }
  | { type: "addLocal"; name: string }
  | { type: "removeLocal"; playerId: string }
  | { type: "buzz" }
  | { type: "wrong" }
  | { type: "reveal" }
  | { type: "award"; playerId: string | null }
  | { type: "playAgain" };

/** Deezer previews are 30 seconds long. */
export const ROUND_MS = 30_000;
