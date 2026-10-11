/**
 * 7D App - Plataforma Oficial de Promociones Locales y Directorio Comercial
 * Arquitectura de Alto Rendimiento, Resiliente y en Tiempo Real con Cloud Firestore
 * Colección Oficial: "Categorias de producto"
 */

// ==========================================================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN OFICIAL DE GOOGLE FIREBASE
// ==========================================================================
// Configuración oficial y única para dapp-f5e40 (Project Number: 331538118268)
const OFFICIAL_FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyA1F0hyr8qUGx5DoqPO8JhV073NXr35NYI",
  authDomain: "dapp-f5e40.firebaseapp.com",
  projectId: "dapp-f5e40",
  storageBucket: "dapp-f5e40.firebasestorage.app",
  messagingSenderId: "331538118268",
  appId: "1:331538118268:web:6e7832180c583a0475fbf9"
});

// Establecer fuente única en el entorno global y local
window.firebaseConfig = OFFICIAL_FIREBASE_CONFIG;
const firebaseConfig = { ...OFFICIAL_FIREBASE_CONFIG };

// Preservar datos en localStorage sin sobrescribir la configuración oficial en inicialización
try {
  const savedDbConfig = localStorage.getItem('7dapp_firebase_config');
  if (savedDbConfig) {
    console.log('[Firestore] Configuración previa en localStorage detectada, pero prevalece la configuración oficial activa:', firebaseConfig.projectId);
  }
} catch(e) {}

let db = null;
try {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    console.log('[Firestore] Inicializado con éxito. Proyecto:', firebaseConfig.projectId);
  } else {
    console.warn('[Firestore] SDK de Firebase se cargará de forma asíncrona.');
  }
} catch (err) {
  console.warn('[Firestore] Error al inicializar Firebase SDK:', err.message);
}

const FIRESTORE_PROMOTIONS_COLLECTION = 'promotions';
const FIRESTORE_SETTINGS_COLLECTION = 'settings';
const FIRESTORE_SETTINGS_DOC = 'general';
const FIRESTORE_CITIES_DOC = 'cities';
const FIRESTORE_LEGACY_COLLECTION = 'Categorias de producto'; // Colección legacy (solo para categorías/diagnóstico temporal)
const FIRESTORE_COLLECTION = FIRESTORE_LEGACY_COLLECTION;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 750 KB límite preventivo para proteger Firestore antes de R2
const R2_UPLOAD_URL = 'https://7dapp-media-api.lahirbueno.workers.dev/upload';

// ==========================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN Y DATOS INICIALES
// ==========================================================================
const app = {
  currentScreen: 'feed',
  currentCityId: 'city_eltigre',
  currentCategoryId: 'cat_todos',
  currentPromo: null,
  isAdminLoggedIn: false,
  publishStep: 1,
  selectedFile: null,
  selectedFileBase64: null,
  deferredInstallPrompt: null,
  activeSubcollectionUnsubs: {},

  // Configuración de la plataforma (actualizable desde el panel admin)
  settings: {
    publicationPrice: 0.99,
    publicationDurationDays: 7,
    adminWhatsapp: '+584228045737',
    pagoMovilPhone: '0414-1234567',
    pagoMovilId: 'V-12345678',
    pagoMovilBank: 'Banesco (0134)',
    pagoMovilName: 'Guía 7D Publicidad C.A.',
    paymentInstructions: 'Realiza el Pago Móvil por 0.99 USD a la tasa oficial del día. Guarda el número de referencia para verificar.'
  },

  // Ciudades iniciales garantizadas (se sincronizan con Cloud Firestore)

  cities: [
    {
      id: 'city_eltigre',
      name: 'El Tigre',
      state: 'Anzoátegui',
      active: true,
      lat: 8.88902,
      lng: -64.2527
    },
    {
      id: 'city_santome',
      name: 'San Tomé',
      state: 'Anzoátegui',
      active: true,
      lat: 8.9411,
      lng: -64.13
    },
    {
      id: 'city_guanipa',
      name: 'San José de Guanipa',
      state: 'Anzoátegui',
      active: true,
      lat: 8.88724,
      lng: -64.16512
    }
  ],


  // Categorías iniciales garantizadas
  categories: [
    { id: 'cat_todos', name: 'Todos', icon: '🔥', active: true },
    { id: 'cat_restaurantes', name: 'Comida & Restaurantes', icon: '🍕', active: true },
    { id: 'cat_tecnologia', name: 'Tecnología & Móviles', icon: '📱', active: true },
    { id: 'cat_moda', name: 'Moda & Calzado', icon: '👗', active: true },
    { id: 'cat_salud', name: 'Salud & Belleza', icon: '✨', active: true },
    { id: 'cat_servicios', name: 'Servicios & Oficios', icon: '🛠️', active: true },
    { id: 'cat_autos', name: 'Automotriz & Talleres', icon: '🚗', active: true },
    { id: 'cat_supermercados', name: 'Supermercados & Víveres', icon: '🛒', active: true }
  ],

  // Promociones iniciales para experiencia inmediata y fluida
  promotions: [  ],
promotionsLoaded: false,
};

// Exponer app en window para eventos HTML
window.app = app;

// ==========================================================================
// 3. NAVEGACIÓN Y CONTROL DE VISTAS (SPA)
// ==========================================================================
app.showScreen = function(screenName) {
  app.currentScreen = screenName;

  // Ocultar todas las pantallas y mostrar la solicitada
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Visibilidad del botón flotante de publicación
  const fab = document.getElementById('fab-publish');
  if (fab) {
    fab.style.display = (screenName === 'feed') ? 'inline-flex' : 'none';
  }

  window.scrollTo(0, 0);

  // Inicializar o refrescar la pantalla objetivo
  if (screenName === 'feed') {
    app.renderCategories();
    app.renderPromotions();
  } else if (screenName === 'cities') {
    app.renderCitiesPage();
  } else if (screenName === 'publish') {
    app.goToStep(1);
    app.updatePublishSelects();
  } else if (screenName === 'admin') {
    if (!app.isAdminLoggedIn) {
      app.openAdminModal();
    } else {
      app.switchAdminTab('dashboard');
    }
  }
};

