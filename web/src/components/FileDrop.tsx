import { useRef, useState } from "react";

interface Props {
  onFile: (filename: string, text: string) => void;
}

export default function FileDrop({ onFile }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const read = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onFile(file.name, String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div
      className={"dropzone" + (drag ? " drag" : "")}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) read(f);
      }}
    >
      <p><strong>Drop a log file here</strong> or click to choose</p>
      <p className="small">Accepts the app's <code>.json</code> export (or <code>.csv</code>)</p>
      <input
        ref={inputRef} type="file" accept=".json,.csv,application/json,text/csv"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }}
      />
    </div>
  );
}
