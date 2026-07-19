/**
 * MauMarket Product Details
 * Updated option labels and automatic size detection.
 * V3: legacy numeric values saved in option.name are detected as sizes.
 */

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
   MAUMARKET PRODUCT DETAILS
   - Up to 3 product images
   - Unlimited product options
   - Option-specific size/measurement, unit, price, stock, SKU and image
   - Wishlist, cart, reviews and related products
   - Backward-compatible with older products
   ========================================================= */

const COMMISSION_RATE = 0.10;
const MAX_GALLERY_IMAGES = 3;

const detailsBox = document.getElementById("detailsBox");
const relatedItems = document.getElementById("relatedItems");
const productReviewsSection = document.getElementById("productReviewsSection");
const productReviewsSummary = document.getElementById("productReviewsSummary");
const productReviewsList = document.getElementById("productReviewsList");
const productReviewsSummaryText = document.getElementById("productReviewsSummaryText");
const productOptionsFallback = document.getElementById("productOptionsFallback");
const productOptionsList = document.getElementById("productOptionsList");
const productOptionTypeTitle = document.getElementById("productOptionTypeTitle");
const productOptionsHelpText = document.getElementById("productOptionsHelpText");
const productSelectedOptionSummary = document.getElementById("productSelectedOptionSummary");
const selectedOptionText = document.getElementById("selectedOptionText");
const productOptionError = document.getElementById("productOptionError");
const selectedOptionDetails = document.getElementById("selectedOptionDetails");
const selectedOptionPrice = document.getElementById("selectedOptionPrice");
const selectedOptionStock = document.getElementById("selectedOptionStock");
const selectedOptionCodeRow = document.getElementById("selectedOptionCodeRow");
const selectedOptionCode = document.getElementById("selectedOptionCode");
const selectedOptionMeasurementRow = document.getElementById("selectedOptionMeasurementRow");
const selectedOptionMeasurement = document.getElementById("selectedOptionMeasurement");

const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");

let currentUser = null;
let currentItem = null;
let productReviews = [];
let isWishlisted = false;
let productImages = [];
let productOptions = [];
let selectedOptionId = "";
let selectedImageIndex = 0;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  await loadDetails();
});

async function loadDetails() {
  if (!itemId) {
    renderProductError(
      "Product not found",
      "The product link is incomplete or invalid."
    );
    return;
  }

  detailsBox?.setAttribute("aria-busy", "true");

  try {
    const itemSnap = await getDoc(doc(db, "products", itemId));

    if (!itemSnap.exists()) {
      renderProductError(
        "Product not found",
        "This product may have been removed or is no longer available."
      );
      return;
    }

    currentItem = {
      id: itemSnap.id,
      ...itemSnap.data(),
      publicMerchantLabel: "Verified MauMarket Merchant"
    };

    if (currentItem.active === false) {
      renderProductError(
        "Product unavailable",
        "This product is not currently available on MauMarket."
      );
      return;
    }

    productImages = normalizeProductImages(currentItem);
    productOptions = normalizeProductOptions(currentItem);
    selectedOptionId =
      productOptions.find(
        (option) =>
          option.active !== false &&
          (
            currentItem.type !== "product" ||
            Number(option.stock || 0) > 0
          )
      )?.id || "";
    selectedImageIndex = 0;

    await Promise.all([
      loadProductReviews(),
      checkWishlistStatus()
    ]);

    renderDetails();
    renderExternalReviews();
    await loadRelatedItems();
  } catch (error) {
    console.error("Product details could not load:", error);

    renderProductError(
      "Product could not load",
      getFriendlyProductError(
        error,
        "Please refresh the page and try again."
      )
    );
  } finally {
    detailsBox?.setAttribute("aria-busy", "false");
  }
}

function renderProductError(title, message) {
  if (detailsBox) {
    detailsBox.innerHTML = `
      <div class="empty-market-card">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <a class="btn" href="products.html">Back to Marketplace</a>
      </div>
    `;
    detailsBox.setAttribute("aria-busy", "false");
  }

  if (relatedItems) relatedItems.innerHTML = "";
  if (productReviewsList) productReviewsList.innerHTML = "";
  if (productOptionsFallback) {
    productOptionsFallback.hidden = true;
    productOptionsFallback.style.display = "none";
  }
}

/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeProductImages(item) {
  const candidates = [
    ...(Array.isArray(item?.images) ? item.images : []),
    ...(Array.isArray(item?.imageUrls) ? item.imageUrls : []),
    item?.imageUrl || ""
  ];

  const unique = [];

  candidates.forEach((url) => {
    const clean = typeof url === "string" ? url.trim() : "";
    if (clean && !unique.includes(clean)) unique.push(clean);
  });

  return unique.slice(0, MAX_GALLERY_IMAGES);
}

