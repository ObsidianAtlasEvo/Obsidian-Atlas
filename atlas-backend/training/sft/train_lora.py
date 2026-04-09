#!/usr/bin/env python3
"""
Starter local LoRA fine-tune using TRL SFTTrainer + PEFT.
User-local adapter only — not a global Atlas system train.

Example:
  python train_lora.py \\
    --model_name meta-llama/Llama-3.1-8B-Instruct \\
    --dataset_path ../../data/datasets/your-user-id/sft.jsonl \\
    --output_dir ./out-lora
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from trl import SFTTrainer


def load_conversational_jsonl(path: Path) -> Dataset:
    """Each line: JSON object with a \"messages\" list of {role, content} turns."""
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if "messages" not in obj:
                raise SystemExit(f"Line {i}: missing \"messages\" key")
            rows.append({"messages": obj["messages"]})
    if not rows:
        raise SystemExit("Dataset is empty")
    return Dataset.from_list(rows)


def main() -> None:
    p = argparse.ArgumentParser(description="Atlas starter LoRA (SFT + PEFT, single GPU)")
    p.add_argument("--model_name", required=True, help="HF model id or local path")
    p.add_argument("--dataset_path", type=Path, required=True, help="Path to sft.jsonl")
    p.add_argument("--output_dir", type=Path, required=True, help="Where to save adapter + tokenizer")
    p.add_argument("--max_steps", type=int, default=200, help="Short default for smoke runs")
    p.add_argument("--learning_rate", type=float, default=2e-4)
    args = p.parse_args()

    if not args.dataset_path.is_file():
        raise SystemExit(f"Dataset not found: {args.dataset_path}")

    # 1) Load tokenizer — chat template is used below to turn each row into training text.
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2) Load base causal LM (device_map=\"auto\" uses one or more local GPUs; no distributed launcher).
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        trust_remote_code=True,
        device_map="auto",
    )

    # 3) Attach LoRA adapters — only low-rank matrices train; base weights stay frozen.
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        # Llama-style names; change if your checkpoint uses different module names.
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    )
    model = get_peft_model(model, peft_config)

    # 4) Build a Hugging Face Dataset from the JSONL file (default: data/datasets/{userId}/sft.jsonl).
    dataset = load_conversational_jsonl(args.dataset_path)

    # 5) TrainingArguments — single-process only (no torchrun / DeepSpeed in this script).
    training_args = TrainingArguments(
        output_dir=str(args.output_dir),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        max_steps=args.max_steps,
        logging_steps=10,
        save_steps=100,
        report_to="none",
    )

    # 6) Turn each example's \"messages\" into a single string via the tokenizer's chat template.
    def formatting_func(example: dict) -> str:
        return tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )

    # 7) SFTTrainer — TRL runs supervised fine-tuning on the formatted text.
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        processing_class=tokenizer,
        formatting_func=formatting_func,
    )

    # 8) Train locally, then save adapter + tokenizer for merge or downstream serving.
    trainer.train()
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(str(args.output_dir))
    print(f"Done. Adapter saved to {args.output_dir}")


if __name__ == "__main__":
    main()
