import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
});

async function loadSellerAnalytics() {
  const productsQ = query(
    collection(db, "products"),
    where("sellerId", "==", currentUser.uid)
  );

  const ordersQ = query(
    collection(db, "orders"),
    where("sellerIds", "array-contains", currentUser.uid),
    where("paymentStatus", "==", "verified")
  );

  const reviewsQ = query(
    collection(db, "reviews"),
    where("sellerIds", "array-contains", currentUser.uid)
  );

  const productsSnap = await getDocs(productsQ);
  const ordersSnap = await getDocs(ordersQ);
  const reviewsSnap = await getDocs(reviewsQ);

  let revenue = 0;

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();

    (order.items || []).forEach((item) => {
      if (item.sellerId === currentUser.uid) {
        revenue += Number(item.price || 0) * Number(item.quantity || 1);
      }
    });
  });

  let totalRating = 0;
  let reviews = [];

  reviewsSnap.forEach((docSnap) => {
    const review = {
      id: docSnap.id,
      ...docSnap.data()
    };

    totalRating += Number(review.sellerRating || 0);
    reviews.push(review);
  });

  reviews.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  sellerProducts.textContent = productsSnap.size;
  sellerOrders.textContent = ordersSnap.size;
  sellerRevenue.textContent = revenue;
  sellerRatingAvg.textContent = reviews.length
    ? (totalRating / reviews.length).toFixed(1)
    : "0";

  renderReviews(reviews);
}

function renderReviews(reviews) {
  if (reviews.length === 0) {
    sellerReviews.innerHTML = "<p>No reviews yet.</p>";
    return;
  }

  sellerReviews.innerHTML = "";

  reviews.forEach((review) => {
    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${review.sellerRating} ⭐ Seller / ${review.deliveryRating} ⭐ Delivery</h3>
      <p><strong>Customer:</strong> ${review.customerName || "Customer"}</p>
      <p>${review.reviewText || ""}</p>
    `;

    sellerReviews.appendChild(div);
  });
}
