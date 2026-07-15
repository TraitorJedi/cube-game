import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  generateClassicApe,
  generateCyberApe,
  generateAstronautApe
} from "./generator.js";

// DOM Elements
const canvas = document.querySelector("#canvas3d");
const labTitle = document.querySelector("#labTitle");
const glow1 = document.querySelector("#glow1");
const statVoxelCount = document.querySelector("#statVoxelCount");

// Selectors
const cards = {
  classic: document.querySelector("#cardClassic"),
  cyber: document.querySelector("#cardCyber"),
  astronaut: document.querySelector("#cardAstronaut")
};
const toggleRotate = document.querySelector("#toggleRotate");
const toggleAnim = document.querySelector("#toggleAnim");
const toggleGrid = document.querySelector("#toggleGrid");
const selectStyle = document.querySelector("#selectStyle");

// Scene Settings
let currentModelName = "classic";
let currentStyle = "solid"; // solid, wireframe, flat
let apeGroup = new THREE.Group();
let gridHelper, boxHelper;

// Initialize Three.js Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c10);
scene.fog = new THREE.FogExp2(0x0b0c10, 0.08);

// Camera Setup
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(2, 1.8, 2.5);

// Renderer Setup
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go too far below floor
controls.minDistance = 1.0;
controls.maxDistance = 6.0;
controls.target.set(0, 0.5, 0);

// Add Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

// Hemisphere Light (sky reflection)
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080c10, 0.4);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

// Directional Sun Light (Shadow-casting)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 8, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 25;
dirLight.shadow.camera.left = -1.5;
dirLight.shadow.camera.right = 1.5;
dirLight.shadow.camera.top = 1.5;
dirLight.shadow.camera.bottom = -1.5;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Additional Point Light for accent colors
const accentPointLight = new THREE.PointLight(0xdfa076, 1.5, 5);
accentPointLight.position.set(0, 0.6, 0.8);
scene.add(accentPointLight);

// Ground plane
const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x121620,
  roughness: 0.9,
  metalness: 0.1
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grid Helper & Boundary Guides (1x1x1 limits)
function createGuides() {
  if (gridHelper) scene.remove(gridHelper);
  if (boxHelper) scene.remove(boxHelper);

  // Ground grid
  gridHelper = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
  gridHelper.position.y = 0.001; // slightly above floor
  scene.add(gridHelper);

  // 1x1x1 Chamber Boundary Box
  const boundaryGeo = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(boundaryGeo);
  boxHelper = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: getThemeAccentColor(),
      transparent: true,
      opacity: 0.4
    })
  );
  boxHelper.position.set(0, 0.5, 0); // Fits [y: 0 to 1], [x/z: -0.5 to 0.5]
  scene.add(boxHelper);

  gridHelper.visible = toggleGrid.checked;
  boxHelper.visible = toggleGrid.checked;
}

scene.add(apeGroup);

// Theme Helper: Get Color for UI & Guides based on model
function getThemeAccentColor() {
  if (currentModelName === "cyber") return 0x00e5ff;
  if (currentModelName === "astronaut") return 0xf1c40f;
  return 0xdfa076; // classic peach/brown
}

