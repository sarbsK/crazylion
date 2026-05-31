/* ─────────────────────────────────────────
   app.js — Anatomy for Artists
   ───────────────────────────────────────── */

'use strict';

// ─── NAVIGATION ───────────────────────────
function navigateTo(sectionId) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => {
    s.hidden = true;
    s.classList.remove('active');
  });

  // Show target section
  const target = document.getElementById(`section-${sectionId}`);
  if (target) {
    target.hidden = false;
    target.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.removeAttribute('aria-current');
    if (btn.dataset.section === sectionId) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }
  });

  // Update URL hash without jumping
  history.pushState(null, '', `#${sectionId}`);
}

// Attach click handlers to nav buttons
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

// Handle browser back/forward
window.addEventListener('popstate', () => {
  const hash = location.hash.replace('#', '') || 'home';
  navigateTo(hash);
});

// Load from URL hash on initial load
(function initFromHash() {
  const hash = location.hash.replace('#', '') || 'home';
  navigateTo(hash);
})();

// ─── MUSCLE TABS ──────────────────────────
function switchTab(region) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.id === `tab-${region}`;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Show/hide panels
  document.querySelectorAll('.muscle-content').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `muscle-${region}`);
  });
}

// ─── COPY PROMPTS ─────────────────────────
function copyPrompt(btn) {
  const item = btn.closest('.prompt-item');
  const spans = item.querySelectorAll('span');
  // The text span (not the emoji icon)
  let promptText = '';
  spans.forEach(s => {
    if (!s.classList.contains('prompt-icon')) {
      promptText = s.textContent.trim();
    }
  });

  if (!promptText) return;

  navigator.clipboard.writeText(promptText)
    .then(() => showToast('Prompt copied to clipboard!'))
    .catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = promptText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Prompt copied!');
    });
}

// ─── TOAST NOTIFICATION ───────────────────
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── KEYBOARD NAVIGATION ──────────────────
document.addEventListener('keydown', e => {
  // Allow Enter/Space on prompt items to copy
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('prompt-item')) {
    e.preventDefault();
    const btn = e.target.querySelector('.copy-btn');
    if (btn) copyPrompt(btn);
  }
});

// ─── PROGRESS ANIMATION ───────────────────
// Animate progress bar on load
window.addEventListener('load', () => {
  const fill = document.querySelector('.progress-fill');
  if (fill) {
    fill.style.width = '0%';
    requestAnimationFrame(() => {
      setTimeout(() => { fill.style.width = '42%'; }, 300);
    });
  }
});

// ─── INTERSECTION OBSERVER (card animations) ─
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

function observeCards() {
  document.querySelectorAll('.chapter-card, .topic-card, .visual-card, .visual-form-card, .stat-card, .nlm-step').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.25s ease';
    observer.observe(card);
  });
}

// Re-run observer when sections become visible
const sectionObserver = new MutationObserver(() => observeCards());
document.querySelectorAll('.section').forEach(section => {
  sectionObserver.observe(section, { attributeFilter: ['hidden'] });
});
observeCards();

// ─── INTERACTIVE LIGHTBOX MODAL ────────────────
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxTitle = document.getElementById('lightbox-title');
const lightboxDesc = document.getElementById('lightbox-desc');

function openLightbox(imgSrc, altText, titleText, descText) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = imgSrc;
  lightboxImg.alt = altText || 'Expanded anatomy detail view';
  lightboxImg.classList.remove('zoomed'); // reset zoom state
  
  const wrap = lightboxImg.closest('.lightbox-img-wrap');
  if (wrap) wrap.classList.remove('zoomed-parent');
  lightbox.classList.remove('zoomed-modal');
  
  if (lightboxTitle) lightboxTitle.textContent = titleText || '';
  if (lightboxDesc) lightboxDesc.textContent = descText || '';
  
  lightbox.removeAttribute('hidden');
  lightbox.setAttribute('aria-hidden', 'false');
  // Allow transitions to kick in
  requestAnimationFrame(() => {
    lightbox.classList.add('show');
  });
  document.body.classList.add('lightbox-open');
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('show');
  lightbox.classList.remove('zoomed-modal');
  if (lightboxImg) {
    lightboxImg.classList.remove('zoomed');
    const wrap = lightboxImg.closest('.lightbox-img-wrap');
    if (wrap) wrap.classList.remove('zoomed-parent');
  }
  document.body.classList.remove('lightbox-open');
  
  // Hide after transition completes
  setTimeout(() => {
    if (!lightbox.classList.contains('show')) {
      lightbox.setAttribute('hidden', 'true');
      lightbox.setAttribute('aria-hidden', 'true');
    }
  }, 300);
}

