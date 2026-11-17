document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.slide');
    if (slides.length === 0) return; // Если слайдов нет, ничего не делаем

    let currentIndex = 0;
    let autoPlayInterval;

    function updateSlides() {
        slides.forEach((slide, index) => {
            // Очищаем все классы
            slide.classList.remove('active', 'prev', 'next', 'hidden-left', 'hidden-right');

            const length = slides.length;
            const diff = (index - currentIndex + length) % length;

            if (diff === 0) {
                slide.classList.add('active');
            } else if (diff === 1) {
                slide.classList.add('next');
            } else if (diff === length - 1) {
                slide.classList.add('prev');
            } else if (diff === 2) {
                slide.classList.add('hidden-right');
            } else {
                slide.classList.add('hidden-left');
            }
        });
    }

    // Делаем функцию глобальной, чтобы кнопки в HTML могли её вызвать
    window.moveSlide = function (direction) {
        currentIndex = (currentIndex + direction + slides.length) % slides.length;
        updateSlides();
        resetAutoPlay();
    };

    // Автопрокрутка
    function startAutoPlay() {
        autoPlayInterval = setInterval(() => {
            window.moveSlide(1);
        }, 3000); // 3 секунды
    }

    function resetAutoPlay() {
        clearInterval(autoPlayInterval);
        startAutoPlay();
    }

    // Клик по слайдам
    slides.forEach((slide) => {
        slide.addEventListener('click', (e) => {
            if (slide.classList.contains('prev')) {
                window.moveSlide(-1);
            } else if (slide.classList.contains('next')) {
                window.moveSlide(1);
            } else if (slide.classList.contains('active')) {
                // Если кликнули по центральному фото — открываем его на весь экран
                const imgSrc = slide.querySelector('img').src;
                if (typeof openImage === 'function') {
                    openImage(imgSrc);
                }
            }
        });
    });

    function openImage(src) {
        const modal = document.getElementById('imageModal');
        const fullImg = document.getElementById('fullImage');
        if (modal && fullImg) {
            fullImg.src = src;
            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Блокируем прокрутку
        }
    }

    function closeImage() {
        const modal = document.getElementById('imageModal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = 'auto'; // Возвращаем прокрутку
        }
    }

    // Инициализация
    updateSlides();
    startAutoPlay();
});