// ===============================
// HKY RACE – MULTIPLAYER SERVER
// ===============================

const WebSocket = require("ws");

/**
 * IMPORTANT:
 * - Render / cloud provides PORT automatically
 * - Local (Termux) fallback = 8080
 */
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log("✅ WebSocket server running on port", PORT);

// -------------------------------
// GAME STATE
// -------------------------------
let rooms = {}; 
/**
 * rooms = {
 *   roomCode: {
 *     hostId,
 *     background,
 *     started,
 *     players: {
 *       playerId: {
 *         ws,
 *         name,
 *         vehicle,   // v1 - v10
 *         trophies,
 *         x,
 *         finished
 *       }
 *     }
 *   }
 * }
 */

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

  Object.values(room.players).forEach(p => {
    send(p.ws, data);
  });
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

  console.log("🔗 Player connected:", playerId);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    // ---------------------------
    // SET NAME (FIRST TIME)
    // ---------------------------
    if (data.type === "setName") {
      ws.playerName = data.name;
      return;
    }

    // ---------------------------
    // HOST GAME
    // ---------------------------
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
        name: data.name,
        vehicle: data.vehicle || "v1",
        trophies: data.trophies || 0,
        x: 0,
        finished: false
      };

      currentRoom = code;

      send(ws, {
        type: "hosted",
        roomCode: code
      });

      broadcast(code, {
        type: "playersUpdate",
        players: rooms[code].players
      });

      return;
    }

    // ---------------------------
    // JOIN GAME
    // ---------------------------
    if (data.type === "join") {
      const room = rooms[data.roomCode];
      if (!room) {
        send(ws, { type: "error", message: "Room not found" });
        return;
      }

      room.players[playerId] = {
        ws,
        name: data.name,
        vehicle: data.vehicle || "v1",
        trophies: data.trophies || 0,
        x: 0,
        finished: false
      };

      currentRoom = data.roomCode;

      broadcast(currentRoom, {
        type: "playersUpdate",
        players: room.players
      });

      return;
    }

    // ---------------------------
    // BACKGROUND SELECT (HOST)
    // ---------------------------
    if (data.type === "background") {
      const room = rooms[currentRoom];
      if (!room || room.hostId !== playerId) return;

      room.background = data.value;

      broadcast(currentRoom, {
        type: "backgroundUpdate",
        background: room.background
      });

      return;
    }

    // ---------------------------
    // START RACE (HOST)
    // ---------------------------
    if (data.type === "start") {
      const room = rooms[currentRoom];
      if (!room || room.hostId !== playerId) return;

      room.started = true;

      broadcast(currentRoom, {
        type: "raceStart",
        background: room.background
      });

      return;
    }

    // ---------------------------
    // PLAYER POSITION UPDATE
    // ---------------------------
    if (data.type === "update") {
      const room = rooms[currentRoom];
      if (!room || !room.players[playerId]) return;

      room.players[playerId].x = data.x;

      broadcast(currentRoom, {
        type: "sync",
        players: room.players
      });

      return;
    }

    // ---------------------------
    // FINISH
    // ---------------------------
    if (data.type === "finish") {
      const room = rooms[currentRoom];
      if (!room || !room.players[playerId]) return;

      room.players[playerId].finished = true;

      const finishedPlayers = Object.values(room.players)
        .filter(p => p.finished);

      const position = finishedPlayers.length;

      // Trophy only for 1st place
      if (position === 1) {
        room.players[playerId].trophies += 1;

        send(ws, {
          type: "trophy",
          message: "🏆 Congratulations! You got a trophy!"
        });
      }

      send(ws, {
        type: "position",
        position
      });

      return;
    }
  });

  // ---------------------------
  // DISCONNECT
  // ---------------------------
  ws.on("close", () => {
    console.log("❌ Player disconnected:", playerId);

    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];

      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      } else {
        broadcast(currentRoom, {
          type: "playersUpdate",
          players: rooms[currentRoom].players
        });
      }
    }
  });
});
