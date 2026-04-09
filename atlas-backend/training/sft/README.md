# Local SFT / LoRA training (starter)

## What this script does

`train_lora.py` is a **minimal, single-GPU** pipeline: it loads a base chat model from Hugging Face (or a local path), attaches **PEFT LoRA** adapters, reads your **Atlas-approved** conversational examples from a JSONL file, and runs **TRL `SFTTrainer`** for a short supervised fine-tune. The result is a **user-local adapter** directory (weights + tokenizer files), not a redeploy of the whole Atlas service.

This is **not** global system training: each `userId` (or machine) keeps its own `sft.jsonl` and optional adapter under your data tree. Nothing here aggregates tenants or retrains a shared “Atlas brain.”

## Python packages

Install into a virtual environment (versions are typical; pin as needed for your GPU stack):

- `torch` (CUDA build matching your driver)
- `transformers`
- `datasets`
- `peft`
- `trl`
- `accelerate` (pulled in by TRL; useful for `device_map="auto"`)

Example:

```bash
pip install torch transformers datasets peft trl accelerate
```

## Expected JSONL format

One JSON object per line (newline-delimited). Each object **must** include a `messages` array in chat format:

```json
{"messages":[{"role":"user","content":"Remember I prefer UTC."},{"role":"assistant","content":"I'll use UTC for times."}]}
```

Optional extra keys (e.g. `meta`) are ignored by the starter script as long as `messages` is present. Atlas writes approved rows to `data/datasets/{userId}/sft.jsonl` with this shape.

## Example command

From `atlas-backend/training/sft/` (adjust paths to your user id and model):

```bash
python train_lora.py \
  --model_name meta-llama/Llama-3.1-8B-Instruct \
  --dataset_path ../../data/datasets/your-user-id/sft.jsonl \
  --output_dir ./out-lora-your-user-id
```

## Notes

- **Target modules** in the script assume Llama-style attention projections (`q_proj`, `k_proj`, `v_proj`, `o_proj`). Other architectures may need edits.
- **No distributed training**: no `torchrun`, no multi-node; one process, `device_map="auto"`.
- After training, merging or serving the adapter (Ollama Modelfile, vLLM, etc.) is **out of scope** for this starter; see your inference stack’s docs.
