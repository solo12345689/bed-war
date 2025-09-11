import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/PointerLockControls.js';

const socket = io();

let playerId = null;
let player = null;
let state = null;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const controls = new PointerLockControls(camera, renderer.domElement);

let playerMeshes = {};
let blockGroup = new THREE.Group(); scene.add(blockGroup);
let bedGroup = new THREE.Group(); scene.add(bedGroup);
let projectileMeshes = {};

// basic world
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50,100,50); scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const floorGeo = new THREE.PlaneGeometry(200,200); const floorMat = new THREE.MeshStandardMaterial({color:0x2b7a3a}); const floor = new THREE.Mesh(floorGeo, floorMat); floor.rotation.x = -Math.PI/2; scene.add(floor);
const islands = [{x:-20,y:1,z:0},{x:20,y:1,z:0},{x:0,y:1,z:-20},{x:0,y:1,z:20}];
islands.forEach(pos=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(10,1,10), new THREE.MeshStandardMaterial({color:0x7a5a2b})); m.position.set(pos.x,pos.y,pos.z); scene.add(m); });

// HUD handlers
document.getElementById('joinBtn').onclick = ()=> {
  const name = document.getElementById('nameInput').value || 'Player';
  socket.emit('join', { name });
};
document.getElementById('shopBtn').onclick = ()=> toggleChest();
document.getElementById('closeChest').onclick = ()=> hideChest();
document.getElementById('restartBtn').onclick = ()=> {
  const secret = prompt('Restart secret (admin):');
  socket.emit('requestRestart', { secret });
};

socket.on('joined', ({ id, player: pl, items, teamResources }) => {
  playerId = id; player = pl;
  document.getElementById('teamInfo').innerText = 'Team: ' + player.team;
  document.getElementById('healthInfo').innerText = 'Health: ' + player.health;
});

socket.on('gameState', snap => {
  state = snap;
  renderState(snap);
});

socket.on('inventoryUpdate', inv => { /* could update UI */ });
socket.on('projectileSpawn', data => spawnProjectileVisual(data));
socket.on('projectiles', list => updateProjectiles(list));
socket.on('projectileRemove', d => removeProjectileVisual(d.id));
socket.on('bedDestroyed', ({ team }) => alert(team + ' bed destroyed!'));

// send simple input periodically
setInterval(()=> {
  if (!playerId) return;
  const pos = camera.position;
  const rot = camera.rotation;
  socket.emit('input', { pos:{x:pos.x,y:pos.y,z:pos.z}, rot:{x:rot.x,y:rot.y,z:rot.z} });
}, 50);

// render loop
function animate() {
  requestAnimationFrame(animate);
  // lerp projectile visuals
  for (const id in projectileMeshes) {
    const info = projectileMeshes[id];
    if (info.targetPos) info.mesh.position.lerp(new THREE.Vector3(info.targetPos.x, info.targetPos.y, info.targetPos.z), 0.6);
  }
  renderer.render(scene, camera);
}
animate();

function renderState(snap) {
  // players
  snap.players.forEach(pl => {
    if (pl.id === playerId) { if (player) player.health = pl.health; return; }
    if (!playerMeshes[pl.id]) {
      const geom = new THREE.BoxGeometry(0.8,1.8,0.6);
      const mat = new THREE.MeshStandardMaterial({ color: pl.team === 'red'?0xff5555:(pl.team==='blue'?0x5555ff:(pl.team==='green'?0x55ff55:0xffff66)) });
      const mesh = new THREE.Mesh(geom, mat); scene.add(mesh); playerMeshes[pl.id]=mesh;
    }
    playerMeshes[pl.id].position.set(pl.pos.x, pl.pos.y+0.9, pl.pos.z);
  });
  // cleanup
  Object.keys(playerMeshes).forEach(id => { if (!snap.players.find(p=>p.id===id)) { scene.remove(playerMeshes[id]); delete playerMeshes[id]; }});
  // blocks
  while(blockGroup.children.length) blockGroup.remove(blockGroup.children[0]);
  (snap.worldBlocks||[]).forEach(b => { const g=new THREE.BoxGeometry(1,1,1); const m=new THREE.MeshStandardMaterial({color:0x8b5a2b}); const mesh=new THREE.Mesh(g,m); mesh.position.set(b.x+0.5,b.y+0.5,b.z+0.5); blockGroup.add(mesh); });
  // beds
  while(bedGroup.children.length) bedGroup.remove(bedGroup.children[0]);
  const bedPositions = { red:[-20,2,0], blue:[20,2,0], green:[0,2,-20], yellow:[0,2,20] };
  Object.keys(snap.beds||{}).forEach(team => { const alive = snap.beds[team].alive; const col = team==='red'?0xff0000:(team==='blue'?0x0000ff:(team==='green'?0x00ff00:0xffff00)); const geom=new THREE.BoxGeometry(2.4,0.6,1.6); const mat=new THREE.MeshStandardMaterial({color: alive?col:0x222222}); const mesh=new THREE.Mesh(geom,mat); const pos=bedPositions[team]; mesh.position.set(pos[0],pos[1],pos[2]); bedGroup.add(mesh); });
  // resources display
  const team = player ? player.team : (playerId ? (snap.players.find(p=>p.id===playerId)?.team) : null);
  if (team && snap.teamResources && snap.teamResources[team]) {
    const r = snap.teamResources[team];
    document.getElementById('resInfo').innerText = `Iron:${r.iron} Gold:${r.gold} Diamond:${r.diamond} Emerald:${r.emerald||0}`;
  }
  if (player) document.getElementById('healthInfo').innerText = 'Health: ' + player.health;
}

function toggleChest(){ document.getElementById('inventory').classList.toggle('hidden'); }
function hideChest(){ document.getElementById('inventory').classList.add('hidden'); }

// projectile visuals
function spawnProjectileVisual(data) {
  if (projectileMeshes[data.id]) return;
  const geom = new THREE.SphereGeometry(0.08,6,6);
  const mat = new THREE.MeshStandardMaterial({ color:0x333333 });
  const mesh = new THREE.Mesh(geom,mat); mesh.position.set(data.pos.x,data.pos.y,data.pos.z); scene.add(mesh);
  projectileMeshes[data.id] = { mesh, targetPos: data.pos };
}
function updateProjectiles(list) {
  const present = new Set();
  list.forEach(p => { present.add(p.id); if (!projectileMeshes[p.id]) spawnProjectileVisual(p); projectileMeshes[p.id].targetPos = p.pos; });
  Object.keys(projectileMeshes).forEach(id => { if (!present.has(id)) removeProjectileVisual(id); });
}
function removeProjectileVisual(id) { const obj = projectileMeshes[id]; if (!obj) return; scene.remove(obj.mesh); delete projectileMeshes[id]; }
