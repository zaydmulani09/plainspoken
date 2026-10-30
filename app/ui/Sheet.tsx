"use client";
import { useEffect, useRef } from "react";

// Modal sheet on the native <dialog>: centered on desktop, docked to the
// bottom edge on phones. Escape and backdrop clicks close it.
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet-dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.022em]">{title}</h2>
          <button type="button" className="btn btn-plain text-[15px] font-semibold" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="px-5 pt-1 pb-5">{children}</div>
      </div>
    </dialog>
  );
}
