const Spinner = () => (
  <div className="flex flex-col items-center gap-4 py-8">
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-3 w-3 rounded-full bg-primary animate-bounce-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
    <p className="text-sm text-muted-foreground">Analyzing content and building your SOP...</p>
  </div>
);

export default Spinner;
