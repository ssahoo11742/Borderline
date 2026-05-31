import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer } from "react-leaflet";
import { MapContent } from "./MapContent";
import { supabase } from "./supabaseClient";
import { AuthModal } from "./AuthModal";
import {
  HF_BASE,
  PROVINCES_URL,
  METADATA_URL,
  MIN_YEAR,
  MAX_YEAR,
  MAX_ROUNDS,
  OCEAN_COLOR,
  COLOR_MODES,
  pickRandomYear,
  calcScore,
  yearLabel,
  resolveFullName,
  resolveColor,
  computeGroupedLabels,
} from "./mapUtils";

function buildMerged(provinces, yearData, metadata, colorMode) {
  if (!provinces || !yearData || !metadata) return null;
  return {
    ...provinces,
    features: provinces.features.map(f => {
      const info = yearData[f.properties.name];
      if (!info) return f;
      const [rulerKey, cultureKey, religionKey, capital] = info;
      const modeKey = colorMode === "ruler" ? rulerKey : colorMode === "culture" ? cultureKey : religionKey;
      return {
        ...f,
        properties: {
          ...f.properties,
          rulerKey, cultureKey, religionKey,
          rulerName: resolveFullName(metadata, "ruler", rulerKey),
          cultureName: resolveFullName(metadata, "culture", cultureKey),
          religionName: resolveFullName(metadata, "religion", religionKey),
          capital,
          color: resolveColor(metadata, colorMode, modeKey),
        },
      };
    }),
  };
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function dbCreateGame(userId) {
  const { data, error } = await supabase
    .from("games")
    .insert({ user_id: userId, total_score: 0, rounds_played: 0, is_complete: false })
    .select("id")
    .single();
  if (error) { console.error("createGame:", error); return null; }
  return data.id;
}

async function dbSaveRound(gameId, userId, roundNumber, actualYear, guessYear, score) {
  const { error } = await supabase.from("rounds").insert({
    game_id: gameId,
    user_id: userId,
    round_number: roundNumber,
    actual_year: actualYear,
    guess_year: guessYear,
    score,
  });
  if (error) console.error("saveRound:", error);
}

async function dbUpdateGame(gameId, totalScore, roundsPlayed, isComplete) {
  const { error } = await supabase.from("games")
    .update({
      total_score: totalScore,
      rounds_played: roundsPlayed,
      is_complete: isComplete,
      ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", gameId);
  if (error) console.error("updateGame:", error);
}

async function dbFetchHistory(userId) {
  const { data, error } = await supabase
    .from("games")
    .select(`id, started_at, completed_at, total_score, rounds_played, is_complete,
             rounds(round_number, actual_year, guess_year, score)`)
    .eq("user_id", userId)
    .eq("is_complete", true)
    .order("completed_at", { ascending: false })
    .limit(50);
  if (error) { console.error("fetchHistory:", error); return []; }
  return data;
}

async function dbFetchLeaderboard() {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .limit(50);
  if (error) { console.error("fetchLeaderboard:", error); return []; }
  return data;
}

// ─── Small UI components ─────────────────────────────────────────────────────

function ScoreBar({ score, max = 1000 }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const color = score > 600 ? "#6fcf97" : score > 250 ? "#f0c040" : "#eb5757";
  return (
    <div style={{ height: 3, background: "#1a2535", borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.6s ease", borderRadius: 2 }} />
    </div>
  );
}

function HistoryScreen({ userId, onBack }) {
  const [games, setGames] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    dbFetchHistory(userId).then(setGames);
  }, [userId]);

  const scoreColor = (s) => s > 600 ? "#6fcf97" : s > 250 ? "#f0c040" : "#eb5757";

  return (
    <div style={{ background: "#0a0f16", minHeight: "100vh", fontFamily: "Georgia, serif", color: "#e8dcc8" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2530", display: "flex", alignItems: "center", gap: 16 }}>
        <span onClick={onBack} style={{ color: "#c9a84c", fontSize: 11, letterSpacing: 2, cursor: "pointer", opacity: 0.7 }}>← BACK</span>
        <span style={{ color: "#c9a84c", fontSize: 13, letterSpacing: 4 }}>GAME HISTORY</span>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>
        {games === null && (
          <div style={{ textAlign: "center", color: "#4a5a6a", letterSpacing: 3, fontSize: 11, marginTop: 60 }}>LOADING...</div>
        )}
        {games?.length === 0 && (
          <div style={{ textAlign: "center", color: "#4a5a6a", letterSpacing: 2, fontSize: 11, marginTop: 60 }}>No completed games yet.</div>
        )}
        {games?.map((g, i) => {
          const date = new Date(g.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const isOpen = expanded === g.id;
          const sortedRounds = [...(g.rounds || [])].sort((a, b) => a.round_number - b.round_number);
          return (
            <div key={g.id} style={{
              border: "1px solid #1e2e3e", borderRadius: 8, marginBottom: 12, overflow: "hidden",
              background: "#0d1520",
            }}>
              <div onClick={() => setExpanded(isOpen ? null : g.id)} style={{
                padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 2, marginBottom: 4 }}>{date}</div>
                  <div style={{ fontSize: 13, color: "#e8dcc8", letterSpacing: 1 }}>
                    Game #{games.length - i}
                  </div>
                  <ScoreBar score={g.total_score} max={MAX_ROUNDS * 1000} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: scoreColor(g.total_score / MAX_ROUNDS) }}>
                    {g.total_score}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 1 }}>/ {MAX_ROUNDS * 1000}</div>
                </div>
              </div>

              {isOpen && (
                <div style={{ borderTop: "1px solid #1a2530", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {sortedRounds.map(r => (
                    <div key={r.round_number} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9aa6b8" }}>
                      <span style={{ color: "#4a5a6a", minWidth: 60 }}>Round {r.round_number}</span>
                      <span>Actual <strong style={{ color: "#c9a84c" }}>{yearLabel(r.actual_year)}</strong></span>
                      <span>Guess <strong style={{ color: "#e8dcc8" }}>{yearLabel(r.guess_year)}</strong></span>
                      <strong style={{ color: scoreColor(r.score), minWidth: 36, textAlign: "right" }}>{r.score}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardScreen({ onBack }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    dbFetchLeaderboard().then(setRows);
  }, []);

  const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;

  return (
    <div style={{ background: "#0a0f16", minHeight: "100vh", fontFamily: "Georgia, serif", color: "#e8dcc8" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2530", display: "flex", alignItems: "center", gap: 16 }}>
        <span onClick={onBack} style={{ color: "#c9a84c", fontSize: 11, letterSpacing: 2, cursor: "pointer", opacity: 0.7 }}>← BACK</span>
        <span style={{ color: "#c9a84c", fontSize: 13, letterSpacing: 4 }}>LEADERBOARD</span>
      </div>

      <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 80px 80px", gap: 0,
          fontSize: 9, color: "#4a5a6a", letterSpacing: 2, padding: "0 14px 10px", textTransform: "uppercase" }}>
          <span>#</span><span>Player</span><span style={{ textAlign: "right" }}>Best</span>
          <span style={{ textAlign: "right" }}>Avg</span><span style={{ textAlign: "right" }}>Games</span>
        </div>

        {rows === null && (
          <div style={{ textAlign: "center", color: "#4a5a6a", letterSpacing: 3, fontSize: 11, marginTop: 40 }}>LOADING...</div>
        )}

        {rows?.map((r, i) => (
          <div key={r.user_id} style={{
            display: "grid", gridTemplateColumns: "40px 1fr 80px 80px 80px",
            alignItems: "center", padding: "12px 14px", marginBottom: 4,
            background: i < 3 ? "rgba(201,168,76,0.05)" : "#0d1520",
            border: `1px solid ${i < 3 ? "rgba(201,168,76,0.15)" : "#1e2e3e"}`,
            borderRadius: 6, fontSize: 12,
          }}>
            <span style={{ color: "#c9a84c", fontSize: i < 3 ? 16 : 11 }}>{medal(i)}</span>
            <span style={{ color: "#e8dcc8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.display_name || "Anonymous"}
            </span>
            <span style={{ textAlign: "right", color: "#6fcf97", fontWeight: "bold" }}>{r.best_score}</span>
            <span style={{ textAlign: "right", color: "#9aa6b8" }}>{r.avg_score}</span>
            <span style={{ textAlign: "right", color: "#4a5a6a" }}>{r.games_played}</span>
          </div>
        ))}

        {rows?.length === 0 && (
          <div style={{ textAlign: "center", color: "#4a5a6a", letterSpacing: 2, fontSize: 11, marginTop: 40 }}>
            No scores yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Mapguessr() {
  const [dataVersion, setDataVersion] = useState(0);
  const [screen, setScreen] = useState("splash"); // splash | game | explore | gameover | history | leaderboard
  const [provinces, setProvinces] = useState(null);
  const [metadata, setMetadata] = useState(null);

  // Auth
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Current game DB id
  const [gameId, setGameId] = useState(null);

  const [showBorders, setShowBorders] = useState(false);
  const [showMarkers, setShowMarkers] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [colorMode, setColorMode] = useState("ruler");

  const [actualYear, setActualYear] = useState(0);
  const [yearData, setYearData] = useState(null);
  const [markerData, setMarkerData] = useState(null);
  const [guessYear, setGuessYear] = useState(0);
  const [guessInput, setGuessInput] = useState("0");
  const [phase, setPhase] = useState("guessing");
  const [score, setScore] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [round, setRound] = useState(1);

  const [exploreYear, setExploreYear] = useState(1000);
  const [exploreYearData, setExploreYearData] = useState(null);
  const [exploreMarkerData, setExploreMarkerData] = useState(null);

  const [paneOpacity, setPaneOpacity] = useState(1);
  const [tooltip, setTooltip] = useState(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const ttTimer = useRef(null);
  const fadeTimer = useRef(null);
  const exploreDebounce = useRef(null);

  // ── Auth init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // ── Map data init ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(PROVINCES_URL).then(r => r.json()),
      fetch(METADATA_URL).then(r => r.json()),
    ]).then(([p, m]) => { setProvinces(p); setMetadata(m); });
  }, []);

  const fadeLoad = useCallback((fetchFn, onData) => {
    clearTimeout(fadeTimer.current);
    setPaneOpacity(0);
    fetchFn().then(data => {
      fadeTimer.current = setTimeout(() => {
        onData(data);
        setPaneOpacity(1);
      }, 300);
    });
  }, []);

  const clampYear = (value) => Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.round(value)));

  const updateGuessInput = (value) => {
    if (value === "" || value === "-" || value === "+") { setGuessInput(value); return; }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const clamped = clampYear(parsed);
      setGuessYear(clamped);
      setGuessInput(String(clamped));
    } else {
      setGuessInput(value);
    }
  };

  const loadGameYear = useCallback((y) => {
    const snap = Math.round(y / 10) * 10;
    fadeLoad(
      () => Promise.all([
        fetch(`${HF_BASE}/attrs/${snap}.json`).then(r => r.ok ? r.json() : {}),
        fetch(`${HF_BASE}/attrs/${snap}_markers.geojson`).then(r => r.ok ? r.json() : null),
      ]),
      ([attrs, markers]) => { setYearData(attrs); setMarkerData(markers); setDataVersion(v => v + 1); }
    );
  }, [fadeLoad]);

  const loadExploreYear = useCallback((y) => {
    const snap = Math.round(y / 10) * 10;
    clearTimeout(exploreDebounce.current);
    exploreDebounce.current = setTimeout(() => {
      fadeLoad(
        () => Promise.all([
          fetch(`${HF_BASE}/attrs/${snap}.json`).then(r => r.ok ? r.json() : {}),
          fetch(`${HF_BASE}/attrs/${snap}_markers.geojson`).then(r => r.ok ? r.json() : null),
        ]),
        ([attrs, markers]) => { setExploreYearData(attrs); setExploreMarkerData(markers); }
      );
    }, 80);
  }, [fadeLoad]);

  const startRound = useCallback((existingGameId) => {
    const y = pickRandomYear();
    setActualYear(y);
    setGuessYear(0);
    setGuessInput("0");
    setScore(null);
    setPhase("guessing");
    setShowResultModal(false);
    setTooltip(null);
    setTooltipVisible(false);
    setMarkerData(null);
    loadGameYear(y);
  }, [loadGameYear]);

  // Start a brand-new game: create DB row if logged in, then start round 1
  const startGame = useCallback(async () => {
    setRound(1);
    setTotalScore(0);
    setScreen("game");
    let gid = null;
    if (user) {
      gid = await dbCreateGame(user.id);
      setGameId(gid);
    } else {
      setGameId(null);
    }
    startRound(gid);
  }, [user, startRound]);

  // ── Confirm guess ──────────────────────────────────────────────────────────
  const confirmGuess = useCallback(async () => {
    const s = calcScore(guessYear, actualYear);
    const newTotal = totalScore + s;
    const newRound = round;

    setScore(s);
    setTotalScore(newTotal);
    setPhase("revealed");
    setShowResultModal(true);

    if (user && gameId) {
      await dbSaveRound(gameId, user.id, newRound, actualYear, guessYear, s);
      const isLastRound = newRound >= MAX_ROUNDS;
      await dbUpdateGame(gameId, newTotal, newRound, isLastRound);
    }
  }, [guessYear, actualYear, totalScore, round, user, gameId]);

  // ── Advance to next round or game over ─────────────────────────────────────
  const advanceGame = useCallback(() => {
    setShowResultModal(false);
    if (round >= MAX_ROUNDS) {
      setScreen("gameover");
    } else {
      setRound(r => r + 1);
      startRound(gameId);
    }
  }, [round, gameId, startRound]);

  // ── Memos ──────────────────────────────────────────────────────────────────
  const gameMerged = useMemo(() => buildMerged(provinces, yearData, metadata, colorMode), [provinces, yearData, metadata, colorMode]);
  const exploreMerged = useMemo(() => buildMerged(provinces, exploreYearData, metadata, colorMode), [provinces, exploreYearData, metadata, colorMode]);

  const activeData = screen === "explore" ? exploreMerged : gameMerged;
  const activeMarkers = screen === "explore" ? exploreMarkerData : markerData;

  const groupedLabels = useMemo(() => {
    if (!activeData) return [];
    return computeGroupedLabels(activeData.features, colorMode);
  }, [activeData, colorMode]);

  const showTT = useCallback((data) => {
    clearTimeout(ttTimer.current);
    setTooltip(data);
    ttTimer.current = setTimeout(() => setTooltipVisible(true), 10);
  }, []);
  const hideTT = useCallback(() => {
    setTooltipVisible(false);
    ttTimer.current = setTimeout(() => setTooltip(null), 280);
  }, []);

  const onEachFeature = useCallback((feature, layer) => {
    layer.on({
      mouseover: () => {
        const p = feature.properties;
        layer.setStyle({ weight: 0.8, color: "#c9a84c" });
        showTT({ name: p.name, ruler: p.rulerName, culture: p.cultureName, religion: p.religionName, capital: p.capital });
      },
      mouseout: () => {
        layer.setStyle({ weight: showBorders ? 0.5 : 0, color: "#000" });
        hideTT();
      }
    });
  }, [showBorders, showTT, hideTT]);

  const styleFeature = useCallback((feature) => ({
    fillColor: feature.properties.color || "#1e3248",
    weight: showBorders ? 0.5 : 0,
    color: "#000",
    fillOpacity: 0.82,
  }), [showBorders]);

  const prevColorMode = useRef(colorMode);
  useEffect(() => {
    if (prevColorMode.current !== colorMode) {
      prevColorMode.current = colorMode;
      setPaneOpacity(0);
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setPaneOpacity(1), 350);
    }
  }, [colorMode]);

  const geoKey = `${colorMode}-${showBorders}-${screen === "explore" ? exploreYear : actualYear}-${dataVersion}`;

  // ── Shared styles ──────────────────────────────────────────────────────────
  const btn = (active) => ({
    background: active ? "#c9a84c" : "transparent",
    color: active ? "#0d1117" : "#c9a84c",
    border: `1px solid ${active ? "#c9a84c" : "#3a4a5a"}`,
    padding: "3px 11px", cursor: "pointer", borderRadius: 3,
    fontSize: 11, fontFamily: "Georgia, serif", letterSpacing: "0.05em",
    transition: "all 0.2s ease",
  });

  const scoreColor = (s) => s > 600 ? "#6fcf97" : s > 250 ? "#f0c040" : "#eb5757";

  // ── User avatar button (top-right) ─────────────────────────────────────────
  const UserBadge = () => {
    const [open, setOpen] = useState(false);
    if (authLoading) return null;
    if (!user) return (
      <button onClick={() => setShowAuth(true)} style={{ ...btn(false), fontSize: 10, letterSpacing: 1.5 }}>
        SIGN IN
      </button>
    );
    const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Player";
    const avatar = user.user_metadata?.avatar_url;
    return (
      <div style={{ position: "relative" }}>
        <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
          {avatar
            ? <img src={avatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid #3a4a5a" }} />
            : <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1a2535", border: "1px solid #3a4a5a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#c9a84c" }}>
                {name[0].toUpperCase()}
              </div>
          }
          <span style={{ fontSize: 10, color: "#c9a84c", letterSpacing: 1 }}>{name}</span>
        </div>
        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)",
            background: "#0f1725", border: "1px solid #1e2e3e", borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 500, minWidth: 140, overflow: "hidden",
          }}>
            {[
              { label: "History", action: () => { setScreen("history"); setOpen(false); } },
              { label: "Leaderboard", action: () => { setScreen("leaderboard"); setOpen(false); } },
              { label: "Sign Out", action: () => { handleSignOut(); setOpen(false); } },
            ].map(({ label, action }) => (
              <div key={label} onClick={action} style={{
                padding: "10px 14px", fontSize: 11, color: "#c9a84c", letterSpacing: 1.5,
                cursor: "pointer", fontFamily: "Georgia, serif",
                borderBottom: label !== "Sign Out" ? "1px solid #1a2530" : "none",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#1a2535"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {label.toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Screens that replace the full page ────────────────────────────────────
  if (screen === "history") {
    return user
      ? <HistoryScreen userId={user.id} onBack={() => setScreen("splash")} />
      : null; // shouldn't happen; guard anyway
  }

  if (screen === "leaderboard") {
    return <LeaderboardScreen onBack={() => setScreen("splash")} />;
  }

  if (screen === "splash") return (
    <div style={{ background: "#0a0f16", height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 14, position: "relative" }}>
      {/* top-right auth */}
      <div style={{ position: "absolute", top: 14, right: 16 }}>
        <UserBadge />
      </div>

      <div style={{ fontSize: 36, color: "#c9a84c", letterSpacing: 7, fontFamily: "Georgia, serif", fontWeight: "bold" }}>MAPGUESSR</div>
      <div style={{ color: "#4a5a6a", fontSize: 11, letterSpacing: 3 }}>EXPLORE HISTORY THROUGH MAPS</div>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button onClick={startGame} style={{ ...btn(true), padding: "9px 28px", fontSize: 12 }}>PLAY GAME</button>
        <button onClick={() => { setScreen("explore"); loadExploreYear(exploreYear); }}
          style={{ ...btn(false), padding: "9px 28px", fontSize: 12 }}>EXPLORE</button>
        <button onClick={() => setScreen("leaderboard")} style={{ ...btn(false), padding: "9px 28px", fontSize: 12 }}>LEADERBOARD</button>
      </div>
      {!user && (
        <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 2, marginTop: 8 }}>
          <span style={{ color: "#c9a84c", cursor: "pointer", textDecoration: "underline" }} onClick={() => setShowAuth(true)}>
            Sign in
          </span>
          {" "}to save scores & appear on the leaderboard
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={(u) => { setUser(u); setShowAuth(false); }} />}
    </div>
  );

  if (screen === "gameover") return (
    <div style={{ background: "#0a0f16", height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 14, position: "relative" }}>
      <div style={{ position: "absolute", top: 14, right: 16 }}><UserBadge /></div>
      <div style={{ fontSize: 36, color: "#c9a84c", letterSpacing: 7, fontFamily: "Georgia, serif", fontWeight: "bold" }}>GAME OVER</div>
      <div style={{ fontSize: 18, color: "#aaa", fontFamily: "Georgia, serif" }}>
        Final Score: <span style={{ color: "#c9a84c", fontWeight: "bold" }}>{totalScore}</span> / {MAX_ROUNDS * 1000}
      </div>
      {!user && (
        <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 2 }}>
          <span style={{ color: "#c9a84c", cursor: "pointer", textDecoration: "underline" }} onClick={() => setShowAuth(true)}>
            Sign in
          </span>
          {" "}to save this score
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
        <button onClick={startGame} style={{ ...btn(true), padding: "9px 28px", fontSize: 12 }}>PLAY AGAIN</button>
        <button onClick={() => setScreen("splash")} style={{ ...btn(false), padding: "9px 28px", fontSize: 12 }}>MENU</button>
        {user && <button onClick={() => setScreen("history")} style={{ ...btn(false), padding: "9px 28px", fontSize: 12 }}>HISTORY</button>}
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={(u) => { setUser(u); setShowAuth(false); }} />}
    </div>
  );

  // ── Main game / explore layout ────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Georgia, serif", background: "#0a0f16" }}>
      {/* Header */}
      <div style={{ padding: "7px 14px", background: "#0a0f16", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, borderBottom: "1px solid #1a2530" }}>
        <div style={{ fontSize: 11, color: "#c9a84c", letterSpacing: 2, opacity: 0.65, minWidth: 100 }}>
          {screen === "explore" ? (
            <span style={{ cursor: "pointer", opacity: 0.7 }} onClick={() => setScreen("splash")}>← MENU</span>
          ) : (
            `ROUND ${round}/${MAX_ROUNDS}`
          )}
        </div>

        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {COLOR_MODES.map(m => (
            <button key={m} onClick={() => setColorMode(m)} style={btn(colorMode === m)}>
              {m.toUpperCase()}
            </button>
          ))}
          <div style={{ width: 1, height: 14, background: "#2a3a4a", margin: "0 4px" }} />
          <button onClick={() => setShowBorders(b => !b)} style={btn(showBorders)}>BORDERS</button>
          <button onClick={() => setShowMarkers(b => !b)} style={btn(showMarkers)}>MARKERS</button>
          <button onClick={() => setShowLabels(b => !b)} style={btn(showLabels)}>LABELS</button>
        </div>

        <div style={{ minWidth: 100, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#c9a84c", letterSpacing: 2, opacity: 0.65 }}>
            {screen === "explore" ? yearLabel(exploreYear) : `${totalScore} PTS`}
          </div>
          <UserBadge />
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0, position: "relative" }}>
        {provinces ? (
          <MapContainer
            center={[20, 0]} zoom={2} minZoom={2}
            maxBounds={[[-90, -180], [90, 180]]}
            maxBoundsViscosity={1.0}
            style={{ height: "100%", width: "100%", background: OCEAN_COLOR }}
          >
            <MapContent
              mergedGeoJSON={activeData}
              groupedLabels={groupedLabels}
              showLabels={showLabels}
              showMarkers={showMarkers}
              markerData={activeMarkers}
              showBorders={showBorders}
              colorMode={colorMode}
              geoKey={geoKey}
              onEachFeature={onEachFeature}
              styleFeature={styleFeature}
              paneOpacity={paneOpacity}
            />
          </MapContainer>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f16", color: "#c9a84c", fontSize: 11, letterSpacing: 4 }}>
            LOADING
          </div>
        )}

        {/* Province tooltip */}
        {tooltip && (
          <div style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(6,10,16,0.9)", backdropFilter: "blur(8px)",
            color: "#e8dcc8", padding: "12px 16px", borderRadius: 4,
            border: "1px solid #1e2e3e", zIndex: 1000, minWidth: 210, pointerEvents: "none",
            opacity: tooltipVisible ? 1 : 0,
            transform: tooltipVisible ? "translateY(0px)" : "translateY(-5px)",
            transition: "opacity 0.22s ease, transform 0.22s ease",
          }}>
            <div style={{ fontSize: 9, color: "#c9a84c", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>{colorMode}</div>
            <div style={{ fontWeight: "bold", fontSize: 15, marginBottom: 10, color: "#fff", lineHeight: 1.3 }}>
              {colorMode === "ruler" ? tooltip.ruler : colorMode === "culture" ? tooltip.culture : tooltip.religion}
            </div>
            <div style={{ height: 1, background: "linear-gradient(to right, #2a3a4a, transparent)", marginBottom: 9 }} />
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 5 }}>
              {[["Region", tooltip.name], ["Ruler", tooltip.ruler], ["Religion", tooltip.religion], ["Culture", tooltip.culture], tooltip.capital && ["Capital", tooltip.capital]]
                .filter(Boolean)
                .map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "#4a5a6a", minWidth: 52, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: "#c8bea8" }}>{v}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Result modal */}
        {screen === "game" && phase === "revealed" && showResultModal && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center",
            background: "rgba(6,10,16,0.75)", zIndex: 1100, padding: 20,
          }}>
            <div style={{ width: "min(420px,100%)", background: "#0f1725", border: "1px solid #1e2e3e", borderRadius: 14, boxShadow: "0 15px 40px rgba(0,0,0,0.45)", padding: 24, color: "#e8dcc8" }}>
              <div style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 2, color: "#c9a84c", marginBottom: 14 }}>Round {round} result</div>
              <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa6b8" }}><span>Actual</span><span>{yearLabel(actualYear)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa6b8" }}><span>Your guess</span><span>{yearLabel(guessYear)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa6b8" }}><span>Points</span><span style={{ color: scoreColor(score) }}>{score}</span></div>
              </div>
              {!user && (
                <div style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 1.5, marginBottom: 14, textAlign: "center" }}>
                  <span style={{ color: "#c9a84c", cursor: "pointer", textDecoration: "underline" }} onClick={() => setShowAuth(true)}>
                    Sign in
                  </span>
                  {" "}to save your scores
                </div>
              )}
              <button onClick={advanceGame} style={{ ...btn(true), width: "100%", padding: "10px 0", fontSize: 12, letterSpacing: 2 }}>
                {round >= MAX_ROUNDS ? "RESULTS" : "NEXT →"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div style={{ padding: "10px 16px", background: "#0a0f16", borderTop: "1px solid #1a2530", flexShrink: 0 }}>
        {screen === "explore" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={exploreYear}
              onChange={e => { const y = Number(e.target.value); setExploreYear(y); loadExploreYear(y); }}
              style={{ width: "100%", accentColor: "#c9a84c", cursor: "pointer" }} />
            <div style={{ textAlign: "center", color: "#c9a84c", fontWeight: "bold", fontSize: 15, letterSpacing: 3 }}>
              {yearLabel(exploreYear)}
            </div>
          </div>
        )}

        {screen === "game" && phase === "guessing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={guessYear}
                onChange={e => { const y = Number(e.target.value); setGuessYear(y); setGuessInput(String(y)); }}
                style={{ flex: 1, accentColor: "#c9a84c", cursor: "pointer" }} />
              <input type="number" min={MIN_YEAR} max={MAX_YEAR} step={1} value={guessInput}
                onChange={e => updateGuessInput(e.target.value)}
                onBlur={() => { if (guessInput === "" || guessInput === "-" || guessInput === "+") { setGuessYear(0); setGuessInput("0"); } }}
                className="year-input"
                style={{ width: 100, background: "#0a0f16", color: "#e8dcc8", border: "1px solid #3a4a5a", borderRadius: 5, padding: "8px 10px", fontSize: 12 }} />
            </div>
            <div style={{ textAlign: "center", color: "#c9a84c", fontWeight: "bold", fontSize: 15, letterSpacing: 3 }}>
              {yearLabel(guessYear)}
            </div>
            <button onClick={confirmGuess} style={{ ...btn(true), width: "100%", padding: "7px", fontSize: 11, letterSpacing: 3 }}>
              CONFIRM GUESS
            </button>
          </div>
        )}

        {screen === "game" && phase === "revealed" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, display: "flex", gap: 20, color: "#6a7a8a", letterSpacing: 1.5 }}>
              <span>ACTUAL <strong style={{ color: "#c9a84c" }}>{yearLabel(actualYear)}</strong></span>
              <span>GUESS <strong style={{ color: "#e8dcc8" }}>{yearLabel(guessYear)}</strong></span>
              <span>SCORE <strong style={{ color: scoreColor(score) }}>{score}</strong></span>
            </div>
            <button onClick={advanceGame} style={{ ...btn(true), padding: "7px 18px", fontSize: 11, letterSpacing: 2 }}>
              {round >= MAX_ROUNDS ? "RESULTS" : "NEXT →"}
            </button>
          </div>
        )}
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={(u) => { setUser(u); setShowAuth(false); }} />}

      <style>{`
        .region-label { background: none !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .region-label::before { display: none !important; }
        .leaflet-tooltip.region-label { pointer-events: none !important; }
        .leaflet-container { font-family: Georgia, serif; }
        input.year-input::-webkit-outer-spin-button,
        input.year-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.year-input { -moz-appearance: textfield; appearance: textfield; }
        .map-label {
          font-weight: 700; color: rgba(255,255,255,0.92);
          text-shadow: 0 0 8px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95);
          white-space: nowrap; letter-spacing: 0.09em; text-transform: uppercase;
          pointer-events: none; font-family: Georgia, 'Times New Roman', serif;
          transition: opacity 0.35s ease, font-size 0.3s ease; opacity: 1;
        }
        .map-label-fade { opacity: 0; transition: opacity 0.15s ease; }
      `}</style>
    </div>
  );
}