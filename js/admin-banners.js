import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";


/* =========================================================
   ELEMENTS
========================================================= */

const bannerTargetType = document.getElementById("bannerTargetType");
const bannerTargetSearch = document.getElementById("bannerTargetSearch");
const bannerTargetSelect = document.getElementById("bannerTargetSelect");
const bannerTargetCount = document.getElementById("bannerTargetCount");

const bannerTargetPreview = document.getElementById("bannerTargetPreview");
const bannerTargetPreviewImage = document.getElementById("bannerTargetPreviewImage");
const bannerTargetPreviewType = document.getElementById("bannerTargetPreviewType");
const bannerTargetPreviewTitle = document.getElementById("bannerTargetPreviewTitle");
const bannerTargetPreviewMeta = document.getElementById("bannerTargetPreviewMeta");

const bannerTitle = document.getElementById("bannerTitle");
const bannerSubtitle = document.getElementById("bannerSubtitle");
const bannerImage = document.getElementById("bannerImage");
const bannerImagePreview = document.getElementById("bannerImagePreview");

const saveBannerBtn = document.getElementById("saveBannerBtn");
const bannerMessage = document.getElementById("bannerMessage");
const bannersList = document.getElementById("bannersList");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let shops = [];
let products = [];
let visibleTargets = [];
let selectedTarget = null;


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (
      !userSnap.exists() ||
      userSnap.data().role !== "admin" ||
      userSnap.data().approved !== true ||
      userSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    await Promise.all([
      loadAvailableTargets(),
      loadBanners()
    ]);

    refreshTargetPicker();
  } catch (error) {
    console.error("Unable to initialize banner manager:", error);
    showMessage("Unable to load banner manager.", "error");
  }
});


/* =========================================================
   EVENTS
========================================================= */

bannerTargetType?.addEventListener("change", () => {
  selectedTarget = null;

  if (bannerTargetSearch) {
    bannerTargetSearch.value = "";
    bannerTargetSearch.placeholder =
      bannerTargetType.value === "product"
        ? "Search products..."
        : "Search shops...";
  }

  resetTargetPreview();
  refreshTargetPicker();
});


bannerTargetSearch?.addEventListener("input", () => {
  refreshTargetPicker();
});


bannerTargetSelect?.addEventListener("change", () => {
  selectTargetById(bannerTargetSelect.value);
});


bannerImage?.addEventListener("change", () => {
  const file = bannerImage.files?.[0];

  if (!file) {
    showSelectedTargetImage();
    return;
  }

  const url = URL.createObjectURL(file);

  bannerImagePreview.src = url;
  bannerImagePreview.classList.add("show");

  bannerImagePreview.onload = () => {
    URL.revokeObjectURL(url);
  };
});


saveBannerBtn?.addEventListener("click", saveBanner);


/* =========================================================
   LOAD SHOPS + PRODUCTS
========================================================= */

async function loadAvailableTargets() {
  const [shopsSnapshot, productsSnapshot] = await Promise.all([
    getDocs(collection(db, "shops")),
    getDocs(collection(db, "products"))
  ]);

  shops = [];
  products = [];

  shopsSnapshot.forEach((docSnap) => {
    const data = docSnap.data();

    if (data.active === false) return;

    shops.push({
      id: docSnap.id,
      type: "shop",
      ...data
    });
  });

  productsSnapshot.forEach((docSnap) => {
    const data = docSnap.data();

    if (data.active === false) return;

    products.push({
      id: docSnap.id,
      type: "product",
      ...data
    });
  });

  shops.sort((a, b) => {
    return getShopName(a).localeCompare(getShopName(b));
  });

  products.sort((a, b) => {
    return getProductTitle(a).localeCompare(getProductTitle(b));
  });
}


/* =========================================================
   TARGET PICKER
========================================================= */

