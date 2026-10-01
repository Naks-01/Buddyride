import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function DriverLogin() {
  const [email, setEmail] = useState("prod@gmail.com");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setMsg("Logging in...");
    console.log("Trying login", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      setMsg("ERROR: " + error.message);
      alert(error.message);
      return;
    }
    console.log("Login success", data);
    setMsg("Success! Redirecting...");
    navigate("/driver/dashboard");
  };

  return (
    <div style={{ padding: "40px", maxWidth: "400px", margin: "auto", color: "white" }}>
      <button onClick={() => navigate(-1)}>Back</button>
      <h2>Login as Driver</h2>
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "20px" }}>
        <label>Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} style={{ padding: "12px", borderRadius: "8px" }} />
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ padding: "12px", borderRadius: "8px" }} />
        <button type="submit" style={{ padding: "12px", background: "orange", borderRadius: "8px", fontWeight: "bold" }}>Login</button>
        <p>{msg}</p>
      </form>
    </div>
  );
}