function normalizeProductOptions(item) {
  const rawOptions = Array.isArray(item?.options)
    ? item.options
    : Array.isArray(item?.variants)
      ? item.variants
      : [];

  return rawOptions
    .map((option, index) => {
      const sellerPrice = getSellerPrice(option);
      const buyerPrice = getBuyerPrice(option);

      const imageIndex =
        option.imageIndex !== undefined &&
        option.imageIndex !== null
          ? Number(option.imageIndex)
          : null;

      const value = String(
        option.value ??
        option.measurementValue ??
        option.sizeValue ??
        ""
      ).trim();

      const unit = String(
        option.unit ??
        option.measurementUnit ??
        option.sizeUnit ??
        ""
      ).trim();

      const displayValue =
        String(option.displayValue || "").trim() ||
        buildOptionDisplayValue(value, unit);

      const explicitName = String(
        option.name ||
        option.label ||
        option.optionName ||
        option.type ||
        ""
      ).trim();

      const name = explicitName || `Option ${index + 1}`;

      return {
        id: option.id || `option-${index + 1}`,
        name,
        label: option.label || name,
        optionType: String(
          option.optionType ||
          option.type ||
          ""
        ).trim(),

        value,
        unit,
        displayValue: displayValue || name,
        measurementValue: value,
        measurementUnit: unit,
        sizeValue: value,
        sizeUnit: unit,

        sellerPrice,
        buyerPrice,
        price: Number(
          option.price ||
          option.buyerPrice ||
          buyerPrice ||
          0
        ),
        commissionRate: Number(
          option.commissionRate ?? COMMISSION_RATE
        ),
        commissionAmount: Number(
          option.commissionAmount || 0
        ),
        stock: Math.max(0, Number(option.stock || 0)),
        sku: option.sku || option.productCode || "",
        productCode: option.productCode || option.sku || "",
        imageIndex: Number.isInteger(imageIndex)
          ? imageIndex
          : null,
        imageUrl: option.imageUrl || "",
        active: option.active !== false
      };
    })
    .filter((option) => option.active !== false);
}

function getSelectedOption() {
  return productOptions.find((option) => option.id === selectedOptionId) || null;
}

function getSelectedImageUrl() {
  const selectedOption = getSelectedOption();

  if (selectedOption?.imageUrl) return selectedOption.imageUrl;

  if (
    selectedOption?.imageIndex !== null &&
    selectedOption?.imageIndex !== undefined &&
    productImages[selectedOption.imageIndex]
  ) {
    return productImages[selectedOption.imageIndex];
  }

  return productImages[selectedImageIndex] || productImages[0] || currentItem?.imageUrl || "";
}

/* =========================================================
   REVIEWS
   ========================================================= */

