/**
 * Host lobby settings: game tiles, a compact settings list, and sheets
 * for the choices that have too many options to show inline (music).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryId, type GameMode } from "./types";

/* ---------------- game mode tiles ---------------- */

const MODE_TILES: { id: GameMode; label: string; sub: string; icon: ReactNode }[] = [
  {
    id: "blindtest",
    label: "Blind test",
    sub: "Name the song",
    icon: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z" />,
  },
  {
    id: "year",
    label: "Find the year",
    sub: "When did it come out?",
    icon: <path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 5h16M8 3v5m8-5v5" />,
  },
  {
    id: "word",
    label: "Song with a word",
    sub: "Sing it, no music",
    icon: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 5.5h8" />,
  },
  {
    id: "mashup",
    label: "Mashup",
    sub: "Two songs at once",
    icon: (
      <>
        <circle cx="9" cy="12" r="6" />
        <circle cx="15" cy="12" r="6" />
      </>
    ),
  },
  {
    id: "faces",
    label: "Famous faces",
    sub: "Two stars, one face",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9 10h.01M15 10h.01M9 14.5c1.6 1.6 4.4 1.6 6 0" />
      </>
    ),
  },
  {
    id: "mix",
    label: "Mixed game",
    sub: "A bit of everything",
    icon: <path d="M4 7h3c5 0 5 10 10 10h3m0 0-2-2m2 2-2 2M4 17h3c1.5 0 2.5-.9 3.4-2.2M20 7h-3c-1.5 0-2.5.9-3.4 2.2M20 7l-2-2m2 2-2 2" />,
  },
];

export function ModePicker(props: { value: GameMode; onChange: (m: GameMode) => void }) {
  return (
    <div className="modes" role="radiogroup" aria-label="Game">
      {MODE_TILES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={props.value === m.id}
          className={`mode ${props.value === m.id ? "selected" : ""}`}
          onClick={() => props.onChange(m.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {m.icon}
          </svg>
          <span className="mode-name">{m.label}</span>
          <span className="mode-sub">{m.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- segmented control ---------------- */

export function Seg<T extends string | number>(props: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={`seg ${props.wide ? "wide" : ""}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={props.value === o.id}
          className={props.value === o.id ? "on" : ""}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- settings list ---------------- */

export function SettingRow(props: {
  label: string;
  value?: string;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  if (props.onOpen) {
    return (
      <button type="button" className="setting" onClick={props.onOpen}>
        <span className="setting-label">{props.label}</span>
        <span className="setting-value">{props.value}</span>
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    );
  }
  return (
    <div className="setting">
      <span className="setting-label">{props.label}</span>
      {props.children}
    </div>
  );
}

/* ---------------- sheet (bottom sheet on phones, dialog on desktop) ---------------- */

export function Sheet(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);
  // Rendered on <body>: the lobby card's blur effect would otherwise trap it.
  return createPortal(
    <div className="sheet-wrap" onClick={props.onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{props.title}</h2>
          <button ref={doneRef} type="button" className="sheet-x" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        <div className="sheet-foot">
          {props.footer ?? (
            <button type="button" className="btn btn-host" onClick={props.onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------------- music ---------------- */

const PRESETS: { label: string; ids: CategoryId[] }[] = [
  { label: "Throwback party", ids: ["80s", "90s", "2000s", "party"] },
  { label: "Soirée française", ids: ["variete", "chanson"] },
  { label: "Today's hits", ids: ["hits", "2010s", "2020s"] },
  { label: "Rock night", ids: ["classicrock", "rock", "hardrock", "indie"] },
  { label: "Dance floor", ids: ["disco", "dance", "house", "party"] },
  { label: "Family", ids: ["kids", "cartoons", "movies", "musicals"] },
];

const labelOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function musicSummary(ids: CategoryId[]) {
  if (ids.length === 0) return "Pick some music";
  const preset = PRESETS.find((p) => sameSet(p.ids, ids));
  if (preset) return preset.label;
  const names = ids.map(labelOf);
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function MusicSheet(props: {
  value: CategoryId[];
  onChange: (ids: CategoryId[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const shown = useMemo(
    () => CATEGORIES.filter((c) => !q || fold(c.label).includes(q) || fold(c.group).includes(q)),
    [q]
  );
  const toggle = (id: CategoryId) =>
    props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);

  return (
    <Sheet
      title="Music"
      onClose={props.onClose}
      footer={
        <div className="foot-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={props.value.length === 0}
            onClick={() => props.onChange([])}
          >
            Clear
          </button>
          <button type="button" className="btn btn-host" onClick={props.onClose}>
            {props.value.length === 0 ? "Done" : `Done · ${props.value.length} picked`}
          </button>
        </div>
      }
    >
      {!q && (
        <>
          <h3 className="group-title">Quick picks</h3>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`preset ${sameSet(p.ids, props.value) ? "selected" : ""}`}
                onClick={() => props.onChange([...p.ids])}
              >
                <span>{p.label}</span>
                <small>{p.ids.map(labelOf).join(", ")}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <input
        className="search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search genres, decades…"
        aria-label="Search genres"
      />
      {CATEGORY_GROUPS.map((group) => {
        const items = shown.filter((c) => c.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="chip-group">
            <h3 className="group-title">{group}</h3>
            <div className="chips">
              {items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={props.value.includes(c.id)}
                  className={`chip small ${props.value.includes(c.id) ? "selected" : ""}`}
                  onClick={() => toggle(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <p className="empty">No genre matches “{query}”.</p>}
    </Sheet>
  );
}

/** A sheet with a short list of options, single or multiple choice. */
export function OptionSheet<T extends string>(props: {
  title: string;
  options: readonly { id: T; label: string }[];
  selected: T[];
  onPick: (id: T) => void;
  onClose: () => void;
  note?: string;
}) {
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      {props.note && <p className="hint first">{props.note}</p>}
      <div className="option-list">
        {props.options.map((o) => {
          const on = props.selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className={`option ${on ? "selected" : ""}`}
              aria-pressed={on}
              onClick={() => props.onPick(o.id)}
            >
              <span>{o.label}</span>
              <span className="tick" aria-hidden="true">
                {on ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
