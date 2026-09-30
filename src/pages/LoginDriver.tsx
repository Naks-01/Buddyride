import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function LoginDriver() {
  const [email, setEmail] = useState("prod@gmail.com");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Logging in...");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("ERROR: " + error.message);
      alert(error.message);
      return;
    }
    setStatus("Success! Going to dashboard...");
    console.log("Login OK", data);
    // Give supabase a second to set session then navigate
    setTimeout(() => {
      navigate("/driver/dashboard");
    }, 500);
  };

  return (
    <div style={{ padding: "30px", maxWidth: "380px", margin: "50px auto" }}>
      <h2>Driver Login - FIXED</h2>
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }} />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }} />
        <button type="submit" style={{ padding: "12px", background: "orange", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Login</button>
        <p>{status}</p>
      </form>
    </div>
  );
}
