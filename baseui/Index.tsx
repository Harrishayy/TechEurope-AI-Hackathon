import { useState, useRef, useCallback } from "react";
import { generateText, analyzeImages, type SOP } from "@/lib/gemini";
import { sampleFramesFromVideo } from "@/lib/frames";
import Spinner from "@/components/Spinner";
import SOPPreview from "@/components/SOPPreview";
import LiveRecorder from "@/components/LiveRecorder";
import MessageBanner from "@/components/MessageBanner";

type Mode = "text" | "video" | "live";
type Msg = { type: "success" | "error"; text: string } | null;

const Index = () => {
  const [mode, setMode] = useState<Mode>("text");
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [sop, setSop] = useState<SOP | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const liveFramesRef = useRef<string[]>([]);
  const liveBlobRef = useRef<Blob | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const getApiKey = () => localStorage.getItem("skilllens_api_key");

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleGenerate = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      showMsg("error", "API key not configured. Set it on the home page.");
      return;
    }

    setSop(null);
    setLoading(true);
    setMsg(null);

    try {
      let result: SOP;

      if (mode === "text") {
        if (!content.trim()) {
          showMsg("error", "Please enter some text content.");
          setLoading(false);
          return;
        }
        result = await generateText(apiKey, content, context || undefined);
        result.source_type = "text";
      } else if (mode === "video") {
        const file = videoFileRef.current?.files?.[0];
        if (!file) {
          showMsg("error", "Please select a video file.");
          setLoading(false);
          return;
        }
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.src = URL.createObjectURL(file);
        await new Promise<void>((res) => {
          video.onloadedmetadata = () => res();
        });
        const frames = await sampleFramesFromVideo(video, 12);
        result = await analyzeImages(apiKey, frames, context || undefined);
        result.source_type = "video";
      } else {
        if (liveFramesRef.current.length === 0) {
          showMsg("error", "Please record a clip first.");
          setLoading(false);
          return;
        }
        result = await analyzeImages(apiKey, liveFramesRef.current, context || undefined);
        result.source_type = "live";
      }

      result.id = crypto.randomUUID();
      result.created_at = new Date().toISOString();
      setSop(result);
      showMsg("success", "SOP generated successfully!");
    } catch (e: any) {
      showMsg("error", e.message || "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [mode, content, context]);

  const handleEdit = () => {
    if (!sop) return;
    setMode("text");
    setContent(JSON.stringify(sop, null, 2));
    setSop(null);
  };

  const handleSave = () => {
    if (!sop) return;
    localStorage.setItem("skilllens_current_sop", JSON.stringify(sop));
    const accountId = localStorage.getItem("skilllens_account_id") || "default";
    sop.account_id = accountId;
    const key = `skilllens_sops_${accountId}`;
    const existing: SOP[] = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift(sop);
    if (existing.length > 100) existing.length = 100;
    localStorage.setItem(key, JSON.stringify(existing));
    showMsg("success", "SOP saved!");
  };

  return (
    <div className="min-h-screen bg-background">
      <div id="extract-container" className="mx-auto max-w-[540px] px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            id="back-btn"
            onClick={() => window.history.back()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-surface2"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-foreground">Create SOP</h1>
        </div>

        {/* Messages */}
        {msg && (
          <div className="mb-4">
            <MessageBanner type={msg.type} message={msg.text} onDismiss={() => setMsg(null)} />
          </div>
        )}

        <div className="space-y-5">
          {/* Mode selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Input Source
            </label>
            <select
              id="sourceMode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setSop(null);
              }}
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
            >
              <option value="text">Text / Transcript</option>
              <option value="live">Live Camera Recording</option>
              <option value="video">Pre-recorded Video</option>
            </select>
          </div>

          {/* Text section */}
          {mode === "text" && (
            <div id="textSection">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Training Content
              </label>
              <textarea
                id="contentInput"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste a transcript, manual excerpt, SOP notes, or procedure steps..."
                className="w-full resize-y rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                style={{ minHeight: 200 }}
              />
            </div>
          )}

          {/* Video section */}
          {mode === "video" && (
            <div id="videoSection">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upload Video
              </label>
              <input
                ref={videoFileRef}
                id="videoFile"
                type="file"
                accept="video/*"
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Use a short clip (30–90s) for fastest results.
              </p>
            </div>
          )}

          {/* Live section */}
          {mode === "live" && (
            <div id="liveSection">
              <LiveRecorder
                onFramesCaptured={(f) => (liveFramesRef.current = f)}
                onBlobReady={(b) => (liveBlobRef.current = b)}
              />
            </div>
          )}

          {/* Extra context */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Extra Context (optional)
            </label>
            <textarea
              id="contextInput"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Add role, tooling context, safety notes, or quality rules."
              className="w-full resize-y rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              rows={3}
            />
          </div>

          {/* Generate button */}
          {!loading && !sop && (
            <button
              id="generateBtn"
              onClick={handleGenerate}
              className="w-full rounded-lg bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-accent-dim"
            >
              Generate SOP
            </button>
          )}

          {/* Spinner */}
          {loading && <Spinner />}

          {/* SOP Preview */}
          {sop && (
            <SOPPreview sop={sop} onEdit={handleEdit} onSave={handleSave} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
