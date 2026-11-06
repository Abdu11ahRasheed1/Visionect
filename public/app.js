// Visionect Interactive 3D Architectural Web Studio
// Final Product: Direct Topological Grid -> 3D Extrusion, Live 2D Named Map, WASD Walkthrough & Interactive Doors

let scene, camera, renderer, controls;
let currentSceneData = null;
let floor1SceneData = null;
let floor2SceneData = null;
let activeFloorFilter = "both"; // "both", "1", "2"
let currentBpFloor = 1;         // 1 or 2 for 2D blueprint display
let roofMode = "solid";         // "solid", "glass", "off"
let roofGroup = null;
let staircaseGroup = null;
let intermediateFloorSlab = null;
let wallMaterial;
let currentFloorType = "wood";
let show3DLabels = true;

const wallMeshes = [];
const furnitureMeshes = [];
const floorMeshes = [];
const doorObjects = [];     // Interactive door assemblies for raycasting & animation
const doorInteractables = []; // Meshes that raycaster checks for door clicks
const labelSprites = [];
const railingMeshes = [];
const floor1Meshes = [];
const floor2Meshes = [];

// Raycaster & Mouse for interactive doors and furniture dragging
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredDoorObj = null;

// Furniture Drag & Drop State
let isFurnitureMode = false;
let draggedFurniture = null;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragOffset = new THREE.Vector3();
let dragIntersection = new THREE.Vector3();
const furnitureDraggables = []; // Meshes to detect for dragging

// Walkthrough State (WASD + First-Person Look)
let isWalkthroughMode = false;
let walkYaw = 0;      // Horizontal look angle (radians)
let walkPitch = 0;    // Vertical look angle (radians)
let isMouseLooking = false;
let prevMouseX = 0;
let prevMouseY = 0;
const moveKeys = { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false };

// Smooth Camera Transition State (when clicking a door or room)
let activeCamTransition = null;

// Cached Procedural Floor Textures
const floorTextures = {};

// Initialize 3D Scene
function init3D() {
    const container = document.getElementById("canvas-container");
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || (window.innerHeight - 64);

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(50, (width || 1) / (height || 1), 0.1, 1000);
    camera.position.set(0, 18, 22);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width || 800, height || 600);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls (Active in 3D Perspective & Top 2D modes)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.85);
    sunLight.position.set(22, 42, 26);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 26;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xff7440, 0.22);
    fillLight.position.set(-20, 18, -20);
    scene.add(fillLight);

    // Default Wall Material
    wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.38,
        metalness: 0.04
    });

    window.addEventListener("resize", onWindowResize);
    setupViewportInteractions(renderer.domElement);
    animate();
}

function onWindowResize() {
    const container = document.getElementById("canvas-container");
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || (window.innerHeight - 64);
    if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}

// Procedural Floor Texture Generator (Oak, Walnut Parquet, Ceramic Tile, Polished Concrete, Marble)
function getProceduralFloorTexture(type) {
    if (floorTextures[type]) return floorTextures[type];

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    if (type === "wood") {
        // Hardwood Oak Planks
        ctx.fillStyle = "#b47b48";
        ctx.fillRect(0, 0, 512, 512);
        const plankH = 64;
        for (let y = 0; y < 512; y += plankH) {
            const offset = ((y / plankH) % 2) * 128;
            for (let x = -128; x < 512; x += 256) {
                ctx.fillStyle = ((x + y) % 128 === 0) ? "#bc8452" : "#a9703f";
                ctx.fillRect(x + offset, y, 254, plankH - 2);
                // Wood grain streaks
                ctx.strokeStyle = "rgba(80, 45, 15, 0.16)";
                ctx.lineWidth = 2;
                for (let g = 8; g < plankH - 6; g += 12) {
                    ctx.beginPath();
                    ctx.moveTo(x + offset + 6, y + g);
                    ctx.lineTo(x + offset + 248, y + g + ((g % 24 === 0) ? 3 : -2));
                    ctx.stroke();
                }
            }
            ctx.strokeStyle = "#5c3a1d";
            ctx.lineWidth = 2;
            ctx.strokeRect(0, y, 512, plankH);
        }
    } else if (type === "darkwood") {
        // Walnut Parquet
        ctx.fillStyle = "#4a2e1b";
        ctx.fillRect(0, 0, 512, 512);
        const step = 64;
        for (let y = 0; y < 512; y += step) {
            for (let x = 0; x < 512; x += step) {
                const even = ((x / step + y / step) % 2 === 0);
                ctx.fillStyle = even ? "#583722" : "#3f2616";
                ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
                ctx.strokeStyle = "rgba(255,255,255,0.05)";
                ctx.lineWidth = 1;
                if (even) {
                    for (let i = 8; i < step; i += 12) {
                        ctx.beginPath(); ctx.moveTo(x + i, y + 2); ctx.lineTo(x + i, y + step - 2); ctx.stroke();
                    }
                } else {
                    for (let i = 8; i < step; i += 12) {
                        ctx.beginPath(); ctx.moveTo(x + 2, y + i); ctx.lineTo(x + step - 2, y + i); ctx.stroke();
                    }
                }
            }
        }
    } else if (type === "tile") {
        // Ceramic Tile with Grout
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(0, 0, 512, 512);
        const tileS = 128;
        for (let y = 0; y < 512; y += tileS) {
            for (let x = 0; x < 512; x += tileS) {
                ctx.fillStyle = ((x / tileS + y / tileS) % 2 === 0) ? "#e2e8f0" : "#cbd5e1";
                ctx.fillRect(x + 3, y + 3, tileS - 6, tileS - 6);
            }
        }
    } else if (type === "concrete") {
        // Polished Industrial Concrete
        ctx.fillStyle = "#475569";
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 1800; i++) {
            const rx = Math.random() * 512;
            const ry = Math.random() * 512;
            ctx.fillStyle = (i % 2 === 0) ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.08)";
            ctx.fillRect(rx, ry, 4, 4);
        }
        ctx.strokeStyle = "rgba(30, 41, 59, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 256, 256);
        ctx.strokeRect(256, 0, 256, 256);
        ctx.strokeRect(0, 256, 256, 256);
        ctx.strokeRect(256, 256, 256, 256);
    } else if (type === "marble") {
        // Carrara White Marble
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.38)";
        ctx.lineWidth = 3;
        for (let v = 0; v < 14; v++) {
            ctx.beginPath();
            let sx = Math.random() * 512;
            let sy = 0;
            ctx.moveTo(sx, sy);
            for (let step = 1; step <= 8; step++) {
                sx += (Math.random() - 0.4) * 70;
                sy = step * 64;
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    floorTextures[type] = tex;
    return tex;
}

function applyFloorTextureToAllRooms(type) {
    currentFloorType = type;
    const baseTex = getProceduralFloorTexture(type);
    const outdoorTex = getProceduralFloorTexture("tile");
    const roughnessMap = { wood: 0.45, darkwood: 0.4, tile: 0.2, concrete: 0.65, marble: 0.15 };

    floorMeshes.forEach(mesh => {
        const rmSize = mesh.userData.roomSize || [6, 6];
        const isOut = Boolean(mesh.userData.isOutdoor);
        const clonedTex = (isOut ? outdoorTex : baseTex).clone();
        clonedTex.needsUpdate = true;
        clonedTex.repeat.set(Math.max(1, rmSize[0] / 2.5), Math.max(1, rmSize[1] / 2.5));
        mesh.material.map = clonedTex;
        mesh.material.color.setHex(isOut ? 0x94a3b8 : 0xffffff);
        mesh.material.roughness = isOut ? 0.55 : (roughnessMap[type] || 0.5);
        mesh.material.needsUpdate = true;
    });
}

// Create 3D Floating Label Sprite for Room Name & Area
function createRoomLabelSprite(rm, baseY = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext("2d");

    // Pill background (Carbon Black + Flame Orange Rim)
    ctx.fillStyle = "rgba(18, 18, 22, 0.90)";
    ctx.strokeStyle = "rgba(255, 90, 31, 0.85)";
    ctx.lineWidth = 4;
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(20 + r, 15);
    ctx.lineTo(492 - r, 15);
    ctx.quadraticCurveTo(492, 15, 492, 15 + r);
    ctx.lineTo(492, 125 - r);
    ctx.quadraticCurveTo(492, 125, 492 - r, 125);
    ctx.lineTo(20 + r, 125);
    ctx.quadraticCurveTo(20, 125, 20, 125 - r);
    ctx.lineTo(20, 15 + r);
    ctx.quadraticCurveTo(20, 15, 20 + r, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Room Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(rm.name, 256, 65);

    // Dimensions & Area
    ctx.fillStyle = "#ff7440";
    ctx.font = "600 24px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`${rm.size[0]}m × ${rm.size[1]}m  •  ${rm.area_sqm} m²`, 256, 104);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(rm.center[0], (baseY || 0) + 3.25, rm.center[2]);
    sprite.scale.set(3.4, 0.93, 1);
    sprite.visible = show3DLabels;
    sprite.userData.type = "label";
    return sprite;
}

// Clear Existing 3D Objects
function clearScene() {
    wallMeshes.forEach(m => scene.remove(m));
    wallMeshes.length = 0;

    railingMeshes.forEach(m => scene.remove(m));
    railingMeshes.length = 0;

    furnitureMeshes.forEach(m => scene.remove(m));
    furnitureMeshes.length = 0;
    furnitureDraggables.length = 0;

    floorMeshes.forEach(m => scene.remove(m));
    floorMeshes.length = 0;

    doorObjects.forEach(d => scene.remove(d.group));
    doorObjects.length = 0;
    doorInteractables.length = 0;

    labelSprites.forEach(s => scene.remove(s));
    labelSprites.length = 0;

    floor1Meshes.length = 0;
    floor2Meshes.length = 0;

    if (roofGroup) {
        scene.remove(roofGroup);
        roofGroup = null;
    }
    if (staircaseGroup) {
        scene.remove(staircaseGroup);
        staircaseGroup = null;
    }
    if (intermediateFloorSlab) {
        scene.remove(intermediateFloorSlab);
        intermediateFloorSlab = null;
    }

    const toRemove = [];
    scene.traverse(obj => {
        if (obj.userData && (obj.userData.type === "door" || obj.userData.type === "window" || obj.userData.type === "grid" || obj.userData.type === "label" || obj.userData.type === "roof" || obj.userData.type === "stairs" || obj.userData.type === "slab" || obj.userData.type === "railing")) {
            toRemove.push(obj);
        }
    });
    toRemove.forEach(obj => scene.remove(obj));
}

// Build 3D Asset from API Scene Data (Redirects to Combined Multi-Floor Compiler)
function build3DScene(data) {
    floor1SceneData = data;
    buildCombinedMultiFloorScene();
}

// Architectural Balcony Railing Builder (Metal top handrail, base shoe, posts & safety glass balustrade)
function buildRailingAssembly(w, floorIndex = 0) {
    const dx = w.end[0] - w.start[0];
    const dz = w.end[2] - w.start[2];
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.05) return null;

    const baseY = w.base_y !== undefined ? w.base_y : (floorIndex * 2.8);
    const railingH = w.height || 1.05;

    const group = new THREE.Group();
    group.position.set((w.start[0] + w.end[0]) / 2, baseY, (w.start[2] + w.end[2]) / 2);
    const angle = Math.atan2(dz, dx);
    group.rotation.y = -angle;
    group.userData.type = "railing";
    group.userData.floor = floorIndex;

    // 1. Metal Top Handrail (Brushed steel / charcoal aluminum)
    const handrailMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.82,
        roughness: 0.25
    });
    const handrailGeo = new THREE.BoxGeometry(length, 0.05, 0.08);
    const handrail = new THREE.Mesh(handrailGeo, handrailMat);
    handrail.position.set(0, railingH - 0.025, 0);
    handrail.castShadow = true;
    group.add(handrail);

    // 2. Base Shoe / Bottom Mounting Channel
    const baseShoeGeo = new THREE.BoxGeometry(length, 0.06, 0.08);
    const baseShoe = new THREE.Mesh(baseShoeGeo, handrailMat);
    baseShoe.position.set(0, 0.03, 0);
    group.add(baseShoe);

    // 3. Vertical Stainless Steel Support Posts
    const postCount = Math.max(2, Math.ceil(length / 1.5) + 1);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
    for (let i = 0; i < postCount; i++) {
        const postX = -length / 2 + (i / (postCount - 1)) * length;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, railingH, 0.04), postMat);
        post.position.set(postX, railingH / 2, 0);
        post.castShadow = true;
        group.add(post);
    }

    // 4. Architectural Safety Glass Balustrade Panels
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.35,
        transmission: 0.85,
        roughness: 0.05,
        metalness: 0.1,
        ior: 1.5,
        depthWrite: false
    });
    const panelGeo = new THREE.BoxGeometry(Math.max(length - 0.08, 0.1), railingH - 0.12, 0.02);
    const panel = new THREE.Mesh(panelGeo, glassMat);
    panel.position.set(0, railingH / 2, 0);
    group.add(panel);

    scene.add(group);
    railingMeshes.push(group);
    if (floorIndex === 1) floor2Meshes.push(group);
    else floor1Meshes.push(group);

    return group;
}

