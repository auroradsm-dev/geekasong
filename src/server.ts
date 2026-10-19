import {
  routePartykitRequest,
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { loadCategoryTracks, type DeezerTrack } from "./deezer";
import { originalYear } from "./years";
import { WORDS_EN, WORDS_FR } from "./words";
import { loadFaces, photoDebug, proxied, servePhoto, type Face } from "./faces";
import {
  BUZZ_SOUNDS,
  CATEGORIES,
  FACE_GROUPS,
  FACE_KIND,
  initials,
  GAME_MODES,
  LANGUAGES,
  LOCAL_PREFIX,
  MAX_CLIP_CHARS,
  MIX_ORDER,
  ROUND_MS,
  ROUND_OPTIONS,
  VOTE_MS,
  YEAR_MIN,
  yearPoints,
  type BuzzSound,
  type CategoryId,
  type ClientMessage,
  type FaceGroup,
  type GameMode,
  type Language,
  type Phase,
  type Player,
  type RevealInfo,
  type RoundCount,
  type RoundKind,
  type StateMessage,
} from "./types";

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
const LANGUAGE_IDS = new Set<string>(LANGUAGES.map((l) => l.id));
const SOUND_IDS = new Set<string>(BUZZ_SOUNDS.map((s) => s.id));
const MODE_IDS = new Set<string>(GAME_MODES.map((m) => m.id));
const FACE_GROUP_IDS = FACE_GROUPS.map((g) => g.id);
const MUSIC_KINDS = new Set<RoundKind>(["blindtest", "year", "mashup"]);

type Env = {
  Main: DurableObjectNamespace<BlindTestServer>;
};

/** One round of the game. A mixed game has rounds of different kinds. */
type Round = {
  kind: RoundKind;
  /** Blind test, Find the year, Mashup (first song). */
  track?: DeezerTrack;
  /** Mashup: the second song, played at the same time. */
  track2?: DeezerTrack;
  /** Song with a word. */
  word?: string;
  /** Famous faces: the two people blended together. */
  people?: Face[];
  /** Find the year: the original year once looked up. */
  year?: number;
  /** Find the year: resolves when the year lookup is done. */
  ready?: Promise<boolean>;
};

/**
 * One PartyKit room = one game.
 * The host device plays the music and runs the game; players buzz from phones.
 * The server decides who buzzed first (first message to arrive wins).
 */
export class BlindTestServer extends Server<Env> {
  players = new Map<string, Player>();
  /** Scores of players who dropped out (phone locked), restored on reconnect. */
  pastScores = new Map<string, number>();
  hostId: string | null = null;

  phase: Phase = "lobby";
  error: string | null = null;
  gameMode: GameMode = "blindtest";
  rounds: Round[] = [];
  roundIndex = 0;

  endsAt: number | null = null;
  pausedRemainingMs: number | null = null;
  buzzerId: string | null = null;
  lockedIds = new Set<string>();
  lastAward: StateMessage["lastAward"] = null;
  buzzSound: BuzzSound = "airhorn";

  /** Find the year. */
  guesses = new Map<string, number>();
  yearReveal: RevealInfo["guesses"] = undefined;

  /** Song with a word: who scored by vote this round (undefined = not decided). */
  wordScorer: string | null | undefined = undefined;
  voterIds: string[] = [];
  votes = new Map<string, boolean>();
  voteEndsAt: number | null = null;
  voteTimer: ReturnType<typeof setTimeout> | null = null;

  /** Recorded buzzer sounds (data URLs), by player id. */
  clips = new Map<string, string>();

  /** Bumped on every new game so old background work stops. */
  gameId = 0;
  roundTimer: ReturnType<typeof setTimeout> | null = null;

  get round(): Round | undefined {
    return this.rounds[this.roundIndex];
  }

  get kind(): RoundKind {
    return this.round?.kind ?? (this.gameMode === "mix" ? "blindtest" : this.gameMode);
  }

  /* ---------------- connections ---------------- */

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const role = url.searchParams.get("role") ?? "player";
    const name = (url.searchParams.get("name") ?? "").trim().slice(0, 20);

    // Whoever opens the host screen is the host (a refreshed host takes over).
    if (role === "host") {
      this.hostId = conn.id;
      // The host plays everyone's recorded buzzers: send them all.
      for (const [playerId, dataUrl] of this.clips) {
        conn.send(JSON.stringify({ type: "clip", playerId, dataUrl }));
      }
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
    // Same phone already back (page reload): the new connection keeps its place.
    for (const other of this.getConnections()) {
      if (other.id === conn.id && other !== conn) return;
    }
    if (this.hostId === conn.id) {
      this.hostId = null;
    }
    const leaving = this.players.get(conn.id);
    if (leaving) {
      this.pastScores.set(conn.id, leaving.score);
      this.players.delete(conn.id);
      this.lockedIds.delete(conn.id);

      if (this.phase === "buzzed" && this.buzzerId === conn.id) {
        // The person who buzzed left: carry on playing.
        this.clearVote();
        this.resume();
        return;
      }
      if (this.phase === "buzzed" && this.voterIds.includes(conn.id)) {
        // A voter left: don't wait for them.
        this.voterIds = this.voterIds.filter((id) => id !== conn.id);
        this.votes.delete(conn.id);
        if (this.voterIds.length > 0 && this.votes.size >= this.voterIds.length) {
          this.resolveVote();
          return;
        }
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
      case "start":
        if (isHost) {
          if (SOUND_IDS.has(data.buzzSound)) this.buzzSound = data.buzzSound;
          await this.startGame(
            data.mode,
            data.categories,
            data.rounds,
            data.language,
            data.faceGroups
          );
        }
        break;
      case "setBuzz":
        this.setClip(sender.id, data.dataUrl);
        break;
      case "buzz":
        this.buzz(sender.id); // anyone in the player list, host included
        break;
      case "wrong":
        if (isHost && this.phase === "buzzed" && this.buzzerId) {
          this.lockedIds.add(this.buzzerId);
          this.resume();
        }
        break;
      case "vote":
        this.takeVote(sender.id, Boolean(data.yes));
        break;
      case "judge":
        // Host overrules the vote (or decides when nobody can vote).
        if (isHost && this.phase === "buzzed" && this.kind === "word") {
          if (data.valid) this.acceptWord();
          else this.rejectWord();
        }
        break;
      case "guess":
        this.takeGuess(sender.id, data.year);
        break;
      case "reveal":
        if (isHost && (this.phase === "playing" || this.phase === "buzzed")) {
          this.clearVote();
          this.showReveal();
        }
        break;
      case "award":
        if (isHost) this.award(data.playerId);
        break;
      case "awardMashup":
        if (isHost) this.awardMashup(data.first, data.second);
        break;
      case "next":
        if (isHost && this.phase === "reveal") this.nextFromReveal();
        break;
      case "playAgain":
        if (isHost) this.playAgain();
        break;
    }
  }

  /* ---------------- setting up a game ---------------- */

  private async startGame(
    mode: GameMode,
    categories: CategoryId[],
    roundCount: RoundCount,
    language: Language,
    faceGroups: FaceGroup[] = []
  ) {
    if (this.phase !== "lobby" && this.phase !== "finished") return;
    if (!MODE_IDS.has(mode)) return;
    if (!(ROUND_OPTIONS as readonly number[]).includes(roundCount)) return;
    if (!LANGUAGE_IDS.has(language)) return;
    const picked = [...new Set(categories ?? [])].filter((c) => CATEGORY_IDS.has(c));
    const groups = (faceGroups ?? []).filter((g) => FACE_GROUP_IDS.includes(g));
    const needsMusic = mode !== "word" && mode !== "faces";
    if (needsMusic && picked.length === 0) {
      return this.fail("Pick at least one music category.");
    }
    if (this.players.size === 0) return this.fail("Wait for at least one player.");

    this.gameMode = mode;
    this.error = null;
    this.phase = "loading";
    this.gameId += 1;
    const gameId = this.gameId;
    this.roundIndex = 0;
    this.rounds = [];
    this.lastAward = null;
    this.pastScores.clear();
    for (const p of this.players.values()) p.score = 0;
    this.push();

    // What each round will be.
    const kinds: RoundKind[] = Array.from({ length: roundCount }, (_, i) =>
      mode === "mix" ? MIX_ORDER[i % MIX_ORDER.length] : mode
    );
    const songsNeeded = kinds.reduce(
      (n, k) => n + (k === "mashup" ? 2 : MUSIC_KINDS.has(k) ? 1 : 0),
      0
    );
    const facesNeeded = kinds.filter((k) => k === "faces").length * 2;
    const yearRounds = kinds.filter((k) => k === "year").length;

    try {
      let tracks: DeezerTrack[] = [];
      // Songs and faces load at the same time.
      const facesPromise =
        facesNeeded > 0
          ? loadFaces(groups.length ? groups : [...FACE_GROUP_IDS], language, facesNeeded)
          : Promise.resolve([] as Face[]);
      if (songsNeeded > 0) {
        // Find the year needs spares: some songs have no known year.
        const wanted = songsNeeded + (yearRounds > 0 ? Math.min(12, yearRounds + 5) : 0);
        tracks = await this.dealTracks(picked, language, wanted);
        if (tracks.length === 0) {
          throw new Error("Could not load songs. Try other categories.");
        }
      }
      const faces = await facesPromise;
      if (facesNeeded > 0 && faces.length < 2) {
        throw new Error("Could not load the famous faces. Try again in a minute.");
      }
      if (gameId !== this.gameId) return; // game was reset meanwhile

      const words = shuffle(
        language === "en" ? WORDS_EN : language === "fr" ? WORDS_FR : [...WORDS_EN, ...WORDS_FR]
      );

      // Hand out songs and words to the rounds. Skip a round if songs run out.
      let cursor = 0;
      let faceCursor = 0;
      for (const kind of kinds) {
        if (kind === "faces") {
          if (faceCursor + 2 > faces.length) continue;
          this.rounds.push({ kind, people: faces.slice(faceCursor, faceCursor + 2) });
          faceCursor += 2;
        } else if (kind === "word") {
          this.rounds.push({ kind, word: words[this.rounds.length % words.length] });
        } else if (kind === "mashup") {
          if (cursor + 2 > tracks.length) continue;
          this.rounds.push({ kind, track: tracks[cursor], track2: tracks[cursor + 1] });
          cursor += 2;
        } else {
          if (cursor + 1 > tracks.length) continue;
          this.rounds.push({ kind, track: tracks[cursor] });
          cursor += 1;
        }
      }
      if (this.rounds.length === 0) {
        throw new Error("Not enough songs in those categories.");
      }

      this.lookUpYears(tracks.slice(cursor), gameId);
      await this.beginRound();
    } catch (err) {
      if (gameId !== this.gameId) return;
      this.phase = "lobby";
      this.fail(err instanceof Error ? err.message : "Could not load songs.");
    }
  }

  /** Load songs from the chosen categories and deal them round robin, no repeats. */
  private async dealTracks(picked: CategoryId[], language: Language, wanted: number) {
    const perCategory = Math.ceil(wanted / picked.length) + 2;
    const results = await Promise.allSettled(
      picked.map((c) => loadCategoryTracks(c, language, perCategory))
    );
    const pools = results
      .map((r) => (r.status === "fulfilled" ? shuffle(r.value) : []))
      .filter((pool) => pool.length > 0);

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
    return tracks;
  }

  /**
   * Find the year: look up each year round's original year, one after the
   * other in the background (MusicBrainz is slow on purpose). If a song's
   * year is unknown, try a spare song; if none work, it becomes a blind test.
   */
  private lookUpYears(spares: DeezerTrack[], gameId: number) {
    let chain: Promise<unknown> = Promise.resolve();
    for (const round of this.rounds) {
      if (round.kind !== "year") continue;
      round.ready = chain.then(async () => {
        let candidate: DeezerTrack | undefined = round.track;
        while (candidate && gameId === this.gameId) {
          const year = await originalYear(candidate);
          if (year !== null) {
            round.track = candidate;
            round.year = year;
            return true;
          }
          candidate = spares.shift();
        }
        round.kind = "blindtest";
        return false;
      });
      chain = round.ready;
    }
  }

  /* ---------------- rounds ---------------- */

  private async beginRound() {
    const gameId = this.gameId;
    const round = this.round;
    if (!round) {
      this.finish();
      return;
    }
    // Find the year: the year may still be on its way.
    if (round.kind === "year" && round.year === undefined && round.ready) {
      if (this.phase !== "loading") {
        this.phase = "loading";
        this.push();
      }
      await round.ready;
      if (gameId !== this.gameId) return;
    }

    this.buzzerId = null;
    this.lockedIds.clear();
    this.pausedRemainingMs = null;
    this.guesses.clear();
    this.yearReveal = undefined;
    this.wordScorer = undefined;
    this.clearVote();
    this.phase = "playing";
    this.startTimer(ROUND_MS);
    this.push();
  }

  /** First buzz wins: pause the clock and hand over to that player. */
  private buzz(playerId: string) {
    if (this.phase !== "playing" || this.kind === "year") return;
    if (!this.players.has(playerId) || this.lockedIds.has(playerId)) return;

    this.pausedRemainingMs = Math.max(0, (this.endsAt ?? Date.now()) - Date.now());
    this.clearTimer();
    this.endsAt = null;
    this.buzzerId = playerId;
    this.phase = "buzzed";

    if (this.kind === "word") this.openVote(playerId);
    this.push();
  }

  /** Wrong answer (or the buzzer left): back on for everyone else. */
  private resume() {
    this.buzzerId = null;
    const everyoneLocked = [...this.players.keys()].every((id) => this.lockedIds.has(id));
    if (everyoneLocked || (this.pausedRemainingMs ?? 0) <= 0) {
      this.showReveal();
      return;
    }
    this.phase = "playing";
    this.startTimer(this.pausedRemainingMs ?? ROUND_MS);
    this.pausedRemainingMs = null;
    this.push();
  }

  /* ---------------- Song with a word: voting ---------------- */

  /** Everyone with a phone except the singer votes. Locals can't vote. */
  private openVote(singerId: string) {
    this.votes.clear();
    this.voterIds = [...this.players.keys()].filter(
      (id) => id !== singerId && !id.startsWith(LOCAL_PREFIX)
    );
    if (this.voterIds.length === 0) {
      // Nobody can vote: the host decides, no timer.
      this.voteEndsAt = null;
      return;
    }
    this.voteEndsAt = Date.now() + VOTE_MS;
    this.voteTimer = setTimeout(() => {
      if (this.phase === "buzzed" && this.kind === "word") this.resolveVote();
    }, VOTE_MS);
  }

  private takeVote(playerId: string, yes: boolean) {
    if (this.phase !== "buzzed" || this.kind !== "word") return;
    if (!this.voterIds.includes(playerId) || this.votes.has(playerId)) return;
    this.votes.set(playerId, yes);
    if (this.votes.size >= this.voterIds.length) {
      this.resolveVote();
    } else {
      this.push();
    }
  }

  /** Majority wins; a tie (or no votes at all) goes to the singer. */
  private resolveVote() {
    const yes = [...this.votes.values()].filter(Boolean).length;
    const no = this.votes.size - yes;
    if (yes >= no) this.acceptWord();
    else this.rejectWord();
  }

  private acceptWord() {
    const singer = this.buzzerId ? this.players.get(this.buzzerId) : undefined;
    if (singer) singer.score += 1;
    this.wordScorer = singer?.name ?? null;
    this.clearVote();
    this.showReveal();
  }

  private rejectWord() {
    if (this.buzzerId) this.lockedIds.add(this.buzzerId);
    this.clearVote();
    this.resume();
  }

  private clearVote() {
    if (this.voteTimer) {
      clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
    this.voteEndsAt = null;
    this.voterIds = [];
    this.votes.clear();
  }

  /* ---------------- Find the year: guesses ---------------- */

  private takeGuess(playerId: string, year: number) {
    if (this.phase !== "playing" || this.kind !== "year") return;
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

  /* ---------------- end of a round ---------------- */

  private showReveal() {
    this.clearTimer();
    this.endsAt = null;
    this.pausedRemainingMs = null;
    this.phase = "reveal";

    const round = this.round;
    if (round?.kind === "year" && round.year !== undefined) {
      const actual = round.year;
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

  /** Blind test, and Song with a word when nobody won the vote: host picks. */
  private award(playerId: string | null) {
    if (this.phase !== "reveal") return;
    const winner = playerId ? this.players.get(playerId) : undefined;
    if (winner) winner.score += 1;
    this.lastAward = { round: this.roundIndex, name: winner?.name ?? null };
    this.advance();
  }

  /** Mashup: a point for whoever found each song. */
  private awardMashup(first: string | null, second: string | null) {
    if (this.phase !== "reveal" || (this.kind !== "mashup" && this.kind !== "faces")) return;
    const names: string[] = [];
    for (const id of [first, second]) {
      const p = id ? this.players.get(id) : undefined;
      if (p) {
        p.score += 1;
        names.push(p.name);
      }
    }
    const name =
      names.length === 0
        ? null
        : names.length === 2 && names[0] === names[1]
          ? `${names[0]} (x2)`
          : names.join(" & ");
    this.lastAward = { round: this.roundIndex, name };
    this.advance();
  }

  /** Find the year, and Song with a word once the vote decided: just move on. */
  private nextFromReveal() {
    if (this.kind === "year") {
      const best = this.yearReveal?.[0];
      this.lastAward = {
        round: this.roundIndex,
        name: best && best.points > 0 ? best.name : null,
        points: best?.points,
      };
    } else if (this.kind === "word") {
      this.lastAward = { round: this.roundIndex, name: this.wordScorer ?? null };
    } else {
      this.lastAward = { round: this.roundIndex, name: null };
    }
    this.advance();
  }

  private advance() {
    if (this.roundIndex + 1 >= this.rounds.length) {
      this.finish();
      return;
    }
    this.roundIndex += 1;
    void this.beginRound();
  }

  private finish() {
    this.clearTimer();
    this.clearVote();
    this.phase = "finished";
    this.push();
  }

  private playAgain() {
    this.clearTimer();
    this.clearVote();
    this.gameId += 1; // stops any background year lookups
    this.phase = "lobby";
    this.error = null;
    this.roundIndex = 0;
    this.rounds = [];
    this.endsAt = null;
    this.pausedRemainingMs = null;
    this.buzzerId = null;
    this.lockedIds.clear();
    this.guesses.clear();
    this.yearReveal = undefined;
    this.wordScorer = undefined;
    this.lastAward = null;
    this.pastScores.clear();
    for (const p of this.players.values()) p.score = 0;
    this.push();
  }

  /* ---------------- recorded buzzers ---------------- */

  private setClip(playerId: string, dataUrl: string | null) {
    if (!this.players.has(playerId)) return;
    if (dataUrl !== null) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:audio/")) return;
      if (dataUrl.length > MAX_CLIP_CHARS) return;
      this.clips.set(playerId, dataUrl);
    } else {
      this.clips.delete(playerId);
    }
    // Only the host needs the sound itself; everyone else just sees a 🎙.
    if (this.hostId) {
      this.getConnection(this.hostId)?.send(
        JSON.stringify({ type: "clip", playerId, dataUrl })
      );
    }
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

  /** Everyone gets the same snapshot, except only the host gets the audio links. */
  private push() {
    const round = this.round;
    const inRound =
      this.phase === "playing" || this.phase === "buzzed" || this.phase === "reveal";

    const base: StateMessage = {
      type: "state",
      phase: this.phase,
      players: [...this.players.values()],
      hostId: this.hostId,
      roundIndex: this.roundIndex,
      totalRounds: this.rounds.length,
      endsAt: this.endsAt,
      pausedRemainingMs: this.pausedRemainingMs,
      buzzerId: this.buzzerId,
      lockedIds: [...this.lockedIds],
      lastAward: this.lastAward,
      buzzSound: this.buzzSound,
      mode: this.kind,
      gameMode: this.gameMode,
      guessedIds: [...this.guesses.keys()],
      customBuzzIds: [...this.clips.keys()],
      error: this.error,
    };

    if ((this.phase === "playing" || this.phase === "buzzed") && round?.people) {
      base.faces = round.people.map((p) => proxied(p.imageUrl));
      base.faceHints = round.people.map((p) => ({
        kind: FACE_KIND[p.group],
        initials: initials(p.name),
      }));
    }

    if (inRound && round?.kind === "word") {
      base.word = round.word;
    }
    if (this.phase === "buzzed" && this.kind === "word" && this.voterIds.length > 0) {
      const yes = [...this.votes.values()].filter(Boolean).length;
      base.vote = {
        yes,
        no: this.votes.size - yes,
        voterIds: this.voterIds,
        votedIds: [...this.votes.keys()],
        endsAt: this.voteEndsAt ?? Date.now(),
      };
    }

    if (this.phase === "reveal" && round) {
      if (round.kind === "faces" && round.people) {
        base.reveal = {
          title: "",
          artist: "",
          coverUrl: "",
          people: round.people.map((p) => ({ ...p, imageUrl: proxied(p.imageUrl) })),
        };
      } else if (round.kind === "word") {
        base.reveal = {
          title: "",
          artist: "",
          coverUrl: "",
          word: round.word,
          scorerName: this.wordScorer ?? null,
        };
      } else if (round.track) {
        base.reveal = {
          title: round.track.title,
          artist: round.track.artist,
          coverUrl: round.track.coverUrl,
        };
        if (round.kind === "mashup" && round.track2) {
          base.reveal.second = {
            title: round.track2.title,
            artist: round.track2.artist,
            coverUrl: round.track2.coverUrl,
          };
        }
        if (round.kind === "year") {
          base.reveal.year = round.year;
          base.reveal.guesses = this.yearReveal;
        }
      }
    }

    for (const conn of this.getConnections()) {
      const payload: StateMessage = { ...base };
      if (conn.id === this.hostId && inRound && round?.track && MUSIC_KINDS.has(round.kind)) {
        payload.host = { previewUrl: round.track.previewUrl };
        if (round.kind === "mashup" && round.track2) {
          payload.host.previewUrl2 = round.track2.previewUrl;
        }
      }
      conn.send(JSON.stringify(payload));
    }
  }
}

/** Worker entry: game rooms live at /parties/main/<ROOM CODE>. Everything else is the website. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/face/")) return servePhoto(path);
    if (path === "/face-debug") return photoDebug();
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
