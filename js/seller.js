import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* =========================================================
   MAUMARKET SELLER.JS
   - Maximum 3 product images
   - Unlimited product options
   - Price, stock, SKU and image per option
   - Edit existing products and options
   - Backward-compatible with older single-image products
   ========================================================= */

const COMMISSION_RATE = 0.10;
const MAX_PRODUCT_IMAGES = 3;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

/* =========================================================
   DOM REFERENCES
   ========================================================= */

const shopName = document.getElementById("shopName");
const shopDescription = document.getElementById("shopDescription");
const shopPhone = document.getElementById("shopPhone");
const shopLocation = document.getElementById("shopLocation");
const shopPickupAddress = document.getElementById("shopPickupAddress");
const shopPickupInstructions = document.getElementById("shopPickupInstructions");
const shopPickupMap = document.getElementById("shopPickupMap");
const shopPickupLatitude = document.getElementById("shopPickupLatitude");
const shopPickupLongitude = document.getElementById("shopPickupLongitude");
const useCurrentPickupLocationBtn = document.getElementById("useCurrentPickupLocationBtn");
const findPickupAddressBtn = document.getElementById("findPickupAddressBtn");
const clearPickupPinBtn = document.getElementById("clearPickupPinBtn");
const shopLogo = document.getElementById("shopLogo");
const shopBanner = document.getElementById("shopBanner");
const saveShopBtn = document.getElementById("saveShopBtn");
const shopMessage = document.getElementById("shopMessage");
const shopLogoPreview = document.getElementById("shopLogoPreview");
const shopBannerPreview = document.getElementById("shopBannerPreview");

const slotInfo = document.getElementById("slotInfo");
const requestSlotsBtn = document.getElementById("requestSlotsBtn");
const slotMessage = document.getElementById("slotMessage");

const formTitle = document.getElementById("formTitle");
const itemType = document.getElementById("itemType");
const itemTitle = document.getElementById("itemTitle");
const itemDescription = document.getElementById("itemDescription");
const itemPrice = document.getElementById("itemPrice");
const itemStock = document.getElementById("itemStock");
const itemCategory = document.getElementById("itemCategory");
const serviceArea = document.getElementById("serviceArea");

const itemImages = document.getElementById("itemImages");
const legacyItemImage = document.getElementById("itemImage");
const itemImagesPreview = document.getElementById("itemImagesPreview");
const existingItemImages = document.getElementById("existingItemImages");
const legacyItemImagePreview = document.getElementById("itemImagePreview");

