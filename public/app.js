// Visionect Interactive 3D Architectural Web Studio
// Final Product: Direct Topological Grid -> 3D Extrusion, Live 2D Named Map, WASD Walkthrough & Interactive Doors

let scene, camera, renderer, controls;
let currentSceneData = null;
let wallMaterial;
let currentFloorType = "wood";
let show3DLabels = true;

const wallMeshes = [];
const furnitureMeshes = [];
const floorMeshes = [];
const doorObjects = [];     // Interactive door assemblies for raycasting & animation
const doorInteractables = []; // Meshes that raycaster checks for door clicks
const labelSprites = [];

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
    const roughnessMap = { wood: 0.45, darkwood: 0.4, tile: 0.2, concrete: 0.65, marble: 0.15 };

    floorMeshes.forEach(mesh => {
        const rmSize = mesh.userData.roomSize || [6, 6];
        const clonedTex = baseTex.clone();
        clonedTex.needsUpdate = true;
        clonedTex.repeat.set(Math.max(1, rmSize[0] / 2.5), Math.max(1, rmSize[1] / 2.5));
        mesh.material.map = clonedTex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.roughness = roughnessMap[type] || 0.5;
        mesh.material.needsUpdate = true;
    });
}

// Create 3D Floating Label Sprite for Room Name & Area
function createRoomLabelSprite(rm) {
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
    sprite.position.set(rm.center[0], 3.25, rm.center[2]);
    sprite.scale.set(3.4, 0.93, 1);
    sprite.visible = show3DLabels;
    sprite.userData.type = "label";
    return sprite;
}

// Clear Existing 3D Objects
function clearScene() {
    wallMeshes.forEach(m => scene.remove(m));
    wallMeshes.length = 0;

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

    const toRemove = [];
    scene.traverse(obj => {
        if (obj.userData && (obj.userData.type === "door" || obj.userData.type === "window" || obj.userData.type === "grid" || obj.userData.type === "label")) {
            toRemove.push(obj);
        }
    });
    toRemove.forEach(obj => scene.remove(obj));
}

// Build 3D Asset from API Scene Data
function build3DScene(data) {
    clearScene();
    currentSceneData = data;

    const width = data.metadata.world_size.width;
    const depth = data.metadata.world_size.depth;

    // 1. Base Ground Grid (Carbon Charcoal)
    const gridHelper = new THREE.GridHelper(Math.max(width, depth) + 14, 34, 0x27272a, 0x18181b);
    gridHelper.position.y = -0.02;
    gridHelper.userData.type = "grid";
    scene.add(gridHelper);

    // 2. Extrude Room Floors, 3D Furniture & 3D Floating Name Labels
    data.rooms.forEach(rm => {
        const floorGeo = new THREE.PlaneGeometry(rm.size[0] - 0.04, rm.size[1] - 0.04);
        const rmFloorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.45
        });

        const floorMesh = new THREE.Mesh(floorGeo, rmFloorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(rm.center[0], 0.01, rm.center[2]);
        floorMesh.receiveShadow = true;
        floorMesh.userData.roomSize = rm.size;
        floorMesh.userData.roomData = rm;
        scene.add(floorMesh);
        floorMeshes.push(floorMesh);

        // Add 3D Furniture inside the room
        addRoomFurniture(rm);

        // Add 3D Room Name Label Sprite
        const labelSprite = createRoomLabelSprite(rm);
        scene.add(labelSprite);
        labelSprites.push(labelSprite);
    });

    // Apply currently selected floor texture to all room floors
    applyFloorTextureToAllRooms(currentFloorType);

    // 3. Extrude 3D Walls (Including Lintel Headers Above Doorways!)
    data.walls.forEach(w => {
        const dx = w.end[0] - w.start[0];
        const dz = w.end[2] - w.start[2];
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.05) return;

        const baseY = w.base_y || 0.0;
        const wallH = w.height || 2.8;

        const wallGeo = new THREE.BoxGeometry(length, wallH, w.thickness || 0.2);
        const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;

        wallMesh.position.set(
            (w.start[0] + w.end[0]) / 2,
            baseY + wallH / 2,
            (w.start[2] + w.end[2]) / 2
        );

        const angle = Math.atan2(dz, dx);
        wallMesh.rotation.y = -angle;

        scene.add(wallMesh);
        wallMeshes.push(wallMesh);
    });

    // 4. Build Properly Aligned & Interactive 3D Doors
    (data.doors || []).forEach((d, idx) => {
        buildDoorAssembly(d, idx);
    });

    // 5. Build Properly Aligned 3D Exterior Windows
    (data.windows || []).forEach(w => {
        buildWindowAssembly(w);
    });

    // Update Stats, Sidebar & Live 2D Named Blueprint Map
    updateStatsAndSidebar(data);
    drawAll2DCanvases();

    // Reset camera nicely if in 3D Orbit mode
    if (!isWalkthroughMode) {
        controls.target.set(0, 1.2, 0);
        camera.position.set(0, Math.max(width, depth) * 1.25, Math.max(width, depth) * 1.35);
        controls.update();
    } else {
        // Place user in the first room (Living room) at eye level
        const startRoom = data.rooms[0];
        if (startRoom) {
            camera.position.set(startRoom.center[0], 1.65, startRoom.center[2]);
            updateWalkthroughCameraTarget();
        }
    }
}