// 3D Architectural Staircase Connecting Lower to Upper Floor
function buildStaircaseAssembly(stairsData) {
    if (!stairsData) return null;
    const start = stairsData.start || [-1.0, 0.0, -1.0];
    const end = stairsData.end || [-1.0, 2.8, 2.2];
    const numSteps = stairsData.num_steps || 14;
    const stairW = stairsData.width || 1.1;

    const group = new THREE.Group();
    group.userData.type = "stairs";

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const totalDist = Math.hypot(dx, dz) || 0.01;
    const angle = Math.atan2(dx, dz);

    const stepRise = dy / numSteps;
    const stepRun = totalDist / numSteps;

    const treadMat = new THREE.MeshStandardMaterial({
        color: 0xb47b48, // Warm Oak wood
        roughness: 0.35,
        metalness: 0.05
    });
    const riserMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.5
    });
    const stringerMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b, // Dark charcoal steel
        roughness: 0.4,
        metalness: 0.7
    });

    for (let i = 0; i < numSteps; i++) {
        const t = (i + 0.5) / numSteps;
        const curX = start[0] + dx * t;
        const curY = start[1] + stepRise * (i + 1);
        const curZ = start[2] + dz * t;

        // Tread
        const treadGeo = new THREE.BoxGeometry(stairW, 0.04, stepRun + 0.04);
        const tread = new THREE.Mesh(treadGeo, treadMat);
        tread.position.set(curX, curY, curZ);
        tread.rotation.y = angle;
        tread.castShadow = true;
        tread.receiveShadow = true;
        group.add(tread);

        // Riser
        const riserGeo = new THREE.BoxGeometry(stairW, stepRise, 0.03);
        const riser = new THREE.Mesh(riserGeo, riserMat);
        riser.position.set(curX, curY - stepRise / 2, curZ - (dz / totalDist) * (stepRun / 2));
        riser.rotation.y = angle;
        riser.castShadow = true;
        group.add(riser);
    }

    // Side Stringers (Left and Right structural beams)
    const stringerLength = Math.hypot(totalDist, dy);
    const stringerGeo = new THREE.BoxGeometry(0.06, 0.22, stringerLength);
    const pitchAngle = Math.atan2(dy, totalDist);

    [-stairW / 2, stairW / 2].forEach(offsetSide => {
        const stringer = new THREE.Mesh(stringerGeo, stringerMat);
        const midX = (start[0] + end[0]) / 2 + Math.cos(angle) * offsetSide;
        const midY = (start[1] + end[1]) / 2;
        const midZ = (start[2] + end[2]) / 2 - Math.sin(angle) * offsetSide;
        stringer.position.set(midX, midY, midZ);
        stringer.rotation.y = angle;
        stringer.rotation.x = -pitchAngle;
        stringer.castShadow = true;
        group.add(stringer);
    });

    // Angled Handrail
    const handrailGeo = new THREE.CylinderGeometry(0.028, 0.028, stringerLength, 12);
    const handrail = new THREE.Mesh(handrailGeo, stringerMat);
    const railX = (start[0] + end[0]) / 2 + Math.cos(angle) * (stairW / 2 + 0.05);
    const railY = (start[1] + end[1]) / 2 + 0.9;
    const railZ = (start[2] + end[2]) / 2 - Math.sin(angle) * (stairW / 2 + 0.05);
    handrail.position.set(railX, railY, railZ);
    handrail.rotation.y = angle;
    handrail.rotation.x = -pitchAngle + Math.PI / 2;
    group.add(handrail);

    scene.add(group);
    staircaseGroup = group;
    return group;
}

// Helper to normalize stair cutout bounds from backend or fallback
function resolveStairCutout(stairsData) {
    if (stairsData && stairsData.cutout) {
        const c = stairsData.cutout;
        if (c.min_x !== undefined && c.max_x !== undefined && c.min_z !== undefined && c.max_z !== undefined) {
            return c;
        }
        if (c.center && c.size) {
            return {
                min_x: c.center[0] - c.size[0] / 2,
                max_x: c.center[0] + c.size[0] / 2,
                min_z: c.center[2] - c.size[1] / 2,
                max_z: c.center[2] + c.size[1] / 2
            };
        }
    }
    return { min_x: -7.75, max_x: -6.45, min_z: -5.6, max_z: -2.2 };
}

// Intermediate Floor Slab at y = 2.8m with Stair Cutout and Floor 2 Guardrails
function buildIntermediateFloorSlab(floor2Data, stairsData) {
    if (!floor2Data) return null;
    const bounds = (floor2Data.metadata && floor2Data.metadata.bounding_box) ? floor2Data.metadata.bounding_box : [-8, 8, -6.5, 6.5];
    const minX = bounds[0];
    const maxX = bounds[1];
    const minZ = bounds[2];
    const maxZ = bounds[3];

    const group = new THREE.Group();
    group.userData.type = "slab";

    const slabMat = new THREE.MeshStandardMaterial({
        color: 0x334155, // Architectural concrete structural slab
        roughness: 0.6,
        metalness: 0.1
    });

    const stairCutout = resolveStairCutout(stairsData);

    const slabThickness = 0.18;
    const slabY = 2.8 - slabThickness / 2;

    const pieces = [
        { minX: minX, maxX: stairCutout.min_x, minZ: minZ, maxZ: maxZ },
        { minX: stairCutout.max_x, maxX: maxX, minZ: minZ, maxZ: maxZ },
        { minX: stairCutout.min_x, maxX: stairCutout.max_x, minZ: minZ, maxZ: stairCutout.min_z },
        { minX: stairCutout.min_x, maxX: stairCutout.max_x, minZ: stairCutout.max_z, maxZ: maxZ }
    ];

    pieces.forEach(p => {
        const pw = p.maxX - p.minX;
        const pd = p.maxZ - p.minZ;
        if (pw > 0.05 && pd > 0.05) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, slabThickness, pd), slabMat);
            mesh.position.set((p.minX + p.maxX) / 2, slabY, (p.minZ + p.maxZ) / 2);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            group.add(mesh);
        }
    });

    // Safety guardrails around the open interior stairwell edges on Floor 2 (East & North edges; South landing is open)
    const guardrailWalls = [
        { start: [stairCutout.max_x, 2.8, stairCutout.min_z], end: [stairCutout.max_x, 2.8, stairCutout.max_z], is_railing: true, base_y: 2.8, height: 1.05 },
        { start: [stairCutout.min_x, 2.8, stairCutout.min_z], end: [stairCutout.max_x, 2.8, stairCutout.min_z], is_railing: true, base_y: 2.8, height: 1.05 }
    ];
    guardrailWalls.forEach(gw => {
        const rail = buildRailingAssembly(gw, 1);
        if (rail) group.add(rail);
    });

    scene.add(group);
    intermediateFloorSlab = group;
    floor2Meshes.push(group);
    return group;
}

// Procedural Architectural Terracotta Shingle Texture for Hut Roof
let cachedRoofTileTexture = null;
function getProceduralRoofTileTexture() {
    if (cachedRoofTileTexture) return cachedRoofTileTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#8c2d12";
    ctx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 8;
    const rowH = 512 / rows;
    const colW = 512 / cols;

    for (let r = 0; r < rows; r++) {
        const y = r * rowH;
        const xOffset = (r % 2) * (colW / 2);
        for (let c = -1; c <= cols; c++) {
            const x = c * colW + xOffset;
            const grad = ctx.createLinearGradient(x, y, x + colW, y + rowH);
            grad.addColorStop(0, "#b44118");
            grad.addColorStop(0.6, "#9a3412");
            grad.addColorStop(1, "#6b1f09");
            ctx.fillStyle = grad;
            ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

            // Curved barrel tile highlight
            ctx.strokeStyle = "rgba(255, 180, 140, 0.22)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + colW * 0.3, y + 4);
            ctx.lineTo(x + colW * 0.3, y + rowH - 4);
            ctx.stroke();
        }
        // Horizontal course shadow
        ctx.fillStyle = "rgba(20, 8, 4, 0.38)";
        ctx.fillRect(0, y + rowH - 5, 512, 5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 3);
    cachedRoofTileTexture = tex;
    return tex;
}

// Complete House Hut Type Roof Assembly (Pitched/Hipped with Terracotta Shingles, Hip Rafters & Transparent View Mode)
function buildRoofAssembly(roofData) {
    if (!roofData) return null;
    const baseY = roofData.base_y !== undefined ? roofData.base_y : 2.8;
    const roofH = roofData.height || 2.5;
    const overhang = roofData.overhang || 0.55;
    const bounds = roofData.bounds || [-8, 8, -6.5, 6.5];

    const x0 = bounds[0] - overhang;
    const x1 = bounds[1] + overhang;
    const z0 = bounds[2] - overhang;
    const z1 = bounds[3] + overhang;

    const width = x1 - x0;
    const depth = z1 - z0;
    const centerX = (x0 + x1) / 2;
    const centerZ = (z0 + z1) / 2;
    const apexY = baseY + roofH;

    const group = new THREE.Group();
    group.userData.type = "roof";

    // Ridge endpoints along center X axis
    const ridgeInset = Math.min(width * 0.28, depth * 0.48);
    const rx0 = centerX - Math.max(0.4, width / 2 - ridgeInset);
    const rx1 = centerX + Math.max(0.4, width / 2 - ridgeInset);
    const rz = centerZ;

    const vertices = [];
    const normals = [];
    const uvs = [];

    function addTriWithUV(pA, pB, pC, uvA, uvB, uvC) {
        vertices.push(...pA, ...pB, ...pC);
        const vA = new THREE.Vector3(...pA);
        const vB = new THREE.Vector3(...pB);
        const vC = new THREE.Vector3(...pC);
        const cb = new THREE.Vector3().subVectors(vC, vB);
        const ab = new THREE.Vector3().subVectors(vA, vB);
        const norm = cb.cross(ab).normalize();
        normals.push(norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z);
        uvs.push(...uvA, ...uvB, ...uvC);
    }

    function addQuad(pA, pB, pC, pD) {
        addTriWithUV(pA, pB, pC, [0, 0], [1, 0], [0.85, 1]);
        addTriWithUV(pA, pC, pD, [0, 0], [0.85, 1], [0.15, 1]);
    }

    const c0 = [x0, baseY, z0]; // NW
    const c1 = [x1, baseY, z0]; // NE
    const c2 = [x1, baseY, z1]; // SE
    const c3 = [x0, baseY, z1]; // SW
    const r0 = [rx0, apexY, rz];
    const r1 = [rx1, apexY, rz];

    // North slope (c0, c1, r1, r0)
    addQuad(c0, c1, r1, r0);
    // South slope (c2, c3, r0, r1)
    addQuad(c2, c3, r0, r1);
    // West hip triangle (c3, c0, r0)
    addTriWithUV(c3, c0, r0, [0, 0], [1, 0], [0.5, 1]);
    // East hip triangle (c1, c2, r1)
    addTriWithUV(c1, c2, r1, [0, 0], [1, 0], [0.5, 1]);

    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    roofGeo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    roofGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    const roofTex = getProceduralRoofTileTexture();
    const roofSolidMat = new THREE.MeshStandardMaterial({
        map: roofTex,
        color: 0xd97757,
        roughness: 0.52,
        metalness: 0.08,
        side: THREE.DoubleSide
    });

    const roofGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.22,
        transmission: 0.85,
        roughness: 0.08,
        metalness: 0.1,
        ior: 1.45,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const roofMesh = new THREE.Mesh(roofGeo, (roofMode === "glass" ? roofGlassMat : roofSolidMat));
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);
    group.userData.roofMesh = roofMesh;
    group.userData.solidMat = roofSolidMat;
    group.userData.glassMat = roofGlassMat;

    // Architectural Perimeter Eaves Fascia & Soffit Trim
    const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.3 });
    const eaves = [
        { len: width + 0.1, pos: [centerX, baseY - 0.04, z0], rot: 0 },
        { len: width + 0.1, pos: [centerX, baseY - 0.04, z1], rot: 0 },
        { len: depth + 0.1, pos: [x0, baseY - 0.04, centerZ], rot: Math.PI / 2 },
        { len: depth + 0.1, pos: [x1, baseY - 0.04, centerZ], rot: Math.PI / 2 }
    ];
    eaves.forEach(e => {
        const fMesh = new THREE.Mesh(new THREE.BoxGeometry(e.len, 0.14, 0.09), fasciaMat);
        fMesh.position.set(...e.pos);
        fMesh.rotation.y = e.rot;
        group.add(fMesh);
    });

    // 4 Structural Hip Rafter Beams (Connecting corners c0..c3 to ridge endpoints r0, r1)
    const hipPairs = [
        [c0, r0],
        [c1, r1],
        [c2, r1],
        [c3, r0]
    ];
    hipPairs.forEach(([pStart, pEnd]) => {
        const vStart = new THREE.Vector3(...pStart);
        const vEnd = new THREE.Vector3(...pEnd);
        const dist = vStart.distanceTo(vEnd);
        const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);
        const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, dist), fasciaMat);
        rafter.position.copy(mid);
        rafter.lookAt(vEnd);
        group.add(rafter);
    });

    // Ridge Beam Cap
    const ridgeLen = Math.max(0.2, rx1 - rx0);
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(ridgeLen + 0.14, 0.1, 0.14), fasciaMat);
    ridgeCap.position.set(centerX, apexY + 0.02, rz);
    group.add(ridgeCap);

    scene.add(group);
    roofGroup = group;
    applyRoofDisplayMode();
    return group;
}

