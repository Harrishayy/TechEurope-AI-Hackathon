import os
import base64
import json
import asyncio
import time
from dataclasses import dataclass
from typing import List

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in environment. Copy .env.example to .env and add your key.")

live_client = genai.Client(api_key=GEMINI_API_KEY)
REST_MODEL = "gemini-2.5-flash"
LIVE_MODEL = "gemini-2.0-flash-live-001"

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


# ── Live API prompt builders ──────────────────────────────────────────────────

def build_live_system_prompt() -> str:
    return """You are a computer vision assistant embedded in a real-time tutorial system.

You will receive a continuous stream of camera frames from a user's device.
Your ONLY task is to locate a specified physical component in each frame and return its bounding box.

Output format — you MUST respond ONLY with a single valid JSON object, no markdown fences, no prose:
{
  "found": <true or false>,
  "label": "<component name or empty string>",
  "box_2d": [ymin, xmin, ymax, xmax],
  "confidence": <0.0 to 1.0>
}

Rules:
- box_2d values are integers normalized 0-1000 (0 = top/left, 1000 = bottom/right)
- box_2d order is strictly [ymin, xmin, ymax, xmax]
- If you cannot confidently locate the target, set found=false and box_2d=[0,0,0,0]
- Return exactly ONE JSON object per response — no additional text
- Do not describe the scene, do not explain your reasoning"""


def _build_step_context_message(target: str, instruction: str, hint: str) -> str:
    hint_clause = f"\nSpatial hint: {hint}" if hint.strip() else ""
    return (
        f"NEW STEP STARTED. Tutorial step: {instruction}\n"
        f"Target component to locate: {target}{hint_clause}\n"
        f"Watch the incoming camera frames and locate \"{target}\".\n"
        f"Respond to each frame with a single JSON object as specified."
    )


def _build_reinforcement_prompt(target: str, hint: str) -> str:
    hint_clause = f" Hint: {hint}" if hint.strip() else ""
    return f"Locate \"{target}\" in the next frame.{hint_clause} Respond with JSON only."


# ── Live API session state ────────────────────────────────────────────────────

@dataclass
class SessionState:
    session_id: str
    live_session: object
    target_object: str = ""
    step_instruction: str = ""
    hint: str = ""
    frame_count: int = 0
    last_frame_time: float = 0.0
    json_accumulator: str = ""
    is_active: bool = True


_sessions: dict = {}


# ── WebSocket proxy coroutines ────────────────────────────────────────────────

async def _browser_to_gemini(websocket: WebSocket, session_state: SessionState):
    """Reads frames/step messages from the browser and forwards to the Gemini Live session."""
    FRAME_INTERVAL = 1.0  # seconds — rate-gate to ~1 fps

    async for raw_msg in websocket.iter_text():
        if not session_state.is_active:
            break
        try:
            msg = json.loads(raw_msg)
        except json.JSONDecodeError:
            continue

        msg_type = msg.get("type")

        if msg_type == "frame":
            now = time.monotonic()
            if now - session_state.last_frame_time < FRAME_INTERVAL:
                continue  # drop frame — rate limiting
            session_state.last_frame_time = now
            session_state.frame_count += 1

            if not session_state.target_object:
                continue  # nothing to track yet

            frame_bytes = base64.b64decode(msg["data"])
            await session_state.live_session.send_realtime_input(
                video=genai_types.Blob(data=frame_bytes, mime_type="image/jpeg")
            )

            # Every 5 frames reinforce the instruction so the model stays focused
            if session_state.frame_count % 5 == 1:
                reinforcement = _build_reinforcement_prompt(
                    session_state.target_object, session_state.hint
                )
                await session_state.live_session.send_client_content(
                    turns=genai_types.Content(
                        role="user",
                        parts=[genai_types.Part(text=reinforcement)],
                    ),
                    turn_complete=True,
                )

        elif msg_type == "step":
            session_state.target_object    = msg.get("target_object", "")
            session_state.step_instruction = msg.get("step_instruction", "")
            session_state.hint             = msg.get("hint", "")
            session_state.frame_count      = 0
            session_state.json_accumulator = ""

            context_msg = _build_step_context_message(
                session_state.target_object,
                session_state.step_instruction,
                session_state.hint,
            )
            await session_state.live_session.send_client_content(
                turns=genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=context_msg)],
                ),
                turn_complete=True,
            )

        elif msg_type == "stop":
            session_state.is_active = False
            break