// Build Realistic 3D Door Assembly with Frame, Hinged Leaf & Handles
function buildDoorAssembly(d, idx) {
    const doorW = d.width || 1.0;
    const doorH = d.height || 2.1;
    const isVert = (d.orientation === "vertical");

    const group = new THREE.Group();
    group.position.set(d.pos[0], 0, d.pos[2]);
    // If wall is vertical (runs along Z axis), rotate door assembly by 90 deg (Math.PI / 2)
    group.rotation.y = isVert ? Math.PI / 2 : 0;
    group.userData.type = "door";

    // Door Frame (Dark Architectural Trim)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, 0.24), frameMat);
    leftJamb.position.set(-doorW / 2 + 0.03, doorH / 2, 0);
    group.add(leftJamb);

    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, 0.24), frameMat);
    rightJamb.position.set(doorW / 2 - 0.03, doorH / 2, 0);
    group.add(rightJamb);

    const topJamb = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.06, 0.24), frameMat);
    topJamb.position.set(0, doorH - 0.03, 0);
    group.add(topJamb);

    // Hinged Door Pivot at Left Edge
    const pivot = new THREE.Group();
    pivot.position.set(-doorW / 2 + 0.05, 0, 0);
    // Slightly ajar by 15 degrees so user clearly sees it's a swinging door
    pivot.rotation.y = 0.22;

    // Warm Wooden Door Panel
    const panelW = doorW - 0.1;
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0xb45309,
        roughness: 0.4,
        metalness: 0.05
    });
    const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorH - 0.06, 0.06), panelMat);
    panelMesh.position.set(panelW / 2, doorH / 2 - 0.02, 0);
    panelMesh.castShadow = true;
    pivot.add(panelMesh);

    // Brass Door Handles on Both Sides
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.85, roughness: 0.2 });
    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.16), handleMat);
    handleBar.position.set(panelW - 0.12, 1.0, 0);
    pivot.add(handleBar);

    group.add(pivot);
    scene.add(group);

    // Register door object for click-to-open & room transition
    const doorRecord = {
        id: d.id || `door_${idx + 1}`,
        data: d,
        group,
        pivot,
        panelMesh,
        isOpen: false,
        targetRotation: 0.22
    };
    panelMesh.userData.doorRecord = doorRecord;
    leftJamb.userData.doorRecord = doorRecord;
    rightJamb.userData.doorRecord = doorRecord;

    doorObjects.push(doorRecord);
    doorInteractables.push(panelMesh, leftJamb, rightJamb);
}

