// Renders the 1024x1024 app icon from the game's own models. Used to make resources/icon.png for the iOS app:
//   npm run dev, then screenshot http://localhost:5190/src/models/icon.html at 1024x1024 (see README).
import * as THREE from 'three';
import * as P from './props.js';
import * as C from './cars.js';
import * as H from './characters.js';

const SIZE = 1024;
const canvas = document.getElementById('icon');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8cb);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.3);
sun.position.set(-5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x9fd8cb }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);

const lift = P.createLift();
scene.add(lift.group);
lift.setHeight(0.55);
const car = C.createCar({ type: 'sedan', color: C.CAR_COLORS[1] });
lift.platform.add(car.group);
car.group.rotation.y = 0;

const hero = H.createCharacter(H.playerLook());
hero.group.position.set(-0.2, 0, 2.55);
hero.group.rotation.y = 2.6;
hero.setWorking(true);
scene.add(hero.group);

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 100);
const q = new URLSearchParams(location.search);
const [cx, cy, cz] = (q.get('cam') || '6.4,5.0,7.6').split(',').map(Number);
const [tx, ty, tz] = (q.get('at') || '0.15,0.95,0.6').split(',').map(Number);
camera.position.set(cx, cy, cz);
camera.lookAt(tx, ty, tz);

// let idle/work animations settle into a nice pose, then render once
const t = Number(q.get('t') || 0.35);
for (let i = 0, n = Math.round(t * 60); i < n; i++) { lift.update?.(1 / 60); car.update?.(1 / 60, 0); hero.update?.(1 / 60, 0); }
renderer.render(scene, camera);
document.title = 'icon ready';
