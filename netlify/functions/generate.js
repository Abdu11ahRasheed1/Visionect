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
        "flat", "duplex", "loft", "lounge", "patio", "terrace", "deck", "study", "stairs", "floor", "level"
    ];
    if (!validKeywords.some(k => pLower.includes(k))) {
        return { isValid: false, error: "Irregular prompt: Non-architectural input. Please specify residential spaces (e.g. bedroom, kitchen, living room)." };
    }

    return { isValid: true, error: "" };
}

function generateProceduralFallback(promptText, floorIndex = 0) {
    const p = promptText.toLowerCase();
    const hasBalcony = ["balcony", "terrace", "deck", "patio", "veranda", "railing", "outdoor", "porch"].some(b => p.includes(b));
    const hasStudy = ["study", "office", "work", "library", "den"].some(s => p.includes(s));

    let beds = 2;
    const bedM = p.match(/(\d+)\s*(?:bed|bedroom|bhk)/);
    if (bedM) beds = Math.min(Math.max(parseInt(bedM[1], 10), 1), 6);
    else if (p.includes("studio") || p.includes("one bed") || p.includes("1 bed") || p.includes("master")) beds = 1;
    else if (p.includes("three bed") || p.includes("3 bed")) beds = 3;
    else if (p.includes("four bed") || p.includes("4 bed")) beds = 4;
    else if (floorIndex === 1) beds = (hasBalcony || hasStudy) ? 1 : 2;

    let baths = 1;
    const bathM = p.match(/(\d+)\s*(?:bath|bathroom|ensuite)/);
    if (bathM) baths = Math.min(Math.max(parseInt(bathM[1], 10), 1), 4);
    else if (p.includes("two bath") || p.includes("2 bath")) baths = 2;

    let kitchens = (floorIndex === 1 && !p.includes("kitchen")) ? 0 : 1;
    const kitM = p.match(/(\d+)\s*(?:kitchen)/);
    if (kitM) kitchens = Math.min(Math.max(parseInt(kitM[1], 10), 1), 3);
    else if (p.includes("two kitchen")) kitchens = 2;

    const rooms = [];

    if (floorIndex === 1) {
        // SECOND FLOOR ARCHITECTURE — DYNAMICALLY GENERATED FROM USER PROMPT
        const f2Width = 16.0;
        const f2Depth = 13.0;
        const balcW = hasBalcony ? 4.5 : 0.0;
        const indoorW = Math.round((f2Width - balcW) * 10) / 10;

        // Top row (y = 0 to 6.5): Staircase Hallway + Master Suite (+ Study if requested)
        const topY = 0.0;
        const topH = 6.5;
        const stairW = Math.round(indoorW * 0.38 * 10) / 10;
        rooms.push({
            id: "f2_landing", name: "Staircase Hallway", type: "living",
            x: 0.0, y: topY, w: stairW, h: topH, color: "#e2e8f0"
        });
        let curX = stairW;

        if (hasStudy) {
            const masterW = Math.round((indoorW - curX) * 0.55 * 10) / 10;
            rooms.push({
                id: "f2_master", name: "Master Suite", type: "bedroom",
                x: curX, y: topY, w: masterW, h: topH, color: "#bfdbfe"
            });
            curX = Math.round((curX + masterW) * 10) / 10;
            const studyW = Math.round((indoorW - curX) * 10) / 10;
            rooms.push({
                id: "f2_study", name: "Private Study & Library", type: "office",
                x: curX, y: topY, w: studyW, h: topH, color: "#fed7aa"
            });
        } else {
            const masterW = Math.round((indoorW - curX) * 10) / 10;
            rooms.push({
                id: "f2_master", name: "Master Suite", type: "bedroom",
                x: curX, y: topY, w: masterW, h: topH, color: "#bfdbfe"
            });
        }

        // Bottom row (y = 6.5 to 13.0): Bathrooms + Additional Bedrooms / Lounge
        const botY = 6.5;
        const botH = 6.5;
        const extraBeds = Math.max(beds - 1, 0);
        const botItems = [];
        for (let ba = 0; ba < baths; ba++) {
            const baName = ba === 0 ? "Ensuite Bathroom" : `Upper Bathroom ${ba + 1}`;
            botItems.push({ type: "bathroom", id: `f2_bath_${ba + 1}`, name: baName, color: "#f1f5f9" });
        }
        for (let eb = 0; eb < extraBeds; eb++) {
            botItems.push({ type: "bedroom", id: `f2_bed_${eb + 2}`, name: `Bedroom ${eb + 2}`, color: "#dbeafe" });
        }
        if (kitchens > 0) {
            botItems.push({ type: "kitchen", id: "f2_kitchen", name: "Upper Kitchenette", color: "#cbd5e1" });
        }
        if (botItems.length === 1) {
            botItems.push({ type: "living", id: "f2_lounge", name: "Upper Family Lounge", color: "#e2e8f0" });
        }

        let bx = 0.0;
        const itemW = Math.round((indoorW / botItems.length) * 10) / 10;
        botItems.forEach((item, idxB) => {
            const wVal = idxB === botItems.length - 1 ? Math.round((indoorW - bx) * 10) / 10 : itemW;
            rooms.push({
                id: item.id, name: item.name, type: item.type,
                x: Math.round(bx * 10) / 10, y: botY, w: wVal, h: botH, color: item.color
            });
            bx += wVal;
        });

        // Open Balcony along East terrace wing (3 exterior sides with railings, open to sky)
        if (hasBalcony) {
            const balcName = (p.includes("sunset") || p.includes("panoramic")) ? "Panoramic Sunset Balcony" : (p.includes("terrace") ? "Rooftop Sky Terrace" : "Open Balcony");
            rooms.push({
                id: "f2_balcony", name: balcName, type: "balcony", is_outdoor: true,
                x: indoorW, y: 0.0, w: balcW, h: f2Depth, color: "#6ee7b7"
            });
        }

        return {
            name: `Architectural Plan Level 2 (${beds} Bed, ${baths} Bath)`,
            enhanced_prompt: "Level 2 architectural layout featuring verified spatial circulation, structural wall extrusions, and custom upper-level zoning.",
            engine: "Visionect Procedural CAD Engine",
            dimensions: { width: f2Width, depth: f2Depth },
            rooms: rooms,
            floor_index: floorIndex
        };
    } else {
        // GROUND FLOOR (LEVEL 1)
        const totalBackItems = beds + baths;
        const itemW = 4.0;
        let backRowWidth = Math.max(totalBackItems * itemW, 14.0);

        const livingW = Math.round(backRowWidth * (kitchens === 1 ? 0.55 : 0.45) * 10) / 10;
        const remW = backRowWidth - livingW;
        const kitW = Math.round((remW / Math.max(kitchens, 1)) * 10) / 10;

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

        if (hasBalcony) {
            const balcW = 4.5;
            rooms.push({ id: "patio_terrace", name: "Open Garden Terrace", type: "balcony", is_outdoor: true, x: Math.round(bx * 10) / 10, y: 7, w: balcW, h: 6, color: "#6ee7b7" });
            bx += balcW;
            backRowWidth = bx;
        }

        return {
            name: `Architectural Plan Level 1 (${beds} Bed, ${baths} Bath, ${kitchens} Kitchen)`,
            enhanced_prompt: "Level 1 architectural zoned layout featuring central circulation, structural wall extrusions, and aperture alignment.",
            engine: "Visionect Procedural CAD Engine",
            dimensions: { width: backRowWidth, depth: 13 },
            rooms: rooms,
            floor_index: floorIndex
        };
    }
}

