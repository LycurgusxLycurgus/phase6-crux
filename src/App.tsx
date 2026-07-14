import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import React, { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";

type MainPath = "/hoy" | "/camino" | "/mapa" | "/historial" | "/mas";
type Path = MainPath | "/habitos" | "/conocimiento" | "/ajustes" | "/acceso";
type AccessStatus = "preparing" | "invalid" | "used" | "expired" | "revoked" | "recoverable";

const mainPaths = new Set<MainPath>(["/hoy", "/camino", "/mapa", "/historial", "/mas"]);

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [path, navigate] = usePath();
  const online = useOnline();

  useEffect(() => {
    if (!isLoading && isAuthenticated && path === "/acceso" && !new URLSearchParams(location.search).has("t")) {
      navigate("/hoy", true);
    }
  }, [isAuthenticated, isLoading, navigate, path]);

  if (isLoading) return <AppShell><LoadingState /></AppShell>;
  if (!isAuthenticated) {
    return <AppShell><AccessView path={path} navigate={navigate} /></AppShell>;
  }

  return (
    <AppErrorBoundary key={path} onRecover={() => location.reload()}>
      <AppShell>
        {!online && <div className="offline-banner" role="status">Sin conexión. Reintentando…</div>}
        <AuthenticatedView path={path} navigate={navigate} />
        {mainPaths.has(path as MainPath) && <BottomNav active={path as MainPath} navigate={navigate} />}
      </AppShell>
    </AppErrorBoundary>
  );
}

function AuthenticatedView({ path, navigate }: { path: Path; navigate: Navigate }) {
  const bootstrap = useQuery(api.web.getBootstrap, {});
  if (bootstrap === undefined) return <LoadingState />;
  if (path === "/camino") return <RouteView navigate={navigate} />;
  if (path === "/mapa") return <IdentityMapView />;
  if (path === "/historial") return <HistoryView />;
  if (path === "/mas") return <MoreView navigate={navigate} />;
  if (path === "/habitos") return <HabitsView navigate={navigate} />;
  if (path === "/conocimiento") return <KnowledgeView navigate={navigate} />;
  if (path === "/ajustes") return <SettingsView navigate={navigate} />;
  return <TodayView navigate={navigate} />;
}

function AccessView({ path, navigate }: { path: Path; navigate: Navigate }) {
  const { signIn } = useAuthActions();
  const tokenRef = useRef<string | null>(null);
  const attempted = useRef(false);
  const [status, setStatus] = useState<AccessStatus>("preparing");
  const hasToken = path === "/acceso" && new URLSearchParams(location.search).has("t");

  useEffect(() => {
    if (path !== "/acceso" || attempted.current) return;
    attempted.current = true;
    const url = new URL(location.href);
    tokenRef.current = url.searchParams.get("t");
    history.replaceState(null, "", "/acceso");
    if (!tokenRef.current) {
      setStatus("invalid");
      return;
    }
    void signIn("telegram-link", { token: tokenRef.current })
      .then(({ signingIn }) => {
        tokenRef.current = null;
        if (!signingIn) setStatus("recoverable");
      })
      .catch((error: unknown) => {
        tokenRef.current = null;
        setStatus(accessStatusFromError(error));
      });
  }, [path, signIn]);

  if (!hasToken && path !== "/acceso") {
    return (
      <StateView
        title="Tu espacio se abre desde Telegram"
        detail="Pide a tu guía que abra la aplicación. Recibirás un enlace personal de un solo uso."
        action={<button className="btn-primary" onClick={returnToTelegram}>Volver a Telegram</button>}
      />
    );
  }

  const states: Record<AccessStatus, { title: string; detail: string; action?: string }> = {
    preparing: { title: "Preparando tu espacio…", detail: "Estamos conectando este dispositivo con tu guía." },
    invalid: { title: "Enlace no válido", detail: "Pide un enlace nuevo a tu guía en Telegram.", action: "Volver a Telegram" },
    used: { title: "Este enlace ya fue utilizado", detail: "Por seguridad, cada enlace abre una sola sesión.", action: "Solicitar uno nuevo" },
    expired: { title: "Este enlace venció", detail: "Los enlaces duran diez minutos. Pide otro en Telegram.", action: "Volver a Telegram" },
    revoked: { title: "El acceso fue revocado", detail: "Pide un enlace nuevo si quieres volver a entrar.", action: "Volver a Telegram" },
    recoverable: { title: "No pudimos abrir tu espacio", detail: "Pide un enlace nuevo en Telegram e inténtalo de nuevo.", action: "Volver a Telegram" },
  };
  const state = states[status];
  return (
    <StateView
      busy={status === "preparing"}
      title={state.title}
      detail={state.detail}
      action={state.action ? <button className="btn-primary" onClick={() => { setStatus("preparing"); navigate("/acceso", true); returnToTelegram(); }}>{state.action}</button> : undefined}
    />
  );
}