// Update Roof Display Visibility & Material based on roofMode
function applyRoofDisplayMode() {
    const toggleRoofBtn = document.getElementById("toggle-roof-btn");
    if (!roofGroup) {
        if (toggleRoofBtn) toggleRoofBtn.style.display = "none";
        return;
    }
    if (toggleRoofBtn) toggleRoofBtn.style.display = "inline-flex";

    const roofMesh = roofGroup.userData.roofMesh;
    if (!roofMesh) return;

    if (roofMode === "solid") {
        roofGroup.visible = true;
        roofMesh.material = roofGroup.userData.solidMat;
        if (toggleRoofBtn) {
            toggleRoofBtn.innerText = "🏠 Roof: Solid";
            toggleRoofBtn.className = "toolbar-btn roof-active";
        }
    } else if (roofMode === "glass") {
        roofGroup.visible = true;
        roofMesh.material = roofGroup.userData.glassMat;
        if (toggleRoofBtn) {
            toggleRoofBtn.innerText = "🔍 Roof: Transparent";
            toggleRoofBtn.className = "toolbar-btn roof-active";
        }
    } else { // "off"
        roofGroup.visible = false;
        if (toggleRoofBtn) {
            toggleRoofBtn.innerText = "🚫 Roof: Hidden";
            toggleRoofBtn.className = "toolbar-btn";
        }
    }
}

// Cycle Roof Mode: Solid -> Transparent -> Off
function cycleRoofMode() {
    if (roofMode === "solid") roofMode = "glass";
    else if (roofMode === "glass") roofMode = "off";
    else roofMode = "solid";
    applyRoofDisplayMode();
}

// Combined Multi-Floor Scene Compiler (Floor 1 + Stairs + Floor 2 + Railings + Roof)
function buildCombinedMultiFloorScene() {
    clearScene();

    floor1Meshes.length = 0;
    floor2Meshes.length = 0;
    railingMeshes.length = 0;

    const f1 = floor1SceneData;
    const f2 = floor2SceneData;
    if (!f1) return;

    currentSceneData = f1;

    const width = f1.metadata ? f1.metadata.world_size.width : 16;
    const depth = f1.metadata ? f1.metadata.world_size.depth : 13;

    // Ground Grid Helper
    const gridHelper = new THREE.GridHelper(Math.max(width, depth) + 16, 36, 0x27272a, 0x18181b);
    gridHelper.position.y = -0.02;
    gridHelper.userData.type = "grid";
    scene.add(gridHelper);

    const activeStairsData = (f1 && f1.stairs) || (f2 && f2.stairs) || null;
    const activeStairCutout = f2 ? resolveStairCutout(activeStairsData) : null;

    function renderFloorLevel(data, floorIndex) {
        const baseY = floorIndex * 2.8;

        // 1. Room Floors, Furniture, and Labels
        data.rooms.forEach(rm => {
            const isOutdoor = rm.is_outdoor || rm.type === "balcony" || rm.type === "terrace";
            const rmFloorMat = new THREE.MeshStandardMaterial({
                color: isOutdoor ? 0x64748b : 0xffffff,
                roughness: isOutdoor ? 0.85 : 0.45
            });

            const rMinX = rm.center[0] - rm.size[0] / 2 + 0.02;
            const rMaxX = rm.center[0] + rm.size[0] / 2 - 0.02;
            const rMinZ = rm.center[2] - rm.size[1] / 2 + 0.02;
            const rMaxZ = rm.center[2] + rm.size[1] / 2 - 0.02;

            // If on Floor 2 and this room overlaps the stairwell cutout, split floor plane around cutout
            let subRects = [{ minX: rMinX, maxX: rMaxX, minZ: rMinZ, maxZ: rMaxZ }];
            if (floorIndex === 1 && activeStairCutout && !isOutdoor) {
                const ox1 = Math.max(rMinX, activeStairCutout.min_x);
                const ox2 = Math.min(rMaxX, activeStairCutout.max_x);
                const oz1 = Math.max(rMinZ, activeStairCutout.min_z);
                const oz2 = Math.min(rMaxZ, activeStairCutout.max_z);
                if (ox2 > ox1 + 0.01 && oz2 > oz1 + 0.01) {
                    subRects = [
                        { minX: rMinX, maxX: ox1, minZ: rMinZ, maxZ: rMaxZ },
                        { minX: ox2, maxX: rMaxX, minZ: rMinZ, maxZ: rMaxZ },
                        { minX: ox1, maxX: ox2, minZ: rMinZ, maxZ: oz1 },
                        { minX: ox1, maxX: ox2, minZ: oz2, maxZ: rMaxZ }
                    ];
                }
            }

            subRects.forEach(sr => {
                const sw = sr.maxX - sr.minX;
                const sd = sr.maxZ - sr.minZ;
                if (sw <= 0.05 || sd <= 0.05) return;
                const floorGeo = new THREE.PlaneGeometry(sw, sd);
                const floorMesh = new THREE.Mesh(floorGeo, rmFloorMat.clone());
                floorMesh.rotation.x = -Math.PI / 2;
                floorMesh.position.set((sr.minX + sr.maxX) / 2, baseY + 0.01, (sr.minZ + sr.maxZ) / 2);
                floorMesh.receiveShadow = true;
                floorMesh.userData.roomSize = [sw, sd];
                floorMesh.userData.roomData = rm;
                floorMesh.userData.isOutdoor = isOutdoor;
                floorMesh.userData.floor = floorIndex;
                scene.add(floorMesh);
                floorMeshes.push(floorMesh);
                if (floorIndex === 1) floor2Meshes.push(floorMesh);
                else floor1Meshes.push(floorMesh);
            });

            // Add 3D Furniture inside room
            addRoomFurniture(rm, floorIndex);

            // Add 3D Floating Name Label
            const labelSprite = createRoomLabelSprite(rm, baseY);
            labelSprite.userData.floor = floorIndex;
            scene.add(labelSprite);
            labelSprites.push(labelSprite);
            if (floorIndex === 1) floor2Meshes.push(labelSprite);
            else floor1Meshes.push(labelSprite);
        });

        // 2. Extrude Walls and Balcony Railings
        data.walls.forEach(w => {
            if (w.is_railing) {
                // Outdoor balcony railing with tempered glass & metal balustrade
                buildRailingAssembly(w, floorIndex);
                return;
            }

            const dx = w.end[0] - w.start[0];
            const dz = w.end[2] - w.start[2];
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length < 0.05) return;

            const wallBaseY = (w.base_y !== undefined ? w.base_y : baseY);
            const wallH = w.height || 2.8;

            const wallGeo = new THREE.BoxGeometry(length, wallH, w.thickness || 0.2);
            const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            wallMesh.userData.floor = floorIndex;

            wallMesh.position.set(
                (w.start[0] + w.end[0]) / 2,
                wallBaseY + wallH / 2,
                (w.start[2] + w.end[2]) / 2
            );

            const angle = Math.atan2(dz, dx);
            wallMesh.rotation.y = -angle;

            scene.add(wallMesh);
            wallMeshes.push(wallMesh);
            if (floorIndex === 1) floor2Meshes.push(wallMesh);
            else floor1Meshes.push(wallMesh);
        });

        // 3. Doors
        (data.doors || []).forEach((d, idx) => {
            const dGroup = buildDoorAssembly(d, `${floorIndex}_${idx}`, baseY);
            if (dGroup) {
                dGroup.userData.floor = floorIndex;
                if (floorIndex === 1) floor2Meshes.push(dGroup);
                else floor1Meshes.push(dGroup);
            }
        });

        // 4. Windows
        (data.windows || []).forEach(w => {
            const wGroup = buildWindowAssembly(w, baseY);
            if (wGroup) {
                wGroup.userData.floor = floorIndex;
                if (floorIndex === 1) floor2Meshes.push(wGroup);
                else floor1Meshes.push(wGroup);
            }
        });
    }

    // Render Level 1
    renderFloorLevel(f1, 0);

    if (f2) {
        // Render Level 2
        renderFloorLevel(f2, 1);

        // Render Connecting Staircase between Floor 1 and Floor 2
        const stairsData = activeStairsData || {
            start: [-width / 2 + 0.9, 0.0, -depth / 2 + 1.1],
            end: [-width / 2 + 0.9, 2.8, -depth / 2 + 4.1],
            num_steps: 14,
            width: 1.1,
            cutout: {
                min_x: -width / 2 + 0.25,
                max_x: -width / 2 + 1.55,
                min_z: -depth / 2 + 0.9,
                max_z: -depth / 2 + 4.3
            }
        };
        buildStaircaseAssembly(stairsData);

        // Render Intermediate Floor Slab with Stairwell Cutout
        buildIntermediateFloorSlab(f2, stairsData);

        // Render Roof on top of Floor 2 (baseY = 5.6)
        const roofData = f2.roof || {
            type: "hipped_hut",
            base_y: 5.6,
            height: 2.5,
            overhang: 0.55,
            bounds: (f2.metadata && f2.metadata.bounding_box) ? f2.metadata.bounding_box : [-width / 2, width / 2, -depth / 2, depth / 2]
        };
        buildRoofAssembly(roofData);

        // Unhide Floor 2 navigation elements
        const btnF2 = document.getElementById("btn-floor-2");
        if (btnF2) btnF2.classList.remove("hidden");
        const bpTabF2 = document.getElementById("bp-tab-f2");
        if (bpTabF2) {
            bpTabF2.classList.remove("hidden");
            const hasBalcony = (f2.rooms || []).some(r => r.is_outdoor || r.type === "balcony");
            bpTabF2.innerText = hasBalcony ? "Level 2 (Balcony)" : "Level 2";
        }

        const addFloorBtnText = document.getElementById("add-floor-btn-text");
        if (addFloorBtnText) addFloorBtnText.innerText = "Edit 2nd Floor";

    } else {
        // Single Floor: Render Roof on top of Floor 1 (baseY = 2.8)
        const roofData = f1.roof || {
            type: "hipped_hut",
            base_y: 2.8,
            height: 2.5,
            overhang: 0.55,
            bounds: (f1.metadata && f1.metadata.bounding_box) ? f1.metadata.bounding_box : [-width / 2, width / 2, -depth / 2, depth / 2]
        };
        buildRoofAssembly(roofData);

        // Hide Floor 2 navigation elements
        const btnF2 = document.getElementById("btn-floor-2");
        if (btnF2) btnF2.classList.add("hidden");
        const bpTabF2 = document.getElementById("bp-tab-f2");
        if (bpTabF2) bpTabF2.classList.add("hidden");

        const addFloorBtnText = document.getElementById("add-floor-btn-text");
        if (addFloorBtnText) addFloorBtnText.innerText = "Add 2nd Floor";
    }

    // Apply currently selected floor texture to all indoor room floors (Floor 1 & Floor 2)
    applyFloorTextureToAllRooms(currentFloorType);

    setFloorViewMode(activeFloorFilter);
    updateCombinedStats();
    drawAll2DCanvases();

    // Reset camera nicely if in 3D Orbit mode
    if (!isWalkthroughMode && controls) {
        controls.target.set(0, f2 ? 2.5 : 1.2, 0);
        camera.position.set(0, Math.max(width, depth) * (f2 ? 1.35 : 1.2), Math.max(width, depth) * (f2 ? 1.45 : 1.3));
        controls.update();
    }
}

// Floor Level View Filter ("both", "1", "2") - Automatically adapts roof transparency across view modes
function setFloorViewMode(mode) {
    activeFloorFilter = mode;

    document.querySelectorAll(".floor-pill").forEach(p => p.classList.remove("active"));
    const activePill = document.getElementById(mode === "both" ? "btn-floor-both" : (mode === "1" ? "btn-floor-1" : "btn-floor-2"));
    if (activePill) activePill.classList.add("active");

    if (mode === "both") {
        floor1Meshes.forEach(m => m.visible = true);
        floor2Meshes.forEach(m => m.visible = true);
        if (staircaseGroup) staircaseGroup.visible = true;
        if (intermediateFloorSlab) intermediateFloorSlab.visible = true;
        applyRoofDisplayMode();
        if (!isWalkthroughMode && controls) {
            controls.target.set(0, floor2SceneData ? 2.5 : 1.2, 0);
            controls.update();
        }
    } else if (mode === "1") {
        floor1Meshes.forEach(m => m.visible = true);
        floor2Meshes.forEach(m => m.visible = false);
        if (staircaseGroup) staircaseGroup.visible = true;
        if (intermediateFloorSlab) intermediateFloorSlab.visible = false;
        // When inspecting Level 1, make single-story roof transparent X-Ray (or hide if 2nd floor exists)
        if (roofGroup) {
            if (floor2SceneData) {
                roofGroup.visible = false;
            } else {
                roofMode = "glass";
                applyRoofDisplayMode();
            }
        }
        if (!isWalkthroughMode && controls) {
            controls.target.set(0, 1.2, 0);
            controls.update();
        }
        currentBpFloor = 1;
        updateBpFloorTabs();
    } else if (mode === "2") {
        floor1Meshes.forEach(m => m.visible = false);
        floor2Meshes.forEach(m => m.visible = true);
        if (staircaseGroup) staircaseGroup.visible = true;
        if (intermediateFloorSlab) intermediateFloorSlab.visible = true;
        // Automatically make roof transparent when inspecting Level 2 so upper rooms & balcony are clear
        if (roofGroup) {
            roofMode = "glass";
            applyRoofDisplayMode();
        }
        if (!isWalkthroughMode && controls) {
            controls.target.set(0, 3.8, 0);
            controls.update();
        }
        currentBpFloor = 2;
        updateBpFloorTabs();
    }
    drawAll2DCanvases();
}

