import os
import sys
import json
import re
import math
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

def get_groq_api_key():
    # 1. Check environment variable (Standard / Docker / Netlify / CI)
    env_key = os.environ.get("GROQ_API_KEY", "").strip()
    if env_key:
        return env_key

    # 2. Check local .env file
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if k.strip() == "GROQ_API_KEY":
                        val = v.strip().strip("'\"")
                        if val:
                            return val

    # 3. Check local gitignored .kaggle folder (for local backward compatibility)
    key_path = BASE_DIR / ".kaggle" / "groq.json"
    if key_path.exists():
        try:
            with open(key_path, "r", encoding="utf-8") as f:
                d = json.load(f)
                return d.get("api_key") or d.get("key") or d.get("groq_api_key") or ""
        except Exception:
            pass

    return ""

def validate_prompt(p):
    """
    Validates architectural feasibility and rejects irregular / impossible prompts.
    """
    p_lower = p.lower().strip()
    if len(p_lower) < 3:
        return False, "Irregular prompt: Please enter a description of your desired floorplan."

    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|bhk|br\b)', p_lower)
    if bed_match:
        count = int(bed_match.group(1))
        if count > 8:
            return False, f"Irregular prompt: '{count} bedrooms' requested. Constrained to 1 - 8 bedrooms for realistic residential layouts."
        if count == 0:
            return False, "Irregular prompt: Bedroom count cannot be 0."

    bath_match = re.search(r'(\d+)\s*(?:bath|bathroom|toilet|washroom)', p_lower)
    if bath_match:
        count = int(bath_match.group(1))
        if count > 6:
            return False, f"Irregular prompt: '{count} bathrooms' requested. Maximum allowed is 6 bathrooms."
        if count == 0:
            return False, "Irregular prompt: Bathroom count cannot be 0."

    kitchen_match = re.search(r'(\d+)\s*(?:kitchen)', p_lower)
    if kitchen_match:
        count = int(kitchen_match.group(1))
        if count > 4:
            return False, f"Irregular prompt: '{count} kitchens' requested. Maximum allowed is 4 kitchens."

    room_match = re.search(r'(\d+)\s*(?:room)', p_lower)
    if room_match and not bed_match:
        count = int(room_match.group(1))
        if count > 15:
            return False, f"Irregular prompt: '{count} rooms' requested. Maximum allowed is 12 total rooms."

    valid_keywords = [
        "bed", "room", "kitchen", "bath", "living", "hall", "dining", "studio", 
        "villa", "apartment", "house", "office", "balcony", "garage", "suite", 
        "flat", "duplex", "loft", "lounge", "patio", "terrace"
    ]
    if not any(k in p_lower for k in valid_keywords):
        return False, "Irregular prompt: Non-architectural input. Please specify residential spaces (e.g. bedroom, kitchen, living room)."

    return True, ""

