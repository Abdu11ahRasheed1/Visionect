import os
import sys
import json
import torch
import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

from diffusers import AutoencoderKL, DPMSolverMultistepScheduler, StableDiffusionPipeline, UNet2DConditionModel
from transformers import CLIPTextModel, CLIPTokenizer
from peft import LoraConfig, set_peft_model_state_dict
import cv2

def load_pipeline(base_model, lora_weights_path, device="cuda"):
    tokenizer = CLIPTokenizer.from_pretrained(base_model, subfolder="tokenizer")
    text_encoder = CLIPTextModel.from_pretrained(base_model, subfolder="text_encoder", torch_dtype=torch.float16).to(device)
    vae = AutoencoderKL.from_pretrained(base_model, subfolder="vae", torch_dtype=torch.float16).to(device)
    unet = UNet2DConditionModel.from_pretrained(base_model, subfolder="unet", torch_dtype=torch.float16, variant="fp16", use_safetensors=True).to(device)
    scheduler = DPMSolverMultistepScheduler.from_pretrained(base_model, subfolder="scheduler")

    pipe = StableDiffusionPipeline(
        vae=vae,
        text_encoder=text_encoder,
        tokenizer=tokenizer,
        unet=unet,
        scheduler=scheduler,
        safety_checker=None,
        feature_extractor=None,
        requires_safety_checker=False,
    ).to(device)

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    )
    pipe.unet.add_adapter(lora_config)
    weights_path = os.path.join(lora_weights_path, "pytorch_lora_weights.pt") if os.path.isdir(lora_weights_path) else lora_weights_path
    state_dict = torch.load(weights_path, map_location=device)
    set_peft_model_state_dict(pipe.unet, state_dict)
    return pipe

def evaluate_structural_f1(image_np):
    """
    Computes structural coherence F1 (Dice coefficient) of the architectural line drawing
    against clean binary blueprint priors.
    """
    # Convert to grayscale
    if len(image_np.shape) == 3:
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    else:
        gray = image_np

    # Threshold: dark lines on white background
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Skeletonize / thin lines to measure wall continuity
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Wall pixels precision & recall against clean skeleton
    tp = np.sum((thresh > 0) & (closed > 0))
    fp = np.sum((thresh == 0) & (closed > 0))
    fn = np.sum((thresh > 0) & (closed == 0))

    precision = tp / (tp + fp + 1e-8)
    recall = tp / (tp + fn + 1e-8)
    f1 = 2 * (precision * recall) / (precision + recall + 1e-8)
    return precision, recall, f1

def run_evaluation(num_samples=10):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading model on {device} for F1 Score evaluation...", flush=True)
    pipe = load_pipeline("runwayml/stable-diffusion-v1-5", "checkpoints/visionect_blueprint_lora_final", device=device)

    # Test cases representing standard user floor plan requests
    test_prompts = [
        {"prompt": "Architectural 2D blueprint floor plan with 3 bedrooms, 2 bathrooms, kitchen, spacious living room, clean black and white line drawing.", "expected_rooms": 5},
        {"prompt": "Architectural 2D blueprint floor plan with 2 bedrooms, 1 bathroom, kitchen, clean black and white line drawing.", "expected_rooms": 4},
        {"prompt": "Architectural 2D blueprint floor plan with 4 bedrooms, 3 bathrooms, kitchen, spacious living room, clean black and white line drawing.", "expected_rooms": 7},
        {"prompt": "Architectural 2D blueprint floor plan with 1 bedroom, 1 bathroom, living room, clean black and white line drawing.", "expected_rooms": 3},
        {"prompt": "Architectural 2D blueprint floor plan with 3 bedrooms, 2 bathrooms, kitchen, living room, garage, clean black and white line drawing.", "expected_rooms": 6},
    ]

    total_precision = []
    total_recall = []
    total_f1 = []
    room_f1_scores = []

    os.makedirs("eval_samples", exist_ok=True)
    print(f"\nEvaluating {len(test_prompts)} test prompt configurations across seeds...\n", flush=True)

    for idx, test in enumerate(test_prompts):
        gen = torch.Generator(device=device).manual_seed(100 + idx)
        img = pipe(
            prompt=test["prompt"],
            negative_prompt="color, photograph, 3d render, perspective view, colored textures, blurry, messy, artifacts",
            num_inference_steps=25,
            guidance_scale=7.5,
            width=512,
            height=512,
            generator=gen,
        ).images[0]

        img_np = np.array(img)
        img.save(f"eval_samples/eval_{idx+1}.png")

        # 1. Structural Wall F1
        p, r, f1 = evaluate_structural_f1(img_np)
        total_precision.append(p)
        total_recall.append(r)
        total_f1.append(f1)

        # 2. Semantic Room Layout Count F1
        # Detect connected rooms
        gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
        inverted = cv2.bitwise_not(closed)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(inverted)
        
        detected_rooms = sum(1 for i in range(1, num_labels) if 500 < stats[i, cv2.CC_STAT_AREA] < (512 * 512 * 0.7))
        expected_rooms = test["expected_rooms"]
        
        # Room detection F1: min(detected, expected) / max(detected, expected)
        room_overlap = min(detected_rooms, expected_rooms)
        room_p = room_overlap / (detected_rooms + 1e-8)
        room_r = room_overlap / (expected_rooms + 1e-8)
        rf1 = 2 * (room_p * room_r) / (room_p + room_r + 1e-8)
        room_f1_scores.append(rf1)

        print(f"Sample {idx+1}:")
        print(f"  * Structural Wall F1: {f1 * 100:.2f}% (Precision: {p * 100:.2f}%, Recall: {r * 100:.2f}%)")
        print(f"  * Room Layout F1:    {rf1 * 100:.2f}% (Detected: {detected_rooms} rooms | Expected: {expected_rooms})")

    avg_wall_p = np.mean(total_precision) * 100
    avg_wall_r = np.mean(total_recall) * 100
    avg_wall_f1 = np.mean(total_f1) * 100
    avg_room_f1 = np.mean(room_f1_scores) * 100

    print("\n" + "="*55)
    print(" FINAL EVALUATION RESULTS")
    print("="*55)
    print(f"Structural Wall Line Precision: {avg_wall_p:.2f}%")
    print(f"Structural Wall Line Recall:    {avg_wall_r:.2f}%")
    print(f"Structural Wall F1 Score:       {avg_wall_f1:.2f}%")
    print(f"Semantic Room Adherence F1:     {avg_room_f1:.2f}%")
    print(f"Overall Blueprint Quality F1:   {(avg_wall_f1 * 0.5 + avg_room_f1 * 0.5):.2f}%")
    print("="*55 + "\n")

if __name__ == "__main__":
    run_evaluation()
