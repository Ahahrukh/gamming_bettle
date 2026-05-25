import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, Clock3, History, LogOut, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3090/api";

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

const suitSymbols = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠"
};

function CardShow({ round }) {
  const redCards = round?.redCards || [];
  const blackCards = round?.blackCards || [];
  const revealed = round?.phase === "reveal" && redCards.length === 3 && blackCards.length === 3;

  function renderSide(side, cards) {
    return (
      <div className={`hand-side ${side}`}>
        <span className="side-label">{side.toUpperCase()}</span>
        <div className="mini-hand">
          {[0, 1, 2].map((index) => {
            const card = cards[index];
            const isRedSuit = card?.suit === "hearts" || card?.suit === "diamonds";

            return (
              <div className={`mini-card ${revealed ? "revealed" : "hidden-card"} ${isRedSuit ? "red-suit" : ""}`} key={`${side}-${index}-${card?.rank || "back"}`}>
                <div className="card-back" />
                <div className="card-front">
                  <span>{card?.rank || "?"}</span>
                  <strong>{suitSymbols[card?.suit] || "♠"}</strong>
                  <span>{card?.rank || "?"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`card-stage ${revealed ? round?.outcome : "waiting"}`} key={round?.roundNumber}>
      <div className="stage-glow" />
      <div className="dealer-line">
        <Sparkles size={18} />
        <span>{revealed ? "Cards Open" : "Bet Time"}</span>
      </div>
      <div className={`deal-board ${revealed ? "revealed" : "grinding"}`}>
        {renderSide("red", redCards)}
        <div className="versus">VS</div>
        {renderSide("black", blackCards)}
      </div>
      {revealed && (
        <div className={`winner-burst ${round.outcome}`}>
          <span>{round.outcome.toUpperCase()}</span>
          <strong>WON</strong>
        </div>
      )}
      <div className="winner-strip">
        <span>{revealed ? "Winner" : "Cards open after timer"}</span>
        <strong className={revealed ? round.outcome : ""}>
          {revealed ? `${round.outcome.toUpperCase()} - ${round.winningReason}` : "WAITING"}
        </strong>
      </div>
    </div>
  );
}

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);

  async function authFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }
    return data;
  }

  useEffect(() => {
    if (!token) return;
    authFetch("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
      });
  }, [token]);

  function saveSession(data) {
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }

  return { token, user, setUser, authFetch, saveSession, logout };
}

function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body =
        mode === "register"
          ? form
          : {
              email: form.email,
              password: form.password
            };
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Login failed");
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="brand-block">
        <div className="badge">
          <ShieldCheck size={18} /> Server synced rounds
        </div>
        <h1>Lucky Hit</h1>
        <p>Register and start with ₹30. Pick red or black before the round timer ends.</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="tabs" role="tablist">
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Register
          </button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
        </div>

        {mode === "register" && (
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
        )}

        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary" disabled={loading}>
          {loading ? "Please wait..." : mode === "register" ? "Create account" : "Login"}
        </button>
      </form>
    </section>
  );
}

