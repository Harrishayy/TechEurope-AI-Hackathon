import { useRef, useState, useEffect, useCallback } from "react";
import { sampleFrameFromVideo } from "@/lib/frames";

interface Props {
  onFramesCaptured: (frames: string[]) => void;
  onBlobReady: (blob: Blob) => void;
}

const LiveRecorder = ({ onFramesCaptured, onBlobReady }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch {
      console.error("Camera access denied");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera]);

  const startRecording = () => {
    if (!streamRef.current) return;
    framesRef.current = [];
    setSeconds(0);
    setRecordedUrl(null);

    const chunks: Blob[] = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      setRecordedUrl(URL.createObjectURL(blob));
      onBlobReady(blob);
      onFramesCaptured(framesRef.current.slice(0, 16));
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);

    intervalRef.current = setInterval(() => {
      if (videoRef.current && framesRef.current.length < 16) {
        framesRef.current.push(sampleFrameFromVideo(videoRef.current));
      }
    }, 1250);

    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-card">
        <video
          ref={videoRef}
          id="livePreview"
          autoPlay
          playsInline
          muted
          className="w-full rounded-lg"
        />
        {recording && (
          <div
            id="recordingBadge"
            className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 backdrop-blur-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse-rec" />
            <span id="recordTimer" className="text-xs font-mono text-foreground">
              {fmt(seconds)}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          id="startRecordBtn"
          onClick={startRecording}
          disabled={recording || !cameraReady}
          className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-accent-dim disabled:opacity-40"
        >
          Start Recording
        </button>
        <button
          id="stopRecordBtn"
          onClick={stopRecording}
          disabled={!recording}
          className="flex-1 rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface2 disabled:opacity-40"
        >
          Stop
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Record 30–60 seconds, then generate SOP.
      </p>

      {recordedUrl && (
        <video src={recordedUrl} controls className="w-full rounded-lg" />
      )}
    </div>
  );
};

export default LiveRecorder;