const saveItemBtn = document.getElementById("saveItemBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const itemMessage = document.getElementById("itemMessage");
const myItems = document.getElementById("myItems");

const sellerPricePreview = document.getElementById("sellerPricePreview");
const commissionPreview = document.getElementById("commissionPreview");
const buyerPricePreview = document.getElementById("buyerPricePreview");

const basePriceGroup = document.getElementById("basePriceGroup");
const baseStockGroup = document.getElementById("baseStockGroup");

const enableItemOptions = document.getElementById("enableItemOptions");
const itemOptionsSection = document.getElementById("itemOptionsSection");
const itemOptionType = document.getElementById("itemOptionType");
const itemOptionsList = document.getElementById("itemOptionsList");
const itemOptionsCount = document.getElementById("itemOptionsCount");
const addItemOptionBtn = document.getElementById("addItemOptionBtn");
const itemOptionTemplate = document.getElementById("itemOptionTemplate");

/* =========================================================
   APPLICATION STATE
   ========================================================= */

let currentUser = null;
let currentUserData = null;
let currentShop = null;
let currentProductCount = 0;
let editingItemId = null;

let sellerCategories = [];

let existingImageUrls = [];
let selectedImageFiles = [];
let removedExistingImageUrls = new Set();

let optionRows = [];

let pickupMap = null;
let pickupMarker = null;
let pickupMapInitialized = false;

const DEFAULT_PICKUP_COORDINATES = {
  latitude: -20.3484,
  longitude: 57.5522
};

/* =========================================================
   INITIALIZATION
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (!userSnap.exists()) {
      window.location.href = "dashboard.html";
      return;
    }

    currentUserData = userSnap.data();

    if (
      currentUserData.role !== "seller" ||
      currentUserData.approved !== true ||
      currentUserData.blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    wireFormEvents();
    updatePricePreview();

    await Promise.all([
      loadShop(),
      loadSellerCategories()
    ]);

    await loadMyItems();
  } catch (error) {
    console.error("Seller dashboard initialization failed:", error);
    setMessage(
      itemMessage,
      getFriendlySellerError(
        error,
        "The seller dashboard could not be loaded."
      ),
      "error"
    );
  }
});

function wireFormEvents() {
  initializePickupLocationEvents();
  initializeSellerDashboardTabs();
  itemPrice?.addEventListener("input", updatePricePreview);

  shopLogo?.addEventListener("change", () => {
    previewSelectedImage(
      shopLogo.files?.[0],
      shopLogoPreview,
      "logo",
      shopMessage
    );
  });

  shopBanner?.addEventListener("change", () => {
    previewSelectedImage(
      shopBanner.files?.[0],
      shopBannerPreview,
      "banner",
      shopMessage
    );
  });

  itemImages?.addEventListener("change", handleProductImagesSelected);

  legacyItemImage?.addEventListener("change", () => {
    const file = legacyItemImage.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      setMessage(itemMessage, validation, "error");
      legacyItemImage.value = "";
      return;
    }

    selectedImageFiles = [file];
    renderSelectedProductImages();
    updateOptionImageChoices();
  });

  enableItemOptions?.addEventListener("change", () => {
    setOptionsEnabled(enableItemOptions.checked);

    if (enableItemOptions.checked && optionRows.length === 0) {
      addOptionRow();
    }
  });

  addItemOptionBtn?.addEventListener("click", () => {
    addOptionRow();
  });

  itemOptionType?.addEventListener("input", refreshOptionRowTitles);

  cancelEditBtn?.addEventListener("click", resetItemForm);
}


/* =========================================================
   PICKUP LOCATION MAP
   ========================================================= */

function initializePickupLocationEvents() {
  const businessTab = document.querySelector(
    '[data-seller-page="business"]'
  );

  businessTab?.addEventListener("click", () => {
    window.setTimeout(() => {
      initializePickupMap();
      pickupMap?.invalidateSize();
    }, 80);
  });

  shopPickupAddress?.addEventListener("focus", () => {
    initializePickupMap();
  });

  useCurrentPickupLocationBtn?.addEventListener(
    "click",
    useCurrentPickupLocation
  );

  findPickupAddressBtn?.addEventListener(
    "click",
    locateTypedPickupAddress
  );

  clearPickupPinBtn?.addEventListener(
    "click",
    clearPickupLocation
  );

  if (
    window.location.hash === "#business" ||
    !document.getElementById("sellerBusinessView")?.hidden
  ) {
    window.setTimeout(initializePickupMap, 150);
  }
}

function initializePickupMap() {
  if (pickupMapInitialized || !shopPickupMap) return;

  if (typeof window.L === "undefined") {
    setMessage(
      shopMessage,
      "The pickup map could not load. Please refresh the page.",
      "error"
    );
    return;
  }

  const savedLatitude = Number(shopPickupLatitude?.value);
  const savedLongitude = Number(shopPickupLongitude?.value);

  const hasSavedCoordinates =
    Number.isFinite(savedLatitude) &&
    Number.isFinite(savedLongitude) &&
    savedLatitude !== 0 &&
    savedLongitude !== 0;

  const initialLatitude = hasSavedCoordinates
    ? savedLatitude
    : DEFAULT_PICKUP_COORDINATES.latitude;

  const initialLongitude = hasSavedCoordinates
    ? savedLongitude
    : DEFAULT_PICKUP_COORDINATES.longitude;

  pickupMap = window.L.map(shopPickupMap, {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView(
    [initialLatitude, initialLongitude],
    hasSavedCoordinates ? 17 : 10
  );

  window.L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  ).addTo(pickupMap);

  pickupMap.on("click", async (event) => {
    const { lat, lng } = event.latlng;

    setPickupLocation(lat, lng, {
      center: false,
      updateAddress: true
    });
  });

  pickupMapInitialized = true;

  if (hasSavedCoordinates) {
    setPickupLocation(savedLatitude, savedLongitude, {
      center: true,
      updateAddress: false
    });
  }

  window.setTimeout(() => {
    pickupMap?.invalidateSize();
  }, 120);
}

function setPickupLocation(
  latitude,
  longitude,
  options = {}
) {
  const {
    center = true,
    updateAddress = false
  } = options;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  initializePickupMap();

  if (!pickupMap) return;

  if (!pickupMarker) {
    pickupMarker = window.L.marker(
      [lat, lng],
      {
        draggable: true
      }
    ).addTo(pickupMap);

    pickupMarker.on("dragend", async () => {
      const markerPosition = pickupMarker.getLatLng();

      updatePickupCoordinateFields(
        markerPosition.lat,
        markerPosition.lng
      );

      await reverseGeocodePickupLocation(
        markerPosition.lat,
        markerPosition.lng
      );
    });
  } else {
    pickupMarker.setLatLng([lat, lng]);
  }

  updatePickupCoordinateFields(lat, lng);

  if (center) {
    pickupMap.setView([lat, lng], 17);
  }

  if (updateAddress) {
    reverseGeocodePickupLocation(lat, lng);
  }
}

function updatePickupCoordinateFields(latitude, longitude) {
  if (shopPickupLatitude) {
    shopPickupLatitude.value =
      Number(latitude).toFixed(6);
  }

  if (shopPickupLongitude) {
    shopPickupLongitude.value =
      Number(longitude).toFixed(6);
  }
}

function clearPickupLocation() {
  if (pickupMarker && pickupMap) {
    pickupMap.removeLayer(pickupMarker);
  }

  pickupMarker = null;

  if (shopPickupLatitude) {
    shopPickupLatitude.value = "";
  }

  if (shopPickupLongitude) {
    shopPickupLongitude.value = "";
  }

  setMessage(
    shopMessage,
    "Pickup pin cleared. Select a new location before saving.",
    "info"
  );
}

function useCurrentPickupLocation() {
  if (!navigator.geolocation) {
    setMessage(
      shopMessage,
      "Location services are not supported by this browser.",
      "error"
    );
    return;
  }

  useCurrentPickupLocationBtn.disabled = true;

  setMessage(
    shopMessage,
    "Finding your current location...",
    "info"
  );

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      setPickupLocation(latitude, longitude, {
        center: true,
        updateAddress: true
      });

      setMessage(
        shopMessage,
        "Current pickup location selected. Confirm the address and move the pin if needed.",
        "success"
      );

      useCurrentPickupLocationBtn.disabled = false;
    },
    (error) => {
      console.warn("Could not get current location:", error);

      const message =
        error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access or select the pin manually."
          : "Your current location could not be detected. Select the pin manually.";

      setMessage(shopMessage, message, "error");
      useCurrentPickupLocationBtn.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    }
  );
}

async function locateTypedPickupAddress() {
  const address = shopPickupAddress?.value.trim() || "";

  if (!address) {
    setMessage(
      shopMessage,
      "Enter the pickup address before searching for it.",
      "error"
    );
    return;
  }

  findPickupAddressBtn.disabled = true;

  setMessage(
    shopMessage,
    "Searching for the pickup address...",
    "info"
  );

  try {
    const searchText = `${address}, Mauritius`;

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=mu&q=${encodeURIComponent(searchText)}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("Address search failed.");
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error(
        "The address could not be found. Add more details or select the pin manually."
      );
    }

    const result = results[0];

    setPickupLocation(
      Number(result.lat),
      Number(result.lon),
      {
        center: true,
        updateAddress: false
      }
    );

    setMessage(
      shopMessage,
      "Address found. Confirm that the pin is on the exact pickup point.",
      "success"
    );
  } catch (error) {
    console.error("Pickup address search failed:", error);

    setMessage(
      shopMessage,
      error.message ||
        "The address could not be found. Select the pin manually.",
      "error"
    );
  } finally {
    findPickupAddressBtn.disabled = false;
  }
}

async function reverseGeocodePickupLocation(
  latitude,
  longitude
) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) return;

    const result = await response.json();
    const displayName = String(result.display_name || "").trim();

    if (displayName && shopPickupAddress) {
      shopPickupAddress.value = displayName;
    }
  } catch (error) {
    console.warn("Could not retrieve pickup address:", error);
  }
}

/* =========================================================
   CATEGORY MANAGEMENT
   ========================================================= */