function Game({ auth }) {
  const [state, setState] = useState(null);
  const [bets, setBets] = useState([]);
  const [amount, setAmount] = useState(10);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  async function loadState() {
    const response = await fetch(`${API_URL}/game/state`);
    const data = await response.json();
    setState(data);
    setServerOffset(new Date(data.serverTime).getTime() - Date.now());
  }

  async function loadBets() {
    if (!auth.token) return;
    const [betsData, profileData] = await Promise.all([
      auth.authFetch("/game/bets/me"),
      auth.authFetch("/auth/me")
    ]);
    setBets(betsData.bets);
    auth.setUser(profileData.user);
  }

  useEffect(() => {
    loadState();
    loadBets();
    const stateTimer = setInterval(async () => {
      await loadState();
      await loadBets();
    }, 2500);
    const clockTimer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(stateTimer);
      clearInterval(clockTimer);
    };
  }, [auth.token]);

  async function placeBet(color) {
    setError("");
    setMessage("");

    try {
      const data = await auth.authFetch("/game/bets", {
        method: "POST",
        body: JSON.stringify({ color, amount: Number(amount) })
      });
      auth.setUser(data.user);
      setMessage(`Bet placed on ${color.toUpperCase()} for ${money(amount)}`);
      await loadBets();
    } catch (err) {
      setError(err.message);
    }
  }

  const round = state?.currentRound;
  const syncedNow = now + serverOffset;
  const isRevealPhase = round?.phase === "reveal";
  const endsAt = round ? new Date(isRevealPhase ? round.revealEndsAt : round.endsAt).getTime() : syncedNow;
  const startsAt = round ? new Date(round.startsAt).getTime() : syncedNow;
  const phaseStartsAt = isRevealPhase ? new Date(round.endsAt).getTime() : startsAt;
  const remainingMs = Math.max(0, endsAt - syncedNow);
  const progress = Math.max(0, Math.min(100, ((syncedNow - phaseStartsAt) / (endsAt - phaseStartsAt)) * 100));
  const remaining = Math.ceil(remainingMs / 1000);

  const latestResult = state?.history?.[0];
  const totals = useMemo(() => {
    return bets.reduce(
      (acc, bet) => {
        acc[bet.status] = (acc[bet.status] || 0) + 1;
        return acc;
      },
      { won: 0, lost: 0, pending: 0 }
    );
  }, [bets]);

  return (
    <main className="game-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Lucky Hit</span>
          <h1>Lucky Hit</h1>
        </div>
        <div className="top-actions">
          <div className="wallet">
            <Wallet size={18} />
            <span>{money(auth.user?.balance)}</span>
          </div>
          <button className="icon-button" onClick={auth.logout} aria-label="Logout" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="game-grid">
        <div className="play-panel">
          <div className="round-row">
            <div>
              <span className="muted">{isRevealPhase ? "Result" : "Round"}</span>
              <strong>#{round?.roundNumber || "--"}</strong>
            </div>
            <div className="timer">
              <Clock3 size={18} />
              <strong>{remaining}s</strong>
            </div>
          </div>

          <div className="track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>

          <CardShow round={round} />

          <div className="arena">
            <button className="choice red-choice" onClick={() => placeBet("red")} disabled={!round || isRevealPhase || remaining <= 2}>
              <span>RED</span>
              <small>2x payout</small>
            </button>
            <button className="choice black-choice" onClick={() => placeBet("black")} disabled={!round || isRevealPhase || remaining <= 2}>
              <span>BLACK</span>
              <small>2x payout</small>
            </button>
          </div>

          <div className="chips" aria-label="Quick bet amounts">
            {[5, 10, 20, 30].map((chip) => (
              <button type="button" className={Number(amount) === chip ? "active" : ""} onClick={() => setAmount(chip)} key={chip}>
                ₹{chip}
              </button>
            ))}
          </div>

          <label className="amount-box">
            Bet Amount
            <input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>

          {(message || error) && <p className={error ? "error" : "success"}>{error || message}</p>}
        </div>

        <aside className="side-panel">
          <div className="result-card">
            <span className="muted">Last winner</span>
            <strong className={latestResult?.outcome || ""}>{latestResult?.outcome?.toUpperCase() || "WAITING"}</strong>
          </div>

          <div className={`history-panel ${showHistory ? "open" : ""}`}>
            <button className="history-toggle" type="button" onClick={() => setShowHistory((value) => !value)}>
              <span>
                <History size={18} />
                Last 30 Results
              </span>
              <ChevronDown size={18} />
            </button>
            {showHistory && (
              <div className="result-list">
                {state?.history?.map((item) => (
                  <div key={item.id} className="result-row">
                    <span>#{item.roundNumber}</span>
                    <strong className={item.outcome}>{item.outcome}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="bets-panel">
        <div className="section-title">
          <h2>My Bets</h2>
          <span>
            Won {totals.won} / Lost {totals.lost} / Pending {totals.pending}
          </span>
        </div>
        <div className="bets-table">
          {bets.length === 0 ? (
            <p className="muted empty">No bets yet</p>
          ) : (
            bets.map((bet) => (
              <div key={bet._id} className="bet-row">
                <span>#{bet.roundNumber}</span>
                <strong className={bet.color}>{bet.color}</strong>
                <span>{money(bet.amount)}</span>
                <span className={`status ${bet.status}`}>{bet.status}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function App() {
  const auth = useAuth();

  if (!auth.token || !auth.user) {
    return <AuthPanel onAuth={auth.saveSession} />;
  }

  return <Game auth={auth} />;
}

createRoot(document.getElementById("root")).render(<App />);
