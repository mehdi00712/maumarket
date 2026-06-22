import { db } from "./firebase-config.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const reviewsList = document.getElementById("reviewsList");
const reviewSort = document.getElementById("reviewSort");

const averageRating = document.getElementById("averageRating");
const totalReviews = document.getElementById("totalReviews");
const verifiedReviews = document.getElementById("verifiedReviews");
const reviewCount = document.getElementById("reviewCount");

let allReviews = [];

async function loadReviews() {
  reviewsList.innerHTML = `
    <div class="order-card">
      Loading reviews...
    </div>
  `;

  try {
    const snapshot = await getDocs(collection(db, "reviews"));

    allReviews = [];

    snapshot.forEach((docSnap) => {
      allReviews.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    renderStats();
    renderReviews();
  } catch (error) {
    reviewsList.innerHTML = `
      <div class="order-card">
        <h3>Could not load reviews</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderStats() {
  const total = allReviews.length;

  const verified = allReviews.filter((review) => {
    return review.verifiedPurchase === true;
  }).length;

  const ratingSum = allReviews.reduce((sum, review) => {
    return sum + Number(review.sellerRating || review.rating || 0);
  }, 0);

  const avg = total > 0 ? ratingSum / total : 0;

  if (averageRating) averageRating.textContent = avg.toFixed(1);
  if (totalReviews) totalReviews.textContent = String(total);
  if (verifiedReviews) verifiedReviews.textContent = String(verified);
  if (reviewCount) reviewCount.textContent = `${total} review(s) found`;
}

function renderReviews() {
  let reviews = [...allReviews];

  const sort = reviewSort?.value || "newest";

  if (sort === "newest") {
    reviews.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
  }

  if (sort === "highest") {
    reviews.sort((a, b) => {
      return Number(b.sellerRating || b.rating || 0) -
        Number(a.sellerRating || a.rating || 0);
    });
  }

  if (sort === "lowest") {
    reviews.sort((a, b) => {
      return Number(a.sellerRating || a.rating || 0) -
        Number(b.sellerRating || b.rating || 0);
    });
  }

  if (reviews.length === 0) {
    reviewsList.innerHTML = `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p class="muted">Verified customer reviews will appear here.</p>
      </div>
    `;
    return;
  }

  reviewsList.innerHTML = "";

  reviews.forEach((review) => {
    const sellerRating = Number(review.sellerRating || review.rating || 0);
    const deliveryRating = Number(review.deliveryRating || 0);

    const card = document.createElement("div");
    card.className = "order-card review-card";

    card.innerHTML = `
      <h3>${stars(sellerRating)} ${sellerRating.toFixed(1)}</h3>

      <p>
        <strong>${escapeHtml(review.customerName || "Customer")}</strong>
        ${
          review.verifiedPurchase
            ? `<span class="status-badge active">Verified Purchase</span>`
            : ""
        }
      </p>

      <p>${escapeHtml(review.reviewText || "")}</p>

      <p class="muted">
        Seller Rating: ${stars(sellerRating)} ${sellerRating.toFixed(1)}
      </p>

      <p class="muted">
        Delivery Rating:
        ${
          deliveryRating > 0
            ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}`
            : "Not rated"
        }
      </p>

      ${
        review.orderId
          ? `<p class="muted">Order #${escapeHtml(String(review.orderId).slice(0, 8))}</p>`
          : ""
      }
    `;

    reviewsList.appendChild(card);
  });
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

reviewSort?.addEventListener("change", renderReviews);

loadReviews();
