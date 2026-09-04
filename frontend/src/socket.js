import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnectionAttempts: 8,
  reconnectionDelay: 1000,
});
