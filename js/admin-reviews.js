import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket admin-reviews.js
  -----------------------------------------------------------
  - Administrator permission validation
  - Seller and delivery rating statistics
  - Search, rating filters and sorting
  - Secure review deletion
  - Order details displayed inside a modal
  - No dependency on a missing admin-orders.html page
  - Loading and error states
  - Safe HTML rendering
*/

const reviewsList = document.getElementById("reviewsList");

const totalReviews = document.getElementById("totalReviews");
const averageSellerRating = document.getElementById(
  "averageSellerRating"
);
const averageDeliveryRating = document.getElementById(
  "averageDeliveryRating"
);
const fiveStarReviews = document.getElementById(
  "fiveStarReviews"
);
const lowRatingReviews = document.getElementById(
  "lowRatingReviews"
);
const verifiedReviewsCount = document.getElementById(
  "verifiedReviewsCount"
);

const reviewSearchInput = document.getElementById(
  "reviewSearchInput"
);
const ratingFilter = document.getElementById("ratingFilter");
const reviewSortFilter = document.getElementById(
  "reviewSortFilter"
);
const clearReviewFiltersBtn = document.getElementById(
  "clearReviewFiltersBtn"
);

const reviewsResultCount = document.getElementById(
  "reviewsResultCount"
);

const reviewOrderModal = document.getElementById(
  "reviewOrderModal"
);
const reviewOrderModalOverlay = document.getElementById(
  "reviewOrderModalOverlay"
);
const closeReviewOrderModalBtn = document.getElementById(
  "closeReviewOrderModalBtn"
);
const reviewOrderModalTitle = document.getElementById(
  "reviewOrderModalTitle"
);
const reviewOrderModalContent = document.getElementById(
  "reviewOrderModalContent"
);

let allReviews = [];

let activeSearch = "";
let activeRating = "";
let activeSort = "newest";

attachFilterEvents();
attachModalEvents();

/* =========================================================
   AUTHENTICATION
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const adminSnap = await getDoc(
      doc(db, "users", user.uid)
    );

    if (
      !adminSnap.exists() ||
      adminSnap.data().role !== "admin" ||
      adminSnap.data().approved !== true ||
      adminSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    await loadReviews();
  } catch (error) {
    console.error("Admin review permission check failed:", error);

    showReviewsError(
      error.message ||
      "Your administrator account could not be verified."
    );
  }
});

/* =========================================================
   LOAD REVIEWS
   ========================================================= */