async function loadProductReviews() {
  try {
    const reviewsQuery = query(
      collection(db, "reviews"),
      where("productIds", "array-contains", itemId)
    );

    const snapshot = await getDocs(reviewsQuery);
    productReviews = [];

    snapshot.forEach((docSnap) => {
      productReviews.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    productReviews.sort((a, b) => {
      return Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0);
    });
  } catch (error) {
    console.warn("Product reviews could not load:", error.message);
    productReviews = [];
  }
}

function getRatingData() {
  const calculated =
    getAverageRating(productReviews, "sellerRating") ||
    getAverageRating(productReviews, "rating") ||
    0;

  const averageRating = Number(currentItem?.averageRating || calculated || 0);
  const totalReviews = Number(currentItem?.totalReviews || productReviews.length || 0);

  return {
    averageRating,
    totalReviews,
    text: averageRating > 0
      ? `⭐ ${averageRating.toFixed(1)} (${totalReviews} review${totalReviews === 1 ? "" : "s"})`
      : "⭐ No product reviews yet"
  };
}

function renderReviewsHtml(limit = 8) {
  if (productReviews.length === 0) {
    return `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p class="muted">Reviews will appear after verified purchases.</p>
      </div>
    `;
  }

  return productReviews.slice(0, limit).map((review) => {
    const rating = Number(review.sellerRating || review.rating || 0);

    return `
      <article class="order-card review-card">
        <div class="review-card-heading">
          <h3>${renderStars(rating)} ${rating > 0 ? rating.toFixed(1) : ""}</h3>
          ${review.verifiedPurchase !== false
            ? `<span class="status-badge active">Verified Purchase</span>`
            : ""}
        </div>
        <p><strong>${escapeHtml(review.customerName || "Customer")}</strong></p>
        <p>${escapeHtml(review.reviewText || "No written feedback.")}</p>
        <p class="muted">MauMarket verified order review</p>
      </article>
    `;
  }).join("");
}

function renderExternalReviews() {
  if (!productReviewsSection) return;

  const rating = getRatingData();

  if (productReviewsSummaryText) {
    productReviewsSummaryText.textContent = rating.text;
  }

  if (productReviewsSummary) {
    productReviewsSummary.style.display = "grid";
    productReviewsSummary.innerHTML = `
      <div class="review-score">
        <strong>${rating.averageRating.toFixed(1)}</strong>
        <span>${renderStars(rating.averageRating)}</span>
        <small>Average Rating</small>
      </div>
      <div class="review-summary-details">
        <p><strong>${rating.totalReviews}</strong> verified review${rating.totalReviews === 1 ? "" : "s"}</p>
        <p class="muted">Reviews are linked to completed MauMarket orders.</p>
      </div>
    `;
  }

  if (productReviewsList) {
    productReviewsList.innerHTML = renderReviewsHtml(8);
  }
}

/* =========================================================
   WISHLIST
   ========================================================= */

async function checkWishlistStatus() {
  isWishlisted = false;

  if (!currentUser || !itemId) return;

  try {
    const wishSnap = await getDoc(
      doc(db, "wishlists", currentUser.uid, "items", itemId)
    );

    isWishlisted = wishSnap.exists();
  } catch (error) {
    console.warn("Wishlist check failed:", error.message);
  }
}

async function toggleWishlist() {
  const message = document.getElementById("wishlistMessage");
  const button = document.getElementById("wishlistBtn");

  if (!currentUser) {
    setMessage(message, "Please login first.", "error");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);
    return;
  }

  if (!button) return;
  button.disabled = true;

  try {
    const wishlistRef = doc(
      db,
      "wishlists",
      currentUser.uid,
      "items",
      currentItem.id
    );

    if (isWishlisted) {
      await deleteDoc(wishlistRef);
      isWishlisted = false;
      button.textContent = "♡ Save";
      setMessage(message, "Removed from wishlist.", "success");
    } else {
      const selectedOption = getSelectedOption();
      const priceSource = selectedOption || currentItem;

      await setDoc(wishlistRef, {
        productId: currentItem.id,
        sellerId: currentItem.sellerId || "",
        title: currentItem.title || "",
        price: getBuyerPrice(priceSource),
        buyerPrice: getBuyerPrice(priceSource),
        sellerPrice: getSellerPrice(priceSource),
        commissionAmount: getCommissionAmount(priceSource),
        commissionRate: Number(priceSource.commissionRate ?? COMMISSION_RATE),
        imageUrl: getSelectedImageUrl(),
        category: currentItem.category || "",
        type: currentItem.type || "",
        hasOptions: productOptions.length > 0,
        optionType: getEffectiveOptionType(),
        selectedOptionId: selectedOption?.id || "",
        selectedOptionName: selectedOption?.name || "",
        selectedOptionValue: selectedOption?.value || "",
        selectedOptionUnit: selectedOption?.unit || "",
        selectedOptionDisplayValue:
          selectedOption?.displayValue ||
          selectedOption?.name ||
          "",
        selectedOptionSku: selectedOption?.sku || "",
        productCode: selectedOption?.productCode || selectedOption?.sku || "",
        publicMerchantLabel: "Verified MauMarket Merchant",
        addedAt: serverTimestamp()
      }, { merge: true });

      isWishlisted = true;
      button.textContent = "♥ Saved";
      setMessage(message, "Saved to wishlist.", "success");
    }
  } catch (error) {
    setMessage(
      message,
      getFriendlyProductError(error, "The wishlist could not be updated."),
      "error"
    );
  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   MAIN RENDER
   ========================================================= */

function renderDetails() {
  if (!detailsBox || !currentItem) return;

  const rating = getRatingData();
  const selectedOption = getSelectedOption();
  const effectiveOptionType = getEffectiveOptionType();
  const displaySource = selectedOption || currentItem;
  const buyerPrice = getBuyerPrice(displaySource);
  const stock = getStock(displaySource);
  const stockText = currentItem.type === "product"
    ? getStockText(stock)
    : `Available in ${escapeHtml(currentItem.serviceArea || "selected areas")}`;

  detailsBox.innerHTML = `
    <section class="pro-product-details clean-product-details private-merchant-details premium-option-product-details">

      <div class="pro-gallery clean-gallery premium-product-gallery">
        ${renderGalleryHtml()}
      </div>

      <div class="pro-product-info clean-product-info">

        <div class="product-meta-top">
          <span class="badge">${escapeHtml(currentItem.type || "item")}</span>
          <span class="verified-product-label">✓ Verified MauMarket Merchant</span>
        </div>

        <h1>${escapeHtml(currentItem.title || "Untitled")}</h1>
        <p class="muted">${escapeHtml(currentItem.category || "Other")}</p>

        <button id="productRatingButton" type="button" class="rating-line product-rating-button">
          ${rating.text}
        </button>

        <div class="product-price-area">
          <h2 id="productPrice" class="product-price">${formatRs(buyerPrice)}</h2>
          ${productOptions.length > 0
            ? `<small class="muted">Price and stock depend on the selected ${escapeHtml(effectiveOptionType.toLowerCase())}.</small>`
            : ""}
        </div>

        <div class="product-trust-mini">
          <span>✓ Secure checkout</span>
          <span>✓ Verified merchant</span>
          <span>✓ Delivery by MauMarket</span>
        </div>

        <p class="product-description">
          ${escapeHtml(currentItem.description || "No description provided.")}
        </p>

        ${renderOptionsHtml()}

        ${selectedOption
          ? `
            <div class="product-selection-summary">
              <div>
                <span>Selected ${escapeHtml(effectiveOptionType)}</span>
                <strong>${escapeHtml(getOptionCardPrimaryLabel(selectedOption))}</strong>
              </div>
              ${selectedOption.productCode || selectedOption.sku
                ? `
                  <div>
                    <span>Product Code</span>
                    <strong>${escapeHtml(selectedOption.productCode || selectedOption.sku)}</strong>
                  </div>
                `
                : ""}
            </div>
          `
          : ""}

        <p id="productStockText" class="stock-line ${stock <= 0 ? "out-of-stock" : ""}">
          <strong>${stockText}</strong>
        </p>

        <div class="cart-actions clean-cart-actions premium-cart-actions">
          <label class="quantity-field">
            <span>Quantity</span>
            <input
              id="qtyInput"
              type="number"
              min="1"
              max="${currentItem.type === "product" && stock > 0 ? stock : 999}"
              value="1"
              aria-label="Quantity">
          </label>

          <button
            id="addToCartBtn"
            type="button"
            ${currentItem.type === "product" && stock <= 0 ? "disabled" : ""}>
            ${currentItem.type === "product" && stock <= 0 ? "Out of Stock" : "Add to Cart"}
          </button>

          <button id="wishlistBtn" class="secondary-btn" type="button">
            ${isWishlisted ? "♥ Saved" : "♡ Save"}
          </button>
        </div>

        <p id="cartMessage" class="product-action-message" aria-live="polite"></p>
        <p id="wishlistMessage" class="product-action-message" aria-live="polite"></p>
      </div>

      <aside class="buy-box clean-buy-box private-merchant-buy-box">
        <h3>MauMarket Merchant</h3>

        <div class="anonymous-merchant-panel">
          <div class="anonymous-merchant-icon">✓</div>
          <div>
            <strong>Verified MauMarket Merchant</strong>
            <p>Merchant identity and pickup details remain private.</p>
          </div>
        </div>

        <div class="seller-safe-info">
          <p>🔒 Payment protected by MauMarket</p>
          <p>🚚 Pickup and delivery managed by MauMarket</p>
          <p>🛡 Buyer support included</p>
          <p>⭐ Reviews from verified purchases</p>
        </div>

        ${selectedOption
          ? `
            <div class="buy-box-option-summary">
              <span>Selected ${escapeHtml(effectiveOptionType)}</span>
              <strong>${escapeHtml(getOptionCardPrimaryLabel(selectedOption))}</strong>
              <small>${getStockText(selectedOption.stock)}</small>
            </div>
          `
          : ""}

        <a class="btn" href="products.html">Browse More Products</a>
        <a class="secondary-btn" href="wishlist.html">View Wishlist</a>
      </aside>
    </section>
  `;

  wireRenderedEvents();

  renderStaticOptionsFallback();
}

function renderGalleryHtml() {
  const mainImage = getSelectedImageUrl();

  if (!mainImage) {
    return `<div class="main-product-img no-img">No Image</div>`;
  }

  return `
    <div class="product-main-image-wrap">
      <img
        id="mainProductImage"
        class="main-product-img"
        src="${escapeHtml(mainImage)}"
        alt="${escapeHtml(currentItem.title || "Product")}">

      ${productImages.length > 1
        ? `<span class="product-gallery-count">${productImages.length} images</span>`
        : ""}
    </div>

    ${productImages.length > 1
      ? `
        <div id="productGalleryThumbs" class="product-gallery-thumbs">
          ${productImages.map((url, index) => `
            <button
              type="button"
              class="product-gallery-thumb ${url === mainImage || index === selectedImageIndex ? "active" : ""}"
              data-image-index="${index}"
              aria-label="View product image ${index + 1}">
              <img src="${escapeHtml(url)}" alt="Product image ${index + 1}">
            </button>
          `).join("")}
        </div>
      `
      : ""}
  `;
}

function renderOptionsHtml() {
  if (productOptions.length === 0) return "";

  const type = getEffectiveOptionType();

  return `
    <section class="product-options-panel">
      <div class="product-options-panel-head">
        <div>
          <span class="section-kicker">
            Choose ${escapeHtml(type)}
          </span>

          <h3>
            Available ${escapeHtml(type)}${type.toLowerCase().endsWith("option") ? "s" : " Options"}
          </h3>

          <p class="muted">
            Select the exact size, measurement, colour or variation you want.
          </p>
        </div>

        <span>
          ${productOptions.length}
          choice${productOptions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        id="productOptionChoices"
        class="product-option-choices"
        role="radiogroup"
        aria-label="${escapeHtml(type)} options"
      >
        ${productOptions.map((option) => {
          const active = option.id === selectedOptionId;
          const outOfStock =
            currentItem.type === "product" &&
            Number(option.stock || 0) <= 0;

          const displayLabel = getOptionCardPrimaryLabel(option);
          const secondaryLabel = getOptionCardSecondaryLabel(option);

          return `
            <button
              type="button"
              role="radio"
              aria-checked="${active ? "true" : "false"}"
              aria-label="${escapeHtml(
                `${displayLabel}, ${
                  outOfStock
                    ? "out of stock"
                    : formatRs(getBuyerPrice(option))
                }`
              )}"
              class="product-option-choice
                ${active ? "active" : ""}
                ${outOfStock ? "out-of-stock" : ""}"
              data-option-id="${escapeHtml(option.id)}"
              ${outOfStock ? "disabled" : ""}
            >
              <span class="product-option-choice-name">
                ${escapeHtml(displayLabel)}
              </span>

              ${
                secondaryLabel
                  ? `
                    <span class="product-option-choice-measurement">
                      ${escapeHtml(secondaryLabel)}
                    </span>
                  `
                  : ""
              }

              <small>
                ${
                  outOfStock
                    ? "Out of stock"
                    : `${formatRs(getBuyerPrice(option))} · ${getStockText(option.stock)}`
                }
              </small>

              ${
                option.sku
                  ? `
                    <small class="product-option-choice-code">
                      Code: ${escapeHtml(option.sku)}
                    </small>
                  `
                  : ""
              }
            </button>
          `;
        }).join("")}
      </div>

      <p
        id="inlineProductOptionError"
        class="product-option-error"
        role="alert"
        hidden
      ></p>
    </section>
  `;
}