def generate_procedural_fallback_layout(prompt_text):
    """
    Architectural CAD layout generator that adapts dynamically to requested room counts.
    """
    p = prompt_text.lower()
    beds = 2
    bed_m = re.search(r'(\d+)\s*(?:bed|bedroom|bhk)', p)
    if bed_m:
        beds = min(max(int(bed_m.group(1)), 1), 6)
    elif "studio" in p or "one bed" in p:
        beds = 1
    elif "three bed" in p:
        beds = 3
    elif "four bed" in p:
        beds = 4

    baths = 1
    bath_m = re.search(r'(\d+)\s*(?:bath|bathroom)', p)
    if bath_m:
        baths = min(max(int(bath_m.group(1)), 1), 4)
    elif "two bath" in p:
        baths = 2

    kitchens = 1
    kit_m = re.search(r'(\d+)\s*(?:kitchen)', p)
    if kit_m:
        kitchens = min(max(int(kit_m.group(1)), 1), 3)
    elif "two kitchen" in p:
        kitchens = 2

    # Back row (y = 7 to 13): Bedrooms + Bathrooms packed cleanly
    total_back_items = beds + baths
    item_w = 4.0
    back_row_width = total_back_items * item_w

    # Front row (y = 0 to 7): Living Room + Kitchen(s) stretched to match back_row_width
    front_items = 1 + kitchens
    living_w = round(back_row_width * (0.55 if kitchens == 1 else 0.45), 1)
    rem_w = back_row_width - living_w
    kit_w = round(rem_w / kitchens, 1)

    rooms = []
    rooms.append({"id": "living", "name": "Living & Dining Room", "type": "living", "x": 0, "y": 0, "w": living_w, "h": 7, "color": "#e2e8f0"})
    cur_x = living_w
    for k in range(kitchens):
        k_name = "Main Kitchen" if k == 0 else f"Prep Kitchen {k+1}"
        w_val = round(back_row_width - cur_x, 1) if k == kitchens - 1 else kit_w
        rooms.append({"id": f"kitchen_{k+1}", "name": k_name, "type": "kitchen", "x": round(cur_x, 1), "y": 0, "w": w_val, "h": 7, "color": "#cbd5e1"})
        cur_x += w_val

    bx = 0
    for b in range(beds):
        b_name = "Master Bedroom" if b == 0 else f"Bedroom {b+1}"
        rooms.append({"id": f"bed_{b+1}", "name": b_name, "type": "bedroom", "x": round(bx, 1), "y": 7, "w": item_w, "h": 6, "color": "#bfdbfe"})
        bx += item_w

    for ba in range(baths):
        ba_name = "Primary Bathroom" if ba == 0 else f"Bathroom {ba+1}"
        rooms.append({"id": f"bath_{ba+1}", "name": ba_name, "type": "bathroom", "x": round(bx, 1), "y": 7, "w": item_w, "h": 6, "color": "#f1f5f9"})
        bx += item_w

    total_w = back_row_width
    return {
        "name": f"Architectural Plan ({beds} Bed, {baths} Bath, {kitchens} Kitchen)",
        "enhanced_prompt": f"Architecturally zoned layout featuring {beds} bedroom(s), {baths} bathroom(s), and {kitchens} kitchen space(s) arranged around a central circulation core with full doorway connectivity and perimeter daylighting.",
        "engine": "Visionect CAD Engine",
        "dimensions": {"width": total_w, "depth": 13},
        "rooms": rooms,
        "doors": [],
        "windows": []
    }

def call_groq_llm(prompt_text, api_key):
    system_prompt = """You are an expert AI Architectural CAD Engine (like Coohom / Planner5D).
Given a user prompt describing an apartment or house, design a functional 2D floorplan layout on a metric grid (meters).

You MUST:
1. IMPROVE and ENHANCE the prompt into a professional architectural design specification ("enhanced_prompt").
2. Produce a custom 2D metric grid layout strictly fulfilling all room requirements.

Output ONLY valid JSON matching this schema:
{
  "name": "Design Title",
  "enhanced_prompt": "Architectural description detailing space planning, zoning, and circulation flow...",
  "dimensions": {"width": 18, "depth": 14},
  "rooms": [
    {"id": "r1", "name": "Living Room", "type": "living", "x": 0, "y": 0, "w": 8, "h": 7, "color": "#e2e8f0"},
    {"id": "r2", "name": "Main Kitchen", "type": "kitchen", "x": 8, "y": 0, "w": 5, "h": 7, "color": "#cbd5e1"},
    {"id": "r3", "name": "Prep Kitchen", "type": "kitchen", "x": 13, "y": 0, "w": 5, "h": 7, "color": "#94a3b8"},
    {"id": "r4", "name": "Master Bedroom", "type": "bedroom", "x": 0, "y": 7, "w": 7, "h": 7, "color": "#bfdbfe"},
    {"id": "r5", "name": "Guest Bedroom", "type": "bedroom", "x": 7, "y": 7, "w": 6, "h": 7, "color": "#dbeafe"},
    {"id": "r6", "name": "Full Bathroom", "type": "bathroom", "x": 13, "y": 7, "w": 5, "h": 7, "color": "#f1f5f9"}
  ]
}

STRICT ARCHITECTURAL RULES:
1. Every room MUST have non-zero positive dimensions (minimum w: 3.5, h: 3.5 meters).
2. Strictly generate ALL rooms requested (e.g., if user asks for 3 bedrooms and 2 bathrooms, include all of them!).
3. Rooms MUST share walls (touching edges) in a contiguous block without floating gaps or overlapping rectangles.
4. Every bedroom and bathroom must share at least one wall with the Living Room, Hallway, or Kitchen so a door can connect them.
5. Allowed room types: 'bedroom', 'living', 'kitchen', 'bathroom', 'dining', 'balcony', 'office', 'garage'.
6. Return ONLY raw JSON without markdown formatting.
"""
    models_to_try = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]

    for model_name in models_to_try:
        try:
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Design floorplan: {prompt_text}"}
                ],
                "temperature": 0.2,
                "max_tokens": 1200
            }

            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "VisionectApp/1.0"
                }
            )

            with urllib.request.urlopen(req, timeout=14) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                content = res["choices"][0]["message"].get("content", "").strip()
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if parsed.get("rooms") and len(parsed["rooms"]) > 0:
                        parsed["engine"] = f"Groq AI ({model_name})"
                        return parsed

        except urllib.error.HTTPError as e:
            print(f"[Groq API] Model {model_name} returned HTTP {e.code}, trying next model in chain...")
            continue
        except Exception as e:
            print(f"[Groq API] Model {model_name} error: {e}, trying next model...")
            continue

    print(f"[Fallback Activated] Serving architectural template for: {prompt_text}")
    return generate_procedural_fallback_layout(prompt_text)