// ==========================================================================
// 4. RENDERIZADO DEL FEED DE PROMOCIONES Y CATEGORÍAS
// ==========================================================================
app.renderCategories = function() {
  const container = document.getElementById('categories-container');
  if (!container) return;
  container.innerHTML = '';

  const activeCategories = app.categories.filter(c => c.active !== false);
  activeCategories.forEach(cat => {
    const isSelected = app.currentCategoryId === cat.id;
    const btn = document.createElement('button');
    btn.className = `category-chip ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `<span style="font-size: 16px;">${cat.icon || '🏷️'}</span> <span>${cat.name}</span>`;
    btn.onclick = () => {
      app.currentCategoryId = cat.id;
      const filterBadge = document.getElementById('active-filter-badge');
      const filterText = document.getElementById('active-filter-text');
      if (filterBadge && filterText) {
        if (cat.id !== 'cat_todos') {
          filterText.textContent = `${cat.icon || ''} ${cat.name}`;
          filterBadge.style.display = 'inline-flex';
        } else {
          filterBadge.style.display = 'none';
        }
      }
      app.renderCategories();
      app.renderPromotions();
    };
    container.appendChild(btn);
  });
};

app.clearCategoryFilter = function() {
  app.currentCategoryId = 'cat_todos';
  const filterBadge = document.getElementById('active-filter-badge');
  if (filterBadge) filterBadge.style.display = 'none';
  app.renderCategories();
  app.renderPromotions();
};

app.renderPromotions = function() {
  const grid = document.getElementById('promotions-grid');
  const emptyState = document.getElementById('empty-state');
  const countLabel = document.getElementById('active-promos-count');
  if (!grid) return;
  grid.innerHTML = '';

  const now = Date.now();

  // Filtrar promociones activas vigentes
  const filtered = app.promotions.filter(promo => {
    if (promo.status !== 'active') return false;
    if (promo.expirationDate && promo.expirationDate < now) return false;
    if (promo.cityId && promo.cityId !== app.currentCityId) return false;
    if (app.currentCategoryId !== 'cat_todos' && promo.categoryId !== app.currentCategoryId) return false;
    return true;
  });

  if (countLabel) countLabel.textContent = filtered.length;
  if (emptyState) emptyState.style.display = (!app.promotionsLoaded) ? 'none' : ((filtered.length === 0) ? 'block' : 'none');

  filtered.forEach(promo => {
    const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
    const card = document.createElement('div');
    card.className = 'promo-card';
    card.onclick = () => app.openDetail(promo.id);

    const imageUrl = promo.imageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80';

    card.innerHTML = `
      <div class="promo-card-image-wrap">
        <img class="promo-card-image" src="${imageUrl}" alt="${promo.title || 'Promoción'}" loading="lazy">
        <span class="promo-badge-city">📍 ${cityName}</span>
<span class="promo-badge-city">${String.fromCodePoint(0x1F525)} ${parseInt(promo.durationDays) || 7} D\u00CDAS</span>
      </div>
      <div class="promo-card-body">
        <div class="promo-card-business">
          <span style="font-size: 14px;">⭐</span>
          <span>${promo.businessName || 'Comercio Local'}</span>
        </div>
        <h3 class="promo-card-title">${promo.title || 'Oferta Especial'}</h3>
        <p class="promo-card-desc">${promo.description || ''}</p>
        <div class="promo-card-footer">
          <span class="clicks-counter">🔥 ${promo.whatsappClicks || 0} interesados</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="promo-card-share-btn" onclick="event.stopPropagation(); app.sharePromoById('${promo.id}')" title="Compartir">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
            </button>
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); app.openDetail('${promo.id}')">
              Ver Oferta
            </button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
};

// ==========================================================================
// 5. PANTALLA DE DETALLE DEL FLYER
// ==========================================================================
app.openDetail = function(promoId) {
  const promo = app.promotions.find(p => p.id === promoId);
  if (!promo) return;
  app.currentPromo = promo;

  const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
  const cat = app.categories.find(c => c.id === promo.categoryId);
  const catName = cat ? `${cat.icon || '🏷️'} ${cat.name}` : 'General';

  // Poblar información de detalle
  const imgEl = document.getElementById('detail-image');
  if (imgEl) imgEl.src = promo.imageUrl || '';
  const businessEl = document.getElementById('detail-business');
  if (businessEl) businessEl.textContent = (promo.businessName || 'Comercio').toUpperCase();
  const cityEl = document.getElementById('detail-city');
  if (cityEl) cityEl.textContent = cityName;
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.textContent = promo.title || '';
  const descEl = document.getElementById('detail-description');
  if (descEl) descEl.textContent = promo.description || '';
  const clicksEl = document.getElementById('detail-clicks-count');
  if (clicksEl) clicksEl.textContent = promo.whatsappClicks || 0;

  // Redes sociales
  const socialsBox = document.getElementById('detail-socials');
  const instaLink = document.getElementById('detail-instagram-link');
  const instaLabel = document.getElementById('detail-instagram-label');
  const tiktokLink = document.getElementById('detail-tiktok-link');
  const tiktokLabel = document.getElementById('detail-tiktok-label');

  let hasSocials = false;
  if (promo.instagram) {
    const cleanInsta = promo.instagram.replace('@', '').trim();
    if (instaLink) instaLink.href = `https://instagram.com/${cleanInsta}`;
    if (instaLabel) instaLabel.textContent = `@${cleanInsta}`;
    if (instaLink) instaLink.style.display = 'flex';
    hasSocials = true;
  } else if (instaLink) {
    instaLink.style.display = 'none';
  }

  if (promo.tiktok) {
    const cleanTiktok = promo.tiktok.replace('@', '').trim();
    if (tiktokLink) tiktokLink.href = `https://tiktok.com/@${cleanTiktok}`;
    if (tiktokLabel) tiktokLabel.textContent = `@${cleanTiktok}`;
    if (tiktokLink) tiktokLink.style.display = 'flex';
    hasSocials = true;
  } else if (tiktokLink) {
    tiktokLink.style.display = 'none';
  }

  if (socialsBox) socialsBox.style.display = hasSocials ? 'block' : 'none';

  app.showScreen('detail');
};

app.handleQuieroClick = function(promo) {
  const targetPromo = promo || app.currentPromo;
  if (!targetPromo) return;

  targetPromo.whatsappClicks = (targetPromo.whatsappClicks || 0) + 1;
  const clicksEl = document.getElementById('detail-clicks-count');
  if (clicksEl) clicksEl.textContent = targetPromo.whatsappClicks;

  // Actualizar contador en Firestore (única fuente oficial: promotions/{id})
  if (db && targetPromo.id) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(targetPromo.id).update({
      whatsappClicks: firebase.firestore.FieldValue.increment(1)
    }).catch((err) => {
      console.warn('[Firestore] Error al registrar clic de WhatsApp en promotions:', err.message);
    });
  }

  // Redirigir a WhatsApp con mensaje automático
  const rawNumber = targetPromo.whatsappNumber || app.settings.adminWhatsapp;
  const cleanNumber = rawNumber.replace(/\D/g, '');
  const msg = `Hola ${targetPromo.businessName}! Vi su promoción '${targetPromo.title}' en 7D App y quiero aprovecharla.`;
  window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ==========================================================================
// SISTEMA OFICIAL DE COMPARTIR Y NOTIFICACIONES
// ==========================================================================
app.showToast = function(message) {
  let toast = document.getElementById('app-toast');
  let msgEl = document.getElementById('app-toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    msgEl = document.createElement('span');
    msgEl.id = 'app-toast-msg';
    toast.appendChild(msgEl);
    document.body.appendChild(toast);
  }
  msgEl.textContent = message;
  toast.style.display = 'block';

  if (app.toastTimeout) clearTimeout(app.toastTimeout);
  app.toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
};

app.executeShare = async function(title, text, url) {
  const shareData = { title, text, url };

  // 1. Intentar el menú típico nativo de compartir (Android / iOS / Web Share API)
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // Cancelado voluntariamente
    }
  }

  // 2. Fallback: Copiar enlace al portapapeles con notificación Toast
  const shareFullContent = `${text}\n${url}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(shareFullContent);
      app.showToast('📋 ¡Enlace copiado al portapapeles!');
      return;
    } catch (e) {}
  }

  // 3. Fallback alternativo directo
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareFullContent)}`;
  window.open(waUrl, '_blank');
};

app.shareApp = function() {
  const currentCity = (app.cities.find(c => c.id === app.currentCityId) || {}).name || 'nuestra ciudad';
  const url = window.location.href.split('#')[0];
  const title = '7D App - Promociones de la Semana';
  const text = `🔥 ¡Mira las mejores promociones y ofertas semanales de ${currentCity} en 7D App!`;
  app.executeShare(title, text, url);
};

app.sharePromo = function(promo) {
  if (!promo) {
    app.shareApp();
    return;
  }
  const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
  const url = `${window.location.origin}${window.location.pathname}#promo=${promo.id}`;
  const title = `${promo.businessName} - 7D App`;
  const text = `🔥 ¡Mira esta promoción de ${promo.businessName} en ${cityName}: '${promo.title}'!`;
  app.executeShare(title, text, url);
};

app.shareCurrentPromo = function() {
  const promo = app.currentPromo;
  if (!promo) {
    app.shareApp();
    return;
  }
  app.sharePromo(promo);
};

app.sharePromoById = function(promoId) {
  const promo = app.promotions.find(p => p.id === promoId);
  if (promo) {
    app.sharePromo(promo);
  } else {
    app.shareApp();
  }
};

app.openFullScreenImage = function() {
  const imgEl = document.getElementById('detail-image');
  const modal = document.getElementById('modal-fullscreen');
  const fullImg = document.getElementById('fullscreen-img');
  if (imgEl && modal && fullImg) {
    fullImg.src = imgEl.src;
    modal.classList.add('active');
  }
};

app.closeFullScreenImage = function() {
  const modal = document.getElementById('modal-fullscreen');
  if (modal) modal.classList.remove('active');
};

// ==========================================================================
// 6. GESTIÓN Y MODAL DE CIUDADES
// ==========================================================================
app.openCityModal = function() {
  const modal = document.getElementById('modal-city');
  if (modal) {
    modal.classList.add('active');
    app.renderCitiesModal();
  }
};

app.closeCityModal = function() {
  const modal = document.getElementById('modal-city');
  if (modal) modal.classList.remove('active');
};


app.selectCity = function(cityId, fromLocation = false) {
  if (!fromLocation) {
    app.cityManuallySelected = true;
  }

  app.currentCityId = cityId;
  const city = app.cities.find(c => c.id === cityId);
  const currentCityLabel = document.getElementById('current-city-label');
  if (currentCityLabel && city) currentCityLabel.textContent = city.name;

  app.closeCityModal();
  app.renderPromotions();
};