function retileRoomsIntoRect(roomsList, rectW, rectD) {
    const n = roomsList.length;
    if (n === 0) return;
    if (n === 1) {
        roomsList[0].x = 0.0;
        roomsList[0].y = 0.0;
        roomsList[0].w = Math.round(rectW * 100) / 100;
        roomsList[0].h = Math.round(rectD * 100) / 100;
        return;
    }

    const topCount = Math.floor((n + 1) / 2);
    const topRooms = roomsList.slice(0, topCount);
    const botRooms = roomsList.slice(topCount);

    const h1 = Math.round(rectD * 0.52 * 100) / 100;
    const h2 = Math.round((rectD - h1) * 100) / 100;

    [[topRooms, 0.0, h1], [botRooms, h1, h2]].forEach(([rowRooms, yVal, hVal]) => {
        if (!rowRooms.length) return;
        const sumW = rowRooms.reduce((acc, r) => acc + Math.max(parseFloat(r.w || 4.0), 3.0), 0);
        let curX = 0.0;
        rowRooms.forEach((r, idxR) => {
            let wVal;
            if (idxR === rowRooms.length - 1) {
                wVal = Math.round((rectW - curX) * 100) / 100;
            } else {
                const origW = Math.max(parseFloat(r.w || 4.0), 3.0);
                wVal = Math.round(rectW * (origW / sumW) * 100) / 100;
            }
            r.x = Math.round(curX * 100) / 100;
            r.y = Math.round(yVal * 100) / 100;
            r.w = Math.max(wVal, 2.5);
            r.h = Math.round(hVal * 100) / 100;
            curX = Math.round((curX + r.w) * 100) / 100;
        });
    });
}