function refreshTargetPicker() {
  if (!bannerTargetSelect) return;

  const type = bannerTargetType?.value || "shop";
  const search = normalize(bannerTargetSearch?.value || "");

  const source = type === "product" ? products : shops;

  visibleTargets = source.filter((item) => {
    if (!search) return true;

    const searchable =
      type === "product"
        ? normalize(`
            ${item.id}
            ${getProductTitle(item)}
            ${item.description || ""}
            ${item.category || ""}
            ${item.shopName || ""}
            ${item.sellerName || ""}
            ${item.productCode || ""}
            ${item.sku || ""}
          `)
        : normalize(`
            ${item.id}
            ${getShopName(item)}
            ${item.description || ""}
            ${item.location || ""}
            ${item.address || ""}
            ${item.phone || ""}
          `);

    return searchable.includes(search);
  });

  bannerTargetSelect.innerHTML = "";

  const firstOption = document.createElement("option");
  firstOption.value = "";

  firstOption.textContent =
    visibleTargets.length === 0
      ? `No ${type === "product" ? "products" : "shops"} found`
      : `Select ${type === "product" ? "a product" : "a shop"}`;

  bannerTargetSelect.appendChild(firstOption);

  visibleTargets.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;

    if (type === "product") {
      const shopName = item.shopName || item.sellerName || "Seller";
      option.textContent = `${getProductTitle(item)} — ${shopName}`;
    } else {
      option.textContent = getShopName(item);
    }

    bannerTargetSelect.appendChild(option);
  });

  if (bannerTargetCount) {
    bannerTargetCount.textContent =
      `${visibleTargets.length} ${type === "product" ? "product(s)" : "shop(s)"} available`;
  }
}


function selectTargetById(id) {
  const type = bannerTargetType?.value || "shop";
  const source = type === "product" ? products : shops;

  selectedTarget = source.find((item) => item.id === id) || null;

  if (!selectedTarget) {
    resetTargetPreview();
    return;
  }

  const title =
    type === "product"
      ? getProductTitle(selectedTarget)
      : getShopName(selectedTarget);

  const subtitle =
    type === "product"
      ? getProductSubtitle(selectedTarget)
      : getShopSubtitle(selectedTarget);

  if (bannerTitle) {
    bannerTitle.value = title;
  }

  if (bannerSubtitle) {
    bannerSubtitle.value = subtitle;
  }

  renderTargetPreview();
  showSelectedTargetImage();
}


function renderTargetPreview() {
  if (!selectedTarget) {
    resetTargetPreview();
    return;
  }

  const type = bannerTargetType?.value || "shop";
  const imageUrl = getTargetImage(selectedTarget, type);

  bannerTargetPreview?.classList.add("show");

  if (bannerTargetPreviewType) {
    bannerTargetPreviewType.textContent =
      type === "product" ? "Product" : "Shop";
  }

  if (bannerTargetPreviewTitle) {
    bannerTargetPreviewTitle.textContent =
      type === "product"
        ? getProductTitle(selectedTarget)
        : getShopName(selectedTarget);
  }

  if (bannerTargetPreviewMeta) {
    bannerTargetPreviewMeta.textContent =
      type === "product"
        ? `${selectedTarget.shopName || selectedTarget.sellerName || "Seller"}${selectedTarget.price ? ` • Rs ${formatMoney(selectedTarget.price)}` : ""}`
        : selectedTarget.location ||
          selectedTarget.address ||
          selectedTarget.description ||
          "MauMarket shop";
  }

  if (bannerTargetPreviewImage) {
    if (imageUrl) {
      bannerTargetPreviewImage.src = imageUrl;
      bannerTargetPreviewImage.style.display = "";
    } else {
      bannerTargetPreviewImage.removeAttribute("src");
      bannerTargetPreviewImage.style.display = "none";
    }
  }
}


function resetTargetPreview() {
  bannerTargetPreview?.classList.remove("show");

  if (bannerTargetPreviewImage) {
    bannerTargetPreviewImage.removeAttribute("src");
  }

  if (bannerImagePreview) {
    bannerImagePreview.classList.remove("show");
    bannerImagePreview.removeAttribute("src");
  }
}


function showSelectedTargetImage() {
  if (!bannerImagePreview) return;

  if (bannerImage?.files?.[0]) {
    return;
  }

  if (!selectedTarget) {
    bannerImagePreview.classList.remove("show");
    bannerImagePreview.removeAttribute("src");
    return;
  }

  const type = bannerTargetType?.value || "shop";
  const imageUrl = getTargetImage(selectedTarget, type);

  if (!imageUrl) {
    bannerImagePreview.classList.remove("show");
    bannerImagePreview.removeAttribute("src");
    return;
  }

  bannerImagePreview.src = imageUrl;
  bannerImagePreview.classList.add("show");
}


/* =========================================================
   SAVE BANNER
========================================================= */