// Attach click listeners to all clickable images
function setupClickableImages() {
  const clickableSelectors = [
    '.v-img-wrap img',
    '.vfc-img-wrap img',
    '.sticky-img-wrap img',
    '.chapter-img-wrap img',
    '.forms-hero-img img',
    '.hero-img'
  ];
  
  document.querySelectorAll(clickableSelectors.join(', ')).forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const src = img.src;
      const alt = img.alt;
      
      // Extract details from surrounding context
      let title = '';
      let desc = '';
      
      // If it is in a visual-card or visual-form-card
      const card = img.closest('.visual-card, .visual-form-card');
      if (card) {
        const h3 = card.querySelector('h3');
        const p = card.querySelector('p');
        const num = card.querySelector('.topic-number');
        if (h3) title = (num ? num.textContent + ' · ' : '') + h3.textContent;
        if (p) desc = p.textContent;
      } else {
        // If it is a sticky sidebar image
        const wrap = img.closest('.sticky-img-wrap');
        if (wrap) {
          const caption = wrap.querySelector('.img-caption');
          title = 'Anatomical Study Illustration';
          if (caption) desc = caption.textContent;
        } else {
          // Fallback
          title = 'Anatomy Illustration Details';
          desc = alt || 'Interactive anatomical reference sketch sourced directly from figures and skeletons in motion.';
        }
      }
      
      openLightbox(src, alt, title, desc);
    });
  });
}

// Lightbox close events
if (lightboxClose) {
  lightboxClose.addEventListener('click', closeLightbox);
}

if (lightbox) {
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });
}

// Keyboard navigation (Escape key to close)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox && !lightbox.hasAttribute('hidden')) {
    closeLightbox();
  }
});

// Interactive Zoom Inside Lightbox
if (lightboxImg) {
  lightboxImg.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Calculate click coordinates percentage on the unzoomed image
    const rect = lightboxImg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const pctX = clickX / rect.width;
    const pctY = clickY / rect.height;
    
    lightboxImg.classList.toggle('zoomed');
    const isZoomed = lightboxImg.classList.contains('zoomed');
    const wrap = lightboxImg.closest('.lightbox-img-wrap');
    
    if (wrap) {
      wrap.classList.toggle('zoomed-parent', isZoomed);
    }
    if (lightbox) {
      lightbox.classList.toggle('zoomed-modal', isZoomed);
    }
    
    if (isZoomed) {
      // Wait for layout updates, then center the viewport scroll on the clicked area
      setTimeout(() => {
        const scrollTargetX = (lightboxImg.offsetWidth * pctX) - (lightbox.clientWidth / 2);
        const scrollTargetY = (lightboxImg.offsetHeight * pctY) - (lightbox.clientHeight / 2);
        
        lightbox.scrollTo({
          left: Math.max(0, scrollTargetX),
          top: Math.max(0, scrollTargetY),
          behavior: 'smooth'
        });
      }, 50);
    } else {
      // Reset viewport scroll back to top-left
      lightbox.scrollTo({
        left: 0,
        top: 0,
        behavior: 'smooth'
      });
    }
  });
}

// Run on initial load
document.addEventListener('DOMContentLoaded', () => {
  setupClickableImages();
});
// Fallback in case DOMContentLoaded has already fired
setupClickableImages();

// ─── SERVICE WORKER REGISTRATION (Offline Support) ───
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registered successfully!', reg.scope);
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

// ─── MOBILE NAVIGATION CONTROLLER ──────────────────
const menuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');

if (menuToggle && sidebar) {
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('mobile-active');
  });

  // Close sidebar when clicking main content
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.addEventListener('click', () => {
      sidebar.classList.remove('mobile-active');
    });
  }

  // Close sidebar on clicking any navigation button
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sidebar.classList.remove('mobile-active');
    });
  });
}

