import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import PartySocket from "partysocket";

import "./styles.css";
import { morphFaces, preloadMorph, type Morph } from "./morph";
import { Backdrop, BuzzButton, Confetti, JoinCard, Wordmark, colourFor } from "./brand";
import { ModePicker, MusicSheet, OptionSheet, Seg, SettingRow, musicSummary } from "./lobby";
import {
  BUZZ_SOUNDS,
  FACE_GROUPS,
  HINT_INITIALS_MS,
  HINT_KIND_MS,
  MAX_CLIP_CHARS,
  GAME_MODES,
  LOCAL_PREFIX,
  PLAY_STYLES,
  ROUND_MS,
  ROUND_OPTIONS,
  VOTE_MS,
  YEAR_MIN,
  type BuzzSound,
  type CategoryId,
  type ClientMessage,
  type FaceGroup,
  type GameMode,
  type Language,
  type Phase,
  type Player,
  type PlayStyle,
  type RoundCount,
  type ServerMessage,
  type StateMessage,
} from "./types";

/** The website and the game server share one address, locally and online. */
const SERVER_HOST = window.location.host;

type Screen = "home" | "join" | "host" | "player";

/** Skip letters that look like each other (I, L, O). */
const ROOM_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];
  }
  return code;
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

/** A QR code scan lands on /?join=ABCD: open the join screen with the code. */
function codeFromLink() {
  const code = new URLSearchParams(window.location.search).get("join") ?? "";
  const clean = code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (clean) window.history.replaceState(null, "", "/");
  return clean.length === 4 ? clean : "";
}

/**
 * Survive a page reload (Safari asks for the microphone again after one):
 * remember which room this tab is in, as who.
 */
const SESSION_KEY = "geekasong.session";
type Session = { screen: "host" | "player"; roomCode: string; playerName: string };
function loadSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}
function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: no reload rescue */
  }
}