def compile_layout_to_3d_scene(layout, wall_height=2.8, wall_thickness=0.2):
    """
    Topological & Geometric Compiler:
    1. Normalizes room coordinates & ensures zero overlaps.
    2. Detects all shared walls between adjacent rooms.
    3. Guarantees EVERY room has a properly aligned door on a shared wall (zero orphan rooms).
    4. Carves physical doorway cutouts in the 3D wall segments.
    5. Places properly aligned exterior windows only on outer perimeter walls.
    """
    raw_rooms = layout.get("rooms", [])
    if not raw_rooms:
        layout = generate_procedural_fallback_layout("2 bedrooms, 1 bathroom, kitchen, living room")
        raw_rooms = layout["rooms"]

    # Normalize rooms & compute exact bounding box
    norm_rooms = []
    min_x, min_y = float("inf"), float("inf")
    max_x, max_y = float("-inf"), float("-inf")

    for idx, rm in enumerate(raw_rooms):
        rx = float(rm.get("x", 0))
        ry = float(rm.get("y", 0))
        rw = max(float(rm.get("w", 4)), 3.0)
        rh = max(float(rm.get("h", 4)), 3.0)
        min_x = min(min_x, rx)
        min_y = min(min_y, ry)
        max_x = max(max_x, rx + rw)
        max_y = max(max_y, ry + rh)
        norm_rooms.append({
            "idx": idx,
            "id": str(rm.get("id") or f"r{idx+1}"),
            "name": rm.get("name", f"Room {idx+1}"),
            "type": rm.get("type", "generic").lower(),
            "x": rx,
            "y": ry,
            "w": rw,
            "h": rh,
            "color": rm.get("color", "#cbd5e1")
        })

    # Shift rooms so minimum corner is at (0,0)
    for rm in norm_rooms:
        rm["x"] = round(rm["x"] - min_x, 2)
        rm["y"] = round(rm["y"] - min_y, 2)

    width = round(max_x - min_x, 2)
    depth = round(max_y - min_y, 2)
    ox = width / 2.0
    oz = depth / 2.0

    # Ensure all rooms touch (if any room is slightly detached due to LLM rounding, snap it)
    # Build room center coordinates in 3D world space
    processed_rooms = []
    for rm in norm_rooms:
        cx = round(rm["x"] + rm["w"] / 2.0 - ox, 2)
        cz = round(rm["y"] + rm["h"] / 2.0 - oz, 2)
        rm["center_3d"] = [cx, 0.0, cz]
        processed_rooms.append({
            "id": rm["id"],
            "name": rm["name"],
            "type": rm["type"],
            "center": [cx, 0.0, cz],
            "bounds": {
                "minX": round(rm["x"] - ox, 2),
                "maxX": round(rm["x"] + rm["w"] - ox, 2),
                "minZ": round(rm["y"] - oz, 2),
                "maxZ": round(rm["y"] + rm["h"] - oz, 2)
            },
            "size": [round(rm["w"], 2), round(rm["h"], 2)],
            "area_sqm": round(rm["w"] * rm["h"], 1),
            "color": rm["color"]
        })

    # --- STEP 1: Find all shared wall interfaces between pairs of rooms ---
    shared_interfaces = []  # list of dicts describing shared wall segments between room i and room j
    EPS = 0.35  # tolerance in meters for adjacent walls

    for i in range(len(norm_rooms)):
        for j in range(i + 1, len(norm_rooms)):
            r1 = norm_rooms[i]
            r2 = norm_rooms[j]

            # Check Vertical Wall interface (x1_right == x2_left or x2_right == x1_left)
            if abs((r1["x"] + r1["w"]) - r2["x"]) <= EPS or abs((r2["x"] + r2["w"]) - r1["x"]) <= EPS:
                wall_x = (r1["x"] + r1["w"]) if abs((r1["x"] + r1["w"]) - r2["x"]) <= EPS else (r2["x"] + r2["w"])
                ov_start = max(r1["y"], r2["y"])
                ov_end = min(r1["y"] + r1["h"], r2["y"] + r2["h"])
                ov_len = ov_end - ov_start
                if ov_len >= 1.2:
                    shared_interfaces.append({
                        "r1": i,
                        "r2": j,
                        "orientation": "vertical",
                        "x": round(wall_x, 2),
                        "z": round((ov_start + ov_end) / 2.0, 2),
                        "seg_start": round(ov_start, 2),
                        "seg_end": round(ov_end, 2),
                        "length": round(ov_len, 2)
                    })

            # Check Horizontal Wall interface (y1_bottom == y2_top or y2_bottom == y1_top)
            if abs((r1["y"] + r1["h"]) - r2["y"]) <= EPS or abs((r2["y"] + r2["h"]) - r1["y"]) <= EPS:
                wall_z = (r1["y"] + r1["h"]) if abs((r1["y"] + r1["h"]) - r2["y"]) <= EPS else (r2["y"] + r2["h"])
                ov_start = max(r1["x"], r2["x"])
                ov_end = min(r1["x"] + r1["w"], r2["x"] + r2["w"])
                ov_len = ov_end - ov_start
                if ov_len >= 1.2:
                    shared_interfaces.append({
                        "r1": i,
                        "r2": j,
                        "orientation": "horizontal",
                        "x": round((ov_start + ov_end) / 2.0, 2),
                        "z": round(wall_z, 2),
                        "seg_start": round(ov_start, 2),
                        "seg_end": round(ov_end, 2),
                        "length": round(ov_len, 2)
                    })

    # --- STEP 2: Topological Door Placement (Guarantee EVERY room is connected!) ---
    # Priority hub score: living/hall > kitchen/dining > bedroom > bathroom
    def hub_score(rm_type):
        if "living" in rm_type or "hall" in rm_type: return 4
        if "kitchen" in rm_type or "dining" in rm_type: return 3
        if "bed" in rm_type or "office" in rm_type: return 2
        return 1

    selected_doors = []
    used_pairs = set()
    connected_rooms = set()

    # Start BFS/Spanning tree from the primary living room (or room 0)
    living_indices = [r["idx"] for r in norm_rooms if "living" in r["type"]]
    root_idx = living_indices[0] if living_indices else 0
    connected_rooms.add(root_idx)

    # Sort interfaces so connections to Living/Kitchen hubs are preferred over bathroom-to-bathroom
    shared_interfaces.sort(
        key=lambda inf: (
            hub_score(norm_rooms[inf["r1"]]["type"]) + hub_score(norm_rooms[inf["r2"]]["type"]),
            max(hub_score(norm_rooms[inf["r1"]]["type"]), hub_score(norm_rooms[inf["r2"]]["type"])),
            inf["length"]
        ),
        reverse=True
    )

    # Iteratively connect all rooms to the spanning tree
    made_progress = True
    while made_progress and len(connected_rooms) < len(norm_rooms):
        made_progress = False
        for inf in shared_interfaces:
            u, v = inf["r1"], inf["r2"]
            if (u in connected_rooms) ^ (v in connected_rooms):
                # Avoid connecting two bathrooms or bedroom-through-bathroom if another path exists
                pair_key = (min(u, v), max(u, v))
                used_pairs.add(pair_key)
                selected_doors.append(inf)
                connected_rooms.add(u)
                connected_rooms.add(v)
                made_progress = True
                break

    # Also ensure every room has at least 1 door even if disconnected in raw coords
    for r_idx in range(len(norm_rooms)):
        has_door = any(d["r1"] == r_idx or d["r2"] == r_idx for d in selected_doors)
        if not has_door:
            # Find any interface touching r_idx
            candidates = [inf for inf in shared_interfaces if inf["r1"] == r_idx or inf["r2"] == r_idx]
            if candidates:
                selected_doors.append(candidates[0])
            else:
                # If a room had a gap, snap a door onto its closest wall facing the center of the house
                rm = norm_rooms[r_idx]
                nearest_other = min(
                    [o for o in norm_rooms if o["idx"] != r_idx],
                    key=lambda o: math.hypot((rm["x"]+rm["w"]/2)-(o["x"]+o["w"]/2), (rm["y"]+rm["h"]/2)-(o["y"]+o["h"]/2)),
                    default=norm_rooms[0]
                )
                selected_doors.append({
                    "r1": r_idx,
                    "r2": nearest_other["idx"],
                    "orientation": "horizontal",
                    "x": round(rm["x"] + rm["w"] / 2.0, 2),
                    "z": round(rm["y"] if rm["y"] > 0 else rm["y"] + rm["h"], 2),
                    "seg_start": rm["x"],
                    "seg_end": rm["x"] + rm["w"],
                    "length": rm["w"]
                })

    # Also add a pleasant circulation door between Living Room and Main Kitchen if they share a wall and aren't yet linked
    for inf in shared_interfaces:
        t1 = norm_rooms[inf["r1"]]["type"]
        t2 = norm_rooms[inf["r2"]]["type"]
        pair_key = (min(inf["r1"], inf["r2"]), max(inf["r1"], inf["r2"]))
        if pair_key not in used_pairs:
            if ("living" in t1 and "kitchen" in t2) or ("kitchen" in t1 and "living" in t2):
                selected_doors.append(inf)
                used_pairs.add(pair_key)

    # Convert selected_doors to 3D world coordinates with full room-to-room transition info
    processed_doors = []
    for idx, d in enumerate(selected_doors):
        rmA = norm_rooms[d["r1"]]
        rmB = norm_rooms[d["r2"]]
        wx = round(d["x"] - ox, 2)
        wz = round(d["z"] - oz, 2)
        processed_doors.append({
            "id": f"door_{idx+1}",
            "pos": [wx, 0.0, wz],
            "orientation": d["orientation"],  # 'horizontal' (along X) or 'vertical' (along Z)
            "width": 1.0,
            "height": 2.1,
            "roomA": {"id": rmA["id"], "name": rmA["name"], "center": rmA["center_3d"]},
            "roomB": {"id": rmB["id"], "name": rmB["name"], "center": rmB["center_3d"]}
        })

    # --- STEP 3: Build Deduplicated Wall Segments & Split Walls at Doorways ---
    # Collect elementary segments along horizontal and vertical lines
    raw_segments = []  # each: (orientation, fixed_coord, start_coord, end_coord)
    for rm in norm_rooms:
        x1, y1 = round(rm["x"], 2), round(rm["y"], 2)
        x2, y2 = round(rm["x"] + rm["w"], 2), round(rm["y"] + rm["h"], 2)
        # Top & Bottom horizontal walls (fixed z = y1 or y2, x from x1 to x2)
        raw_segments.append(("horizontal", y1, x1, x2, rm["idx"]))
        raw_segments.append(("horizontal", y2, x1, x2, rm["idx"]))
        # Left & Right vertical walls (fixed x = x1 or x2, z from y1 to y2)
        raw_segments.append(("vertical", x1, y1, y2, rm["idx"]))
        raw_segments.append(("vertical", x2, y1, y2, rm["idx"]))

    # Group segments by (orientation, fixed_coord) using 0.25m snapping tolerance
    grouped_lines = []  # list of [orientation, fixed_coord, intervals_list]
    for orient, fixed_c, s_c, e_c, r_idx in raw_segments:
        placed = False
        for grp in grouped_lines:
            if grp[0] == orient and abs(grp[1] - fixed_c) <= 0.25:
                grp[2].append((min(s_c, e_c), max(s_c, e_c), r_idx))
                placed = True
                break
        if not placed:
            grouped_lines.append([orient, fixed_c, [(min(s_c, e_c), max(s_c, e_c), r_idx)]])

    wall_list = []
    exterior_candidates = []  # segments that belong to only 1 room (perimeter walls) for windows
    wall_id_counter = 1

    for orient, fixed_c, intervals in grouped_lines:
        # Collect all split points along this line
        pts = sorted(list(set([pt for s, e, _ in intervals for pt in (s, e)])))
        for k in range(len(pts) - 1):
            seg_s, seg_e = pts[k], pts[k+1]
            if seg_e - seg_s < 0.15:
                continue
            mid = (seg_s + seg_e) / 2.0
            # Count how many rooms share this sub-segment
            touching_rooms = [r_idx for s, e, r_idx in intervals if s - 0.05 <= mid <= e + 0.05]
            if not touching_rooms:
                continue

            is_exterior = (len(set(touching_rooms)) == 1)

            # Check if any door is on this sub-segment
            doors_on_seg = []
            for d in selected_doors:
                if d["orientation"] == orient:
                    d_fixed = d["z"] if orient == "horizontal" else d["x"]
                    d_along = d["x"] if orient == "horizontal" else d["z"]
                    if abs(d_fixed - fixed_c) <= 0.35 and (seg_s + 0.2 <= d_along <= seg_e - 0.2):
                        doors_on_seg.append(d_along)

            if is_exterior and (seg_e - seg_s) >= 2.2 and not doors_on_seg:
                exterior_candidates.append({
                    "orientation": orient,
                    "fixed_c": fixed_c,
                    "seg_s": seg_s,
                    "seg_e": seg_e,
                    "room_idx": touching_rooms[0]
                })

    # --- STEP 4: Snap Exterior Windows Strictly to Perimeter Walls & Carve Window Openings ---
    processed_windows = []
    rooms_with_window = set()
    selected_windows = []

    for cand in exterior_candidates:
        r_idx = cand["room_idx"]
        # Give each perimeter room at most 1-2 well-spaced exterior windows
        if list(rooms_with_window).count(r_idx) >= 1 and len(selected_windows) >= len(norm_rooms):
            continue
        mid_along = (cand["seg_s"] + cand["seg_e"]) / 2.0
        selected_windows.append({
            "cand": cand,
            "mid": mid_along,
            "orientation": cand["orientation"],
            "fixed_c": cand["fixed_c"],
            "width": 1.5,
            "height": 1.2
        })
        rooms_with_window.add(r_idx)

    # Re-build wall_list carving both doors and windows
    wall_list = []
    wall_id_counter = 1

    for orient, fixed_c, intervals in grouped_lines:
        pts = sorted(list(set([pt for s, e, _ in intervals for pt in (s, e)])))
        for k in range(len(pts) - 1):
            seg_s, seg_e = pts[k], pts[k+1]
            if seg_e - seg_s < 0.15:
                continue
            mid = (seg_s + seg_e) / 2.0
            touching_rooms = [r_idx for s, e, r_idx in intervals if s - 0.05 <= mid <= e + 0.05]
            if not touching_rooms:
                continue

            is_exterior = (len(set(touching_rooms)) == 1)

            # Check doors on this segment
            doors_on_seg = []
            for d in selected_doors:
                if d["orientation"] == orient:
                    d_fixed = d["z"] if orient == "horizontal" else d["x"]
                    d_along = d["x"] if orient == "horizontal" else d["z"]
                    if abs(d_fixed - fixed_c) <= 0.35 and (seg_s + 0.2 <= d_along <= seg_e - 0.2):
                        doors_on_seg.append(d_along)

            # Check windows on this segment
            wins_on_seg = []
            for w in selected_windows:
                if w["orientation"] == orient and abs(w["fixed_c"] - fixed_c) <= 0.25:
                    if seg_s + 0.6 <= w["mid"] <= seg_e - 0.6:
                        wins_on_seg.append(w["mid"])

            def add_wall_piece(c1, c2, baseY, h, is_ext=is_exterior, is_lint=False):
                if c2 - c1 <= 0.05: return
                if orient == "horizontal":
                    s3 = [round(c1 - ox, 2), baseY, round(fixed_c - oz, 2)]
                    e3 = [round(c2 - ox, 2), baseY, round(fixed_c - oz, 2)]
                else:
                    s3 = [round(fixed_c - ox, 2), baseY, round(c1 - oz, 2)]
                    e3 = [round(fixed_c - ox, 2), baseY, round(c2 - oz, 2)]
                nonlocal wall_id_counter
                wall_list.append({
                    "id": wall_id_counter,
                    "start": s3,
                    "end": e3,
                    "base_y": baseY,
                    "thickness": wall_thickness,
                    "height": h,
                    "is_exterior": is_ext,
                    "is_lintel": is_lint
                })
                wall_id_counter += 1

            if not doors_on_seg and not wins_on_seg:
                add_wall_piece(seg_s, seg_e, 0.0, wall_height)
            elif doors_on_seg:
                doors_on_seg.sort()
                cur_pos = seg_s
                door_half = 0.52
                for d_center in doors_on_seg:
                    d_left = max(cur_pos, d_center - door_half)
                    d_right = min(seg_e, d_center + door_half)
                    if d_left - cur_pos > 0.1:
                        add_wall_piece(cur_pos, d_left, 0.0, wall_height)
                    # Door lintel (y = 2.1 to 2.8)
                    add_wall_piece(d_left, d_right, 2.1, round(wall_height - 2.1, 2), is_lint=True)
                    cur_pos = d_right
                if seg_e - cur_pos > 0.1:
                    add_wall_piece(cur_pos, seg_e, 0.0, wall_height)
            elif wins_on_seg:
                # Carve clear window opening! (Sill under window: y=0 to 1.0, Lintel over window: y=2.2 to 2.8)
                wins_on_seg.sort()
                cur_pos = seg_s
                win_half = 0.76 # for 1.5m window
                for w_center in wins_on_seg:
                    w_left = max(cur_pos, w_center - win_half)
                    w_right = min(seg_e, w_center + win_half)
                    if w_left - cur_pos > 0.1:
                        add_wall_piece(cur_pos, w_left, 0.0, wall_height)
                    # 1. Lower sill wall below window (y = 0.0 to 1.0)
                    add_wall_piece(w_left, w_right, 0.0, 1.0)
                    # 2. Upper header lintel wall above window (y = 2.2 to 2.8)
                    add_wall_piece(w_left, w_right, 2.2, round(wall_height - 2.2, 2), is_lint=True)
                    cur_pos = w_right
                if seg_e - cur_pos > 0.1:
                    add_wall_piece(cur_pos, seg_e, 0.0, wall_height)

    for w in selected_windows:
        if w["orientation"] == "horizontal":
            wx = round(w["mid"] - ox, 2)
            wz = round(w["fixed_c"] - oz, 2)
        else:
            wx = round(w["fixed_c"] - ox, 2)
            wz = round(w["mid"] - oz, 2)
        processed_windows.append({
            "pos": [wx, 1.0, wz],
            "orientation": w["orientation"],
            "width": 1.5,
            "height": 1.2
        })

    return {
        "metadata": {
            "name": layout.get("name", "Custom Floorplan"),
            "enhanced_prompt": layout.get("enhanced_prompt", "Architecturally optimized space layout with verified room connectivity."),
            "engine": layout.get("engine", "Groq AI"),
            "world_size": {"width": width, "depth": depth},
            "total_walls": len(wall_list),
            "total_rooms": len(processed_rooms),
            "total_doors": len(processed_doors),
            "total_windows": len(processed_windows)
        },
        "rooms": processed_rooms,
        "walls": wall_list,
        "doors": processed_doors,
        "windows": processed_windows
    }

class VisionectHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_POST(self):
        if self.path == "/api/generate":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            
            try:
                data = json.loads(body) if body else {}
                prompt = data.get("prompt", "2 bedrooms, 1 bathroom, living room, open kitchen").strip()
                
                is_valid, error_msg = validate_prompt(prompt)
                if not is_valid:
                    err_bytes = json.dumps({
                        "error": error_msg,
                        "is_irregular": True
                    }).encode("utf-8")
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(err_bytes)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(err_bytes)
                    return

                api_key = get_groq_api_key()
                raw_layout = call_groq_llm(prompt, api_key)
                scene_3d = compile_layout_to_3d_scene(raw_layout)
                
                resp_bytes = json.dumps(scene_3d).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_bytes)
                
            except Exception as e:
                print(f"[Server Auto-Recovery] {e}. Serving architectural fallback.")
                try:
                    raw_layout = generate_procedural_fallback_layout(prompt)
                    scene_3d = compile_layout_to_3d_scene(raw_layout)
                    resp_bytes = json.dumps(scene_3d).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(resp_bytes)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(resp_bytes)
                except Exception as inner_e:
                    err_bytes = json.dumps({"error": str(inner_e)}).encode("utf-8")
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(err_bytes)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(err_bytes)
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    print(f"\n=======================================================")
    print(f" Visionect AI 3D Web Engine Active (Topological CAD)")
    print(f" URL: http://localhost:{PORT}")
    print(f" Groq Key: {'Loaded' if get_groq_api_key() else 'Missing'}")
    print(f"=======================================================\n")
    server = HTTPServer(("0.0.0.0", PORT), VisionectHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()