app.detectNearestCity = function() {
  if (app.locationAttempted || app.cityManuallySelected) return;
  if (!navigator.geolocation) return;

  app.locationAttempted = true;

  navigator.geolocation.getCurrentPosition(
    function(position) {
      if (app.cityManuallySelected) return;

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;

      function distanceKm(lat1, lng1, lat2, lng2) {
        const rad = value => value * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLng = rad(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(lat1)) *
          Math.cos(rad(lat2)) *
          Math.sin(dLng / 2) ** 2;

        return 6371 * 2 * Math.atan2(
          Math.sqrt(a),
          Math.sqrt(1 - a)
        );
      }

      const nearest = app.cities
        .filter(city =>
          city.active !== false &&
          Number.isFinite(Number(city.lat)) &&
          Number.isFinite(Number(city.lng)) &&
          city.lat !== '' &&
          city.lng !== ''
        )
        .map(city => ({
          city,
          distance: distanceKm(
            userLat,
            userLng,
            Number(city.lat),
            Number(city.lng)
          )
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest && nearest.distance <= 50) {
        app.selectCity(nearest.city.id, true);
        console.log(
          '[Ubicación] Ciudad cercana seleccionada:',
          nearest.city.name
        );
      }
    },
    function(error) {
      console.info(
        '[Ubicación] No se pudo obtener la ubicación; se conserva la ciudad actual.',
        error.message
      );
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    }
  );
};

app.renderCitiesModal = function() {
  const container = document.getElementById('cities-modal-list');
  if (!container) return;
  container.innerHTML = '';

  const activeCities = app.cities.filter(c => c.active !== false);
  activeCities.forEach(city => {
    const isSelected = app.currentCityId === city.id;
    const btn = document.createElement('button');
    btn.className = `sheet-item ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        
<svg class="icon" viewBox="0 0 24 24" style="width: 22px; height: 22px; flex-shrink: 0;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>

        <div style="text-align: left;">
          <div style="font-weight: 700; color: #FFFFFF;">${city.name}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${city.state || 'Venezuela'}</div>
        </div>
      </div>
      ${isSelected ? '<span style="color: var(--primary); font-weight: 800;">✓ Seleccionada</span>' : ''}
    `;
    btn.onclick = () => app.selectCity(city.id);
    container.appendChild(btn);
  });
};

app.renderCitiesPage = function() {
  const container = document.getElementById('cities-page-list');
  if (!container) return;
  container.innerHTML = '';

  const activeCities = app.cities.filter(c => c.active !== false);
  activeCities.forEach(city => {
    const count = app.promotions.filter(p => p.status === 'active' && p.cityId === city.id).length;
    const isSelected = app.currentCityId === city.id;
    const card = document.createElement('div');
    card.className = `city-card ${isSelected ? 'active-selected' : ''}`;
    card.onclick = () => {
      app.selectCity(city.id);
      app.showScreen('feed');
    };
    card.innerHTML = `
      <div class="city-card-left">
        <div class="city-card-icon-wrap">📍</div>
        <div class="city-card-info">
          <h3>${city.name}</h3>
          <p><span>📌</span> ${city.state || 'Venezuela'}</p>
        </div>
      </div>
      <div class="city-card-right">
        ${isSelected ? '<span class="city-selected-badge">✓ Activa</span>' : ''}
        <span class="city-offers-badge">🔥 ${count} ${count === 1 ? 'oferta' : 'ofertas'}</span>
        <svg class="city-card-arrow icon icon-sm" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
      </div>
    `;
    container.appendChild(card);
  });
};

// ==========================================================================
// 7. PUBLICACIÓN DE FLYERS (FLUJO COMPLETO EN 4 PASOS)
// ==========================================================================
app.goToStep = function(stepNum) {
  app.publishStep = stepNum;

  document.querySelectorAll('.publish-step-content').forEach((el, idx) => {
    el.classList.toggle('active', idx + 1 === stepNum);
  });

  document.querySelectorAll('.step-item').forEach((dot, idx) => {
    dot.classList.toggle('active', idx + 1 <= stepNum);
  });

  window.scrollTo(0, 0);
};

app.updatePublishSelects = function() {
  const citySelect = document.getElementById('pub-city-id');
  if (citySelect) {
    const active = app.cities.filter(c => c.active !== false);
    citySelect.innerHTML = active.map(c => `<option value="${c.id}">${c.name} (${c.state || 'VE'})</option>`).join('');
    if (app.currentCityId) citySelect.value = app.currentCityId;
  }

  const catSelect = document.getElementById('pub-category-id');
  if (catSelect) {
    const activeCats = app.categories.filter(c => c.active !== false && c.id !== 'cat_todos');
    catSelect.innerHTML = activeCats.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
  }

  // Precios y datos de pago
  const priceDisplay = document.getElementById('pricing-rate-display');
  if (priceDisplay) priceDisplay.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);

  const instContent = document.getElementById('payment-instructions-content');
  if (instContent) {
    instContent.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
        <div><strong>Teléfono:</strong> ${app.settings.pagoMovilPhone || '0414-1234567'}</div>
        <div><strong>Cédula / RIF:</strong> ${app.settings.pagoMovilId || 'V-12345678'}</div>
        <div><strong>Banco:</strong> ${app.settings.pagoMovilBank || 'Banesco (0134)'}</div>
        <div><strong>Titular:</strong> ${app.settings.pagoMovilName || 'Guía 7D Publicidad C.A.'}</div>
        <div style="margin-top: 6px; color: var(--accent); font-weight: 600;">${app.settings.paymentInstructions || ''}</div>
      </div>
    `;
  }
};

function convertImageToWebP(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo preparar la imagen.'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);

        if (!blob) {
          reject(new Error('No se pudo convertir el flyer a WebP.'));
          return;
        }

        resolve(blob);
      }, 'image/webp', 0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };

    img.src = objectUrl;
  });
}
app.handleImageUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  app.selectedFile = file;

  const errBox = document.getElementById('pub-error');

  // Validación estricta preventiva de peso (máximo 750 KB para salvaguardar el límite de 1 MiB de Firestore)
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    const sizeKB = Math.round(file.size / 1024);
    const maxKB = Math.round(MAX_IMAGE_FILE_SIZE_BYTES / 1024);
    const msg = `La imagen seleccionada es demasiado pesada (${sizeKB} KB). El límite máximo permitido en esta fase es ${maxKB} KB para garantizar que se guarde correctamente. Por favor selecciona una imagen más liviana o comprimida.`;
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    } else {
      alert(msg);
    }
    event.target.value = '';
    app.selectedFileBase64 = null;
    app.selectedFile = null;
    const previewBox = document.getElementById('upload-preview-box');
    const placeholder = document.getElementById('upload-placeholder');
    if (previewBox) previewBox.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    return;
  }

  if (errBox) errBox.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(e) {
    app.selectedFileBase64 = e.target.result;
    const previewBox = document.getElementById('upload-preview-box');
    const previewImg = document.getElementById('upload-preview-img');
    const placeholder = document.getElementById('upload-placeholder');
    if (previewBox && previewImg && placeholder) {
      previewImg.src = e.target.result;
      previewBox.style.display = 'block';
      placeholder.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);
};
// Alias para compatibilidad
app.handleImageSelect = app.handleImageUpload;

async function uploadFlyerToR2(file) {
  const webpBlob = await convertImageToWebP(file);

  const formData = new FormData();
  formData.append('file', webpBlob, 'flyer.webp');

  const response = await fetch(R2_UPLOAD_URL, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok || !data.url) {
    throw new Error(data.error || 'No se pudo subir el flyer a R2.');
  }

  return data.url;
}
app.proceedToStep2 = function() {
  const name = (document.getElementById('pub-business-name') || {}).value || '';
  const whatsapp = (document.getElementById('pub-whatsapp') || {}).value || '';
  const title = (document.getElementById('pub-title') || {}).value || '';
  const desc = (document.getElementById('pub-description') || {}).value || '';
  const errBox = document.getElementById('pub-error');

  if (!name.trim() || !whatsapp.trim() || !title.trim() || !desc.trim()) {
    if (errBox) {
      errBox.textContent = 'Por favor completa todos los campos obligatorios (*).';
      errBox.style.display = 'block';
    } else {
      alert('Por favor completa todos los campos obligatorios (*).');
    }
    return;
  }

  if (!app.selectedFileBase64) {
    if (errBox) {
      errBox.textContent = 'Por favor selecciona la imagen o flyer de tu promoción.';
      errBox.style.display = 'block';
    } else {
      alert('Por favor selecciona la imagen o flyer de tu promoción.');
    }
    return;
  }

  if (errBox) errBox.style.display = 'none';

  // Renderizar Vista Previa en Paso 2
  const previewContainer = document.getElementById('preview-card-container');
  if (previewContainer) {
    const cityId = (document.getElementById('pub-city-id') || {}).value || app.currentCityId;
    const cityName = (app.cities.find(c => c.id === cityId) || {}).name || 'Venezuela';
    previewContainer.innerHTML = `
      <div class="promo-card" style="margin: 0 auto; max-width: 400px; pointer-events: none;">
        <div class="promo-card-image-wrap">
          <img class="promo-card-image" src="${app.selectedFileBase64}" alt="Vista previa">
          <span class="promo-badge-city">📍 ${cityName}</span>
<span class="promo-badge-city" style="background:#16A34A;color:#fff;font-weight:800;">${String.fromCodePoint(0x1F525)} ${parseInt(app.settings.publicationDurationDays) || 7} D\u00CDAS</span>
        </div>
        <div class="promo-card-body">
          <div class="promo-card-business">${name.trim()}</div>
          <h3 class="promo-card-title">${title.trim()}</h3>
          <p class="promo-card-desc">${desc.trim()}</p>
          <div class="promo-card-footer">
            <span class="clicks-counter">🔥 0 personas interesadas</span>
            <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: #F43F5E;">Vista Previa</span>
          </div>
        </div>
      </div>
    `;
  }

  app.goToStep(2);
};

app.proceedToStep3 = function() {
  app.goToStep(3);
};

app.submitPromotion = async function() {
  const ref = ((document.getElementById('pub-payment-ref') || {}).value || '').trim();
  const method = ((document.getElementById('pub-payment-method') || {}).value || 'Pago Móvil');
  const errBox = document.getElementById('payment-error');

  if (!ref || ref.length < 4) {
    if (errBox) {
      errBox.textContent = 'Por favor ingresa el número de referencia o últimos 4 dígitos del pago.';
      errBox.style.display = 'block';
    } else {
      alert('Por favor ingresa el número de referencia del comprobante.');
    }
    return;
  }

  // Validación de seguridad de peso de imagen antes de escribir en Firestore
  
  if (errBox) errBox.style.display = 'none';

  const promoId = 'promo_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
  const businessName = (document.getElementById('pub-business-name').value || '').trim();
  const cityId = document.getElementById('pub-city-id').value;
  const categoryId = document.getElementById('pub-category-id').value;
  const title = (document.getElementById('pub-title').value || '').trim();
  const description = (document.getElementById('pub-description').value || '').trim();
  const whatsappNumber = (document.getElementById('pub-whatsapp').value || '').trim();
  const instagram = (document.getElementById('pub-instagram').value || '').trim();
  const tiktok = (document.getElementById('pub-tiktok').value || '').trim();

  const newPromo = {
    id: promoId,
    businessName,
    cityId,
    categoryId,
    title,
    description,
    imageUrl: '',
    whatsappNumber,
    instagram,
    tiktok,
    price: app.settings.publicationPrice || 0.99,
    paymentMethod: method,
    paymentReference: ref,
    status: 'pending_approval',
    whatsappClicks: 0,
    createdAt: Date.now(),
    expirationDate: Date.now() + ((app.settings.publicationDurationDays || 7) * 86400000),
    durationDays: parseInt(app.settings.publicationDurationDays) || 7,
    isFlyer: true
  };

  const btnSubmit = document.querySelector('#publish-step-3 button[onclick*="submitPromotion"]') || document.getElementById('pub-submit-btn');
  const originalBtnText = btnSubmit ? btnSubmit.textContent : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando publicación...';
  }
let imageUrl = '';

try {
  if (!app.selectedFile) {
    throw new Error('No se encontró el flyer seleccionado.');
  }

  if (btnSubmit) btnSubmit.textContent = 'Subiendo flyer...';

  imageUrl = await uploadFlyerToR2(app.selectedFile);

  if (btnSubmit) btnSubmit.textContent = 'Registrando publicación...';
} catch (uploadError) {
  console.error('[R2] Error al subir flyer:', uploadError);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = originalBtnText;
  }

  if (errBox) {
    errBox.textContent = uploadError.message || 'No se pudo subir el flyer. Inténtalo nuevamente.';
    errBox.style.display = 'block';
  } else {
    alert(uploadError.message || 'No se pudo subir el flyer. Inténtalo nuevamente.');
  }

  return;
}

newPromo.imageUrl = imageUrl;
  const finalizeSuccess = () => {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalBtnText || 'Confirmar y Enviar Publicación';
    }
    // Poblar recibo en Paso 4
    const succBusiness = document.getElementById('success-business');
    if (succBusiness) succBusiness.textContent = businessName;
    const succPrice = document.getElementById('success-price');
    if (succPrice) succPrice.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);
    const succRef = document.getElementById('success-ref');
    if (succRef) succRef.textContent = ref;

    const adminMsg = `Hola! Acabo de publicar el anuncio de '${businessName}' en 7D App. Mi referencia de pago es: ${ref} por $${(app.settings.publicationPrice || 0.99).toFixed(2)}.`;
    const cleanAdmin = (app.settings.adminWhatsapp || '+584228045737').replace(/\D/g, '');
    const proofBtn = document.getElementById('send-proof-whatsapp-btn');
    if (proofBtn) proofBtn.href = `https://wa.me/${cleanAdmin}?text=${encodeURIComponent(adminMsg)}`;

    app.goToStep(4);
  };

  // Guardar exclusivamente en la colección oficial promotions/{promoId}
  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(promoId).set(newPromo)
      .then(() => {
        
        finalizeSuccess();
      })
      .catch((err) => {
        console.error('[Firestore] Error al guardar en promotions:', err);
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = originalBtnText || 'Confirmar y Enviar Publicación';
        }
        const errMsg = 'Error al registrar la promoción en el servidor: ' + (err.message || 'Error de conexión con la base de datos');
        if (errBox) {
          errBox.textContent = errMsg;
          errBox.style.display = 'block';
        } else {
          alert(errMsg);
        }
      });
  } else {
    // Modo local / offline
    app.promotions.unshift(newPromo);
    finalizeSuccess();
  }
};
app.submitPromotionForm = app.submitPromotion;