// Update Combined Specs Sidebar
function updateCombinedStats() {
    const f1 = floor1SceneData;
    const f2 = floor2SceneData;
    if (!f1) return;

    let totalArea = 0;
    let roomList = [];
    let totalDoors = (f1.doors || []).length;

    f1.rooms.forEach(r => {
        totalArea += r.area_sqm;
        roomList.push({ ...r, floorName: "L1" });
    });

    if (f2) {
        f2.rooms.forEach(r => {
            totalArea += r.area_sqm;
            roomList.push({ ...r, floorName: "L2" });
        });
        totalDoors += (f2.doors || []).length;
    }

    const statArea = document.getElementById("stat-area");
    if (statArea) statArea.innerText = `${Math.round(totalArea)} m²`;

    const statRooms = document.getElementById("stat-rooms");
    if (statRooms) statRooms.innerText = roomList.length;

    const statDoors = document.getElementById("stat-doors");
    if (statDoors) statDoors.innerText = totalDoors;

    const list = document.getElementById("room-list");
    if (list) {
        list.innerHTML = "";
        roomList.forEach(rm => {
            const div = document.createElement("div");
            div.className = "room-item";
            div.title = `Click to enter ${rm.name}`;
            div.innerHTML = `
                <div>
                    <span class="room-badge" style="background: ${rm.floorName === 'L2' ? '#38bdf8' : '#ff5a1f'};"></span>
                    <strong>[${rm.floorName}] ${rm.name}</strong>
                </div>
                <span>${rm.size[0]}m × ${rm.size[1]}m (${rm.area_sqm} m²)</span>
            `;
            div.addEventListener("click", () => teleportToRoom(rm));
            list.appendChild(div);
        });
    }
}

// Synchronize Blueprint Floor Tabs
function updateBpFloorTabs() {
    const tab1 = document.getElementById("bp-tab-f1");
    const tab2 = document.getElementById("bp-tab-f2");
    if (tab1) tab1.classList.toggle("active", currentBpFloor === 1);
    if (tab2) tab2.classList.toggle("active", currentBpFloor === 2);
}

// Build Realistic 3D Door Assembly with Frame, Hinged Leaf & Handles (Including Ground Floor Main Entrance Door)
function buildDoorAssembly(d, idx, baseY = 0) {
    const isMainEntrance = Boolean(d.is_main_entrance);
    const doorW = d.width || (isMainEntrance ? 1.2 : 1.0);
    const doorH = d.height || (isMainEntrance ? 2.15 : 2.1);
    const isVert = (d.orientation === "vertical");
    const actualBaseY = (d.pos[1] !== undefined && d.pos[1] !== 0) ? d.pos[1] : baseY;

    const group = new THREE.Group();
    group.position.set(d.pos[0], actualBaseY, d.pos[2]);
    group.rotation.y = isVert ? Math.PI / 2 : 0;
    group.userData.type = "door";
    group.userData.isMainEntrance = isMainEntrance;

    // Door Frame (Dark Architectural Trim / Bronze Frame for Main Entrance)
    const frameMat = new THREE.MeshStandardMaterial({
        color: isMainEntrance ? 0x1e293b : 0x334155,
        roughness: 0.4,
        metalness: isMainEntrance ? 0.35 : 0.1
    });
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.07, doorH, 0.26), frameMat);
    leftJamb.position.set(-doorW / 2 + 0.035, doorH / 2, 0);
    group.add(leftJamb);

    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.07, doorH, 0.26), frameMat);
    rightJamb.position.set(doorW / 2 - 0.035, doorH / 2, 0);
    group.add(rightJamb);

    const topJamb = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.07, 0.26), frameMat);
    topJamb.position.set(0, doorH - 0.035, 0);
    group.add(topJamb);

    // If Main Entrance Door, add Exterior Welcome Porch Step & Overhead Portico Awning
    if (isMainEntrance) {
        const outDir = (isVert ? (d.pos[0] < 0 ? -1 : 1) : (d.pos[2] < 0 ? -1 : 1));
        const stepMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 });
        const porchStep = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.55, 0.06, 0.9), stepMat);
        porchStep.position.set(0, 0.03, outDir * 0.45);
        porchStep.receiveShadow = true;
        group.add(porchStep);

        const matMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.02, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.85 })
        );
        matMesh.position.set(0, 0.065, outDir * 0.45);
        group.add(matMesh);

        const awning = new THREE.Mesh(
            new THREE.BoxGeometry(doorW + 0.6, 0.09, 0.75),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.4 })
        );
        awning.position.set(0, doorH + 0.08, outDir * 0.32);
        awning.castShadow = true;
        group.add(awning);
    }

    // Hinged Door Pivot at Left Edge
    const pivot = new THREE.Group();
    pivot.position.set(-doorW / 2 + 0.05, 0, 0);
    pivot.rotation.y = isMainEntrance ? 0.32 : 0.22;

    // Door Panel (Rich Mahogany for Main Entrance, Warm Oak for Interior Doors)
    const panelW = doorW - 0.1;
    const panelMat = new THREE.MeshStandardMaterial({
        color: isMainEntrance ? 0x7c2d12 : 0xb45309,
        roughness: 0.35,
        metalness: 0.08
    });
    const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorH - 0.06, 0.065), panelMat);
    panelMesh.position.set(panelW / 2, doorH / 2 - 0.02, 0);
    panelMesh.castShadow = true;
    pivot.add(panelMesh);

    // Decorative Frosted Glass Vision Lite on Main Entrance Door
    if (isMainEntrance) {
        const liteMat = new THREE.MeshPhysicalMaterial({
            color: 0xbae6fd,
            transparent: true,
            opacity: 0.5,
            transmission: 0.7,
            roughness: 0.15
        });
        const liteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.35, 0.075), liteMat);
        liteMesh.position.set(panelW * 0.48, doorH * 0.54, 0);
        pivot.add(liteMesh);
    }

    // Brass Door Handles on Both Sides
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.88, roughness: 0.18 });
    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.15, isMainEntrance ? 0.22 : 0.03, 0.17), handleMat);
    handleBar.position.set(panelW - 0.13, 1.02, 0);
    pivot.add(handleBar);

    group.add(pivot);
    scene.add(group);

    const doorRecord = {
        id: d.id || `door_${idx}`,
        data: d,
        group,
        pivot,
        panelMesh,
        isOpen: false,
        targetRotation: isMainEntrance ? 0.32 : 0.22
    };
    panelMesh.userData.doorRecord = doorRecord;
    leftJamb.userData.doorRecord = doorRecord;
    rightJamb.userData.doorRecord = doorRecord;

    doorObjects.push(doorRecord);
    doorInteractables.push(panelMesh, leftJamb, rightJamb);
    return group;
}

// Build Properly Aligned 3D Exterior Window Assembly
function buildWindowAssembly(w, baseY = 0) {
    const winW = w.width || 1.5;
    const winH = w.height || 1.2;
    const winBaseY = (w.pos[1] !== undefined ? w.pos[1] : (baseY + 1.0));
    const isVert = (w.orientation === "vertical");

    const group = new THREE.Group();
    group.position.set(w.pos[0], winBaseY + winH / 2, w.pos[2]);
    group.rotation.y = isVert ? Math.PI / 2 : 0;
    group.userData.type = "window";

    // Outer Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const topF = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.06, 0.24), frameMat);
    topF.position.set(0, winH / 2, 0);
    group.add(topF);

    const botF = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.08, 0.07, 0.28), frameMat);
    botF.position.set(0, -winH / 2, 0);
    group.add(botF);

    const leftF = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.24), frameMat);
    leftF.position.set(-winW / 2, 0, 0);
    group.add(leftF);

    const rightF = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.24), frameMat);
    rightF.position.set(winW / 2, 0, 0);
    group.add(rightF);

    const midMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, 0.22), frameMat);
    group.add(midMullion);

    // Ultra-Clear Architectural Glass Pane
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        transmission: 0.92,
        roughness: 0.04,
        metalness: 0.05,
        ior: 1.5,
        reflectivity: 0.8,
        depthWrite: false
    });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.08, winH - 0.08, 0.04), glassMat);
    group.add(glass);

    scene.add(group);
    return group;
}

// Register a furniture group for dragging
function registerDraggableFurniture(group, name = "Furniture") {
    group.userData.isFurniture = true;
    group.userData.furnitureName = name;
    scene.add(group);
    furnitureMeshes.push(group);

    group.traverse(child => {
        if (child.isMesh) {
            child.userData.furnitureGroup = group;
            furnitureDraggables.push(child);
        }
    });
}

// Spawn new furniture piece dynamically
function spawnFurniturePiece(type, posX = 0, posZ = 0, posY = 0, floorIndex = 0) {
    const group = new THREE.Group();

    if (type === "sofa") {
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.9), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        base.position.set(0, 0.21, 0);
        base.castShadow = true;
        group.add(base);

        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        back.position.set(0, 0.6, -0.35);
        group.add(back);
        registerDraggableFurniture(group, "Modern Sofa");
    } else if (type === "bed") {
        const bedBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 1.8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
        bedBase.position.set(0, 0.19, 0);
        bedBase.castShadow = true;
        group.add(bedBase);

        const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.7), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
        mattress.position.set(0, 0.48, 0);
        group.add(mattress);

        const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
        pillow1.position.set(-0.45, 0.64, -0.55);
        group.add(pillow1);
        const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
        pillow2.position.set(0.45, 0.64, -0.55);
        group.add(pillow2);
        registerDraggableFurniture(group, "King Bed");
    } else if (type === "table") {
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.7), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
        table.position.set(0, 0.18, 0);
        table.castShadow = true;
        group.add(table);
        registerDraggableFurniture(group, "Coffee Table");
    } else if (type === "dining") {
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.3 }));
        top.position.set(0, 0.74, 0);
        group.add(top);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72), legMat);
            leg.position.set(lx, 0.36, lz);
            group.add(leg);
        });
        registerDraggableFurniture(group, "Dining Table & Chairs");
    } else if (type === "counter") {
        const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.88, 0.8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
        counter.position.set(0, 0.44, 0);
        group.add(counter);
        const topSlab = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.06, 0.86), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 }));
        topSlab.position.set(0, 0.9, 0);
        group.add(topSlab);
        registerDraggableFurniture(group, "Kitchen Island");
    } else if (type === "tub") {
        const tub = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.52, 0.78), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }));
        tub.position.set(0, 0.26, 0);
        group.add(tub);
        registerDraggableFurniture(group, "Bathtub");
    } else if (type === "plant") {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
        pot.position.set(0, 0.2, 0);
        group.add(pot);
        const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 1), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 }));
        foliage.position.set(0, 0.6, 0);
        group.add(foliage);
        registerDraggableFurniture(group, "Indoor Plant");
    } else if (type === "lamp") {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        base.position.set(0, 0.02, 0);
        group.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
        pole.position.set(0, 0.72, 0);
        group.add(pole);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.35, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xfef08a }));
        shade.position.set(0, 1.45, 0);
        group.add(shade);
        registerDraggableFurniture(group, "Floor Lamp");
    }

    group.position.set(posX, posY, posZ);
    group.userData.floor = floorIndex;
    if (floorIndex === 1) floor2Meshes.push(group);
    else floor1Meshes.push(group);

    return group;
}

// Dynamic Furniture Placer based on Room Type & Floor
function addRoomFurniture(rm, floorIndex = 0) {
    const baseY = floorIndex * 2.8;
    const cx = rm.center[0];
    const cz = rm.center[2];

    if (rm.type.includes("balcony") || rm.type.includes("terrace")) {
        spawnFurniturePiece("table", cx - 0.6, cz, baseY, floorIndex);
        spawnFurniturePiece("plant", cx + 1.2, cz, baseY, floorIndex);
    } else if (rm.type.includes("study") || rm.type.includes("office")) {
        spawnFurniturePiece("table", cx, cz - 0.4, baseY, floorIndex);
        spawnFurniturePiece("lamp", cx - 1.2, cz, baseY, floorIndex);
    } else if (rm.type.includes("bedroom")) {
        spawnFurniturePiece("bed", cx, cz, baseY, floorIndex);
    } else if (rm.type.includes("living")) {
        spawnFurniturePiece("sofa", cx, cz - 0.5, baseY, floorIndex);
        spawnFurniturePiece("table", cx, cz + 0.65, baseY, floorIndex);
    } else if (rm.type.includes("kitchen")) {
        spawnFurniturePiece("counter", cx, cz - rm.size[1] * 0.25, baseY, floorIndex);
    } else if (rm.type.includes("bathroom")) {
        spawnFurniturePiece("tub", cx, cz, baseY, floorIndex);
    }
}

// Determine which room a point (x, z) is inside (supports both Floor 1 & Floor 2)
function findRoomAtPosition(x, z, floorNum = currentBpFloor) {
    const targetData = (floorNum === 2 && floor2SceneData) ? floor2SceneData : (floor1SceneData || currentSceneData);
    if (!targetData || !targetData.rooms) return null;
    for (const rm of targetData.rooms) {
        const halfW = rm.size[0] / 2;
        const halfH = rm.size[1] / 2;
        if (x >= rm.center[0] - halfW && x <= rm.center[0] + halfW &&
            z >= rm.center[2] - halfH && z <= rm.center[2] + halfH) {
            return rm;
        }
    }
    return null;
}