// Build Properly Aligned 3D Exterior Window Assembly
function buildWindowAssembly(w) {
    const winW = w.width || 1.5;
    const winH = w.height || 1.2;
    const baseY = w.pos[1] || 1.0;
    const isVert = (w.orientation === "vertical");

    const group = new THREE.Group();
    group.position.set(w.pos[0], baseY + winH / 2, w.pos[2]);
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

    // Ultra-Clear Architectural Glass Pane (Transparent, Physical Glass)
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
function spawnFurniturePiece(type, posX = 0, posZ = 0) {
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

    group.position.set(posX, 0, posZ);
    return group;
}

// Dynamic Furniture Placer based on Room Type
function addRoomFurniture(rm) {
    const cx = rm.center[0];
    const cz = rm.center[2];

    if (rm.type.includes("bedroom")) {
        spawnFurniturePiece("bed", cx, cz);
    } else if (rm.type.includes("living")) {
        spawnFurniturePiece("sofa", cx, cz - 0.5);
        spawnFurniturePiece("table", cx, cz + 0.65);
    } else if (rm.type.includes("kitchen")) {
        spawnFurniturePiece("counter", cx, cz - rm.size[1] * 0.25);
    } else if (rm.type.includes("bathroom")) {
        spawnFurniturePiece("tub", cx, cz);
    }
}

// Determine which room a point (x, z) is inside
function findRoomAtPosition(x, z) {
    if (!currentSceneData || !currentSceneData.rooms) return null;
    for (const rm of currentSceneData.rooms) {
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

    // Activate Walkthrough mode automatically or transition camera smoothly inside the room
    if (!isWalkthroughMode) {
        enableWalkthroughMode(false);
    }

    // Smoothly walk from current position through the doorway into the target room center
    const startPos = camera.position.clone();
    const midPos = new THREE.Vector3(doorPos[0], 1.65, doorPos[2]);
    const endPos = new THREE.Vector3(targetCenter[0], 1.65, targetCenter[2]);

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
    if (isWalkthroughMode) {
        camera.position.set(rm.center[0], 1.65, rm.center[2]);
        updateWalkthroughCameraTarget();
        document.getElementById("current-room-label").innerText = rm.name;
    } else {
        controls.target.set(rm.center[0], 1.0, rm.center[2]);
        camera.position.set(rm.center[0], 11, rm.center[2] + 9);
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

    if (resetPosition && currentSceneData && currentSceneData.rooms.length > 0) {
        const startRm = currentSceneData.rooms[0];
        camera.position.set(startRm.center[0], 1.65, startRm.center[2]);
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
        camera.position.y = 1.65;
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
            camera.position.y = 1.65;

            updateWalkthroughCameraTarget();

            // Update current room badge
            const curRm = findRoomAtPosition(camera.position.x, camera.position.z);
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
    if (!currentSceneData) return;
    draw2DBlueprintOnCanvas(document.getElementById("live-2d-canvas"), currentSceneData, true);
    draw2DBlueprintOnCanvas(document.getElementById("cad-canvas"), currentSceneData, true);
}

function draw2DBlueprintOnCanvas(canvas, data, showPlayer) {
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const worldW = Math.max(data.metadata.world_size.width, 8);
    const worldD = Math.max(data.metadata.world_size.depth, 8);
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
        bathroom: "rgba(34, 197, 94, 0.12)"
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

        // Room Name & Dimensions Label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(rm.name, rx + rw / 2, ry + rh / 2 - 3);

        ctx.fillStyle = "#a1a1aa";
        ctx.font = "9px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(`${rm.size[0]}m × ${rm.size[1]}m`, rx + rw / 2, ry + rh / 2 + 10);
    });

    // 3. Draw Structural Walls (Skipping lintels so doorway openings show clearly on 2D map!)
    ctx.strokeStyle = "#f4f4f5";
    ctx.lineWidth = 2.8;
    data.walls.forEach(wall => {
        if (wall.base_y && wall.base_y > 0.5) return; // Don't draw overhead lintel over doorway gap
        const x1 = ox + wall.start[0] * scale;
        const y1 = oy + wall.start[2] * scale;
        const x2 = ox + wall.end[0] * scale;
        const y2 = oy + wall.end[2] * scale;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });

    // 4. Draw Windows (Crisp Platinum Bars on Exterior Walls)
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

    // 5. Draw Doors (Flame Orange Architectural Door Leaf + Swing Arc)
    ctx.strokeStyle = "#ff5a1f";
    ctx.lineWidth = 2;
    (data.doors || []).forEach(d => {
        const dx = ox + d.pos[0] * scale;
        const dy = oy + d.pos[2] * scale;
        const r = Math.max(d.width * scale * 0.48, 6);

        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI / 2);
        ctx.stroke();

        ctx.fillStyle = "#ff5a1f";
        ctx.beginPath();
        ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    // 6. Draw Furniture Pieces on 2D Blueprint
    furnitureMeshes.forEach(fGroup => {
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

        // 2. Build 3D Scene & 2D Named Map
        build3DScene(data);

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

    // Camera View Modes
    document.getElementById("view-3d-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-3d-btn");
        camera.position.set(0, 18, 22);
        controls.target.set(0, 1.2, 0);
        controls.update();
    });

    document.getElementById("view-top-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-top-btn");
        camera.position.set(0, 30, 0.01);
        controls.target.set(0, 0, 0);
        controls.update();
    });

    document.getElementById("view-walk-btn").addEventListener("click", () => {
        enableWalkthroughMode(true);
    });

    document.getElementById("exit-walk-btn").addEventListener("click", () => {
        disableWalkthroughMode();
        setActiveViewBtn("view-3d-btn");
        camera.position.set(0, 18, 22);
        controls.target.set(0, 1.2, 0);
        controls.update();
    });

    // Wall Color Picker
    document.getElementById("wall-color-picker").addEventListener("input", (e) => {
        wallMaterial.color.set(e.target.value);
    });

    // Floor Texture Selector (Oak, Walnut Parquet, Ceramic Tile, Polished Concrete, Marble)
    document.getElementById("floor-texture-select").addEventListener("change", (e) => {
        applyFloorTextureToAllRooms(e.target.value);
    });

    // Move Furniture Toggle Mode
    const furnModeBtn = document.getElementById("furniture-mode-btn");
    furnModeBtn.addEventListener("click", () => {
        isFurnitureMode = !isFurnitureMode;
        furnModeBtn.classList.toggle("active", isFurnitureMode);
        document.getElementById("canvas-container").style.cursor = isFurnitureMode ? "grab" : "default";
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
            const targetPos = isWalkthroughMode ?
                [camera.position.x + Math.sin(walkYaw) * 2, camera.position.z - Math.cos(walkYaw) * 2] :
                [controls.target.x + (Math.random() - 0.5) * 2, controls.target.z + (Math.random() - 0.5) * 2];
            spawnFurniturePiece(type, targetPos[0], targetPos[1]);
            catalogModal.classList.add("hidden");
            // Auto-enable furniture mode so user can immediately reposition it
            isFurnitureMode = true;
            furnModeBtn.classList.add("active");
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
        controls.target.set(0, 1.2, 0);
        camera.position.set(0, 18, 22);
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
        if (!currentSceneData) return;
        const blob = new Blob([JSON.stringify(currentSceneData, null, 2)], { type: "application/json" });
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
            total_walls: 18,
            total_rooms: 5,
            total_doors: 4,
            total_windows: 5
        },
        rooms: [
            { id: "living", name: "Living & Dining", type: "living", center: [-3.5, 0, -3], size: [9, 7], area_sqm: 63, color: "#e2e8f0" },
            { id: "kitchen", name: "Modern Kitchen", type: "kitchen", center: [4.5, 0, -3], size: [7, 7], area_sqm: 49, color: "#cbd5e1" },
            { id: "bed1", name: "Master Bedroom", type: "bedroom", center: [-5, 0, 3.5], size: [6, 6], area_sqm: 36, color: "#bfdbfe" },
            { id: "bath1", name: "Full Bathroom", type: "bathroom", center: [0, 0, 3.5], size: [4, 6], area_sqm: 24, color: "#f1f5f9" },
            { id: "bed2", name: "Guest Bedroom", type: "bedroom", center: [5, 0, 3.5], size: [6, 6], area_sqm: 36, color: "#dbeafe" }
        ],
        walls: [
            // Outer perimeter walls (Carving window sill and lintel openings so glass is 100% transparent through walls!)
            // North wall (z = -6.5) with 2 window openings: [-4.3 to -2.7] and [3.7 to 5.3]
            { id: 1, start: [-8, 0, -6.5], end: [-4.3, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
            { id: 2, start: [-4.3, 0, -6.5], end: [-2.7, 0, -6.5], base_y: 0, thickness: 0.2, height: 1.0, is_exterior: true }, // window 1 sill
            { id: 3, start: [-4.3, 0, -6.5], end: [-2.7, 0, -6.5], base_y: 2.2, thickness: 0.2, height: 0.6, is_exterior: true, is_lintel: true }, // window 1 lintel
            { id: 4, start: [-2.7, 0, -6.5], end: [3.7, 0, -6.5], base_y: 0, thickness: 0.2, height: 2.8, is_exterior: true },
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

    build3DScene(initialScene);
});
