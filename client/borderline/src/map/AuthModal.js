import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const inp = {
  background: "#060a10",
  color: "#e8dcc8",
  border: "1px solid #2a3a4a",
  borderRadius: 4,
  padding: "9px 12px",
  fontSize: 12,
  fontFamily: "Georgia, serif",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const btn = (gold) => ({
  background: gold ? "#c9a84c" : "transparent",
  color: gold ? "#0d1117" : "#c9a84c",
  border: `1px solid ${gold ? "#c9a84c" : "#3a4a5a"}`,
  borderRadius: 4,
  padding: "10px 0",
  fontSize: 11,
  fontFamily: "Georgia, serif",
  letterSpacing: "0.08em",
  cursor: "pointer",
  width: "100%",
  transition: "all 0.2s ease",
});

export function AuthModal({ onClose, onAuth }) {
  const [tab, setTab] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        onAuth(session.user);
      }
    });

    return () => subscription?.unsubscribe();
  }, [onAuth]);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) {
        console.error("Google OAuth error:", error);
        setError(error.message || "Failed to sign in with Google");
      }
    } catch (e) {
      console.error("Google OAuth exception:", e);
      setError(e.message || "An error occurred during Google sign-in");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (tab === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth(data.user);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: displayName } },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setMessage("Check your email to confirm your account.");
        } else {
          onAuth(data.user);
        }
      }
    } catch (e) {
      console.error("Auth error:", e);
      setError(e.message || "An authentication error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(6,10,16,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "min(380px,100%)", background: "#0f1725",
        border: "1px solid #1e2e3e", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)", padding: 28,
        fontFamily: "Georgia, serif", color: "#e8dcc8",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: "#c9a84c", letterSpacing: 3, textTransform: "uppercase" }}>
            {tab === "login" ? "Sign In" : "Create Account"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5a6a", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Google */}
        <button onClick={handleGoogle} disabled={loading} style={{
          ...btn(false), display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginBottom: 16, borderColor: "#2a3a4a", opacity: loading ? 0.6 : 1,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "Loading..." : "Continue with Google"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "#1e2e3e" }} />
          <span style={{ fontSize: 10, color: "#4a5a6a", letterSpacing: 2 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "#1e2e3e" }} />
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 18, border: "1px solid #1e2e3e", borderRadius: 4, overflow: "hidden" }}>
          {["login", "signup"].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(null); setMessage(null); }} style={{
              flex: 1, background: tab === t ? "#1a2535" : "transparent",
              color: tab === t ? "#c9a84c" : "#4a5a6a",
              border: "none", padding: "8px 0", fontSize: 10,
              fontFamily: "Georgia, serif", letterSpacing: 2, cursor: "pointer",
              textTransform: "uppercase",
            }}>
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "signup" && (
            <input placeholder="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} style={inp} />
          )}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inp} />
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 11, color: "#eb5757", lineHeight: 1.5 }}>{error}</div>}
        {message && <div style={{ marginTop: 12, fontSize: 11, color: "#6fcf97", lineHeight: 1.5 }}>{message}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(true), marginTop: 16, opacity: loading ? 0.6 : 1 }}>
          {loading ? "..." : tab === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
        </button>
      </div>
    </div>
  );
}