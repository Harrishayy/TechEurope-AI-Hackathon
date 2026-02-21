import os
import base64
import json

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in environment. Copy .env.example to .env and add your key.")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

app = FastAPI(title="Camera Annotation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    image: str = Field(description="Raw base64-encoded JPEG (no data URI prefix)")
    prompt: str = Field(default="", description="Optional voice/text prompt from user")
    width: int = Field(default=640, description="Captured frame width in pixels")
    height: int = Field(default=480, description="Captured frame height in pixels")


class BoundingBox(BaseModel):
    label: str
    box_2d: List[int] = Field(description="[ymin, xmin, ymax, xmax] normalized 0-1000")
    confidence: float = Field(default=1.0)


class AnalyzeResponse(BaseModel):
    description: str
    objects: List[BoundingBox]
    raw_prompt_used: str


class StepAnalyzeRequest(BaseModel):
    image: str = Field(description="Raw base64-encoded JPEG (no data URI prefix)")
    target_object: str = Field(description="The specific component to find (e.g. 'water tank')")
    step_instruction: str = Field(description="The current step instruction for context")
    hint: str = Field(default="", description="Optional spatial/visual hint for Gemini")
    width: int = Field(default=640)
    height: int = Field(default=480)


class StepBoundingBox(BaseModel):
    found: bool
    label: str = Field(default="")
    box_2d: List[int] = Field(default=[0, 0, 0, 0], description="[ymin, xmin, ymax, xmax] normalized 0-1000")
    confidence: float = Field(default=0.0)


class GenerateStepRequest(BaseModel):
    topic: str = Field(description="Free-form user description of what they want to learn")
    completed_steps: List[str] = Field(default=[], description="Descriptions of steps already completed")


class GenerateStepResponse(BaseModel):
    step_description: str = Field(description="Instruction to speak aloud to the user")
    target_object: str = Field(description="Physical component to locate on camera")
    short_action: str = Field(default="", description="2-4 word action phrase shown on the live annotation, e.g. 'Lift to open'")
    hint: str = Field(default="", description="Spatial hint to help find the component")
    is_complete: bool = Field(default=False)


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(user_prompt: str) -> str:
    if user_prompt.strip():
        task = user_prompt.strip()
        task_context = f"""Task: {task}

Identify ONLY the specific physical components directly relevant to this task.
Be precise — annotate sub-components, not whole objects. For example:
- "open a can" → annotate the can body AND the pull tab separately, not just "can"
- "make coffee" → annotate the water tank lid, pod compartment door, brew button — not the whole machine
- "open a bottle" → annotate the bottle cap, not the entire bottle

Prioritise components in the order the user should interact with them (first action first).
Return at most 5 objects."""
    else:
        task_context = """Task: Identify and briefly describe the most prominent objects visible in the scene.
Return at most 6 objects."""

    return f"""You are an intelligent vision assistant. Analyse the provided image.

{task_context}

Respond ONLY with a single valid JSON object — no markdown, no code fences, no explanation outside the JSON.
The JSON must exactly follow this schema:

{{
  "description": "<2-3 sentence description focused on the task context, suitable for text-to-speech>",
  "objects": [
    {{
      "label": "<specific component name>",
      "box_2d": [ymin, xmin, ymax, xmax],
      "confidence": <float 0.0 to 1.0>
    }}
  ]
}}

Rules:
- box_2d values are integers normalized to 0-1000 (0 = top/left edge, 1000 = bottom/right edge)
- box_2d order is strictly [ymin, xmin, ymax, xmax]
- description must be conversational and readable aloud — no special characters or markdown
- If no relevant objects are detected, return an empty objects array
- Do not include any text outside the JSON object"""


# ── Step prompt builder ───────────────────────────────────────────────────────

def build_step_prompt(target_object: str, step_instruction: str, hint: str) -> str:
    hint_clause = f"\nSpatial hint: {hint}" if hint.strip() else ""
    return f"""You are a computer vision assistant helping a user follow a step-by-step tutorial.

Current tutorial step: {step_instruction}
Target component to locate: {target_object}{hint_clause}

Your ONLY task: find the "{target_object}" in this image and return its bounding box.

Respond ONLY with a single valid JSON object — no markdown, no code fences, no explanation outside the JSON.

{{
  "found": <true or false>,
  "label": "<exact name of what you found, or empty string if not found>",
  "box_2d": [ymin, xmin, ymax, xmax],
  "confidence": <float 0.0 to 1.0>
}}

Rules:
- box_2d values are integers normalized 0-1000 (0 = top/left edge, 1000 = bottom/right edge)
- box_2d order is strictly [ymin, xmin, ymax, xmax]
- If you cannot confidently locate "{target_object}", set found to false and box_2d to [0, 0, 0, 0]
- Return exactly ONE object — the single best match for "{target_object}"
- Do not describe other objects in the scene
- Do not include any text outside the JSON object"""


# ── Generate-step prompt builder ──────────────────────────────────────────────

def build_generate_step_prompt(topic: str, completed_steps: List[str]) -> str:
    if completed_steps:
        history = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(completed_steps))
        history_clause = f"Steps already completed:\n{history}"
    else:
        history_clause = "No steps completed yet — this is the first step."

    return f"""The user wants to learn: "{topic}"

{history_clause}

Determine the NEXT logical step for this tutorial. Do not repeat any completed step.
Set is_complete to true only if all meaningful steps are already done.

Respond ONLY with a single valid JSON object — no markdown, no code fences.

{{
  "step_description": "<Friendly 1-2 sentence instruction, starts with an action verb, suitable for text-to-speech>",
  "target_object": "<Exact physical component to highlight on camera, max 8 words>",
  "short_action": "<2-4 word action shown ON the annotation overlay, e.g. 'Lift to open', 'Turn left', 'Press firmly', 'Pull tab up'>",
  "hint": "<Optional spatial clue about where to find this component in a camera view>",
  "is_complete": <true or false>
}}

Do not include any text outside the JSON object."""


