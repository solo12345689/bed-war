const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let blocks = [];
let beds = {};
let projectiles = [];
let myId = null;
let myTeam = null;

// UI
const shopBtn = document.getElementById('shopBtn');
const shopDiv = document.getElementById('shop');
shopBtn.onclick = () => {
    shopDiv.style.display = shopDiv.style.display === 'none' ? 'block' : 'none';
};

// Init from server
socket.on('init', (data) => {
    myId = data.id;
    myTeam = data.team;
    players = data.players;
    blocks = data.blocks;
    beds = data.beds;
});

socket.on('player-join', (p) => players[p.id] = p);
socket.on('player-leave', (id) => delete players[id]);
socket.on('block-placed', (b) => blocks.push(b));
socket.on('block-broken', (pos) => {
    blocks = blocks.filter(b => !(b.x === pos.x && b.y === pos.y));
});
socket.on('item-bought', (data) => console.log(data.id, 'bought', data.item));
socket.on('arrow-shot', (arrow) => projectiles.push(arrow));

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillText("Players: " + Object.keys(players).length, 20, 20);

    // Draw players
    for (let id in players) {
        let p = players[id];
        ctx.fillStyle = p.team;
        ctx.fillRect(p.x, p.y, 30, 30);
    }

    // Draw blocks
    ctx.fillStyle = "brown";
    for (let b of blocks) ctx.fillRect(b.x, b.y, 30, 30);

    requestAnimationFrame(gameLoop);
}
gameLoop();