"use client";
import { META, visibleSectors, type View } from "../../lib/model";

function point(radius: number, angle: number) {
  const a = (angle - 90) * Math.PI / 180;
  return { x: 300 + radius * Math.cos(a), y: 300 + radius * Math.sin(a) };
}
function wedge(from: number, to: number, inner: number, outer: number) {
  const a = point(outer, from), b = point(outer, to), c = point(inner, to), d = point(inner, from);
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;
}
export function SkyBoard({ room, selected, onSelect, decorative = false }: { room?: View; selected?: number; onSelect?: (n: number) => void; decorative?: boolean }) {
  const size = room?.size ?? 12, step = 360 / size;
  const visible = visibleSectors(room?.earth ?? 0, size);
  const label = room ? `Поле: ${size} секторов. Видимое небо: ${visible.join(", ")}.` : "Круговая карта звёздного неба";
  return <svg viewBox="0 0 600 600" className={`sky-board ${decorative ? "decorative" : ""}`} role={onSelect ? "group" : "img"} aria-label={label}>
    <defs>
      <radialGradient id="sun-glow"><stop offset="0" stopColor="#f2c896" stopOpacity=".28"/><stop offset="1" stopColor="#f2c896" stopOpacity="0"/></radialGradient>
      <radialGradient id="sun"><stop stopColor="#ffedbc"/><stop offset=".65" stopColor="#ddac70"/><stop offset="1" stopColor="#9c654c"/></radialGradient>
      <radialGradient id="planet"><stop stopColor="#b7b2f4"/><stop offset=".7" stopColor="#686593"/><stop offset="1" stopColor="#252d43"/></radialGradient>
    </defs>
    <circle cx="300" cy="300" r="285" fill="#101522" stroke="#293043"/>
    <circle cx="300" cy="300" r="267" fill="none" stroke="#31394d" strokeDasharray="2 6"/>
    {Array.from({ length: size }, (_, i) => {
      const sector = i + 1, isVisible = visible.includes(sector);
      const pos = point(237, i * step + step / 2), iconPos = point(190, i * step + step / 2);
      const object = room?.board?.[i] ?? room?.confirmed[sector];
      const theories = room?.theories.filter(t => t.sector === sector && t.result !== "wrong") ?? [];
      return <g key={sector} className={`sector ${onSelect ? "clickable" : ""}`} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`Сектор ${sector}${isVisible ? ", видимый" : ", за горизонтом"}${object ? `, ${META[object].name}` : ""}`} aria-pressed={onSelect ? selected === sector : undefined} onClick={() => onSelect?.(sector)} onKeyDown={e => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(sector); } }}>
        <path d={wedge(i * step + .5, (i + 1) * step - .5, 115, 253)} fill={selected === sector ? "#d8fb9820" : isVisible ? "#192332" : "#101521"} stroke={selected === sector ? "#d8fb98" : "#ffffff06"}/>
        <text x={pos.x} y={pos.y + 5} textAnchor="middle" fill={selected === sector ? "#d8fb98" : isVisible ? "#d3dae5" : "#69758a"} fontSize="15" fontFamily="monospace">{String(sector).padStart(2, "0")}</text>
        {object ? <text x={iconPos.x} y={iconPos.y + 9} textAnchor="middle" fontSize="28" fill={META[object].color}>{META[object].icon}</text> : <circle cx={iconPos.x} cy={iconPos.y} r="2" fill={isVisible ? "#546880" : "#2c3445"}/>}
        {theories.map((t, j) => { const p = point(130 + j * 12, i * step + step / 2); return <circle key={t.id} cx={p.x} cy={p.y} r="4" stroke={room?.players.find(p => p.id === t.playerId)?.color} fill={t.result === "correct" ? room?.players.find(p => p.id === t.playerId)?.color : "#111725"}/>; })}
        {i % 3 === 2 && <text x={point(274, i * step + step / 2).x} y={point(274, i * step + step / 2).y + 4} textAnchor="middle" fill="#79849c" fontSize="12">◇</text>}
      </g>;
    })}
    {[45, 72, 99, 113].map(r => <circle key={r} cx="300" cy="300" r={r} stroke="#a2b6db20" fill="none"/>)}
    <circle cx="300" cy="300" r="70" fill="url(#sun-glow)"/>
    <circle cx="300" cy="300" r="24" fill="url(#sun)"/>
    <g className="inner-orbit"><circle cx="300" cy="228" r="6" fill="#7bc8d8"/><circle cx="337" cy="265" r="3" fill="#bf9175"/></g>
    <g className="earth-indicator" style={{ transform: `rotate(${(room?.earth ?? 0) * step}deg)`, transformOrigin: "300px 300px" }}>
      <path d="M 291 195 L 300 178 L 309 195" stroke="#d8fb98" strokeWidth="2" fill="none"/>
      <circle cx="300" cy="201" r="7" fill="#81c6dc"/><circle cx="298" cy="199" r="2.5" fill="#d8fb98" opacity=".7"/>
    </g>
    {room?.players.map((p, i) => {
      const pos = point(263 + (room.players.filter(other => other.time % size === p.time % size).indexOf(p) * 9), (p.time % size) * step + step / 2);
      return <g key={p.id} className="pawn" style={{ transform: `translate(${pos.x}px,${pos.y}px)` }}><circle r={p.id === room.activeId ? 9 : 7} fill={p.color} stroke="#0b101b" strokeWidth="3"/><title>{p.name}: время {p.time}, игрок {i + 1}</title></g>;
    })}
    {decorative && <g><circle cx="452" cy="444" r="35" fill="url(#planet)"/><ellipse cx="452" cy="444" rx="58" ry="13" transform="rotate(-30 452 444)" stroke="#9d98e0" strokeWidth="3" fill="none"/><circle cx="152" cy="131" r="9" fill="#b6977d"/></g>}
  </svg>;
}
