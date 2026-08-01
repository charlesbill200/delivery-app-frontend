import { useState } from "react";

const API_URL = "https://delivery-app-backend-z9yz.onrender.com";

// "onLogin" is a function passed down from App.jsx - calling it is how
// this component hands the token back up to the rest of the app.
function Login({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
    const body = isSignup ? { name, email, password } : { email, password };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      // Hand the token and vendor info up to App.jsx
      onLogin(data.token, data.vendor);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>{isSignup ? "Create your vendor account" : "Vendor Login"}</h1>

        {isSignup && (
          <input
            type="text"
            placeholder="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="error-text">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
        </button>

        <p className="toggle-text">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setIsSignup(!isSignup);
            }}
          >
            {isSignup ? "Log in" : "Sign up"}
          </a>
        </p>
      </form>
    </div>
  );
}

export default Login;