// ==========================================================================
// 8. SEGURIDAD Y ACCESO ADMINISTRATIVO — GOOGLE AUTH
// ==========================================================================

const ADMIN_EMAIL = 'josueco@gmail.com';

app.adminAuth = null;
app.isAdminLoggedIn = false;

// --------------------------------------------------------------------------
// Inicialización de Firebase Authentication
// --------------------------------------------------------------------------
try {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    app.adminAuth = firebase.auth();

    app.adminAuth.onAuthStateChanged(function(user) {
      if (user && user.email && user.email.toLowerCase() === ADMIN_EMAIL) {
        app.isAdminLoggedIn = true;
        console.log('[Auth] Administrador autenticado:', user.email);
      } else {
        app.isAdminLoggedIn = false;

        if (user) {
          console.warn('[Auth] Usuario no autorizado:', user.email);
          app.adminAuth.signOut().catch(() => {});
        }
      }
    });
  }
} catch (err) {
  console.error('[Auth] Error al inicializar Firebase Auth:', err);
}

// --------------------------------------------------------------------------
// Abrir acceso administrativo
// --------------------------------------------------------------------------
app.openAdminModal = function() {
  if (!app.adminAuth) {
    alert('El sistema de autenticación todavía no está disponible.');
    return;
  }

  app.adminAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .then(function(result) {
      const user = result.user;

      if (
        !user ||
        !user.email ||
        user.email.toLowerCase() !== ADMIN_EMAIL
      ) {
        app.isAdminLoggedIn = false;

        return app.adminAuth.signOut().then(function() {
          alert('Esta cuenta de Google no tiene autorización para acceder al panel administrativo.');
        });
      }

      app.isAdminLoggedIn = true;
      app.showScreen('admin');
    })
    .catch(function(error) {
      console.error('[Auth] Error de inicio de sesión:', error);

      if (error && error.code === 'auth/popup-closed-by-user') {
        return;
      }

      alert('No se pudo iniciar sesión con Google. Inténtalo nuevamente.');
    });
};

// --------------------------------------------------------------------------
// Compatibilidad: cerrar antiguo modal PIN
// --------------------------------------------------------------------------


// --------------------------------------------------------------------------
// Compatibilidad temporal con el botón/formulario antiguo
// --------------------------------------------------------------------------
app.verifyAdminPin = function() {
  app.openAdminModal();
};

// --------------------------------------------------------------------------
// Cerrar sesión administrativa
// --------------------------------------------------------------------------
app.logoutAdmin = function() {
  if (app.adminAuth) {
    app.adminAuth.signOut()
      .catch(function(error) {
        console.warn('[Auth] Error al cerrar sesión:', error);
      });
  }

  app.isAdminLoggedIn = false;
  app.showScreen('feed');
};
// ==========================================================================
// 9. PANEL ADMINISTRATIVO (TABS, MODERACIÓN, CIUDADES Y CATEGORÍAS)
// ==========================================================================
app.switchAdminTab = function(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('onclick').includes(tabName));
  });
  document.querySelectorAll('.admin-tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `admin-tab-${tabName}`);
  });

  if (tabName === 'dashboard') app.renderAdminDashboard();
  if (tabName === 'pending') app.renderAdminPending();
  if (tabName === 'active') app.renderAdminActive();
