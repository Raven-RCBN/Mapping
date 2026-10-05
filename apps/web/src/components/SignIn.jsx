import { useState } from "react";
import { signIn } from "../api";

export default function SignIn({ onSignedIn, message, onRetry }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="startup mapping-signin">
      <img
        src={import.meta.env.BASE_URL + "icon.svg"}
        width="64"
        alt="Estate Atlas"
      />
      <h1>Sign in to Estate Atlas</h1>
      <p>Your maps, imagery and field activities.</p>
      {message && <p role="status">{message}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await signIn(username.trim(), password);
            setPassword("");
            await onSignedIn();
          } catch (e) {
            setError(
              e.response?.data?.error?.desc ||
                e.response?.data?.error?.Desc ||
                e.message ||
                "Unable to sign in."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button className="button" onClick={onRetry} disabled={busy}>
        Retry connection
      </button>
    </main>
  );
}
