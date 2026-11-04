function validatePrompt(p) {
    const pLower = (p || "").toLowerCase().trim();
    if (pLower.length < 3) {
        return { isValid: false, error: "Irregular prompt: Please enter a description of your desired floorplan." };
    }

    const bedMatch = pLower.match(/(\d+)\s*(?:bed|bedroom|bhk|br\b)/);
    if (bedMatch) {
        const count = parseInt(bedMatch[1], 10);
        if (count > 8) {
            return { isValid: false, error: `Irregular prompt: '${count} bedrooms' requested. Constrained to 1 - 8 bedrooms for realistic residential layouts.` };
        }
        if (count === 0) {
            return { isValid: false, error: "Irregular prompt: Bedroom count cannot be 0." };
        }
    }

    const bathMatch = pLower.match(/(\d+)\s*(?:bath|bathroom|toilet|washroom)/);
    if (bathMatch) {
        const count = parseInt(bathMatch[1], 10);
        if (count > 6) {
            return { isValid: false, error: `Irregular prompt: '${count} bathrooms' requested. Maximum allowed is 6 bathrooms.` };
        }
        if (count === 0) {
            return { isValid: false, error: "Irregular prompt: Bathroom count cannot be 0." };
        }
    }

    const kitchenMatch = pLower.match(/(\d+)\s*(?:kitchen)/);
    if (kitchenMatch) {
        const count = parseInt(kitchenMatch[1], 10);
        if (count > 4) {
            return { isValid: false, error: `Irregular prompt: '${count} kitchens' requested. Maximum allowed is 4 kitchens.` };
        }
    }

    const validKeywords = [
        "bed", "room", "kitchen", "bath", "living", "hall", "dining", "studio", 
        "villa", "apartment", "house", "office", "balcony", "garage", "suite", 
        "flat", "duplex", "loft", "lounge", "patio", "terrace"
    ];
    if (!validKeywords.some(k => pLower.includes(k))) {
        return { isValid: false, error: "Irregular prompt: Non-architectural input. Please specify residential spaces (e.g. bedroom, kitchen, living room)." };
    }

    return { isValid: true, error: "" };
}

function generateProceduralFallback(promptText) {
    const p = promptText.toLowerCase();
    let beds = 2;
    const bedM = p.match(/(\d+)\s*(?:bed|bedroom|bhk)/);
    if (bedM) beds = Math.min(Math.max(parseInt(bedM[1], 10), 1), 6);
    else if (p.includes("studio") || p.includes("one bed")) beds = 1;
    else if (p.includes("three bed")) beds = 3;
    else if (p.includes("four bed")) beds = 4;

    let baths = 1;
    const bathM = p.match(/(\d+)\s*(?:bath|bathroom)/);
    if (bathM) baths = Math.min(Math.max(parseInt(bathM[1], 10), 1), 4);
    else if (p.includes("two bath")) baths = 2;

    let kitchens = 1;
    const kitM = p.match(/(\d+)\s*(?:kitchen)/);
    if (kitM) kitchens = Math.min(Math.max(parseInt(kitM[1], 10), 1), 3);
    else if (p.includes("two kitchen")) kitchens = 2;

    const totalBackItems = beds + baths;
    const itemW = 4.0;
    const backRowWidth = totalBackItems * itemW;

    const livingW = Math.round(backRowWidth * (kitchens === 1 ? 0.55 : 0.45) * 10) / 10;
    const remW = backRowWidth - livingW;
    const kitW = Math.round((remW / kitchens) * 10) / 10;

    const rooms = [];
    rooms.push({ id: "living", name: "Living & Dining Room", type: "living", x: 0, y: 0, w: livingW, h: 7, color: "#e2e8f0" });
    
    let curX = livingW;
    for (let k = 0; k < kitchens; k++) {
        const kName = k === 0 ? "Main Kitchen" : `Prep Kitchen ${k + 1}`;
        const wVal = k === kitchens - 1 ? Math.round((backRowWidth - curX) * 10) / 10 : kitW;
        rooms.push({ id: `kitchen_${k + 1}`, name: kName, type: "kitchen", x: Math.round(curX * 10) / 10, y: 0, w: wVal, h: 7, color: "#cbd5e1" });
        curX += wVal;
    }

    let bx = 0;
    for (let b = 0; b < beds; b++) {
        const bName = b === 0 ? "Master Bedroom" : `Bedroom ${b + 1}`;
        rooms.push({ id: `bed_${b + 1}`, name: bName, type: "bedroom", x: Math.round(bx * 10) / 10, y: 7, w: itemW, h: 6, color: "#bfdbfe" });
        bx += itemW;
    }

    for (let ba = 0; ba < baths; ba++) {
        const baName = ba === 0 ? "Primary Bathroom" : `Bathroom ${ba + 1}`;
        rooms.push({ id: `bath_${ba + 1}`, name: baName, type: "bathroom", x: Math.round(bx * 10) / 10, y: 7, w: itemW, h: 6, color: "#f1f5f9" });
        bx += itemW;
    }

    return {
        name: `Architectural Plan (${beds} Bed, ${baths} Bath, ${kitchens} Kitchen)`,
        enhanced_prompt: `Architecturally zoned layout featuring ${beds} bedroom(s), ${baths} bathroom(s), and ${kitchens} kitchen space(s) arranged around a central circulation core with full doorway connectivity and perimeter daylighting.`,
        engine: "Visionect Procedural CAD Engine",
        dimensions: { width: backRowWidth, depth: 13 },
        rooms: rooms
    };
}

