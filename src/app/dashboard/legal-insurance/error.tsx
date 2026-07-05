"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
      RSV konnte nicht geladen werden. <button onClick={reset}>Erneut versuchen</button>
    </div>
  );
}
