interface Props {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}

const MessageBanner = ({ type, message, onDismiss }: Props) => (
  <div
    className={`rounded-lg border p-3 text-sm ${
      type === "success"
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-destructive/30 bg-destructive/10 text-destructive"
    }`}
    onClick={onDismiss}
    role="alert"
  >
    {message}
  </div>
);

export default MessageBanner;