function wireRenderedEvents() {
  document.getElementById("addToCartBtn")?.addEventListener("click", addToCart);
  document.getElementById("wishlistBtn")?.addEventListener("click", toggleWishlist);
  document.getElementById("productRatingButton")?.addEventListener("click", scrollToReviews);

  document.querySelectorAll("[data-image-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectGalleryImage(Number(button.dataset.imageIndex));
    });
  });

  document.querySelectorAll("[data-option-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectProductOption(button.dataset.optionId || "");
    });
  });
}

function selectProductOption(optionId) {
  const option = productOptions.find(
    (entry) => entry.id === optionId
  );

  if (!option) return;

  if (
    currentItem.type === "product" &&
    Number(option.stock || 0) <= 0
  ) {
    showOptionError("This option is currently out of stock.");
    return;
  }

  selectedOptionId = option.id;
  hideOptionError();

  if (
    option.imageIndex !== null &&
    option.imageIndex >= 0 &&
    option.imageIndex < productImages.length
  ) {
    selectedImageIndex = option.imageIndex;
  } else if (
    option.imageUrl &&
    productImages.includes(option.imageUrl)
  ) {
    selectedImageIndex =
      productImages.indexOf(option.imageUrl);
  }

  renderDetails();
  renderStaticOptionsFallback();
}

