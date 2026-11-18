const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const edgeTolerance = 2;
const dragThreshold = 7;

function setupCarousel(carousel) {
  const viewport = carousel.querySelector('[data-carousel-viewport]');
  const controls = carousel.querySelector('[data-carousel-controls]');
  if (!viewport?.children.length || !controls) return;

  const previous = controls.querySelector('[data-carousel-prev]');
  const next = controls.querySelector('[data-carousel-next]');
  const status = controls.querySelector('[data-carousel-status]');
  const pages = controls.querySelector('[data-carousel-pages]');
  const slideCount = carousel.querySelector('[data-carousel-slide-count]');
  const slides = Array.from(viewport.children);
  if (slideCount) slideCount.textContent = String(slides.length);

  let stops = [];
  let visibleSlides = 1;
  let currentSlide = slides.find(slide => slide.hasAttribute('data-current'));
  let scrollTimer;
  let pointer;
  let suppressClick = false;

  function nearestStop() {
    const scroll = viewport.scrollLeft;
    return stops.reduce((closest, stop) => (
      Math.abs(stop.left - scroll) < Math.abs(closest.left - scroll) ? stop : closest
    ));
  }

  function updateControls() {
    const { left, index } = nearestStop();
    const first = index + 1;
    const last = Math.min(slides.length, index + visibleSlides);
    const label = first === last
      ? `Foto ${first} de ${slides.length}`
      : `Fotos ${first}–${last} de ${slides.length}`;
    if (status && status.textContent !== label) status.textContent = label;
    previous?.setAttribute('aria-disabled', String(viewport.scrollLeft <= edgeTolerance));
    next?.setAttribute('aria-disabled', String(viewport.scrollLeft >= stops.at(-1).left - edgeTolerance));

    if (currentSlide !== slides[index]) {
      currentSlide?.removeAttribute('data-current');
      currentSlide = slides[index];
      currentSlide.setAttribute('data-current', '');
    }
    Array.from(pages?.children ?? []).forEach((button, position) => {
      const current = stops[position].left === left;
      if (current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      button.tabIndex = current ? 0 : -1;
    });
  }

  function measure() {
    visibleSlides = Math.max(1, Math.floor(Number(getComputedStyle(viewport).getPropertyValue('--visible-slides')) || 1));
    const limit = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const origin = slides[0].offsetLeft;
    stops = [];
    slides.forEach((slide, index) => {
      const left = Math.min(limit, Math.max(0, slide.offsetLeft - origin));
      if (!stops.length || left > stops.at(-1).left + edgeTolerance) stops.push({ index, left });
    });

    controls.hidden = stops.length < 2;
    if (pages && pages.children.length !== stops.length) {
      pages.replaceChildren(...stops.map(({ index }, position) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'carousel-page';
        button.setAttribute('aria-label', `Ir à foto ${index + 1}`);
        if (viewport.id) button.setAttribute('aria-controls', viewport.id);
        button.addEventListener('click', () => scrollTo(stops[position]));
        return button;
      }));
    }
    updateControls();
  }

  function scrollTo(stop) {
    if (stop) viewport.scrollTo({ left: stop.left, behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  }

  function shift(direction) {
    const edge = viewport.scrollLeft + direction * edgeTolerance;
    scrollTo(direction > 0
      ? stops.find(stop => stop.left > edge)
      : stops.findLast(stop => stop.left < edge));
  }

  previous?.addEventListener('click', () => shift(-1));
  next?.addEventListener('click', () => shift(1));
  viewport.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(updateControls, 85);
  }, { passive: true });

  function handleDirection(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case 'ArrowLeft': shift(-1); break;
      case 'ArrowRight': shift(1); break;
      case 'Home': scrollTo(stops[0]); break;
      case 'End': scrollTo(stops.at(-1)); break;
      default: return;
    }
    event.preventDefault();
  }

  viewport.addEventListener('keydown', handleDirection);
  pages?.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const buttons = Array.from(pages.children);
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    let position;
    switch (event.key) {
      case 'ArrowLeft': position = Math.max(0, current - 1); break;
      case 'ArrowRight': position = Math.min(stops.length - 1, current + 1); break;
      case 'Home': position = 0; break;
      case 'End': position = stops.length - 1; break;
      default: return;
    }
    event.preventDefault();
    buttons[position].focus({ preventScroll: true });
    scrollTo(stops[position]);
  });

  viewport.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || stops.length < 2) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, dragging: false };
  });

  window.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      finishDrag(event);
      return;
    }
    const distance = event.clientX - pointer.x;
    if (!pointer.dragging) {
      if (Math.abs(distance) < dragThreshold || Math.abs(distance) <= Math.abs(event.clientY - pointer.y)) return;
      pointer.dragging = true;
      suppressClick = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.setAttribute('data-carousel-dragging', '');
    }
    event.preventDefault();
    viewport.scrollLeft = pointer.left - distance;
  }, { passive: false });

  function finishDrag(event) {
    if (pointer?.id !== event.pointerId) return;
    const { dragging } = pointer;
    pointer = undefined;
    if (!dragging) return;
    const stop = nearestStop();
    viewport.removeAttribute('data-carousel-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    scrollTo(stop);
  }

  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('lostpointercapture', finishDrag);
  viewport.addEventListener('dragstart', event => {
    if (pointer) event.preventDefault();
  });
  viewport.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });

  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(viewport);
  else window.addEventListener('resize', measure);
}

function setupArtPreview(dialog) {
  if (typeof dialog?.showModal !== 'function') return;

  const links = Array.from(document.querySelectorAll('[data-art-preview]'));
  if (!links.length) return;
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('[data-preview-caption]');
  let index = 0;
  let opener;

  function show(position) {
    index = (position + links.length) % links.length;
    const link = links[index];
    caption.textContent = link.querySelector('.gallery-caption').textContent.trim();
    image.src = link.href;
    image.alt = caption.textContent;
  }

  links.forEach((link, position) => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    opener = link;
    show(position);
    dialog.showModal();
  }));

  dialog.querySelector('[data-preview-prev]').addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-preview-next]').addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-preview-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
}

function setupPagePosition() {
  const progress = document.querySelector('[data-page-progress]');
  const backToTop = document.querySelector('[data-back-to-top]');
  const hero = document.querySelector('#hero');
  if (!progress && !backToTop) return;

  let frame;
  function update() {
    frame = undefined;
    const length = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = length > 0 ? Math.max(0, Math.min(1, window.scrollY / length)) : 0;
    progress?.style.setProperty('--page-progress', String(ratio));
    if (backToTop && hero) backToTop.hidden = hero.getBoundingClientRect().bottom > 0;
  }
  function scheduleUpdate() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(document.body);
}

function setupReveals() {
  if (reduceMotion.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const reveals = document.querySelectorAll('[data-reveal]');
  if (!reveals.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      observer.unobserve(target);
      if (reduceMotion.matches) return;
      target.animate([
        { opacity: 0.72, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' }
      ], { duration: 330, easing: 'cubic-bezier(.2,.7,.3,1)' });
    });
  }, { threshold: 0.12 });
  reveals.forEach(element => observer.observe(element));
}

document.querySelectorAll('[data-carousel]').forEach(setupCarousel);
setupArtPreview(document.querySelector('[data-art-dialog]'));
setupPagePosition();
setupReveals();
