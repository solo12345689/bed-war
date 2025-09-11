// index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

// ✅ Serve static files (index.html, style.css, client.js)
app.use(express.static(__dirname));

// ✅ Default route
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// --- Game Data ---
let players = {};

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on("join", (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name || "Guest",
      team: null,
      health: 100,
      resources: 0
    };
    io.emit("updatePlayers", players);
  });

  socket.on("collect", (amount) => {
    if (players[socket.id]) {
      players[socket.id].resources += amount;
      io.emit("updatePlayers", players);
    }
  });

  socket.on("damage", (amount) => {
    if (players[socket.id]) {
      players[socket.id].health -= amount;
      if (players[socket.id].health <= 0) {
        players[socket.id].health = 0;
        console.log(`${players[socket.id].name} was eliminated!`);
      }
      io.emit("updatePlayers", players);
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