async function loadSellerCategories() {
  if (!itemCategory) return;

  itemCategory.disabled = true;
  itemCategory.innerHTML = `
    <option value="">Loading categories...</option>
  `;

  try {
    const snapshot = await getDocs(collection(db, "categories"));
    sellerCategories = [];

    snapshot.forEach((docSnap) => {
      const category = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if (category.active !== false && category.name) {
        sellerCategories.push(category);
      }
    });

    sellerCategories.sort((a, b) => {
      const orderDifference =
        Number(a.sortOrder || 0) - Number(b.sortOrder || 0);

      if (orderDifference !== 0) return orderDifference;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    renderSellerCategoryOptions();
  } catch (error) {
    console.warn("Could not load seller categories:", error);
    sellerCategories = [{ name: "Other", sortOrder: 999 }];
    renderSellerCategoryOptions();
  } finally {
    itemCategory.disabled = false;
  }
}

function renderSellerCategoryOptions(selectedValue = "") {
  if (!itemCategory) return;

  itemCategory.innerHTML = `
    <option value="">Select a category</option>
  `;

  sellerCategories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    itemCategory.appendChild(option);
  });

  if (selectedValue) {
    ensureSellerCategoryOption(selectedValue);
    itemCategory.value = selectedValue;
  }
}

function ensureSellerCategoryOption(categoryName) {
  if (!itemCategory || !categoryName) return;

  const exists = Array.from(itemCategory.options).some(
    (option) => option.value === categoryName
  );

  if (exists) return;

  const option = document.createElement("option");
  option.value = categoryName;
  option.textContent = `${categoryName} (Existing category)`;
  itemCategory.appendChild(option);
}

/* =========================================================
   GENERIC IMAGE HELPERS
   ========================================================= */

function validateImageFile(file) {
  if (!file) return "No image was selected.";

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Only PNG, JPG and WebP images are allowed.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Each image must be smaller than 8 MB.";
  }

  return "";
}

function previewSelectedImage(
  file,
  previewElement,
  type,
  messageElement
) {
  if (!file || !previewElement) return;

  const validation = validateImageFile(file);

  if (validation) {
    previewElement.style.display = "none";
    setMessage(messageElement, validation, "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    renderImagePreview(
      previewElement,
      reader.result,
      "Selected image preview",
      type
    );
  };

  reader.readAsDataURL(file);
}

function renderImagePreview(
  previewElement,
  imageUrl,
  altText,
  type = "item"
) {
  if (!previewElement || !imageUrl) return;

  previewElement.innerHTML = `
    <img
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(altText)}"
      class="seller-preview-image seller-preview-${escapeHtml(type)}">
  `;

  previewElement.style.display = "block";
}

async function uploadImage(file, folder) {
  const safeOriginalName = String(file.name || "image")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  const uniquePart =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const fileName = `${Date.now()}-${uniquePart}-${safeOriginalName}`;

  const imageReference = ref(
    storage,
    `${folder}/${currentUser.uid}/${fileName}`
  );

  await uploadBytes(imageReference, file);

  return await getDownloadURL(imageReference);
}

/* =========================================================
   MULTIPLE PRODUCT IMAGES
   ========================================================= */

function handleProductImagesSelected() {
  if (!itemImages) return;

  const files = Array.from(itemImages.files || []);

  const totalCount =
    getKeptExistingImageUrls().length + files.length;

  if (totalCount > MAX_PRODUCT_IMAGES) {
    setMessage(
      itemMessage,
      `You can use a maximum of ${MAX_PRODUCT_IMAGES} product images.`,
      "error"
    );

    itemImages.value = "";
    return;
  }

  for (const file of files) {
    const validation = validateImageFile(file);

    if (validation) {
      setMessage(itemMessage, validation, "error");
      itemImages.value = "";
      return;
    }
  }

  selectedImageFiles = files;
  setMessage(itemMessage, "", "");
  renderSelectedProductImages();
  updateOptionImageChoices();
}

