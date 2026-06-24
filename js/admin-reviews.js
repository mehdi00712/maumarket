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

const reviewsList = document.getElementById("reviewsList");
const totalReviews = document.getElementById("totalReviews");
const averageSellerRating = document.getElementById("averageSellerRating");
const averageDeliveryRating = document.getElementById("averageDeliveryRating");
const reviewSearchInput = document.getElementById("reviewSearchInput");
const ratingFilter = document.getElementById("ratingFilter");
const reviewsResultCount = document.getElementById("reviewsResultCount");

let allReviews = [];

reviewSearchInput?.addEventListener("input", renderReviews);
ratingFilter?.addEventListener("change", renderReviews);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !adminSnap.exists() ||
    adminSnap.data().role !== "admin" ||
    adminSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadReviews();
});

async function loadReviews() {
  reviewsList.innerHTML = "Loading reviews...";

  const snapshot = await getDocs(collection(db, "reviews"));

  allReviews = [];

  snapshot.forEach((docSnap) => {
    allReviews.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  allReviews.sort((a, b) => {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  updateStats();
  renderReviews();
}

function updateStats() {
  let sellerTotal = 0;
  let deliveryTotal = 0;
  let deliveryCount = 0;

  allReviews.forEach((review) => {
    sellerTotal += Number(review.sellerRating || 0);

    if (Number(review.deliveryRating || 0) > 0) {
      deliveryTotal += Number(review.deliveryRating || 0);
      deliveryCount++;
    }
  });

  if (totalReviews) totalReviews.textContent = allReviews.length;

  if (averageSellerRating) {
    averageSellerRating.textContent = allReviews.length
      ? (sellerTotal / allReviews.length).toFixed(1)
      : "0.0";
  }

  if (averageDeliveryRating) {
    averageDeliveryRating.textContent = deliveryCount
      ? (deliveryTotal / deliveryCount).toFixed(1)
      : "0.0";
  }
}

function renderReviews() {
  const search = (reviewSearchInput?.value || "").toLowerCase().trim();
  const rating = ratingFilter?.value || "";

  const filtered = allReviews.filter((review) => {
    const searchable = `
      ${review.customerName || ""}
      ${review.customerEmail || ""}
      ${review.reviewText || ""}
      ${review.orderId || ""}
      ${(review.sellerIds || []).join(" ")}
      ${(review.productIds || []).join(" ")}
    `.toLowerCase();

    const matchesSearch = !search || searchable.includes(search);

    const sellerRating = Number(review.sellerRating || 0);
    const matchesRating = !rating || sellerRating === Number(rating);

    return matchesSearch && matchesRating;
  });

  if (reviewsResultCount) {
    reviewsResultCount.textContent = `${filtered.length} review(s)`;
  }

  if (filtered.length === 0) {
    reviewsList.innerHTML = `
      <div class="order-card">
        <h3>No reviews found</h3>
        <p>Try another search or filter.</p>
      </div>
    `;
    return;
  }

  reviewsList.innerHTML = "";

  filtered.forEach((review) => {
    reviewsList.appendChild(createReviewCard(review));
  });
}

function createReviewCard(review) {
  const div = document.createElement("div");
  div.className = "order-card";

  const sellerRating = Number(review.sellerRating || 0);
  const deliveryRating = Number(review.deliveryRating || 0);

  div.innerHTML = `
    <div class="section-row-title">
      <div>
        <h3>${stars(sellerRating)} ${sellerRating.toFixed(1)} Seller Rating</h3>
        <p class="muted">Order #${escapeHtml(String(review.orderId || "").slice(0, 8))}</p>
      </div>

      <span class="status-pill">Verified Review</span>
    </div>

    <div class="order-grid">
      <div>
        <p><strong>Customer:</strong> ${escapeHtml(review.customerName || "Customer")}</p>
        <p><strong>Email:</strong> ${escapeHtml(review.customerEmail || "Not provided")}</p>
        <p><strong>Delivery:</strong> ${
          deliveryRating > 0
            ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}`
            : "Not rated"
        }</p>
      </div>

      <div>
        <p><strong>Seller IDs:</strong> ${escapeHtml((review.sellerIds || []).join(", ") || "None")}</p>
        <p><strong>Product IDs:</strong> ${escapeHtml((review.productIds || []).join(", ") || "None")}</p>
      </div>
    </div>

    <p>${escapeHtml(review.reviewText || "No review text.")}</p>

    <div class="seller-actions">
      ${
        review.orderId
          ? `<a class="btn" href="admin-orders.html?id=${encodeURIComponent(review.orderId)}">View Order</a>`
          : ""
      }
      <button class="danger-btn delete-review-btn">Delete Review</button>
    </div>
  `;

  div.querySelector(".delete-review-btn")?.addEventListener("click", async () => {
    if (!confirm("Delete this review permanently?")) return;

    await deleteDoc(doc(db, "reviews", review.id));
    await loadReviews();
  });

  return div;
}

function stars(value) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(value || 0))));
  return "⭐".repeat(rating);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