/** Same id for this tab in this room, so a reload keeps your place and points. */
function stableId(room: string, role: string) {
  const key = `geekasong.id.${role}.${room}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

function App() {
  const [linkCode] = useState(codeFromLink);
  const [saved] = useState(() => (linkCode ? null : loadSession()));
  const [screen, setScreen] = useState<Screen>(
    linkCode ? "join" : saved ? saved.screen : "home"
  );
  const [roomCode, setRoomCode] = useState(linkCode || saved?.roomCode || "");
  const [playerName, setPlayerName] = useState(saved?.playerName ?? "");

  useEffect(() => {
    if (screen === "host" || screen === "player") {
      saveSession({ screen, roomCode, playerName: playerName.trim() });
    } else {
      saveSession(null);
    }
  }, [screen, roomCode]);

  function hostGame() {
    unlockSound();
    setRoomCode(generateRoomCode());
    setScreen("host");
  }

  return (
    <div className={`app app-${screen === "host" ? "host" : "player"}`}>
      <Backdrop record={screen === "home"} />
      {screen === "home" && (
        <HomeScreen onHost={hostGame} onJoin={() => setScreen("join")} />
      )}
      {screen === "join" && (
        <JoinScreen
          roomCode={roomCode}
          playerName={playerName}
          codeFromLink={Boolean(linkCode) && roomCode === linkCode}
          onRoomCodeChange={setRoomCode}
          onPlayerNameChange={setPlayerName}
          onJoin={() => {
            unlockSound();
            setScreen("player");
          }}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "host" && (
        <HostScreen roomCode={roomCode} onBack={() => setScreen("home")} />
      )}
      {screen === "player" && (
        <PlayerScreen
          roomCode={roomCode}
          playerName={playerName.trim()}
          onBack={() => setScreen("home")}
        />
      )}
    </div>
  );
}

function HomeScreen(props: { onHost: () => void; onJoin: () => void }) {
  return (
    <main className="card home">
      <Wordmark />
      <p className="tagline">Hear it. Buzz it. Shout it.</p>
      <div className="button-stack">
        <button className="btn btn-host" type="button" onClick={props.onHost}>
          Host a game
        </button>
        <button className="btn btn-join" type="button" onClick={props.onJoin}>
          Join a game
        </button>
      </div>
    </main>
  );
}

function JoinScreen(props: {
  roomCode: string;
  playerName: string;
  codeFromLink: boolean;
  onRoomCodeChange: (value: string) => void;
  onPlayerNameChange: (value: string) => void;
  onJoin: () => void;
  onBack: () => void;
}) {
  const ready =
    props.roomCode.length === 4 && props.playerName.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) props.onJoin();
  }

  return (
    <main className="card">
      <h1>{props.codeFromLink ? `Joining room ${props.roomCode}` : "Join a game"}</h1>
      <form className="join-form" onSubmit={submit}>
        <label>
          Room code
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            value={props.roomCode}
            onChange={(e) =>
              props.onRoomCodeChange(
                e.target.value.toUpperCase().replace(/[^A-Z]/g, "")
              )
            }
            placeholder="ABCD"
          />
        </label>
        <label>
          Your name
          <input
            autoComplete="nickname"
            autoFocus={props.codeFromLink}
            maxLength={20}
            value={props.playerName}
            onChange={(e) => props.onPlayerNameChange(e.target.value)}
            placeholder="DJ Smooth"
          />
        </label>
        <button className="btn btn-join" type="submit" disabled={!ready}>
          Join
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onBack}>
          Back
        </button>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Host: plays the music, runs the game                                */
/* ------------------------------------------------------------------ */

function HostScreen(props: { roomCode: string; onBack: () => void }) {
  // Everyone's recorded buzzers, ready to play on the speaker.
  const clipBuffers = useRef(new Map<string, AudioBuffer>());
  const { state, connected, send, myId } = useGame(
    props.roomCode,
    "host",
    undefined,
    (playerId, dataUrl) => {
      if (!dataUrl) {
        clipBuffers.current.delete(playerId);
        return;
      }
      decodeClip(dataUrl).then((buffer) => {
        if (buffer) clipBuffers.current.set(playerId, buffer);
      });
    }
  );
  const [categories, setCategories] = useState<CategoryId[]>(["80s", "90s"]);
  const [rounds, setRounds] = useState<RoundCount>(10);
  const [language, setLanguage] = useState<Language>("both");
  const [playStyle, setPlayStyle] = useState<PlayStyle>("buzzers");
  const [newName, setNewName] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostPlaying, setHostPlaying] = useState(false);
  const [buzzSound, setBuzzSound] = useState<BuzzSound>("airhorn");
  const oneDevice = playStyle === "device";
  const [gameMode, setGameMode] = useState<GameMode>("blindtest");
  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>(["music", "screen", "sport"]);
  const [sheet, setSheet] = useState<"music" | "faces" | "buzz" | null>(null);
  useEffect(() => {
    if (gameMode === "faces" || gameMode === "mix") preloadMorph();
  }, [gameMode]);

  const phase: Phase = state?.phase ?? "lobby";
  const players = state?.players ?? [];
  const music = useHostMusic(
    [state?.host?.previewUrl, state?.host?.previewUrl2],
    phase
  );
  const [mashupPick, setMashupPick] = useState<{ round: number; first: string | null; second: string | null }>(
    { round: -1, first: null, second: null }
  );
  useWakeLock(phase !== "lobby");

  // Loud buzzer on the host device (the one plugged into the speaker).
  const prevPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (phase === "buzzed" && prevPhase.current !== "buzzed") {
      const own = state?.buzzerId ? clipBuffers.current.get(state.buzzerId) : undefined;
      if (own) playClip(own);
      else playBuzz(state?.buzzSound ?? buzzSound);
    }
    prevPhase.current = phase;
  }, [phase]);

  // Re-add the host as a player after a reconnect (e.g. the screen slept).
  useEffect(() => {
    if (connected && hostPlaying && hostName.trim()) {
      send({ type: "hostJoin", name: hostName.trim() });
    }
  }, [connected]);

  function joinAsHost(event: FormEvent) {
    event.preventDefault();
    if (!hostName.trim()) return;
    unlockSound();
    setHostPlaying(true);
    send({ type: "hostJoin", name: hostName.trim() });
  }

  function leaveAsHost() {
    setHostPlaying(false);
    send({ type: "hostLeave" });
  }

  function hostBuzz() {
    unlockSound();
    send({ type: "buzz" });
  }

  const nameOf = (id: string | null) =>
    players.find((p) => p.id === id)?.name ?? "Someone";

  function choosePlayStyle(style: PlayStyle) {
    setPlayStyle(style);
    // On one device the host just adds their own name to the list.
    if (style === "device" && hostPlaying) leaveAsHost();
    // Typed in names only make sense on one device: clear them for buzzers.
    if (style === "buzzers") {
      for (const p of players) {
        if (p.id.startsWith(LOCAL_PREFIX)) {
          send({ type: "removeLocal", playerId: p.id });
        }
      }
    }
  }

  function addName(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    send({ type: "addLocal", name });
    setNewName("");
  }

  function toggleCategory(id: CategoryId) {
    setCategories((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  function start() {
    music.unlock(); // must happen inside a tap so browsers allow sound
    send({ type: "start", categories, rounds, language, buzzSound, mode: gameMode, faceGroups });
  }

  function award(playerId: string | null) {
    music.unlock();
    if (playerId) playDing();
    send({ type: "award", playerId });
  }

  const roundLabel = state
    ? `Round ${state.roundIndex + 1} of ${state.totalRounds}`
    : "";

  if (phase === "loading") {
    const yearMode = state?.gameMode === "year" || state?.mode === "year";
    return (
      <main className="card stage">
        <div className="spinner" aria-hidden="true" />
        <h1>{yearMode ? "Checking release years…" : "Picking the songs…"}</h1>
        <p className="lede">
          {yearMode
            ? "Finding when each song really came out (not the remaster!)."
            : "Digging through the crates on Deezer."}
        </p>
      </main>
    );
  }

  /* ---------- Find the year: host screens ---------- */
  if (phase === "playing" && state?.mode === "year") {
    const phones = players.filter((p) => !p.id.startsWith(LOCAL_PREFIX));
    const myGuessed = state.guessedIds.includes(myId);
    return (
      <main className="card stage">
        <LastAward state={state} />
        <p className="eyebrow">{roundLabel}</p>
        {!oneDevice && hostPlaying ? (
          <YearPicker
            key={state.roundIndex}
            locked={myGuessed}
            onLock={(year) => send({ type: "guess", year })}
          />
        ) : (
          <div className="vinyl" aria-hidden="true" />
        )}
        <h1>What year is it from?</h1>
        <Countdown endsAt={state.endsAt} pausedMs={null} big />
        {phones.length > 0 && (
          <p className="status">
            {state.guessedIds.length} / {phones.length} locked in
          </p>
        )}
        {music.blocked && (
          <button className="btn btn-host" type="button" onClick={music.retry}>
            Tap to play the music
          </button>
        )}
        <button
          className={`btn ${oneDevice ? "btn-host" : "btn-ghost"}`}
          type="button"
          onClick={() => send({ type: "reveal" })}
        >
          {oneDevice ? "Show the year" : "Show the year now"}
        </button>
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal && state.mode === "year") {
    const r = state.reveal;
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    const guesses = r.guesses ?? [];
    const locals = players.filter((p) => p.id.startsWith(LOCAL_PREFIX));
    return (
      <main className="card stage reveal">
        <p className="eyebrow">{roundLabel}</p>
        {r.coverUrl && <img className="cover" src={r.coverUrl} alt="" />}
        <p className="year-big">{r.year}</p>
        <h1 className="song-title">{r.title}</h1>
        <p className="song-artist">{r.artist}</p>

        {guesses.length > 0 && <GuessList guesses={guesses} year={r.year ?? 0} />}

        {locals.length > 0 ? (
          <>
            <h2 className="section-title">
              Who was closest?{isLast ? " (last song!)" : ""}
            </h2>
            <div className="award-grid">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn award"
                  onClick={() => award(p.id)}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost award"
                onClick={() => award(null)}
              >
                Nobody
              </button>
            </div>
          </>
        ) : (
          <button
            className="btn btn-host"
            type="button"
            onClick={() => {
              music.unlock();
              send({ type: "next" });
            }}
          >
            {isLast ? "See final scores" : "Next song"}
          </button>
        )}

        <Leaderboard players={players} compact />
      </main>
    );
  }

  if (phase === "playing" && state) {
    const locked = state.lockedIds.map(nameOf);
    const canHostBuzz =
      !oneDevice && hostPlaying && !state.lockedIds.includes(myId);
    return (
      <main className="card stage">
        <LastAward state={state} />
        <p className="eyebrow">{roundLabel}</p>
        {canHostBuzz ? (
          <BuzzButton onBuzz={hostBuzz} />
        ) : state.mode === "word" || state.mode === "faces" ? null : (
          <div className={`vinyl ${state.mode === "mashup" ? "double" : ""}`} aria-hidden="true" />
        )}
        {state.mode === "word" && <p className="word-big">{state.word}</p>}
        {state.mode === "faces" && state.faces && (
          <FaceBlend urls={state.faces} hints={state.faceHints} endsAt={state.endsAt} />
        )}
        <h1>
          {state.mode === "faces"
            ? "Who are these two famous people?"
            : state.mode === "word"
            ? oneDevice
              ? "Sing a song with this word!"
              : "Buzz and sing a song with this word!"
            : state.mode === "mashup"
              ? "Two songs at once: name them both!"
              : oneDevice
                ? "Shout it out!"
                : "Buzz when you know it!"}
        </h1>
        <Countdown endsAt={state.endsAt} pausedMs={null} big />
        {locked.length > 0 && (
          <p className="status">Out for this song: {locked.join(", ")}</p>
        )}
        {music.blocked && (
          <button className="btn btn-host" type="button" onClick={music.retry}>
            Tap to play the music
          </button>
        )}
        <button
          className={`btn ${oneDevice ? "btn-host" : "btn-ghost"}`}
          type="button"
          onClick={() => send({ type: "reveal" })}
        >
          {state.mode === "word"
            ? oneDevice
              ? "Someone sang one! Give the point"
              : "Nobody? Next word"
            : oneDevice
              ? "Someone got it! Show the answer"
              : "Nobody knows? Show the answer"}
        </button>
      </main>
    );
  }

  if (phase === "buzzed" && state?.mode === "word") {
    const v = state.vote;
    const canVote = v?.voterIds.includes(myId) && !v.votedIds.includes(myId);
    return (
      <main className="card stage buzzed">
        <p className="eyebrow">{roundLabel}</p>
        <p className="word-big small">{state.word}</p>
        <p className="buzz-name">{nameOf(state.buzzerId)}</p>
        <p className="buzz-sub">is singing! Does it count?</p>
        {v ? (
          <>
            <p className="status">
              {v.votedIds.length} / {v.voterIds.length} voted · 👍 {v.yes} · 👎 {v.no}
            </p>
            <Countdown endsAt={v.endsAt} pausedMs={null} total={VOTE_MS} />
          </>
        ) : (
          <p className="status">Nobody else can vote: you decide.</p>
        )}
        {canVote && (
          <VoteButtons onVote={(yes) => send({ type: "vote", yes })} />
        )}
        <h2 className="section-title">Host: decide now</h2>
        <div className="segmented two">
          <button className="chip" type="button" onClick={() => send({ type: "judge", valid: true })}>
            ✓ It counts
          </button>
          <button className="chip" type="button" onClick={() => send({ type: "judge", valid: false })}>
            ✗ Doesn't count
          </button>
        </div>
      </main>
    );
  }

  if (phase === "buzzed" && state) {
    return (
      <main className="card stage buzzed">
        <p className="eyebrow">{roundLabel}</p>
        <p className="buzz-name">{nameOf(state.buzzerId)}</p>
        <p className="buzz-sub">buzzed! Shout your answer!</p>
        {state.mode === "faces" && state.faces && (
          <FaceBlend
            urls={state.faces}
            small
            hints={state.faceHints}
            endsAt={null}
            pausedMs={state.pausedRemainingMs}
          />
        )}
        <Countdown endsAt={null} pausedMs={state.pausedRemainingMs} big />
        <div className="button-stack">
          <button
            className="btn btn-host"
            type="button"
            onClick={() => send({ type: "reveal" })}
          >
            Show the answer
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => send({ type: "wrong" })}
          >
            Wrong! Keep playing
          </button>
        </div>
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal && state.mode === "word") {
    const r = state.reveal;
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    return (
      <main className="card stage reveal">
        <p className="eyebrow">{roundLabel}</p>
        <p className="word-big">{r.word}</p>
        {r.scorerName ? (
          <>
            <p className="verdict ok">{r.scorerName} scores! +1</p>
            <button
              className="btn btn-host"
              type="button"
              onClick={() => {
                music.unlock();
                send({ type: "next" });
              }}
            >
              {isLast ? "See final scores" : "Next round"}
            </button>
          </>
        ) : (
          <>
            <h2 className="section-title">Who sang a song with it?</h2>
            <div className="award-grid">
              {players.map((p) => (
                <button key={p.id} type="button" className="btn award" onClick={() => award(p.id)}>
                  {p.name}
                </button>
              ))}
              <button type="button" className="btn btn-ghost award" onClick={() => award(null)}>
                Nobody
              </button>
            </div>
          </>
        )}
        <Leaderboard players={players} compact />
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal && (state.mode === "mashup" || state.mode === "faces")) {
    const r = state.reveal;
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    const pick =
      mashupPick.round === state.roundIndex
        ? mashupPick
        : { round: state.roundIndex, first: null, second: null };
    const isFaces = state.mode === "faces";
    const keys = ["first", "second"] as const;
    const songs = isFaces
      ? (r.people ?? []).slice(0, 2).map((p, i) => ({
          key: keys[i],
          title: p.name,
          artist: "",
          coverUrl: p.imageUrl,
          credit: p.credit,
        }))
      : [
          { key: "first" as const, title: r.title, artist: r.artist, coverUrl: r.coverUrl, credit: "" },
          ...(r.second ? [{ key: "second" as const, ...r.second, credit: "" }] : []),
        ];
    return (
      <main className="card stage reveal">
        <p className="eyebrow">{roundLabel}</p>
        <h2 className="section-title first">
          {isFaces ? "Who recognised each person?" : "Who found each song?"}
        </h2>
        {songs.map((song) => (
          <div key={song.key} className="mashup-song">
            <div className="answer-row">
              {song.coverUrl && (
                <img className={`cover small ${isFaces ? "face" : ""}`} src={song.coverUrl} alt="" />
              )}
              <div>
                <p className="song-title small">{song.title}</p>
                {song.artist && <p className="song-artist">{song.artist}</p>}
                {song.credit && <p className="credit">Photo: {song.credit}</p>}
              </div>
            </div>
            <div className="chips">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${pick[song.key] === p.id ? "selected" : ""}`}
                  onClick={() =>
                    setMashupPick({
                      ...pick,
                      [song.key]: pick[song.key] === p.id ? null : p.id,
                    })
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          className="btn btn-host"
          type="button"
          onClick={() => {
            music.unlock();
            const anyone = pick.first || pick.second;
            if (anyone) playDing();
            send({ type: "awardMashup", first: pick.first, second: pick.second });
          }}
        >
          {pick.first || pick.second ? "Give the points" : "Nobody found them"}
          {isLast ? " & see final scores" : " & next"}
        </button>
        <Leaderboard players={players} compact />
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal) {
    const r = state.reveal;
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    // The person who buzzed goes first: most of the time it's them.
    const ordered = [...players].sort(
      (a, b) =>
        Number(b.id === state.buzzerId) - Number(a.id === state.buzzerId)
    );
    return (
      <main className="card stage reveal">
        <p className="eyebrow">{roundLabel}</p>
        {r.coverUrl && <img className="cover" src={r.coverUrl} alt="" />}
        <h1 className="song-title">{r.title}</h1>
        <p className="song-artist">{r.artist}</p>

        <h2 className="section-title">
          Who got it?{isLast ? " (last song!)" : ""}
        </h2>
        <div className="award-grid">
          {ordered.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn award ${p.id === state.buzzerId ? "suggested" : ""}`}
              onClick={() => award(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost award"
            onClick={() => award(null)}
          >
            Nobody
          </button>
        </div>

        <Leaderboard players={players} compact />
      </main>
    );
  }

  if (phase === "finished") {
    return (
      <main className="card stage">
        <p className="eyebrow">Final scores</p>
        <Confetti />
        <h1>And the winner is…</h1>
        <Podium players={players} />
        <Leaderboard players={players} />
        <div className="button-stack">
          <button
            className="btn btn-host"
            type="button"
            onClick={() => send({ type: "playAgain" })}
          >
            Play again
          </button>
          <button className="btn btn-ghost" type="button" onClick={props.onBack}>
            Leave
          </button>
        </div>
      </main>
    );
  }

  // Lobby
  const needsMusic = gameMode !== "word" && gameMode !== "faces";
  const needsFaces = gameMode === "faces" || gameMode === "mix";
  const canStart =
    connected && players.length > 0 && (!needsMusic || categories.length > 0);
  const style = PLAY_STYLES.find((s) => s.id === playStyle)!;
  const faceSummary =
    faceGroups.length === FACE_GROUPS.length
      ? "Everyone"
      : faceGroups.length === 0
        ? "Pick at least one"
        : FACE_GROUPS.filter((g) => faceGroups.includes(g.id)).map((g) => g.label).join(", ");
  return (
    <main className="card host-lobby">
      <h2 className="section-title first">How are you playing?</h2>
      <Seg
        label="How are you playing?"
        options={PLAY_STYLES}
        value={playStyle}
        onChange={choosePlayStyle}
        wide
      />
      <p className="hint">{style.hint}</p>

      {oneDevice ? (
        <>
          <h2 className="section-title">Who's playing?</h2>
          <form className="add-name" onSubmit={addName}>
            <input
              value={newName}
              maxLength={20}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Add a name"
            />
            <button className="btn btn-join" type="submit" disabled={!newName.trim()}>
              Add
            </button>
          </form>
          {players.length > 0 && (
            <ul className="player-list">
              {players.map((p) => (
                <li key={p.id} className="removable">
                  <Avatar name={p.name} />
                  <span className="player-name">{p.name}</span>
                  {p.id.startsWith(LOCAL_PREFIX) && (
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => send({ type: "removeLocal", playerId: p.id })}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <JoinCard roomCode={props.roomCode} />
          <div className="list-head">
            <h2 className="section-title">
              {players.length} player{players.length === 1 ? "" : "s"}
            </h2>
            <p className="status">
              {!connected ? "Connecting…" : players.length ? "Ready to start" : "Live lobby"}
            </p>
          </div>
          <PlayerList
            players={players}
            empty="Waiting for players to join…"
            customIds={state?.customBuzzIds}
            crownId={state?.hostId}
          />
          <h2 className="section-title">Playing too?</h2>
          {hostPlaying ? (
            <>
              <div className="host-me">
                <span>
                  You're in as <b>{hostName.trim()}</b>
                </span>
                <button className="chip" type="button" onClick={leaveAsHost}>
                  Just hosting
                </button>
              </div>
              <BuzzerRecorder
                ready={connected}
                hasCustom={Boolean(state?.customBuzzIds.includes(myId))}
                onSave={(dataUrl) => send({ type: "setBuzz", dataUrl })}
              />
            </>
          ) : (
            <>
              <form className="add-name" onSubmit={joinAsHost}>
                <input
                  value={hostName}
                  maxLength={20}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Your name"
                />
                <button className="btn btn-join" type="submit" disabled={!hostName.trim()}>
                  I'm in
                </button>
              </form>
              <p className="hint">Once you're in, you can record your own buzzer sound.</p>
            </>
          )}
        </>
      )}

      <h2 className="section-title">Game</h2>
      <ModePicker value={gameMode} onChange={setGameMode} />
      <p className="hint">{MODE_HINTS[gameMode]}</p>

      <h2 className="section-title">Settings</h2>
      <div className="settings">
        {needsMusic && (
          <SettingRow label="Music" value={musicSummary(categories)} onOpen={() => setSheet("music")} />
        )}
        {needsFaces && (
          <SettingRow label="Famous faces" value={faceSummary} onOpen={() => setSheet("faces")} />
        )}
        <SettingRow label="Language">
          <Seg label="Language" options={LANG_SHORT} value={language} onChange={setLanguage} />
        </SettingRow>
        <SettingRow label="Rounds">
          <Seg
            label="Rounds"
            options={ROUND_OPTIONS.map((n) => ({ id: n, label: String(n) }))}
            value={rounds}
            onChange={setRounds}
          />
        </SettingRow>
        <SettingRow
          label="Buzzer sound"
          value={BUZZ_SOUNDS.find((b) => b.id === buzzSound)?.label}
          onOpen={() => setSheet("buzz")}
        />
      </div>

      {sheet === "music" && (
        <MusicSheet value={categories} onChange={setCategories} onClose={() => setSheet(null)} />
      )}
      {sheet === "faces" && (
        <OptionSheet
          title="Famous faces from"
          options={FACE_GROUPS}
          selected={faceGroups}
          onPick={(id) =>
            setFaceGroups((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
          }
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "buzz" && (
        <OptionSheet
          title="Buzzer sound"
          note="Tap to hear it. Players who recorded their own buzzer use theirs."
          options={BUZZ_SOUNDS}
          selected={[buzzSound]}
          onPick={(id) => {
            unlockSound();
            setBuzzSound(id);
            playBuzz(id);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {state?.error && <p className="error">{state.error}</p>}

      <div className="button-stack">
        <button
          className="btn btn-host"
          type="button"
          disabled={!canStart}
          onClick={start}
        >
          {players.length === 0
            ? oneDevice
              ? "Add some players"
              : "Waiting for players"
            : needsMusic && categories.length === 0
              ? "Pick some music"
              : `Start game with ${players.length} player${players.length > 1 ? "s" : ""}`}
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onBack}>
          Leave
        </button>
      </div>
    </main>
  );
}

const LANG_SHORT = [
  { id: "en", label: "EN" },
  { id: "fr", label: "FR" },
  { id: "both", label: "Both" },
] as const satisfies readonly { id: Language; label: string }[];

/* ------------------------------------------------------------------ */
/* Player: a phone with a giant buzzer                                 */
/* ------------------------------------------------------------------ */

function PlayerScreen(props: {
  roomCode: string;
  playerName: string;
  onBack: () => void;
}) {
  const { state, connected, send, myId } = useGame(
    props.roomCode,
    "player",
    props.playerName
  );
  const phase: Phase = state?.phase ?? "lobby";
  const players = state?.players ?? [];
  const me = players.find((p) => p.id === myId);
  const ranked = rank(players);
  const myRank = ranked.findIndex((p) => p.id === myId) + 1;
  useWakeLock(phase !== "lobby");

  // Buzz sound + vibration on my phone when the server confirms I was first.
  const iBuzzed = phase === "buzzed" && state?.buzzerId === myId;
  const gm = state?.gameMode;
  useEffect(() => {
    if (gm === "faces" || gm === "mix") preloadMorph();
  }, [gm]);
  const myClip = useRef<AudioBuffer | null>(null);
  useEffect(() => {
    if (iBuzzed) {
      if (myClip.current) playClip(myClip.current);
      else playBuzz(state?.buzzSound ?? "airhorn");
      navigator.vibrate?.(300);
    }
  }, [iBuzzed]);

  const buzzerName =
    players.find((p) => p.id === state?.buzzerId)?.name ?? "Someone";
  const amLocked = Boolean(state?.lockedIds.includes(myId));
  const myGuessed = Boolean(state?.guessedIds.includes(myId));

  function buzz() {
    unlockSound();
    send({ type: "buzz" });
  }

  const header = (
    <div className="player-header">
      <span>Room {props.roomCode}</span>
      <span className="pts">
        {props.playerName}
        {me ? ` · ${me.score} pt${me.score === 1 ? "" : "s"}` : ""}
      </span>
    </div>
  );

  if (phase === "loading") {
    return (
      <main className="card">
        {header}
        <div className="spinner" aria-hidden="true" />
        <h1>Get ready…</h1>
        <p className="lede">
          {state?.gameMode === "year" || state?.mode === "year"
            ? "Checking when each song came out."
            : "The host is picking the songs."}
        </p>
      </main>
    );
  }

  if (phase === "playing" && state?.mode === "year") {
    return (
      <main className="card play">
        {header}
        <LastAward state={state} />
        <p className="eyebrow center">
          Round {state.roundIndex + 1} of {state.totalRounds}
        </p>
        <h1 className="center">What year?</h1>
        <YearPicker
          key={state.roundIndex}
          locked={myGuessed}
          onLock={(year) => send({ type: "guess", year })}
        />
        <Countdown endsAt={state.endsAt} pausedMs={null} />
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal && state.mode === "year") {
    const r = state.reveal;
    const mine = r.guesses?.find((g) => g.id === myId);
    return (
      <main className="card">
        {header}
        <p className="eyebrow">It came out in…</p>
        <p className="year-big">{r.year}</p>
        <div className="answer-row">
          {r.coverUrl && <img className="cover small" src={r.coverUrl} alt="" />}
          <div>
            <p className="song-title small">{r.title}</p>
            <p className="song-artist">{r.artist}</p>
          </div>
        </div>
        {mine && (
          <p className={`verdict ${mine.points > 0 ? "ok" : "miss"}`}>
            {mine.guess === null
              ? "No guess!"
              : mine.points > 0
                ? `You said ${mine.guess}: +${mine.points}`
                : `You said ${mine.guess}: so far!`}
          </p>
        )}
        <p className="status">Look at the host screen for everyone's guesses</p>
      </main>
    );
  }

  if (phase === "playing" && state) {
    return (
      <main className="card play">
        {header}
        <LastAward state={state} />
        <p className="round">
          <small>Round</small>
          <b>{state.roundIndex + 1}</b>
          <span>of {state.totalRounds}</span>
          {state.mode === "mashup" && <em>2 songs!</em>}
        </p>
        {state.mode === "word" && (
          <>
            <p className="word-big">{state.word}</p>
            <p className="lede center">Buzz and sing a song with this word!</p>
          </>
        )}
        {state.mode === "faces" && state.faces && (
          <>
            <FaceBlend urls={state.faces} small hints={state.faceHints} endsAt={state.endsAt} />
            <p className="lede center">Who are these two? Buzz and name them!</p>
          </>
        )}
        {amLocked ? (
          <div className="locked">
            <p className="verdict miss">
              {state.mode === "word" ? "Out for this round" : "Out for this song"}
            </p>
            <p className="lede center">Wait for the next one!</p>
          </div>
        ) : (
          <BuzzButton onBuzz={buzz} />
        )}
        <Countdown endsAt={state.endsAt} pausedMs={null} />
      </main>
    );
  }

  if (phase === "buzzed" && state?.mode === "word") {
    const v = state.vote;
    const canVote = v?.voterIds.includes(myId) && !v.votedIds.includes(myId);
    const voted = v?.votedIds.includes(myId);
    return (
      <main className={`card play ${iBuzzed ? "me-buzzed" : ""}`}>
        {header}
        <p className="word-big small">{state.word}</p>
        {iBuzzed ? (
          <>
            <p className="buzz-name">Sing it!</p>
            <p className="buzz-sub">The others are voting…</p>
          </>
        ) : (
          <>
            <p className="buzz-name">{buzzerName}</p>
            <p className="buzz-sub">is singing. Does it count?</p>
            {canVote && <VoteButtons onVote={(yes) => send({ type: "vote", yes })} />}
            {voted && <p className="status center">Vote sent!</p>}
          </>
        )}
        {v && <Countdown endsAt={v.endsAt} pausedMs={null} total={VOTE_MS} />}
      </main>
    );
  }

  if (phase === "buzzed" && state) {
    return (
      <main className={`card play ${iBuzzed ? "me-buzzed" : ""}`}>
        {header}
        {iBuzzed ? (
          <>
            <p className="buzz-name">You buzzed!</p>
            <p className="buzz-sub">
              {state.mode === "mashup" || state.mode === "faces"
                ? "Shout what you recognise!"
                : "Shout the artist and the title!"}
            </p>
          </>
        ) : (
          <>
            <p className="buzz-name">{buzzerName}</p>
            <p className="buzz-sub">buzzed first…</p>
          </>
        )}
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal && state.mode === "word") {
    const r = state.reveal;
    return (
      <main className="card">
        {header}
        <p className="word-big small">{r.word}</p>
        <p className={`verdict ${r.scorerName ? "ok" : ""}`}>
          {r.scorerName
            ? r.scorerName === me?.name
              ? "Your song counts! +1"
              : `${r.scorerName} scores!`
            : "Time's up!"}
        </p>
        <p className="status">Waiting for the host…</p>
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal?.people) {
    return (
      <main className="card">
        {header}
        <p className="eyebrow">It was…</p>
        {state.reveal.people.map((p) => (
          <div key={p.name} className="answer-row">
            <img className="cover small face" src={p.imageUrl} alt="" />
            <div>
              <p className="song-title small">{p.name}</p>
              <p className="credit">Photo: {p.credit}</p>
            </div>
          </div>
        ))}
        <p className="status">The host is giving the points…</p>
      </main>
    );
  }

  if (phase === "reveal" && state?.reveal) {
    const r = state.reveal;
    return (
      <main className="card">
        {header}
        <p className="eyebrow">{r.second ? "It was these two…" : "It was…"}</p>
        {r.second && (
          <div className="answer-row">
            {r.second.coverUrl && <img className="cover small" src={r.second.coverUrl} alt="" />}
            <div>
              <p className="song-title small">{r.second.title}</p>
              <p className="song-artist">{r.second.artist}</p>
            </div>
          </div>
        )}
        <div className="answer-row">
          {r.coverUrl && <img className="cover small" src={r.coverUrl} alt="" />}
          <div>
            <p className="song-title small">{r.title}</p>
            <p className="song-artist">{r.artist}</p>
          </div>
        </div>
        <p className="status">The host is giving the point…</p>
      </main>
    );
  }

  if (phase === "finished") {
    return (
      <main className="card">
        {header}
        <Confetti />
        <h1>Game over!</h1>
        <Podium players={players} />
        {myRank > 0 && (
          <p className="lede center">
            You finished #{myRank} with {me?.score ?? 0} point
            {me?.score === 1 ? "" : "s"}.
          </p>
        )}
        <p className="status center">Waiting for the host…</p>
      </main>
    );
  }

  // Lobby
  return (
    <main className="card player-lobby">
      <p className="eyebrow">Room {props.roomCode}</p>
      <h1>You&apos;re in!</h1>
      <p className="lede">Waiting for the host to start</p>
      <p className="status">
        {!connected
          ? "Connecting…"
          : state && !state.hostId
            ? "Connected, but the host screen isn't open"
            : "Connected"}
      </p>
      <BuzzerRecorder
        ready={connected}
        hasCustom={Boolean(state?.customBuzzIds.includes(myId))}
        onSave={(dataUrl) => {
          send({ type: "setBuzz", dataUrl });
          myClip.current = null;
          if (dataUrl) decodeClip(dataUrl).then((b) => (myClip.current = b));
        }}
      />
      <h2 className="section-title">In the room</h2>
      <PlayerList
        players={players}
        empty={connected ? "It's just you for now." : "Joining the lobby…"}
        customIds={state?.customBuzzIds}
        crownId={state?.hostId}
      />
      <button className="btn btn-ghost" type="button" onClick={props.onBack}>
        Leave
      </button>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Avatar(props: { name: string }) {
  return (
    <span className="av" style={{ background: colourFor(props.name) }} aria-hidden="true">
      {props.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function PlayerList(props: { players: Player[]; empty: string; customIds?: string[]; crownId?: string | null }) {
  if (props.players.length === 0) {
    return <p className="empty">{props.empty}</p>;
  }
  return (
    <ul className="player-list">
      {props.players.map((player) => (
        <li key={player.id}>
          <Avatar name={player.name} />
          <span className="player-name">{player.name}</span>
          {player.id === props.crownId && (
            <span className="crown" title="Host">
              ♛
            </span>
          )}
          {props.customIds?.includes(player.id) && (
            <span className="mic" title="Has their own buzzer sound">🎙 own buzzer</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Famous faces: the two photos morphed into one face. The top layer (person B)
 * slowly sways in and out so each face gets its moment. While the morph is
 * computed the picture stays blurred; if it fails, show a plain cross fade.
 * Hints appear under the picture as the round goes on.
 */
function FaceBlend(props: {
  urls: string[];
  small?: boolean;
  hints?: { kind: string; initials: string }[];
  endsAt?: number | null;
  pausedMs?: number | null;
}) {
  const [a, b] = props.urls;
  // undefined = still morphing, null = morph failed, object = morphed pictures
  const [morph, setMorph] = useState<Morph | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setMorph(undefined);
    morphFaces(a, b).then((m) => alive && setMorph(m));
    return () => {
      alive = false;
    };
  }, [a, b]);

  // Time into the round, for the hints.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!props.endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [props.endsAt]);
  const remaining = props.endsAt
    ? Math.max(0, props.endsAt - now)
    : (props.pausedMs ?? ROUND_MS);
  const elapsed = ROUND_MS - remaining;
  const showKind = elapsed >= HINT_KIND_MS;
  const showInitials = elapsed >= HINT_INITIALS_MS;

  return (
    <>
      <div className={`face-blend ${props.small ? "small" : ""}`}>
        {morph ? (
          <>
            <img src={morph.base} alt="" draggable={false} />
            {morph.top && <img src={morph.top} alt="" className="sway" draggable={false} />}
          </>
        ) : (
          <div className={morph === undefined ? "face-wait" : ""}>
            {[a, b].map((url, i) => (
              <img
                key={url}
                src={url}
                alt=""
                className={i === 1 ? "top" : ""}
                draggable={false}
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
            ))}
          </div>
        )}
        {morph === undefined && <span className="face-status">Morphing…</span>}
        <span className="face-credit">Photos: Wikimedia Commons</span>
      </div>
      {props.hints && (showKind || showInitials) && (
        <div className="face-hints">
          {props.hints.map((h, i) => (
            <span key={i} className="hint-chip">
              {showKind ? h.kind : ""}
              {showInitials ? ` · ${h.initials}` : ""}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Where this phone keeps its recorded buzzer, so it's ready for every game. */
const CLIP_KEY = "geekasong.buzzer";
function savedClip() {
  try {
    return localStorage.getItem(CLIP_KEY);
  } catch {
    return null;
  }
}
function storeClip(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(CLIP_KEY, dataUrl);
    else localStorage.removeItem(CLIP_KEY);
  } catch {
    /* private mode: just don't remember it */
  }
}

/** How to unblock the microphone, in the words of this device's browser. */
function micHelp(error: unknown) {
  const name = (error as { name?: string })?.name;
  const message = (error as { message?: string })?.message;
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone found. On a MacBook with the lid closed, or a desktop without a mic, there's nothing to record from. Record on your phone instead.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is busy or switched off. Close any app using it (Zoom, Teams, Meet…) and try again.";
  }
  if (name && name !== "NotAllowedError" && name !== "SecurityError") {
    return `Couldn't record (${name}${message ? `: ${message}` : ""}). Try on your phone instead.`;
  }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = /Macintosh/.test(ua) && !ios;
  const chrome = /Chrome|CriOS/.test(ua) && !/Edg/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const macPrivacy =
    " Still blocked? Your Mac is blocking the browser: System Settings, Privacy & Security, Microphone, switch your browser on, then quit and reopen it.";

  if (ios && /CriOS|FxiOS/.test(ua)) {
    return "Microphone is blocked. Open the iPhone Settings app, find your browser in the list, switch Microphone on, then try again.";
  }
  if (ios) {
    return "Safari didn't get the OK for the microphone. Tap Ask me again: the page reloads, you stay in the game, and Safari shows its popup again. No popup? Tap aA in the address bar, Website Settings, Microphone, Allow.";
  }
  if (/Android/.test(ua)) {
    return "Microphone is blocked. Tap the icon on the left of the address bar, then Permissions, then set Microphone to Allow. Then tap Record again.";
  }
  if (mac && !chrome && !firefox) {
    return "Safari didn't get the OK for the microphone. Click Ask me again: the page reloads, you stay in the game, and Safari asks again. No popup? In the menu bar click Safari, Settings for this website, Microphone, Allow." + macPrivacy;
  }
  if (firefox) {
    return "Microphone is blocked. Click the icon on the left of the address bar, remove the blocked microphone permission, then click Record again and choose Allow." + (mac ? macPrivacy : "");
  }
  return "Microphone is blocked. Click the sliders icon on the left of the address bar, switch Microphone on, then click Record again." + (mac ? macPrivacy : "");
}

/** "granted", "denied", "prompt", or "unknown" when the browser won't say. */
async function micPermission(): Promise<string> {
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state;
  } catch {
    return "unknown";
  }
}

