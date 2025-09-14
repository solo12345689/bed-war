const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Game state (players, teams, beds, blocks)
let players = {};
let blocks = [];
let beds = {};
let projectiles = [];
let teams = ['red', 'blue', 'green', 'yellow'];

io.on('connection', (socket) => {
    console.log('Player connected', socket.id);

    // Assign team
    let team = teams[Object.keys(players).length % teams.length];
    players[socket.id] = { id: socket.id, team, x: 0, y: 0, inventory: [] };

    socket.emit('init', { id: socket.id, players, blocks, beds, team });

    io.emit('player-join', players[socket.id]);

    // Handle actions
    socket.on('place-block', (data) => {
        blocks.push(data);
        io.emit('block-placed', data);
    });

    socket.on('break-block', (pos) => {
        blocks = blocks.filter(b => !(b.x === pos.x && b.y === pos.y));
        io.emit('block-broken', pos);
    });

    socket.on('buy-item', (item) => {
        // Server validation placeholder
        players[socket.id].inventory.push(item);
        io.emit('item-bought', { id: socket.id, item });
    });

    socket.on('shoot-arrow', (arrow) => {
        projectiles.push(arrow);
        io.emit('arrow-shot', arrow);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-leave', socket.id);
    });
});

http.listen(10000, () => {
    console.log('Server running on port 10000');
});