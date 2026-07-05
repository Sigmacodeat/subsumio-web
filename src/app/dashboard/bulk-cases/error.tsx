"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
      Massenakten konnten nicht geladen werden. <button onClick={reset}>Erneut versuchen</button>
    </div>
  );
}
