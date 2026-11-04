import os
import sys
import glob
import time
import math
import argparse
import json
from pathlib import Path

# Ensure unbuffered real-time stdout output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

import torch
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
from tqdm.auto import tqdm

from diffusers import AutoencoderKL, DDPMScheduler, UNet2DConditionModel
from diffusers.optimization import get_scheduler
from transformers import CLIPTextModel, CLIPTokenizer
from peft import LoraConfig, get_peft_model_state_dict, set_peft_model_state_dict

class BlueprintDataset(Dataset):
    def __init__(self, metadata_path, base_img_dir, size=512, tokenizer=None):
        self.base_img_dir = Path(base_img_dir)
        self.size = size
        self.tokenizer = tokenizer
        
        self.records = []
        with open(metadata_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    self.records.append(json.loads(line))
                    
        self.image_transforms = transforms.Compose([
            transforms.Resize(size, interpolation=transforms.InterpolationMode.BILINEAR),
            transforms.CenterCrop(size),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        img_rel_path = rec["file_name"]
        full_img_path = self.base_img_dir / img_rel_path
        
        try:
            image = Image.open(full_img_path).convert("RGB")
        except Exception:
            image = Image.new("RGB", (self.size, self.size), color=(255, 255, 255))
            
        pixel_values = self.image_transforms(image)
        prompt = rec.get("text", "Architectural 2D blueprint floor plan, clean black and white line drawing")
        
        input_ids = self.tokenizer(
            prompt,
            truncation=True,
            padding="max_length",
            max_length=self.tokenizer.model_max_length,
            return_tensors="pt",
        ).input_ids[0]

        return {"pixel_values": pixel_values, "input_ids": input_ids}


def find_latest_checkpoint(output_dir):
    checkpoints = glob.glob(os.path.join(output_dir, "checkpoint-*"))
    if not checkpoints:
        return None
    def get_step(path):
        try:
            return int(path.split("-")[-1])
        except ValueError:
            return -1
    checkpoints = sorted(checkpoints, key=get_step)
    return checkpoints[-1] if get_step(checkpoints[-1]) >= 0 else None


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n=======================================================", flush=True)
    print(f" Initializing Visionect AI Training Pipeline", flush=True)
    print(f" Compute Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})", flush=True)
    print(f" Base Model: {args.pretrained_model_name_or_path}", flush=True)
    print(f" Mixed Precision: {args.mixed_precision.upper()} (Native Blackwell Tensor Acceleration)", flush=True)
    print(f"=======================================================\n", flush=True)
    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Load Tokenizer & Scheduler
    print("[1/5] Loading CLIP Tokenizer & DDPM Scheduler...", flush=True)
    tokenizer = CLIPTokenizer.from_pretrained(args.pretrained_model_name_or_path, subfolder="tokenizer")
    noise_scheduler = DDPMScheduler.from_pretrained(args.pretrained_model_name_or_path, subfolder="scheduler")

    amp_dtype = torch.bfloat16 if args.mixed_precision == "bf16" else (torch.float16 if args.mixed_precision == "fp16" else torch.float32)

    # 2. Load Text Encoder & VAE
    print(f"[2/5] Loading CLIP Text Encoder ({args.mixed_precision})...", flush=True)
    text_encoder = CLIPTextModel.from_pretrained(
        args.pretrained_model_name_or_path,
        subfolder="text_encoder",
        torch_dtype=amp_dtype,
    )

    print(f"[3/5] Loading VAE Autoencoder ({args.mixed_precision})...", flush=True)
    vae = AutoencoderKL.from_pretrained(
        args.pretrained_model_name_or_path,
        subfolder="vae",
        torch_dtype=amp_dtype,
    )

    # 3. Load UNet Backbone
    print(f"[4/5] Loading UNet Backbone ({args.mixed_precision} safetensors)...", flush=True)
    unet = UNet2DConditionModel.from_pretrained(
        args.pretrained_model_name_or_path,
        subfolder="unet",
        torch_dtype=amp_dtype,
        variant="fp16",
        use_safetensors=True,
    )
    print("      UNet backbone loaded successfully!", flush=True)

    # Freeze base models
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    unet.requires_grad_(False)

    vae.to(device)
    text_encoder.to(device)
    unet.to(device)

    # 4. Attach PEFT LoRA Config to UNet
    print(f"\n[5/5] Attaching LoRA adapters (rank={args.lora_rank}, alpha={args.lora_rank * 2})...", flush=True)
    target_modules = ["to_k", "to_q", "to_v", "to_out.0"]
    for tm in target_modules:
        print(f"      -> Injected LoRA rank-{args.lora_rank} adapter into target: {tm}", flush=True)
        
    lora_config = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_rank * 2,
        init_lora_weights="gaussian",
        target_modules=target_modules,
    )
    unet.add_adapter(lora_config)

    # Keep trainable LoRA weights in float32 for gradient stability
    for p in unet.parameters():
        if p.requires_grad:
            p.data = p.data.to(torch.float32)

    trainable_params = sum(p.numel() for p in unet.parameters() if p.requires_grad)
    frozen_params = sum(p.numel() for p in unet.parameters() if not p.requires_grad)
    print(f"\n  LoRA Adapters Successfully Attached!", flush=True)
    print(f"   * Trainable LoRA Parameters: {trainable_params:,} ({trainable_params * 4 / (1024**2):.2f} MB)", flush=True)
    print(f"   * Frozen Base UNet Parameters: {frozen_params:,}", flush=True)
    print(f"   * Parameter Efficiency: {(trainable_params / (trainable_params + frozen_params)) * 100:.2f}% of model", flush=True)

    if args.gradient_checkpointing:
        unet.enable_gradient_checkpointing()
        print("   * Gradient Checkpointing: ENABLED (Saves ~40% VRAM)", flush=True)

    # 5. Optimizer
    lora_trainable_parameters = [p for p in unet.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(
        lora_trainable_parameters,
        lr=args.learning_rate,
        betas=(0.9, 0.999),
        weight_decay=1e-2,
        eps=1e-08,
    )

    # 6. Dataset & DataLoader
    print(f"\nLoading dataset from {args.metadata_path}...", flush=True)
    dataset = BlueprintDataset(
        metadata_path=args.metadata_path,
        base_img_dir=args.data_dir,
        size=args.resolution,
        tokenizer=tokenizer,
    )
    dataloader = DataLoader(
        dataset,
        batch_size=args.train_batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=True,
    )

    total_steps = len(dataloader) * args.num_epochs // args.gradient_accumulation_steps
    lr_scheduler = get_scheduler(
        args.lr_scheduler,
        optimizer=optimizer,
        num_warmup_steps=args.lr_warmup_steps,
        num_training_steps=total_steps,
    )

    # GradScaler only needed for pure fp16, not for native bf16
    use_scaler = (args.mixed_precision == "fp16")
    scaler = torch.amp.GradScaler('cuda', enabled=use_scaler)

    # 7. Checkpoint Resume Logic
    start_step = 0
    start_epoch = 0
    latest_ckpt = find_latest_checkpoint(args.output_dir) if args.resume_from_checkpoint else None

    if latest_ckpt:
        print(f"\n[AUTO-RESUME] Found existing checkpoint: {latest_ckpt}", flush=True)
        weights_file = os.path.join(latest_ckpt, "pytorch_lora_weights.pt")
        if os.path.exists(weights_file):
            state_dict = torch.load(weights_file, map_location=device)
            set_peft_model_state_dict(unet, state_dict)
            print(f"[AUTO-RESUME] Loaded LoRA weights from {weights_file}", flush=True)
            
        state_file = os.path.join(latest_ckpt, "training_state.pt")
        if os.path.exists(state_file):
            state = torch.load(state_file, map_location=device)
            optimizer.load_state_dict(state["optimizer"])
            lr_scheduler.load_state_dict(state["lr_scheduler"])
            if "scaler" in state and use_scaler and state["scaler"]:
                scaler.load_state_dict(state["scaler"])
            start_step = state.get("step", 0)
            start_epoch = state.get("epoch", 0)
            print(f"[AUTO-RESUME] Successfully restored state at Step {start_step}, Epoch {start_epoch}!\n", flush=True)

    last_checkpoint_time = time.time()
    checkpoint_interval_seconds = args.checkpoint_interval_minutes * 60

    print(f"=======================================================", flush=True)
    print(f" Visionect Blueprint Training Loop Ready", flush=True)
    print(f" Total Floorplans: {len(dataset)} samples", flush=True)
    print(f" Epochs: {args.num_epochs} | Batches per Epoch: {len(dataloader)}", flush=True)
    print(f" Batch Size: {args.train_batch_size} (Eff. Batch: {args.train_batch_size * args.gradient_accumulation_steps})", flush=True)
    print(f" Total Training Steps: {total_steps}", flush=True)
    print(f" Auto-Save Checkpoint: Every {args.checkpoint_interval_minutes} minutes", flush=True)
    print(f" Checkpoint Output Dir: {args.output_dir}", flush=True)
    print(f"=======================================================\n", flush=True)

    global_step = start_step
    progress_bar = tqdm(total=total_steps, initial=start_step, desc="Training", unit="step")

    for epoch in range(start_epoch, args.num_epochs):
        unet.train()
        epoch_loss = 0.0
        
        for step, batch in enumerate(dataloader):
            with torch.amp.autocast('cuda', dtype=amp_dtype):
                # Encode images to latents
                latents = vae.encode(batch["pixel_values"].to(device, dtype=amp_dtype)).latent_dist.sample()
                latents = latents * vae.config.scaling_factor

                noise = torch.randn_like(latents)
                bsz = latents.shape[0]
                timesteps = torch.randint(0, noise_scheduler.config.num_train_timesteps, (bsz,), device=latents.device).long()

                noisy_latents = noise_scheduler.add_noise(latents, noise, timesteps)
                encoder_hidden_states = text_encoder(batch["input_ids"].to(device))[0]

                model_pred = unet(noisy_latents, timesteps, encoder_hidden_states).sample

                if noise_scheduler.config.prediction_type == "epsilon":
                    target = noise
                elif noise_scheduler.config.prediction_type == "v_prediction":
                    target = noise_scheduler.get_velocity(latents, noise, timesteps)
                else:
                    target = noise

                loss = F.mse_loss(model_pred.float(), target.float(), reduction="mean")
                loss = loss / args.gradient_accumulation_steps

            if use_scaler:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            epoch_loss += loss.item() * args.gradient_accumulation_steps

            if (step + 1) % args.gradient_accumulation_steps == 0:
                if use_scaler:
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    optimizer.step()

                optimizer.zero_grad()
                lr_scheduler.step()
                global_step += 1
                progress_bar.update(1)
                
                current_lr = lr_scheduler.get_last_lr()[0]
                progress_bar.set_postfix({
                    "loss": f"{loss.item() * args.gradient_accumulation_steps:.4f}",
                    "lr": f"{current_lr:.2e}",
                    "epoch": f"{epoch + 1}/{args.num_epochs}"
                })

                # Check 30-minute timer for power outage safety
                current_time = time.time()
                if (current_time - last_checkpoint_time) >= checkpoint_interval_seconds:
                    ckpt_dir = os.path.join(args.output_dir, f"checkpoint-{global_step}")
                    print(f"\n[30-MIN AUTO-SAVE] Saving checkpoint at step {global_step} to {ckpt_dir}...", flush=True)
                    os.makedirs(ckpt_dir, exist_ok=True)
                    lora_state = get_peft_model_state_dict(unet)
                    torch.save(lora_state, os.path.join(ckpt_dir, "pytorch_lora_weights.pt"))
                    torch.save({
                        "step": global_step,
                        "epoch": epoch,
                        "optimizer": optimizer.state_dict(),
                        "lr_scheduler": lr_scheduler.state_dict(),
                        "scaler": scaler.state_dict() if use_scaler else None,
                    }, os.path.join(ckpt_dir, "training_state.pt"))
                    last_checkpoint_time = current_time
                    print(f"[30-MIN AUTO-SAVE] Checkpoint safely saved at Step {global_step}!\n", flush=True)

    # Final Save
    final_dir = os.path.join(args.output_dir, "visionect_blueprint_lora_final")
    print(f"\n[COMPLETED] Training finished! Saving final model to {final_dir}...", flush=True)
    os.makedirs(final_dir, exist_ok=True)
    final_lora_state = get_peft_model_state_dict(unet)
    torch.save(final_lora_state, os.path.join(final_dir, "pytorch_lora_weights.pt"))
    print("Done!", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pretrained_model_name_or_path", type=str, default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--metadata_path", type=str, default="processed_data/metadata.jsonl")
    parser.add_argument("--data_dir", type=str, default="processed_data")
    parser.add_argument("--output_dir", type=str, default="checkpoints")
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--train_batch_size", type=int, default=4)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=2)
    parser.add_argument("--num_epochs", type=int, default=10)
    parser.add_argument("--learning_rate", type=float, default=1e-4)
    parser.add_argument("--lora_rank", type=int, default=16)
    parser.add_argument("--lr_scheduler", type=str, default="cosine")
    parser.add_argument("--lr_warmup_steps", type=int, default=100)
    parser.add_argument("--mixed_precision", type=str, default="bf16", choices=["no", "fp16", "bf16"])
    parser.add_argument("--gradient_checkpointing", action="store_true", default=True)
    parser.add_argument("--num_workers", type=int, default=2)
    parser.add_argument("--checkpoint_interval_minutes", type=int, default=30)
    parser.add_argument("--resume_from_checkpoint", action="store_true", default=True)

    args = parser.parse_args()
    train(args)