function updateThemeUI() {
  const root = document.documentElement;
  if (currentModelName === "classic") {
    root.style.setProperty("--active-accent", "var(--accent-classic)");
    root.style.setProperty("--active-accent-rgb", "223, 160, 118");
    root.style.setProperty("--glow-color", "rgba(223, 160, 118, 0.15)");
    labTitle.style.background = "linear-gradient(135deg, #ffffff 30%, var(--accent-classic) 100%)";
    labTitle.style.webkitBackgroundClip = "text";
    glow1.style.background = "radial-gradient(circle, rgba(223, 160, 118, 0.15) 0%, rgba(0,0,0,0) 70%)";
    accentPointLight.color.setHex(0xdfa076);
  } else if (currentModelName === "cyber") {
    root.style.setProperty("--active-accent", "var(--accent-cyber)");
    root.style.setProperty("--active-accent-rgb", "0, 229, 255");
    root.style.setProperty("--glow-color", "rgba(0, 229, 255, 0.15)");
    labTitle.style.background = "linear-gradient(135deg, #ffffff 30%, var(--accent-cyber) 100%)";
    labTitle.style.webkitBackgroundClip = "text";
    glow1.style.background = "radial-gradient(circle, rgba(0, 229, 255, 0.15) 0%, rgba(0,0,0,0) 70%)";
    accentPointLight.color.setHex(0x00e5ff);
  } else {
    root.style.setProperty("--active-accent", "var(--accent-astronaut)");
    root.style.setProperty("--active-accent-rgb", "241, 196, 15");
    root.style.setProperty("--glow-color", "rgba(241, 196, 15, 0.15)");
    labTitle.style.background = "linear-gradient(135deg, #ffffff 30%, var(--accent-astronaut) 100%)";
    labTitle.style.webkitBackgroundClip = "text";
    glow1.style.background = "radial-gradient(circle, rgba(241, 196, 15, 0.15) 0%, rgba(0,0,0,0) 70%)";
    accentPointLight.color.setHex(0xf1c40f);
  }

  // Update boundary box color
  if (boxHelper) {
    boxHelper.material.color.setHex(getThemeAccentColor());
  }
}

// Generate & Render Model
function renderApeModel() {
  // Clear existing meshes
  while (apeGroup.children.length > 0) {
    const child = apeGroup.children[0];
    apeGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach(m => m.dispose());
    } else if (child.material) {
      child.material.dispose();
    }
  }

  // Get voxels from generator
  let voxels = [];
  if (currentModelName === "cyber") {
    voxels = generateCyberApe();
  } else if (currentModelName === "astronaut") {
    voxels = generateAstronautApe();
  } else {
    voxels = generateClassicApe();
  }

  statVoxelCount.textContent = voxels.length.toLocaleString();

  // Voxel size: Fits 64x64x64 inside 1x1x1
  const voxelSize = 1 / 64;
  
  // Group voxels by rendering properties (matte, emissive, metallic)
  const grouped = {
    solid: [],
    emissive: [],
    visor: []
  };

  voxels.forEach(v => {
    const type = v.type || "solid";
    if (grouped[type]) {
      grouped[type].push(v);
    } else {
      grouped.solid.push(v);
    }
  });

  // Common Box geometry (slightly shrunken to create small voxel gap/bevel look)
  // Shrunked by ~4% to give beautiful definition lines to voxels
  const boxSize = voxelSize * 0.96;
  const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);

  // Style customization
  const isWireframe = currentStyle === "wireframe";
  const isFlat = currentStyle === "flat";

  // Materials
  const materials = {
    solid: new THREE.MeshStandardMaterial({
      roughness: isFlat ? 0.95 : 0.8,
      metalness: isFlat ? 0.0 : 0.1,
      wireframe: isWireframe,
      flatShading: isFlat
    }),
    emissive: new THREE.MeshStandardMaterial({
      roughness: 0.2,
      metalness: 0.1,
      emissiveIntensity: 2.5,
      wireframe: isWireframe,
      flatShading: isFlat
    }),
    visor: new THREE.MeshStandardMaterial({
      roughness: 0.15,
      metalness: 0.95, // Highly reflective gold/metallic
      wireframe: isWireframe,
      flatShading: isFlat
    })
  };

  // Build instanced meshes
  Object.keys(grouped).forEach(type => {
    const list = grouped[type];
    if (list.length === 0) return;

    const instMesh = new THREE.InstancedMesh(geometry, materials[type], list.length);
    instMesh.castShadow = !isWireframe;
    instMesh.receiveShadow = !isWireframe;

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    list.forEach((v, index) => {
      // Calculate coordinates scaled to 1x1x1 space
      // x: 0 to 63 -> -0.5 to 0.5
      // y: 0 to 63 -> 0 to 1
      // z: 0 to 63 -> -0.5 to 0.5
      const tx = (v.x - 31.5) / 64;
      const ty = (v.y + 0.5) / 64;
      const tz = (v.z - 31.5) / 64;

      dummy.position.set(tx, ty, tz);
      dummy.updateMatrix();
      instMesh.setMatrixAt(index, dummy.matrix);

      // Apply instance color
      tempColor.setHex(v.color);
      instMesh.setColorAt(index, tempColor);
      
      // Set emissive color for emissive voxels
      if (type === "emissive" || type === "visor") {
        // Unfortunately standard InstancedMesh material shares emissive color.
        // For individual emissive colors in instanced rendering, we either use custom shaders,
        // or since they are similar colors we can set it.
        // As a brilliant fallback, we can use the instance color as emissive color in our render loop or shader,
        // but Three.js standard material supports map/color multiply if we hack it,
        // or we can make a custom shader.
        // Actually, in Three.js, standard material doesn't use InstancedMesh color for emissive directly.
        // To make a glowing mesh with correct emissive color, we can assign the instance color to emissive
        // by making a simple shader modification OR using a vertex color hack.
        // Let's use a custom vertex shader modification for emissive mesh to copy vertex color to emissive!
      }
    });

    // Custom shader modification to map instance colors to emissive
    if (type === "emissive") {
      materials.emissive.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          `#include <common>
           varying vec3 vInstanceColor;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <color_vertex>",
          `#include <color_vertex>
           #ifdef USE_INSTANCING_COLOR
             vInstanceColor = instanceColor;
           #else
             vInstanceColor = vec3(1.0);
           #endif`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>
           varying vec3 vInstanceColor;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "vec3 totalEmissiveRadiance = emissive;",
          "vec3 totalEmissiveRadiance = vInstanceColor * 2.5;"
        );
      };
    }

    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    
    apeGroup.add(instMesh);
  });
}

