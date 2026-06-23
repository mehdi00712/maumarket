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
    const userSnap = await getDoc(doc(db, "users", user.uid));

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
    showError(error.message);
  }
});

async function loadSellerAnalytics() {
  let products = [];
  let orders = [];
  let reviews = [];

  try {
    const productsQ = query(
      collection(db, "products"),
      where("sellerId", "==", currentUser.uid)
    );

    const productsSnap = await getDocs(productsQ);

    productsSnap.forEach((docSnap) => {
      products.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
  } catch (error) {
    console.warn("Products analytics error:", error.message);
  }

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const ordersSnap = await getDocs(ordersQ);

    ordersSnap.forEach((docSnap) => {
      orders.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
  } catch (error) {
    console.warn("Orders analytics error:", error.message);
  }

  try {
    const reviewsSnap = await getDocs(collection(db, "reviews"));

    reviewsSnap.forEach((docSnap) => {
      const review = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if ((review.sellerIds || []).includes(currentUser.uid)) {
        reviews.push(review);
      }
    });
  } catch (error) {
    console.warn("Reviews analytics error:", error.message);
  }

  let verifiedOrders = 0;
  let revenue = 0;

  orders.forEach((order) => {
    if (order.paymentStatus === "verified") {
      verifiedOrders++;

      (order.items || []).forEach((item) => {
        if (item.sellerId === currentUser.uid) {
          revenue += Number(item.price || 0) * Number(item.quantity || 1);
        }
      });
    }
  });

  let ratingTotal = 0;

  reviews.forEach((review) => {
    ratingTotal += Number(review.sellerRating || review.rating || 0);
  });

  reviews.sort((a, b) => {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  sellerProducts.textContent = products.length;
  sellerOrders.textContent = verifiedOrders;
  sellerRevenue.textContent = `Rs ${revenue}`;
  sellerRatingAvg.textContent = reviews.length
    ? (ratingTotal / reviews.length).toFixed(1)
    : "0.0";

  renderReviews(reviews);
}

function renderReviews(reviews) {
  if (!sellerReviews) return;

  if (reviews.length === 0) {
    sellerReviews.innerHTML = `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p>Your customer reviews will appear here after delivered orders are reviewed.</p>
      </div>
    `;
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
        Delivery:
        ${
          deliveryRating > 0
            ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}`
            : "Not rated"
        }
      </p>
      <p class="muted">Verified Purchase</p>
    `;

    sellerReviews.appendChild(div);
  });
}

function showError(message) {
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
