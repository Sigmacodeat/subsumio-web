"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
      <p>Werkzeuge konnten nicht geladen werden.</p>
      <button onClick={reset}>Erneut versuchen</button>
    </div>
  );
}