// Select Model Card click handlers
Object.keys(cards).forEach(key => {
  cards[key].addEventListener("click", () => {
    if (currentModelName === key) return;

    // Toggle active classes
    Object.values(cards).forEach(c => c.classList.remove("active"));
    cards[key].classList.add("active");

    currentModelName = key;
    updateThemeUI();
    renderApeModel();
  });
});

// Controls Action Handlers
toggleRotate.addEventListener("change", () => {
  controls.autoRotate = toggleRotate.checked;
});
controls.autoRotate = toggleRotate.checked;
controls.autoRotateSpeed = 2.0;

toggleGrid.addEventListener("change", () => {
  if (gridHelper) gridHelper.visible = toggleGrid.checked;
  if (boxHelper) boxHelper.visible = toggleGrid.checked;
});

selectStyle.addEventListener("change", (e) => {
  currentStyle = e.target.value;
  renderApeModel();
});

// Resize handler
function onWindowResize() {
  const width = canvas.parentElement.clientWidth;
  const height = canvas.parentElement.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onWindowResize);
// Call once initially to size properly
onWindowResize();

// Render Loop
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Idle Animation: soft breathing float
  if (toggleAnim.checked) {
    apeGroup.position.y = Math.sin(elapsedTime * 2.0) * 0.04;
    // slight breathing yaw/pitch rotation
    apeGroup.rotation.y = Math.sin(elapsedTime * 0.8) * 0.03;
    apeGroup.rotation.z = Math.cos(elapsedTime * 1.2) * 0.015;
  } else {
    apeGroup.position.y = 0;
    apeGroup.rotation.set(0, 0, 0);
  }

  // Slowly rotate the point light for dynamic reflections
  accentPointLight.position.x = Math.sin(elapsedTime * 1.5) * 1.2;
  accentPointLight.position.z = Math.cos(elapsedTime * 1.5) * 1.2;

  controls.update();
  renderer.render(scene, camera);
}

// Initial Run
updateThemeUI();
createGuides();
renderApeModel();
animate();
