import type { SOP } from "@/lib/gemini";

interface Props {
  sop: SOP;
  onEdit: () => void;
  onSave: () => void;
}

const SOPPreview = ({ sop, onEdit, onSave }: Props) => (
  <div id="sopPreview" className="space-y-4">
    <h2 id="sopTitle" className="text-xl font-bold text-foreground">
      {sop.title || "Generated SOP"}
    </h2>
    {sop.role && (
      <p className="text-sm text-muted-foreground">Role: {sop.role}</p>
    )}
    <div id="sopSteps" className="space-y-3">
      {sop.steps.map((step) => (
        <div
          key={step.step}
          className="sop-step rounded-lg bg-card p-4 border-l-[3px] border-l-primary"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Step {step.step}
          </span>
          <p className="mt-1 text-foreground">{step.action}</p>
          {step.look_for && (
            <p className="mt-1 text-sm text-muted-foreground">
              Look for: {step.look_for}
            </p>
          )}
          {step.common_mistakes && (
            <p className="mt-1 text-xs text-destructive">
              ⚠ {step.common_mistakes}
            </p>
          )}
        </div>
      ))}
    </div>
    <div className="flex gap-3 pt-2">
      <button
        id="editSop"
        onClick={onEdit}
        className="flex-1 rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface2"
      >
        Edit
      </button>
      <button
        id="saveSop"
        onClick={onSave}
        className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-accent-dim"
      >
        Save SOP
      </button>
    </div>
  </div>
);

export default SOPPreview;
