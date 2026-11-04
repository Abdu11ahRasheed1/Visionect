import os
import sys
import argparse
import torch

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

from diffusers import AutoencoderKL, DPMSolverMultistepScheduler, StableDiffusionPipeline, UNet2DConditionModel
from transformers import CLIPTextModel, CLIPTokenizer
from peft import LoraConfig, set_peft_model_state_dict

def generate(args):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n[1/4] Loading cached pipeline components on {device}...", flush=True)

    tokenizer = CLIPTokenizer.from_pretrained(args.base_model, subfolder="tokenizer")
    text_encoder = CLIPTextModel.from_pretrained(
        args.base_model, subfolder="text_encoder", torch_dtype=torch.float16
    ).to(device)
    vae = AutoencoderKL.from_pretrained(
        args.base_model, subfolder="vae", torch_dtype=torch.float16
    ).to(device)
    unet = UNet2DConditionModel.from_pretrained(
        args.base_model, subfolder="unet", torch_dtype=torch.float16, variant="fp16", use_safetensors=True
    ).to(device)
    scheduler = DPMSolverMultistepScheduler.from_pretrained(args.base_model, subfolder="scheduler")

    print("[2/4] Assembling StableDiffusionPipeline...", flush=True)
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

    if args.lora_weights:
        print(f"[3/4] Applying trained Visionect LoRA from {args.lora_weights}...", flush=True)
        lora_config = LoraConfig(
            r=args.lora_rank,
            lora_alpha=args.lora_rank * 2,
            target_modules=["to_k", "to_q", "to_v", "to_out.0"],
        )
        pipe.unet.add_adapter(lora_config)
        weights_path = (
            os.path.join(args.lora_weights, "pytorch_lora_weights.pt")
            if os.path.isdir(args.lora_weights)
            else args.lora_weights
        )
        state_dict = torch.load(weights_path, map_location=device)
        set_peft_model_state_dict(pipe.unet, state_dict)
        print("      Visionect LoRA successfully attached to UNet!", flush=True)

    prompt = args.prompt
    negative_prompt = (
        "color, photograph, 3d render, perspective view, colored textures, blurry, messy, low quality, artifacts"
    )

    print(f"\n[4/4] Generating 2D blueprint (Prompt: \"{prompt}\")...", flush=True)
    generator = torch.Generator(device=device).manual_seed(args.seed) if args.seed is not None else None

    image = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance_scale,
        width=args.width,
        height=args.height,
        generator=generator,
    ).images[0]

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    image.save(args.output)
    print(f"\n[DONE] Saved generated 2D blueprint to: {args.output}\n", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", type=str, default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--lora_weights", type=str, default="checkpoints/visionect_blueprint_lora_final")
    parser.add_argument("--lora_rank", type=int, default=16)
    parser.add_argument("--prompt", type=str, default="Architectural 2D blueprint floor plan with 3 bedrooms, 2 bathrooms, kitchen, spacious living room, clean black and white line drawing.")
    parser.add_argument("--output", type=str, default="output_samples/sample_blueprint_1.png")
    parser.add_argument("--steps", type=int, default=25)
    parser.add_argument("--guidance_scale", type=float, default=7.5)
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    generate(args)