function compileLayoutTo3DScene(layout, wallHeight = 2.8, wallThickness = 0.2, baseElevation = 0.0, floorIndex = 0, targetWidth = null, targetDepth = null, promptText = "") {
    const rawRooms = layout.rooms || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const pLower = (promptText || "").toLowerCase();
    const userWantsBalcony = pLower ? ["balcony", "terrace", "deck", "patio", "veranda", "railing", "outdoor", "porch"].some(b => pLower.includes(b)) : null;

    const normRooms = rawRooms.map((rm, idx) => {
        const rx = parseFloat(rm.x || 0);
        const ry = parseFloat(rm.y || 0);
        const rw = Math.max(parseFloat(rm.w || 4), 3.0);
        const rh = Math.max(parseFloat(rm.h || 4), 3.0);
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx + rw);
        maxY = Math.max(maxY, ry + rh);
        let rmType = (rm.type || "generic").toLowerCase();
        const rmName = rm.name || `Room ${idx + 1}`;
        const rmNameLower = rmName.toLowerCase();
        let isOutdoor = Boolean(rm.is_outdoor) || ["balcony", "terrace", "deck", "patio", "veranda", "porch", "outdoor"].some(k => rmType.includes(k) || rmNameLower.includes(k));
        if (userWantsBalcony === false && floorIndex === 1) {
            isOutdoor = false;
        }
        if (isOutdoor) {
            rmType = "balcony";
        }
        return {
            idx,
            id: String(rm.id || `r${idx + 1}`),
            name: rmName,
            type: rmType,
            is_outdoor: isOutdoor,
            floor_index: floorIndex,
            elevation: baseElevation,
            x: rx,
            y: ry,
            w: rw,
            h: rh,
            color: rm.color || (isOutdoor ? "#6ee7b7" : "#cbd5e1")
        };
    });

    if (floorIndex === 1 && userWantsBalcony === true && !normRooms.some(r => r.is_outdoor)) {
        const balcName = (pLower.includes("sunset") || pLower.includes("panoramic")) ? "Panoramic Sunset Balcony" : "Open Balcony";
        normRooms.push({
            idx: normRooms.length,
            id: "f2_balcony",
            name: balcName,
            type: "balcony",
            is_outdoor: true,
            floor_index: floorIndex,
            elevation: baseElevation,
            x: maxX,
            y: minY,
            w: 4.5,
            h: Math.max(maxY - minY, 12.0),
            color: "#6ee7b7"
        });
        maxX += 4.5;
    }

    normRooms.forEach(rm => {
        rm.x = Math.round((rm.x - minX) * 100) / 100;
        rm.y = Math.round((rm.y - minY) * 100) / 100;
    });

    const rawW = Math.max(Math.round((maxX - minX) * 100) / 100, 8.0);
    const rawD = Math.max(Math.round((maxY - minY) * 100) / 100, 8.0);

    const finalW = (targetWidth && parseFloat(targetWidth) >= 8.0) ? Math.round(parseFloat(targetWidth) * 100) / 100 : rawW;
    const finalD = (targetDepth && parseFloat(targetDepth) >= 8.0) ? Math.round(parseFloat(targetDepth) * 100) / 100 : rawD;

    const outdoorRooms = normRooms.filter(r => r.is_outdoor);
    const indoorRooms = normRooms.filter(r => !r.is_outdoor);

    if (floorIndex === 1 && outdoorRooms.length > 0 && indoorRooms.length > 0) {
        const balcW = Math.round(Math.max(Math.min(finalW * 0.28, 5.0), 3.8) * 100) / 100;
        const indoorW = Math.round((finalW - balcW) * 100) / 100;
        retileRoomsIntoRect(indoorRooms, indoorW, finalD);
        const bH = Math.round((finalD / outdoorRooms.length) * 100) / 100;
        outdoorRooms.forEach((orm, idxO) => {
            orm.x = indoorW;
            orm.y = Math.round(idxO * bH * 100) / 100;
            orm.w = balcW;
            orm.h = idxO === outdoorRooms.length - 1 ? Math.round((finalD - orm.y) * 100) / 100 : bH;
        });
    } else if (Math.abs(finalW - rawW) > 0.1 || Math.abs(finalD - rawD) > 0.1) {
        const scaleX = finalW / rawW;
        const scaleY = finalD / rawD;
        normRooms.forEach(rm => {
            rm.x = Math.round(rm.x * scaleX * 100) / 100;
            rm.y = Math.round(rm.y * scaleY * 100) / 100;
            rm.w = Math.round(rm.w * scaleX * 100) / 100;
            rm.h = Math.round(rm.h * scaleY * 100) / 100;
        });
    }

    normRooms.forEach((rm, idxN) => {
        rm.idx = idxN;
    });

    const width = finalW;
    const depth = finalD;
    const ox = width / 2.0;
    const oz = depth / 2.0;

    const processedRooms = normRooms.map(rm => {
        const cx = Math.round((rm.x + rm.w / 2 - ox) * 100) / 100;
        const cz = Math.round((rm.y + rm.h / 2 - oz) * 100) / 100;
        rm.center3d = [cx, baseElevation, cz];
        return {
            id: rm.id,
            name: rm.name,
            type: rm.type,
            is_outdoor: rm.is_outdoor,
            floor_index: floorIndex,
            center: [cx, baseElevation, cz],
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
            id: `door_${idx + 1}_f${floorIndex + 1}`,
            pos: [Math.round((d.x - ox) * 100) / 100, baseElevation, Math.round((d.z - oz) * 100) / 100],
            orientation: d.orientation,
            width: 1.0,
            height: 2.1,
            floor_index: floorIndex,
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

    // Pass 1: Find candidate exterior perimeter walls for windows (min 2.2m length, no doors, not a balcony railing)
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
            const isBalcWall = isExterior && (normRooms[touching[0]].is_outdoor || ["balcony", "terrace", "deck"].includes(normRooms[touching[0]].type));
            if (isBalcWall) continue;

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

    // Pass 2: Main Entrance Door (Ground Floor) & Exterior Windows for perimeter rooms
    const roomsWithWindow = new Set();
    const selectedWindows = [];

    let mainEntranceCand = null;
    if (floorIndex === 0 && exteriorCandidates.length > 0) {
        const livingCands = exteriorCandidates.filter(c => {
            const rm = normRooms[c.roomIdx];
            const t = (rm.type || "").toLowerCase();
            const n = (rm.name || "").toLowerCase();
            return ["living", "foyer", "entry", "hall", "dining", "lounge"].some(k => t.includes(k) || n.includes(k));
        });
        const pool = livingCands.length > 0 ? livingCands : exteriorCandidates;
        const horizPool = pool.filter(c => c.orientation === "horizontal");
        const bestPool = horizPool.length > 0 ? horizPool : pool;
        mainEntranceCand = bestPool.reduce((best, cur) => ((cur.segE - cur.segS) > (best.segE - best.segS) ? cur : best), bestPool[0]);
    }

    for (const cand of exteriorCandidates) {
        const rIdx = cand.roomIdx;
        const segLen = cand.segE - cand.segS;

        if (cand === mainEntranceCand) {
            let doorAlong;
            if (segLen >= 5.2) {
                doorAlong = Math.round((cand.segS + segLen * 0.72) * 100) / 100;
                const winAlong = Math.round((cand.segS + segLen * 0.32) * 100) / 100;
                selectedWindows.push({
                    cand: cand,
                    mid: winAlong,
                    orientation: cand.orientation,
                    fc: cand.fc,
                    width: 1.5,
                    height: 1.2
                });
                roomsWithWindow.add(rIdx);
            } else {
                doorAlong = Math.round(((cand.segS + cand.segE) / 2) * 100) / 100;
            }

            const dX = cand.orientation === "horizontal" ? doorAlong : cand.fc;
            const dZ = cand.orientation === "horizontal" ? cand.fc : doorAlong;
            selectedDoors.push({
                r1: rIdx,
                r2: rIdx,
                orientation: cand.orientation,
                x: dX,
                z: dZ,
                width: 1.2,
                is_main_entrance: true
            });
            const entryRm = normRooms[rIdx];
            const wx = Math.round((dX - ox) * 100) / 100;
            const wz = Math.round((dZ - oz) * 100) / 100;
            const extX = cand.orientation === "horizontal" ? wx : Math.round((wx < 0 ? wx - 2.5 : wx + 2.5) * 100) / 100;
            const extZ = cand.orientation === "horizontal" ? Math.round((wz < 0 ? wz - 2.5 : wz + 2.5) * 100) / 100 : wz;
            processedDoors.push({
                id: "main_entrance_door",
                name: "Main Entrance",
                is_main_entrance: true,
                pos: [wx, baseElevation, wz],
                orientation: cand.orientation,
                width: 1.2,
                height: 2.15,
                floor_index: floorIndex,
                roomA: { id: "exterior_porch", name: "Front Porch (Exterior)", center: [extX, baseElevation, extZ] },
                roomB: { id: entryRm.id, name: entryRm.name, center: entryRm.center3d }
            });
            continue;
        }

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

    // Pass 3: Re-build walls carving both door openings, window apertures, and open balcony railings
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
            const isBalconyRailing = isExterior && (normRooms[touching[0]].is_outdoor || ["balcony", "terrace", "deck"].includes(normRooms[touching[0]].type));

            const addWallPiece = (c1, c2, baseY, h, isExt = isExterior, isLint = false, isRailing = false) => {
                if (c2 - c1 <= 0.05) return;
                const actualBaseY = Math.round((baseY + baseElevation) * 100) / 100;
                const s3 = orient === "horizontal" ? [Math.round((c1 - ox) * 100) / 100, actualBaseY, Math.round((fc - oz) * 100) / 100] : [Math.round((fc - ox) * 100) / 100, actualBaseY, Math.round((c1 - oz) * 100) / 100];
                const e3 = orient === "horizontal" ? [Math.round((c2 - ox) * 100) / 100, actualBaseY, Math.round((fc - oz) * 100) / 100] : [Math.round((fc - ox) * 100) / 100, actualBaseY, Math.round((c2 - oz) * 100) / 100];
                walls.push({
                    id: wallId++,
                    start: s3,
                    end: e3,
                    base_y: actualBaseY,
                    thickness: wallThickness,
                    height: h,
                    is_exterior: isExt,
                    is_lintel: isLint,
                    is_railing: isRailing,
                    floor_index: floorIndex
                });
            };

            // If it's an open balcony perimeter wall, create open balustrade railing (height 1.05m)
            if (isBalconyRailing) {
                addWallPiece(segS, segE, 0.0, 1.05, true, false, true);
                continue;
            }

            const openings = [];
            for (const d of selectedDoors) {
                if (d.orientation === orient) {
                    const dFixed = orient === "horizontal" ? d.z : d.x;
                    const dAlong = orient === "horizontal" ? d.x : d.z;
                    const dHalf = ((d.width || 1.0) / 2) + 0.02;
                    if (Math.abs(dFixed - fc) <= 0.35 && (segS + 0.2 <= dAlong && dAlong <= segE - 0.2)) {
                        openings.push({ center: dAlong, half: dHalf, kind: "door" });
                    }
                }
            }

            for (const w of selectedWindows) {
                if (w.orientation === orient && Math.abs(w.fc - fc) <= 0.25) {
                    if (segS + 0.6 <= w.mid && w.mid <= segE - 0.6) {
                        openings.push({ center: w.mid, half: 0.76, kind: "window" });
                    }
                }
            }

            if (!openings.length) {
                addWallPiece(segS, segE, 0.0, wallHeight);
            } else {
                openings.sort((a, b) => a.center - b.center);
                let curPos = segS;
                for (const op of openings) {
                    const oLeft = Math.max(curPos, op.center - op.half);
                    const oRight = Math.min(segE, op.center + op.half);
                    if (oRight <= oLeft + 0.08) continue;
                    if (oLeft - curPos > 0.08) {
                        addWallPiece(curPos, oLeft, 0.0, wallHeight);
                    }
                    if (op.kind === "door") {
                        addWallPiece(oLeft, oRight, 2.1, Math.round((wallHeight - 2.1) * 100) / 100, isExterior, true);
                    } else {
                        addWallPiece(oLeft, oRight, 0.0, 1.0);
                        addWallPiece(oLeft, oRight, 2.2, Math.round((wallHeight - 2.2) * 100) / 100, isExterior, true);
                    }
                    curPos = oRight;
                }
                if (segE - curPos > 0.08) {
                    addWallPiece(curPos, segE, 0.0, wallHeight);
                }
            }
        }
    });

    const processedWindows = selectedWindows.map(w => {
        const wx = w.orientation === "horizontal" ? w.mid - ox : w.fc - ox;
        const wz = w.orientation === "horizontal" ? w.fc - oz : w.mid - oz;
        return {
            pos: [Math.round(wx * 100) / 100, Math.round((baseElevation + 1.0) * 100) / 100, Math.round(wz * 100) / 100],
            orientation: w.orientation,
            width: 1.5,
            height: 1.2,
            floor_index: floorIndex
        };
    });

    // Connecting Staircase metadata (Positioned cleanly along West interior wall)
    const stairX = Math.round((-ox + 0.9) * 100) / 100;
    const stairZ1 = Math.round((-oz + 1.0) * 100) / 100;
    const stairZ2 = Math.round((-oz + 4.2) * 100) / 100;
    const cMinX = Math.round((-ox + 0.25) * 100) / 100;
    const cMaxX = Math.round((-ox + 1.55) * 100) / 100;
    const cMinZ = Math.round((-oz + 0.9) * 100) / 100;
    const cMaxZ = Math.round((-oz + 4.3) * 100) / 100;

    const stairsMeta = {
        id: `stairs_f${floorIndex + 1}`,
        start: [stairX, baseElevation, stairZ1],
        end: [stairX, Math.round((baseElevation + wallHeight) * 100) / 100, stairZ2],
        width: 1.15,
        height: wallHeight,
        steps: 15,
        num_steps: 15,
        orientation: "north_south",
        floor_index: floorIndex,
        cutout: {
            min_x: cMinX,
            max_x: cMaxX,
            min_z: cMinZ,
            max_z: cMaxZ,
            center: [Math.round(((cMinX + cMaxX) / 2) * 100) / 100, Math.round((baseElevation + wallHeight) * 100) / 100, Math.round(((cMinZ + cMaxZ) / 2) * 100) / 100],
            size: [Math.round((cMaxX - cMinX) * 100) / 100, Math.round((cMaxZ - cMinZ) * 100) / 100]
        }
    };

    // Hipped Hut Roof metadata (Covers indoor structure; leaves Floor 2 outdoor balcony open to sky)
    const indoorMaxX = (floorIndex === 1 && outdoorRooms.length > 0 && indoorRooms.length > 0)
        ? Math.max(...indoorRooms.map(r => r.x + r.w))
        : width;
    const roofBounds = [
        Math.round(-ox * 100) / 100,
        Math.round((indoorMaxX - ox) * 100) / 100,
        Math.round(-oz * 100) / 100,
        Math.round(oz * 100) / 100
    ];

    const roofMeta = {
        type: "hipped_hut",
        width: Math.round(indoorMaxX * 100) / 100,
        depth: depth,
        bounds: roofBounds,
        height: 2.4,
        base_y: Math.round((baseElevation + wallHeight) * 100) / 100,
        overhang: 0.45,
        floor_index: floorIndex
    };

    return {
        metadata: {
            name: layout.name || `Architectural Plan Level ${floorIndex + 1}`,
            enhanced_prompt: layout.enhanced_prompt || "Architecturally optimized space layout.",
            engine: layout.engine || "Visionect CAD Engine",
            world_size: { width, depth },
            bounding_box: [Math.round(-ox * 100) / 100, Math.round(ox * 100) / 100, Math.round(-oz * 100) / 100, Math.round(oz * 100) / 100],
            floor_index: floorIndex,
            base_elevation: baseElevation,
            total_walls: walls.length,
            total_rooms: processedRooms.length,
            total_doors: processedDoors.length,
            total_windows: processedWindows.length,
            roof: roofMeta,
            stairs: stairsMeta
        },
        rooms: processedRooms,
        walls,
        doors: processedDoors,
        windows: processedWindows,
        roof: roofMeta,
        stairs: stairsMeta
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
        const floorIndex = parseInt(body.floor_index || 0, 10);
        const baseElevation = parseFloat(body.base_y !== undefined ? body.base_y : floorIndex * 2.8);
        const targetWidth = body.target_width || null;
        const targetDepth = body.target_depth || null;

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
Given a user prompt describing an apartment or house level, design a functional 2D floorplan layout on a metric grid (meters).

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
2. Strictly generate ALL rooms requested (e.g., if user asks forbedrooms, bathrooms, study, or open balcony, include all of them!).
3. If the user asks for a balcony, terrace, or deck, give that room "type": "balcony" and "is_outdoor": true. If the user does NOT ask for a balcony/terrace, do NOT include one.
4. Rooms MUST share walls in a contiguous block without floating gaps or overlaps.
5. Allowed room types: 'bedroom', 'living', 'kitchen', 'bathroom', 'dining', 'balcony', 'office'.
6. Return ONLY raw JSON without markdown formatting.`;

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
                                { role: "user", content: `Design Level ${floorIndex + 1} floorplan: ${promptText}` }
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
            console.log(`Serving architectural procedural CAD synthesis for Floor ${floorIndex + 1}:`, promptText);
            layout = generateProceduralFallback(promptText, floorIndex);
        }

        const scene3d = compileLayoutTo3DScene(layout, 2.8, 0.2, baseElevation, floorIndex, targetWidth, targetDepth, promptText);

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
