import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

let scene, camera, renderer, controls;
let beds = {};
let players = {};
let currentPlayer = { team: null, respawn: true };

// Teams
const TEAMS = ["red", "blue", "green", "yellow"];
let teamIndex = 0;

// Block + bed size
const BLOCK_SIZE = 1;
const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

const bedGeometry = new THREE.BoxGeometry(2, 0.5, 1);

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new PointerLockControls(camera, document.body);
    document.body.addEventListener('click', () => controls.lock());

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Assign player to a team
    currentPlayer.team = TEAMS[teamIndex % TEAMS.length];
    teamIndex++;

    // Add beds for all teams
    addBed("red", -20, 0.25, 0, 0xff0000);
    addBed("blue", 20, 0.25, 0, 0x0000ff);
    addBed("green", 0, 0.25, -20, 0x00ff00);
    addBed("yellow", 0, 0.25, 20, 0xffff00);

    // Listen for block actions
    window.addEventListener('mousedown', onMouseDown);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Add a bed
function addBed(team, x, y, z, color) {
    const bed = new THREE.Mesh(bedGeometry, new THREE.MeshStandardMaterial({ color }));
    bed.position.set(x, y, z);
    bed.team = team;
    scene.add(bed);
    beds[team] = bed;
}

// Respawn player
function respawnPlayer() {
    const bed = beds[currentPlayer.team];
    if (bed) {
        camera.position.set(bed.position.x, 2, bed.position.z + 5);
        currentPlayer.respawn = true;
        console.log(`Respawned at ${currentPlayer.team} bed`);
    } else {
        currentPlayer.respawn = false;
        alert("Game Over! Your bed is destroyed.");
    }
}

// Handle mouse clicks
function onMouseDown() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        const obj = intersects[0].object;

        // Destroy bed
        if (obj.geometry === bedGeometry) {
            console.log(`${obj.team} bed destroyed!`);
            scene.remove(obj);
            delete beds[obj.team];
            if (obj.team === currentPlayer.team) {
                currentPlayer.respawn = false;
                alert("Your bed is destroyed! No more respawns!");
            }
            return;
        }

        // Destroy block
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