function renderSelectedProductImages() {
  if (!itemImagesPreview) return;

  itemImagesPreview.innerHTML = "";

  selectedImageFiles.forEach((file, index) => {
    const card = document.createElement("article");
    card.className = "seller-product-image-preview-card";

    const image = document.createElement("img");
    image.alt = `New product image ${index + 1}`;

    const reader = new FileReader();
    reader.onload = () => {
      image.src = reader.result;
    };
    reader.readAsDataURL(file);

    const label = document.createElement("span");
    const firstNewImageIsMain =
      getKeptExistingImageUrls().length === 0 && index === 0;

    label.textContent = firstNewImageIsMain
      ? "Main image"
      : `New image ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "seller-remove-image-btn";
    removeButton.textContent = "Remove";

    removeButton.addEventListener("click", () => {
      selectedImageFiles.splice(index, 1);

      if (itemImages) itemImages.value = "";

      renderSelectedProductImages();
      updateOptionImageChoices();
    });

    card.append(image, label, removeButton);
    itemImagesPreview.appendChild(card);
  });
}

function renderExistingProductImages() {
  if (!existingItemImages) return;

  existingItemImages.innerHTML = "";

  existingImageUrls.forEach((url, originalIndex) => {
    if (removedExistingImageUrls.has(url)) return;

    const keptImages = getKeptExistingImageUrls();
    const card = document.createElement("article");
    card.className = "seller-product-image-preview-card";

    const image = document.createElement("img");
    image.src = url;
    image.alt = `Current product image ${originalIndex + 1}`;

    const label = document.createElement("span");
    label.textContent =
      keptImages[0] === url
        ? "Main image"
        : `Current image ${originalIndex + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "seller-remove-image-btn";
    removeButton.textContent = "Remove";

    removeButton.addEventListener("click", () => {
      removedExistingImageUrls.add(url);
      renderExistingProductImages();
      updateOptionImageChoices();
    });

    card.append(image, label, removeButton);
    existingItemImages.appendChild(card);
  });
}

function getKeptExistingImageUrls() {
  return existingImageUrls.filter(
    (url) => !removedExistingImageUrls.has(url)
  );
}

async function uploadProductImages() {
  const finalUrls = [...getKeptExistingImageUrls()];

  for (const file of selectedImageFiles) {
    if (finalUrls.length >= MAX_PRODUCT_IMAGES) break;

    finalUrls.push(
      await uploadImage(file, "products")
    );
  }

  return finalUrls.slice(0, MAX_PRODUCT_IMAGES);
}

function normalizeProductImages(item) {
  const candidates = [
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
    item.imageUrl || ""
  ];

  const uniqueUrls = [];

  candidates.forEach((url) => {
    if (
      typeof url === "string" &&
      url.trim() &&
      !uniqueUrls.includes(url)
    ) {
      uniqueUrls.push(url);
    }
  });

  return uniqueUrls.slice(0, MAX_PRODUCT_IMAGES);
}

/* =========================================================
   PRICING
   ========================================================= */

function calculatePrices(rawPrice) {
  const sellerPrice = roundMoney(Number(rawPrice || 0));
  const commissionAmount = roundMoney(
    sellerPrice * COMMISSION_RATE
  );
  const buyerPrice = roundMoney(
    sellerPrice + commissionAmount
  );

  return {
    sellerPrice,
    commissionRate: COMMISSION_RATE,
    commissionPercent: 10,
    commissionAmount,
    buyerPrice
  };
}

function updatePricePreview() {
  const prices = calculatePrices(itemPrice?.value || 0);

  if (sellerPricePreview) {
    sellerPricePreview.textContent = formatRs(prices.sellerPrice);
  }

  if (commissionPreview) {
    commissionPreview.textContent = formatRs(prices.commissionAmount);
  }

  if (buyerPricePreview) {
    buyerPricePreview.textContent = formatRs(prices.buyerPrice);
  }
}

/* =========================================================
   PRODUCT OPTIONS / VARIANTS
   ========================================================= */

function setOptionsEnabled(enabled) {
  if (itemOptionsSection) {
    itemOptionsSection.style.display = enabled ? "block" : "none";
  }

  basePriceGroup?.classList.toggle(
    "seller-base-field-muted",
    enabled
  );

  baseStockGroup?.classList.toggle(
    "seller-base-field-muted",
    enabled
  );

  refreshOptionCount();
}

function addOptionRow(optionData = {}) {
  if (!itemOptionTemplate || !itemOptionsList) return;

  const fragment = itemOptionTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".seller-option-row");

  if (!row) return;

  row.dataset.optionId =
    optionData.id || createUniqueId();

  const nameInput = row.querySelector(".item-option-name");
  const priceInput = row.querySelector(".item-option-price");
  const stockInput = row.querySelector(".item-option-stock");
  const skuInput = row.querySelector(".item-option-sku");
  const imageSelect = row.querySelector(".item-option-image-index");
  const removeButton = row.querySelector(".seller-remove-option-btn");

  if (nameInput) {
    nameInput.value = optionData.name || optionData.label || "";
  }

  if (priceInput) {
    const sellerPrice =
      optionData.sellerPrice ??
      getSellerPrice(optionData) ??
      "";

    priceInput.value =
      sellerPrice === "" ? "" : String(sellerPrice);
  }

  if (stockInput) {
    const stock = optionData.stock ?? "";
    stockInput.value = stock === "" ? "" : String(stock);
  }

  if (skuInput) {
    skuInput.value =
      optionData.sku ||
      optionData.productCode ||
      "";
  }

  if (imageSelect) {
    imageSelect.dataset.selectedValue =
      optionData.imageIndex !== undefined &&
      optionData.imageIndex !== null
        ? String(optionData.imageIndex)
        : "";
  }

  nameInput?.addEventListener("input", refreshOptionRowTitles);

  removeButton?.addEventListener("click", () => {
    row.remove();
    optionRows = optionRows.filter((entry) => entry !== row);

    refreshOptionCount();
    refreshOptionRowTitles();
  });

  itemOptionsList.appendChild(fragment);
  optionRows.push(row);

  updateOptionImageChoices();
  refreshOptionCount();
  refreshOptionRowTitles();
}

function refreshOptionCount() {
  if (itemOptionsCount) {
    itemOptionsCount.textContent = String(optionRows.length);
  }
}

function refreshOptionRowTitles() {
  const typeLabel =
    itemOptionType?.value.trim() || "Option";

  optionRows.forEach((row, index) => {
    const numberLabel = row.querySelector(".seller-option-number");
    const titleLabel = row.querySelector(".seller-option-title");
    const optionName =
      row.querySelector(".item-option-name")?.value.trim() || "";

    if (numberLabel) {
      numberLabel.textContent = `${typeLabel} ${index + 1}`;
    }

    if (titleLabel) {
      titleLabel.textContent = optionName || `New ${typeLabel}`;
    }
  });
}

