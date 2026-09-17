document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === "lastInitial") {
    event.target.value = event.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase();
  }
});
document.addEventListener("htmx:configRequest", (event) => {
  if (event.detail.path === "/api/confirmation") {
    event.detail.headers["X-Receipt-Token"] = window.location.hash.slice(1);
  }
});
document.addEventListener("htmx:beforeRequest", () => {
  document.getElementById("request-error").hidden = true;
});
document.addEventListener("htmx:beforeSwap", (event) => {
  const status = event.detail.xhr.status;
  // Expected form errors contain the complete, populated form. Keep the real
  // HTTP status while letting HTMX render it. Server failures keep existing input.
  if ([400, 403, 404, 409, 410, 422].includes(status)) {
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});
document.addEventListener("htmx:afterSwap", (event) => {
  const summary = event.detail.target.querySelector?.(".validation-summary");
  summary?.focus();
  if (event.detail.target.id === "editor") {
    event.detail.target.scrollIntoView({ block: "start", behavior: "smooth" });
    event.detail.target.querySelector("input:not([type=hidden])")?.focus({ preventScroll: true });
  }
});
for (const name of ["htmx:sendError", "htmx:timeout", "htmx:responseError"]) {
  document.addEventListener(name, () => { document.getElementById("request-error").hidden = false; });
}
document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-print]")) window.print();
  if (event.target.closest("[data-copy-receipt]")) {
    const status = document.getElementById("copy-status");
    try {
      await navigator.clipboard.writeText(window.location.href);
      status.textContent = "Link copied.";
    } catch { status.textContent = "Copy the address from your browser."; }
  }
});

const viewer = document.getElementById("photo-viewer");
if (viewer) {
  const photos = Array.from(document.querySelectorAll("[data-gallery-photo]"));
  const picture = document.getElementById("viewer-image");
  const count = document.getElementById("viewer-count");
  let index = 0;
  let opener;
  function showPhoto(nextIndex) {
    index = (nextIndex + photos.length) % photos.length;
    picture.alt = photos[index].querySelector("img").alt;
    picture.src = photos[index].href;
    count.textContent = `${index + 1} / ${photos.length}`;
  }
  photos.forEach((photo, photoIndex) => {
    photo.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = photo;
      showPhoto(photoIndex);
      viewer.showModal();
      document.documentElement.classList.add("viewer-open");
    });
  });
  viewer.querySelector("[data-viewer-close]").addEventListener("click", () => viewer.close());
  viewer.querySelector("[data-viewer-previous]").addEventListener("click", () => showPhoto(index - 1));
  viewer.querySelector("[data-viewer-next]").addEventListener("click", () => showPhoto(index + 1));
  viewer.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(index + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  viewer.addEventListener("click", (event) => {
    if (event.target !== viewer) return;
    const rect = viewer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) viewer.close();
  });
  viewer.addEventListener("close", () => {
    document.documentElement.classList.remove("viewer-open");
    opener?.focus({ preventScroll: true });
  });
  picture.addEventListener("error", () => { count.textContent = "Photo unavailable. Try the next photo."; });
}
