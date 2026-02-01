"use client";

import * as React from "react";

type DeleteFileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
};

export function DeleteFileDialog({
  open,
  onOpenChange,
  fileName,
  onConfirm,
  isDeleting = false,
}: DeleteFileDialogProps) {
  if (!open) return null;

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={() => {
        if (!isDeleting) {
          onOpenChange(false);
        }
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 10,
          padding: 24,
          maxWidth: 500,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Delete file?
          </h3>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
            This will permanently delete{" "}
            <span
              style={{
                display: "inline-block",
                padding: "2px 6px",
                borderRadius: 4,
                background: "#f3f4f6",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              {fileName}
            </span>{" "}
            from this deal. This can&apos;t be undone.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "white",
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #dc2626",
              background: "#dc2626",
              color: "white",
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