function updateOptionImageChoices() {
  const totalImages =
    getKeptExistingImageUrls().length +
    selectedImageFiles.length;

  optionRows.forEach((row) => {
    const select = row.querySelector(".item-option-image-index");
    if (!select) return;

    const previousValue =
      select.value ||
      select.dataset.selectedValue ||
      "";

    select.innerHTML = `
      <option value="">Use main image</option>
    `;

    for (let index = 0; index < totalImages; index += 1) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Image ${index + 1}`;
      select.appendChild(option);
    }

    if (
      previousValue !== "" &&
      Number(previousValue) >= 0 &&
      Number(previousValue) < totalImages
    ) {
      select.value = previousValue;
    } else {
      select.value = "";
    }

    select.dataset.selectedValue = select.value;
  });
}

function collectOptionData(finalImageUrls) {
  if (!enableItemOptions?.checked) return [];

  const optionType = itemOptionType?.value.trim() || "";

  if (!optionType) {
    throw new Error(
      "Enter an option type, for example Colour, Size or Flavour."
    );
  }

  if (optionRows.length === 0) {
    throw new Error("Add at least one option.");
  }

  const usedNames = new Set();
  const usedSkus = new Set();

  return optionRows.map((row, index) => {
    const name =
      row.querySelector(".item-option-name")?.value.trim() || "";

    const sellerPrice = Number(
      row.querySelector(".item-option-price")?.value || 0
    );

    const stock = Math.floor(
      Number(
        row.querySelector(".item-option-stock")?.value || 0
      )
    );

    const sku =
      row.querySelector(".item-option-sku")?.value.trim() || "";

    const rawImageIndex =
      row.querySelector(".item-option-image-index")?.value ?? "";

    if (!name) {
      throw new Error(`Option ${index + 1} needs a name.`);
    }

    const normalizedName = name.toLowerCase();

    if (usedNames.has(normalizedName)) {
      throw new Error(`The option "${name}" is duplicated.`);
    }

    usedNames.add(normalizedName);

    if (!Number.isFinite(sellerPrice) || sellerPrice <= 0) {
      throw new Error(`${name} needs a valid seller price.`);
    }

    if (!Number.isFinite(stock) || stock < 0) {
      throw new Error(`${name} needs a valid stock quantity.`);
    }

    if (sku) {
      const normalizedSku = sku.toLowerCase();

      if (usedSkus.has(normalizedSku)) {
        throw new Error(`The product code "${sku}" is duplicated.`);
      }

      usedSkus.add(normalizedSku);
    }

    let imageIndex = null;

    if (rawImageIndex !== "") {
      const parsedIndex = Number(rawImageIndex);

      if (
        Number.isInteger(parsedIndex) &&
        parsedIndex >= 0 &&
        parsedIndex < finalImageUrls.length
      ) {
        imageIndex = parsedIndex;
      }
    }

    const prices = calculatePrices(sellerPrice);

    return {
      id: row.dataset.optionId || createUniqueId(),
      name,
      label: name,

      sellerPrice: prices.sellerPrice,
      commissionRate: prices.commissionRate,
      commissionPercent: prices.commissionPercent,
      commissionAmount: prices.commissionAmount,
      buyerPrice: prices.buyerPrice,
      price: prices.buyerPrice,

      stock,
      sku,
      productCode: sku,

      imageIndex,
      imageUrl:
        imageIndex !== null
          ? finalImageUrls[imageIndex] || ""
          : finalImageUrls[0] || "",

      active: true
    };
  });
}

function normalizeProductOptions(item) {
  const rawOptions =
    Array.isArray(item.options)
      ? item.options
      : Array.isArray(item.variants)
        ? item.variants
        : [];

  return rawOptions.map((option, index) => {
    const sellerPrice = getSellerPrice(option);
    const prices = calculatePrices(sellerPrice);

    return {
      id: option.id || `option-${index + 1}`,
      name:
        option.name ||
        option.label ||
        `Option ${index + 1}`,
      label:
        option.label ||
        option.name ||
        `Option ${index + 1}`,

      sellerPrice,
      commissionRate:
        Number(option.commissionRate ?? COMMISSION_RATE),
      commissionPercent:
        Number(option.commissionPercent ?? 10),
      commissionAmount:
        Number(option.commissionAmount ?? prices.commissionAmount),
      buyerPrice:
        Number(option.buyerPrice ?? option.price ?? prices.buyerPrice),
      price:
        Number(option.price ?? option.buyerPrice ?? prices.buyerPrice),

      stock: Math.max(0, Number(option.stock || 0)),
      sku: option.sku || option.productCode || "",
      productCode: option.productCode || option.sku || "",

      imageIndex:
        option.imageIndex !== undefined &&
        option.imageIndex !== null
          ? Number(option.imageIndex)
          : null,

      imageUrl: option.imageUrl || "",
      active: option.active !== false
    };
  });
}

function getOptionsSummary(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      minSellerPrice: 0,
      maxSellerPrice: 0,
      minBuyerPrice: 0,
      maxBuyerPrice: 0,
      totalStock: 0
    };
  }

  const sellerPrices = options.map(
    (option) => Number(option.sellerPrice || 0)
  );

  const buyerPrices = options.map(
    (option) => Number(option.buyerPrice || option.price || 0)
  );

  return {
    minSellerPrice: Math.min(...sellerPrices),
    maxSellerPrice: Math.max(...sellerPrices),
    minBuyerPrice: Math.min(...buyerPrices),
    maxBuyerPrice: Math.max(...buyerPrices),
    totalStock: options.reduce(
      (sum, option) => sum + Number(option.stock || 0),
      0
    )
  };
}

/* =========================================================
   SHOP PROFILE
   ========================================================= */

async function loadShop() {
  const shopSnap = await getDoc(
    doc(db, "shops", currentUser.uid)
  );

  if (!shopSnap.exists()) {
    currentShop = null;
    return;
  }

  currentShop = {
    id: shopSnap.id,
    ...shopSnap.data()
  };

  if (shopName) shopName.value = currentShop.shopName || "";
  if (shopDescription) {
    shopDescription.value = currentShop.description || "";
  }
  if (shopPhone) shopPhone.value = currentShop.phone || "";
  if (shopLocation) shopLocation.value = currentShop.location || "";

  if (shopPickupAddress) {
    shopPickupAddress.value =
      currentShop.pickupAddress ||
      currentShop.shopAddress ||
      currentShop.address ||
      "";
  }

  if (shopPickupInstructions) {
    shopPickupInstructions.value =
      currentShop.pickupInstructions ||
      currentShop.collectionInstructions ||
      "";
  }

  const savedPickupLatitude = Number(
    currentShop.pickupLatitude ??
    currentShop.pickupLocation?.latitude ??
    currentShop.pickupLocation?.lat
  );

  const savedPickupLongitude = Number(
    currentShop.pickupLongitude ??
    currentShop.pickupLocation?.longitude ??
    currentShop.pickupLocation?.lng
  );

  if (
    Number.isFinite(savedPickupLatitude) &&
    Number.isFinite(savedPickupLongitude)
  ) {
    if (shopPickupLatitude) {
      shopPickupLatitude.value =
        savedPickupLatitude.toFixed(6);
    }

    if (shopPickupLongitude) {
      shopPickupLongitude.value =
        savedPickupLongitude.toFixed(6);
    }

    if (pickupMapInitialized) {
      setPickupLocation(
        savedPickupLatitude,
        savedPickupLongitude,
        {
          center: true,
          updateAddress: false
        }
      );
    }
  }

  if (currentShop.logoUrl) {
    renderImagePreview(
      shopLogoPreview,
      currentShop.logoUrl,
      "Current business logo",
      "logo"
    );
  }

  if (currentShop.bannerUrl) {
    renderImagePreview(
      shopBannerPreview,
      currentShop.bannerUrl,
      "Current business banner",
      "banner"
    );
  }
}

saveShopBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  const businessName = shopName?.value.trim() || "";
  const businessPhone = shopPhone?.value.trim() || "";
  const businessLocation = shopLocation?.value.trim() || "";
  const pickupAddress = shopPickupAddress?.value.trim() || "";

  const pickupLatitude = Number(
    shopPickupLatitude?.value
  );

  const pickupLongitude = Number(
    shopPickupLongitude?.value
  );

  if (!businessName) {
    setMessage(shopMessage, "Business name is required.", "error");
    return;
  }

  if (!businessPhone) {
    setMessage(shopMessage, "Business phone is required.", "error");
    return;
  }

  if (!pickupAddress) {
    setMessage(
      shopMessage,
      "Exact pickup address is required for MauMarket delivery.",
      "error"
    );
    return;
  }

  if (
    !Number.isFinite(pickupLatitude) ||
    !Number.isFinite(pickupLongitude)
  ) {
    setMessage(
      shopMessage,
      "Select the exact pickup location on the map before saving.",
      "error"
    );

    document
      .querySelector('[data-seller-page="business"]')
      ?.click();

    window.setTimeout(() => {
      initializePickupMap();
      shopPickupMap?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 100);

    return;
  }

  saveShopBtn.disabled = true;

  setMessage(
    shopMessage,
    "Saving private business information...",
    "info"
  );

  try {
    let logoUrl = currentShop?.logoUrl || "";
    let bannerUrl = currentShop?.bannerUrl || "";

    if (shopLogo?.files?.[0]) {
      const validation = validateImageFile(shopLogo.files[0]);
      if (validation) throw new Error(validation);

      logoUrl = await uploadImage(shopLogo.files[0], "shops");
    }

    if (shopBanner?.files?.[0]) {
      const validation = validateImageFile(shopBanner.files[0]);
      if (validation) throw new Error(validation);

      bannerUrl = await uploadImage(shopBanner.files[0], "shops");
    }

    const shopData = {
      ownerId: currentUser.uid,
      sellerId: currentUser.uid,

      shopName: businessName,
      description: shopDescription?.value.trim() || "",
      phone: businessPhone,
      location: businessLocation,

      pickupAddress,
      shopAddress: pickupAddress,
      pickupInstructions:
        shopPickupInstructions?.value.trim() || "",

      pickupLatitude,
      pickupLongitude,
      pickupLocation: {
        latitude: pickupLatitude,
        longitude: pickupLongitude
      },

      logoUrl,
      bannerUrl,

      profileVisibility: "private",
      buyerVisible: false,
      active: true,
      approved: true,

      updatedAt: serverTimestamp()
    };

    if (!currentShop?.createdAt) {
      shopData.createdAt = serverTimestamp();
    }

    await setDoc(
      doc(db, "shops", currentUser.uid),
      shopData,
      { merge: true }
    );

    setMessage(
      shopMessage,
      "Private business and pickup information saved successfully.",
      "success"
    );

    await loadShop();
  } catch (error) {
    console.error("Could not save business information:", error);

    setMessage(
      shopMessage,
      error.message ||
        getFriendlySellerError(
          error,
          "The business information could not be saved."
        ),
      "error"
    );
  } finally {
    saveShopBtn.disabled = false;
  }
});

/* =========================================================
   SAVE PRODUCT / SERVICE
   ========================================================= */

saveItemBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  const title = itemTitle?.value.trim() || "";
  const selectedCategory = itemCategory?.value || "";
  const optionsEnabled = enableItemOptions?.checked === true;
  const enteredSellerPrice = Number(itemPrice?.value || 0);

  if (!title) {
    setMessage(itemMessage, "Product title is required.", "error");
    return;
  }

  if (!selectedCategory) {
    setMessage(itemMessage, "Please select a category.", "error");
    return;
  }

  if (!optionsEnabled && enteredSellerPrice <= 0) {
    setMessage(itemMessage, "Seller price is required.", "error");
    return;
  }

  const productLimit = Number(currentUserData?.productLimit || 25);

  if (!editingItemId && currentProductCount >= productLimit) {
    setMessage(
      itemMessage,
      "You reached your product slot limit. Request more slots.",
      "error"
    );
    return;
  }

  const totalSelectedImages =
    getKeptExistingImageUrls().length + selectedImageFiles.length;

  if (totalSelectedImages > MAX_PRODUCT_IMAGES) {
    setMessage(
      itemMessage,
      `A product can have a maximum of ${MAX_PRODUCT_IMAGES} images.`,
      "error"
    );
    return;
  }

  saveItemBtn.disabled = true;

  setMessage(
    itemMessage,
    editingItemId ? "Updating item..." : "Adding item...",
    "info"
  );

  try {
    const finalImageUrls = await uploadProductImages();
    const options = collectOptionData(finalImageUrls);
    const optionSummary = getOptionsSummary(options);

    const basePrices = optionsEnabled
      ? calculatePrices(optionSummary.minSellerPrice)
      : calculatePrices(enteredSellerPrice);

    const totalStock = optionsEnabled
      ? optionSummary.totalStock
      : Math.max(
          0,
          Math.floor(Number(itemStock?.value || 0))
        );

    const itemData = {
      sellerId: currentUser.uid,
      shopId: currentUser.uid,

      shopName:
        currentShop?.shopName ||
        shopName?.value.trim() ||
        "MauMarket Seller",

      publicMerchantLabel: "Verified MauMarket Merchant",

      type: itemType?.value || "product",
      title,
      description: itemDescription?.value.trim() || "",

      sellerPrice: basePrices.sellerPrice,
      commissionRate: basePrices.commissionRate,
      commissionPercent: basePrices.commissionPercent,
      commissionAmount: basePrices.commissionAmount,
      buyerPrice: basePrices.buyerPrice,
      price: basePrices.buyerPrice,

      stock: totalStock,
      category: selectedCategory,
      serviceArea: serviceArea?.value.trim() || "",

      imageUrl: finalImageUrls[0] || "",
      images: finalImageUrls,
      imageUrls: finalImageUrls,

      hasOptions: optionsEnabled,
      optionType: optionsEnabled
        ? itemOptionType?.value.trim() || ""
        : "",
      options,
      variants: options,
      variantCount: options.length,

      minSellerPrice: optionsEnabled
        ? optionSummary.minSellerPrice
        : basePrices.sellerPrice,
      maxSellerPrice: optionsEnabled
        ? optionSummary.maxSellerPrice
        : basePrices.sellerPrice,
      minBuyerPrice: optionsEnabled
        ? optionSummary.minBuyerPrice
        : basePrices.buyerPrice,
      maxBuyerPrice: optionsEnabled
        ? optionSummary.maxBuyerPrice
        : basePrices.buyerPrice,

      updatedAt: serverTimestamp()
    };

    if (editingItemId) {
      await updateDoc(
        doc(db, "products", editingItemId),
        itemData
      );

      setMessage(itemMessage, "Item updated successfully.", "success");
    } else {
      await addDoc(collection(db, "products"), {
        ...itemData,
        active: true,
        createdAt: serverTimestamp()
      });

      setMessage(itemMessage, "Item added successfully.", "success");
    }

    resetItemForm();
    await loadMyItems();
  } catch (error) {
    console.error("Could not save item:", error);

    setMessage(
      itemMessage,
      error.message ||
        getFriendlySellerError(
          error,
          "The item could not be saved."
        ),
      "error"
    );
  } finally {
    saveItemBtn.disabled = false;
  }
});

/* =========================================================
   RESET AND EDIT
   ========================================================= */

function resetItemForm() {
  editingItemId = null;

  existingImageUrls = [];
  selectedImageFiles = [];
  removedExistingImageUrls = new Set();
  optionRows = [];

  if (formTitle) formTitle.textContent = "Add Product / Service";
  if (saveItemBtn) saveItemBtn.textContent = "Add Item";

  if (cancelEditBtn) {
    cancelEditBtn.style.display = "none";
  }

  if (itemType) itemType.value = "product";
  if (itemTitle) itemTitle.value = "";
  if (itemDescription) itemDescription.value = "";
  if (itemPrice) itemPrice.value = "";
  if (itemStock) itemStock.value = "";
  if (itemCategory) itemCategory.value = "";
  if (serviceArea) serviceArea.value = "";

  if (itemImages) itemImages.value = "";
  if (legacyItemImage) legacyItemImage.value = "";

  if (itemImagesPreview) itemImagesPreview.innerHTML = "";
  if (existingItemImages) existingItemImages.innerHTML = "";

  if (legacyItemImagePreview) {
    legacyItemImagePreview.innerHTML = "";
    legacyItemImagePreview.style.display = "none";
  }

  if (enableItemOptions) enableItemOptions.checked = false;
  if (itemOptionType) itemOptionType.value = "";
  if (itemOptionsList) itemOptionsList.innerHTML = "";

  setOptionsEnabled(false);
  refreshOptionCount();
  updatePricePreview();
}

function startEditingItem(itemId, item) {
  editingItemId = itemId;

  existingImageUrls = normalizeProductImages(item);
  selectedImageFiles = [];
  removedExistingImageUrls = new Set();

  optionRows = [];
  if (itemOptionsList) itemOptionsList.innerHTML = "";

  if (formTitle) formTitle.textContent = "Edit Product / Service";
  if (saveItemBtn) saveItemBtn.textContent = "Update Item";

  if (cancelEditBtn) {
    cancelEditBtn.style.display = "inline-flex";
  }

  if (itemType) itemType.value = item.type || "product";
  if (itemTitle) itemTitle.value = item.title || "";
  if (itemDescription) itemDescription.value = item.description || "";
  if (itemPrice) itemPrice.value = getSellerPrice(item);
  if (itemStock) itemStock.value = Number(item.stock || 0);

  const existingCategory = item.category || "";
  ensureSellerCategoryOption(existingCategory);

  if (itemCategory) itemCategory.value = existingCategory;
  if (serviceArea) serviceArea.value = item.serviceArea || "";

  if (itemImages) itemImages.value = "";
  if (legacyItemImage) legacyItemImage.value = "";

  renderExistingProductImages();
  renderSelectedProductImages();

  const normalizedOptions = normalizeProductOptions(item);
  const hasOptions =
    item.hasOptions === true || normalizedOptions.length > 0;

  if (enableItemOptions) {
    enableItemOptions.checked = hasOptions;
  }

  if (itemOptionType) {
    itemOptionType.value =
      item.optionType ||
      item.variantType ||
      (hasOptions ? "Option" : "");
  }

  setOptionsEnabled(hasOptions);

  normalizedOptions.forEach((option) => {
    addOptionRow(option);
  });

  if (hasOptions && normalizedOptions.length === 0) {
    addOptionRow();
  }

  updateOptionImageChoices();
  updatePricePreview();
  refreshOptionRowTitles();

  document
    .querySelector('[data-seller-page="add-product"]')
    ?.click();

  const formCard = document.querySelector(".seller-listing-form-card");

  if (formCard) {
    formCard.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } else {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
}

/* =========================================================
   LOAD AND RENDER SELLER ITEMS
   ========================================================= */

async function loadMyItems() {
  if (!myItems) return;

  myItems.innerHTML = "Loading your items...";

  try {
    const itemsQuery = query(
      collection(db, "products"),
      where("sellerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(itemsQuery);

    currentProductCount = snapshot.size;

    const productLimit = Number(currentUserData?.productLimit || 25);

    if (slotInfo) {
      slotInfo.textContent =
        `You are using ${currentProductCount} / ${productLimit} product slots.`;
    }

    if (snapshot.empty) {
      myItems.innerHTML = `
        <div class="empty-market-card">
          <h3>No items added yet</h3>
          <p>Add your first product or service using the form above.</p>
        </div>
      `;
      return;
    }

    const records = [];

    snapshot.forEach((docSnap) => {
      records.push({
        id: docSnap.id,
        data: docSnap.data()
      });
    });

    records.sort((a, b) => {
      return (
        Number(b.data.createdAt?.seconds || 0) -
        Number(a.data.createdAt?.seconds || 0)
      );
    });

    myItems.innerHTML = "";

    records.forEach(({ id, data }) => {
      renderSellerItemCard(id, data);
    });
  } catch (error) {
    console.error("Could not load seller items:", error);

    myItems.innerHTML = `
      <div class="empty-market-card">
        <h3>Could not load your items</h3>
        <p>
          ${escapeHtml(
            getFriendlySellerError(
              error,
              "Please refresh the page and try again."
            )
          )}
        </p>
      </div>
    `;
  }
}

function renderSellerItemCard(itemId, item) {
  const productImages = normalizeProductImages(item);
  const options = normalizeProductOptions(item);

  const sellerPrice = getSellerPrice(item);
  const buyerPrice = Number(item.buyerPrice || item.price || 0);

  const commissionAmount = Number(
    item.commissionAmount ||
      Math.max(0, buyerPrice - sellerPrice)
  );

  const priceDisplay =
    options.length > 0 &&
    Number(item.maxBuyerPrice || 0) >
      Number(item.minBuyerPrice || 0)
      ? `${formatRs(item.minBuyerPrice)} – ${formatRs(item.maxBuyerPrice)}`
      : formatRs(buyerPrice);

  const optionSummary = options.length
    ? `
      <div class="seller-item-options-summary">
        <strong>${escapeHtml(item.optionType || "Options")}</strong>
        <span>${options.length} option(s)</span>
        <small>
          ${escapeHtml(
            options
              .slice(0, 5)
              .map((option) => option.name)
              .join(", ")
          )}${options.length > 5 ? "…" : ""}
        </small>
      </div>
    `
    : "";

  const card = document.createElement("article");
  card.className = "card product-card seller-item-card";

  card.innerHTML = `
    <div class="seller-item-image-wrap">
      ${
        productImages[0]
          ? `
            <img
              src="${escapeHtml(productImages[0])}"
              alt="${escapeHtml(item.title || "Product")}">
          `
          : `<div class="no-img">No Image</div>`
      }

      ${
        productImages.length > 1
          ? `
            <span class="seller-item-image-count">
              ${productImages.length} images
            </span>
          `
          : ""
      }
    </div>

    <div class="seller-item-card-body">
      <div class="product-card-top-row">
        <span class="badge">
          ${escapeHtml(item.type || "item")}
        </span>

        <span class="status-badge ${item.active ? "active" : "hidden"}">
          ${item.active ? "Visible" : "Hidden"}
        </span>
      </div>

      <h3>${escapeHtml(item.title || "Untitled")}</h3>
      <p class="muted">${escapeHtml(item.category || "Other")}</p>

      ${optionSummary}

      <div class="seller-price-breakdown">
        <p>
          <strong>Seller receives:</strong>
          ${formatRs(sellerPrice)}
        </p>

        <p>
          <strong>MauMarket 10%:</strong>
          ${formatRs(commissionAmount)}
        </p>

        <p>
          <strong>Buyer sees:</strong>
          ${priceDisplay}
        </p>

        <p>
          <strong>Total stock:</strong>
          ${Number(item.stock || 0)}
        </p>

        <p>
          <strong>Public seller label:</strong>
          Verified MauMarket Merchant
        </p>
      </div>

      <div class="seller-actions">
        <button class="edit-btn" type="button">Edit</button>
        <button class="toggle-btn" type="button">
          ${item.active ? "Hide" : "Show"}
        </button>
        <button class="danger-btn" type="button">Delete</button>
      </div>
    </div>
  `;

  card.querySelector(".edit-btn")?.addEventListener("click", () => {
    startEditingItem(itemId, item);
  });

  card.querySelector(".toggle-btn")?.addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "products", itemId), {
        active: !item.active,
        updatedAt: serverTimestamp()
      });

      await loadMyItems();
    } catch (error) {
      setMessage(
        itemMessage,
        getFriendlySellerError(
          error,
          "The item visibility could not be changed."
        ),
        "error"
      );
    }
  });

  card.querySelector(".danger-btn")?.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Delete this item permanently? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "products", itemId));

      if (editingItemId === itemId) {
        resetItemForm();
      }

      await loadMyItems();
    } catch (error) {
      setMessage(
        itemMessage,
        getFriendlySellerError(
          error,
          "The item could not be deleted."
        ),
        "error"
      );
    }
  });

  myItems.appendChild(card);
}

/* =========================================================
   PRODUCT SLOT REQUEST
   ========================================================= */

requestSlotsBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  const requestedAmount = window.prompt(
    "How many extra slots do you want? Example: 50"
  );

  const amount = Number(requestedAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    setMessage(slotMessage, "Invalid slot request.", "error");
    return;
  }

  requestSlotsBtn.disabled = true;
  setMessage(slotMessage, "Sending request...", "info");

  try {
    await addDoc(collection(db, "quotaRequests"), {
      sellerId: currentUser.uid,
      sellerName: currentUserData?.name || "",
      sellerEmail:
        currentUserData?.email ||
        currentUser.email ||
        "",
      currentLimit: Number(currentUserData?.productLimit || 25),
      requestedExtra: Math.floor(amount),
      status: "pending",
      createdAt: serverTimestamp()
    });

    setMessage(slotMessage, "Request sent to admin.", "success");
  } catch (error) {
    setMessage(
      slotMessage,
      getFriendlySellerError(
        error,
        "The slot request could not be sent."
      ),
      "error"
    );
  } finally {
    requestSlotsBtn.disabled = false;
  }
});

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function getSellerPrice(item) {
  if (
    item?.sellerPrice !== undefined &&
    item?.sellerPrice !== null
  ) {
    return Number(item.sellerPrice || 0);
  }

  const buyerPrice = Number(
    item?.buyerPrice ||
    item?.price ||
    0
  );

  if (buyerPrice <= 0) return 0;

  return roundMoney(
    buyerPrice / (1 + COMMISSION_RATE)
  );
}

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message || "";

  element.classList.remove(
    "success",
    "error",
    "info",
    "seller-message-success",
    "seller-message-error",
    "seller-message-info"
  );

  if (!message || !type) return;

  element.classList.add(type);
  element.classList.add(`seller-message-${type}`);
}

function getFriendlySellerError(error, fallbackMessage) {
  const code = String(error?.code || "");

  const messages = {
    "permission-denied":
      "You do not have permission to perform this action.",
    "storage/unauthorized":
      "You do not have permission to upload this file.",
    "storage/canceled":
      "The file upload was cancelled.",
    "storage/unknown":
      "The file could not be uploaded. Please try again.",
    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",
    "failed-precondition":
      "The requested operation could not be completed.",
    "resource-exhausted":
      "The service is temporarily busy. Please try again.",
    "network-request-failed":
      "Please check your internet connection and try again.",
    "auth/network-request-failed":
      "Please check your internet connection and try again."
  };

  return messages[code] || fallbackMessage;
}

function createUniqueId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `option-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================================================
// SELLER DASHBOARD APP-STYLE TABS
// =========================================================

initializeSellerDashboardTabs();

function initializeSellerDashboardTabs() {
  const tabs=[...document.querySelectorAll("[data-seller-page]")];
  const views=[...document.querySelectorAll("[data-seller-view]")];
  if(!tabs.length||!views.length) return;
  function show(name){
    tabs.forEach(t=>{
      const a=t.dataset.sellerPage===name;
      t.classList.toggle("active",a);
      t.setAttribute("aria-selected",a);
    });
    views.forEach(v=>{
      const a=v.dataset.sellerView===name;
      v.classList.toggle("active",a);
      v.hidden=!a;
    });
    sessionStorage.setItem("maumarketSellerView",name);
  }
  tabs.forEach(t=>t.addEventListener("click",()=>show(t.dataset.sellerPage)));
  show(sessionStorage.getItem("maumarketSellerView")||"overview");
}