// Compute Target Room when Clicking a Door (Enters the room on the OTHER side of the door!)
function getTargetRoomForDoor(doorRecord) {
    const d = doorRecord.data;
    if (!d.roomA || !d.roomB) return d.roomB || d.roomA || null;

    const camX = camera.position.x;
    const camZ = camera.position.z;
    const distA = Math.hypot(camX - d.roomA.center[0], camZ - d.roomA.center[2]);
    const distB = Math.hypot(camX - d.roomB.center[0], camZ - d.roomB.center[2]);

    // If user is currently closer to Room A, clicking the door enters Room B (and vice versa)
    return (distA <= distB) ? d.roomB : d.roomA;
}

// Enter a Room (Used when clicking a Door or clicking a Room in 2D Map / Sidebar)
function enterRoomThroughDoor(doorRecord) {
    // 1. Swing the door open!
    doorRecord.isOpen = true;
    doorRecord.targetRotation = Math.PI / 2.1; // 85 degrees open

    const targetRoom = getTargetRoomForDoor(doorRecord);
    if (!targetRoom) return;

    const doorPos = doorRecord.data.pos;
    const targetCenter = targetRoom.center;
    const floorBaseY = (doorPos[1] !== undefined && doorPos[1] >= 2.5) ? 2.8 : ((targetCenter[1] !== undefined && targetCenter[1] >= 2.5) ? 2.8 : 0);
    const eyeY = floorBaseY + 1.65;

    // Activate Walkthrough mode automatically or transition camera smoothly inside the room
    if (!isWalkthroughMode) {
        enableWalkthroughMode(false);
    }

    // Smoothly walk from current position through the doorway into the target room center
    const startPos = camera.position.clone();
    const midPos = new THREE.Vector3(doorPos[0], eyeY, doorPos[2]);
    const endPos = new THREE.Vector3(targetCenter[0], eyeY, targetCenter[2]);

    // Orient camera heading toward the target room center
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    walkYaw = Math.atan2(dx, -dz);
    walkPitch = 0;

    activeCamTransition = {
        startTime: performance.now(),
        duration: 850,
        startPos,
        midPos,
        endPos,
        roomName: targetRoom.name
    };

    document.getElementById("current-room-label").innerText = `Entering ${targetRoom.name}...`;
}

function teleportToRoom(rm) {
    if (!rm) return;
    const floorBaseY = (rm.center[1] !== undefined && rm.center[1] >= 2.5) ? 2.8 : (rm.floorName === "L2" ? 2.8 : 0);
    if (floorBaseY >= 2.5) {
        currentBpFloor = 2;
        updateBpFloorTabs();
    } else {
        currentBpFloor = 1;
        updateBpFloorTabs();
    }

    // Make roof transparent when teleporting to inspect a room so view is never blocked
    if (roofMode === "solid") {
        roofMode = "glass";
        applyRoofDisplayMode();
    }

    if (isWalkthroughMode) {
        camera.position.set(rm.center[0], floorBaseY + 1.65, rm.center[2]);
        updateWalkthroughCameraTarget();
        document.getElementById("current-room-label").innerText = rm.name;
    } else {
        controls.target.set(rm.center[0], floorBaseY + 1.0, rm.center[2]);
        camera.position.set(rm.center[0], floorBaseY + 11, rm.center[2] + 9);
        controls.update();
    }
    drawAll2DCanvases();
}

// Update First-Person Camera Target from walkYaw & walkPitch
function updateWalkthroughCameraTarget() {
    const lookX = Math.sin(walkYaw) * Math.cos(walkPitch);
    const lookY = Math.sin(walkPitch);
    const lookZ = -Math.cos(walkYaw) * Math.cos(walkPitch);
    camera.lookAt(
        camera.position.x + lookX * 10,
        camera.position.y + lookY * 10,
        camera.position.z + lookZ * 10
    );
}

function enableWalkthroughMode(resetPosition = true) {
    isWalkthroughMode = true;
    controls.enabled = false;
    setActiveViewBtn("view-walk-btn");
    document.getElementById("walkthrough-hud").classList.remove("hidden");

    // Make roof transparent glass in walkthrough mode so user sees vaulted roof & rafters from inside
    if (roofGroup && roofMode === "solid") {
        roofMode = "glass";
        applyRoofDisplayMode();
    }

    const activeData = (currentBpFloor === 2 && floor2SceneData) ? floor2SceneData : (floor1SceneData || currentSceneData);
    const floorBaseY = (currentBpFloor === 2 && floor2SceneData) ? 2.8 : 0;

    if (resetPosition && activeData && activeData.rooms.length > 0) {
        const startRm = activeData.rooms[0];
        camera.position.set(startRm.center[0], floorBaseY + 1.65, startRm.center[2]);
        walkYaw = 0;
        walkPitch = 0;
        updateWalkthroughCameraTarget();
        document.getElementById("current-room-label").innerText = startRm.name;
    }
    drawAll2DCanvases();
}

function disableWalkthroughMode() {
    isWalkthroughMode = false;
    controls.enabled = true;
    document.getElementById("walkthrough-hud").classList.add("hidden");
    document.getElementById("door-tooltip").classList.add("hidden");
}

// Main Animation Loop (Handles WASD Movement, Door Swing Animation, Proximity Detection & 3D Render)
let lastFrameTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    // 1. Animate Swinging Doors
    doorObjects.forEach(dObj => {
        const diff = dObj.targetRotation - dObj.pivot.rotation.y;
        if (Math.abs(diff) > 0.005) {
            dObj.pivot.rotation.y += diff * 0.14;
        }
    });

    // 2. Handle Smooth Doorway Entry Transition
    if (activeCamTransition) {
        const elapsed = now - activeCamTransition.startTime;
        const t = Math.min(elapsed / activeCamTransition.duration, 1.0);
        // Quadratic bezier interpolation through the doorway
        const inv = 1 - t;
        camera.position.x = inv * inv * activeCamTransition.startPos.x + 2 * inv * t * activeCamTransition.midPos.x + t * t * activeCamTransition.endPos.x;
        camera.position.y = activeCamTransition.endPos.y;
        camera.position.z = inv * inv * activeCamTransition.startPos.z + 2 * inv * t * activeCamTransition.midPos.z + t * t * activeCamTransition.endPos.z;
        updateWalkthroughCameraTarget();
        drawAll2DCanvases();

        if (t >= 1.0) {
            document.getElementById("current-room-label").innerText = activeCamTransition.roomName;
            activeCamTransition = null;
        }
    }
    // 3. Handle WASD First-Person Walkthrough Movement
    else if (isWalkthroughMode) {
        const moveSpeed = 5.2 * dt; // 5.2 meters per second walking speed
        let forward = 0;
        let strafe = 0;

        if (moveKeys.w || moveKeys.up) forward += 1;
        if (moveKeys.s || moveKeys.down) forward -= 1;
        if (moveKeys.d || moveKeys.right) strafe += 1;
        if (moveKeys.a || moveKeys.left) strafe -= 1;

        if (forward !== 0 || strafe !== 0) {
            const fx = Math.sin(walkYaw);
            const fz = -Math.cos(walkYaw);
            const rx = Math.cos(walkYaw);
            const rz = Math.sin(walkYaw);

            camera.position.x += (fx * forward + rx * strafe) * moveSpeed;
            camera.position.z += (fz * forward + rz * strafe) * moveSpeed;
            const onF2 = (currentBpFloor === 2 && floor2SceneData) || camera.position.y > 3.0;
            camera.position.y = onF2 ? (2.8 + 1.65) : 1.65;

            updateWalkthroughCameraTarget();

            // Update current room badge
            const curRm = findRoomAtPosition(camera.position.x, camera.position.z, onF2 ? 2 : 1);
            if (curRm) {
                document.getElementById("current-room-label").innerText = curRm.name;
            }

            // Auto-open doors when approaching closely & show prompt
            checkNearestDoorProximity();
            drawAll2DCanvases();
        }
    } else {
        controls.update();
    }

    renderer.render(scene, camera);
}

// Check if User is Approaching a Door in Walkthrough Mode
function checkNearestDoorProximity() {
    if (!doorObjects.length) return;
    const tooltip = document.getElementById("door-tooltip");
    const targetNameSpan = document.getElementById("door-target-name");

    let closestDoor = null;
    let minDist = Infinity;

    for (const dObj of doorObjects) {
        const dist = Math.hypot(camera.position.x - dObj.data.pos[0], camera.position.z - dObj.data.pos[2]);
        if (dist < minDist) {
            minDist = dist;
            closestDoor = dObj;
        }
    }

    if (closestDoor && minDist < 2.8) {
        const targetRoom = getTargetRoomForDoor(closestDoor);
        if (targetRoom) {
            targetNameSpan.innerText = targetRoom.name;
            tooltip.classList.remove("hidden");
        }
    } else if (!hoveredDoorObj) {
        tooltip.classList.add("hidden");
    }
}

// Draw 2D Architectural Layout on Both Live Overlay Canvas and Drawer Canvas
function drawAll2DCanvases() {
    const dataToDraw = (currentBpFloor === 2 && floor2SceneData) ? floor2SceneData : (floor1SceneData || currentSceneData);
    if (!dataToDraw) return;
    draw2DBlueprintOnCanvas(document.getElementById("live-2d-canvas"), dataToDraw, true);
    draw2DBlueprintOnCanvas(document.getElementById("cad-canvas"), dataToDraw, true);
}