async function loadReviews() {
  showReviewsLoading();

  try {
    const snapshot = await getDocs(
      collection(db, "reviews")
    );

    allReviews = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    updateStats();
    renderReviews();
  } catch (error) {
    console.error("Reviews could not load:", error);

    showReviewsError(
      error.message ||
      "Customer reviews could not be loaded."
    );
  }
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStats() {
  let sellerTotal = 0;
  let sellerCount = 0;

  let deliveryTotal = 0;
  let deliveryCount = 0;

  let fiveStarCount = 0;
  let lowRatingCount = 0;
  let linkedOrderCount = 0;

  allReviews.forEach((review) => {
    const sellerRating = Number(review.sellerRating || 0);
    const deliveryRating = Number(
      review.deliveryRating || 0
    );

    if (sellerRating > 0) {
      sellerTotal += sellerRating;
      sellerCount += 1;
    }

    if (deliveryRating > 0) {
      deliveryTotal += deliveryRating;
      deliveryCount += 1;
    }

    if (sellerRating === 5) {
      fiveStarCount += 1;
    }

    if (sellerRating > 0 && sellerRating <= 2) {
      lowRatingCount += 1;
    }

    if (review.orderId) {
      linkedOrderCount += 1;
    }
  });

  if (totalReviews) {
    totalReviews.textContent = String(allReviews.length);
  }

  if (averageSellerRating) {
    averageSellerRating.textContent = sellerCount
      ? (sellerTotal / sellerCount).toFixed(1)
      : "0.0";
  }

  if (averageDeliveryRating) {
    averageDeliveryRating.textContent = deliveryCount
      ? (deliveryTotal / deliveryCount).toFixed(1)
      : "0.0";
  }

  if (fiveStarReviews) {
    fiveStarReviews.textContent = String(fiveStarCount);
  }

  if (lowRatingReviews) {
    lowRatingReviews.textContent = String(lowRatingCount);
  }

  if (verifiedReviewsCount) {
    verifiedReviewsCount.textContent = String(
      linkedOrderCount
    );
  }
}

/* =========================================================
   RENDER REVIEWS
   ========================================================= */

function renderReviews() {
  if (!reviewsList) return;

  const search = activeSearch.toLowerCase().trim();

  let filtered = allReviews.filter((review) => {
    const searchableText = `
      ${review.customerName || ""}
      ${review.customerEmail || ""}
      ${review.customerPhone || ""}
      ${review.reviewText || ""}
      ${review.comment || ""}
      ${review.orderId || ""}
      ${(review.sellerIds || []).join(" ")}
      ${(review.productIds || []).join(" ")}
    `.toLowerCase();

    const matchesSearch =
      !search ||
      searchableText.includes(search);

    const sellerRating = Number(
      review.sellerRating || 0
    );

    const matchesRating =
      !activeRating ||
      sellerRating === Number(activeRating);

    return matchesSearch && matchesRating;
  });

  filtered = sortReviews(filtered, activeSort);

  if (reviewsResultCount) {
    reviewsResultCount.textContent =
      `${filtered.length} review${filtered.length === 1 ? "" : "s"}`;
  }

  reviewsList.innerHTML = "";

  if (!filtered.length) {
    reviewsList.innerHTML = `
      <div class="empty-market-card">

        <h3>
          No reviews found
        </h3>

        <p>
          Try changing the search text or seller rating filter.
        </p>

        <button
          id="clearEmptyReviewFiltersBtn"
          type="button"
          class="secondary-btn"
        >
          Clear Filters
        </button>

      </div>
    `;

    document
      .getElementById("clearEmptyReviewFiltersBtn")
      ?.addEventListener("click", clearReviewFilters);

    return;
  }

  filtered.forEach((review) => {
    reviewsList.appendChild(
      createReviewCard(review)
    );
  });
}

function createReviewCard(review) {
  const card = document.createElement("article");

  card.className = "admin-review-card";

  const sellerRating = normalizeRating(
    review.sellerRating
  );

  const deliveryRating = normalizeRating(
    review.deliveryRating
  );

  const reviewText =
    review.reviewText ||
    review.comment ||
    "No written feedback was provided.";

  const orderReference = review.orderId
    ? String(review.orderId)
    : "";

  const createdDate = formatTimestamp(
    review.createdAt
  );

  card.innerHTML = `
    <div class="admin-review-card-head">

      <div class="admin-review-customer">

        <div class="admin-review-avatar">
          ${escapeHtml(
            getInitials(review.customerName || "Customer")
          )}
        </div>

        <div>

          <span class="admin-review-label">
            Customer Review
          </span>

          <h3>
            ${escapeHtml(
              review.customerName || "MauMarket Customer"
            )}
          </h3>

          <p>
            ${escapeHtml(
              review.customerEmail || "Email not provided"
            )}
          </p>

        </div>

      </div>

      <span class="status-pill">
        ${orderReference ? "Verified Review" : "Customer Review"}
      </span>

    </div>

    <div class="admin-review-rating-grid">

      <div class="admin-review-rating-box">

        <span>
          Seller Rating
        </span>

        <strong>
          ${renderStars(sellerRating)}
        </strong>

        <small>
          ${sellerRating > 0
            ? `${sellerRating.toFixed(1)} out of 5`
            : "Not rated"}
        </small>

      </div>

      <div class="admin-review-rating-box">

        <span>
          Delivery Rating
        </span>

        <strong>
          ${renderStars(deliveryRating)}
        </strong>

        <small>
          ${deliveryRating > 0
            ? `${deliveryRating.toFixed(1)} out of 5`
            : "Not rated"}
        </small>

      </div>

    </div>

    <blockquote class="admin-review-message">
      “${escapeHtml(reviewText)}”
    </blockquote>

    <div class="admin-review-details">

      <div>

        <span>
          Order Reference
        </span>

        <strong>
          ${
            orderReference
              ? escapeHtml(shortReference(orderReference))
              : "Not linked"
          }
        </strong>

      </div>

      <div>

        <span>
          Submitted
        </span>

        <strong>
          ${escapeHtml(createdDate)}
        </strong>

      </div>

      <div>

        <span>
          Sellers
        </span>

        <strong>
          ${Number((review.sellerIds || []).length)}
        </strong>

      </div>

      <div>

        <span>
          Products
        </span>

        <strong>
          ${Number((review.productIds || []).length)}
        </strong>

      </div>

    </div>

    <div class="seller-actions admin-review-actions">

      ${
        orderReference
          ? `
            <button
              class="secondary-btn view-review-order-btn"
              type="button"
            >
              View Order
            </button>
          `
          : ""
      }

      <button
        class="danger-btn delete-review-btn"
        type="button"
      >
        Delete Review
      </button>

    </div>
  `;

  card
    .querySelector(".view-review-order-btn")
    ?.addEventListener("click", async () => {
      await openOrderModal(orderReference);
    });

  card
    .querySelector(".delete-review-btn")
    ?.addEventListener("click", async (event) => {
      await deleteReview({
        review,
        button: event.currentTarget
      });
    });

  return card;
}

function sortReviews(reviews, sort) {
  const copy = [...reviews];

  if (sort === "newest") {
    copy.sort(
      (a, b) =>
        Number(b.createdAt?.seconds || 0) -
        Number(a.createdAt?.seconds || 0)
    );
  }

  if (sort === "oldest") {
    copy.sort(
      (a, b) =>
        Number(a.createdAt?.seconds || 0) -
        Number(b.createdAt?.seconds || 0)
    );
  }

  if (sort === "highest") {
    copy.sort(
      (a, b) =>
        Number(b.sellerRating || 0) -
        Number(a.sellerRating || 0)
    );
  }

  if (sort === "lowest") {
    copy.sort(
      (a, b) =>
        Number(a.sellerRating || 0) -
        Number(b.sellerRating || 0)
    );
  }

  return copy;
}

/* =========================================================
   ORDER MODAL
   ========================================================= */

async function openOrderModal(orderId) {
  if (!orderId || !reviewOrderModal) return;

  reviewOrderModal.classList.add("show");
  reviewOrderModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-open");

  if (reviewOrderModalTitle) {
    reviewOrderModalTitle.textContent =
      `Order ${shortReference(orderId)}`;
  }

  reviewOrderModalContent.innerHTML = `
    <div class="review-order-loading">
      Loading order details...
    </div>
  `;

  try {
    const orderSnap = await findOrderDocument(orderId);

    if (!orderSnap) {
      reviewOrderModalContent.innerHTML = `
        <div class="empty-market-card">

          <h3>
            Order not found
          </h3>

          <p>
            This review contains an order reference, but the matching
            Firestore order could not be found.
          </p>

        </div>
      `;

      return;
    }

    const order = {
      id: orderSnap.id,
      ...orderSnap.data()
    };

    renderOrderModalContent(order);
  } catch (error) {
    console.error("Order details could not load:", error);

    reviewOrderModalContent.innerHTML = `
      <div class="empty-market-card">

        <h3>
          Order could not load
        </h3>

        <p>
          ${escapeHtml(
            error.message ||
            "The order information could not be retrieved."
          )}
        </p>

      </div>
    `;
  }
}

async function findOrderDocument(orderId) {
  const directRef = doc(db, "orders", orderId);
  const directSnap = await getDoc(directRef);

  if (directSnap.exists()) {
    return directSnap;
  }

  const snapshot = await getDocs(
    collection(db, "orders")
  );

  return snapshot.docs.find((orderSnap) => {
    const order = orderSnap.data();

    return (
      order.orderId === orderId ||
      order.orderNumber === orderId ||
      order.reference === orderId
    );
  }) || null;
}

function renderOrderModalContent(order) {
  const items = Array.isArray(order.items)
    ? order.items
    : [];

  const orderNumber =
    order.orderNumber ||
    order.orderId ||
    order.id;

  const total =
    Number(order.grandTotal || 0) ||
    Number(order.total || 0) ||
    items.reduce((sum, item) => {
      return (
        sum +
        Number(item.price || item.buyerPrice || 0) *
        Number(item.quantity || 1)
      );
    }, 0);

  const itemsHtml = items.length
    ? items.map((item) => {
        const quantity = Number(item.quantity || 1);
        const price = Number(
          item.buyerPrice ||
          item.price ||
          0
        );

        return `
          <div class="review-order-item">

            <div>

              <strong>
                ${escapeHtml(item.title || "Order item")}
              </strong>

              <span>
                ${escapeHtml(
                  item.shopName || "MauMarket Seller"
                )}
              </span>

            </div>

            <div>
              ${quantity} × ${formatRs(price)}
            </div>

          </div>
        `;
      }).join("")
    : `
        <p class="muted">
          No individual items were stored on this order.
        </p>
      `;

  reviewOrderModalContent.innerHTML = `
    <div class="review-order-summary-grid">

      <div>
        <span>Order Number</span>
        <strong>${escapeHtml(orderNumber)}</strong>
      </div>

      <div>
        <span>Customer</span>
        <strong>
          ${escapeHtml(
            order.customerName ||
            order.name ||
            "Customer"
          )}
        </strong>
      </div>

      <div>
        <span>Payment Status</span>
        <strong>
          ${escapeHtml(
            order.paymentStatus || "Unknown"
          )}
        </strong>
      </div>

      <div>
        <span>Order Status</span>
        <strong>
          ${escapeHtml(
            order.status || "Pending"
          )}
        </strong>
      </div>

      <div>
        <span>Created</span>
        <strong>
          ${escapeHtml(formatTimestamp(order.createdAt))}
        </strong>
      </div>

      <div>
        <span>Total</span>
        <strong>${formatRs(total)}</strong>
      </div>

    </div>

    <div class="review-order-customer-box">

      <h3>
        Delivery Information
      </h3>

      <p>
        <strong>Phone:</strong>
        ${escapeHtml(
          order.customerPhone ||
          order.phone ||
          "Not provided"
        )}
      </p>

      <p>
        <strong>Address:</strong>
        ${escapeHtml(
          order.deliveryAddress ||
          order.address ||
          "Not provided"
        )}
      </p>

    </div>

    <div class="review-order-items-box">

      <h3>
        Order Items
      </h3>

      ${itemsHtml}

    </div>
  `;
}

function closeOrderModal() {
  if (!reviewOrderModal) return;

  reviewOrderModal.classList.remove("show");
  reviewOrderModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
}

function attachModalEvents() {
  closeReviewOrderModalBtn?.addEventListener(
    "click",
    closeOrderModal
  );

  reviewOrderModalOverlay?.addEventListener(
    "click",
    closeOrderModal
  );

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      reviewOrderModal?.classList.contains("show")
    ) {
      closeOrderModal();
    }
  });
}

