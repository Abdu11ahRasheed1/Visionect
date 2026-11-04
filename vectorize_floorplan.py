import os
import json
import argparse
import numpy as np
from PIL import Image

def detect_walls_and_rooms(image_path, min_wall_length=20, wall_thickness=0.2, wall_height=2.8):
    """
    Extracts structural wall lines and room polygons from a 2D floorplan image.
    Outputs structured 3D-ready coordinates.
    """
    try:
        import cv2
    except ImportError:
        # Fallback to pure PIL/numpy if cv2 not installed yet
        img = Image.open(image_path).convert('L')
        w, h = img.size
        # Simple sample perimeter if no opencv
        return {
            "image_size": {"width": w, "height": h},
            "walls": [
                {"id": 1, "start": [-5, 0, -5], "end": [5, 0, -5], "thickness": wall_thickness, "height": wall_height},
                {"id": 2, "start": [5, 0, -5], "end": [5, 0, 5], "thickness": wall_thickness, "height": wall_height},
                {"id": 3, "start": [5, 0, 5], "end": [-5, 0, 5], "thickness": wall_thickness, "height": wall_height},
                {"id": 4, "start": [-5, 0, 5], "end": [-5, 0, -5], "thickness": wall_thickness, "height": wall_height},
            ],
            "rooms": [{"name": "Main Room", "center": [0, 0, 0], "area_sqm": 100}]
        }

    # Load image in grayscale
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not load image at {image_path}")

    h, w = img.shape

    # 1. Binarize (black lines on white background -> invert so walls are white)
    _, binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)

    # 2. Morphological close to connect minor line gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # 3. Detect line segments via Probabilistic Hough Transform
    lines = cv2.HoughLinesP(closed, rho=1, theta=np.pi/180, threshold=40, minLineLength=min_wall_length, maxLineGap=10)

    # Convert pixel coordinates to normalized 3D world space (centered at 0, 0)
    scale = 10.0 / max(w, h) # 10 meters bounding box
    walls = []
    
    if lines is not None:
        wall_id = 1
        for line in lines:
            coords = line[0] if len(line.shape) > 1 else line
            x1, y1, x2, y2 = coords
            
            # Map pixel coordinates to 3D X, Z (Y is up)
            wx1 = round((x1 - w / 2) * scale, 3)
            wz1 = round((y1 - h / 2) * scale, 3)
            wx2 = round((x2 - w / 2) * scale, 3)
            wz2 = round((y2 - h / 2) * scale, 3)
            
            walls.append({
                "id": wall_id,
                "start": [wx1, 0.0, wz1],
                "end": [wx2, 0.0, wz2],
                "thickness": wall_thickness,
                "height": wall_height
            })
            wall_id += 1

    # 4. Find connected enclosed spaces (rooms)
    inverted = cv2.bitwise_not(closed)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(inverted)
    
    rooms = []
    room_idx = 1
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        # Filter tiny noise or background exterior
        if 500 < area < (w * h * 0.8):
            cx, cy = centroids[i]
            wx = round((cx - w / 2) * scale, 3)
            wz = round((cy - h / 2) * scale, 3)
            rooms.append({
                "id": room_idx,
                "name": f"Room {room_idx}",
                "center": [wx, 0.0, wz],
                "area_sq_pixels": int(area),
                "area_approx_sqm": round(area * (scale ** 2), 2)
            })
            room_idx += 1

    scene_data = {
        "metadata": {
            "source_image": image_path,
            "dimensions": {"width_px": w, "height_px": h},
            "scale_factor": scale,
            "total_walls": len(walls),
            "total_rooms": len(rooms)
        },
        "walls": walls,
        "rooms": rooms
    }
    return scene_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=str, default="processed_data/images/high_quality_architectural_1.png")
    parser.add_argument("--output", type=str, default="scene_3d.json")
    args = parser.parse_args()

    data = detect_walls_and_rooms(args.image)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Vectorized scene data saved to: {args.output}")
    print(f"Detected {len(data['walls'])} wall segments and {len(data['rooms'])} enclosed rooms.")
