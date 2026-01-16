// ===============================
// HKY RACE – FINAL MULTIPLAYER SERVER
// ===============================

const WebSocket = require("ws");
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log("✅ HKY Race Server running on port", PORT);

// -------------------------------
// STATE
// -------------------------------
let rooms = {};

// -------------------------------
// HELPERS
// -------------------------------
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(roomCode, data) {
  const room = rooms[roomCode];
  if (!room) return;
  Object.values(room.players).forEach(p => send(p.ws, data));
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// -------------------------------
// CONNECTION
// -------------------------------
wss.on("connection", (ws) => {
  const playerId = Date.now() + "_" + Math.random().toString(36).slice(2);
  let currentRoom = null;

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    // HOST
    if (data.type === "host") {
      const code = generateRoomCode();
      rooms[code] = {
        hostId: playerId,
        background: "red",
        started: false,
        players: {}
      };

      rooms[code].players[playerId] = {
        ws,
        id: playerId,
        name: data.name,
        vehicle: data.vehicle,
        trophies: data.trophies || 0,
        x: 0,
        finished: false,
        time: 0
      };

      currentRoom = code;
      send(ws, { type: "hosted", roomCode: code });
      broadcast(code, { type: "playersUpdate", players: rooms[code].players });
      return;
    }

    // JOIN
    if (data.type === "join") {
      const room = rooms[data.roomCode];
      if (!room) return send(ws, { type: "error", message: "Room not found" });

      room.players[playerId] = {
        ws,
        id: playerId,
        name: data.name,
        vehicle: data.vehicle,
        trophies: data.trophies || 0,
        x: 0,
        finished: false,
        time: 0
      };

      currentRoom = data.roomCode;
      broadcast(currentRoom, { type: "playersUpdate", players: room.players });
      return;
    }

    // BACKGROUND
    if (data.type === "background") {
      const room = rooms[currentRoom];
      if (!room || room.hostId !== playerId) return;
      room.background = data.value;
      broadcast(currentRoom, { type: "backgroundUpdate", background: room.background });
      return;
    }

    // START
    if (data.type === "start") {
      const room = rooms[currentRoom];
      if (!room || room.hostId !== playerId) return;
      room.started = true;
      room.startTime = Date.now();
      broadcast(currentRoom, { type: "raceStart", background: room.background });
      return;
    }

    // POSITION SYNC
    if (data.type === "move") {
      const room = rooms[currentRoom];
      if (!room || !room.players[playerId]) return;
      room.players[playerId].x = data.x;
      broadcast(currentRoom, { type: "sync", players: room.players });
      return;
    }

    // FINISH
    if (data.type === "finish") {
      const room = rooms[currentRoom];
      if (!room || room.players[playerId].finished) return;

      const p = room.players[playerId];
      p.finished = true;
      p.time = Date.now() - room.startTime;

      const finished = Object.values(room.players).filter(pl => pl.finished);
      const position = finished.length;

      if (position === 1) {
        p.trophies += 1;
        send(ws, { type: "trophy", trophies: p.trophies });
      }

      send(ws, { type: "position", position });
      broadcast(currentRoom, { type: "playersUpdate", players: room.players });
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      } else {
        broadcast(currentRoom, { type: "playersUpdate", players: rooms[currentRoom].players });
      }
    }
  });
});