function compileLayoutTo3DScene(layout, wallHeight = 2.8, wallThickness = 0.2) {
    const rawRooms = layout.rooms || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const normRooms = rawRooms.map((rm, idx) => {
        const rx = parseFloat(rm.x || 0);
        const ry = parseFloat(rm.y || 0);
        const rw = Math.max(parseFloat(rm.w || 4), 3.0);
        const rh = Math.max(parseFloat(rm.h || 4), 3.0);
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx + rw);
        maxY = Math.max(maxY, ry + rh);
        return {
            idx,
            id: String(rm.id || `r${idx + 1}`),
            name: rm.name || `Room ${idx + 1}`,
            type: (rm.type || "generic").toLowerCase(),
            x: rx,
            y: ry,
            w: rw,
            h: rh,
            color: rm.color || "#cbd5e1"
        };
    });

    normRooms.forEach(rm => {
        rm.x = Math.round((rm.x - minX) * 100) / 100;
        rm.y = Math.round((rm.y - minY) * 100) / 100;
    });

    const width = Math.round((maxX - minX) * 100) / 100;
    const depth = Math.round((maxY - minY) * 100) / 100;
    const ox = width / 2.0;
    const oz = depth / 2.0;

    const processedRooms = normRooms.map(rm => {
        const cx = Math.round((rm.x + rm.w / 2 - ox) * 100) / 100;
        const cz = Math.round((rm.y + rm.h / 2 - oz) * 100) / 100;
        rm.center3d = [cx, 0, cz];
        return {
            id: rm.id,
            name: rm.name,
            type: rm.type,
            center: [cx, 0, cz],
            bounds: {
                minX: Math.round((rm.x - ox) * 100) / 100,
                maxX: Math.round((rm.x + rm.w - ox) * 100) / 100,
                minZ: Math.round((rm.y - oz) * 100) / 100,
                maxZ: Math.round((rm.y + rm.h - oz) * 100) / 100
            },
            size: [rm.w, rm.h],
            area_sqm: Math.round(rm.w * rm.h * 10) / 10,
            color: rm.color
        };
    });

    // Shared wall interfaces
    const sharedInterfaces = [];
    const EPS = 0.35;
    for (let i = 0; i < normRooms.length; i++) {
        for (let j = i + 1; j < normRooms.length; j++) {
            const r1 = normRooms[i], r2 = normRooms[j];
            if (Math.abs((r1.x + r1.w) - r2.x) <= EPS || Math.abs((r2.x + r2.w) - r1.x) <= EPS) {
                const wallX = Math.abs((r1.x + r1.w) - r2.x) <= EPS ? (r1.x + r1.w) : (r2.x + r2.w);
                const ovStart = Math.max(r1.y, r2.y);
                const ovEnd = Math.min(r1.y + r1.h, r2.y + r2.h);
                if (ovEnd - ovStart >= 1.2) {
                    sharedInterfaces.push({
                        r1: i, r2: j, orientation: "vertical",
                        x: wallX, z: (ovStart + ovEnd) / 2,
                        segStart: ovStart, segEnd: ovEnd, length: ovEnd - ovStart
                    });
                }
            }
            if (Math.abs((r1.y + r1.h) - r2.y) <= EPS || Math.abs((r2.y + r2.h) - r1.y) <= EPS) {
                const wallZ = Math.abs((r1.y + r1.h) - r2.y) <= EPS ? (r1.y + r1.h) : (r2.y + r2.h);
                const ovStart = Math.max(r1.x, r2.x);
                const ovEnd = Math.min(r1.x + r1.w, r2.x + r2.w);
                if (ovEnd - ovStart >= 1.2) {
                    sharedInterfaces.push({
                        r1: i, r2: j, orientation: "horizontal",
                        x: (ovStart + ovEnd) / 2, z: wallZ,
                        segStart: ovStart, segEnd: ovEnd, length: ovEnd - ovStart
                    });
                }
            }
        }
    }

    const selectedDoors = [];
    const connected = new Set([0]);
    let progress = true;
    while (progress && connected.size < normRooms.length) {
        progress = false;
        for (const inf of sharedInterfaces) {
            if (connected.has(inf.r1) !== connected.has(inf.r2)) {
                selectedDoors.push(inf);
                connected.add(inf.r1);
                connected.add(inf.r2);
                progress = true;
                break;
            }
        }
    }

    // Ensure every room has a door
    for (let i = 0; i < normRooms.length; i++) {
        if (!selectedDoors.some(d => d.r1 === i || d.r2 === i)) {
            const cand = sharedInterfaces.find(inf => inf.r1 === i || inf.r2 === i);
            if (cand) selectedDoors.push(cand);
        }
    }

    const processedDoors = selectedDoors.map((d, idx) => {
        const rmA = normRooms[d.r1], rmB = normRooms[d.r2];
        return {
            id: `door_${idx + 1}`,
            pos: [Math.round((d.x - ox) * 100) / 100, 0, Math.round((d.z - oz) * 100) / 100],
            orientation: d.orientation,
            width: 1.0,
            height: 2.1,
            roomA: { id: rmA.id, name: rmA.name, center: rmA.center3d },
            roomB: { id: rmB.id, name: rmB.name, center: rmB.center3d }
        };
    });

    // Build walls and split at doors
    const rawSegments = [];
    normRooms.forEach(rm => {
        rawSegments.push(["horizontal", rm.y, rm.x, rm.x + rm.w, rm.idx]);
        rawSegments.push(["horizontal", rm.y + rm.h, rm.x, rm.x + rm.w, rm.idx]);
        rawSegments.push(["vertical", rm.x, rm.y, rm.y + rm.h, rm.idx]);
        rawSegments.push(["vertical", rm.x + rm.w, rm.y, rm.y + rm.h, rm.idx]);
    });

    const groupedLines = [];
    rawSegments.forEach(([orient, fc, sc, ec, rIdx]) => {
        const grp = groupedLines.find(g => g[0] === orient && Math.abs(g[1] - fc) <= 0.25);
        if (grp) grp[2].push([Math.min(sc, ec), Math.max(sc, ec), rIdx]);
        else groupedLines.push([orient, fc, [[Math.min(sc, ec), Math.max(sc, ec), rIdx]]]);
    });

    // Pass 1: Find candidate exterior perimeter walls for windows (min 2.2m length, no doors)
    const exteriorCandidates = [];
    groupedLines.forEach(([orient, fc, intervals]) => {
        const pts = Array.from(new Set(intervals.flatMap(([s, e]) => [s, e]))).sort((a, b) => a - b);
        for (let k = 0; k < pts.length - 1; k++) {
            const segS = pts[k], segE = pts[k + 1];
            if (segE - segS < 0.15) continue;
            const mid = (segS + segE) / 2;
            const touching = intervals.filter(([s, e]) => s - 0.05 <= mid && mid <= e + 0.05).map(x => x[2]);
            if (!touching.length) continue;
            const isExterior = (new Set(touching).size === 1);

            const doorsOnSeg = selectedDoors.filter(d => {
                if (d.orientation !== orient) return false;
                const dFixed = orient === "horizontal" ? d.z : d.x;
                const dAlong = orient === "horizontal" ? d.x : d.z;
                return Math.abs(dFixed - fc) <= 0.35 && (segS + 0.2 <= dAlong && dAlong <= segE - 0.2);
            });

            if (isExterior && (segE - segS) >= 2.2 && !doorsOnSeg.length) {
                exteriorCandidates.push({
                    orientation: orient,
                    fc: fc,
                    segS: segS,
                    segE: segE,
                    roomIdx: touching[0]
                });
            }
        }
    });

    // Pass 2: Select windows for perimeter rooms
    const roomsWithWindow = new Set();
    const selectedWindows = [];
    for (const cand of exteriorCandidates) {
        const rIdx = cand.roomIdx;
        const count = selectedWindows.filter(w => w.cand.roomIdx === rIdx).length;
        if (count >= 1 && selectedWindows.length >= normRooms.length) {
            continue;
        }
        const midAlong = (cand.segS + cand.segE) / 2;
        selectedWindows.push({
            cand: cand,
            mid: midAlong,
            orientation: cand.orientation,
            fc: cand.fc,
            width: 1.5,
            height: 1.2
        });
        roomsWithWindow.add(rIdx);
    }

    // Pass 3: Re-build walls carving both door openings and window apertures (sills + lintels)
    const walls = [];
    let wallId = 1;

    groupedLines.forEach(([orient, fc, intervals]) => {
        const pts = Array.from(new Set(intervals.flatMap(([s, e]) => [s, e]))).sort((a, b) => a - b);
        for (let k = 0; k < pts.length - 1; k++) {
            const segS = pts[k], segE = pts[k + 1];
            if (segE - segS < 0.15) continue;
            const mid = (segS + segE) / 2;
            const touching = intervals.filter(([s, e]) => s - 0.05 <= mid && mid <= e + 0.05).map(x => x[2]);
            if (!touching.length) continue;
            const isExterior = (new Set(touching).size === 1);

            const doorsOnSeg = [];
            for (const d of selectedDoors) {
                if (d.orientation === orient) {
                    const dFixed = orient === "horizontal" ? d.z : d.x;
                    const dAlong = orient === "horizontal" ? d.x : d.z;
                    if (Math.abs(dFixed - fc) <= 0.35 && (segS + 0.2 <= dAlong && dAlong <= segE - 0.2)) {
                        doorsOnSeg.push(dAlong);
                    }
                }
            }

            const winsOnSeg = [];
            for (const w of selectedWindows) {
                if (w.orientation === orient && Math.abs(w.fc - fc) <= 0.25) {
                    if (segS + 0.6 <= w.mid && w.mid <= segE - 0.6) {
                        winsOnSeg.push(w.mid);
                    }
                }
            }

            const addWallPiece = (c1, c2, baseY, h, isExt = isExterior, isLint = false) => {
                if (c2 - c1 <= 0.05) return;
                const s3 = orient === "horizontal" ? [Math.round((c1 - ox) * 100) / 100, baseY, Math.round((fc - oz) * 100) / 100] : [Math.round((fc - ox) * 100) / 100, baseY, Math.round((c1 - oz) * 100) / 100];
                const e3 = orient === "horizontal" ? [Math.round((c2 - ox) * 100) / 100, baseY, Math.round((fc - oz) * 100) / 100] : [Math.round((fc - ox) * 100) / 100, baseY, Math.round((c2 - oz) * 100) / 100];
                walls.push({
                    id: wallId++,
                    start: s3,
                    end: e3,
                    base_y: baseY,
                    thickness: wallThickness,
                    height: h,
                    is_exterior: isExt,
                    is_lintel: isLint
                });
            };

            if (!doorsOnSeg.length && !winsOnSeg.length) {
                addWallPiece(segS, segE, 0.0, wallHeight);
            } else if (doorsOnSeg.length) {
                doorsOnSeg.sort((a, b) => a - b);
                let curPos = segS;
                const doorHalf = 0.52;
                for (const dCenter of doorsOnSeg) {
                    const dLeft = Math.max(curPos, dCenter - doorHalf);
                    const dRight = Math.min(segE, dCenter + doorHalf);
                    if (dLeft - curPos > 0.1) {
                        addWallPiece(curPos, dLeft, 0.0, wallHeight);
                    }
                    // Door lintel header (y = 2.1 to 2.8)
                    addWallPiece(dLeft, dRight, 2.1, Math.round((wallHeight - 2.1) * 100) / 100, isExterior, true);
                    curPos = dRight;
                }
                if (segE - curPos > 0.1) {
                    addWallPiece(curPos, segE, 0.0, wallHeight);
                }
            } else if (winsOnSeg.length) {
                // Carve window opening: Sill below (y=0 to 1.0) & Lintel above (y=2.2 to 2.8)
                winsOnSeg.sort((a, b) => a - b);
                let curPos = segS;
                const winHalf = 0.76;
                for (const wCenter of winsOnSeg) {
                    const wLeft = Math.max(curPos, wCenter - winHalf);
                    const wRight = Math.min(segE, wCenter + winHalf);
                    if (wLeft - curPos > 0.1) {
                        addWallPiece(curPos, wLeft, 0.0, wallHeight);
                    }
                    // 1. Lower sill wall below window (y = 0.0 to 1.0)
                    addWallPiece(wLeft, wRight, 0.0, 1.0);
                    // 2. Upper header lintel wall above window (y = 2.2 to 2.8)
                    addWallPiece(wLeft, wRight, 2.2, Math.round((wallHeight - 2.2) * 100) / 100, isExterior, true);
                    curPos = wRight;
                }
                if (segE - curPos > 0.1) {
                    addWallPiece(curPos, segE, 0.0, wallHeight);
                }
            }
        }
    });

    const processedWindows = selectedWindows.map(w => {
        const wx = w.orientation === "horizontal" ? w.mid - ox : w.fc - ox;
        const wz = w.orientation === "horizontal" ? w.fc - oz : w.mid - oz;
        return {
            pos: [Math.round(wx * 100) / 100, 1.0, Math.round(wz * 100) / 100],
            orientation: w.orientation,
            width: 1.5,
            height: 1.2
        };
    });

    return {
        metadata: {
            name: layout.name || "Custom Floorplan",
            enhanced_prompt: layout.enhanced_prompt || "Architecturally optimized space layout.",
            engine: layout.engine || "Groq AI",
            world_size: { width, depth },
            total_walls: walls.length,
            total_rooms: processedRooms.length,
            total_doors: processedDoors.length,
            total_windows: processedWindows.length
        },
        rooms: processedRooms,
        walls,
        doors: processedDoors,
        windows: processedWindows
    };
}

