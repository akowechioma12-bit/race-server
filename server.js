const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("WebSocket server running on port", PORT);

let players = {};

wss.on("connection", (ws) => {
  const id = Date.now().toString();
  players[id] = { id, name: "", vehicle: "v1", trophies: 0 };

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === "join") {
      players[id] = { ...players[id], ...data };
      broadcastPlayers();
    }

    if (data.type === "position") {
      players[id].x = data.x;
      broadcast({ type: "positions", players });
    }
  });

  ws.on("close", () => {
    delete players[id];
    broadcastPlayers();
  });
});

function broadcastPlayers() {
  broadcast({ type: "players", players });
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  Object.values(players).forEach(p => {
    if (p.ws) p.ws.send(msg);
  });
}