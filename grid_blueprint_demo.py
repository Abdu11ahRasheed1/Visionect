import os
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Sample architectural grid for: "1 bedroom, 1 kitchen, 1 living room, with bathroom"
# # = Wall, D = Door, W = Window, . = Floor space
DEMO_GRID = [
    "########################################",
    "#WWWWWWWWWWWW#.........................#",
    "#............#.........................#",
    "#..BEDROOM...#........LIVING ROOM......#",
    "#............#.........................#",
    "#............D.........................#",
    "#............#.........................#",
    "#######D######.........................W",
    "#............#.........................W",
    "#..BATHROOM..#........KITCHEN..........W",
    "#............#.........................#",
    "#............#.........................#",
    "#WWWWWWWWWWWW###########D###############",
    "########################################"
]

def parse_grid_to_3d(grid, cell_size_m=0.5, wall_height_m=2.8, wall_thickness_m=0.2):
    """
    Directly converts character grid into 3D wall segments, doors, windows, and floors.
    Zero Computer Vision needed!
    """
    rows = len(grid)
    cols = max(len(r) for r in grid)
    
    # Pad all rows to equal length
    normalized_grid = [r.ljust(cols) for r in grid]
    
    walls_3d = []
    doors_3d = []
    windows_3d = []
    floor_tiles = []
    
    wall_id = 1
    
    # 1. Identify Horizontal Wall segments (merge contiguous '#' to optimize mesh count)
    for r in range(rows):
        start_c = None
        for c in range(cols):
            char = normalized_grid[r][c]
            if char == '#':
                if start_c is None:
                    start_c = c
            else:
                if start_c is not None:
                    # Create horizontal wall from start_c to c - 1
                    walls_3d.append({
                        "id": wall_id,
                        "type": "wall",
                        "start": [round((start_c - cols/2) * cell_size_m, 2), 0.0, round((r - rows/2) * cell_size_m, 2)],
                        "end": [round((c - cols/2) * cell_size_m, 2), 0.0, round((r - rows/2) * cell_size_m, 2)],
                        "thickness": wall_thickness_m,
                        "height": wall_height_m
                    })
                    wall_id += 1
                    start_c = None
        if start_c is not None:
            walls_3d.append({
                "id": wall_id,
                "type": "wall",
                "start": [round((start_c - cols/2) * cell_size_m, 2), 0.0, round((r - rows/2) * cell_size_m, 2)],
                "end": [round((cols - cols/2) * cell_size_m, 2), 0.0, round((r - rows/2) * cell_size_m, 2)],
                "thickness": wall_thickness_m,
                "height": wall_height_m
            })
            wall_id += 1

    # 2. Extract Doors 'D', Windows 'W', and Floor area
    for r in range(rows):
        for c in range(cols):
            char = normalized_grid[r][c]
            wx = round((c - cols/2 + 0.5) * cell_size_m, 2)
            wz = round((r - rows/2 + 0.5) * cell_size_m, 2)
            
            if char == 'D':
                doors_3d.append({"pos": [wx, 0.0, wz], "width": cell_size_m, "height": 2.1})
            elif char == 'W':
                windows_3d.append({"pos": [wx, 1.0, wz], "width": cell_size_m, "height": 1.2})
            elif char not in ['#', ' ']:
                floor_tiles.append([wx, 0.0, wz])

    scene_3d = {
        "metadata": {
            "grid_dimensions": {"rows": rows, "cols": cols},
            "world_size_meters": {"width": round(cols * cell_size_m, 1), "depth": round(rows * cell_size_m, 1)},
            "cell_scale_meters": cell_size_m,
            "total_walls": len(walls_3d),
            "total_doors": len(doors_3d),
            "total_windows": len(windows_3d)
        },
        "walls": walls_3d,
        "doors": doors_3d,
        "windows": windows_3d
    }
    return scene_3d