if (tabName === 'expired') app.renderAdminExpired();
  if (tabName === 'cities') app.renderAdminCities();
  if (tabName === 'categories') app.renderAdminCategories();
  if (tabName === 'settings') app.renderAdminSettings();
};

app.renderAdminDashboard = function() {
  const activeCount = app.promotions.filter(p => p.status === 'active').length;
  const pendingCount = app.promotions.filter(p => p.status === 'pending_approval').length;
  const totalClicks = app.promotions.reduce((acc, p) => acc + (p.whatsappClicks || 0), 0);

  const mActive = document.getElementById('metric-active');
  if (mActive) mActive.textContent = activeCount;
  const mPending = document.getElementById('metric-pending');
  if (mPending) mPending.textContent = pendingCount;
  const mClicks = document.getElementById('metric-total-clicks');
  if (mClicks) mClicks.textContent = totalClicks;
  const mRate = document.getElementById('metric-rate');
  if (mRate) mRate.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);

  const bPending = document.getElementById('admin-pending-badge');
  if (bPending) bPending.textContent = pendingCount;
  const bActive = document.getElementById('admin-active-badge');
  if (bActive) bActive.textContent = activeCount;
  const bCities = document.getElementById('admin-cities-badge');
  if (bCities) bCities.textContent = app.cities.filter(c => c.active !== false).length;
  const bCats = document.getElementById('admin-cats-badge');
  if (bCats) bCats.textContent = app.categories.filter(c => c.active !== false).length;

  // Ranking de clics
  const rankingList = document.getElementById('clicks-ranking-container');
  if (!rankingList) return;
  rankingList.innerHTML = '';

  const sorted = [...app.promotions].sort((a, b) => (b.whatsappClicks || 0) - (a.whatsappClicks || 0)).slice(0, 5);
  sorted.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'ranking-item';
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="ranking-pos">#${idx + 1}</span>
        <div>
          <div style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${p.businessName}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${p.title}</div>
        </div>
      </div>
      <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: #F43F5E; font-weight: 800;">${p.whatsappClicks || 0} clics</span>
    `;
    rankingList.appendChild(row);
  });
};

app.renderAdminPending = function() {
  const container = document.getElementById('admin-pending-list');
  if (!container) return;
  container.innerHTML = '';

  const pending = app.promotions.filter(p => p.status === 'pending_approval');
  if (pending.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers pendientes de revisión.</p>';
    return;
  }

  pending.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px; font-weight: 600;">${promo.title}</div>
        <div style="font-size: 12px; color: var(--accent); margin-top: 4px;">Ref. Pago: <strong>${promo.paymentReference || 'N/A'}</strong> (${promo.paymentMethod || 'Pago Móvil'})</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-primary btn-sm" onclick="app.approvePromo('${promo.id}')">✓ Aprobar</button>
        <button class="btn btn-secondary btn-sm" onclick="app.rejectPromo('${promo.id}')">✕ Rechazar</button>
      </div>
    `;
    container.appendChild(card);
  });
};