/* =========================================================
   DELETE REVIEW
   ========================================================= */

async function deleteReview({ review, button }) {
  const confirmDelete = window.confirm(
    "Delete this review permanently? This action cannot be undone."
  );

  if (!confirmDelete) return;

  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = "Deleting...";

    await deleteDoc(
      doc(db, "reviews", review.id)
    );

    allReviews = allReviews.filter(
      (item) => item.id !== review.id
    );

    updateStats();
    renderReviews();
  } catch (error) {
    console.error("Review deletion failed:", error);

    window.alert(
      error.message ||
      "The review could not be deleted."
    );

    button.disabled = false;
    button.textContent = originalText;
  }
}

/* =========================================================
   FILTERS
   ========================================================= */

function attachFilterEvents() {
  reviewSearchInput?.addEventListener("input", () => {
    activeSearch = reviewSearchInput.value.trim();
    renderReviews();
  });

  ratingFilter?.addEventListener("change", () => {
    activeRating = ratingFilter.value;
    renderReviews();
  });

  reviewSortFilter?.addEventListener("change", () => {
    activeSort = reviewSortFilter.value || "newest";
    renderReviews();
  });

  clearReviewFiltersBtn?.addEventListener(
    "click",
    clearReviewFilters
  );
}

function clearReviewFilters() {
  activeSearch = "";
  activeRating = "";
  activeSort = "newest";

  if (reviewSearchInput) {
    reviewSearchInput.value = "";
  }

  if (ratingFilter) {
    ratingFilter.value = "";
  }

  if (reviewSortFilter) {
    reviewSortFilter.value = "newest";
  }

  renderReviews();
}