function selectGalleryImage(index) {
  if (!Number.isInteger(index) || index < 0 || index >= productImages.length) return;

  selectedImageIndex = index;

  const image = document.getElementById("mainProductImage");
  if (image) image.src = productImages[index];

  document.querySelectorAll("[data-image-index]").forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.imageIndex) === index
    );
  });
}

function renderStaticOptionsFallback() {
  if (!productOptionsFallback) return;

  if (productOptions.length === 0) {
    productOptionsFallback.hidden = true;
    productOptionsFallback.style.display = "none";
    return;
  }

  const type = getEffectiveOptionType();
  const selectedOption = getSelectedOption();

  productOptionsFallback.hidden = false;
  productOptionsFallback.style.display = "block";

  if (productOptionTypeTitle) {
    productOptionTypeTitle.textContent =
      `Choose ${type}`;
  }

  if (productOptionsHelpText) {
    productOptionsHelpText.textContent =
      `Select the exact ${type.toLowerCase()}, size, measurement or variation before adding this item to your cart.`;
  }

  if (productOptionsList) {
    productOptionsList.innerHTML = productOptions
      .map((option) => {
        const active = option.id === selectedOptionId;
        const outOfStock =
          currentItem?.type === "product" &&
          Number(option.stock || 0) <= 0;

        return `
          <button
            type="button"
            role="radio"
            aria-checked="${active ? "true" : "false"}"
            class="product-option-choice
              ${active ? "active" : ""}
              ${outOfStock ? "out-of-stock" : ""}"
            data-fallback-option-id="${escapeHtml(option.id)}"
            ${outOfStock ? "disabled" : ""}
          >
            <span class="product-option-choice-name">
              ${escapeHtml(getOptionCardPrimaryLabel(option))}
            </span>

            ${
              getOptionCardSecondaryLabel(option)
                ? `
                    <span class="product-option-choice-measurement">
                      ${escapeHtml(getOptionCardSecondaryLabel(option))}
                    </span>
                  `
                : ""
            }

            <small>
              ${
                outOfStock
                  ? "Out of stock"
                  : `${formatRs(getBuyerPrice(option))} · ${getStockText(option.stock)}`
              }
            </small>

            ${
              option.productCode || option.sku
                ? `
                    <small class="product-option-choice-code">
                      Code: ${escapeHtml(option.productCode || option.sku)}
                    </small>
                  `
                : ""
            }
          </button>
        `;
      })
      .join("");

    productOptionsList
      .querySelectorAll("[data-fallback-option-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          selectProductOption(
            button.dataset.fallbackOptionId || ""
          );
        });
      });
  }

  if (productSelectedOptionSummary) {
    productSelectedOptionSummary.hidden = !selectedOption;
  }

  if (selectedOptionText) {
    selectedOptionText.textContent = selectedOption
      ? getOptionDisplayLabel(selectedOption)
      : "None";
  }

  if (selectedOptionDetails) {
    selectedOptionDetails.hidden = !selectedOption;
  }

  if (selectedOptionPrice) {
    selectedOptionPrice.textContent = selectedOption
      ? formatRs(getBuyerPrice(selectedOption))
      : "—";
  }

  if (selectedOptionStock) {
    selectedOptionStock.textContent = selectedOption
      ? getStockText(selectedOption.stock)
      : "—";
  }

  if (selectedOptionCodeRow) {
    selectedOptionCodeRow.hidden =
      !(selectedOption?.productCode || selectedOption?.sku);
  }

  if (selectedOptionCode) {
    selectedOptionCode.textContent =
      selectedOption?.productCode || selectedOption?.sku || "—";
  }

  const measurement =
    selectedOption
      ? buildOptionDisplayValue(
          selectedOption.value,
          selectedOption.unit
        )
      : "";

  if (selectedOptionMeasurementRow) {
    selectedOptionMeasurementRow.hidden =
      !measurement;
  }

  if (selectedOptionMeasurement) {
    selectedOptionMeasurement.textContent =
      measurement || "—";
  }
}