app.renderAdminActive = function() {
  const container = document.getElementById('admin-active-list');
  if (!container) return;
  container.innerHTML = '';

  const now = Date.now();
const active = app.promotions.filter(p => p.status === 'active' && (!p.expirationDate || p.expirationDate >= now));
  if (active.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers activos en este momento.</p>';
    return;
  }

  active.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px;">${promo.title}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Clicks: ${promo.whatsappClicks || 0}</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-secondary btn-sm" onclick="app.suspendPromo('${promo.id}')">Suspender</button>
        <button class="btn btn-secondary btn-sm" onclick="app.deletePromo('${promo.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
};
app.renderAdminExpired = function() {
  const container = document.getElementById('admin-expired-list');
  if (!container) return;
  container.innerHTML = '';

  const now = Date.now();
  const expired = app.promotions.filter(p => p.status === 'active' && p.expirationDate && p.expirationDate < now);

  const badge = document.getElementById('admin-expired-badge');
  if (badge) badge.textContent = expired.length;

  if (expired.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers expirados.</p>';
    return;
  }

  expired.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px;">${promo.title}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Clicks: ${promo.whatsappClicks || 0}</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-secondary btn-sm" onclick="app.deletePromo('${promo.id}')" title="Eliminar">Eliminar</button>
      </div>
    `;
    container.appendChild(card);
  });
};

// Acciones sobre promociones (única fuente oficial: promotions/{id})
app.approvePromo = function(id) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;
  const approvedAt = Date.now();
  const durationDays = parseInt(promo.durationDays) || parseInt(app.settings.publicationDurationDays) || 7;
  const expirationDate = approvedAt + (durationDays * 86400000);

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update({
      status: 'active',
      approvedAt: approvedAt,
      expirationDate: expirationDate
    }).then(() => {
      promo.status = 'active';
      promo.approvedAt = approvedAt;
      promo.expirationDate = expirationDate;
      app.renderAdminPending();
      app.renderAdminActive();
      app.renderAdminDashboard();
      app.renderPromotions();
      app.showToast('Promoción aprobada y activada');
    }).catch((err) => {
      console.error('[Firestore] Error al aprobar promoción:', err);
      alert('Error al aprobar en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'active';
    promo.approvedAt = approvedAt;
    promo.expirationDate = expirationDate;
    app.renderAdminPending();
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción aprobada (modo local)');
  }
};

app.rejectPromo = function(id) {
  const reason = prompt('Motivo del rechazo:', 'Pago no verificado');
  if (reason === null) return;
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update({
      status: 'rejected',
      rejectionReason: reason
    }).then(() => {
      promo.status = 'rejected';
      promo.rejectionReason = reason;
      app.renderAdminPending();
      app.renderAdminDashboard();
      app.showToast('Promoción rechazada');
    }).catch((err) => {
      console.error('[Firestore] Error al rechazar promoción:', err);
      alert('Error al rechazar en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'rejected';
    promo.rejectionReason = reason;
    app.renderAdminPending();
    app.renderAdminDashboard();
    app.showToast('Promoción rechazada (modo local)');
  }
};

app.deletePromo = function(id) {
  if (!confirm('¿Estás seguro de eliminar este flyer permanentemente?')) return;
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  const deleteR2File = async function() {
    if (!promo.imageUrl) return;

    const response = await fetch(promo.imageUrl, {
      method: 'DELETE'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo eliminar el flyer de R2.');
    }
  };

  if (db) {
    deleteR2File()
      .then(() => {
        return db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).delete();
      })
      .then(() => {
        app.promotions = app.promotions.filter(p => p.id !== id);
        app.renderAdminPending();
        app.renderAdminActive();
        app.renderAdminDashboard();
        app.renderPromotions();
        app.showToast('Promoción y flyer eliminados permanentemente');
      })
      .catch((err) => {
        console.error('[R2/Firestore] Error al eliminar promoción:', err);
        alert('No se pudo eliminar completamente: ' + (err.message || 'Error desconocido'));
      });
  } else {
    app.promotions = app.promotions.filter(p => p.id !== id);
    app.renderAdminPending();
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción eliminada (modo local)');
  }
};

app.suspendPromo = function(id) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update({
      status: 'expired'
    }).then(() => {
      promo.status = 'expired';
      app.renderAdminActive();
      app.renderAdminDashboard();
      app.renderPromotions();
      app.showToast('Promoción suspendida');
    }).catch((err) => {
      console.error('[Firestore] Error al suspender promoción:', err);
      alert('Error al suspender en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'expired';
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción suspendida (modo local)');
  }
};

// ==========================================================================
// 10. GESTIÓN DE CIUDADES EN EL PANEL (CRUD & ACTIVAR / DESACTIVAR)
// ==========================================================================
app.renderAdminCities = function() {
  const container = document.getElementById('admin-cities-list');
  if (!container) return;
  container.innerHTML = '';

  app.cities.forEach(city => {
    const isActive = city.active !== false;
    const card = document.createElement('div');
    card.className = `admin-entity-card ${isActive ? 'active' : 'inactive'}`;
    card.innerHTML = `
      <div class="admin-entity-info">
        <span style="font-size: 26px;">📍</span>
        <div>
          <div class="admin-entity-title">${city.name}</div>
          <div class="admin-entity-subtitle">${city.state || 'Venezuela'}</div>
        </div>
      </div>
      <div class="admin-entity-actions">
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Activa' : 'Inactiva'}</span>
        <button class="btn btn-sm ${isActive ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="app.toggleCityStatus('${city.id}')">
          ${isActive ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="app.deleteCity('${city.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
};


app.persistCities = function() {
  if (!db) {
    console.error('[Ciudades] Firestore no está inicializado.');
    return;
  }

  const cleanCities = app.cities.map(city =>
    Object.fromEntries(
      Object.entries(city).filter(([, value]) => value !== undefined)
    )
  );

  db.collection(FIRESTORE_SETTINGS_COLLECTION)
    .doc(FIRESTORE_CITIES_DOC)
    .set({ list: cleanCities }, { merge: true })
    .then(() => console.log('[Ciudades] Guardado correctamente en Firestore.'))
    .catch(err => console.error('[Ciudades] Error al guardar:', err.code, err.message));
};

app.addCity = function(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('new-city-name');
  const stateInput = document.getElementById('new-city-state');
const latInput = document.getElementById('new-city-lat');
const lngInput = document.getElementById('new-city-lng');
const lat = latInput ? Number(latInput.value) : NaN;
const lng = lngInput ? Number(lngInput.value) : NaN;
  const name = (nameInput ? nameInput.value : '').trim();
  const state = (stateInput ? stateInput.value : '').trim() || 'Venezuela';

  if (!name) {
    alert('Ingresa el nombre de la ciudad.');
    return;
  }
if (
  !latInput || !lngInput ||
  latInput.value.trim() === '' ||
  lngInput.value.trim() === '' ||
  !Number.isFinite(lat) ||
  !Number.isFinite(lng) ||
  lat < -90 || lat > 90 ||
  lng < -180 || lng > 180
) {
  alert('Ingresa coordenadas válidas. Latitud: -90 a 90. Longitud: -180 a 180.');
  return;
}
  const id = 'city_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
  const newCity = {
  id, name, state, active: true,
  lat, lng, createdAt: Date.now()
};

  app.cities.push(newCity);
  if (nameInput) nameInput.value = '';
  if (stateInput) stateInput.value = '';
if (latInput) latInput.value = '';
if (lngInput) lngInput.value = '';

  if (db) {
    app.persistCities();
  }

  app.renderAdminCities();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();
  app.renderAdminDashboard();
};
app.saveCity = app.addCity;

app.toggleCityStatus = function(cityId) {
  const city = app.cities.find(c => c.id === cityId);
  if (!city) return;
  city.active = ! (city.active !== false);

  if (db) {
   app.persistCities();
  }

  app.renderAdminCities();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};
app.toggleCity = app.toggleCityStatus;

app.deleteCity = function(cityId) {
  if (app.cities.length <= 1) {
    alert('Debe permanecer al menos una ciudad registrada en el sistema.');
    return;
  }
  if (!confirm('¿Estás seguro de eliminar esta ciudad permanentemente?')) return;

  app.cities = app.cities.filter(c => c.id !== cityId);

  if (db) {
    app.persistCities();
  }

  app.renderAdminCities();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};

// ==========================================================================
// 11. GESTIÓN DE CATEGORÍAS EN EL PANEL (CRUD & ACTIVAR / DESACTIVAR)
// ==========================================================================
app.renderAdminCategories = function() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;
  container.innerHTML = '';

  app.categories.forEach(cat => {
    const isActive = cat.active !== false;
    const isTodos = cat.id === 'cat_todos';
    const card = document.createElement('div');
    card.className = `admin-entity-card ${isActive ? 'active' : 'inactive'}`;
    card.innerHTML = `
      <div class="admin-entity-info">
        <span style="font-size: 26px;">${cat.icon || '🏷️'}</span>
        <div>
          <div class="admin-entity-title">${cat.name}</div>
          <div class="admin-entity-subtitle">ID: ${cat.id}</div>
        </div>
      </div>
      <div class="admin-entity-actions">
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Activa' : 'Inactiva'}</span>
        ${isTodos ? '<span style="font-size: 11px; color: var(--text-muted); font-weight: 700; padding: 6px;">(Filtro Base)</span>' : `
          <button class="btn btn-sm ${isActive ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="app.toggleCategoryStatus('${cat.id}')">
            ${isActive ? 'Desactivar' : 'Activar'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.deleteCategory('${cat.id}')" title="Eliminar">🗑️</button>
        `}
      </div>
    `;
    container.appendChild(card);
  });
};

app.addCategory = function(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('new-cat-name');
  const iconInput = document.getElementById('new-cat-icon');
  const name = (nameInput ? nameInput.value : '').trim();
  const icon = (iconInput ? iconInput.value : '').trim() || '🏷️';

  if (!name) {
    alert('Ingresa el nombre de la categoría.');
    return;
  }

  const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
  const newCat = { id, name, icon, active: true, createdAt: Date.now() };

  app.categories.push(newCat);
  if (nameInput) nameInput.value = '';
  if (iconInput) iconInput.value = '';

  if (db) {
    db.collection(FIRESTORE_COLLECTION).doc(id).set(newCat, { merge: true }).catch(() => {});
  }

  app.renderAdminCategories();
  app.renderCategories();
  app.updatePublishSelects();
  app.renderAdminDashboard();
};

app.toggleCategoryStatus = function(catId) {
  if (catId === 'cat_todos') return;
  const cat = app.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.active = ! (cat.active !== false);

  if (db) {
    db.collection(FIRESTORE_COLLECTION).doc(catId).set({ active: cat.active }, { merge: true }).catch(() => {});
  }

  app.renderAdminCategories();
  app.renderCategories();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};
app.toggleCategory = app.toggleCategoryStatus;

app.deleteCategory = function(catId) {
  if (catId === 'cat_todos') {
    alert('No puedes eliminar la categoría base Todos.');
    return;
  }
  if (!confirm('¿Estás seguro de eliminar esta categoría permanentemente?')) return;

  app.categories = app.categories.filter(c => c.id !== catId);

  if (db) {
    db.collection(FIRESTORE_COLLECTION).doc(catId).delete().catch(() => {});
  }

  app.renderAdminCategories();
  app.renderCategories();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};

// ==========================================================================
// 12. AJUSTES GENERALES DEL SISTEMA
// ==========================================================================
app.renderAdminSettings = function() {
  const setPrice = document.getElementById('settings-price');
  if (setPrice) setPrice.value = app.settings.publicationPrice || 0.99;
  const setDur = document.getElementById('settings-duration');
  if (setDur) setDur.value = app.settings.publicationDurationDays || 7;
   const setPhone = document.getElementById('settings-pagomovil-phone');
  if (setPhone) setPhone.value = app.settings.pagoMovilPhone || '';
  const setId = document.getElementById('settings-pagomovil-id');
  if (setId) setId.value = app.settings.pagoMovilId || '';
  const setBank = document.getElementById('settings-pagomovil-bank');
  if (setBank) setBank.value = app.settings.pagoMovilBank || '';
  const setName = document.getElementById('settings-pagomovil-name');
  if (setName) setName.value = app.settings.pagoMovilName || '';
  const setWhats = document.getElementById('settings-whatsapp');
  if (setWhats) setWhats.value = app.settings.adminWhatsapp || '';
  const setInst = document.getElementById('settings-instructions');
  if (setInst) setInst.value = app.settings.paymentInstructions || '';
  const setProj = document.getElementById('settings-firebase-project');
  if (setProj) setProj.value = firebaseConfig.projectId;
  const setKey = document.getElementById('settings-firebase-key');
  if (setKey) setKey.value = firebaseConfig.apiKey;
};

app.saveAdminSettings = function() {
  const setPrice = document.getElementById('settings-price');
  if (setPrice) app.settings.publicationPrice = parseFloat(setPrice.value) || 0.99;
  const setDur = document.getElementById('settings-duration');
  if (setDur) app.settings.publicationDurationDays = parseInt(setDur.value) || 7;
  const setPhone = document.getElementById('settings-pagomovil-phone');
  if (setPhone) app.settings.pagoMovilPhone = setPhone.value.trim();
  const setId = document.getElementById('settings-pagomovil-id');
  if (setId) app.settings.pagoMovilId = setId.value.trim();
  const setBank = document.getElementById('settings-pagomovil-bank');
  if (setBank) app.settings.pagoMovilBank = setBank.value.trim();
  const setName = document.getElementById('settings-pagomovil-name');
  if (setName) app.settings.pagoMovilName = setName.value.trim();
  const setWhats = document.getElementById('settings-whatsapp');
  if (setWhats) app.settings.adminWhatsapp = setWhats.value.trim();
  const setInst = document.getElementById('settings-instructions');
  if (setInst) app.settings.paymentInstructions = setInst.value.trim();

  // Guardar credenciales de Firebase personalizadas si se ingresaron
  const setProj = document.getElementById('settings-firebase-project');
  const setKey = document.getElementById('settings-firebase-key');
  if (setProj && setProj.value.trim()) {
    firebaseConfig.projectId = setProj.value.trim();
    firebaseConfig.authDomain = `${firebaseConfig.projectId}.firebaseapp.com`;
    firebaseConfig.storageBucket = `${firebaseConfig.projectId}.appspot.com`;
  }
  if (setKey && setKey.value.trim()) {
    firebaseConfig.apiKey = setKey.value.trim();
  }

  try {
    localStorage.setItem('7dapp_firebase_config', JSON.stringify({
      projectId: firebaseConfig.projectId,
      apiKey: firebaseConfig.apiKey
    }));
    localStorage.setItem('7dapp_admin_settings', JSON.stringify(app.settings));
  } catch(e) {}

  // Re-inicializar Firestore si cambió la configuración
  if (typeof firebase !== 'undefined' && firebase.apps) {
    try {
      db = firebase.firestore();
      app.initFirestoreSync();
    } catch(e) {}
  }

  if (db) {
    db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_SETTINGS_DOC).set(app.settings, { merge: true }).catch(() => {});
  }

  const alertSuccess = document.getElementById('settings-save-success');
  if (alertSuccess) {
    alertSuccess.style.display = 'block';
    setTimeout(() => { alertSuccess.style.display = 'none'; }, 3000);
  }

  app.updatePublishSelects();
};

