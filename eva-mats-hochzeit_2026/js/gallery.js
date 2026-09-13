const FEATURED_IDS = ["sa-033", "sa-003"];

const featuredEl = document.getElementById("featured");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const closeBtn = document.getElementById("lightbox-close");
const prevBtn = document.getElementById("lightbox-prev");
const nextBtn = document.getElementById("lightbox-next");

const albums = window.GALLERY_ALBUMS || {};
const photos = [
  ...(Array.isArray(albums.standesamt) ? albums.standesamt : []),
  ...(Array.isArray(albums.hochzeit) ? albums.hochzeit : []),
  ...(Array.isArray(albums.uli) ? albums.uli : []),
];

let currentIndex = 0;

function createPolaroid(photo, index) {
  const button = document.createElement("button");
  button.type = "button";
  const orientation =
    photo.orientation === "landscape"
      ? "polaroid--landscape"
      : photo.orientation === "square"
        ? "polaroid--square"
        : "polaroid--portrait";
  button.className = `polaroid ${orientation}`;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", `Foto ${index + 1} vergrößern`);

  const img = document.createElement("img");
  img.src = photo.thumb;
  img.alt = photo.alt;
  img.width = photo.width;
  img.height = photo.height;
  img.loading = index < 6 ? "eager" : "lazy";
  img.decoding = "async";

  button.appendChild(img);
  button.addEventListener("click", () => openLightbox(index));
  return button;
}

function renderFeatured() {
  if (!featuredEl) return;
  FEATURED_IDS.forEach((id) => {
    const index = photos.findIndex((photo) => photo.id === id);
    if (index === -1) return;
    featuredEl.appendChild(createPolaroid(photos[index], index));
  });
}

function renderAlbum(albumName, elementId) {
  const galleryEl = document.getElementById(elementId);
  if (!galleryEl) return;
  (albums[albumName] || []).forEach((photo) => {
    const index = photos.findIndex((item) => item.id === photo.id);
    if (index === -1) return;
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
  if (!photos.length) return;
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

renderFeatured();
renderAlbum("standesamt", "gallery-standesamt");
renderAlbum("hochzeit", "gallery-hochzeit");
renderAlbum("uli", "gallery-uli");

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
