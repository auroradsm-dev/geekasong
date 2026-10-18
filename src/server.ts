import {
  routePartykitRequest,
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { loadCategoryTracks, type DeezerTrack } from "./deezer";
import { originalYear } from "./years";
import {
  BUZZ_SOUNDS,
  CATEGORIES,
  LOCAL_PREFIX,
  LANGUAGES,
  ROUND_MS,
  ROUND_OPTIONS,
  YEAR_MIN,
  yearPoints,
  type BuzzSound,
  type CategoryId,
  type ClientMessage,
  type GameMode,
  type RevealInfo,
  type Language,
  type Phase,
  type Player,
  type RoundCount,
  type StateMessage,
} from "./types";

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
const LANGUAGE_IDS = new Set<string>(LANGUAGES.map((l) => l.id));
const SOUND_IDS = new Set<string>(BUZZ_SOUNDS.map((s) => s.id));

/**
 * One PartyKit room = one game.
 * The host device plays the music and runs the game; players buzz from phones.
 * The server decides who buzzed first (first message to arrive wins).
 */
type Env = {
  Main: DurableObjectNamespace<BlindTestServer>;
};

export class BlindTestServer extends Server<Env> {
  players = new Map<string, Player>();
  /** Scores of players who dropped out (phone locked), restored on reconnect. */
  pastScores = new Map<string, number>();
  hostId: string | null = null;

  phase: Phase = "lobby";
  error: string | null = null;
  roundIndex = 0;
  totalRounds = 10;
  roundTracks: DeezerTrack[] = [];

  endsAt: number | null = null;
  pausedRemainingMs: number | null = null;
  buzzerId: string | null = null;
  lockedIds = new Set<string>();
  lastAward: StateMessage["lastAward"] = null;
  buzzSound: BuzzSound = "airhorn";

  mode: GameMode = "blindtest";
  /** Find the year: the original year of each round's song. */
  roundYears: number[] = [];
  /** Find the year: guesses for the current song. */
  guesses = new Map<string, number>();
  yearReveal: RevealInfo["guesses"] = undefined;
  /** Find the year: years are looked up in the background while we play. */
  yearsDone = true;
  waitingForSong = false;
  /** Bumped on every new game so old background work stops. */
  gameId = 0;
  roundTimer: ReturnType<typeof setTimeout> | null = null;

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const role = url.searchParams.get("role") ?? "player";
    const name = (url.searchParams.get("name") ?? "").trim().slice(0, 20);

    // Whoever opens the host screen is the host (a refreshed host takes over).
    if (role === "host") {
      this.hostId = conn.id;
    } else {
      // Keep the score if the same phone reconnects (same id).
      this.players.set(conn.id, {
        id: conn.id,
        name: name || "Player",
        score: this.pastScores.get(conn.id) ?? 0,
      });
    }
    this.push();
  }

  onClose(conn: Connection) {
    if (this.hostId === conn.id) {
      this.hostId = null;
    }
    const leaving = this.players.get(conn.id);
    if (leaving) {
      this.pastScores.set(conn.id, leaving.score);
      this.players.delete(conn.id);
      this.lockedIds.delete(conn.id);
      // If the person who buzzed leaves, carry on playing.
      if (this.phase === "buzzed" && this.buzzerId === conn.id) {
        this.resume();
        return;
      }
    }
    this.push();
  }

  async onMessage(sender: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: ClientMessage;
    try {
      data = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }
    const isHost = sender.id === this.hostId;

    switch (data.type) {
      case "hostJoin": {
        // The host can play too: their device becomes a player as well.
        const name = (data.name ?? "").trim().slice(0, 20);
        if (isHost && name) {
          this.players.set(sender.id, {
            id: sender.id,
            name,
            score:
              this.players.get(sender.id)?.score ??
              this.pastScores.get(sender.id) ??
              0,
          });
          this.push();
        }
        break;
      }
      case "hostLeave":
        if (isHost && this.players.delete(sender.id)) this.push();
        break;
      case "addLocal": {
        // Players typed in by the host (one device mode). They have no phone.
        const name = (data.name ?? "").trim().slice(0, 20);
        if (isHost && name && this.players.size < 20) {
          const id = LOCAL_PREFIX + Math.random().toString(36).slice(2, 10);
          this.players.set(id, { id, name, score: 0 });
          this.push();
        }
        break;
      }
      case "removeLocal":
        if (isHost && data.playerId.startsWith(LOCAL_PREFIX)) {
          this.players.delete(data.playerId);
          this.push();
        }
        break;
      case "buzz":
        this.buzz(sender.id); // anyone in the player list, host included
        break;
      case "start":
        if (isHost) {
          if (SOUND_IDS.has(data.buzzSound)) this.buzzSound = data.buzzSound;
          this.mode = data.mode === "year" ? "year" : "blindtest";
          await this.startGame(data.categories, data.rounds, data.language);
        }
        break;
      case "wrong":
        if (isHost && this.phase === "buzzed" && this.buzzerId) {
          this.lockedIds.add(this.buzzerId);
          this.resume();
        }
        break;
      case "reveal":
        if (isHost && (this.phase === "playing" || this.phase === "buzzed")) {
          this.showReveal();
        }
        break;
      case "award":
        if (isHost) this.award(data.playerId);
        break;
      case "guess":
        this.takeGuess(sender.id, data.year);
        break;
      case "next":
        if (isHost && this.phase === "reveal") this.nextFromReveal();
        break;
      case "playAgain":
        if (isHost) this.playAgain();
        break;
    }
  }

  /* ---------------- game flow ---------------- */

  private async startGame(
    categories: CategoryId[],
    rounds: RoundCount,
    language: Language
  ) {
    if (this.phase !== "lobby" && this.phase !== "finished") return;
    const picked = [...new Set(categories ?? [])].filter((c) =>
      CATEGORY_IDS.has(c)
    );
    if (picked.length === 0) return this.fail("Pick at least one category.");
    if (!(ROUND_OPTIONS as readonly number[]).includes(rounds)) return;
    if (!LANGUAGE_IDS.has(language)) return;
    if (this.players.size === 0) return this.fail("Wait for at least one player.");

    this.error = null;
    this.phase = "loading";
    this.gameId += 1;
    const gameId = this.gameId;
    this.roundIndex = 0;
    this.lastAward = null;
    this.pastScores.clear();
    for (const p of this.players.values()) p.score = 0;
    this.push();

    try {
      // Find the year needs spares: some songs have no known year.
      const wanted = this.mode === "year" ? rounds + 10 : rounds;
      const perCategory = Math.ceil(wanted / picked.length) + 2;
      const results = await Promise.allSettled(
        picked.map((c) => loadCategoryTracks(c, language, perCategory))
      );
      const pools = results
        .map((r) => (r.status === "fulfilled" ? shuffle(r.value) : []))
        .filter((pool) => pool.length > 0);
      if (pools.length === 0) {
        throw new Error("Could not load songs. Try other categories.");
      }

      // Deal songs round robin across categories, never the same song twice.
      const used = new Set<string>();
      const cursors = pools.map(() => 0);
      const tracks: DeezerTrack[] = [];
      let i = 0;
      let misses = 0;
      while (tracks.length < wanted && misses < pools.length) {
        const p = i % pools.length;
        i += 1;
        const pool = pools[p];
        while (cursors[p] < pool.length && used.has(songKey(pool[cursors[p]]))) {
          cursors[p] += 1;
        }
        if (cursors[p] >= pool.length) {
          misses += 1;
          continue;
        }
        misses = 0;
        const track = pool[cursors[p]];
        cursors[p] += 1;
        used.add(songKey(track));
        tracks.push(track);
      }

      if (gameId !== this.gameId) return; // game was reset meanwhile

      if (this.mode === "year") {
        // Start as soon as the first song's year is known; the rest are
        // looked up in the background while people play.
        this.roundTracks = [];
        this.roundYears = [];
        this.totalRounds = Math.min(rounds, tracks.length);
        this.yearsDone = false;
        this.waitingForSong = true;
        void this.lookUpYears(tracks, rounds, gameId);
        return;
      }

      this.roundTracks = tracks;
      this.totalRounds = tracks.length;
      this.beginRound();
    } catch (err) {
      this.phase = "lobby";
      this.fail(err instanceof Error ? err.message : "Could not load songs.");
    }
  }

  /** Background worker: find each song's original year, keep the ones we know. */
  private async lookUpYears(candidates: DeezerTrack[], rounds: number, gameId: number) {
    for (const track of candidates) {
      if (gameId !== this.gameId || this.roundTracks.length >= rounds) break;
      const year = await originalYear(track);
      if (gameId !== this.gameId) return;
      if (year === null) continue;
      this.roundTracks.push(track);
      this.roundYears.push(year);
      if (this.waitingForSong) this.beginRound();
    }
    if (gameId !== this.gameId) return;
    this.yearsDone = true;
    if (this.roundTracks.length < this.totalRounds) {
      this.totalRounds = this.roundTracks.length;
    }
    if (this.waitingForSong) this.beginRound();
  }

  private beginRound() {
    // Find the year: the next song's year may still be on its way.
    if (this.mode === "year" && !this.roundTracks[this.roundIndex]) {
      if (!this.yearsDone) {
        this.waitingForSong = true;
        if (this.phase !== "loading") {
          this.phase = "loading";
          this.push();
        }
        return;
      }
      this.waitingForSong = false;
      if (this.roundTracks.length === 0) {
        this.phase = "lobby";
        this.fail("Couldn't find release years for those songs. Try other music.");
      } else {
        this.finish();
      }
      return;
    }
    this.waitingForSong = false;
    this.guesses.clear();
    this.yearReveal = undefined;
    this.phase = "playing";
    this.buzzerId = null;
    this.lockedIds.clear();
    this.pausedRemainingMs = null;
    this.startTimer(ROUND_MS);
    this.push();
  }

  /** First buzz wins: pause the clock and hand over to that player. */
  private buzz(playerId: string) {
    if (this.phase !== "playing" || this.mode !== "blindtest") return;
    if (!this.players.has(playerId) || this.lockedIds.has(playerId)) return;

    this.pausedRemainingMs = Math.max(0, (this.endsAt ?? Date.now()) - Date.now());
    this.clearTimer();
    this.endsAt = null;
    this.buzzerId = playerId;
    this.phase = "buzzed";
    this.push();
  }

  /** Wrong answer (or the buzzer left): music back on for everyone else. */
  private resume() {
    this.buzzerId = null;
    const everyoneLocked = [...this.players.keys()].every((id) =>
      this.lockedIds.has(id)
    );
    if (everyoneLocked || (this.pausedRemainingMs ?? 0) <= 0) {
      this.showReveal();
      return;
    }
    this.phase = "playing";
    this.startTimer(this.pausedRemainingMs ?? ROUND_MS);
    this.pausedRemainingMs = null;
    this.push();
  }

  /** Find the year: one locked in guess per player per song. */
  private takeGuess(playerId: string, year: number) {
    if (this.phase !== "playing" || this.mode !== "year") return;
    if (!this.players.has(playerId) || this.guesses.has(playerId)) return;
    if (!Number.isFinite(year)) return;
    const max = new Date().getFullYear();
    this.guesses.set(playerId, Math.min(max, Math.max(YEAR_MIN, Math.round(year))));

    // Everyone with a phone has answered: no need to wait for the clock.
    const phones = [...this.players.keys()].filter((id) => !id.startsWith(LOCAL_PREFIX));
    if (phones.length > 0 && phones.every((id) => this.guesses.has(id))) {
      this.showReveal();
    } else {
      this.push();
    }
  }

  private showReveal() {
    this.clearTimer();
    this.endsAt = null;
    this.pausedRemainingMs = null;
    this.phase = "reveal";

    if (this.mode === "year") {
      const actual = this.roundYears[this.roundIndex];
      this.yearReveal = [...this.players.values()]
        .filter((p) => !p.id.startsWith(LOCAL_PREFIX) || this.guesses.has(p.id))
        .map((p) => {
          const guess = this.guesses.get(p.id) ?? null;
          const points = yearPoints(guess, actual);
          p.score += points;
          return { id: p.id, name: p.name, guess, points };
        })
        .sort(
          (a, b) =>
            b.points - a.points ||
            Math.abs((a.guess ?? -9999) - actual) - Math.abs((b.guess ?? -9999) - actual)
        );
    }
    this.push();
  }

  /** Find the year: host taps Next after the reveal. */
  private nextFromReveal() {
    const best = this.yearReveal?.[0];
    this.lastAward = {
      round: this.roundIndex,
      name: best && best.points > 0 ? best.name : null,
      points: best?.points,
    };
    this.advance();
  }

  private advance() {
    if (this.roundIndex + 1 >= this.totalRounds) {
      this.finish();
      return;
    }
    this.roundIndex += 1;
    this.beginRound();
  }

  private finish() {
    this.clearTimer();
    this.phase = "finished";
    this.push();
  }

  private award(playerId: string | null) {
    if (this.phase !== "reveal") return;
    const winner = playerId ? this.players.get(playerId) : undefined;
    if (winner) winner.score += 1;
    this.lastAward = { round: this.roundIndex, name: winner?.name ?? null };
    this.advance();
  }

  private playAgain() {
    this.clearTimer();
    this.gameId += 1; // stops any background year lookups
    this.roundYears = [];
    this.guesses.clear();
    this.yearReveal = undefined;
    this.yearsDone = true;
    this.waitingForSong = false;
    this.phase = "lobby";
    this.error = null;
    this.roundIndex = 0;
    this.roundTracks = [];
    this.endsAt = null;
    this.pausedRemainingMs = null;
    this.buzzerId = null;
    this.lockedIds.clear();
    this.lastAward = null;
    this.pastScores.clear();
    for (const p of this.players.values()) p.score = 0;
    this.push();
  }

  /* ---------------- helpers ---------------- */

  private fail(message: string) {
    this.error = message;
    this.push();
  }

  private startTimer(ms: number) {
    this.clearTimer();
    this.endsAt = Date.now() + ms;
    this.roundTimer = setTimeout(() => {
      if (this.phase === "playing") this.showReveal();
    }, ms);
  }

  private clearTimer() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  /** Everyone gets the same snapshot, except only the host gets the audio link. */
  private push() {
    const track = this.roundTracks[this.roundIndex];
    const inRound =
      this.phase === "playing" || this.phase === "buzzed" || this.phase === "reveal";

    const base: StateMessage = {
      type: "state",
      phase: this.phase,
      players: [...this.players.values()],
      hostId: this.hostId,
      roundIndex: this.roundIndex,
      totalRounds: this.totalRounds,
      endsAt: this.endsAt,
      pausedRemainingMs: this.pausedRemainingMs,
      buzzerId: this.buzzerId,
      lockedIds: [...this.lockedIds],
      lastAward: this.lastAward,
      buzzSound: this.buzzSound,
      mode: this.mode,
      guessedIds: [...this.guesses.keys()],
      error: this.error,
    };
    if (this.phase === "reveal" && track) {
      base.reveal = {
        title: track.title,
        artist: track.artist,
        coverUrl: track.coverUrl,
      };
      if (this.mode === "year") {
        base.reveal.year = this.roundYears[this.roundIndex];
        base.reveal.guesses = this.yearReveal;
      }
    }

    for (const conn of this.getConnections()) {
      const payload: StateMessage = { ...base };
      if (conn.id === this.hostId && inRound && track) {
        payload.host = { previewUrl: track.previewUrl };
      }
      conn.send(JSON.stringify(payload));
    }
  }
}

/** Worker entry: game rooms live at /parties/main/<ROOM CODE>. Everything else is the website. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function songKey(t: DeezerTrack) {
  return `${t.artist}|${t.title}`.toLowerCase();
}
