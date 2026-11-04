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

    const walls = [];
    const exteriorCandidates = [];
    let wallId = 1;

    groupedLines.forEach(([orient, fc, intervals]) => {
        const pts = Array.from(new Set(intervals.flatMap(([s, e]) => [s, e]))).sort((a, b) => a - b);
        for (let k = 0; k < pts.length - 1; k++) {
            const segS = pts[k], segE = pts[k + 1];
            if (segE - segS < 0.15) continue;
            const mid = (segS + segE) / 2;
            const touching = intervals.filter(([s, e]) => s - 0.05 <= mid && mid <= e + 0.05).map(x => x[2]);
            if (!touching.length) continue;
            const isExterior = new Set(touching).size === 1;

            const doorsOnSeg = selectedDoors
                .filter(d => d.orientation === orient && Math.abs((orient === "horizontal" ? d.z : d.x) - fc) <= 0.35)
                .map(d => orient === "horizontal" ? d.x : d.z)
                .filter(da => segS + 0.2 <= da && da <= segE - 0.2)
                .sort((a, b) => a - b);

            const makeWall = (c1, c2, baseY, h) => {
                const s3 = orient === "horizontal" ? [c1 - ox, 0, fc - oz] : [fc - ox, 0, c1 - oz];
                const e3 = orient === "horizontal" ? [c2 - ox, 0, fc - oz] : [fc - ox, 0, c2 - oz];
                walls.push({
                    id: wallId++,
                    start: s3.map(v => Math.round(v * 100) / 100),
                    end: e3.map(v => Math.round(v * 100) / 100),
                    base_y: baseY,
                    thickness: wallThickness,
                    height: h,
                    is_exterior: isExterior
                });
            };

            if (!doorsOnSeg.length) {
                makeWall(segS, segE, 0, wallHeight);
                if (isExterior && segE - segS >= 2.2) {
                    exteriorCandidates.push({ orientation: orient, fc, segS, segE, roomIdx: touching[0] });
                }
            } else {
                let cur = segS;
                for (const dc of doorsOnSeg) {
                    const dl = Math.max(cur, dc - 0.52);
                    const dr = Math.min(segE, dc + 0.52);
                    if (dl - cur > 0.12) makeWall(cur, dl, 0, wallHeight);
                    makeWall(dl, dr, 2.1, Math.round((wallHeight - 2.1) * 100) / 100);
                    cur = dr;
                }
                if (segE - cur > 0.12) makeWall(cur, segE, 0, wallHeight);
            }
        }
    });

    const processedWindows = exteriorCandidates.slice(0, normRooms.length + 1).map(cand => {
        const mid = (cand.segS + cand.segE) / 2;
        const wx = cand.orientation === "horizontal" ? mid - ox : cand.fc - ox;
        const wz = cand.orientation === "horizontal" ? cand.fc - oz : mid - oz;
        return {
            pos: [Math.round(wx * 100) / 100, 1.0, Math.round(wz * 100) / 100],
            orientation: cand.orientation,
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
        if (!apiKey) {
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "GROQ_API_KEY environment variable not set on Netlify" })
            };
        }

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
        let layout = null;

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

        if (!layout) {
            throw new Error("Unable to synthesize floorplan from available models");
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
