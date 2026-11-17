// Shared components (BUILD_PLAN §4). No sentences, numbers carry meaning.
import { useState, type ReactNode, type CSSProperties } from "react";
import { Table, ChartBar } from "@phosphor-icons/react";
import type { SessionSport } from "../../engine/types";
import { SPORT_META } from "../sports";
import { signed, weekdayDayMonth } from "../format";
import "./ui.css";

export function Panel({ title, children, className = "", style }: { title?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title && <h2 className="t-heading panel-title">{title}</h2>}
      {children}
    </section>
  );
}

export function SportGlyph({ sport, size = 20 }: { sport: SessionSport; size?: number }) {
  const { Icon, color, name } = SPORT_META[sport];
  return <Icon className="glyph" size={size} color={color} weight="fill" aria-label={name} role="img" />;
}

export function SportChip({ sport, selected, onClick, showName = true }: { sport: SessionSport; selected?: boolean; onClick?: () => void; showName?: boolean }) {
  return (
    <button type="button" className={`chip ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={onClick}
      aria-label={showName ? undefined : SPORT_META[sport].name}>
      <SportGlyph sport={sport} />
      {showName && <span className="t-label">{SPORT_META[sport].name}</span>}
    </button>
  );
}

/** Signed change with arrow: ↑ 6%, ↓ 10 s/km. */
export function Change({ value, unit = "", digits = 0 }: { value: number; unit?: string; digits?: number }) {
  const s = signed(value, digits);
  return (
    <span className="change t-fig-s">
      {s.arrow && <span aria-hidden>{s.arrow}{" "}</span>}
      <span className="sr-only">{s.arrow === "↑" ? "+" : s.arrow === "↓" ? "−" : ""}</span>
      {s.text}<span className="unit">{unit}</span>
    </span>
  );
}

export function Figure({ value, unit, size = "m", change }: {
  value: ReactNode; unit?: string; size?: "l" | "m" | "s";
  change?: { value: number; unit?: string; digits?: number };
}) {
  return (
    <span className="figure">
      <span className={`t-fig-${size}`}>{value}</span>
      {unit && <span className="t-small unit"> {unit}</span>}
      {change && <> <Change {...change} /></>}
    </span>
  );
}

/** §3.6 ●●○ 9 */
export function Evidence({ level, n }: { level: number; n?: number }) {
  const dots = [1, 2, 3].map((i) => (i <= level ? "●" : "○")).join("");
  return (
    <span className="evidence t-small" aria-label={`Evidence ${level} of 3${n !== undefined ? `, n ${n}` : ""}`}>
      <span aria-hidden>{dots}</span>{n !== undefined && <span className="t-fig-s"> {n}</span>}
    </span>
  );
}

/** §7.6 [glyph] 90 min · Sun 15 Nov */
export function SessionChip({ sport, durationMin, day, title }: { sport: SessionSport; durationMin: number; day: string; title?: string }) {
  return (
    <span className="session-chip t-label" title={title}>
      <SportGlyph sport={sport} size={16} />
      <span className="t-fig-s">{Math.round(durationMin)}</span><span className="unit t-small">min</span>
      <span className="faint">·</span>
      <span>{weekdayDayMonth(day)}</span>
    </span>
  );
}

/** Floating tooltip, numbers only. Position is relative to the nearest positioned ancestor. */
export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div className="tooltip" role="tooltip" style={{ left: x, top: y }}>{children}</div>;
}

/** Icon-only toggle between chart and table (§8). */
export function TableToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="icon-btn" onClick={onToggle} aria-label={table ? "Chart" : "Table"} aria-pressed={table}>
      {table ? <ChartBar size={20} /> : <Table size={20} />}
    </button>
  );
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; numeric?: boolean }
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c.key} className={`t-small ${c.numeric ? "num" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className={c.numeric ? "num t-fig-s" : "t-label"}>{c.render(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Panel with chart ⇄ table toggle in its header. */
export function ChartPanel<T>({ title, chart, columns, rows, className }: { title?: string; chart: ReactNode; columns: Column<T>[]; rows: T[]; className?: string }) {
  const [table, setTable] = useState(false);
  return (
    <section className={`panel ${className ?? ""}`}>
      <div className="panel-head">
        {title ? <h2 className="t-heading">{title}</h2> : <span />}
        <TableToggle table={table} onToggle={() => setTable((t) => !t)} />
      </div>
      {table ? <DataTable columns={columns} rows={rows} /> : chart}
    </section>
  );
}
