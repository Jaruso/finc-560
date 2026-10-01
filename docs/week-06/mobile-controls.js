/* Shared mobile controls drawer for all Week 6 workspaces. */
(() => {
  "use strict";
  const rail = document.querySelector(".controls-rail");
  const toolbar = document.querySelector(".chart-toolbar");
  if (!rail || !toolbar) return;

  if (!rail.id) rail.id = "forecast-controls";
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "mobile-controls-toggle secondary";
  opener.setAttribute("aria-controls", rail.id);
  opener.setAttribute("aria-expanded", "false");
  opener.innerHTML = '<span aria-hidden="true">☰</span><span>Controls</span>';
  toolbar.prepend(opener);

  const closer = document.createElement("button");
  closer.type = "button";
  closer.className = "mobile-controls-close secondary";
  closer.setAttribute("aria-label", "Close forecast controls");
  closer.textContent = "Close";
  rail.prepend(closer);

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "controls-drawer-backdrop";
  backdrop.setAttribute("aria-label", "Close forecast controls");
  backdrop.hidden = true;
  rail.after(backdrop);

  const mobile = window.matchMedia("(max-width: 800px)");
  let open = false;

  function setOpen(next, restoreFocus = true) {
    open = Boolean(next && mobile.matches);
    rail.classList.toggle("is-open", open);
    opener.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("controls-drawer-open", open);
    rail.inert = mobile.matches && !open;
    if (open) {
      rail.setAttribute("role", "dialog");
      rail.setAttribute("aria-modal", "true");
      closer.focus();
    } else {
      rail.removeAttribute("role");
      rail.removeAttribute("aria-modal");
      if (restoreFocus && mobile.matches) opener.focus();
    }
  }

  function syncViewport() {
    if (!mobile.matches) {
      setOpen(false, false);
      rail.inert = false;
    } else {
      rail.inert = !open;
    }
  }

  opener.addEventListener("click", () => setOpen(true));
  closer.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && open) setOpen(false);
    if (event.key !== "Tab" || !open) return;
    const focusable = [...rail.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
    )].filter(node => node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  mobile.addEventListener("change", syncViewport);
  syncViewport();
})();