const MicIcon = () => (
  <svg className="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

/**
 * Record your own buzzer: up to 2.5 seconds from the phone's microphone.
 * The phone remembers it and sends it automatically in every new game.
 * Needs https (fine on geekasong.com, not on a local network address).
 */
function BuzzerRecorder(props: {
  ready: boolean;
  hasCustom: boolean;
  onSave: (dataUrl: string | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "asking" | "recording" | "recorded">("idle");
  const [clip, setClip] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(savedClip);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // A buzzer recorded in an earlier game: send it as soon as we're connected.
  useEffect(() => {
    if (props.ready && mine && !props.hasCustom) props.onSave(mine);
  }, [props.ready]);

  const supported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  if (!supported) {
    return (
      <p className="hint">
        Want your own buzzer sound? Open the game on https://geekasong.com to record one.
      </p>
    );
  }

  /** Like Claude: explain first, then let the browser show its Allow popup. */
  async function begin() {
    setError(null);
    const state = await micPermission();
    // Only show our explanation when the browser will really ask.
    // Granted or "blocked": go straight to the browser, which may still ask.
    if (state === "prompt") setStatus("asking");
    else start();
  }

  async function start() {
    setError(null);
    setAudioSession("play-and-record");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      );
      const rec = new MediaRecorder(stream, {
        ...(type ? { mimeType: type } : {}),
        audioBitsPerSecond: 64000,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioSession("playback");
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/mp4" });
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          if (url.length > MAX_CLIP_CHARS) {
            setError("Too long, try a shorter sound.");
            setStatus("idle");
            return;
          }
          setClip(url);
          setStatus("recorded");
          new Audio(url).play().catch(() => {});
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("recording");
      setTimeout(() => rec.state === "recording" && rec.stop(), 2500);
    } catch (err) {
      setAudioSession("playback");
      const name = (err as { name?: string })?.name;
      setDenied(name === "NotAllowedError" || name === "SecurityError");
      setError(micHelp(err));
      setStatus("idle");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function use(url: string | null) {
    storeClip(url);
    setMine(url);
    props.onSave(url);
    setStatus("idle");
    setClip(null);
  }

  const play = (url: string) => new Audio(url).play().catch(() => {});

  return (
    <div className="recorder">
      <div className="rec-head">
        <span className={`rec-badge ${mine ? "on" : ""}`}>
          <MicIcon />
        </span>
        <div>
          <p className="rec-title">{mine ? "Your buzzer is set" : "Record your own buzzer"}</p>
          <p className="rec-sub">
            {mine
              ? "It plays on the speaker when you buzz first, in every game."
              : "2 seconds of anything: a scream, a catchphrase, a noise. Plays when you buzz first."}
          </p>
        </div>
      </div>
      {status === "asking" ? (
        <div className="mic-ask">
          <p>
            Geekasong needs your microphone for 2 seconds to record your buzzer. Your browser
            will ask next: tap <b>Allow</b>.
          </p>
          <div className="rec-actions two">
            <button className="chip" type="button" onClick={() => setStatus("idle")}>
              Not now
            </button>
            <button className="chip selected" type="button" onClick={start}>
              Allow microphone
            </button>
          </div>
        </div>
      ) : status === "recording" ? (
        <button className="btn rec on" type="button" onClick={stop}>
          ● Recording… tap to stop
        </button>
      ) : status === "recorded" && clip ? (
        <div className="rec-actions">
          <button className="chip" type="button" onClick={() => play(clip)}>
            ▶ Play
          </button>
          <button className="chip" type="button" onClick={begin}>
            Redo
          </button>
          <button className="chip selected" type="button" onClick={() => use(clip)}>
            Use it
          </button>
        </div>
      ) : mine ? (
        <div className="rec-actions">
          <button className="chip" type="button" onClick={() => play(mine)}>
            ▶ Play
          </button>
          <button className="chip" type="button" onClick={begin}>
            Record again
          </button>
          <button className="chip" type="button" onClick={() => use(null)}>
            Remove
          </button>
        </div>
      ) : (
        <button className="btn rec" type="button" onClick={begin}>
          <MicIcon /> Record my buzzer
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {denied && (
        <button className="btn btn-ghost retry" type="button" onClick={() => window.location.reload()}>
          Ask me again
        </button>
      )}
    </div>
  );
}

/** "Point to Aurora!" banner at the start of the next song. */
function LastAward(props: { state: StateMessage }) {
  const a = props.state.lastAward;
  if (!a || a.round !== props.state.roundIndex - 1) return null;
  return (
    <p className={`toast ${a.name ? "ok" : ""}`}>
      {a.points !== undefined
        ? a.name
          ? `${a.name} was closest! +${a.points}`
          : "Nobody was close on the last one"
        : a.name
          ? `Point to ${a.name}!`
          : "Nobody got the last one"}
    </p>
  );
}

/** What each game mode is, shown in the lobby. */
const MODE_HINTS: Record<GameMode, string> = {
  blindtest: "A song plays. Buzz first and shout the artist and title.",
  year: "A song plays. Everyone picks the year it came out: exact 3 points, within 2 years 2, within 5 years 1.",
  word: "A word appears. Buzz and sing a song with that word in it; the others vote if it counts. No music needed.",
  mashup: "Two songs play at the same time. Buzz and shout what you recognise: 1 point per song.",
  faces: "Two famous faces blended into one. Buzz and name them both: 1 point per person.",
  mix: "A bit of everything: rounds rotate between Blind test, Find the year, Famous faces, Mashup and Song with a word.",
};

/** Song with a word: thumbs up or down on the singer's song. */
function VoteButtons(props: { onVote: (yes: boolean) => void }) {
  return (
    <div className="vote-buttons">
      <button type="button" className="vote yes" onClick={() => props.onVote(true)}>
        👍 Counts
      </button>
      <button type="button" className="vote no" onClick={() => props.onVote(false)}>
        👎 Nope
      </button>
    </div>
  );
}

/** Find the year: pick a year with a slider and fine tune buttons, then lock it. */
function YearPicker(props: { locked: boolean; onLock: (year: number) => void }) {
  const max = new Date().getFullYear();
  const [year, setYear] = useState(1990);
  const [sent, setSent] = useState<number | null>(null);

  if (props.locked || sent !== null) {
    return (
      <div className="year-picker">
        <p className="year-big locked">{sent ?? "✓"}</p>
        <p className="status center">Locked in! Waiting for the others…</p>
      </div>
    );
  }

  const nudge = (delta: number) =>
    setYear((y) => Math.min(max, Math.max(YEAR_MIN, y + delta)));

  return (
    <div className="year-picker">
      <p className="year-big">{year}</p>
      <input
        className="year-slider"
        type="range"
        min={YEAR_MIN}
        max={max}
        value={year}
        aria-label="Year"
        onChange={(e) => setYear(Number(e.target.value))}
      />
      <div className="year-steps">
        {[-10, -1, 1, 10].map((d) => (
          <button key={d} type="button" className="chip" onClick={() => nudge(d)}>
            {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
          </button>
        ))}
      </div>
      <button
        className="btn btn-host"
        type="button"
        onClick={() => {
          setSent(year);
          props.onLock(year);
        }}
      >
        Lock in {year}
      </button>
    </div>
  );
}

/** Find the year: everyone's guess, closest first. */
function GuessList(props: {
  guesses: { id: string; name: string; guess: number | null; points: number }[];
  year: number;
}) {
  return (
    <ul className="results">
      {props.guesses.map((g) => (
        <li key={g.id} className={g.points > 0 ? "ok" : "miss"}>
          <span>
            {g.name}: {g.guess ?? "no guess"}
            {g.guess !== null && g.guess !== props.year && (
              <small> ({g.guess > props.year ? "+" : "−"}{Math.abs(g.guess - props.year)})</small>
            )}
          </span>
          <span>+{g.points}</span>
        </li>
      ))}
    </ul>
  );
}

function rank(players: Player[]) {
  return [...players].sort((a, b) => b.score - a.score);
}

function Leaderboard(props: { players: Player[]; compact?: boolean }) {
  const ranked = rank(props.players);
  if (ranked.length === 0) return null;
  return (
    <ol className={`leaderboard ${props.compact ? "compact" : ""}`}>
      {ranked.map((p, i) => (
        <li key={p.id}>
          <span>
            <b>{i + 1}.</b> {p.name}
          </span>
          <span>{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

function Podium(props: { players: Player[] }) {
  const top = rank(props.players).slice(0, 3);
  // Classic podium order: 2nd, 1st, 3rd.
  const order = [top[1], top[0], top[2]];
  const places = [2, 1, 3];
  return (
    <div className="podium">
      {order.map((p, i) =>
        p ? (
          <div key={p.id} className={`step step-${places[i]}`}>
            <span className="step-name">{p.name}</span>
            <span className="step-score">{p.score}</span>
            <span className="step-block">{places[i]}</span>
          </div>
        ) : (
          <div key={`empty-${i}`} className="step step-empty" />
        )
      )}
    </div>
  );
}

/** Bar + seconds left. Frozen when the music is paused by a buzz. */
function Countdown(props: {
  endsAt: number | null;
  pausedMs: number | null;
  big?: boolean;
  total?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!props.endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [props.endsAt]);

  const remaining = props.endsAt
    ? Math.max(0, props.endsAt - now)
    : Math.max(0, props.pausedMs ?? 0);
  const fraction = Math.min(1, remaining / (props.total ?? ROUND_MS));
  const urgent = remaining < 5000;

  return (
    <div className={`countdown ${props.big ? "big" : ""}`}>
      <div className="countdown-track">
        <div
          className={`countdown-fill ${urgent ? "urgent" : ""}`}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      <span className="countdown-number">{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Connect to a PartyKit room and keep the latest game state. */
function useGame(
  room: string,
  role: "host" | "player",
  name?: string,
  onClip?: (playerId: string, dataUrl: string | null) => void
) {
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;
  const [state, setState] = useState<StateMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState("");
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({
      host: SERVER_HOST,
      room,
      id: stableId(room, role),
      query: role === "host" ? { role } : { role, name: name || "Player" },
    });
    socketRef.current = socket;
    setMyId(socket.id);

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string) as ServerMessage;
      if (data.type === "state") setState(data);
      else if (data.type === "clip") onClipRef.current?.(data.playerId, data.dataUrl);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [room, role, name]);

  function send(message: ClientMessage) {
    socketRef.current?.send(JSON.stringify(message));
  }

  return { state, connected, myId, send };
}

/** A tiny silent sound, played on a tap to unlock audio on iOS/Safari. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Plays the round's music on the host device. Two audio "decks" so a Mashup
 * can play two songs on top of each other. Each deck is reused for the whole
 * game: once a tap has started it, browsers let it keep playing.
 * playing: plays (resumes where it stopped after a wrong answer)
 * buzzed:  paused
 * reveal:  plays on so everyone hears the song(s) with the answer
 */
function useHostMusic(urls: (string | undefined)[], phase: Phase) {
  const decks = useRef<HTMLAudioElement[]>([]);
  const current = useRef<string[]>(["", ""]);
  const [blocked, setBlocked] = useState(false);

  function deck(i: number) {
    if (!decks.current[i]) decks.current[i] = new Audio();
    return decks.current[i];
  }

  function unlock() {
    unlockSound();
    [0, 1].forEach((i) => {
      const audio = deck(i);
      if (!audio.paused) return; // already playing: it's unlocked
      audio.src = SILENT_WAV;
      current.current[i] = "";
      audio.play().catch(() => {});
    });
  }

  function playAll() {
    const active = [0, 1].filter((i) => urls[i]);
    Promise.all(active.map((i) => deck(i).play()))
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }

  const key = urls.join("|");
  useEffect(() => {
    const shouldPlay = phase === "playing" || phase === "reveal";
    [0, 1].forEach((i) => {
      const url = urls[i];
      const audio = deck(i);
      if (shouldPlay && url) {
        if (current.current[i] !== url) {
          audio.src = url;
          current.current[i] = url;
        }
      } else {
        audio.pause();
      }
    });
    if (shouldPlay && urls.some(Boolean)) playAll();
  }, [key, phase]);

  // Stop the music if the host leaves the screen.
  useEffect(() => () => decks.current.forEach((a) => a.pause()), []);

  return { blocked, unlock, retry: playAll };
}

/** Keep the screen on during a game (supported on recent iOS and Android). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/* ------------------------------------------------------------------ */
/* Sound effects, generated in the browser (no files needed)           */
/* ------------------------------------------------------------------ */

let soundCtx: AudioContext | null = null;

function getSoundCtx() {
  if (!soundCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    soundCtx = new Ctor();
  }
  return soundCtx;
}

/**
 * Safari's audio mode. "playback" keeps sound on when the iPhone is on silent,
 * but refuses the microphone, so recording switches to "play-and-record".
 */
function setAudioSession(type: "playback" | "play-and-record" | "auto") {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    /* not supported here */
  }
}

/** Call inside a tap: browsers only allow sound after the user touches the page. */
function unlockSound() {
  // Recent Safari: play sound even when the iPhone is on silent.
  setAudioSession("playback");
  const ctx = getSoundCtx();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

/** Plays the chosen buzzer sound. */
function playBuzz(sound: BuzzSound) {
  const ctx = getSoundCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  if (sound === "scratch") scratch(ctx);
  else if (sound === "gameshow") gameShow(ctx);
  else airhorn(ctx);
}

/** Master output with a limiter so loud sounds don't crackle. */
function output(ctx: AudioContext) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.connect(ctx.destination);
  return limiter;
}

/** Party airhorn: "BWAP BWAP BWAAAAP". */
function airhorn(ctx: AudioContext) {
  const out = output(ctx);
  const t0 = ctx.currentTime;
  const blasts: [number, number][] = [
    [0, 0.14],
    [0.19, 0.14],
    [0.38, 0.7],
  ];
  // Soft clipping gives the horn its brassy rasp.
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 3);
  }
  shaper.curve = curve;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  const level = ctx.createGain();
  level.gain.value = 0.55;
  shaper.connect(filter).connect(level).connect(out);

  for (const [start, length] of blasts) {
    const t = t0 + start;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
    gain.gain.setValueAtTime(0.5, t + length - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    gain.connect(shaper);
    for (const ratio of [1, 1.006, 0.994, 2.01]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = 440 * ratio;
      osc.frequency.setValueAtTime(f * 0.97, t);
      osc.frequency.linearRampToValueAtTime(f, t + 0.03);
      osc.frequency.linearRampToValueAtTime(f * 0.96, t + length);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + length + 0.02);
    }
  }
}

/** DJ record scratch: "wikka wikka". */
function scratch(ctx: AudioContext) {
  const out = output(ctx);
  const t0 = ctx.currentTime;
  const duration = 0.6;

  // Noise layer for the vinyl friction.
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 4;

  // Pitched layer for the "voice" of the record.
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  // Two strokes forward and back.
  const strokes = [0, 0.14, 0.3, 0.42];
  strokes.forEach((s, i) => {
    const t = t0 + s;
    const up = i % 2 === 0;
    band.frequency.setValueAtTime(up ? 400 : 2600, t);
    band.frequency.exponentialRampToValueAtTime(up ? 2600 : 400, t + 0.12);
    osc.frequency.setValueAtTime(up ? 120 : 520, t);
    osc.frequency.exponentialRampToValueAtTime(up ? 520 : 120, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.8, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  });

  noise.connect(band).connect(gain);
  osc.connect(gain);
  gain.connect(out);
  noise.start(t0);
  osc.start(t0);
  noise.stop(t0 + duration);
  osc.stop(t0 + duration);
}

/** Game show bell: "ding ding ding" going up. */
function gameShow(ctx: AudioContext) {
  const out = output(ctx);
  const t0 = ctx.currentTime;
  [784, 988, 1175, 1568].forEach((freq, i) => {
    const t = t0 + i * 0.11;
    const length = i === 3 ? 0.9 : 0.35;
    for (const [type, mult, level] of [
      ["triangle", 1, 0.7],
      ["sine", 2.76, 0.2], // bell overtone
    ] as [OscillatorType, number, number][]) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      gain.connect(out);
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mult;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + length + 0.02);
    }
  });
}

/** Turn a recorded data URL into a playable sound (null if this browser can't). */
async function decodeClip(dataUrl: string): Promise<AudioBuffer | null> {
  const ctx = getSoundCtx();
  if (!ctx) return null;
  try {
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

/** Play someone's recorded buzzer, boosted so it cuts through the room. */
function playClip(buffer: AudioBuffer) {
  const ctx = getSoundCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 1.8;
  source.connect(gain).connect(output(ctx));
  source.start();
}

/** A happy two note ding when someone scores. */
function playDing() {
  const ctx = getSoundCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const start = t + i * 0.12;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app");
}
createRoot(root).render(<App />);
