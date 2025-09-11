import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

let scene, camera, renderer, controls;
let beds = {};
let players = [];
let teamSpawns = {};
let teamColors = {
    red: 0xff0000,
    blue: 0x0000ff,
    green: 0x00ff00,
    yellow: 0xffff00
};
let teamList = Object.keys(teamColors);

// Block setup
const BLOCK_SIZE = 1;
const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

// Bed setup
const bedGeometry = new THREE.BoxGeometry(2, 0.5, 1);

// Player object
class Player {
    constructor(id) {
        this.id = id;
        this.team = assignTeam();
        this.respawnEnabled = true;
        this.spawnAtBed();
    }

    spawnAtBed() {
        const bed = beds[this.team];
        if (!bed) {
            console.log(`Player ${this.id} eliminated (bed destroyed).`);
            this.respawnEnabled = false;
            return;
        }
        const spawn = teamSpawns[this.team];
        camera.position.set(spawn.x, spawn.y + 2, spawn.z);
        controls.getObject().position.set(spawn.x, spawn.y + 2, spawn.z);
    }
}

// Auto-assign teams evenly
function assignTeam() {
    let teamCounts = {};
    teamList.forEach(t => teamCounts[t] = 0);
    players.forEach(p => teamCounts[p.team]++);
    return teamList.reduce((a, b) => teamCounts[a] <= teamCounts[b] ? a : b);
}

// Init game
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new PointerLockControls(camera, document.body);
    document.body.addEventListener('click', () => controls.lock());
    scene.add(controls.getObject());

    // Lights
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    scene.add(light);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Add beds for 4 teams
    addBed("red", -20, 0.25, 0);
    addBed("blue", 20, 0.25, 0);
    addBed("green", 0, 0.25, -20);
    addBed("yellow", 0, 0.25, 20);

    // Add first player (you)
    let player = new Player("You");
    players.push(player);

    // Mouse controls
    window.addEventListener('mousedown', onMouseDown);

    // Respawn test (press R to simulate death)
    window.addEventListener('keydown', (e) => {
        if (e.key === "r") {
            console.log("Player died. Checking respawn...");
            player.spawnAtBed();
        }
    });
}

// Add bed
function addBed(team, x, y, z) {
    const bed = new THREE.Mesh(bedGeometry, new THREE.MeshStandardMaterial({ color: teamColors[team] }));
    bed.position.set(x, y, z);
    bed.team = team;
    scene.add(bed);
    beds[team] = bed;
    teamSpawns[team] = { x, y: 2, z };
}

// Block placing + breaking
function onMouseDown(event) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        const obj = intersects[0].object;

        // Break bed
        if (obj.geometry === bedGeometry) {
            console.log(`${obj.team} bed destroyed!`);
            scene.remove(obj);
            delete beds[obj.team];
            return;
        }

        // Break block
        if (obj.geometry === blockGeometry) {
            scene.remove(obj);
            return;
        }

        // Place block
        const hit = intersects[0];
        const normal = hit.face.normal.clone();
        const pos = hit.point.clone().add(normal.multiplyScalar(BLOCK_SIZE / 2));
        pos.x = Math.round(pos.x);
        pos.y = Math.round(pos.y);
        pos.z = Math.round(pos.z);

        const block = new THREE.Mesh(blockGeometry, blockMaterial.clone());
        block.position.copy(pos);
        scene.add(block);
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}


