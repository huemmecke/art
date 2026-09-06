const FEATURED_IDS = ["foto-016", "foto-030"];

const galleryEl = document.getElementById("gallery");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const closeBtn = document.getElementById("lightbox-close");
const prevBtn = document.getElementById("lightbox-prev");
const nextBtn = document.getElementById("lightbox-next");

let photos = [];
let currentIndex = 0;

function createPolaroid(photo, index, extraClass) {
  const button = document.createElement("button");
  button.type = "button";
  const orientation = photo.orientation === "landscape" ? "polaroid--landscape" : "polaroid--portrait";
  button.className = extraClass ? `polaroid ${orientation} ${extraClass}` : `polaroid ${orientation}`;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", `Foto ${index + 1} vergrößern`);

  const img = document.createElement("img");
  img.src = photo.thumb;
  img.alt = photo.alt;
  img.width = photo.width;
  img.height = photo.height;
  img.loading = index < 4 ? "eager" : "lazy";
  img.decoding = "async";

  button.appendChild(img);
  button.addEventListener("click", () => openLightbox(index));
  return button;
}

function renderFeatured() {
  const featured = document.getElementById("featured");
  FEATURED_IDS.forEach((id) => {
    const index = photos.findIndex((photo) => photo.id === id);
    if (index === -1) return;
    featured.appendChild(createPolaroid(photos[index], index));
  });
}

function renderGallery() {
  photos.forEach((photo, index) => {
    galleryEl.appendChild(createPolaroid(photo, index));
  });
}

function openLightbox(index) {
  currentIndex = index;
  const photo = photos[index];
  lightboxImage.src = photo.full;
  lightboxImage.alt = photo.alt;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  closeBtn.focus();
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
  document.body.style.overflow = "";
}

function showOffset(offset) {
  currentIndex = (currentIndex + offset + photos.length) % photos.length;
  const photo = photos[currentIndex];
  lightboxImage.src = photo.full;
  lightboxImage.alt = photo.alt;
}

function onKeydown(event) {
  if (!lightbox.classList.contains("is-open")) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowRight") showOffset(1);
  if (event.key === "ArrowLeft") showOffset(-1);
}

photos = Array.isArray(window.GALLERY_PHOTOS) ? window.GALLERY_PHOTOS : [];
renderFeatured();
renderGallery();

closeBtn.addEventListener("click", closeLightbox);
prevBtn.addEventListener("click", () => showOffset(-1));
nextBtn.addEventListener("click", () => showOffset(1));
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", onKeydown);

let touchStartX = 0;
lightbox.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].screenX;
}, { passive: true });
lightbox.addEventListener("touchend", (event) => {
  const delta = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(delta) < 50) return;
  showOffset(delta < 0 ? 1 : -1);
}, { passive: true });
