/**
 * Bed Wars server (Express + Socket.IO)
 * Features:
 * - Teams and beds
 * - Team resource spawners (iron/gold/diamond/emerald)
 * - Shop purchases validated server-side
 * - Server-authoritative projectiles (arrows)
 * - Respawn if bed alive, elimination otherwise
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const shortid = require('shortid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Game config ---
const TEAMS = ['red','blue','green','yellow'];
const SPAWN_POS = {
  red:   { x:-20, y:2, z:0 },
  blue:  { x:20,  y:2, z:0 },
  green: { x:0,   y:2, z:-20 },
  yellow:{ x:0,   y:2, z:20 }
};

const ITEMS = {
  iron_sword:    { id:'iron_sword', name:'Iron Sword', cost:{ gold:3 }, type:'weapon', baseDamage:14 },
  gold_sword:    { id:'gold_sword', name:'Gold Sword', cost:{ gold:10 }, type:'weapon', baseDamage:14 },
  diamond_sword: { id:'diamond_sword', name:'Diamond Sword', cost:{ emerald:5 }, type:'weapon', baseDamage:18 },
  bow:           { id:'bow', name:'Bow', cost:{ gold:2 }, type:'weapon', baseDamage:6, projectile:true },
  bow_up:        { id:'bow_up', name:'Bow (Up)', cost:{ gold:4 }, type:'weapon', baseDamage:8, projectile:true },
  super_bow:     { id:'super_bow', name:'Super Bow', cost:{ gold:16 }, type:'weapon', baseDamage:14, projectile:true },

  iron_boots:    { id:'iron_boots', name:'Iron Boots', cost:{ gold:3 }, type:'armor', armorValue:2 },
  iron_pants:    { id:'iron_pants', name:'Iron Pants', cost:{ gold:3 }, type:'armor', armorValue:4 },
  iron_chest:    { id:'iron_chest', name:'Iron Chestplate', cost:{ gold:3 }, type:'armor', armorValue:6 },

  stone_block:   { id:'stone_block', name:'Block (Stone)', cost:{ iron:4 }, type:'block' },
  healing_potion:{ id:'healing_potion', name:'Healing Potion', cost:{ iron:6 }, type:'consumable', heal:8 },
  tnt:           { id:'tnt', name:'TNT', cost:{ gold:10 }, type:'explosive' },
  ender_pearl:   { id:'ender_pearl', name:'Ender Pearl', cost:{ gold:8 }, type:'utility' }
};

// Spawner rates (ms)
const SPAWN_RATES = { iron:5000, gold:15000, diamond:45000, emerald:60000 };
const SPAWN_AMOUNTS = { iron:1, gold:1, diamond:1, emerald:1 };

// Game state
let players = {}; // socketId -> player
let teamResources = {}; // team -> {iron,gold,diamond,emerald}
let beds = {}; // team -> alive
let worldBlocks = []; // placed blocks
let projectiles = {}; // id -> projectile

function initGame() {
  players = {};
  projectiles = {};
  worldBlocks = [];
  TEAMS.forEach(t => {
    teamResources[t] = { iron:0, gold:0, diamond:0, emerald:0 };
    beds[t] = { alive:true };
  });
}
initGame();

// helper: minimal items for client
function clientItems() {
  return Object.values(ITEMS).map(it => ({ id:it.id, name:it.name, cost:it.cost, type:it.type, meta:{ baseDamage:it.baseDamage||0, armorValue:it.armorValue||0, heal:it.heal||0, projectile:it.projectile||false } }));
}

// assign team with fewest players
function assignTeam() {
  const counts = TEAMS.map(t => ({ t, c: Object.values(players).filter(p => p.team===t).length }));
  counts.sort((a,b)=>a.c-b.c);
  return counts[0].t;
}

io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('join', ({ name }) => {
    const team = assignTeam();
    const player = {
      id: socket.id,
      name: name || 'Player',
      team,
      pos: { ...SPAWN_POS[team] },
      rot: { x:0,y:0,z:0 },
      health: 20,
      alive: true,
      bedAlive: true,
      inventory: {}, // itemId -> count
      armorEquipped: null
    };
    players[socket.id] = player;
    socket.emit('joined', { id: socket.id, player, items: clientItems(), teamResources });
    io.emit('gameState', snapshot());
  });

  socket.on('input', data => {
    const p = players[socket.id];
    if (!p) return;
    p.pos = data.pos;
    p.rot = data.rot;
  });

  socket.on('placeBlock', ({ x,y,z }) => {
    const p = players[socket.id]; if (!p) return;
    worldBlocks.push({ x,y,z, owner: socket.id, team: p.team });
    io.emit('gameState', snapshot());
  });

  socket.on('buyItem', ({ itemId }) => {
    const p = players[socket.id]; if (!p) return;
    const item = ITEMS[itemId]; if (!item) { socket.emit('errorMsg','Invalid item'); return; }
    const cost = item.cost || {};
    const team = p.team;
    for (const cur in cost) {
      if ((teamResources[team][cur] || 0) < cost[cur]) { socket.emit('errorMsg', 'Not enough resources'); return; }
    }
    for (const cur in cost) teamResources[team][cur] -= cost[cur];
    p.inventory[itemId] = (p.inventory[itemId] || 0) + 1;
    // immediate consume consumable
    if (item.type==='consumable' && item.heal) {
      p.health = Math.min(20, p.health + item.heal);
      p.inventory[itemId] = Math.max(0, p.inventory[itemId]-1);
    }
    socket.emit('inventoryUpdate', p.inventory);
    io.emit('gameState', snapshot());
  });

  socket.on('equipArmor', ({ itemId }) => {
    const p = players[socket.id]; if (!p) return;
    if (!ITEMS[itemId] || ITEMS[itemId].type !== 'armor') { socket.emit('errorMsg','Invalid armor'); return; }
    if (!p.inventory[itemId] || p.inventory[itemId] <= 0) { socket.emit('errorMsg','You do not own this armor'); return; }
    p.armorEquipped = itemId;
    socket.emit('inventoryUpdate', p.inventory);
    io.emit('gameState', snapshot());
  });

  // shoot arrow
  socket.on('shoot', ({ dir, pos, bow }) => {
    const p = players[socket.id]; if (!p) return;
    const bowItem = ITEMS[bow];
    if (!bowItem || !bowItem.projectile) { socket.emit('errorMsg','No bow'); return; }
    if (!p.inventory[bow] || p.inventory[bow] <= 0) { socket.emit('errorMsg','You do not own this bow'); return; }
    const id = shortid.generate();
    const speed = 30;
    const vel = { x: dir.x*speed, y: dir.y*speed, z: dir.z*speed };
    projectiles[id] = { id, shooter: socket.id, team: p.team, pos:{ x:pos.x, y:pos.y, z:pos.z }, vel, damage: bowItem.baseDamage || 6, gravity:9.8*0.6, lifetime:4000 };
    io.emit('projectileSpawn', { id, pos: projectiles[id].pos, vel, shooter: socket.id });
  });

  socket.on('destroyBed', ({ team }) => {
    if (beds[team] && beds[team].alive) {
      beds[team].alive = false;
      Object.values(players).forEach(pl => { if (pl.team === team) pl.bedAlive = false; });
      io.emit('bedDestroyed', { team });
      io.emit('gameState', snapshot());
    }
  });

  socket.on('attack', ({ targetId, damage }) => {
    const attacker = players[socket.id];
    const target = players[targetId];
    if (!attacker || !target) return;
    let base = Number(damage) || 1;
    if (base <=0) base = 1;
    let armorVal = 0;
    if (target.armorEquipped && ITEMS[target.armorEquipped]) armorVal = ITEMS[target.armorEquipped].armorValue || 0;
    if (armorVal > 80) armorVal = 80;
    const effective = Math.max(0, Math.round(base * (1 - armorVal/100)));
    target.health -= effective;
    if (target.health <= 0) {
      target.alive = false;
      if (target.bedAlive) {
        setTimeout(()=>{ if (!players[target.id]) return; target.alive = true; target.health = 20; target.pos = {...SPAWN_POS[target.team]}; io.emit('gameState', snapshot()); }, 3000);
      } else {
        // eliminated (no respawn)
      }
    }
    io.emit('gameState', snapshot());
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('gameState', snapshot());
  });
});

// Spawner loops
setInterval(()=>{
  TEAMS.forEach(t => { teamResources[t].iron += SPAWN_AMOUNTS.iron; });
}, SPAWN_RATES.iron);

setInterval(()=>{ TEAMS.forEach(t => { teamResources[t].gold += SPAWN_AMOUNTS.gold; }); }, SPAWN_RATES.gold);
setInterval(()=>{ TEAMS.forEach(t => { teamResources[t].diamond += SPAWN_AMOUNTS.diamond; }); }, SPAWN_RATES.diamond);
setInterval(()=>{ TEAMS.forEach(t => { teamResources[t].emerald += SPAWN_AMOUNTS.emerald; }); }, SPAWN_RATES.emerald);

// Projectile loop (server authoritative)
setInterval(()=>{
  const dt = 1000/60;
  const remove = [];
  for (const id in projectiles) {
    const p = projectiles[id];
    p.pos.x += p.vel.x * (dt/1000);
    p.pos.y += p.vel.y * (dt/1000);
    p.pos.z += p.vel.z * (dt/1000);
    p.vel.y -= p.gravity * (dt/1000);
    p.lifetime -= dt;
    if (p.lifetime <= 0) { remove.push(id); continue; }
    // collision with players (simple distance)
    for (const sid in players) {
      const pl = players[sid];
      if (!pl.alive) continue;
      if (sid === p.shooter) continue;
      const dx = pl.pos.x - p.pos.x;
      const dy = (pl.pos.y+1.0) - p.pos.y;
      const dz = pl.pos.z - p.pos.z;
      const dist2 = dx*dx + dy*dy + dz*dz;
      if (dist2 <= 1.0) {
        let armorVal = 0;
        if (pl.armorEquipped && ITEMS[pl.armorEquipped]) armorVal = ITEMS[pl.armorEquipped].armorValue || 0;
        const eff = Math.max(0, Math.round(p.damage * (1 - armorVal/100)));
        pl.health -= eff;
        if (pl.health <= 0) {
          pl.alive = false;
          if (pl.bedAlive) {
            setTimeout(()=>{ if (!players[pl.id]) return; pl.alive = true; pl.health = 20; pl.pos = {...SPAWN_POS[pl.team]}; io.emit('gameState', snapshot()); }, 3000);
          }
        }
        remove.push(id);
        break;
      }
    }
  }
  for (const r of remove) { delete projectiles[r]; io.emit('projectileRemove', { id: r }); }
  io.emit('projectiles', Object.values(projectiles).map(p=>({ id:p.id, pos:p.pos, vel:p.vel, shooter:p.shooter })));
}, 1000/60);

// snapshot
function snapshot() {
  return {
    players: Object.values(players).map(p=>({ id:p.id, name:p.name, team:p.team, pos:p.pos, health:p.health, alive:p.alive, armorEquipped:p.armorEquipped })),
    beds,
    worldBlocks,
    teamResources,
    items: clientItems()
  };
}

server.listen(PORT, ()=> console.log('Server listening on', PORT));
