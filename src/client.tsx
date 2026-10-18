import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import PartySocket from "partysocket";

import "./styles.css";
import {
  BUZZ_SOUNDS,
  CATEGORIES,
  CATEGORY_GROUPS,
  GAME_MODES,
  LANGUAGES,
  LOCAL_PREFIX,
  PLAY_STYLES,
  ROUND_MS,
  ROUND_OPTIONS,
  YEAR_MIN,
  type BuzzSound,
  type CategoryId,
  type ClientMessage,
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

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  function hostGame() {
    unlockSound();
    setRoomCode(generateRoomCode());
    setScreen("host");
  }

  return (
    <div className={`app app-${screen === "host" ? "host" : "player"}`}>
      {screen === "home" && (
        <HomeScreen onHost={hostGame} onJoin={() => setScreen("join")} />
      )}
      {screen === "join" && (
        <JoinScreen
          roomCode={roomCode}
          playerName={playerName}
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
      <p className="eyebrow">Friday night</p>
      <h1>Blind Test</h1>
      <p className="lede">Hear it. Buzz it. Shout it.</p>
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
      <h1>Join a game</h1>
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
  const { state, connected, send, myId } = useGame(props.roomCode, "host");
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

  const phase: Phase = state?.phase ?? "lobby";
  const players = state?.players ?? [];
  const music = useHostMusic(state?.host?.previewUrl, phase);
  useWakeLock(phase !== "lobby");

  // Loud buzzer on the host device (the one plugged into the speaker).
  const prevPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (phase === "buzzed" && prevPhase.current !== "buzzed") {
      playBuzz(state?.buzzSound ?? buzzSound);
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
    send({ type: "start", categories, rounds, language, buzzSound, mode: gameMode });
  }

  function award(playerId: string | null) {
    music.unlock();
    if (playerId) playDing();
    send({ type: "award", playerId });
  }

  const roundLabel = state
    ? `Song ${state.roundIndex + 1} of ${state.totalRounds}`
    : "";

  if (phase === "loading") {
    const yearMode = state?.mode === "year";
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
          <button className="buzzer" type="button" onPointerDown={hostBuzz}>
            BUZZ
          </button>
        ) : (
          <div className="vinyl" aria-hidden="true" />
        )}
        <h1>{oneDevice ? "Shout it out!" : "Buzz when you know it!"}</h1>
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
          {oneDevice ? "Someone got it! Show the answer" : "Nobody knows? Show the answer"}
        </button>
      </main>
    );
  }

  if (phase === "buzzed" && state) {
    return (
      <main className="card stage buzzed">
        <p className="eyebrow">{roundLabel}</p>
        <p className="buzz-name">{nameOf(state.buzzerId)}</p>
        <p className="buzz-sub">buzzed! Shout your answer!</p>
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
  const canStart = connected && players.length > 0 && categories.length > 0;
  const style = PLAY_STYLES.find((s) => s.id === playStyle)!;
  return (
    <main className="card host-lobby">
      <h2 className="section-title first">How are you playing?</h2>
      <div className="segmented two">
        {PLAY_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${playStyle === s.id ? "selected" : ""}`}
            onClick={() => choosePlayStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
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
          <h2 className="section-title">Playing too?</h2>
          {hostPlaying ? (
            <div className="host-me">
              <span>
                You're in as <b>{hostName.trim()}</b>
              </span>
              <button className="chip" type="button" onClick={leaveAsHost}>
                Just hosting
              </button>
            </div>
          ) : (
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
          )}

          <p className="eyebrow join-at">Join at {window.location.host} with code</p>
          <p className="room-code">{props.roomCode}</p>
          <p className="status">{connected ? "Live lobby" : "Connecting…"}</p>
          <PlayerList players={players} empty="Waiting for players to join…" />
        </>
      )}

      <h2 className="section-title">Game</h2>
      <div className="chips">
        {GAME_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!m.ready}
            className={`chip ${m.id === gameMode ? "selected" : ""}`}
            onClick={() => {
              if (m.id === "blindtest" || m.id === "year") setGameMode(m.id);
            }}
          >
            {m.label}
            {!m.ready && <span className="soon">soon</span>}
          </button>
        ))}
      </div>

      <h2 className="section-title">Language</h2>
      <div className="segmented three">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`chip ${language === l.id ? "selected" : ""}`}
            onClick={() => setLanguage(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">
        Music (pick as many as you like)
        {categories.length > 0 && (
          <button type="button" className="link" onClick={() => setCategories([])}>
            Clear {categories.length}
          </button>
        )}
      </h2>
      {CATEGORY_GROUPS.map((group) => (
        <div key={group} className="chip-group">
          <h3 className="group-title">{group}</h3>
          <div className="chips">
            {CATEGORIES.filter((c) => c.group === group).map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categories.includes(c.id)}
                className={`chip ${categories.includes(c.id) ? "selected" : ""}`}
                onClick={() => toggleCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <h2 className="section-title">How many songs?</h2>
      <div className="segmented">
        {ROUND_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip ${rounds === n ? "selected" : ""}`}
            onClick={() => setRounds(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {gameMode === "year" && (
        <p className="hint">
          Everyone picks the year the song came out. Exact year: 3 points,
          within 2 years: 2, within 5 years: 1.
        </p>
      )}

      <h2 className="section-title">Buzzer sound (tap to hear it)</h2>
      <div className="segmented three">
        {BUZZ_SOUNDS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${buzzSound === s.id ? "selected" : ""}`}
            onClick={() => {
              unlockSound();
              setBuzzSound(s.id);
              playBuzz(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

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
            : categories.length === 0
              ? "Pick some music"
              : `Start with ${players.length} player${players.length > 1 ? "s" : ""}`}
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onBack}>
          Leave
        </button>
      </div>
    </main>
  );
}

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
  useEffect(() => {
    if (iBuzzed) {
      playBuzz(state?.buzzSound ?? "airhorn");
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
      <span>
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
          {state?.mode === "year"
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
          Song {state.roundIndex + 1} of {state.totalRounds}
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
        <p className="eyebrow center">
          Song {state.roundIndex + 1} of {state.totalRounds}
        </p>
        {amLocked ? (
          <div className="locked">
            <p className="verdict miss">Out for this song</p>
            <p className="lede center">Wait for the next one!</p>
          </div>
        ) : (
          <button className="buzzer" type="button" onPointerDown={buzz}>
            BUZZ
          </button>
        )}
        <Countdown endsAt={state.endsAt} pausedMs={null} />
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
            <p className="buzz-sub">Shout the artist and the title!</p>
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

  if (phase === "reveal" && state?.reveal) {
    const r = state.reveal;
    return (
      <main className="card">
        {header}
        <p className="eyebrow">It was…</p>
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
      <PlayerList
        players={players}
        empty={connected ? "It's just you for now." : "Joining the lobby…"}
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

function PlayerList(props: { players: Player[]; empty: string }) {
  if (props.players.length === 0) {
    return <p className="empty">{props.empty}</p>;
  }
  return (
    <ul className="player-list">
      {props.players.map((player) => (
        <li key={player.id}>
          <span className="player-name">{player.name}</span>
        </li>
      ))}
    </ul>
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
  const fraction = remaining / ROUND_MS;
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
function useGame(room: string, role: "host" | "player", name?: string) {
  const [state, setState] = useState<StateMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState("");
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({
      host: SERVER_HOST,
      room,
      query: role === "host" ? { role } : { role, name: name || "Player" },
    });
    socketRef.current = socket;
    setMyId(socket.id);

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string) as ServerMessage;
      if (data.type === "state") setState(data);
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
 * Plays the song on the host device. One audio element for the whole game:
 * once a tap has started it, browsers let it keep playing.
 * playing: plays (resumes where it stopped after a wrong answer)
 * buzzed:  paused
 * reveal:  plays on so everyone hears the song with the answer
 */
function useHostMusic(previewUrl: string | undefined, phase: Phase) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrl = useRef("");
  const [blocked, setBlocked] = useState(false);

  function getAudio() {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  function unlock() {
    unlockSound();
    const audio = getAudio();
    if (!audio.paused) return; // already playing: it's unlocked
    audio.src = SILENT_WAV;
    currentUrl.current = "";
    audio.play().catch(() => {});
  }

  function retry() {
    getAudio()
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }

  useEffect(() => {
    const audio = getAudio();
    const shouldPlay = (phase === "playing" || phase === "reveal") && previewUrl;
    if (shouldPlay) {
      if (currentUrl.current !== previewUrl) {
        audio.src = previewUrl;
        currentUrl.current = previewUrl;
      }
      retry();
    } else {
      audio.pause();
    }
  }, [previewUrl, phase]);

  // Stop the music if the host leaves the screen.
  useEffect(() => () => audioRef.current?.pause(), []);

  return { blocked, unlock, retry };
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

/** Call inside a tap: browsers only allow sound after the user touches the page. */
function unlockSound() {
  // Recent Safari: play sound even when the iPhone is on silent.
  const session = (navigator as unknown as { audioSession?: { type: string } })
    .audioSession;
  if (session) session.type = "playback";
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