exports.handler = async function(event, context) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            },
            body: ""
        };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const promptText = (body.prompt || "2 bedrooms, 1 bathroom, living room, open kitchen").trim();

        const validation = validatePrompt(promptText);
        if (!validation.isValid) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: validation.error, is_irregular: true })
            };
        }

        const apiKey = process.env.GROQ_API_KEY;
        let layout = null;

        // If GROQ_API_KEY is available in Netlify environment variables, synthesize with LLM
        if (apiKey) {
            const systemPrompt = `You are an expert AI Architectural CAD Engine (like Coohom / Planner5D).
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
    {"id": "r3", "name": "Master Bedroom", "type": "bedroom", "x": 0, "y": 7, "w": 7, "h": 7, "color": "#bfdbfe"},
    {"id": "r4", "name": "Full Bathroom", "type": "bathroom", "x": 7, "y": 7, "w": 6, "h": 7, "color": "#f1f5f9"}
  ]
}

STRICT ARCHITECTURAL RULES:
1. Every room MUST have non-zero positive dimensions (minimum w: 3.5, h: 3.5 meters).
2. Strictly generate ALL rooms requested.
3. Rooms MUST share walls in a contiguous block without floating gaps or overlaps.
4. Return ONLY raw JSON without markdown formatting.`;

            const modelsToTry = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

            for (const model of modelsToTry) {
                try {
                    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                            "User-Agent": "VisionectApp/1.0"
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: `Design floorplan: ${promptText}` }
                            ],
                            temperature: 0.2,
                            max_tokens: 1200
                        })
                    });

                    if (groqRes.ok) {
                        const groqJson = await groqRes.json();
                        const content = groqJson.choices[0].message.content.trim();
                        const match = content.match(/\{[\s\S]*\}/);
                        if (match) {
                            layout = JSON.parse(match[0]);
                            layout.engine = `Groq AI (${model})`;
                            break;
                        }
                    }
                } catch (e) {
                    console.warn(`Groq model ${model} attempt failed:`, e);
                }
            }
        }

        // Auto-Recovery Architectural CAD Fallback (if key is pending or LLM is unreachable)
        if (!layout) {
            console.log("Serving architectural procedural CAD synthesis for:", promptText);
            layout = generateProceduralFallback(promptText);
        }

        const scene3d = compileLayoutTo3DScene(layout);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(scene3d)
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: err.message })
        };
    }
};
