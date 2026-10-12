import { createRoot } from "react-dom/client";
import { GameApp } from "../components/game/game-app";
import "./globals.css";
createRoot(document.getElementById("root")!).render(<GameApp />);