function draw2DBlueprintOnCanvas(canvas, data, showPlayer) {
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const worldW = (data.metadata && data.metadata.world_size) ? Math.max(data.metadata.world_size.width, 8) : 16;
    const worldD = (data.metadata && data.metadata.world_size) ? Math.max(data.metadata.world_size.depth, 8) : 13;
    const pad = 28;
    const scale = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldD);

    const ox = w / 2;
    const oy = h / 2;

    // Save transform metadata on canvas for click-to-teleport
    canvas._mapTransform = { ox, oy, scale };

    // 1. Subtle Blueprint Grid (Carbon Charcoal)
    ctx.strokeStyle = "#18181c";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 18) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 18) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 2. Draw Rooms with Distinct Architectural Fills & Clear Room Names
    const typeFillMap = {
        living: "rgba(255, 90, 31, 0.14)",
        kitchen: "rgba(245, 158, 11, 0.14)",
        bedroom: "rgba(255, 255, 255, 0.08)",
        bathroom: "rgba(34, 197, 94, 0.12)",
        balcony: "rgba(56, 189, 248, 0.18)",
        terrace: "rgba(56, 189, 248, 0.18)",
        study: "rgba(168, 85, 247, 0.14)",
        office: "rgba(168, 85, 247, 0.14)"
    };

    data.rooms.forEach(rm => {
        const rx = ox + (rm.center[0] - rm.size[0] / 2) * scale;
        const ry = oy + (rm.center[2] - rm.size[1] / 2) * scale;
        const rw = rm.size[0] * scale;
        const rh = rm.size[1] * scale;

        let fillCol = "rgba(255, 90, 31, 0.10)";
        for (const k in typeFillMap) {
            if (rm.type.includes(k)) fillCol = typeFillMap[k];
        }

        ctx.fillStyle = fillCol;
        ctx.fillRect(rx, ry, rw, rh);

        // Decking hash pattern for outdoor balcony / terrace
        if (rm.type.includes("balcony") || rm.type.includes("terrace") || rm.is_outdoor) {
            ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
            ctx.lineWidth = 1;
            for (let dy = 6; dy < rh; dy += 8) {
                ctx.beginPath();
                ctx.moveTo(rx + 2, ry + dy);
                ctx.lineTo(rx + rw - 2, ry + dy);
                ctx.stroke();
            }
        }

        // Room Name & Dimensions Label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(rm.name, rx + rw / 2, ry + rh / 2 - 3);

        ctx.fillStyle = (rm.type.includes("balcony") || rm.is_outdoor) ? "#38bdf8" : "#a1a1aa";
        ctx.font = "9px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(`${rm.size[0]}m × ${rm.size[1]}m`, rx + rw / 2, ry + rh / 2 + 10);
    });

    // 3. Draw Connecting Stairs Indicator (Only when a 2nd floor exists)
    const stairs = data.stairs || (floor1SceneData && floor1SceneData.stairs);
    if (floor2SceneData && stairs && stairs.start && stairs.end) {
        const sx1 = ox + (stairs.start[0] - 0.55) * scale;
        const sy1 = oy + Math.min(stairs.start[2], stairs.end[2]) * scale;
        const sw = 1.1 * scale;
        const sd = Math.abs(stairs.end[2] - stairs.start[2]) * scale;

        // Stairwell background
        ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
        ctx.fillRect(sx1, sy1, sw, sd);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx1, sy1, sw, sd);

        // Treads
        const numLines = 8;
        for (let i = 1; i < numLines; i++) {
            const stepY = sy1 + (sd / numLines) * i;
            ctx.beginPath();
            ctx.moveTo(sx1, stepY);
            ctx.lineTo(sx1 + sw, stepY);
            ctx.stroke();
        }

        // Direction Arrow & Label
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 8px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        const dirLabel = currentBpFloor === 2 ? "STAIRS (DN) ↓" : "STAIRS (UP) ↑";
        ctx.fillText(dirLabel, sx1 + sw / 2, sy1 + sd / 2 + 3);
    }

    // 4. Draw Structural Walls and Balcony Railings
    data.walls.forEach(wall => {
        if (wall.base_y && wall.base_y > 3.0 && currentBpFloor === 1) return;
        const x1 = ox + wall.start[0] * scale;
        const y1 = oy + wall.start[2] * scale;
        const x2 = ox + wall.end[0] * scale;
        const y2 = oy + wall.end[2] * scale;

        if (wall.is_railing) {
            // Open architectural balcony railing: dashed cyan line
            ctx.save();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.4;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (wall.is_lintel) return; // Skip door header lintel so doorway gap is clear

        ctx.strokeStyle = "#f4f4f5";
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });

    // 5. Draw Windows (Crisp Platinum Bars on Exterior Walls)
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 3.5;
    (data.windows || []).forEach(win => {
        const wx = ox + win.pos[0] * scale;
        const wy = oy + win.pos[2] * scale;
        const halfLen = (win.width || 1.4) * scale * 0.45;
        ctx.beginPath();
        if (win.orientation === "vertical") {
            ctx.moveTo(wx, wy - halfLen);
            ctx.lineTo(wx, wy + halfLen);
        } else {
            ctx.moveTo(wx - halfLen, wy);
            ctx.lineTo(wx + halfLen, wy);
        }
        ctx.stroke();
    });

    // 6. Draw Doors (Flame Orange Architectural Door Leaf + Swing Arc; Emerald Highlight for Main Entrance)
    (data.doors || []).forEach(d => {
        const isMain = Boolean(d.is_main_entrance);
        const dx = ox + d.pos[0] * scale;
        const dy = oy + d.pos[2] * scale;
        const r = Math.max((d.width || (isMain ? 1.2 : 1.0)) * scale * 0.48, 6);

        ctx.strokeStyle = isMain ? "#10b981" : "#ff5a1f";
        ctx.lineWidth = isMain ? 2.6 : 2;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI / 2);
        ctx.stroke();

        ctx.fillStyle = isMain ? "#10b981" : "#ff5a1f";
        ctx.beginPath();
        ctx.arc(dx, dy, isMain ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        if (isMain) {
            ctx.fillStyle = "#10b981";
            ctx.font = "bold 7.5px 'Plus Jakarta Sans', sans-serif";
            ctx.textAlign = "center";
            const labelY = d.pos[2] < 0 ? dy - 6 : dy + 12;
            ctx.fillText("MAIN ENTRANCE", dx, labelY);
        }
    });

    // 7. Draw Furniture Pieces on 2D Blueprint (Filtered by Current Floor)
    furnitureMeshes.forEach(fGroup => {
        if (fGroup.userData.floor !== undefined && fGroup.userData.floor !== (currentBpFloor - 1)) return;
        const fx = ox + fGroup.position.x * scale;
        const fy = oy + fGroup.position.z * scale;
        ctx.fillStyle = "rgba(161, 161, 170, 0.85)";
        ctx.strokeStyle = "#ff5a1f";
        ctx.lineWidth = 1;
        ctx.fillRect(fx - 5, fy - 5, 10, 10);
        ctx.strokeRect(fx - 5, fy - 5, 10, 10);
    });

    // 7. Draw Live Player Position & View Cone
    if (showPlayer && camera) {
        const px = ox + camera.position.x * scale;
        const py = oy + camera.position.z * scale;

        // Only draw if inside or near bounds
        if (px >= 5 && px <= w - 5 && py >= 5 && py <= h - 5) {
            let heading = walkYaw;
            if (!isWalkthroughMode && controls) {
                const dir = new THREE.Vector3();
                camera.getWorldDirection(dir);
                heading = Math.atan2(dir.x, -dir.z);
            }

            // View Cone
            ctx.fillStyle = "rgba(16, 185, 129, 0.28)";
            ctx.beginPath();
            ctx.moveTo(px, py);
            const coneLen = 18;
            const spread = 0.45;
            ctx.lineTo(px + Math.sin(heading - spread) * coneLen, py - Math.cos(heading - spread) * coneLen);
            ctx.lineTo(px + Math.sin(heading + spread) * coneLen, py - Math.cos(heading + spread) * coneLen);
            ctx.closePath();
            ctx.fill();

            // Player Dot
            ctx.fillStyle = "#10b981";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
}

function updateStatsAndSidebar(data) {
    let totalArea = 0;
    data.rooms.forEach(r => totalArea += r.area_sqm);

    document.getElementById("stat-area").innerText = `${Math.round(totalArea)} m²`;
    document.getElementById("stat-rooms").innerText = data.rooms.length;
    document.getElementById("stat-doors").innerText = (data.doors || []).length;

    const list = document.getElementById("room-list");
    list.innerHTML = "";
    data.rooms.forEach(rm => {
        const div = document.createElement("div");
        div.className = "room-item";
        div.title = `Click to enter ${rm.name}`;
        div.innerHTML = `
            <div>
                <span class="room-badge" style="background: #ff5a1f;"></span>
                <strong>${rm.name}</strong>
            </div>
            <span>${rm.size[0]}m × ${rm.size[1]}m (${rm.area_sqm} m²)</span>
        `;
        div.addEventListener("click", () => teleportToRoom(rm));
        list.appendChild(div);
    });
}

// Setup 3D Viewport Pointer & Keyboard Interactions (Furniture Drag & Drop + Door Raycasting + WASD)
function setupViewportInteractions(domElement) {
    let pointerDownPos = { x: 0, y: 0 };

    domElement.addEventListener("pointerdown", (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };

        const rect = domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Furniture Drag Check (Priority when in Furniture Move Mode or when clicking furniture)
        if (!isWalkthroughMode && e.button === 0) {
            raycaster.setFromCamera(mouse, camera);
            const furnHits = raycaster.intersectObjects(furnitureDraggables, true);
            if (furnHits.length > 0) {
                let hitObj = furnHits[0].object;
                while (hitObj && !hitObj.userData.isFurniture && hitObj.parent) {
                    if (hitObj.userData.furnitureGroup) {
                        hitObj = hitObj.userData.furnitureGroup;
                        break;
                    }
                    hitObj = hitObj.parent;
                }
                if (hitObj && hitObj.userData.isFurniture) {
                    draggedFurniture = hitObj;
                    controls.enabled = false; // Disable orbit while dragging furniture

                    // Setup drag plane at furniture Y
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), draggedFurniture.position);
                    if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
                        dragOffset.copy(draggedFurniture.position).sub(dragIntersection);
                    }
                    domElement.style.cursor = "grabbing";
                    return;
                }
            }
        }

        if (isWalkthroughMode && e.button === 0) {
            isMouseLooking = true;
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;
        }
    });

    window.addEventListener("pointerup", (e) => {
        if (draggedFurniture) {
            draggedFurniture = null;
            if (!isWalkthroughMode) controls.enabled = true;
            domElement.style.cursor = isFurnitureMode ? "grab" : "default";
            drawAll2DCanvases();
        }

        isMouseLooking = false;
        const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        // If it was a clean click (not a drag), check if user clicked a Door!
        if (moveDist < 6 && e.target === domElement) {
            handleViewportClick(e, domElement);
        }
    });

    domElement.addEventListener("pointermove", (e) => {
        const rect = domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // 1. If currently dragging a furniture item across the floor
        if (draggedFurniture) {
            raycaster.setFromCamera(mouse, camera);
            if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
                const newX = dragIntersection.x + dragOffset.x;
                const newZ = dragIntersection.z + dragOffset.z;

                // Snap slightly to metric grid (0.1m snap)
                draggedFurniture.position.x = Math.round(newX * 10) / 10;
                draggedFurniture.position.z = Math.round(newZ * 10) / 10;
                drawAll2DCanvases();
            }
            return;
        }

        // 2. First-person mouse look when dragging in Walkthrough mode
        if (isWalkthroughMode && isMouseLooking) {
            const dx = e.clientX - prevMouseX;
            const dy = e.clientY - prevMouseY;
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;

            walkYaw += dx * 0.0045;
            walkPitch = Math.max(-1.1, Math.min(1.1, walkPitch - dy * 0.004));
            updateWalkthroughCameraTarget();
            drawAll2DCanvases();
            return;
        }

        // 3. Raycast Hover Check on Furniture (in Furniture mode) or Doors
        raycaster.setFromCamera(mouse, camera);

        if (isFurnitureMode) {
            const furnHits = raycaster.intersectObjects(furnitureDraggables, true);
            if (furnHits.length > 0) {
                domElement.style.cursor = "grab";
                return;
            }
        }

        const hits = raycaster.intersectObjects(doorInteractables, false);
        const tooltip = document.getElementById("door-tooltip");
        const targetNameSpan = document.getElementById("door-target-name");

        if (hits.length > 0 && hits[0].object.userData.doorRecord) {
            hoveredDoorObj = hits[0].object.userData.doorRecord;
            domElement.style.cursor = "pointer";
            const targetRoom = getTargetRoomForDoor(hoveredDoorObj);
            if (targetRoom) {
                targetNameSpan.innerText = targetRoom.name;
                tooltip.classList.remove("hidden");
            }
        } else {
            hoveredDoorObj = null;
            domElement.style.cursor = isWalkthroughMode ? "crosshair" : (isFurnitureMode ? "default" : "default");
            if (!isWalkthroughMode) {
                tooltip.classList.add("hidden");
            }
        }
    });

    // Keyboard Listeners for WASD Walkthrough
    window.addEventListener("keydown", (e) => {
        // Ignore WASD if user is typing inside the prompt input box!
        if (document.activeElement && document.activeElement.id === "prompt-input") return;

        const k = e.key.toLowerCase();
        if (k === "w") moveKeys.w = true;
        if (k === "s") moveKeys.s = true;
        if (k === "a") moveKeys.a = true;
        if (k === "d") moveKeys.d = true;
        if (e.key === "ArrowUp") moveKeys.up = true;
        if (e.key === "ArrowDown") moveKeys.down = true;
        if (e.key === "ArrowLeft") moveKeys.left = true;
        if (e.key === "ArrowRight") moveKeys.right = true;

        // If user presses W/A/S/D while not in walkthrough mode, automatically enter walkthrough mode!
        if ((k === "w" || k === "a" || k === "s" || k === "d") && !isWalkthroughMode) {
            enableWalkthroughMode(true);
        }

        if (e.key === "Escape" && isWalkthroughMode) {
            disableWalkthroughMode();
            setActiveViewBtn("view-3d-btn");
        }
    });

    window.addEventListener("keyup", (e) => {
        const k = e.key.toLowerCase();
        if (k === "w") moveKeys.w = false;
        if (k === "s") moveKeys.s = false;
        if (k === "a") moveKeys.a = false;
        if (k === "d") moveKeys.d = false;
        if (e.key === "ArrowUp") moveKeys.up = false;
        if (e.key === "ArrowDown") moveKeys.down = false;
        if (e.key === "ArrowLeft") moveKeys.left = false;
        if (e.key === "ArrowRight") moveKeys.right = false;
    });
}

function handleViewportClick(e, domElement) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(doorInteractables, false);

    if (hits.length > 0 && hits[0].object.userData.doorRecord) {
        const doorRecord = hits[0].object.userData.doorRecord;
        enterRoomThroughDoor(doorRecord);
    }
}

function setActiveViewBtn(id) {
    ["view-3d-btn", "view-top-btn", "view-walk-btn"].forEach(b => {
        const el = document.getElementById(b);
        if (el) el.classList.remove("active");
    });
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
}

// Generate Floorplan API Call
async function generateFloorplan(promptText) {
    const btn = document.getElementById("generate-btn");
    const spinner = document.getElementById("btn-spinner");
    const btnText = btn.querySelector(".btn-text");
    const statusText = document.getElementById("ai-status");
    const irregularAlert = document.getElementById("irregular-alert");
    const irregularMsg = document.getElementById("irregular-msg");

    irregularAlert.classList.add("hidden");

    btn.disabled = true;
    spinner.style.display = "block";
    btnText.innerText = "Computing...";
    statusText.innerText = "Synthesizing CAD Layout...";

    try {
        const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptText })
        });

        const data = await response.json();

        // 1. Irregular Prompt Constraint Handling
        if (!response.ok) {
            if (data.is_irregular) {
                irregularMsg.innerText = data.error || "Irregular prompt detected.";
                irregularAlert.classList.remove("hidden");
                statusText.innerText = "Irregular Prompt (Rejected by Constraints)";
                return;
            }
            throw new Error(data.error || `Server error (${response.status})`);
        }

        // 2. Build 3D Multi-Floor Scene & 2D Named Map
        floor1SceneData = data;
        floor2SceneData = null;
        activeFloorFilter = "both";
        currentBpFloor = 1;
        buildCombinedMultiFloorScene();

        const roomCount = data.metadata ? data.metadata.total_rooms : 4;
        statusText.innerText = `Plan Generated • ${roomCount} Rooms Synced`;

    } catch (e) {
        console.warn("Connection error:", e);
        statusText.innerText = "Error communicating with CAD engine";
    } finally {
        btn.disabled = false;
        spinner.style.display = "none";
        btnText.innerText = "Generate Plan";
    }
}