function getEffectiveOptionType() {
  const rawType = String(
    currentItem?.optionType ||
    currentItem?.variationType ||
    currentItem?.optionName ||
    ""
  ).trim();

  const aliases = {
    size: "Size",
    sizes: "Size",
    colour: "Colour",
    color: "Colour",
    colours: "Colour",
    colors: "Colour",
    weight: "Weight",
    weights: "Weight",
    length: "Length",
    width: "Width",
    height: "Height",
    volume: "Volume",
    capacity: "Capacity",
    material: "Material",
    style: "Style",
    model: "Model",
    pack: "Pack",
    quantity: "Quantity",
    measurement: "Measurement",
    measurements: "Measurement",
    variation: "Option",
    variant: "Option",
    option: "Option"
  };

  const normalizedRawType = rawType.toLowerCase();

  /*
    "Option", "Variant" and "Variation" are generic labels.
    Do not return them before inspecting the real option values.
    Otherwise numeric values such as 50 and 100 remain displayed as
    generic options instead of being recognised as sizes.
  */
  const genericTypes = new Set([
    "",
    "option",
    "options",
    "variant",
    "variants",
    "variation",
    "variations"
  ]);

  if (
    normalizedRawType &&
    !genericTypes.has(normalizedRawType) &&
    aliases[normalizedRawType]
  ) {
    return aliases[normalizedRawType];
  }

  const declaredTypes = productOptions
    .map((option) => String(option.optionType || "").trim().toLowerCase())
    .filter(Boolean);

  const specificDeclaredType = declaredTypes.find(
    (value) =>
      !genericTypes.has(value) &&
      aliases[value]
  );

  if (specificDeclaredType) {
    return aliases[specificDeclaredType];
  }

  const units = productOptions
    .map((option) => String(option.unit || "").trim().toLowerCase())
    .filter(Boolean);

  if (units.some((unit) => ["g", "kg"].includes(unit))) return "Weight";
  if (units.some((unit) => ["ml", "l", "litre", "liter"].includes(unit))) return "Capacity";
  if (units.some((unit) => ["mm", "cm", "m", "in", "ft"].includes(unit))) return "Size";

  /*
    Older MauMarket products sometimes saved the visible size in option.name
    instead of option.value. Inspect every usable visible field so values such
    as "50" and "100" are still recognised as sizes.
  */
  const values = productOptions
    .map((option) => {
      return String(
        option.value ||
        option.displayValue ||
        option.name ||
        option.label ||
        ""
      ).trim();
    })
    .filter(Boolean)
    .map((value) => value.replace(/^size\s*[:\-]?\s*/i, "").trim());

  const allNumeric =
    values.length > 0 &&
    values.every((value) => /^-?\d+(?:[.,]\d+)?$/.test(value));

  if (allNumeric) return "Size";

  const commonColours = new Set([
    "red", "blue", "green", "black", "white", "yellow", "orange",
    "purple", "pink", "grey", "gray", "brown", "gold", "silver",
    "beige", "navy", "maroon", "teal", "turquoise"
  ]);

  if (
    values.length > 0 &&
    values.every((value) => commonColours.has(value.toLowerCase()))
  ) {
    return "Colour";
  }

  return "Option";
}

function getOptionCardPrimaryLabel(option) {
  const type = getEffectiveOptionType();

  const displayValue = String(
    option?.value ||
    option?.displayValue ||
    option?.name ||
    option?.label ||
    getOptionDisplayLabel(option) ||
    ""
  ).trim();

  if (!displayValue) return type;

  if (
    type === "Option" ||
    displayValue.toLowerCase().startsWith(type.toLowerCase())
  ) {
    return displayValue;
  }

  return `${type}: ${displayValue}`;
}

function getOptionCardSecondaryLabel(option) {
  const type = getEffectiveOptionType();
  const explicitName = String(option?.name || option?.label || "").trim();

  const genericNames = [
    "option", "size", "colour", "color", "weight", "length",
    "width", "height", "volume", "capacity", "measurement"
  ];

  if (
    explicitName &&
    !genericNames.includes(explicitName.toLowerCase()) &&
    !/^option\s+\d+$/i.test(explicitName) &&
    explicitName.toLowerCase() !== getOptionDisplayLabel(option).toLowerCase()
  ) {
    return explicitName;
  }

  if (!String(option?.unit || "").trim() && type === "Size") {
    return "Size option";
  }

  return "";
}

function buildOptionDisplayValue(value, unit) {
  const cleanValue = String(value || "").trim();
  const cleanUnit = String(unit || "").trim();

  if (!cleanValue) return "";
  if (!cleanUnit) return cleanValue;

  const unitLabels = {
    mm: "mm",
    cm: "cm",
    m: "m",
    in: "in",
    ft: "ft",
    ml: "ml",
    l: "L",
    g: "g",
    kg: "kg",
    piece: "piece",
    pack: "pack",
    set: "set",
    pair: "pair"
  };

  const label =
    unitLabels[cleanUnit.toLowerCase()] ||
    cleanUnit;

  return `${cleanValue} ${label}`;
}

function getOptionDisplayLabel(option) {
  return String(
    option?.displayValue ||
    buildOptionDisplayValue(
      option?.value,
      option?.unit
    ) ||
    option?.name ||
    option?.label ||
    "Option"
  ).trim();
}

function getOptionSecondaryLabel(option) {
  const measurement = buildOptionDisplayValue(
    option?.value,
    option?.unit
  );

  const name = String(
    option?.name ||
    option?.label ||
    ""
  ).trim();

  if (
    measurement &&
    name &&
    measurement.toLowerCase() !== name.toLowerCase()
  ) {
    return name;
  }

  return "";
}

function showOptionError(message) {
  const inlineError =
    document.getElementById("inlineProductOptionError");

  [inlineError, productOptionError].forEach((element) => {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  });
}

function hideOptionError() {
  showOptionError("");
}


/* =========================================================
   CART
   ========================================================= */

