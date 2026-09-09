import { useEffect, useRef, useState } from "react";
import { MONTH_ABBR, formatMonth, parseMonth } from "@/lib/classic/months";

/**
 * The register's month field: type "Jun 2026", or pick from a small calendar.
 *
 * A re-creation of the original's `.month-input`, and it exists for the same
 * reason: `<input type="month">` renders as a different control in every browser
 * and, on the phones organisers actually use at a teaching day, as a full-screen
 * date wheel that insists on a day as well. A register has no days, only months.
 *
 * The typed value is parsed leniently (parseMonth takes "jun 26", "2026-06",
 * "June 2026") and normalised on blur, so typing is never punished for being
 * informal.
 */
export function MonthInput({
  value,
  onChange,
  placeholder = "e.g. Jun 2026",
  id,
}: {
  /** 'YYYY-MM', or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value ? formatMonth(value) : "");
  const [open, setOpen] = useState(false);
  const [yearShown, setYearShown] = useState(() =>
    value ? Number(value.split("-")[0]) : new Date().getFullYear());
  const wrap = useRef<HTMLDivElement>(null);

  // The field is also driven from outside — "edit this status" fills it in — so
  // it follows the value it is given rather than only its own typing.
  useEffect(() => {
    setText(value ? formatMonth(value) : "");
    if (value) setYearShown(Number(value.split("-")[0]));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const commit = () => {
    const parsed = parseMonth(text);
    onChange(parsed);
    setText(parsed ? formatMonth(parsed) : "");
  };

  const selectedMonth = value ? Number(value.split("-")[1]) : null;
  const selectedYear = value ? Number(value.split("-")[0]) : null;

  return (
    <div className="month-input" ref={wrap}>
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      <button
        type="button"
        className="month-cal-btn"
        aria-label="Open calendar"
        onClick={() => setOpen((o) => !o)}
      >
        📅
      </button>

      {open && (
        <div className="month-pop open">
          <div className="yr">
            <button type="button" onClick={() => setYearShown((y) => y - 1)}>‹</button>
            <b>{yearShown}</b>
            <button type="button" onClick={() => setYearShown((y) => y + 1)}>›</button>
          </div>
          <div className="month-grid">
            {MONTH_ABBR.map((label, i) => {
              const on = selectedMonth === i + 1 && selectedYear === yearShown;
              return (
                <button
                  key={label}
                  type="button"
                  className={on ? "sel" : undefined}
                  onClick={() => {
                    onChange(`${yearShown}-${String(i + 1).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="pop-foot">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                setOpen(false);
              }}
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
