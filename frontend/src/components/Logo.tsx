export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold font-mono ${className}`}>
      <span className="bg-gradient-to-r from-purple-400 to-purple-500 bg-clip-text text-transparent">
        &lt;/
      </span>
      <span className="bg-gradient-to-r from-pink-400 to-pink-500 bg-clip-text text-transparent">
        Capy
      </span>
      <span className="bg-gradient-to-r from-stone-700 to-stone-800 dark:from-stone-100 dark:to-stone-200 bg-clip-text text-transparent">
        Pad
      </span>
      <span className="bg-gradient-to-r from-purple-400 to-purple-500 bg-clip-text text-transparent">
        &gt;
      </span>
    </span>
  );
}