function TodayView({ navigate }: { navigate: Navigate }) {
  const today = useQuery(api.web.getToday, {});
  const setCompletion = useMutation(api.web.setTodayHabitCompletion);
  const [pending, setPending] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  if (today === undefined) return <LoadingState />;
  const { completed, total, streak } = today.progress;

  async function toggle(habitKey: string, value: boolean) {
    setPending(habitKey);
    setMutationError(null);
    try {
      await setCompletion({ habitKey, completed: value });
    } catch {
      setMutationError("No pudimos guardar el cambio. Inténtalo de nuevo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="view-container" id="contenido">
      <header className="today-header">
        <span className="meta-label">{formatLocalDate(today.localDate)}</span>
        <h1 className="state-phrase">{today.statement}</h1>
        <p className="state-sub">La identidad se sostiene en los pequeños gestos que repetimos con intención, incluso cuando nadie nos observa.</p>
      </header>
      <ComputationalStroke completed={completed} total={total} />
      <section aria-labelledby="routine-title">
        <h2 id="routine-title" className="section-header">Rutina de hoy</h2>
        {today.routine.habits.length === 0 ? (
          <p className="quiet-empty">Hoy no hay hábitos activos. Este espacio también cuenta.</p>
        ) : (
          <ul className="routine-list">
            {today.routine.habits.map((habit) => (
              <li key={habit.habitKey} className="routine-item">
                <button
                  className={`check-btn ${habit.completed ? "done" : ""}`}
                  disabled={pending === habit.habitKey}
                  onClick={() => void toggle(habit.habitKey, !habit.completed)}
                  aria-pressed={habit.completed}
                  aria-label={`Marcar ${habit.title} como ${habit.completed ? "incompleto" : "completo"}`}
                >
                  {habit.completed && <IconCheck />}
                </button>
                <span className="routine-text">
                  <span className="routine-label">{habit.title}</span>
                  <span className="routine-meta">{habit.description || "Práctica cotidiana"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {mutationError && <p className="inline-error" role="alert">{mutationError}</p>}
      </section>
      <div className="status-block">
        <div className="status-item"><Donut percentage={total === 0 ? 0 : completed / total * 100} /><span>{completed} de {total} completados</span></div>
        <div className="status-divider" />
        <div className="status-item"><IconFlame /><span>Racha de {streak} {streak === 1 ? "día" : "días"}</span></div>
      </div>
      <section className="practice-block">
        <span className="meta-label">Práctica actual</span>
        <h2 className="serif-large">Fase VI</h2>
        <p className="subphase">{today.practice?.title ?? "La identidad se demuestra en lo pequeño"}</p>
        <button className="link-btn" onClick={() => navigate("/camino")}>Ver el camino <span aria-hidden="true">→</span></button>
      </section>
    </main>
  );
}

function RouteView({ navigate }: { navigate: Navigate }) {
  const route = useQuery(api.web.getRoute, {});
  if (route === undefined) return <LoadingState />;
  return (
    <main className="view-container">
      <ViewHeader eyebrow="Progreso" title="Camino" />
      {route.current ? (
        <>
          <section className="camino-phase-block">
            <span className="meta-label">Fase actual</span>
            <h2 className="serif-large">Fase VI · {phaseLabel(route.current.phase)}</h2>
            <p className="subphase">{route.current.title}</p>
            <div className="thin-rule" />
            <p className="prose">{route.current.instructions}</p>
          </section>
          <section>
            <h2 className="section-header">Prácticas del recorrido</h2>
            <ol className="action-list">
              {route.sequence.map((item) => (
                <li className={`action-item ${item.isCurrent ? "primary" : item.status === "locked" ? "tertiary" : "secondary"}`} key={item.id}>
                  <span className="action-marker" aria-hidden="true" />
                  <span className="action-content"><strong>{item.title}</strong><small>{item.isCurrent ? "Práctica actual" : statusLabel(item.status)}</small></span>
                </li>
              ))}
            </ol>
          </section>
          <button className="btn-secondary" onClick={returnToTelegram}>Continuar con la guía en Telegram</button>
        </>
      ) : <StateView title="Tu camino está por comenzar" detail="Completa la apertura con tu guía en Telegram." action={<button className="btn-primary" onClick={returnToTelegram}>Volver a Telegram</button>} />}
      <button className="text-back" onClick={() => navigate("/hoy")}>← Volver a Hoy</button>
    </main>
  );
}

function IdentityMapView() {
  const map = useQuery(api.web.getIdentityMap, {});
  if (map === undefined) return <LoadingState />;
  if (!map.onboardingComplete) return <main className="view-container"><ViewHeader eyebrow="Identidad" title="Mapa" /><StateView title="Tu mapa aún está en silencio" detail="Vuelve a la guía en Telegram y completa las preguntas iniciales para comenzar a trazarlo." action={<button className="btn-primary" onClick={returnToTelegram}>Volver a Telegram</button>} /></main>;
  return (
    <main className="view-container">
      <ViewHeader eyebrow="Identidad" title="Mapa" />
      <MapSection title="Identidad en movimiento">
        {map.hero && <MapItem title={map.hero.name} detail={map.hero.why} />}
        {map.initialIdentity && <MapItem title={map.initialIdentity.name} detail={map.initialIdentity.behavior} />}
      </MapSection>
      {map.dreamline && <MapSection title="Horizonte"><MapItem title="Ser" detail={map.dreamline.be} /><MapItem title="Hacer" detail={map.dreamline.do} /><MapItem title="Tener" detail={map.dreamline.have} /></MapSection>}
      <MapSection title="Fricciones">
        {map.challenges.internal && <MapItem title="Interna" detail={map.challenges.internal} />}
        {map.challenges.external && <MapItem title="Externa" detail={map.challenges.external} />}
        {map.challenges.philosophical && <MapItem title="Filosófica" detail={map.challenges.philosophical} />}
      </MapSection>
    </main>
  );
}

function HistoryView() {
  const [before, setBefore] = useState<number | undefined>();
  const [items, setItems] = useState<Array<{ id: string; kind: "practice" | "routine"; at: number; title: string; detail: string }>>([]);
  const historyPage = useQuery(api.web.getHistory, before === undefined ? { limit: 12 } : { before, limit: 12 });
  useEffect(() => {
    if (!historyPage) return;
    setItems((current) => {
      const known = new Set(current.map((item) => item.id));
      return [...current, ...historyPage.items.filter((item) => !known.has(item.id))];
    });
  }, [historyPage]);
  if (historyPage === undefined && items.length === 0) return <LoadingState />;
  return (
    <main className="view-container">
      <ViewHeader eyebrow="Memoria" title="Historial" />
      {items.length === 0 ? <StateView title="Aún no hay registros" detail="Tu práctica cotidiana irá dejando huellas aquí." /> : items.map((item) => (
        <article className="historial-entry" key={item.id}>
          <time className="historial-date" dateTime={new Date(item.at).toISOString()}>{formatTimestamp(item.at)}</time>
          <h2>{item.title}</h2>
          <p>{item.detail}</p>
        </article>
      ))}
      {historyPage?.nextBefore && <button className="load-more" disabled={historyPage === undefined} onClick={() => setBefore(historyPage.nextBefore ?? undefined)}>Cargar registros anteriores</button>}
    </main>
  );
}

function MoreView({ navigate }: { navigate: Navigate }) {
  const { signOut } = useAuthActions();
  const [confirm, setConfirm] = useState(false);
  async function logout() { await signOut(); navigate("/acceso", true); }
  return (
    <main className="view-container">
      <ViewHeader eyebrow="Tu espacio" title="Más" />
      <nav className="mas-group" aria-label="Opciones de tu espacio">
        <MoreRow label="Hábitos" onClick={() => navigate("/habitos")} />
        <MoreRow label="Conocimiento" onClick={() => navigate("/conocimiento")} />
        <MoreRow label="Ajustes" onClick={() => navigate("/ajustes")} />
      </nav>
      <div className="mas-divider" />
      <button className="mas-row" onClick={returnToTelegram}><span>Volver a la guía de Telegram</span><IconChevron /></button>
      <div className="mas-divider" />
      {!confirm ? <button className="mas-row danger" onClick={() => setConfirm(true)}>Cerrar sesión</button> : (
        <div className="logout-confirm">
          <p className="reflective-text">¿Cerrar sesión en este dispositivo?</p>
          <p className="state-subtext">Tu progreso se mantiene. Necesitarás otro enlace para volver.</p>
          <div className="logout-actions"><button className="btn-secondary" onClick={() => setConfirm(false)}>Cancelar</button><button className="btn-primary" onClick={() => void logout()}>Cerrar sesión</button></div>
        </div>
      )}
    </main>
  );
}

function HabitsView({ navigate }: { navigate: Navigate }) {
  const habits = useQuery(api.web.getHabits, {});
  if (habits === undefined) return <LoadingState />;
  return <main className="view-container"><BackHeader title="Hábitos" navigate={navigate} />{habits.length === 0 ? <StateView title="Aún no hay hábitos" detail="Tu guía te ayudará a definir el primero." /> : <ul className="detail-list">{habits.map((habit) => <li key={habit.id}><strong>{habit.title}</strong><span>{habit.description || "Sin descripción"}</span><small>{habitStatusLabel(habit.status)}</small></li>)}</ul>}<button className="btn-secondary" onClick={returnToTelegram}>Gestionar con la guía</button></main>;
}

function KnowledgeView({ navigate }: { navigate: Navigate }) {
  const entries = useQuery(api.web.getKnowledgeIndex, {});
  const [selected, setSelected] = useState<string | null>(null);
  const entry = useQuery(api.web.getKnowledgeEntry, selected ? { slug: selected } : "skip");
  if (entries === undefined) return <LoadingState />;
  return <main className="view-container"><BackHeader title="Conocimiento" navigate={navigate} />{selected ? <article className="knowledge-entry"><button className="text-back" onClick={() => setSelected(null)}>← Todos los temas</button>{entry === undefined ? <LoadingState /> : <><h2 className="serif-large">{entry.title}</h2>{entry.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>}</article> : <ul className="knowledge-list">{entries.map((item) => <li key={item.slug}><button onClick={() => setSelected(item.slug)}><strong>{item.title}</strong><span>{item.excerpt}</span><IconChevron /></button></li>)}</ul>}</main>;
}

function SettingsView({ navigate }: { navigate: Navigate }) {
  const settings = useQuery(api.web.getSettings, {});
  const update = useMutation(api.web.updateSettings);
  const [saving, setSaving] = useState(false);
  if (settings === undefined) return <LoadingState />;
  async function setCadence(cadence: "weekly" | "biweekly") { setSaving(true); try { await update({ cadence }); } finally { setSaving(false); } }
  return <main className="view-container"><BackHeader title="Ajustes" navigate={navigate} /><dl className="settings-list"><div><dt>Zona horaria</dt><dd>{settings.timezone}</dd></div><div><dt>Sesiones web activas</dt><dd>{settings.activeWebSessions}</dd></div></dl><fieldset className="cadence-field"><legend>Ritmo de práctica</legend><label><input type="radio" name="cadence" checked={settings.cadence === "weekly"} disabled={saving} onChange={() => void setCadence("weekly")} /> Semanal</label><label><input type="radio" name="cadence" checked={settings.cadence === "biweekly"} disabled={saving} onChange={() => void setCadence("biweekly")} /> Quincenal</label></fieldset><p className="settings-note">Los horarios de recordatorio se siguen acordando con tu guía en Telegram.</p></main>;
}

function ComputationalStroke({ completed, total }: { completed: number; total: number }) {
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const path = "M 10 44 C 54 4, 99 76, 151 40 S 248 7, 310 40";
  return <figure className="stroke-container" aria-label={`Progreso diario: ${Math.round(progress * 100)} por ciento`}>
    <svg className="stroke-svg" viewBox="0 0 320 88" role="img" aria-hidden="true">
      <path d={path} className="stroke-base" pathLength="1" />
      <path d={path} className="stroke-progress" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
      <circle cx="10" cy="44" r="4" className="stroke-open" />
      {progress > 0 && progress < 1 && <circle r="4" className="stroke-node" style={{ offsetPath: `path('${path}')`, offsetDistance: `${progress * 100}%`, offsetRotate: "0deg" } as CSSProperties} />}
      {progress < 1 && <path d="M 310 40 Q 328 23 340 31" className="stroke-tail" />}
      {progress === 1 && <g><circle cx="310" cy="40" r="9" className="stroke-resolved" /><path d="m306 40 3 3 6-7" className="stroke-check" /></g>}
    </svg>
    <figcaption>{Math.round(progress * 100)}%</figcaption>
  </figure>;
}

function BottomNav({ active, navigate }: { active: MainPath; navigate: Navigate }) {
  const items: Array<{ path: MainPath; label: string; icon: ReactNode }> = [
    { path: "/hoy", label: "Hoy", icon: <IconHome /> }, { path: "/camino", label: "Camino", icon: <IconPath /> }, { path: "/mapa", label: "Mapa", icon: <IconMap /> }, { path: "/historial", label: "Historial", icon: <IconHistory /> }, { path: "/mas", label: "Más", icon: <IconMore /> },
  ];
  return <nav className="bottom-nav" aria-label="Navegación principal">{items.map((item) => <button key={item.path} className={active === item.path ? "active" : ""} onClick={() => navigate(item.path)} aria-current={active === item.path ? "page" : undefined}>{item.icon}<span>{item.label}</span></button>)}</nav>;
}

function AppShell({ children }: { children: ReactNode }) { return <div className="app-shell"><a className="skip-link" href="#contenido">Saltar al contenido</a>{children}</div>; }
function ViewHeader({ eyebrow, title }: { eyebrow: string; title: string }) { return <header className="view-header"><span className="view-eyebrow">{eyebrow}</span><h1 className="view-title">{title}</h1></header>; }
function BackHeader({ title, navigate }: { title: string; navigate: Navigate }) { return <header className="view-header back-header"><button onClick={() => navigate("/mas")} aria-label="Volver a Más">←</button><h1 className="view-title">{title}</h1></header>; }
function StateView({ title, detail, action, busy = false }: { title: string; detail: string; action?: ReactNode; busy?: boolean }) { return <section className="state-container" aria-live="polite">{busy ? <div className="state-spinner" aria-hidden="true" /> : <div className="state-mark" aria-hidden="true">{action ? "!" : "○"}</div>}<h1 className="reflective-text">{title}</h1><p className="state-subtext">{detail}</p>{action}</section>; }
function LoadingState() { return <div className="loading-state" role="status" aria-label="Cargando"><div className="skeleton skeleton-short" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-stroke" /><div className="skeleton" /><div className="skeleton" /></div>; }
function Donut({ percentage }: { percentage: number }) { const c = 2 * Math.PI * 8; return <svg className="donut" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" /><circle className="donut-value" cx="10" cy="10" r="8" strokeDasharray={c} strokeDashoffset={c - percentage / 100 * c} /></svg>; }
function MapSection({ title, children }: { title: string; children: ReactNode }) { return <section className="mapa-section"><h2 className="section-header">{title}</h2>{children}</section>; }
function MapItem({ title, detail }: { title: string; detail: string }) { return <div className="mapa-item"><strong>{title}</strong><p>{detail}</p></div>; }
function MoreRow({ label, onClick }: { label: string; onClick: () => void }) { return <button className="mas-row" onClick={onClick}><span>{label}</span><IconChevron /></button>; }

class AppErrorBoundary extends React.Component<{ children: ReactNode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AppShell><StateView title="No pudimos cargar tu espacio" detail="La sesión pudo haber terminado o la conexión se interrumpió." action={<button className="btn-primary" onClick={this.props.onRecover}>Reintentar</button>} /></AppShell> : this.props.children; }
}

type Navigate = (path: Path, replace?: boolean) => void;
function usePath(): [Path, Navigate] {
  const normalize = (): Path => {
    const value = location.pathname as Path;
    return ["/hoy", "/camino", "/mapa", "/historial", "/mas", "/habitos", "/conocimiento", "/ajustes", "/acceso"].includes(value) ? value : "/hoy";
  };
  const [path, setPath] = useState<Path>(normalize);
  useEffect(() => { const onPop = () => setPath(normalize()); addEventListener("popstate", onPop); return () => removeEventListener("popstate", onPop); }, []);
  const navigate: Navigate = React.useCallback((next, replace = false) => { history[replace ? "replaceState" : "pushState"](null, "", next); setPath(next); scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, []);
  return [path, navigate];
}
function useOnline() { const [online, setOnline] = useState(navigator.onLine); useEffect(() => { const yes = () => setOnline(true); const no = () => setOnline(false); addEventListener("online", yes); addEventListener("offline", no); return () => { removeEventListener("online", yes); removeEventListener("offline", no); }; }, []); return online; }
function returnToTelegram() {
  const username = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  location.assign(username ? `https://t.me/${encodeURIComponent(username)}` : "https://t.me/");
}
function accessStatusFromError(error: unknown): AccessStatus { const message = error instanceof Error ? error.message : String(error); if (message.includes("WEB_LINK_USED")) return "used"; if (message.includes("WEB_LINK_EXPIRED")) return "expired"; if (message.includes("WEB_LINK_REVOKED")) return "revoked"; if (message.includes("WEB_LINK_INVALID")) return "invalid"; return "recoverable"; }
function formatLocalDate(value: string) { return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`)); }
function formatTimestamp(value: number) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)); }
function phaseLabel(value: string) { return ({ configuracion: "Configuración", preliminar: "Preliminar", liminar: "Liminar", postliminar: "Postliminar" } as Record<string, string>)[value] ?? value; }
function statusLabel(value: string) { return ({ locked: "Aún no disponible", planned: "Preparada", active: "En curso", completed: "Completada", deferred: "Postergada" } as Record<string, string>)[value] ?? value; }
function habitStatusLabel(value: string) { return ({ active: "Activo", paused: "En pausa", archived: "Archivado" } as Record<string, string>)[value] ?? value; }

const svg = (children: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{children}</svg>;
const IconHome = () => svg(<path d="m3 11 9-7 9 7v9H3z" />);
const IconPath = () => svg(<><path d="M4 20c2-5 5-6 9-5s6-1 7-5" /><circle cx="20" cy="10" r="2" /></>);
const IconMap = () => svg(<><path d="M12 21c4-4 8-8 8-12a8 8 0 0 0-16 0c0 4 4 8 8 12Z" /><circle cx="12" cy="9" r="2.5" /></>);
const IconHistory = () => svg(<><path d="M12 7v5l3 2" /><path d="M4 8a9 9 0 1 1-1 7M3 4v5h5" /></>);
const IconMore = () => svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
const IconChevron = () => svg(<path d="m9 5 7 7-7 7" />);
const IconCheck = () => <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><path d="m2 8 3.5 3.5L13 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IconFlame = () => <svg className="flame" viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="M10 2S4 8 4 14a6 6 0 0 0 12 0c0-6-6-12-6-12Z" /><path d="M10 21a3 3 0 0 1-3-3c0-2 3-5 3-5s3 3 3 5a3 3 0 0 1-3 3Z" /></svg>;
