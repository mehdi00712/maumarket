import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const sellerProducts = document.getElementById("sellerProducts");
const sellerOrders = document.getElementById("sellerOrders");
const sellerRevenue = document.getElementById("sellerRevenue");
const sellerRatingAvg = document.getElementById("sellerRatingAvg");
const sellerReviews = document.getElementById("sellerReviews");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", currentUser.uid));

    if (
      !userSnap.exists() ||
      userSnap.data().role !== "seller" ||
      userSnap.data().approved !== true ||
      userSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    await loadSellerAnalytics();
  } catch (error) {
    renderError(error.message);
  }
});

async function loadSellerAnalytics() {
  try {
    const productsQ = query(
      collection(db, "products"),
      where("sellerId", "==", currentUser.uid)
    );

    const ordersQ = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const reviewsQ = query(
      collection(db, "reviews"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const productsSnap = await getDocs(productsQ);
    const ordersSnap = await getDocs(ordersQ);
    const reviewsSnap = await getDocs(reviewsQ);

    let verifiedOrdersCount = 0;
    let revenue = 0;

    ordersSnap.forEach((docSnap) => {
      const order = docSnap.data();

      if (order.paymentStatus !== "verified") return;

      verifiedOrdersCount++;

      (order.items || []).forEach((item) => {
        if (item.sellerId === currentUser.uid) {
          revenue += Number(item.price || 0) * Number(item.quantity || 1);
        }
      });
    });

    let totalRating = 0;
    const reviews = [];

    reviewsSnap.forEach((docSnap) => {
      const review = {
        id: docSnap.id,
        ...docSnap.data()
      };

      totalRating += Number(review.sellerRating || review.rating || 0);
      reviews.push(review);
    });

    reviews.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    sellerProducts.textContent = productsSnap.size;
    sellerOrders.textContent = verifiedOrdersCount;
    sellerRevenue.textContent = `Rs ${revenue}`;
    sellerRatingAvg.textContent = reviews.length
      ? (totalRating / reviews.length).toFixed(1)
      : "0.0";

    renderReviews(reviews);
  } catch (error) {
    renderError(error.message);
  }
}

function renderReviews(reviews) {
  if (!sellerReviews) return;

  if (reviews.length === 0) {
    sellerReviews.innerHTML = "<p>No reviews yet.</p>";
    return;
  }

  sellerReviews.innerHTML = "";

  reviews.forEach((review) => {
    const sellerRating = Number(review.sellerRating || review.rating || 0);
    const deliveryRating = Number(review.deliveryRating || 0);

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${stars(sellerRating)} ${sellerRating.toFixed(1)} Seller</h3>
      <p><strong>Customer:</strong> ${escapeHtml(review.customerName || "Customer")}</p>
      <p>${escapeHtml(review.reviewText || "")}</p>
      <p class="muted">
        Delivery: ${
          deliveryRating > 0
            ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}`
            : "Not rated"
        }
      </p>
    `;

    sellerReviews.appendChild(div);
  });
}

function renderError(message) {
  if (sellerReviews) {
    sellerReviews.innerHTML = `
      <div class="order-card">
        <h3>Could not load seller analytics</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
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
