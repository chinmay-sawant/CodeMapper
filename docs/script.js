const images = [1,2,3,4,5].map(i =>
  `https://raw.githubusercontent.com/chinmay-sawant/CodeMapper/master/screenshot/image${i}.png`
);

const slidesEl = document.getElementById('slides');
const dotsEl = document.getElementById('dots');
const carouselEl = document.getElementById('carousel');
let index = 0;
let timer = null;
const INTERVAL = 6000;

// Create slide counter element
const counterEl = document.createElement('div');
counterEl.className = 'carousel-counter';
carouselEl.appendChild(counterEl);

function buildSlides() {
  slidesEl.innerHTML = images.map((src, i) =>
    `<div class="slide skeleton">
      <img loading="lazy" src="${src}" alt="CodeMapper screenshot ${i + 1}" onload="this.parentElement.classList.remove('skeleton')">
    </div>`
  ).join('');
  dotsEl.innerHTML = images.map((_,i)=>`<button aria-label="Go to slide ${i+1}"></button>`).join('');
}

function setActive(i) {
  index = (i + images.length) % images.length;
  slidesEl.style.transform = `translateX(-${index * 100}%)`;
  [...dotsEl.children].forEach((d,di)=>d.classList.toggle('active', di===index));

  // Update counter
  counterEl.textContent = `${index + 1} / ${images.length}`;

  resetTimer();
}

function next() { setActive(index+1); }
function prev() { setActive(index-1); }

function resetTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(next, INTERVAL);
}

document.getElementById('nextBtn').addEventListener('click', next);
document.getElementById('prevBtn').addEventListener('click', prev);
dotsEl.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') {
    const di = [...dotsEl.children].indexOf(e.target);
    setActive(di);
  }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prev();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    next();
  }
});

// Pause on hover
carouselEl.addEventListener('mouseenter', () => {
  if (timer) clearInterval(timer);
});

carouselEl.addEventListener('mouseleave', () => {
  resetTimer();
});

// Touch/swipe support for mobile
let touchStartX = 0;
let touchEndX = 0;

carouselEl.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  if (timer) clearInterval(timer);
});

carouselEl.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;

  if (Math.abs(diff) > 50) { // Minimum swipe distance
    if (diff > 0) {
      next();
    } else {
      prev();
    }
  } else {
    resetTimer();
  }
});

function applyTheme(t) {
  if (t === 'light') {
    document.body.classList.add('light');
    toggleBtn.textContent = '🌙';
  } else {
    document.body.classList.remove('light');
    toggleBtn.textContent = '☀️';
  }
}

const toggleBtn = document.getElementById('themeToggle');
const saved = localStorage.getItem('codemapper-theme') || 'dark';
applyTheme(saved);
toggleBtn.addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem('codemapper-theme', nextTheme);
  applyTheme(nextTheme);
});

buildSlides();
setActive(0);
resetTimer();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(timer);
  } else {
    resetTimer();
  }
});
