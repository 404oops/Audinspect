export default function Toast({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
      <button
        type="button"
        onClick={onClose}
        className="bg-pure-black border-2 border-white text-white px-16 py-8 shadow-lg no-drag"
      >
        {message}
      </button>
    </div>
  );
}