# ── Endpoint — registered BEFORE the static file mount ───────────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    # Validate base64
    try:
        base64.b64decode(request.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    image_part = {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": request.image,
        }
    }

    prompt_text = build_prompt(request.prompt)

    try:
        response = model.generate_content(
            [prompt_text, image_part],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    raw_text = response.text.strip()

    # Defensive: strip markdown fences if Gemini ignores the instruction
    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        raw_text = "\n".join(lines[1:])          # drop first line (```json or ```)
        raw_text = raw_text.rsplit("```", 1)[0]  # drop trailing fence
        raw_text = raw_text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini returned invalid JSON: {e}. Raw response: {raw_text[:300]}",
        )

    objects = []
    for obj in parsed.get("objects", []):
        try:
            objects.append(BoundingBox(**obj))
        except Exception:
            continue  # skip malformed objects rather than failing the whole response

    return AnalyzeResponse(
        description=parsed.get("description", "No description available."),
        objects=objects,
        raw_prompt_used=prompt_text,
    )


@app.post("/analyze-step", response_model=StepBoundingBox)
async def analyze_step(request: StepAnalyzeRequest):
    try:
        base64.b64decode(request.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    image_part = {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": request.image,
        }
    }

    prompt_text = build_step_prompt(
        request.target_object,
        request.step_instruction,
        request.hint,
    )

    try:
        response = model.generate_content(
            [prompt_text, image_part],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=256,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    raw_text = response.text.strip()

    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        raw_text = "\n".join(lines[1:])
        raw_text = raw_text.rsplit("```", 1)[0]
        raw_text = raw_text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini returned invalid JSON: {e}. Raw: {raw_text[:300]}",
        )

    found = bool(parsed.get("found", False))
    box = parsed.get("box_2d", [0, 0, 0, 0])
    if not found:
        box = [0, 0, 0, 0]

    return StepBoundingBox(
        found=found,
        label=parsed.get("label", ""),
        box_2d=box,
        confidence=float(parsed.get("confidence", 0.0)),
    )


@app.post("/generate-step", response_model=GenerateStepResponse)
async def generate_step(request: GenerateStepRequest):
    prompt_text = build_generate_step_prompt(request.topic, request.completed_steps)

    try:
        response = model.generate_content(
            prompt_text,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=512,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    raw_text = response.text.strip()

    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        raw_text = "\n".join(lines[1:])
        raw_text = raw_text.rsplit("```", 1)[0]
        raw_text = raw_text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini returned invalid JSON: {e}. Raw: {raw_text[:300]}",
        )

    return GenerateStepResponse(
        step_description=parsed.get("step_description", ""),
        target_object=parsed.get("target_object", ""),
        short_action=parsed.get("short_action", ""),
        hint=parsed.get("hint", ""),
        is_complete=bool(parsed.get("is_complete", False)),
    )


# ── Static files — MUST come after all API routes ────────────────────────────

app.mount("/", StaticFiles(directory="static", html=True), name="static")