async def _gemini_to_browser(websocket: WebSocket, session_state: SessionState):
    """Reads streaming chunks from Gemini Live, assembles JSON, and pushes annotations to browser."""
    async for response in session_state.live_session.receive():
        if not session_state.is_active:
            break

        server_content = getattr(response, "server_content", None)
        if server_content is None:
            continue

        model_turn = getattr(server_content, "model_turn", None)
        if model_turn:
            for part in getattr(model_turn, "parts", []):
                text_chunk = getattr(part, "text", None)
                if text_chunk:
                    session_state.json_accumulator += text_chunk

        if getattr(server_content, "turn_complete", False):
            raw = session_state.json_accumulator.strip()
            session_state.json_accumulator = ""

            if not raw:
                continue

            # Strip markdown fences if model wraps output despite instruction
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:]).rsplit("```", 1)[0].strip()

            try:
                parsed = json.loads(raw)
                annotation = {
                    "type":       "annotation",
                    "found":      bool(parsed.get("found", False)),
                    "label":      parsed.get("label", ""),
                    "box_2d":     parsed.get("box_2d", [0, 0, 0, 0]),
                    "confidence": float(parsed.get("confidence", 0.0)),
                }
                await websocket.send_text(json.dumps(annotation))
            except Exception:
                await websocket.send_text(json.dumps({"type": "status", "message": "searching"}))


# ── WebSocket endpoint — registered BEFORE the static file mount ──────────────

@app.websocket("/ws/track/{session_id}")
async def websocket_track(websocket: WebSocket, session_id: str):
    await websocket.accept()

    live_config = genai_types.LiveConnectConfig(
        response_modalities=[genai_types.Modality.TEXT],
        system_instruction=build_live_system_prompt(),
    )

    try:
        async with live_client.aio.live.connect(model=LIVE_MODEL, config=live_config) as live_session:
            session_state = SessionState(session_id=session_id, live_session=live_session)
            _sessions[session_id] = session_state

            sender_task   = asyncio.create_task(_browser_to_gemini(websocket, session_state))
            receiver_task = asyncio.create_task(_gemini_to_browser(websocket, session_state))

            try:
                await asyncio.gather(sender_task, receiver_task)
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass
            finally:
                sender_task.cancel()
                receiver_task.cancel()
                session_state.is_active = False

        # Signal the client to reconnect (e.g. 2-minute session limit reached)
        try:
            await websocket.send_text(json.dumps({"type": "reconnect_required", "reason": "session_expired"}))
        except Exception:
            pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"type": "status", "message": f"stream error: {str(e)}"}))
        except Exception:
            pass
    finally:
        _sessions.pop(session_id, None)


# ── REST endpoints — registered BEFORE the static file mount ─────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    try:
        image_bytes = base64.b64decode(request.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    image_part  = genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
    prompt_text = build_prompt(request.prompt)

    try:
        response = await live_client.aio.models.generate_content(
            model=REST_MODEL,
            contents=[prompt_text, image_part],
            config=genai_types.GenerateContentConfig(
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
        raw_text = "\n".join(lines[1:])
        raw_text = raw_text.rsplit("```", 1)[0]
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
        image_bytes = base64.b64decode(request.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    image_part  = genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
    prompt_text = build_step_prompt(
        request.target_object,
        request.step_instruction,
        request.hint,
    )

    try:
        response = await live_client.aio.models.generate_content(
            model=REST_MODEL,
            contents=[prompt_text, image_part],
            config=genai_types.GenerateContentConfig(
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
        response = await live_client.aio.models.generate_content(
            model=REST_MODEL,
            contents=prompt_text,
            config=genai_types.GenerateContentConfig(
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