async function saveBanner() {
  clearMessage();

  const type = bannerTargetType?.value || "shop";
  const selectedId = bannerTargetSelect?.value || "";

  if (!selectedId || !selectedTarget) {
    showMessage(
      `Please choose ${type === "product" ? "a product" : "a shop"} first.`,
      "error"
    );
    return;
  }

  const title = bannerTitle?.value.trim() || "";

  if (!title) {
    showMessage("Please enter a banner title.", "error");
    bannerTitle?.focus();
    return;
  }

  let imageUrl = getTargetImage(selectedTarget, type);

  try {
    setSaving(true);

    const customImage = bannerImage?.files?.[0];

    if (customImage) {
      imageUrl = await uploadBanner(customImage);
    }

    if (!imageUrl) {
      showMessage(
        "The selected item has no image. Please upload a banner image.",
        "error"
      );
      return;
    }

    const bannerData = {
      title,
      subtitle: bannerSubtitle?.value.trim() || "",
      imageUrl,

      targetType: type,
      targetId: selectedTarget.id,
      targetUrl:
        type === "product"
          ? `product.html?id=${selectedTarget.id}`
          : `shop.html?id=${selectedTarget.id}`,

      active: true,
      clicks: 0,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (type === "shop") {
      bannerData.shopId = selectedTarget.id;
      bannerData.shopName = getShopName(selectedTarget);
      bannerData.productId = "";
      bannerData.productTitle = "";
    } else {
      bannerData.productId = selectedTarget.id;
      bannerData.productTitle = getProductTitle(selectedTarget);

      bannerData.shopId =
        selectedTarget.shopId ||
        selectedTarget.sellerId ||
        selectedTarget.ownerId ||
        "";

      bannerData.shopName =
        selectedTarget.shopName ||
        selectedTarget.sellerName ||
        "";
    }

    await addDoc(
      collection(db, "banners"),
      bannerData
    );

    resetForm();

    showMessage("Banner created successfully.", "success");

    await loadBanners();
  } catch (error) {
    console.error("Unable to create banner:", error);

    showMessage(
      getFriendlyError(error),
      "error"
    );
  } finally {
    setSaving(false);
  }
}


/* =========================================================
   UPLOAD
========================================================= */

async function uploadBanner(file) {
  const safeName = String(file.name || "banner")
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  const imageRef = ref(
    storage,
    `banners/${Date.now()}-${safeName}`
  );

  await uploadBytes(imageRef, file);

  return await getDownloadURL(imageRef);
}


/* =========================================================
   CURRENT BANNERS
========================================================= */

async function loadBanners() {
  if (!bannersList) return;

  bannersList.innerHTML = "Loading banners...";

  try {
    const snapshot = await getDocs(
      collection(db, "banners")
    );

    if (snapshot.empty) {
      bannersList.innerHTML = "<p>No banners yet.</p>";
      return;
    }

    const banners = [];

    snapshot.forEach((docSnap) => {
      banners.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    banners.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    bannersList.innerHTML = "";

    banners.forEach((banner) => {
      bannersList.appendChild(
        createBannerCard(banner)
      );
    });
  } catch (error) {
    console.error("Unable to load banners:", error);

    bannersList.innerHTML =
      "<p>Unable to load banners.</p>";
  }
}


function createBannerCard(banner) {
  const div = document.createElement("div");

  div.className = "order-card banner-current-card";

  const targetType =
    banner.targetType ||
    (banner.productId ? "product" : "shop");

  const targetLabel =
    targetType === "product"
      ? banner.productTitle || "Product"
      : banner.shopName || "Shop";

  const targetUrl =
    banner.targetUrl ||
    (
      targetType === "product" && banner.productId
        ? `product.html?id=${banner.productId}`
        : banner.shopId
          ? `shop.html?id=${banner.shopId}`
          : ""
    );

  div.innerHTML = `
    ${
      banner.imageUrl
        ? `
          <img
            class="banner-preview"
            src="${escapeHtml(banner.imageUrl)}"
            alt="${escapeHtml(banner.title || "Banner")}"
          >
        `
        : ""
    }

    <h3>${escapeHtml(banner.title || "Banner")}</h3>

    ${
      banner.subtitle
        ? `<p>${escapeHtml(banner.subtitle)}</p>`
        : ""
    }

    <div class="banner-current-meta">
      <span class="banner-chip">
        ${targetType === "product" ? "Product" : "Shop"}
      </span>

      <span class="banner-chip">
        ${banner.active ? "Active" : "Hidden"}
      </span>

      <span class="banner-chip">
        ${Number(banner.clicks || 0)} clicks
      </span>
    </div>

    <p>
      <strong>Target:</strong>
      ${escapeHtml(targetLabel)}
    </p>

    <div class="seller-actions">

      ${
        targetUrl
          ? `
            <a
              class="btn"
              href="${escapeHtml(targetUrl)}"
              target="_blank"
              rel="noopener"
            >
              View ${targetType === "product" ? "Product" : "Shop"}
            </a>
          `
          : ""
      }

      <button
        type="button"
        class="toggle-btn"
      >
        ${banner.active ? "Hide" : "Show"}
      </button>

      <button
        type="button"
        class="danger-btn"
      >
        Delete
      </button>

    </div>
  `;

  div
    .querySelector(".toggle-btn")
    ?.addEventListener("click", async () => {
      try {
        await updateDoc(
          doc(db, "banners", banner.id),
          {
            active: !banner.active,
            updatedAt: serverTimestamp()
          }
        );

        await loadBanners();
      } catch (error) {
        console.error("Unable to update banner:", error);
        alert(getFriendlyError(error));
      }
    });

  div
    .querySelector(".danger-btn")
    ?.addEventListener("click", async () => {
      if (!confirm("Delete this banner?")) return;

      try {
        await deleteDoc(
          doc(db, "banners", banner.id)
        );

        await loadBanners();
      } catch (error) {
        console.error("Unable to delete banner:", error);
        alert(getFriendlyError(error));
      }
    });

  return div;
}


/* =========================================================
   TARGET HELPERS
========================================================= */

function getShopName(shop = {}) {
  return (
    shop.shopName ||
    shop.name ||
    shop.title ||
    "Unnamed Shop"
  );
}


function getProductTitle(product = {}) {
  return (
    product.title ||
    product.name ||
    product.productName ||
    "Unnamed Product"
  );
}


function getShopSubtitle(shop = {}) {
  return (
    shop.description ||
    shop.location ||
    shop.address ||
    ""
  );
}


function getProductSubtitle(product = {}) {
  const pieces = [];

  if (product.shopName || product.sellerName) {
    pieces.push(
      product.shopName ||
      product.sellerName
    );
  }

  if (product.price !== undefined && product.price !== null) {
    pieces.push(
      `Rs ${formatMoney(product.price)}`
    );
  }

  if (product.category) {
    pieces.push(product.category);
  }

  return pieces.join(" • ");
}


function getTargetImage(item = {}, type = "shop") {
  if (type === "product") {
    return (
      item.imageUrl ||
      item.image ||
      item.mainImage ||
      item.thumbnailUrl ||
      item.coverImage ||
      (Array.isArray(item.images) ? item.images[0] : "") ||
      ""
    );
  }

  return (
    item.bannerUrl ||
    item.coverImage ||
    item.logoUrl ||
    item.logo ||
    item.imageUrl ||
    item.image ||
    ""
  );
}


/* =========================================================
   FORM
========================================================= */

function resetForm() {
  selectedTarget = null;

  if (bannerTargetSelect) {
    bannerTargetSelect.value = "";
  }

  if (bannerTargetSearch) {
    bannerTargetSearch.value = "";
  }

  if (bannerTitle) {
    bannerTitle.value = "";
  }

  if (bannerSubtitle) {
    bannerSubtitle.value = "";
  }

  if (bannerImage) {
    bannerImage.value = "";
  }

  resetTargetPreview();
  refreshTargetPicker();
}


function setSaving(saving) {
  if (!saveBannerBtn) return;

  saveBannerBtn.disabled = saving;

  saveBannerBtn.textContent =
    saving
      ? "Saving..."
      : "Save Banner";
}


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(text, type = "error") {
  if (!bannerMessage) return;

  bannerMessage.textContent = text;

  bannerMessage.classList.remove(
    "success-message",
    "error-message"
  );

  bannerMessage.classList.add(
    type === "success"
      ? "success-message"
      : "error-message"
  );
}


function clearMessage() {
  if (!bannerMessage) return;

  bannerMessage.textContent = "";

  bannerMessage.classList.remove(
    "success-message",
    "error-message"
  );
}


function getFriendlyError(error) {
  const code = error?.code || "";

  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied"
  ) {
    return "You do not have permission to manage banners.";
  }

  if (
    code === "storage/unauthorized"
  ) {
    return "You do not have permission to upload banner images.";
  }

  if (
    code === "storage/canceled"
  ) {
    return "The image upload was cancelled.";
  }

  if (
    code === "storage/unknown"
  ) {
    return "The image could not be uploaded. Please try again.";
  }

  return (
    error?.message ||
    "Something went wrong. Please try again."
  );
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function formatMoney(value) {
  const number = Number(value || 0);

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