// View Routing & Page Management
function switchView(viewName, promptToLoad = null, initialFloor = null) {
    const homeView = document.getElementById("home-view");
    const studioView = document.getElementById("studio-view");

    if (viewName === "studio") {
        if (homeView) {
            homeView.classList.remove("active");
            homeView.classList.add("hidden");
        }
        if (studioView) {
            studioView.classList.remove("hidden");
            studioView.classList.add("active");
        }
        setTimeout(() => {
            onWindowResize();
            if (controls) controls.update();
            drawAll2DCanvases();
        }, 50);

        if (initialFloor) {
            const floorSelect = document.getElementById("floor-texture-select");
            if (floorSelect) floorSelect.value = initialFloor;
            applyFloorTextureToAllRooms(initialFloor);
        }

        if (promptToLoad) {
            const promptInput = document.getElementById("prompt-input");
            if (promptInput) promptInput.value = promptToLoad;
            generateFloorplan(promptToLoad);
        }
    } else {
        if (isWalkthroughMode) {
            disableWalkthroughMode();
            setActiveViewBtn("view-3d-btn");
        }
        if (studioView) {
            studioView.classList.remove("active");
            studioView.classList.add("hidden");
        }
        if (homeView) {
            homeView.classList.remove("hidden");
            homeView.classList.add("active");
        }
    }
}

// Custom Builder State
const customBuilderState = {
    beds: 2,
    baths: 1,
    kitchen: "modern open kitchen",
    features: ["spacious living room", "master ensuite"],
    floor: "wood"
};

function refreshCustomPromptTextarea() {
    const textarea = document.getElementById("custom-prompt-textarea");
    if (!textarea) return;
    const bedStr = `${customBuilderState.beds} bedroom${customBuilderState.beds > 1 ? "s" : ""}`;
    const bathStr = `${customBuilderState.baths} bathroom${customBuilderState.baths > 1 ? "s" : ""}`;
    const kitStr = customBuilderState.kitchen;
    const featStr = customBuilderState.features.length > 0 ? customBuilderState.features.join(", ") : "";

    const parts = [bedStr, bathStr, kitStr];
    if (featStr) parts.push(featStr);

    textarea.value = parts.join(", ");
}

// Setup UI Event Listeners
function setupEvents() {
    // 1. Navigation & View Switchers
    const navLaunchBtn = document.getElementById("nav-launch-studio-btn");
    if (navLaunchBtn) {
        navLaunchBtn.addEventListener("click", () => switchView("studio"));
    }

    const heroStartBtn = document.getElementById("hero-start-studio-btn");
    if (heroStartBtn) {
        heroStartBtn.addEventListener("click", () => switchView("studio"));
    }

    const backHomeBtn = document.getElementById("back-to-home-btn");
    if (backHomeBtn) {
        backHomeBtn.addEventListener("click", () => switchView("home"));
    }

    // 2. Preset Cards on Home Page
    document.querySelectorAll(".preset-card").forEach(card => {
        card.addEventListener("click", () => {
            const prompt = card.dataset.prompt;
            switchView("studio", prompt);
        });
    });

    // 3. Custom Configurator Pills (Home Page)
    document.querySelectorAll("#bed-pills .choice-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll("#bed-pills .choice-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            customBuilderState.beds = parseInt(pill.dataset.val);
            const valLabel = document.getElementById("builder-bed-val");
            if (valLabel) valLabel.innerText = `${customBuilderState.beds} Bedroom${customBuilderState.beds > 1 ? "s" : ""}`;
            refreshCustomPromptTextarea();
        });
    });

    document.querySelectorAll("#bath-pills .choice-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll("#bath-pills .choice-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            customBuilderState.baths = parseInt(pill.dataset.val);
            const valLabel = document.getElementById("builder-bath-val");
            if (valLabel) valLabel.innerText = `${customBuilderState.baths} Bathroom${customBuilderState.baths > 1 ? "s" : ""}`;
            refreshCustomPromptTextarea();
        });
    });

    document.querySelectorAll("#kit-pills .choice-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll("#kit-pills .choice-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            customBuilderState.kitchen = pill.dataset.val;
            const valLabel = document.getElementById("builder-kit-val");
            if (valLabel) valLabel.innerText = pill.innerText;
            refreshCustomPromptTextarea();
        });
    });

    document.querySelectorAll("#feature-pills .toggle-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const tag = pill.dataset.tag;
            pill.classList.toggle("active");
            if (pill.classList.contains("active")) {
                if (!customBuilderState.features.includes(tag)) customBuilderState.features.push(tag);
            } else {
                customBuilderState.features = customBuilderState.features.filter(f => f !== tag);
            }
            refreshCustomPromptTextarea();
        });
    });

    document.querySelectorAll("#floor-style-pills .choice-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll("#floor-style-pills .choice-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            customBuilderState.floor = pill.dataset.floor;
        });
    });

    document.querySelectorAll(".tag-add-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const insert = btn.dataset.insert;
            const textarea = document.getElementById("custom-prompt-textarea");
            if (textarea) {
                textarea.value = textarea.value.trim() + ", " + insert;
            }
        });
    });

    const launchCustomBtn = document.getElementById("launch-custom-studio-btn");
    if (launchCustomBtn) {
        launchCustomBtn.addEventListener("click", () => {
            const textarea = document.getElementById("custom-prompt-textarea");
            const prompt = textarea ? textarea.value.trim() : "2 bedrooms, 1 bathroom, modern open kitchen";
            switchView("studio", prompt, customBuilderState.floor);
        });
    }

    // 4. Prompt Generate Button & Enter Key (Studio View)
    document.getElementById("generate-btn").addEventListener("click", () => {
        const prompt = document.getElementById("prompt-input").value.trim();
        if (prompt) generateFloorplan(prompt);
    });

    document.getElementById("prompt-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const prompt = e.target.value.trim();
            if (prompt) generateFloorplan(prompt);
        }
    });

    // Preset Pills
    document.querySelectorAll(".preset-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(".preset-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const prompt = pill.dataset.prompt;
            document.getElementById("prompt-input").value = prompt;
            generateFloorplan(prompt);
        });
    });

    // Camera View Modes (Automatically adapts roof transparency in different view modes)
    document.getElementById("view-3d-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-3d-btn");
        if (roofMode === "off" && activeFloorFilter !== "1") roofMode = "solid";
        applyRoofDisplayMode();
        if (roofGroup && activeFloorFilter === "1" && floor2SceneData) roofGroup.visible = false;
        camera.position.set(0, floor2SceneData ? 24 : 18, floor2SceneData ? 26 : 22);
        controls.target.set(0, floor2SceneData ? 2.5 : 1.2, 0);
        controls.update();
    });

    document.getElementById("view-top-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-top-btn");
        // In Top 2D view mode, roof becomes transparent/hidden so all rooms are clear from above
        roofMode = "glass";
        applyRoofDisplayMode();
        if (roofGroup) roofGroup.visible = false;
        camera.position.set(0, 32, 0.01);
        controls.target.set(0, 0, 0);
        controls.update();
    });

    document.getElementById("view-walk-btn").addEventListener("click", () => {
        // In Walkthrough view mode, roof becomes transparent glass so vaulted rafters are visible overhead
        roofMode = "glass";
        applyRoofDisplayMode();
        enableWalkthroughMode(true);
    });

    document.getElementById("exit-walk-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-3d-btn");
        applyRoofDisplayMode();
        if (roofGroup && activeFloorFilter === "1" && floor2SceneData) roofGroup.visible = false;
        camera.position.set(0, floor2SceneData ? 24 : 18, floor2SceneData ? 26 : 22);
        controls.target.set(0, floor2SceneData ? 2.5 : 1.2, 0);
        controls.update();
    });

    // Roof Mode Toggle (Solid -> Transparent -> Off)
    const toggleRoofBtn = document.getElementById("toggle-roof-btn");
    if (toggleRoofBtn) {
        toggleRoofBtn.addEventListener("click", () => cycleRoofMode());
    }

    // Multi-Floor Level Switchers (Both, Level 1, Level 2)
    const btnFloorBoth = document.getElementById("btn-floor-both");
    if (btnFloorBoth) {
        btnFloorBoth.addEventListener("click", () => setFloorViewMode("both"));
    }
    const btnFloor1 = document.getElementById("btn-floor-1");
    if (btnFloor1) {
        btnFloor1.addEventListener("click", () => setFloorViewMode("1"));
    }
    const btnFloor2 = document.getElementById("btn-floor-2");
    if (btnFloor2) {
        btnFloor2.addEventListener("click", () => setFloorViewMode("2"));
    }

    // Blueprint 2D Floor Switcher Tabs
    const bpTabF1 = document.getElementById("bp-tab-f1");
    if (bpTabF1) {
        bpTabF1.addEventListener("click", () => {
            currentBpFloor = 1;
            updateBpFloorTabs();
            drawAll2DCanvases();
        });
    }
    const bpTabF2 = document.getElementById("bp-tab-f2");
    if (bpTabF2) {
        bpTabF2.addEventListener("click", () => {
            currentBpFloor = 2;
            updateBpFloorTabs();
            drawAll2DCanvases();
        });
    }

    // 2nd Floor Custom Architecture Modal Handlers
    const addFloorModal = document.getElementById("add-floor-modal");
    const openAddFloorModalBtn = document.getElementById("open-add-floor-modal-btn");
    const closeFloorModalBtn = document.getElementById("close-floor-modal-btn");
    const cancelFloorModalBtn = document.getElementById("cancel-floor-modal-btn");
    const submitFloor2Btn = document.getElementById("submit-floor2-btn");

    if (openAddFloorModalBtn && addFloorModal) {
        openAddFloorModalBtn.addEventListener("click", () => {
            addFloorModal.classList.remove("hidden");
        });
    }
    if (closeFloorModalBtn && addFloorModal) {
        closeFloorModalBtn.addEventListener("click", () => {
            addFloorModal.classList.add("hidden");
        });
    }
    if (cancelFloorModalBtn && addFloorModal) {
        cancelFloorModalBtn.addEventListener("click", () => {
            addFloorModal.classList.add("hidden");
        });
    }

    // Preset chips in 2nd Floor Modal
    document.querySelectorAll("#add-floor-modal .chip-btn").forEach(chip => {
        chip.addEventListener("click", () => {
            const preset = chip.dataset.preset;
            const promptInput = document.getElementById("floor2-prompt-input");
            if (preset && promptInput) {
                promptInput.value = preset;
            }
        });
    });

    if (submitFloor2Btn) {
        submitFloor2Btn.addEventListener("click", async () => {
            const promptInput = document.getElementById("floor2-prompt-input");
            const promptText = promptInput ? promptInput.value.trim() : "";
            if (!promptText) return;

            const spinner = document.getElementById("floor2-spinner");
            const btnText = submitFloor2Btn.querySelector(".btn-text");

            submitFloor2Btn.disabled = true;
            if (spinner) spinner.classList.remove("hidden");
            if (btnText) btnText.innerText = "Extruding 2nd Floor...";

            const f1Width = (floor1SceneData && floor1SceneData.metadata && floor1SceneData.metadata.world_size)
                ? floor1SceneData.metadata.world_size.width : 16;
            const f1Depth = (floor1SceneData && floor1SceneData.metadata && floor1SceneData.metadata.world_size)
                ? floor1SceneData.metadata.world_size.depth : 13;

            try {
                const response = await fetch("/api/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptText,
                        floor_index: 1,
                        base_y: 2.8,
                        target_width: f1Width,
                        target_depth: f1Depth
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Failed to generate second floor");
                }

                floor2SceneData = data;
                if (addFloorModal) addFloorModal.classList.add("hidden");
                activeFloorFilter = "both";
                buildCombinedMultiFloorScene();

                const hasBalcony = (data.rooms || []).some(r => r.is_outdoor || r.type === "balcony");
                const statusText = document.getElementById("ai-status");
                if (statusText) {
                    statusText.innerText = hasBalcony
                        ? "Level 2 Built • Connecting Stairs & Open Balcony Active"
                        : "Level 2 Built • Connecting Stairs & Upper Rooms Active";
                }

            } catch (err) {
                console.error("Floor 2 error:", err);
                alert("Error generating second floor: " + err.message);
            } finally {
                submitFloor2Btn.disabled = false;
                if (spinner) spinner.classList.add("hidden");
                if (btnText) btnText.innerText = "🏗️ BUILD 2ND FLOOR";
            }
        });
    }

    // Wall Color Picker
    document.getElementById("wall-color-picker").addEventListener("input", (e) => {
        wallMaterial.color.set(e.target.value);
    });

    // Floor Texture Selector (Oak, Walnut Parquet, Ceramic Tile, Polished Concrete, Marble)
    document.getElementById("floor-texture-select").addEventListener("change", (e) => {
        applyFloorTextureToAllRooms(e.target.value);
    });

    // Move Furniture Toggle Mode (Automatically switches roof to transparent so rooms are accessible)
    const furnModeBtn = document.getElementById("furniture-mode-btn");
    furnModeBtn.addEventListener("click", () => {
        isFurnitureMode = !isFurnitureMode;
        furnModeBtn.classList.toggle("active", isFurnitureMode);
        document.getElementById("canvas-container").style.cursor = isFurnitureMode ? "grab" : "default";
        if (isFurnitureMode && roofMode === "solid") {
            roofMode = "glass";
            applyRoofDisplayMode();
        }
    });

    // Add Furniture Catalog Modal Toggle
    const addFurnBtn = document.getElementById("add-furniture-btn");
    const catalogModal = document.getElementById("furniture-catalog-modal");
    const closeCatalogBtn = document.getElementById("close-catalog-btn");

    addFurnBtn.addEventListener("click", () => {
        catalogModal.classList.toggle("hidden");
    });
    closeCatalogBtn.addEventListener("click", () => {
        catalogModal.classList.add("hidden");
    });

    // Spawn Furniture Item on Catalog Click
    document.querySelectorAll(".catalog-item").forEach(item => {
        item.addEventListener("click", () => {
            const type = item.dataset.type;
            const targetFloorIdx = (currentBpFloor === 2 && floor2SceneData) ? 1 : 0;
            const targetBaseY = targetFloorIdx * 2.8;
            const targetPos = isWalkthroughMode ?
                [camera.position.x + Math.sin(walkYaw) * 2, camera.position.z - Math.cos(walkYaw) * 2] :
                [controls.target.x + (Math.random() - 0.5) * 2, controls.target.z + (Math.random() - 0.5) * 2];
            spawnFurniturePiece(type, targetPos[0], targetPos[1], targetBaseY, targetFloorIdx);
            catalogModal.classList.add("hidden");
            // Auto-enable furniture mode so user can immediately reposition it
            isFurnitureMode = true;
            furnModeBtn.classList.add("active");
            if (roofMode === "solid") {
                roofMode = "glass";
                applyRoofDisplayMode();
            }
            drawAll2DCanvases();
        });
    });

    // Toggle 3D Room Name Labels
    const toggleLabelsBtn = document.getElementById("toggle-labels-btn");
    toggleLabelsBtn.addEventListener("click", () => {
        show3DLabels = !show3DLabels;
        toggleLabelsBtn.classList.toggle("active", show3DLabels);
        labelSprites.forEach(s => s.visible = show3DLabels);
    });

    // Reset Camera Center
    document.getElementById("reset-cam-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-3d-btn");
        controls.target.set(0, floor2SceneData ? 2.5 : 1.2, 0);
        camera.position.set(0, floor2SceneData ? 24 : 18, floor2SceneData ? 26 : 22);
        controls.update();
    });

    // Minimize / Expand Live 2D Blueprint Panel
    const minBpBtn = document.getElementById("minimize-bp-btn");
    const bpBody = document.getElementById("live-bp-body");
    minBpBtn.addEventListener("click", () => {
        bpBody.classList.toggle("minimized");
        minBpBtn.innerText = bpBody.classList.contains("minimized") ? "+" : "_";
    });

    // Click on Live 2D Map to Teleport into Clicked Room
    const live2dCanvas = document.getElementById("live-2d-canvas");
    live2dCanvas.addEventListener("click", (e) => {
        if (!currentSceneData || !live2dCanvas._mapTransform) return;
        const rect = live2dCanvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (live2dCanvas.width / rect.width);
        const cy = (e.clientY - rect.top) * (live2dCanvas.height / rect.height);
        const { ox, oy, scale } = live2dCanvas._mapTransform;

        const worldX = (cx - ox) / scale;
        const worldZ = (cy - oy) / scale;
        const clickedRoom = findRoomAtPosition(worldX, worldZ);
        if (clickedRoom) {
            teleportToRoom(clickedRoom);
        }
    });

    // Update 2D player cone when orbiting in 3D
    controls.addEventListener("change", () => {
        if (!isWalkthroughMode) drawAll2DCanvases();
    });

    // Sidebar Toggle
    const sideDrawer = document.getElementById("side-drawer");
    document.getElementById("toggle-sidebar-btn").addEventListener("click", () => {
        sideDrawer.classList.toggle("open");
    });
    document.getElementById("close-drawer-btn").addEventListener("click", () => {
        sideDrawer.classList.remove("open");
    });

    // Export JSON
    document.getElementById("export-json-btn").addEventListener("click", () => {
        const exportPayload = floor2SceneData
            ? { floor1: floor1SceneData, floor2: floor2SceneData }
            : currentSceneData;
        if (!exportPayload) return;
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "visionect_floorplan_3d.json";
        a.click();
    });
}