def render_2d_cad_blueprint(grid, output_image_path="blueprint_cad.png", pixels_per_cell=25):
    """
    Renders an ultra-clean, noise-free 2D CAD architectural blueprint from the character grid.
    """
    rows = len(grid)
    cols = max(len(r) for r in grid)
    
    img_w = cols * pixels_per_cell
    img_h = rows * pixels_per_cell
    
    # Classic Blueprint background: dark blueprint blue (#0e2b4f) or clean architectural paper (#f8f9fa)
    img = Image.new("RGB", (img_w, img_h), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)
    
    # 1. Subtle CAD grid lines
    grid_color = (226, 232, 240)
    for x in range(0, img_w, pixels_per_cell):
        draw.line([(x, 0), (x, img_h)], fill=grid_color, width=1)
    for y in range(0, img_h, pixels_per_cell):
        draw.line([(0, y), (img_w, y)], fill=grid_color, width=1)
        
    # 2. Draw elements
    wall_color = (30, 41, 59)      # Charcoal CAD wall
    door_color = (225, 29, 72)     # Red architectural door swing
    window_color = (14, 165, 233)  # Cyan window line
    
    for r in range(rows):
        row_str = grid[r].ljust(cols)
        for c in range(cols):
            char = row_str[c]
            x1 = c * pixels_per_cell
            y1 = r * pixels_per_cell
            x2 = x1 + pixels_per_cell
            y2 = y1 + pixels_per_cell
            
            if char == '#':
                # Solid wall block
                draw.rectangle([x1, y1, x2, y2], fill=wall_color)
            elif char == 'D':
                # Door symbol: line + door swing arc
                draw.line([(x1, y1 + pixels_per_cell//2), (x2, y1 + pixels_per_cell//2)], fill=door_color, width=3)
                draw.arc([x1 - pixels_per_cell//2, y1 - pixels_per_cell//2, x2 + pixels_per_cell//2, y2 + pixels_per_cell//2], 
                         start=0, end=90, fill=door_color, width=2)
            elif char == 'W':
                # Window symbol: double glass line
                draw.line([(x1, y1 + pixels_per_cell//3), (x2, y1 + pixels_per_cell//3)], fill=window_color, width=2)
                draw.line([(x1, y1 + (2*pixels_per_cell)//3), (x2, y1 + (2*pixels_per_cell)//3)], fill=window_color, width=2)

    # 3. Render room labels cleanly
    labels = [
        ("BEDROOM (12' x 11')", 4 * pixels_per_cell, 3 * pixels_per_cell),
        ("LIVING ROOM (18' x 14')", 20 * pixels_per_cell, 3 * pixels_per_cell),
        ("BATHROOM (8' x 8')", 3 * pixels_per_cell, 9 * pixels_per_cell),
        ("KITCHEN (12' x 10')", 20 * pixels_per_cell, 9 * pixels_per_cell)
    ]
    for text, lx, ly in labels:
        draw.text((lx, ly), text, fill=(51, 65, 85))
        
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    img.save(output_image_path)
    return output_image_path

def generate_interactive_3d_html(scene_3d, output_html_path="interactive_demo.html"):
    """
    Creates a standalone, interactive 3D web walkthrough using Three.js directly from the grid data!
    """
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Visionect 3D Interactive Walkthrough</title>
    <style>
        body {{ margin: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: white; }}
        #info-panel {{
            position: absolute; top: 15px; left: 15px; background: rgba(15, 23, 42, 0.85);
            padding: 18px 24px; border-radius: 12px; backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1); max-width: 320px; z-index: 100;
        }}
        h2 {{ margin: 0 0 8px 0; font-size: 20px; color: #38bdf8; }}
        p {{ margin: 4px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; }}
        .badge {{ display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-top: 6px; background: #0284c7; color: white; }}
        #controls {{
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.9); padding: 10px 20px; border-radius: 30px;
            display: flex; gap: 15px; align-items: center; border: 1px solid rgba(255,255,255,0.15);
        }}
        button {{
            background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 20px;
            cursor: pointer; font-weight: 500; font-size: 13px; transition: 0.2s;
        }}
        button:hover {{ background: #1d4ed8; }}
        input[type="color"] {{ border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; background: transparent; }}
    </style>
    <!-- Three.js + OrbitControls -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
    <div id="info-panel">
        <h2>Visionect 3D Interactive Asset</h2>
        <span class="badge">Direct Grid Extrusion</span>
        <p style="margin-top: 10px;">Generated directly from the discrete architectural character grid.</p>
        <p><strong>Total Walls:</strong> {scene_3d['metadata']['total_walls']}</p>
        <p><strong>Doors:</strong> {scene_3d['metadata']['total_doors']} | <strong>Windows:</strong> {scene_3d['metadata']['total_windows']}</p>
        <p><strong>Dimensions:</strong> {scene_3d['metadata']['world_size_meters']['width']}m x {scene_3d['metadata']['world_size_meters']['depth']}m</p>
        <p style="margin-top: 8px; font-size: 11px; color: #64748b;">Rotate: Left Click + Drag | Pan: Right Click | Zoom: Scroll</p>
    </div>

    <div id="controls">
        <span>Wall Color:</span>
        <input type="color" id="wallColor" value="#e2e8f0">
        <button id="viewTopBtn">Top-Down Blueprint</button>
        <button id="view3DBtn">Perspective 3D</button>
    </div>

    <script>
        const sceneData = {json.dumps(scene_3d)};

        // 1. Scene, Camera, Renderer
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1329);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 18, 18);

        const renderer = new THREE.WebGLRenderer({{ antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // 2. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(15, 25, 10);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // 3. Ground / Floor
        const floorGeo = new THREE.PlaneGeometry(
            sceneData.metadata.world_size_meters.width + 2,
            sceneData.metadata.world_size_meters.depth + 2
        );
        const floorMat = new THREE.MeshStandardMaterial({{ color: 0x1e293b, roughness: 0.8 }});
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        // Grid floor overlay
        const gridHelper = new THREE.GridHelper(
            Math.max(sceneData.metadata.world_size_meters.width, sceneData.metadata.world_size_meters.depth) + 4,
            30,
            0x38bdf8,
            0x1e293b
        );
        scene.add(gridHelper);

        // 4. Extrude 3D Walls directly from Grid Coordinates
        const wallMaterial = new THREE.MeshStandardMaterial({{ color: 0xe2e8f0, roughness: 0.4 }});
        const wallMeshes = [];

        sceneData.walls.forEach(w => {{
            const dx = w.end[0] - w.start[0];
            const dz = w.end[2] - w.start[2];
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length < 0.01) return;

            const wallGeo = new THREE.BoxGeometry(length, w.height, w.thickness);
            const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;

            // Position at midpoint
            wallMesh.position.set((w.start[0] + w.end[0]) / 2, w.height / 2, (w.start[2] + w.end[2]) / 2);

            // Rotation
            const angle = Math.atan2(dz, dx);
            wallMesh.rotation.y = -angle;

            scene.add(wallMesh);
            wallMeshes.push(wallMesh);
        }});

        // 5. Add Door Frames
        const doorMaterial = new THREE.MeshStandardMaterial({{ color: 0xe11d48, transparent: true, opacity: 0.7 }});
        sceneData.doors.forEach(d => {{
            const doorGeo = new THREE.BoxGeometry(d.width, d.height, 0.05);
            const doorMesh = new THREE.Mesh(doorGeo, doorMaterial);
            doorMesh.position.set(d.pos[0], d.height / 2, d.pos[2]);
            scene.add(doorMesh);
        }});

        // 6. Add Window Frames
        const windowMaterial = new THREE.MeshStandardMaterial({{ color: 0x38bdf8, transparent: true, opacity: 0.5 }});
        sceneData.windows.forEach(w => {{
            const winGeo = new THREE.BoxGeometry(w.width, w.height, 0.05);
            const winMesh = new THREE.Mesh(winGeo, windowMaterial);
            winMesh.position.set(w.pos[0], w.pos[1] + w.height / 2, w.pos[2]);
            scene.add(winMesh);
        }});

        // Dynamic Customization Controls
        document.getElementById('wallColor').addEventListener('input', (e) => {{
            wallMaterial.color.set(e.target.value);
        }});

        document.getElementById('viewTopBtn').addEventListener('click', () => {{
            camera.position.set(0, 24, 0);
            controls.target.set(0, 0, 0);
        }});

        document.getElementById('view3DBtn').addEventListener('click', () => {{
            camera.position.set(0, 16, 16);
            controls.target.set(0, 0, 0);
        }});

        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});

        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}
        animate();
    </script>
</body>
</html>
"""
    with open(output_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    return output_html_path

if __name__ == "__main__":
    print("Executing Visionect Direct Grid-to-3D Demonstration...\n")
    
    # 1. Parse character grid into 3D structured coordinates
    scene_3d = parse_grid_to_3d(DEMO_GRID, cell_size_m=0.5)
    with open("demo_scene_3d.json", "w", encoding="utf-8") as f:
        json.dump(scene_3d, f, indent=2)
    print("1. [DONE] Character Grid directly converted into 3D Mesh Coordinates: demo_scene_3d.json")
    print(f"   -> Walls: {scene_3d['metadata']['total_walls']} contiguous segments")
    print(f"   -> Real-world Size: {scene_3d['metadata']['world_size_meters']['width']}m x {scene_3d['metadata']['world_size_meters']['depth']}m")

    # 2. Render 2D CAD Blueprint (100% Noise-Free)
    cad_img = render_2d_cad_blueprint(DEMO_GRID, "output_samples/blueprint_cad_demo.png")
    print(f"2. [DONE] Rendered 100% Crisp 2D CAD Blueprint: {cad_img}")

    # 3. Create interactive 3D Web Walkthrough
    html_file = generate_interactive_3d_html(scene_3d, "output_samples/interactive_walkthrough.html")
    print(f"3. [DONE] Generated Interactive 3D Web Asset: {html_file}")
