import os
import re
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from tqdm import tqdm

def parse_svg_rooms(svg_path):
    """
    Parses a CubiCasa5k model.svg file to extract room types and counts.
    """
    rooms = {
        'bedroom': 0,
        'bathroom': 0,
        'kitchen': 0,
        'living_room': 0,
        'balcony_terrace': 0,
        'storage': 0,
        'garage': 0,
        'entry_hall': 0
    }
    
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        
        for elem in root.iter():
            cls = elem.get('class', '')
            if not cls.startswith('Space'):
                continue
            
            cls_lower = cls.lower()
            if 'bedroom' in cls_lower:
                rooms['bedroom'] += 1
            elif 'bath' in cls_lower or 'toilet' in cls_lower or 'shower' in cls_lower or 'sauna' in cls_lower:
                rooms['bathroom'] += 1
            elif 'kitchen' in cls_lower or 'cooking' in cls_lower:
                rooms['kitchen'] += 1
            elif 'living' in cls_lower or 'lounge' in cls_lower or 'family' in cls_lower:
                rooms['living_room'] += 1
            elif 'terrace' in cls_lower or 'balcony' in cls_lower or 'patio' in cls_lower or 'deck' in cls_lower:
                rooms['balcony_terrace'] += 1
            elif 'storage' in cls_lower or 'closet' in cls_lower or 'wardrobe' in cls_lower or 'pantry' in cls_lower:
                rooms['storage'] += 1
            elif 'garage' in cls_lower or 'carport' in cls_lower:
                rooms['garage'] += 1
            elif 'entry' in cls_lower or 'hall' in cls_lower or 'corridor' in cls_lower or 'lobby' in cls_lower:
                rooms['entry_hall'] += 1
                
    except Exception as e:
        return None
        
    return rooms

def generate_captions(rooms):
    """
    Generates natural, diverse architectural blueprint captions based on parsed room counts.
    """
    beds = rooms['bedroom']
    baths = rooms['bathroom']
    
    # Base feature list
    features = []
    if beds > 0:
        features.append(f"{beds} bedroom{'s' if beds > 1 else ''}")
    if baths > 0:
        features.append(f"{baths} bathroom{'s' if baths > 1 else ''}")
    if rooms['kitchen'] > 0:
        features.append("kitchen")
    if rooms['living_room'] > 0:
        features.append("spacious living room")
    if rooms['garage'] > 0:
        features.append("garage")
    if rooms['balcony_terrace'] > 0:
        features.append("balcony/terrace")
        
    feature_str = ", ".join(features) if features else "modern residential layout"
    
    captions = [
        f"Architectural 2D blueprint floor plan with {feature_str}, clean black and white line drawing.",
        f"Residential house floor plan layout featuring {beds} beds and {baths} baths, 2D architectural blueprint.",
        f"Black and white 2D blueprint of a residential house with {feature_str}.",
        f"Detailed 2D architectural floor plan blueprint showing {feature_str}."
    ]
    return captions

def process_dataset(base_dir, output_dir, max_samples=None):
    os.makedirs(output_dir, exist_ok=True)
    images_out_dir = os.path.join(output_dir, "images")
    os.makedirs(images_out_dir, exist_ok=True)
    
    metadata_records = []
    
    # Priority folders: architectural line blueprints first, then standard high quality
    subfolders = ["high_quality_architectural", "high_quality", "colorful"]
    
    total_processed = 0
    
    for sub in subfolders:
        sub_path = os.path.join(base_dir, sub)
        if not os.path.isdir(sub_path):
            continue
            
        print(f"Scanning folder: {sub}...")
        sample_ids = sorted(os.listdir(sub_path))
        
        for sample_id in tqdm(sample_ids, desc=f"Processing {sub}"):
            sample_dir = os.path.join(sub_path, sample_id)
            if not os.path.isdir(sample_dir):
                continue
                
            svg_file = os.path.join(sample_dir, "model.svg")
            if not os.path.exists(svg_file):
                continue
                
            # Preferred image: F1_scaled.png or F1_original.png
            img_file = None
            for candidate in ["F1_scaled.png", "F1_original.png"]:
                p = os.path.join(sample_dir, candidate)
                if os.path.exists(p):
                    img_file = p
                    break
                    
            if not img_file:
                continue
                
            rooms = parse_svg_rooms(svg_file)
            if not rooms:
                continue
                
            # Filter out empty or single-wall incomplete models
            if rooms['bedroom'] == 0 and rooms['living_room'] == 0:
                continue
                
            captions = generate_captions(rooms)
            
            # Target image path in processed folder
            out_img_name = f"{sub}_{sample_id}.png"
            out_img_path = os.path.join(images_out_dir, out_img_name)
            
            # Convert / resize to square or standard 512x512 / 1024x1024 or copy
            try:
                with Image.open(img_file) as im:
                    im_rgb = im.convert("RGB")
                    # Save optimized PNG
                    im_rgb.save(out_img_path, format="PNG", optimize=True)
            except Exception as e:
                continue
                
            record = {
                "file_name": f"images/{out_img_name}",
                "text": captions[0], # Primary prompt
                "captions": captions,
                "rooms": rooms,
                "source": sub,
                "sample_id": sample_id
            }
            metadata_records.append(record)
            total_processed += 1
            
            if max_samples and total_processed >= max_samples:
                break
                
        if max_samples and total_processed >= max_samples:
            break
            
    # Write metadata.jsonl
    metadata_path = os.path.join(output_dir, "metadata.jsonl")
    with open(metadata_path, "w", encoding="utf-8") as f:
        for rec in metadata_records:
            f.write(json.dumps(rec) + "\n")
            
    print(f"\nSuccessfully processed {total_processed} blueprint samples.")
    print(f"Metadata saved to: {metadata_path}")
    print(f"Images saved to: {images_out_dir}")

if __name__ == "__main__":
    import sys
    base_data_path = r"data\cubicasa5k\cubicasa5k"
    out_path = r"processed_data"
    process_dataset(base_data_path, out_path)