/* =========================================================
   UI STATES
   ========================================================= */

function showReviewsLoading() {
  if (!reviewsList) return;

  reviewsList.innerHTML = Array.from({ length: 4 })
    .map(() => `
      <div class="admin-review-card review-skeleton-card">

        <div class="skeleton-line short"></div>

        <div class="skeleton-line"></div>

        <div class="skeleton-line medium"></div>

      </div>
    `)
    .join("");

  if (reviewsResultCount) {
    reviewsResultCount.textContent = "Loading...";
  }
}

function showReviewsError(message) {
  if (reviewsList) {
    reviewsList.innerHTML = `
      <div class="empty-market-card">

        <h3>
          Reviews could not load
        </h3>

        <p>
          ${escapeHtml(message)}
        </p>

      </div>
    `;
  }

  if (reviewsResultCount) {
    reviewsResultCount.textContent = "Error";
  }
}

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeRating(value) {
  const rating = Number(value || 0);

  if (!Number.isFinite(rating)) return 0;

  return Math.max(0, Math.min(5, rating));
}

function renderStars(value) {
  const rating = normalizeRating(value);

  if (rating <= 0) {
    return `<span class="review-empty-stars">Not rated</span>`;
  }

  const fullStars = Math.round(rating);
  const emptyStars = Math.max(0, 5 - fullStars);

  return `
    <span class="review-full-stars">${"★".repeat(fullStars)}</span>
    <span class="review-empty-stars">${"★".repeat(emptyStars)}</span>
  `;
}

function shortReference(value) {
  const reference = String(value || "");

  if (reference.length <= 12) {
    return reference;
  }

  return `${reference.slice(0, 8)}…`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Date unavailable";
  }

  let date;

  if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function getInitials(value) {
  const words = String(value || "M")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    words
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "M"
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