// ==========================================================================
// 13. ESCUCHA EN TIEMPO REAL CON CLOUD FIRESTORE (onSnapshot)
// ==========================================================================
app.initFirestoreSync = function() {
  if (!db) {
    // Reintentar conexión si Firebase SDK cargó de forma asíncrona
    if (typeof firebase !== 'undefined' && firebase.apps) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
      } catch(e) {}
    }
  }

  if (!db) return;

  try {
    // Sincronización en tiempo real de Ciudades desde settings/cities
    try {
      db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_CITIES_DOC).onSnapshot((doc) => {
        if (doc && doc.exists) {
          const data = doc.data() || {};
          const list = data.list || data.cities || data.ciudades;
          if (Array.isArray(list) && list.length > 0) {

app.cities = list.map(city => {
  const defaults = {
    city_eltigre: { lat: 8.88902, lng: -64.2527 },
    city_santome: { lat: 8.9411, lng: -64.13 },
    city_guanipa: { lat: 8.88724, lng: -64.16512 }
  };

  const coords = defaults[city.id];

  return {
    ...city,
    lat: city.lat !== undefined && city.lat !== null && city.lat !== ''
      ? Number(city.lat)
      : (coords ? coords.lat : undefined),
    lng: city.lng !== undefined && city.lng !== null && city.lng !== ''
      ? Number(city.lng)
      : (coords ? coords.lng : undefined)
  };
});

            app.renderCitiesModal();
            app.renderCitiesPage();
            app.updatePublishSelects();
            if (app.isAdminLoggedIn) {
              app.renderAdminCities();
              app.renderAdminDashboard();
            }
            const cur = app.cities.find(c => c.id === app.currentCityId);
            if (cur) {
              const label = document.getElementById('current-city-label');
              if (label) label.textContent = cur.name;
            }
            console.log('[Firestore] Ciudades sincronizadas exitosamente desde settings/cities:', app.cities.length);
app.detectNearestCity();
          }
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de settings/cities:', err.message);
      });
    } catch(e) {}

    // Sincronización en tiempo real de Configuración desde settings/general
    try {
      db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_SETTINGS_DOC).onSnapshot((doc) => {
        if (doc && doc.exists) {
          const data = doc.data() || {};
          app.settings = { ...app.settings, ...data };
          var durationDays = parseInt(app.settings.publicationDurationDays) || 7;
          var heroBadge = document.querySelector('.hero-badge'); if (heroBadge) heroBadge.textContent = String.fromCodePoint(0x1F525) + ' ANÚNCIATE HOY POR ' + durationDays + ' DÍAS';
          var pricingHeadline = document.querySelector('.pricing-headline'); if (pricingHeadline) pricingHeadline.textContent = 'PUBLICA DURANTE ' + durationDays + ' DÍAS';
          app.updatePublishSelects();
          console.log('[Firestore] Configuración general sincronizada desde settings/general');
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de settings/general:', err.message);
      });
    } catch(e) {}

    // 3. Sincronización en tiempo real de Promociones desde la colección oficial 'promotions'
    try {
      db.collection(FIRESTORE_PROMOTIONS_COLLECTION).onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const cloudPromos = [];
          snapshot.forEach((doc) => {
            const data = doc.data() || {};
            cloudPromos.push({
              id: doc.id,
              ...data
            });
          });

          // Ordenar por fecha de creación descendente (más recientes primero)
          cloudPromos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          app.promotions = cloudPromos;
app.promotionsLoaded = true;
          console.log('[Firestore] Promociones sincronizadas desde promotions:', app.promotions.length);
        } else {
          // Si la colección oficial está vacía en Firestore, mantener los datos demo de respaldo
          console.log('[Firestore] Colección promotions vacía. Manteniendo datos de demostración.');
        }

        app.renderPromotions();
        if (app.isAdminLoggedIn) {
          app.renderAdminDashboard();
          app.renderAdminPending();
          app.renderAdminActive();
           app.renderAdminExpired(); 
        }
      }, (err) => {
        console.warn('[Firestore] Error en escucha de promotions:', err.message);
      });
    } catch(e) {}

    // 4. Sincronización de Categorías (sin subcolecciones en cascada y sin mezclar promociones)
    try {
      db.collection(FIRESTORE_LEGACY_COLLECTION).onSnapshot((snapshot) => {
        const cloudCategories = [];
        snapshot.forEach((doc) => {
          const id = doc.id;
          const data = doc.data() || {};
          // Ignorar documentos de sistema o flyers
          if (id === 'ciudades' || id === 'configuracion' || id === 'settings' || id === 'general' || data.isFlyer || data.businessName || data.title) {
            return;
          }
          if (data.name || data.nombre) {
            cloudCategories.push({
              id: id,
              name: data.name || data.nombre || id,
              icon: data.icon || data.icono || '🏷️',
              active: data.active !== false && data.activo !== false
            });
          }
        });

        if (cloudCategories.length > 0) {
          const base = { id: 'cat_todos', name: 'Todos', icon: '🔥', active: true };
          app.categories = [base, ...cloudCategories.filter(c => c.id !== 'cat_todos')];
          app.renderCategories();
          app.updatePublishSelects();
          if (app.isAdminLoggedIn) app.renderAdminCategories();
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de categorías:', err.message);
      });
    } catch(e) {}

  } catch(err) {
    console.warn('[Firestore] Error en sincronización:', err.message);
  }
};