async function addToCart() {
  const message = document.getElementById("cartMessage");
  const button = document.getElementById("addToCartBtn");

  if (!currentUser) {
    setMessage(
      message,
      "Please sign in before adding products to your cart.",
      "error"
    );

    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);
    return;
  }

  const quantity = Number(document.getElementById("qtyInput")?.value || 1);

  if (!Number.isInteger(quantity) || quantity < 1) {
    setMessage(message, "Quantity must be a whole number of at least 1.", "error");
    return;
  }

  const selectedOption = getSelectedOption();

  if (productOptions.length > 0 && !selectedOption) {
    const errorText =
      `Please choose a ${getEffectiveOptionType().toLowerCase()} first.`;

    setMessage(message, errorText, "error");
    showOptionError(errorText);
    return;
  }

  hideOptionError();

  const priceSource = selectedOption || currentItem;
  const availableStock = getStock(priceSource);

  if (currentItem.type === "product" && availableStock <= 0) {
    setMessage(message, "This option is currently out of stock.", "error");
    return;
  }

  if (currentItem.type === "product" && quantity > availableStock) {
    setMessage(
      message,
      `Only ${availableStock} item${availableStock === 1 ? "" : "s"} are available.`,
      "error"
    );
    return;
  }

  if (!button) return;

  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const buyerPrice = getBuyerPrice(priceSource);
    const sellerPrice = getSellerPrice(priceSource);
    const commissionAmount = getCommissionAmount(priceSource);
    const optionId = selectedOption?.id || "";
    const cartDocumentId = optionId
      ? `${currentItem.id}__${sanitizeDocumentId(optionId)}`
      : currentItem.id;

    await setDoc(
      doc(db, "carts", currentUser.uid, "items", cartDocumentId),
      {
        cartItemId: cartDocumentId,
        productId: currentItem.id,
        sellerId: currentItem.sellerId || "",
        shopId: currentItem.shopId || currentItem.sellerId || "",
        shopName: currentItem.shopName || "MauMarket Seller",
        publicMerchantLabel: "Verified MauMarket Merchant",
        title: currentItem.title || "",
        type: currentItem.type || "product",
        category: currentItem.category || "",
        price: buyerPrice,
        buyerPrice,
        sellerPrice,
        commissionAmount,
        commissionRate: Number(priceSource.commissionRate ?? COMMISSION_RATE),
        quantity,
        imageUrl: getSelectedImageUrl(),
        images: productImages,
        hasOptions: productOptions.length > 0,
        optionType: getEffectiveOptionType(),
        optionId,
        optionName: selectedOption?.name || "",
        optionValue: selectedOption?.value || "",
        optionUnit: selectedOption?.unit || "",
        optionDisplayValue:
          selectedOption?.displayValue ||
          selectedOption?.name ||
          "",
        optionStock: selectedOption
          ? Number(selectedOption.stock || 0)
          : Number(currentItem.stock || 0),

        selectedOptionId: optionId,
        selectedOptionName: selectedOption?.name || "",
        selectedOptionValue: selectedOption?.value || "",
        selectedOptionUnit: selectedOption?.unit || "",
        selectedOptionDisplayValue:
          selectedOption?.displayValue ||
          selectedOption?.name ||
          "",
        selectedOptionSku: selectedOption?.sku || "",
        sku: selectedOption?.sku || "",
        productCode:
          selectedOption?.productCode ||
          selectedOption?.sku ||
          "",
        selectedOptionImageIndex:
          selectedOption?.imageIndex ?? null,
        selectedOptionImage:
          selectedOption?.imageUrl || getSelectedImageUrl(),
        optionImage:
          selectedOption?.imageUrl || getSelectedImageUrl(),
        selectedOptionStock: selectedOption
          ? Number(selectedOption.stock || 0)
          : null,
        addedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    animateToCart();

    setMessage(
      message,
      selectedOption
        ? `${getOptionDisplayLabel(selectedOption)} added to your cart.`
        : "Product added to your cart.",
      "success"
    );

    button.textContent = "Added ✓";

    setTimeout(() => {
      button.disabled = false;
      button.textContent = "Add to Cart";
    }, 1200);

    window.dispatchEvent(new CustomEvent("cart-updated", {
      detail: {
        productId: currentItem.id,
        optionId,
        quantity
      }
    }));
  } catch (error) {
    console.error("Add to cart failed:", error);

    setMessage(
      message,
      getFriendlyProductError(
        error,
        "The product could not be added to your cart."
      ),
      "error"
    );

    button.disabled = false;
    button.textContent = "Add to Cart";
  }
}

function sanitizeDocumentId(value) {
  return String(value || "")
    .replaceAll("/", "-")
    .replaceAll("\\", "-")
    .replace(/\s+/g, "-")
    .slice(0, 160);
}

function animateToCart() {
  const image = document.querySelector(".main-product-img");
  const cart = document.querySelector(".mm-cart-btn");

  if (!image || !cart || image.classList.contains("no-img")) return;

  const imageRect = image.getBoundingClientRect();
  const cartRect = cart.getBoundingClientRect();
  const clone = image.cloneNode(true);

  clone.className = "fly-to-cart-img";
  clone.style.cssText = `
    position: fixed;
    left: ${imageRect.left}px;
    top: ${imageRect.top}px;
    width: ${imageRect.width}px;
    height: ${imageRect.height}px;
    z-index: 99999;
    pointer-events: none;
    object-fit: cover;
    border-radius: 16px;
    transition: transform .75s cubic-bezier(.2,.8,.2,1), opacity .75s ease;
  `;

  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.transform = `translate(${cartRect.left - imageRect.left}px, ${cartRect.top - imageRect.top}px) scale(.12)`;
    clone.style.opacity = "0";
  });

  setTimeout(() => clone.remove(), 800);
}

/* =========================================================
   RELATED PRODUCTS
   ========================================================= */

