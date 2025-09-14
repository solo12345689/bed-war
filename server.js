// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ------------------------------
// Game State
// ------------------------------
let players = {};
let teams = ["red", "blue", "green", "yellow"];
let beds = {
  red: true,
  blue: true,
  green: true,
  yellow: true
};
let blocks = []; // placed blocks

// Utility: auto-assign teams evenly
function assignTeam() {
  let counts = {};
  teams.forEach(t => counts[t] = 0);

  Object.values(players).forEach(p => {
    if (counts[p.team] !== undefined) counts[p.team]++;
  });

  return Object.entries(counts).sort((a,b)=>a[1]-b[1])[0][0];
}

// Reset game state (new match)
function resetGame() {
  players = {};
  beds = { red:true, blue:true, green:true, yellow:true };
  blocks = [];
  io.emit("gameReset", { beds, blocks });
}

// ------------------------------
// Socket.io
// ------------------------------
io.on("connection", (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);

  // Assign team
  let team = assignTeam();
  players[socket.id] = {
    id: socket.id,
    team,
    alive: true,
    x: 0, y: 0
  };

  socket.emit("init", {
    id: socket.id,
    players,
    team,
    beds,
    blocks
  });

  io.emit("playerJoined", players[socket.id]);

  // -------------------------
  // Player movement sync
  // -------------------------
  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    io.emit("playerMoved", players[socket.id]);
  });

  // -------------------------
  // Block placing
  // -------------------------
  socket.on("placeBlock", (data) => {
    if (!players[socket.id]) return;

    // Server-side validation
    if (typeof data.x !== "number" || typeof data.y !== "number") return;

    blocks.push({ x: data.x, y: data.y, team: players[socket.id].team });
    io.emit("blockPlaced", { x: data.x, y: data.y, team: players[socket.id].team });
  });

  // -------------------------
  // Bed breaking
  // -------------------------
  socket.on("breakBed", (team) => {
    let player = players[socket.id];
    if (!player) return;

    // Prevent breaking own bed
    if (player.team === team) return;

    if (beds[team]) {
      beds[team] = false;
      io.emit("bedBroken", { team });

      // Check win condition
      let aliveBeds = Object.entries(beds).filter(([t, alive]) => alive);
      if (aliveBeds.length === 1) {
        let winner = aliveBeds[0][0];
        io.emit("gameOver", { winner });
        setTimeout(resetGame, 8000); // restart after 8s
      }
    }
  });

  // -------------------------
  // Player death/respawn
  // -------------------------
  socket.on("playerDied", () => {
    let player = players[socket.id];
    if (!player) return;

    if (beds[player.team]) {
      // respawn
      player.alive = true;
      io.emit("playerRespawn", player);
    } else {
      // out of game
      player.alive = false;
      io.emit("playerEliminated", player);
    }
  });

  // -------------------------
  // Damage (no friendly fire)
  // -------------------------
  socket.on("damagePlayer", (targetId) => {
    let attacker = players[socket.id];
    let target = players[targetId];
    if (!attacker || !target) return;

    // Prevent friendly fire
    if (attacker.team === target.team) return;

    io.emit("playerDamaged", { targetId, by: socket.id });
  });

  // -------------------------
  // Disconnect
  // -------------------------
  socket.on("disconnect", () => {
    console.log(`❌ Player left: ${socket.id}`);
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ BedWars server running on port ${PORT}`);
});
