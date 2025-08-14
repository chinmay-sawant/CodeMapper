const images = [1,2,3,4,5].map(i =>
  `https://raw.githubusercontent.com/chinmay-sawant/CodeMapper/master/screenshot/image${i}.png`
);

const slidesEl = document.getElementById('slides');
const dotsEl = document.getElementById('dots');
let index = 0;
let timer = null;
const INTERVAL = 5000;

function buildSlides() {
  slidesEl.innerHTML = images.map(src => `<div class="slide"><img loading="lazy" src="${src}" alt="CodeMapper screenshot"></div>`).join('');
  dotsEl.innerHTML = images.map((_,i)=>`<button aria-label="Go to slide ${i+1}"></button>`).join('');
}

function setActive(i) {
  index = (i + images.length) % images.length;
  slidesEl.style.transform = `translateX(-${index * 100}%)`;
  [...dotsEl.children].forEach((d,di)=>d.classList.toggle('active', di===index));
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

// Pause on visibility change to save resources
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(timer);
  } else {
    resetTimer();
  }
});