async function loadRelatedItems() {
  if (!currentItem?.category || !relatedItems) return;

  try {
    const relatedQuery = query(
      collection(db, "products"),
      where("category", "==", currentItem.category),
      where("active", "==", true)
    );

    const snapshot = await getDocs(relatedQuery);
    const items = [];

    snapshot.forEach((docSnap) => {
      if (docSnap.id !== currentItem.id) {
        items.push({ id: docSnap.id, ...docSnap.data() });
      }
    });

    if (items.length === 0) {
      relatedItems.innerHTML = `
        <div class="empty-market-card">
          <h3>No related items found</h3>
          <p>Explore the full marketplace for more products.</p>
        </div>
      `;
      return;
    }

    items.sort((a, b) => {
      return Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0);
    });

    relatedItems.innerHTML = "";

    items.slice(0, 8).forEach((item) => {
      relatedItems.appendChild(createRelatedCard(item));
    });
  } catch (error) {
    console.warn("Related products could not load:", error.message);

    relatedItems.innerHTML = `
      <div class="empty-market-card">
        <p>Related products are temporarily unavailable.</p>
      </div>
    `;
  }
}

function createRelatedCard(item) {
  const images = normalizeProductImages(item);
  const options = normalizeProductOptions(item);
  const rating = Number(item.averageRating || 0);
  const totalReviews = Number(item.totalReviews || 0);
  const buyerPrice = options.length > 0
    ? Number(item.minBuyerPrice || getBuyerPrice(options[0]))
    : getBuyerPrice(item);

  const card = document.createElement("article");
  card.className = "pro-product-card";

  card.innerHTML = `
    <div class="pro-product-img">
      ${images[0]
        ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(item.title || "Product")}">`
        : `<div class="no-img">No Image</div>`}

      ${options.length > 0
        ? `<span class="product-options-count-badge">${options.length} options</span>`
        : ""}
    </div>

    <div class="pro-product-body">
      <span class="badge">${escapeHtml(item.type || "item")}</span>
      <h3>${escapeHtml(item.title || "Untitled")}</h3>
      <p class="muted">${escapeHtml(item.category || "")}</p>
      <p class="rating-line-small">
        ${rating > 0 ? `⭐ ${rating.toFixed(1)} (${totalReviews})` : "⭐ No reviews yet"}
      </p>
      <p class="pro-price">${options.length > 0 ? `From ${formatRs(buyerPrice)}` : formatRs(buyerPrice)}</p>
      <a class="btn" href="product-detail.html?id=${encodeURIComponent(item.id)}">View Details</a>
    </div>
  `;

  return card;
}

/* =========================================================
   HELPERS
   ========================================================= */

function getStock(item) {
  return Math.max(0, Number(item?.stock || 0));
}

function getBuyerPrice(item) {
  const buyerPrice = Number(item?.buyerPrice || 0);
  if (buyerPrice > 0) return roundMoney(buyerPrice);

  const price = Number(item?.price || 0);
  if (price > 0) return roundMoney(price);

  const sellerPrice = Number(item?.sellerPrice || 0);
  const rate = Number(item?.commissionRate ?? COMMISSION_RATE);

  return sellerPrice > 0
    ? roundMoney(sellerPrice * (1 + rate))
    : 0;
}

function getSellerPrice(item) {
  const sellerPrice = Number(item?.sellerPrice || 0);
  if (sellerPrice > 0) return roundMoney(sellerPrice);

  const buyerPrice = getBuyerPrice(item);
  const rate = Number(item?.commissionRate ?? COMMISSION_RATE);

  return buyerPrice > 0
    ? roundMoney(buyerPrice / (1 + rate))
    : 0;
}

function getCommissionAmount(item) {
  const saved = Number(item?.commissionAmount || 0);
  if (saved > 0) return roundMoney(saved);

  return roundMoney(
    Math.max(0, getBuyerPrice(item) - getSellerPrice(item))
  );
}

function getStockText(stockValue) {
  const stock = Number(stockValue || 0);

  if (stock <= 0) return "Out of stock";
  if (stock <= 5) return `Only ${stock} left in stock`;
  return `${stock} in stock`;
}

function getAverageRating(reviews, fieldName) {
  if (!Array.isArray(reviews) || reviews.length === 0) return 0;

  const ratings = reviews
    .map((review) => Number(review[fieldName] || review.rating || 0))
    .filter((rating) => rating > 0);

  if (ratings.length === 0) return 0;

  return Number(
    (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
  );
}

function renderStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return rating > 0 ? "⭐".repeat(rating) : "☆".repeat(5);
}

function scrollToReviews() {
  const target = productReviewsSection || document.querySelector(".product-reviews-section");

  target?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message || "";
  element.classList.remove(
    "success",
    "error",
    "info",
    "product-message-success",
    "product-message-error",
    "product-message-info"
  );

  if (!message || !type) return;

  element.classList.add(type);
  element.classList.add(`product-message-${type}`);
}

function getFriendlyProductError(error, fallbackMessage) {
  const code = String(error?.code || "");

  const messages = {
    "permission-denied": "You do not have permission to perform this action.",
    "unavailable": "MauMarket is temporarily unavailable. Please try again.",
    "failed-precondition": "The request could not be completed. Please refresh and try again.",
    "resource-exhausted": "The service is temporarily busy. Please try again.",
    "auth/network-request-failed": "Please check your internet connection and try again.",
    "network-request-failed": "Please check your internet connection and try again."
  };

  return messages[code] || fallbackMessage;
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
