interface StatusBarProps {
  line: string;
  update: string | null;
}

export function StatusBar({ line, update }: StatusBarProps) {
  return (
    <footer className="status">
      <p>{line}</p>
      {update ? <p>{update}</p> : null}
    </footer>
  );
}
