import type { CSSProperties } from "react";

/** Shared z-index for portaled menus/popovers (above modals so selects work inside dialogs). */
export const FLOATING_MENU_Z_INDEX = "var(--z-floating, 300)";

export const FLOATING_MENU_ATTR = "data-floating-menu";

export const FLOATING_MENU_GAP_PX = 4;
export const FLOATING_MENU_VIEWPORT_PAD_PX = 8;
export const FLOATING_MENU_DEFAULT_MAX_HEIGHT_PX = 240;
export const FLOATING_MENU_MIN_HEIGHT_PX = 96;
/** Prefer flipping upward when less than this much space remains below the anchor. */
export const FLOATING_MENU_FLIP_THRESHOLD_PX = 160;

export const floatingMenuSurfaceClass =
  "overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card py-1 shadow-diffused";

/**
 * Viewport-aware fixed layout for portaled menus (dropdowns, listboxes).
 * Opens upward when there is more room above than below.
 */
export function computeFloatingMenuStyle(
  anchorRect: DOMRect,
  options?: { maxHeight?: number },
): CSSProperties {
  const maxDefault = options?.maxHeight ?? FLOATING_MENU_DEFAULT_MAX_HEIGHT_PX;
  const spaceBelow =
    window.innerHeight - anchorRect.bottom - FLOATING_MENU_GAP_PX - FLOATING_MENU_VIEWPORT_PAD_PX;
  const spaceAbove = anchorRect.top - FLOATING_MENU_GAP_PX - FLOATING_MENU_VIEWPORT_PAD_PX;
  const openUp = spaceBelow < FLOATING_MENU_FLIP_THRESHOLD_PX && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    maxDefault,
    Math.max(FLOATING_MENU_MIN_HEIGHT_PX, openUp ? spaceAbove : spaceBelow),
  );

  const shared: CSSProperties = {
    position: "fixed",
    left: anchorRect.left,
    minWidth: anchorRect.width,
    maxHeight,
    zIndex: FLOATING_MENU_Z_INDEX,
  };

  if (openUp) {
    return {
      ...shared,
      bottom: window.innerHeight - anchorRect.top + FLOATING_MENU_GAP_PX,
    };
  }

  return {
    ...shared,
    top: anchorRect.bottom + FLOATING_MENU_GAP_PX,
  };
}

export function isFloatingMenuTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${FLOATING_MENU_ATTR}]`));
}
