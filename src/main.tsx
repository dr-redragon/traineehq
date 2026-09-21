import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { endExpiredSessionOnlyLogin } from "./lib/sessionPersistence";
import "./index.css";

// Before the first render, so a sign-in the visitor asked not to keep is gone
// by the time anything asks Supabase who is signed in.
endExpiredSessionOnlyLogin();

createRoot(document.getElementById("root")!).render(<App />);
