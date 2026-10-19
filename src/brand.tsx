/**
 * Geekasong look: plum black, one lavender accent, cream type.
 * Wordmark, background record, glowing buzzer, QR join card, confetti.
 */

import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";

/** Soft pastels for avatars, same name gives the same colour on every phone. */
const AVATARS = ["#C9A7FF", "#F4A58A", "#A8E6C8", "#F6E3A1", "#9FD3F7", "#F5A8C8"];

export function colourFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

export function Wordmark() {
  return (
    <h1 className="wordmark">
      Geekasong
      <svg className="bolt" viewBox="0 0 24 32" aria-hidden="true">
        <path d="M14 0 L2 18 H11 L8 32 L22 12 H13 Z" />
      </svg>
    </h1>
  );
}

/**
 * Background: thin warm arcs everywhere, plus a big record sliding in
 * from the bottom left on the home screen.
 */
export function Backdrop(props: { record?: boolean }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <i className="arc arc-1" />
      <i className="arc arc-2" />
      {props.record && <i className="big-record" />}
    </div>
  );
}

/** The phone buzzer: a glowing lavender button. */
export function BuzzButton(props: { onBuzz: () => void }) {
  return (
    <button
      className="buzzer"
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        props.onBuzz();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") props.onBuzz();
      }}
    >
      <span>BUZZ</span>
    </button>
  );
}

/** Host lobby: QR code that opens the game with the room code filled in, plus the code. */
export function JoinCard(props: { roomCode: string }) {
  const link = `${window.location.origin}/?join=${props.roomCode}`;
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#120C14", light: "#F6EEE3" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [link]);

  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="joincard">
      <div className="qr" role="img" aria-label={`QR code to join room ${props.roomCode}`}>
        {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
      <div className="join-steps">
        <p className="join-label">Scan with your phone camera, or go to</p>
        <p className="join-host">{window.location.host}</p>
        <p className="join-label">and enter the code</p>
        <div className="code-box">
          <span className="room-code">{props.roomCode}</span>
          <button type="button" className="copy" onClick={copy} aria-label="Copy the join link">
            {copied ? (
              "✓"
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="8" width="12" height="13" rx="2.5" />
                <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-7A2.5 2.5 0 0 0 4 5.5v9A2.5 2.5 0 0 0 6.5 17H8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One burst of confetti for the winner. */
export function Confetti() {
  const colours = ["#C29BFF", "#F6EEE3", "#F4A58A", "#A8E6C8", "#E9D3FF"];
  const [pieces] = useState(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.6 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 160,
      spin: (Math.random() - 0.5) * 900,
      colour: colours[i % colours.length],
      round: Math.random() < 0.35,
      w: 6 + Math.random() * 7,
    }))
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.w * 1.7,
              borderRadius: p.round ? "50%" : 2,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