// Start App with Instant Pre-Compiled Architectural Model (With Proper Door Cutouts & Orientations)
window.addEventListener("DOMContentLoaded", () => {
    init3D();
    setupEvents();

    const initialScene = {
        metadata: {
            name: "Modern 2-Bedroom Residence",
            enhanced_prompt: "Contemporary 2-bedroom layout featuring an open-plan living and dining core, adjacent chef's kitchen, private master bedroom, guest bedroom, and central full bathroom with full doorway connectivity.",
            engine: "Visionect Topological CAD",
            world_size: { width: 16, depth: 13 },
            bounding_box: [-8, 8, -6.5, 6.5],
            total_walls: 18,
            total_rooms: 5,
            total_doors: 4,
            total_windows: 5
        },
        roof: {
            type: "hipped_hut",
            base_y: 2.8,
            height: 2.5,
            overhang: 0.55,
            bounds: [-8, 8, -6.5, 6.5]
        },
        stairs: {
            start: [-7.1, 0.0, -5.4],
            end: [-7.1, 2.8, -2.4],
            num_steps: 14,
            width: 1.1,
            cutout: {
                min_x: -7.75,
                max_x: -6.45,
                min_z: -5.6,
                max_z: -2.2,
                center: [-7.1, 2.8, -3.9],
                size: [1.3, 3.4]
            }
        },
        rooms: [
            { id: "living", name: "Living & Dining", type: "living", center: [-3.5, 0, -3], size: [9, 7], area_sqm: 63, color: "#e2e8f0" },
            { id: "kitchen", name: "Modern Kitchen", type: "kitchen", center: [4.5, 0, -3], size: [7, 7], area_sqm: 49, color: "#cbd5e1" },
            { id: "bed1", name: "Master Bedroom", type: "bedroom", center: [-5, 0, 3.5], size: [6, 6], area_sqm: 36, color: "#bfdbfe" },
            { id: "bath1", name: "Full Bathroom", type: "bathroom", center: [0, 0, 3.5], size: [4, 6], area_sqm: 24, color: "#f1f5f9" },
            { id: "bed2", name: "Guest Bedroom", type: "bedroom", center: [5, 0, 3.5], size: [6, 6], area_sqm: 36, color: "#dbeafe" }
        ],
        walls: [
            // Outer perimeter walls (Carving window sill, window lintel, and Main Entrance Door openings!)
            // North wall (z = -6.5) with window 1 [-4.3 to -2.7], Main Entrance Door [-1.72 to -0.48], and window 2 [3.7 to 5.3]
            { id: 1, start: [-8, 0, -6.5], end: [-4.3, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 2, start: [-4.3, 0, -6.5], end: [-2.7, 0, -6.5], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 1 sill
            { id: 3, start: [-4.3, 0, -6.5], end: [-2.7, 0, -6.5], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true }, // window 1 lintel
            { id: 4, start: [-2.7, 0, -6.5], end: [-1.72, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 32, start: [-1.72, 0, -6.5], end: [-0.48, 0, -6.5], base_y: 2.1, thickness: 0.2, height: 0.7, is_exterior: true, is_lintel: true }, // Main Entrance Door lintel
            { id: 33, start: [-0.48, 0, -6.5], end: [3.7, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 5, start: [3.7, 0, -6.5], end: [5.3, 0, -6.5], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 2 sill
            { id: 6, start: [3.7, 0, -6.5], end: [5.3, 0, -6.5], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true }, // window 2 lintel
            { id: 7, start: [5.3, 0, -6.5], end: [8, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },

            // South wall (z = 6.5) with 2 window openings: [-5.75 to -4.25] and [4.25 to 5.75]
            { id: 8, start: [-8, 0, 6.5], end: [-5.75, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 9, start: [-5.75, 0, 6.5], end: [-4.25, 0, 6.5], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 3 sill
            { id: 10, start: [-5.75, 0, 6.5], end: [-4.25, 0, 6.5], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true },
            { id: 11, start: [-4.25, 0, 6.5], end: [4.25, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 12, start: [4.25, 0, 6.5], end: [5.75, 0, 6.5], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 4 sill
            { id: 13, start: [4.25, 0, 6.5], end: [5.75, 0, 6.5], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true },
            { id: 14, start: [5.75, 0, 6.5], end: [8, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },

            // West perimeter wall
            { id: 15, start: [-8, 0, -6.5], end: [-8, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },

            // East perimeter wall (x = 8) with window opening at z = -3 [-3.75 to -2.25]
            { id: 16, start: [8, 0, -6.5], end: [8, 0, -3.75], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 17, start: [8, 0, -3.75], end: [8, 0, -2.25], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 5 sill
            { id: 18, start: [8, 0, -3.75], end: [8, 0, -2.25], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true },
            { id: 19, start: [8, 0, -2.25], end: [8, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },

            // Interior Living-Kitchen vertical wall with doorway cutout at z = -3
            { id: 20, start: [1, 0, -6.5], end: [1, 0, -3.52], base_y: 0, thickness: 0.2, height: 2.8 },
            { id: 21, start: [1, 0, -3.52], end: [1, 0, -2.48], base_y: 2.1, thickness: 0.2, height: 0.7, is_lintel: true },
            { id: 22, start: [1, 0, -2.48], end: [1, 0, 0.5], base_y: 0, thickness: 0.2, height: 2.8 },

            // Central horizontal spine wall (z = 0.5) with 3 doorway cutouts into Bed1 (x=-5), Bath (x=0), Bed2 (x=5)
            { id: 23, start: [-8, 0, 0.5], end: [-5.52, 0, 0.5], base_y: 0, thickness: 0.2, height: 2.8 },
            { id: 24, start: [-5.52, 0, 0.5], end: [-4.48, 0, 0.5], base_y: 2.1, thickness: 0.2, height: 0.7, is_lintel: true },
            { id: 25, start: [-4.48, 0, 0.5], end: [-0.52, 0, 0.5], base_y: 0, thickness: 0.2, height: 2.8 },
            { id: 26, start: [-0.52, 0, 0.5], end: [0.52, 0, 0.5], base_y: 2.1, thickness: 0.2, height: 0.7, is_lintel: true },
            { id: 27, start: [0.52, 0, 0.5], end: [4.48, 0, 0.5], base_y: 0, thickness: 0.2, height: 2.8 },
            { id: 28, start: [4.48, 0, 0.5], end: [5.52, 0, 0.5], base_y: 2.1, thickness: 0.2, height: 0.7, is_lintel: true },
            { id: 29, start: [5.52, 0, 0.5], end: [8, 0, 0.5], base_y: 0, thickness: 0.2, height: 2.8 },

            // Partitions between Bed1, Bath, Bed2
            { id: 30, start: [-2, 0, 0.5], end: [-2, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8 },
            { id: 31, start: [2, 0, 0.5], end: [2, 0, 6.5], base_y: 0, thickness: 0.2, height: 2.8 }
        ],
        doors: [
            {
                id: "main_entrance_door", name: "Main Entrance", is_main_entrance: true,
                pos: [-1.1, 0, -6.5], orientation: "horizontal", width: 1.2, height: 2.15,
                roomA: { id: "exterior_porch", name: "Front Porch (Exterior)", center: [-1.1, 0, -9.0] },
                roomB: { id: "living", name: "Living & Dining", center: [-3.5, 0, -3] }
            },
            {
                id: "door_1", pos: [1, 0, -3], orientation: "vertical", width: 1.0, height: 2.1,
                roomA: { id: "living", name: "Living & Dining", center: [-3.5, 0, -3] },
                roomB: { id: "kitchen", name: "Modern Kitchen", center: [4.5, 0, -3] }
            },
            {
                id: "door_2", pos: [-5, 0, 0.5], orientation: "horizontal", width: 1.0, height: 2.1,
                roomA: { id: "living", name: "Living & Dining", center: [-3.5, 0, -3] },
                roomB: { id: "bed1", name: "Master Bedroom", center: [-5, 0, 3.5] }
            },
            {
                id: "door_3", pos: [0, 0, 0.5], orientation: "horizontal", width: 1.0, height: 2.1,
                roomA: { id: "living", name: "Living & Dining", center: [-3.5, 0, -3] },
                roomB: { id: "bath1", name: "Full Bathroom", center: [0, 0, 3.5] }
            },
            {
                id: "door_4", pos: [5, 0, 0.5], orientation: "horizontal", width: 1.0, height: 2.1,
                roomA: { id: "kitchen", name: "Modern Kitchen", center: [4.5, 0, -3] },
                roomB: { id: "bed2", name: "Guest Bedroom", center: [5, 0, 3.5] }
            }
        ],
        windows: [
            { pos: [-3.5, 1.0, -6.5], orientation: "horizontal", width: 1.6, height: 1.2 },
            { pos: [4.5, 1.0, -6.5], orientation: "horizontal", width: 1.6, height: 1.2 },
            { pos: [-5, 1.0, 6.5], orientation: "horizontal", width: 1.5, height: 1.2 },
            { pos: [5, 1.0, 6.5], orientation: "horizontal", width: 1.5, height: 1.2 },
            { pos: [8, 1.0, -3], orientation: "vertical", width: 1.5, height: 1.2 }
        ]
    };

    floor1SceneData = initialScene;
    buildCombinedMultiFloorScene();

    if (window.location.search.includes("view=studio") || window.location.hash === "#studio") {
        switchView("studio");
    }
});
