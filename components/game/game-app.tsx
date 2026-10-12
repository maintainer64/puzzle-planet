"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Clipboard, Clock3, Compass, Copy, LockKeyhole, Microscope, NotebookPen, Orbit, Radio, RotateCw, Satellite, Scan, Settings2, Sparkles, Target, Telescope, Trophy, Users, X, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { META, OBJECTS, counts, visibleSectors, type Action, type Mode, type ObjectType, type TheoryDraft, type View } from "../../lib/model";
import { SkyBoard } from "./sky-board";

type RoomSummary = { code: string; status: View["status"]; mode: Mode; players: number; updatedAt: number };
const STATUS = { lobby: "Лобби", playing: "Исследование", theory: "Фаза теорий", final: "Финальный поиск", finished: "Завершена" };
type RequestError = Error & { status?: number };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) { const error: RequestError = new Error(data.error ?? "Не удалось связаться с сервером."); error.status = response.status; throw error; }
  return data;
}
function ObjectSelect({ value, onChange, noX = true, theories = false }: { value: ObjectType; onChange: (v: ObjectType) => void; noX?: boolean; theories?: boolean }) {
  return <select value={value} onChange={e => onChange(e.target.value as ObjectType)}>{OBJECTS.filter(t => !(noX && t === "x") && !(theories && t === "empty")).map(t => <option key={t} value={t}>{META[t].icon} {META[t].name}</option>)}</select>;
}
function SectorSelect({ value, onChange, sectors }: { value: number; onChange: (v: number) => void; sectors: number[] }) {
  return <select value={value} onChange={e => onChange(Number(e.target.value))}>{!sectors.includes(value) && <option value={value} disabled>Сектор {value} (за горизонтом)</option>}{sectors.map(s => <option key={s} value={s}>Сектор {String(s).padStart(2, "0")}</option>)}</select>;
}
function Rules({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rules-dialog"><DialogHeader><span className="eyebrow">ПОМОЩЬ PUZZLE PLANET</span><DialogTitle>Найдите то, чего не видно.</DialogTitle><DialogDescription>Наблюдайте, исключайте варианты и проверяйте гипотезы. Для игры не нужна регистрация: выберите имя и пригласите друзей по коду комнаты.</DialogDescription></DialogHeader>
    <div className="rules-body"><h3>01 / Карта неба</h3><p>В обычном режиме — 12 секторов: 4 астероида, 2 кометы, 2 газовых облака, 1 карликовая планета, 2 пустых сектора и Планета X. В экспертном — 18 секторов, 4 карликовые планеты и 5 пустых секторов.</p>
      <ul><li>Каждый астероид соседствует хотя бы с одним астероидом.</li><li>Кометы находятся только в простых секторах: 2, 3, 5, 7, 11 (ещё 13 и 17 в экспертном).</li><li>Газовое облако соседствует с действительно пустым сектором.</li><li>Планета X не соседствует с карликовой планетой. В экспертном режиме карликовые планеты помещаются в полосу из 6 секторов с планетой на каждом краю.</li></ul>
      <h3>02 / Время — не порядок за столом</h3><p>Ходит отстающий игрок. При равном времени — тот, кто раньше занял позицию. Видна половина неба; Земля следует за последним игроком. Выберите сектор на общем поле, затем действие в правой панели.</p>
      <div className="rule-actions"><p><b>Обзор</b> / 4 времени за 1–3 сектора, 3 за 4–6, 2 за 7–9. Ответ — количество объектов выбранного типа. Диапазон комет начинается и заканчивается в простых секторах.</p><p><b>Прицел</b> / 4 времени. У каждого два жетона; ответ — тип объекта в видимом секторе.</p><p><b>Исследование</b> / 1 время. Получите личную логическую подсказку; нельзя два хода подряд.</p><p><b>Поиск X</b> / 5 времени. Укажите сектор X и оба соседних объекта. Поиск возможен и за горизонтом.</p></div>
      <p className="notice"><Sparkles size={16}/> Планета X выглядит пустым сектором при обзоре и прицельном наблюдении.</p>
      <h3>03 / Планшет и теории</h3><p>Нажимайте ячейку планшета: неизвестно → исключено → гипотеза. Это ваши записи, а не проверка сервером. Они приватные и сохраняются кнопкой «Сохранить». В фазе теорий можно отправить 1 теорию (2 в экспертном) или пропустить. После трёх фаз теории проверяются. Неверная теория добавляет 1 время, верная подтверждает сектор. Жетоны теорий не возвращаются.</p>
      <h3>04 / Финал и очки</h3><p>Первый нашедший X получает 10 очков. Игроки позади него получают одну финальную возможность: поиск X или 1–2 теории. Успешный финальный поиск даёт 2 очка за каждую позицию отставания, максимум 10. Теории: астероид 2, комета 3, облако 4, карликовая планета 4 (2 в экспертном); за первую правильную теорию сектора +1. При равенстве сравниваются очки за X, затем лидерские бонусы.</p>
      <h3>Комната и личные записи</h3><p>Комната живёт 24 часа с момента создания, затем удаляется вместе с партией. Ходы не продлевают срок. Вход анонимный: браузер хранит приватный cookie игрока. Перезагрузка не теряет место, но другой браузер или очистка cookie создадут нового игрока. В одиночку можно тренироваться без бота. Фазы теорий идут каждые 3 сектора, конференции — в секторах 6 и 11 (6 и 12 для эксперта).</p>
    </div></DialogContent></Dialog>;
}
export function GameApp() {
  const [room, setRoom] = useState<View | null>(null), [name, setName] = useState("Исследователь"), [code, setCode] = useState("");
  const [mode, setMode] = useState<Mode>("standard"), [recent, setRecent] = useState<RoomSummary[]>([]);
  const [tab, setTab] = useState<"board" | "notes" | "journal">("board"), [animations, setAnimations] = useState(true), [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(true), [connected, setConnected] = useState(true), [error, setError] = useState(""), [toast, setToast] = useState("");
  const [selected, setSelected] = useState(1), [notes, setNotes] = useState<number[][]>([]), [memo, setMemo] = useState(""), [dirty, setDirty] = useState(false);
  const latest = useRef<View | null>(null), dirtyRef = useRef(false), generation = useRef(0), inFlight = useRef(false);
  const expire = useCallback((message: string) => {
    generation.current++; latest.current = null; setRoom(null); setError(message); setBusy(false);
    localStorage.removeItem("puzzle-room"); history.replaceState(null, "", "/");
  }, []);
  const accept = useCallback((data: View) => {
    if (latest.current && data.code === latest.current.code && data.version < latest.current.version) return;
    const different = latest.current?.code !== data.code;
    latest.current = data; setRoom(data); setConnected(true);
    if (!dirtyRef.current || different) { setNotes(data.me.notes); setMemo(data.me.memo); setDirty(false); dirtyRef.current = false; }
  }, []);
  const load = useCallback(async (target: string) => {
    const gen = ++generation.current;
    setError(""); setBusy(true);
    try { const data = await api<View>(`/api/rooms/${target}`); if (gen === generation.current) { dirtyRef.current = false; accept(data); localStorage.setItem("puzzle-room", data.code); history.replaceState(null, "", `/?room=${data.code}`); } }
    catch (e) { if (gen === generation.current) { if ([403, 404, 410].includes((e as RequestError).status ?? 0)) expire((e as Error).message); else setError((e as Error).message); } }
    finally { if (gen === generation.current) setBusy(false); }
  }, [accept, expire]);
  useEffect(() => {
    const stored = localStorage.getItem("puzzle-motion"); setAnimations(stored === null ? !matchMedia("(prefers-reduced-motion: reduce)").matches : stored === "on");
    setName(localStorage.getItem("puzzle-name") ?? "Исследователь");
    const invite = new URL(location.href).searchParams.get("room"); if (invite) setCode(invite.toUpperCase());
    // Bootstrap the anonymous cookie before any simultaneous create/load calls.
    api<{ rooms: RoomSummary[] }>("/api/rooms").then(async data => {
      setRecent(data.rooms);
      const saved = localStorage.getItem("puzzle-room");
      if (saved && (!invite || invite.toUpperCase() === saved)) await load(saved);
    }).catch(e => setError((e as Error).message)).finally(() => setBusy(false));
  }, [load]);
  useEffect(() => {
    if (!room) return;
    const target = room.code, gen = generation.current;
    let stopped = false, polling = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped || polling) return;
      polling = true;
      if (!document.hidden && !inFlight.current) {
        try { const data = await api<View>(`/api/rooms/${target}`); if (!stopped && gen === generation.current) accept(data); }
        catch (e) { if (!stopped) { if ([403, 404, 410].includes((e as RequestError).status ?? 0)) { stopped = true; expire((e as Error).message); } else setConnected(false); } }
      }
      polling = false;
      if (!stopped) timer = setTimeout(poll, 1700 + Math.random() * 600);
    }
    timer = setTimeout(poll, 1800);
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [room?.code, accept, expire]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); }; addEventListener("beforeunload", warn); return () => removeEventListener("beforeunload", warn); }, []);
  async function enter(join = false) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); const gen = ++generation.current;
    try {
      const data = await api<View>("/api/rooms", join ? { name, code: code.toUpperCase().trim() } : { name, mode });
      if (gen !== generation.current) return;
      dirtyRef.current = false; accept(data); localStorage.setItem("puzzle-room", data.code); localStorage.setItem("puzzle-name", name); history.replaceState(null, "", `/?room=${data.code}`);
    } catch (e) { setError((e as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function act(action: Action) {
    if (!latest.current || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const data = await api<View>(`/api/rooms/${latest.current.code}`, { expectedVersion: latest.current.version, action });
      if (action.type === "notes") { dirtyRef.current = false; setDirty(false); }
      accept(data);
      if (action.type === "notes") setToast("Личные записи сохранены");
      return true;
    } catch (e) {
      setError((e as Error).message);
      if ((e as RequestError).status === 409 && latest.current) {
        try { accept(await api<View>(`/api/rooms/${latest.current.code}`)); } catch { setConnected(false); }
      }
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }
  function leave() {
    if (inFlight.current) { setToast("Подождите завершения запроса"); return; }
    if (dirty && !confirm("Есть несохранённые личные записи. Выйти без сохранения?")) return;
    generation.current++; latest.current = null; setRoom(null); setError(""); dirtyRef.current = false; setDirty(false); localStorage.removeItem("puzzle-room"); history.replaceState(null, "", "/");
    api<{ rooms: RoomSummary[] }>("/api/rooms").then(data => setRecent(data.rooms)).catch(() => {});
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setToast("Скопировано"); } catch { setError(`Не удалось скопировать. Код комнаты: ${room?.code ?? ""}`); } }
  function mark(row: number, column: number) {
    setNotes(previous => previous.map((r, i) => i === row ? r.map((n, j) => j === column ? (n + 1) % 3 : n) : r));
    dirtyRef.current = true; setDirty(true);
  }
  const active = room?.players.find(p => p.id === room.activeId);
  return <div className={`game-shell ${animations ? "motion-on" : "motion-off"}`}>
    <header className="topbar"><button className="brand" onClick={() => room && leave()} aria-label="Puzzle Planet — в лобби"><span className="brand-icon"><Orbit size={26}/></span><span>PUZZLE<span className="brand-x">PLANET</span><small>ОБСЕРВАТОРИЯ</small></span></button>
      <div className="topbar-center">{room ? <><span className={`live-dot ${connected ? "" : "offline"}`}/><span>{connected ? "СИНХРОНИЗИРОВАНО" : "ПЕРЕПОДКЛЮЧЕНИЕ"}</span><span className="slash">/</span><button className="code-button" onClick={() => copy(room.code)}>{room.code} <Copy size={12}/></button></> : <><span className="live-dot"/><span>ЛОГИКА. НАБЛЮДЕНИЯ. ОТКРЫТИЯ.</span></>}</div>
      <div className="header-actions"><button className={`icon-button ${animations ? "selected" : ""}`} aria-label={animations ? "Отключить анимации" : "Включить анимации"} aria-pressed={animations} title={animations ? "Анимации включены" : "Анимации выключены"} onClick={() => { setAnimations(!animations); localStorage.setItem("puzzle-motion", animations ? "off" : "on"); }}><Zap size={18}/></button><button className="icon-button" onClick={() => setRules(true)} aria-label="Помощь по игре" title="Помощь"><CircleHelp size={19}/></button>{room && <button className="avatar" style={{ background: room.me.color, color: "#111725" }} title={room.me.name}>{room.me.name.slice(0, 1).toUpperCase()}</button>}</div>
    </header>
    {error && <div className="error-banner" role="alert"><Radio size={16}/>{error}<button onClick={() => setError("")} aria-label="Закрыть ошибку"><X size={16}/></button></div>}
    {!room ? <main className="welcome"><section className="welcome-copy"><div className="eyebrow"><span className="tiny-line"/> МУЛЬТИПЛЕЕРНАЯ ИГРА О ДЕДУКЦИИ</div><h1>У неба есть<br/>один <em>секрет.</em></h1><p className="welcome-description">Где-то за знакомыми орбитами скрывается Планета X. Соберите наблюдения, проверьте гипотезы и найдите её раньше других.</p>
      <div className="feature-row"><span><Users size={16}/> 1–4 игрока</span><span><Clock3 size={16}/> Свой темп</span><span><LockKeyhole size={16}/> Личные заметки</span></div>
      <div className="entry-card"><div className="entry-label"><Satellite size={16}/> ВАШ ПОЗЫВНОЙ</div><input aria-label="Ваше имя" maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Имя исследователя"/>
        <div className="mode-picker"><button className={mode === "standard" ? "active" : ""} aria-pressed={mode === "standard"} onClick={() => setMode("standard")}><b>Стандарт</b><span>12 секторов · первое открытие</span></button><button className={mode === "expert" ? "active" : ""} aria-pressed={mode === "expert"} onClick={() => setMode("expert")}><b>Эксперт</b><span>18 секторов · сложнее небо</span></button></div>
        <><button className="button primary wide" disabled={busy || !name.trim()} onClick={() => enter()}><Telescope size={18}/>{busy ? "Подключение…" : "Создать экспедицию"}<ArrowRight size={17}/></button><div className="join-row"><input aria-label="Код комнаты" value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="КОД КОМНАТЫ"/><button className="button secondary" disabled={busy || code.trim().length !== 6 || !name.trim()} onClick={() => enter(true)}>Войти <ChevronRight size={16}/></button></div></>
      </div><button className="text-link" onClick={() => setRules(true)}><BookOpen size={16}/> Впервые здесь? Как играть <ArrowRight size={14}/></button>
    </section><section className="welcome-visual" aria-label="Визуализация орбит"><div className="coordinate c-top">OBSERVATORY / SECTOR 001</div><div className="welcome-orbit"><SkyBoard decorative/></div><div className="visual-caption"><span className="capsule">НЕИЗВЕСТНЫЙ ОБЪЕКТ</span><p>Иногда самое важное —<br/>то, что мы не видим.</p><span className="coordinate">α 00h 42m · δ +41° 16′</span></div></section>
      {recent.length > 0 && <section className="recent"><div className="section-title"><h2>Ваши экспедиции</h2><span>Можно продолжить с любого устройства</span></div><div className="recent-grid">{recent.map(r => <button key={r.code} className="recent-room" disabled={busy} onClick={() => load(r.code)}><Orbit size={23}/><span><b>{r.code}</b><small>{STATUS[r.status]} · {r.players} игрока · {r.mode === "expert" ? 18 : 12} секторов</small></span><ArrowRight size={17}/></button>)}</div></section>}
      <footer className="welcome-footer"><span>PUZZLE PLANET / мультиплеерная игра о дедукции</span><span>Без регистрации · комнаты доступны 24 часа</span></footer>
    </main> : <main className="workspace"><div className="workspace-heading"><div><button className="back-link" onClick={leave}><ArrowLeft size={13}/> Все экспедиции</button><h1>{room.status === "lobby" ? "Подготовка к открытию" : "Поиск Планеты X"}<span className="status-pill">{STATUS[room.status]}</span></h1></div><button className="button secondary" onClick={() => copy(`${location.origin}/?room=${room.code}`)}><Users size={16}/> Пригласить <Copy size={13}/></button></div>
      <div className="player-strip">{room.players.map(p => <div key={p.id} className={`player-card ${p.id === room.activeId ? "active-player" : ""}`} style={{ "--player": p.color } as React.CSSProperties}><span className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</span><div><b>{p.name}{p.id === room.me.id && <small> ВЫ</small>}</b><span>{room.status === "lobby" ? p.id === room.hostId ? "Создатель комнаты" : "Готов к исследованию" : <><Clock3 size={12}/> {p.time} времени · {p.targets} прицела{room.status === "finished" ? ` · ${p.score} очков` : ""}</>}</span></div>{p.id === room.activeId && <span className="turn-tag">ХОД</span>}{room.winners.includes(p.id) && <Trophy size={17} className="winner-icon"/>}</div>)}{room.status === "lobby" && Array.from({ length: 4 - room.players.length }, (_, i) => <div className="player-card empty-player" key={i}><Users size={20}/><span>Место для исследователя</span></div>)}</div>
      {room.status === "lobby" ? <section className="lobby"><div className="lobby-sky"><SkyBoard decorative/></div><div className="lobby-info"><span className="eyebrow">ЭКСПЕДИЦИЯ {room.code}</span><h2>Вместе —<br/>к неизвестному.</h2><p>Отправьте код друзьям. У каждого будет свой приватный планшет, а общее поле покажет движение времени и опубликованные теории.</p><button className="invite-code" onClick={() => copy(room.code)}>{room.code}<Copy size={20}/></button><p className="muted">{room.mode === "expert" ? "Экспертное" : "Стандартное"} небо · {room.size} секторов · до 4 игроков</p>{room.me.id === room.hostId ? <button className="button primary wide" disabled={busy} onClick={() => act({ type: "start" })}><Telescope size={18}/>{room.players.length === 1 ? "Начать тренировку без бота" : "Начать исследование"}<ArrowRight size={16}/></button> : <div className="waiting"><RotateCw size={16}/> Ждём начала от создателя комнаты</div>}<small className="muted">После старта нельзя добавить новых участников. Игрок может вернуться в свою партию после перезагрузки.</small></div></section> : <div className="game-layout"><section className="main-panel"><nav className="workspace-tabs" aria-label="Рабочая область"><button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><Compass size={17}/> Общее небо</button><button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}><NotebookPen size={17}/> Мой планшет{dirty && <span className="unsaved-dot"/>}</button><button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}><Clipboard size={17}/> Журнал</button><span className="private-label"><LockKeyhole size={12}/> Только ваши ответы</span></nav>
        {tab === "board" ? <><div className="board-heading"><div><span className="eyebrow">СОЛНЕЧНАЯ СИСТЕМА</span><h2>{room.status === "finished" ? "Тайна раскрыта" : "Карта наблюдений"}</h2></div><span className="board-stat">{room.size} секторов <span>/</span> {room.size / 2} видимых</span></div><div className="board-area"><SkyBoard room={room} selected={selected} onSelect={setSelected}/><div className="board-side-label"><span className="tiny-line"/> {room.status === "finished" ? "КАРТА ОТКРЫТА" : "ВЫБЕРИТЕ СЕКТОР"}</div></div><div className="board-legend"><span><i className="visible-square"/> Видимое небо</span><span><i className="hidden-square"/> За горизонтом</span><span>◇ Фаза теорий</span><span><span className="legend-earth">●</span> Земля</span></div><div className="object-key">{OBJECTS.map(t => <div key={t}><span style={{ color: META[t].color }}>{META[t].icon}</span><small>{META[t].name}</small><b>{counts(room.mode)[t]}</b></div>)}</div>
          {room.conferences.length > 0 && <div className="conference-list"><h3><Radio size={15}/> Открытые конференции</h3>{room.conferences.map((text, i) => <p key={i}>{text}</p>)}</div>}
        </> : tab === "notes" ? <div className="notebook"><div className="board-heading"><div><span className="eyebrow">ЛИЧНАЯ РАБОЧАЯ ОБЛАСТЬ</span><h2>Ваш лист дедукции</h2></div><button className="button secondary" disabled={busy || !dirty} onClick={() => act({ type: "notes", notes, memo })}><Check size={15}/>{dirty ? "Сохранить" : "Сохранено"}</button></div><p className="sheet-help">Клик по ячейке: <span>· неизвестно</span> → <span>× исключено</span> → <span className="lime">● гипотеза</span>. Это ваши предположения, не результат проверки.</p><div className="deduction-scroll"><table className="deduction-table"><thead><tr><th>СЕКТОР</th>{OBJECTS.map(t => <th key={t} title={META[t].name}><span style={{ color: META[t].color }}>{META[t].icon}</span><small>{META[t].name}</small></th>)}</tr></thead><tbody>{notes.map((row, i) => <tr key={i} className={visibleSectors(room.earth, room.size).includes(i + 1) ? "visible-row" : ""}><th><span>{String(i + 1).padStart(2, "0")}</span>{room.confirmed[i + 1] && <Check size={12}/>}</th>{row.map((value, j) => <td key={j}><button className={`note-cell mark-${value}`} onClick={() => mark(i, j)} aria-label={`Сектор ${i + 1}, ${META[OBJECTS[j]].name}: ${["неизвестно", "исключено", "гипотеза"][value]}`}>{value === 1 ? "×" : value === 2 ? "●" : "·"}</button></td>)}</tr>)}</tbody></table></div><label className="memo-label" htmlFor="memo">СВОБОДНЫЕ ЗАМЕТКИ <LockKeyhole size={12}/></label><textarea id="memo" maxLength={3000} value={memo} onChange={e => { setMemo(e.target.value); setDirty(true); dirtyRef.current = true; }} placeholder="Сопоставьте наблюдения. Что уже можно исключить?"/>{dirty && <p className="save-warning">Записи ещё не сохранены. Нажмите «Сохранить» перед выходом.</p>}</div> : <div className="journal"><div className="board-heading"><div><span className="eyebrow">ВАШ АРХИВ НАБЛЮДЕНИЙ</span><h2>Ничего не теряется</h2></div><LockKeyhole size={18}/></div><h3>Исходные данные и исследования</h3>{room.me.hints.map((hint, i) => <div className="hint" key={i}><Microscope size={16}/><p>{hint}</p></div>)}<h3>Личные результаты</h3>{room.me.history.length === 0 && <p className="muted">Результаты появятся после первого наблюдения.</p>}{[...room.me.history].reverse().map(entry => <div className="journal-entry" key={entry.id}><span className="journal-time">{new Date(entry.time).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span><p>{entry.text}</p></div>)}<h3>Общие события</h3>{[...room.log].reverse().map(entry => <div className="journal-entry" key={entry.id}><span className="journal-time">{new Date(entry.time).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span><p>{entry.text}</p></div>)}</div>}
      </section><aside className="action-sidebar"><ActionPanel room={room} busy={busy} selected={selected} onSelected={setSelected} act={act}/><div className="sidebar-journal"><div className="section-title"><h3><Radio size={14}/> Лента экспедиции</h3><span>LIVE</span></div>{room.me.history.length > 0 && <div className="last-answer"><LockKeyhole size={12}/><span>{room.me.history.at(-1)?.text}</span></div>}{room.log.slice(-5).reverse().map(entry => <div className="feed-entry" key={entry.id}><span className={`feed-dot ${entry.type}`}/><p>{entry.text}</p></div>)}</div><div className="sidebar-tip"><Sparkles size={17}/><p>Пустой сектор — это ещё не отсутствие планеты. Ваши лучшие открытия начинаются с исключений.</p></div></aside></div>}
      <div className="workspace-footer"><span><Radio size={12}/> {connected ? "Связь с обсерваторией установлена" : "Переподключение — партия сохранена"}</span><span>Комната до {new Date(room.expiresAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {active ? `Ход: ${active.name}` : STATUS[room.status]} · v{room.version}</span></div>
    </main>}
    <Rules open={rules} onOpenChange={setRules}/>{toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

function ActionPanel({ room, busy, selected, onSelected, act }: { room: View; busy: boolean; selected: number; onSelected: (n: number) => void; act: (action: Action) => Promise<boolean> }) {
  const [action, setAction] = useState<"survey" | "target" | "research" | "locate">("survey"), [object, setObject] = useState<ObjectType>("asteroid"), [length, setLength] = useState(3), [topic, setTopic] = useState(0), [left, setLeft] = useState<ObjectType>("asteroid"), [right, setRight] = useState<ObjectType>("empty"), [drafts, setDrafts] = useState<TheoryDraft[]>([]), [theoryObject, setTheoryObject] = useState<ObjectType>("asteroid"), [confirmLocate, setConfirmLocate] = useState(false);
  const [localError, setLocalError] = useState("");
  const me = room.me, isActive = room.activeId === me.id, visible = visibleSectors(room.earth, room.size), all = Array.from({ length: room.size }, (_, i) => i + 1);
  const theoryPhase = room.status === "theory", final = room.status === "final", finished = room.status === "finished", submitted = room.submitted.includes(me.id);
  const canTheory = theoryPhase && !submitted || final && isActive;
  const limit = final ? room.finalCapacity : room.mode === "expert" ? 2 : 1;
  const phaseKey = `${room.phase}-${room.status}`;
  useEffect(() => { setDrafts([]); setLocalError(""); setConfirmLocate(false); }, [phaseKey]);
  useEffect(() => { if (final) setAction("locate"); }, [final]);
  const selectedVisible = visible.includes(selected);
  const range = Array.from({ length }, (_, i) => (selected - 1 + i) % room.size + 1);
  const rangeVisible = range.every(n => visible.includes(n));
  async function send() {
    if (action === "locate" && !confirmLocate) { setConfirmLocate(true); return; }
    const move: Action = action === "survey" ? { type: action, object, start: selected, length } : action === "target" ? { type: action, sector: selected } : action === "research" ? { type: action, topic } : { type: action, sector: selected, left, right };
    if (await act(move)) setConfirmLocate(false);
  }
  function addTheory() {
    if (drafts.length >= limit) { setLocalError("Для этой фазы больше нельзя добавить теории."); return; }
    if (room.confirmed[selected]) { setLocalError("Сектор уже подтверждён."); return; }
    if (drafts.some(t => t.sector === selected)) { setLocalError("В этой фазе нельзя дважды выбрать один сектор."); return; }
    setLocalError(""); setDrafts([...drafts, { sector: selected, object: theoryObject }]);
  }
  const disabled = busy || !isActive || theoryPhase || finished || action === "target" && (!me.targets || !selectedVisible) || action === "survey" && !rangeVisible || action === "research" && (me.lastAction === "research" || me.research.includes(topic));
  if (finished) return <div className="results-panel"><span className="eyebrow">ИССЛЕДОВАНИЕ ЗАВЕРШЕНО</span><Trophy size={36}/><h2>{room.winners.includes(me.id) ? "Ваше открытие — лучшее!" : "Тайна больше не тайна."}</h2><p>Планета X находится в секторе <b>{room.board!.indexOf("x") + 1}</b>. Все объекты открыты на общем поле.</p>{[...room.players].sort((a, b) => b.score - a.score || b.xScore - a.xScore || b.leaderScore - a.leaderScore).map(p => <div className="score-row" key={p.id}><i style={{ background: p.color }}/><span>{p.name}<small>X: {p.xScore} · лидер: {p.leaderScore} · теории: {p.score - p.xScore - p.leaderScore}</small></span><b>{p.score}</b>{room.winners.includes(p.id) && <Trophy size={14}/>}</div>)}</div>;
  return <><div className={`turn-banner ${isActive || canTheory ? "your-turn" : ""}`}><div className="turn-icon">{theoryPhase ? <Microscope size={20}/> : <Telescope size={20}/>}</div><div><span className="eyebrow">{theoryPhase ? "СОВМЕСТНАЯ ФАЗА" : final ? "ПОСЛЕДНЯЯ ВОЗМОЖНОСТЬ" : "СЕЙЧАС НАБЛЮДАЕТ"}</span><b>{theoryPhase ? submitted ? "Выбор принят. Ждём остальных." : "Время выдвинуть теорию" : isActive ? "Ваш ход" : room.players.find(p => p.id === room.activeId)?.name}</b></div>{(isActive || canTheory) && <span className="live-dot"/>}</div>
    {theoryPhase || final && isActive ? <div className="theory-form"><div className="section-title"><h3>Теории</h3><span>{drafts.length} / {limit}</span></div><p className="muted">{theoryPhase ? "Выберите объект и сектор. Другие увидят вашу теорию только после общей отправки, её тип — после проверки." : "Предложите теории или сделайте финальный поиск X ниже."}</p><label>СЕКТОР<SectorSelect value={selected} onChange={onSelected} sectors={all}/></label><label>ОБЪЕКТ<ObjectSelect value={theoryObject} onChange={setTheoryObject} theories/></label><button className="button secondary wide" disabled={busy || !canTheory || drafts.length >= limit} onClick={addTheory}>Добавить теорию <ArrowRight size={15}/></button>{drafts.map((t, i) => <div className="draft" key={i}><span>{t.sector}: {META[t.object].name}</span><button onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} aria-label="Убрать теорию"><X size={14}/></button></div>)}{localError && <p className="save-warning" role="alert">{localError}</p>}<button className="button primary wide" disabled={busy || !canTheory} onClick={() => act({ type: "theory", theories: drafts })}><Check size={16}/>{drafts.length ? "Отправить теории" : "Пропустить теории"}</button>{theoryPhase && <p className="muted">Ответили {room.submitted.length} из {room.players.length} игроков. Проверка — на третьей фазе.</p>}</div> : null}
    {!theoryPhase && <div className="action-form"><div className="section-title"><h3>{final ? "Финальный поиск" : "Ваше наблюдение"}</h3><span>{String(selected).padStart(2, "0")}</span></div>{!final && <div className="action-grid">{[{ id: "survey", icon: Scan, title: "Обзор", cost: "2–4" }, { id: "target", icon: Target, title: "Прицел", cost: "4" }, { id: "research", icon: Microscope, title: "Исследовать", cost: "1" }, { id: "locate", icon: Sparkles, title: "Найти X", cost: "5" }].map(a => <button key={a.id} className={action === a.id ? "active" : ""} onClick={() => { setAction(a.id as typeof action); setConfirmLocate(false); }} aria-pressed={action === a.id}><a.icon size={18}/><b>{a.title}</b><span><Clock3 size={10}/>{a.cost}</span></button>)}</div>}
      {action === "survey" ? <><label>ИЩЕМ ОБЪЕКТ<ObjectSelect value={object} onChange={setObject}/></label><div className="form-row"><label>НАЧАЛО<SectorSelect value={selectedVisible ? selected : visible[0]} onChange={onSelected} sectors={visible}/></label><label>ДЛИНА<select value={length} onChange={e => setLength(Number(e.target.value))}>{Array.from({ length: room.size / 2 }, (_, i) => <option key={i} value={i + 1}>{i + 1} сектор(а)</option>)}</select></label></div><p className={`range-preview ${rangeVisible ? "" : "invalid"}`}>Секторы: {range.join(" → ")}{!rangeVisible && " · диапазон пересекает горизонт"}</p>{!selectedVisible && <button className="text-link" onClick={() => onSelected(visible[0])}>Выбрать первый видимый сектор <ArrowRight size={12}/></button>}</> : action === "target" ? <><label>ВИДИМЫЙ СЕКТОР<SectorSelect value={selectedVisible ? selected : visible[0]} onChange={onSelected} sectors={visible}/></label><p className="muted">Осталось прицельных наблюдений: {me.targets} / 2. Вы узнаете объект, но X выглядит пустым.</p>{!selectedVisible && <button className="text-link" onClick={() => onSelected(visible[0])}>Выбрать первый видимый сектор <ArrowRight size={12}/></button>}</> : action === "research" ? <><label>ТЕМА ИССЛЕДОВАНИЯ<select value={topic} onChange={e => setTopic(Number(e.target.value))}>{room.topics.map(t => <option key={t.id} value={t.id} disabled={me.research.includes(t.id)}>{String.fromCharCode(65 + t.id)} / {t.title}{me.research.includes(t.id) ? " ✓" : ""}</option>)}</select></label><p className="muted">{me.lastAction === "research" ? "После исследования нужно выбрать другое действие." : "Ваша новая подсказка появится в личном журнале."}</p></> : <><label>ПЛАНЕТА X В СЕКТОРЕ<SectorSelect value={selected} onChange={n => { onSelected(n); setConfirmLocate(false); }} sectors={all}/></label><label>СЕКТОР {(selected - 2 + room.size) % room.size + 1} · ПРЕДЫДУЩИЙ СОСЕД<ObjectSelect value={left} onChange={v => { setLeft(v); setConfirmLocate(false); }}/></label><label>СЕКТОР {selected % room.size + 1} · СЛЕДУЮЩИЙ СОСЕД<ObjectSelect value={right} onChange={v => { setRight(v); setConfirmLocate(false); }}/></label><p className="muted">Для успеха нужны сектор X и оба соседних объекта. Пусто здесь означает действительно пустой сектор.</p></>}
      {confirmLocate && <div className="locate-confirm"><Sparkles size={16}/><p>{final ? "Это единственная финальная попытка. Подтвердить поиск?" : "Поиск стоит 5 времени. Подтвердить гипотезу?"}</p><button onClick={() => setConfirmLocate(false)} aria-label="Отменить подтверждение"><X size={14}/></button></div>}
      <button className="button primary wide" disabled={disabled} onClick={send}>{busy ? <RotateCw size={16} className="spin"/> : action === "locate" ? <Sparkles size={16}/> : <Telescope size={16}/>}<span>{busy ? "Отправляем…" : confirmLocate ? "Подтвердить поиск X" : action === "locate" ? "Проверить гипотезу X" : "Выполнить наблюдение"}</span><span className="button-cost"><Clock3 size={12}/>{final ? "ФИНАЛ" : action === "survey" ? length <= 3 ? 4 : length <= 6 ? 3 : 2 : action === "research" ? 1 : action === "target" ? 4 : 5}</span></button>{!isActive && <p className="waiting-caption">Можно изучать планшет и журнал, пока ходят другие.</p>}
    </div>}
    {room.theories.length > 0 && <div className="theory-list"><div className="section-title"><h3>Опубликованные теории</h3><span>{room.theories.length}</span></div>{room.theories.slice(-8).map(t => <div key={t.id}><i style={{ background: room.players.find(p => p.id === t.playerId)?.color }}/><span>Сектор {t.sector} · {t.object ? META[t.object].name : "скрытый объект"}<small>{t.result === "pending" ? `Проверка ${t.age}/3` : t.result === "correct" ? "Подтверждена" : "Опровергнута"}</small></span>{t.result === "correct" ? <Check size={13}/> : t.result === "wrong" ? <X size={13}/> : <Clock3 size={13}/>}</div>)}</div>}
  </>;
}
