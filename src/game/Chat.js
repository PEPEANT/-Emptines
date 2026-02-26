import { io } from "socket.io-client";

const PROD_CHAT_FALLBACK_URL = "https://reclaim-fps-chat.onrender.com";

function resolveDefaultServerUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isPrivateIpv4 =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  const isDevPort = port === "5173" || port === "4173";

  if (isLocalHost || isPrivateIpv4 || isDevPort) {
    return `${protocol}//${hostname}:3001`;
  }

  // Static hosting domains do not run the Socket.IO backend.
  if (hostname.endsWith(".netlify.app") || hostname.endsWith(".vercel.app")) {
    return PROD_CHAT_FALLBACK_URL;
  }

  return origin;
}

const SERVER_URL = import.meta.env.VITE_CHAT_SERVER ?? resolveDefaultServerUrl();
const MAX_MSGS = 80;

export class Chat {
  constructor() {
    this.playerName = `USER_${Math.floor(Math.random() * 9000 + 1000)}`;
    this.isInputFocused = false;
    this.socket = null;
    this.focusChangeHandler = null;
    this.notifiedOffline = false;
    this._teardownBound = false;

    this.messagesEl = document.getElementById("chat-messages");
    this.inputEl = document.getElementById("chat-input");
    this.sendBtn = document.getElementById("chat-send");
    this.nameEl = document.getElementById("chat-myname");

    this.enabled = !!(this.messagesEl && this.inputEl && this.sendBtn);
    if (!this.enabled) {
      return;
    }

    if (this.nameEl) {
      this.nameEl.textContent = this.playerName;
    }

    this.bindInput();
    this.connect();
  }

  setFocusChangeHandler(handler) {
    this.focusChangeHandler = typeof handler === "function" ? handler : null;
  }

  setPlayerName(rawName) {
    const safe = String(rawName ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!safe) {
      return;
    }

    this.playerName = safe;
    if (this.nameEl) {
      this.nameEl.textContent = this.playerName;
    }
  }

  isConnected() {
    return !!this.socket?.connected;
  }

  isConnecting() {
    return !!this.socket?.active && !this.socket?.connected;
  }

  notifyFocusChanged() {
    this.focusChangeHandler?.(this.isInputFocused);
  }

  connect() {
    if (!this.enabled) {
      return;
    }

    this.socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Number.MAX_SAFE_INTEGER,
      reconnectionDelay: 900,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    this.socket.on("connect", () => {
      this.notifiedOffline = false;
    });

    this.socket.on("connect_error", () => {
      this.notifiedOffline = true;
    });

    this.socket.on("disconnect", () => {});

    this.socket.on("chat:message", ({ name, text }) => {
      this.append(name, text, "player");
    });

    this.socket.on("chat:system", () => {});

    this.bindTeardown();
  }

  bindTeardown() {
    if (this._teardownBound || typeof window === "undefined") {
      return;
    }
    this._teardownBound = true;

    const disconnectNow = () => {
      if (this.socket && this.socket.connected) {
        this.socket.disconnect();
      }
    };

    window.addEventListener("pagehide", disconnectNow);
    window.addEventListener("beforeunload", disconnectNow);
  }

  bindInput() {
    if (!this.enabled) {
      return;
    }

    this.inputEl.addEventListener("focus", () => {
      this.isInputFocused = true;
      this.notifyFocusChanged();
    });

    this.inputEl.addEventListener("blur", () => {
      this.isInputFocused = false;
      this.notifyFocusChanged();
    });

    this.inputEl.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.code === "Enter") {
        event.preventDefault();
        this.send();
      }
      if (event.code === "Escape") {
        this.inputEl.blur();
      }
    });

    this.sendBtn.addEventListener("click", () => this.send());
  }

  open() {
    if (!this.enabled) {
      return;
    }
    this.inputEl.focus();
  }

  close() {
    if (!this.enabled) {
      return;
    }
    this.inputEl.blur();
  }

  send() {
    if (!this.enabled) {
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) {
      return;
    }

    if (!this.socket || !this.socket.connected) {
      this.append(this.playerName, text, "player");
      this.inputEl.value = "";
      return;
    }

    this.socket.emit("chat:send", { name: this.playerName, text });
    this.inputEl.value = "";
  }

  addSystemMessage(text, level = "system") {
    if (!this.enabled) {
      return;
    }
    this.append(null, text, level);
  }

  clear() {
    if (!this.enabled) {
      return;
    }
    this.messagesEl.innerHTML = "";
  }

  append(name, text, type) {
    if (!this.enabled) {
      return;
    }

    const el = document.createElement("div");
    el.className = `chat-msg ${type}`;

    if (type === "player") {
      const nameSpan = document.createElement("span");
      nameSpan.className = "chat-name";
      nameSpan.textContent = `${name}: `;
      el.appendChild(nameSpan);
      el.appendChild(document.createTextNode(text));
    } else {
      el.textContent = text;
    }

    this.messagesEl.appendChild(el);

    while (this.messagesEl.children.length > MAX_MSGS) {
      this.messagesEl.removeChild(this.messagesEl.firstChild);
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