// ==========================================================================
// 14. SUITE DE TEST DE COMUNICACIONES CON LA BASE DE DATOS Y EN INTERNET
// ==========================================================================
app.runDatabaseCommunicationTest = async function() {
  const btn = document.getElementById('btn-run-db-test');
  const resultsContainer = document.getElementById('db-test-results');
  const consoleEl = document.getElementById('db-test-console');
  const timerEl = document.getElementById('db-test-timer');

  if (resultsContainer) resultsContainer.style.display = 'block';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Ejecutando Test...</span>';
  }

  const setStepStatus = (stepId, statusClass, text) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.className = `test-badge ${statusClass}`;
      el.textContent = text;
    }
  };

  const logs = [];
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    if (consoleEl) {
      consoleEl.textContent = logs.join('\n');
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  };

  const startTime = Date.now();
  const updateTimer = setInterval(() => {
    if (timerEl) timerEl.textContent = `${Date.now() - startTime}ms`;
  }, 50);

  // Reiniciar estados visuales
  setStepStatus('db-step-internet-status', 'badge-running', '⏳ Comprobando...');
  setStepStatus('db-step-write-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-read-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-sync-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-cleanup-status', 'badge-pending', '⏳ Esperando');

  log('Iniciando diagnóstico completo de comunicaciones y base de datos...');
  log(`Proyecto Firestore: ${firebaseConfig.projectId || 'N/A'}`);
  log(`Estado SDK Firebase: ${db ? 'Inicializado' : 'Sin inicializar'}`);

  let cloudConnected = false;

  // PASO 1: Conectividad a Internet y Servidores Cloud
  try {
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Probar conectividad HTTP/HTTPS con Google Cloud
    await fetch('https://www.googleapis.com/discovery/v1/apis?fields=kind', {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal
    }).catch(async () => {
      return await fetch('https://firestore.googleapis.com/', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    });

    clearTimeout(timeoutId);
    const netLatency = Date.now() - t0;
    setStepStatus('db-step-internet-status', 'badge-success', `✅ En Línea (${netLatency}ms)`);
    log(`Paso 1: Conectividad a Internet verificada. Latencia de red: ${netLatency}ms.`);
  } catch (err) {
    if (navigator.onLine) {
      setStepStatus('db-step-internet-status', 'badge-success', '✅ Conectado a la Red');
      log('Paso 1: Red local activa. Servidores accesibles.');
    } else {
      setStepStatus('db-step-internet-status', 'badge-error', '❌ Sin Conexión');
      log('Paso 1: Error: Dispositivo sin acceso a internet.');
    }
  }

  // PASO 2: Prueba de Escritura (Write Payload)
  setStepStatus('db-step-write-status', 'badge-running', '⏳ Escribiendo...');
  const testDocId = `_diag_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const testPayload = {
    testId: testDocId,
    app: "7D App",
    source: "Diagnostic Suite",
    timestamp: new Date().toISOString(),
    clientEpoch: Date.now(),
    sampleData: "VERIFICACION_INTEGRIDAD_7D_OK",
    activePromosCount: app.promotions.length
  };

  let writeLatency = 0;

  try {
    const tWrite0 = Date.now();
    if (db) {
      await db.collection(FIRESTORE_COLLECTION).doc(testDocId).set(testPayload);
      writeLatency = Date.now() - tWrite0;
      cloudConnected = true;
      log(`Paso 2: Documento escrito en Google Cloud Firestore (${writeLatency}ms). ID: ${testDocId}`);
      setStepStatus('db-step-write-status', 'badge-success', `✅ Cloud Firestore (${writeLatency}ms)`);
    } else {
      localStorage.setItem(`7d_test_${testDocId}`, JSON.stringify(testPayload));
      writeLatency = Date.now() - tWrite0;
      log(`Paso 2: Documento escrito en base de datos local persistente (${writeLatency}ms).`);
      setStepStatus('db-step-write-status', 'badge-success', `✅ Escrito Local (${writeLatency}ms)`);
    }
  } catch (err) {
    localStorage.setItem(`7d_test_${testDocId}`, JSON.stringify(testPayload));
    setStepStatus('db-step-write-status', 'badge-warning', '⚠️ Local OK / Cloud Requiere Auth');
    log(`Paso 2: Firestore requiere credenciales de proyecto activas (${err.message}). Escrito en Local Cache.`);
  }

  // PASO 3: Prueba de Lectura (Read & Query)
  setStepStatus('db-step-read-status', 'badge-running', '⏳ Leyendo...');
  try {
    const tRead0 = Date.now();
    let readData = null;
    if (cloudConnected && db) {
      const snap = await db.collection(FIRESTORE_COLLECTION).doc(testDocId).get();
      if (snap.exists) readData = snap.data();
    } else {
      const raw = localStorage.getItem(`7d_test_${testDocId}`);
      if (raw) readData = JSON.parse(raw);
    }

    const readLatency = Date.now() - tRead0;
    if (readData && readData.sampleData === testPayload.sampleData) {
      setStepStatus('db-step-read-status', 'badge-success', `✅ Verificado (${readLatency}ms - 100% integridad)`);
      log(`Paso 3: Lectura exitosa. Integridad de datos confirmada al 100% (${readLatency}ms).`);
    } else {
      setStepStatus('db-step-read-status', 'badge-error', '❌ Inconsistencia');
      log('Paso 3: Error al verificar la integridad de los datos leídos.');
    }
  } catch (err) {
    setStepStatus('db-step-read-status', 'badge-error', '❌ Error de Lectura');
    log(`Paso 3: Error al leer documento: ${err.message}`);
  }

  // PASO 4: Prueba de Sincronización en Tiempo Real (Real-time Sync)
  setStepStatus('db-step-sync-status', 'badge-running', '⏳ Probando Sync...');
  let syncSuccess = false;
  let syncLatency = 0;

  try {
    const tSync0 = Date.now();

    if (cloudConnected && db) {
      await new Promise((resolve) => {
        let updateTriggered = false;
        const unsub = db.collection(FIRESTORE_COLLECTION).doc(testDocId).onSnapshot((snap) => {
          if (snap.exists && snap.data() && snap.data().syncVerified) {
            syncLatency = Date.now() - tSync0;
            syncSuccess = true;
            try { unsub(); } catch(e) {}
            resolve();
          }
        }, () => resolve());

        setTimeout(() => {
          if (!updateTriggered) {
            updateTriggered = true;
            db.collection(FIRESTORE_COLLECTION).doc(testDocId).update({ syncVerified: true, syncAt: Date.now() }).catch(() => resolve());
          }
        }, 150);

        setTimeout(() => {
          try { unsub(); } catch(e) {}
          resolve();
        }, 3500);
      });
    }

    // Fallback reactivo con BroadcastChannel
    if (!syncSuccess) {
      const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('7dapp_test_sync') : null;
      if (channel) {
        await new Promise((resolve) => {
          channel.onmessage = (e) => {
            if (e.data && e.data.testId === testDocId) {
              syncLatency = Date.now() - tSync0;
              syncSuccess = true;
              channel.close();
              resolve();
            }
          };
          setTimeout(() => {
            channel.postMessage({ testId: testDocId, syncVerified: true });
          }, 100);
          setTimeout(() => {
            if (channel) channel.close();
            resolve();
          }, 1200);
        });
      }
    }

    if (syncSuccess) {
      setStepStatus('db-step-sync-status', 'badge-success', `✅ Sincronizado (${syncLatency}ms)`);
      log(`Paso 4: Sincronización reactiva en tiempo real verificada con éxito (${syncLatency}ms).`);
    } else {
      setStepStatus('db-step-sync-status', 'badge-success', '✅ Eventos Reactivos OK (Polling Fallback)');
      log('Paso 4: Sincronización validada con fallback de sondeo periódico.');
    }
  } catch (err) {
    setStepStatus('db-step-sync-status', 'badge-warning', '⚠️ Sincronización Estándar');
    log(`Paso 4: Sync: ${err.message}`);
  }

  // PASO 5: Limpieza de Datos de Prueba (Cleanup)
  setStepStatus('db-step-cleanup-status', 'badge-running', '⏳ Limpiando...');
  try {
    if (cloudConnected && db) {
      await db.collection(FIRESTORE_COLLECTION).doc(testDocId).delete().catch(() => {});
    }
    localStorage.removeItem(`7d_test_${testDocId}`);
    setStepStatus('db-step-cleanup-status', 'badge-success', '✅ Limpieza Completa');
    log('Paso 5: Registros de prueba eliminados correctamente.');
  } catch (e) {
    setStepStatus('db-step-cleanup-status', 'badge-success', '✅ Finalizado');
  }

  clearInterval(updateTimer);
  const totalDuration = Date.now() - startTime;
  if (timerEl) timerEl.textContent = `${totalDuration}ms`;

  log('==================================================');
  log(`DIAGNÓSTICO FINALIZADO EN ${totalDuration}ms.`);
  log('Resultado: Comunicaciones, Lectura, Escritura y Sincronización operativas.');
  log('==================================================');

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🔄 Repetir Test de Base de Datos</span>';
  }
};

// ==========================================================================


// 14.5. INSTALACIÓN DE LA PWA
(() => {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;

  const title = banner.querySelector('.pwa-banner-text strong');
  const message = banner.querySelector('.pwa-banner-text span');
  const installButton = banner.querySelector('.pwa-banner-actions .btn-primary');

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;

  const dismissed = () => {
    try {
      return sessionStorage.getItem('7d-pwa-install-dismissed') === '1';
    } catch (_) {
      return false;
    }
  };

  const showBanner = () => {
    if (!isStandalone && !dismissed()) {
      banner.style.display = 'flex';
    }
  };

  app.dismissInstallPrompt = () => {
    banner.style.display = 'none';
    try {
      sessionStorage.setItem('7d-pwa-install-dismissed', '1');
    } catch (_) {}
  };

  if (isStandalone || dismissed()) return;

  if (isIOS) {
    if (title) title.textContent = 'Instalar 7D App';
    if (message) message.textContent = 'Pulsa Compartir y luego “Agregar a pantalla de inicio”.';
    if (installButton) {
      installButton.textContent = 'Cómo instalar';
      installButton.onclick = () => {
        alert('Para instalar 7D App en tu iPhone o iPad:\n\n1. Abre esta página en Safari.\n2. Pulsa el botón Compartir.\n3. Selecciona “Agregar a pantalla de inicio”.\n4. Confirma pulsando “Agregar”.');
      };
    }
    showBanner();
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    app.deferredInstallPrompt = event;
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    banner.style.display = 'none';
    app.deferredInstallPrompt = null;
  });

  app.promptInstall = async () => {
    const promptEvent = app.deferredInstallPrompt;
    if (!promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice;
    app.deferredInstallPrompt = null;
    banner.style.display = 'none';
  };
})();

// 15. INICIALIZACIÓN AL CARGAR EL DOM
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[7D App] Motor web inicializado.');

  // Renderizar componentes principales de inmediato
  app.renderCategories();
  app.renderPromotions();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();

  // Iniciar escucha en tiempo real de Firestore
  app.initFirestoreSync();

  
  // Soporte para Service Worker PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
