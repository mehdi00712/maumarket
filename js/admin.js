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
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket Admin Dashboard
  -------------------------------------------------
  Features:
  - Verifies administrator access
  - Loads pending seller applications
  - Approves sellers
  - Automatically gives newly approved sellers 25 product slots
  - Preserves an existing valid productLimit
  - Preserves an existing valid productCount
  - Loads Featured Shop and marketplace statistics
*/

const DEFAULT_SELLER_PRODUCT_LIMIT = 25;

const sellerList = document.getElementById("sellerList");
const pendingSellerCount = document.getElementById("adminPendingSellerCount");
const featuredShopCount = document.getElementById("adminFeaturedShopCount");
const pendingFeaturedRequests = document.getElementById("adminPendingFeaturedRequests");
const marketplaceProducts = document.getElementById("adminMarketplaceProducts");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, "users", user.uid));
    const adminData = adminSnap.exists() ? adminSnap.data() : null;

    if (!adminData || adminData.role !== "admin" || adminData.blocked === true) {
      window.location.href = "dashboard.html";
      return;
    }

    await Promise.all([
      loadPendingSellers(),
      loadDashboardStats()
    ]);
  } catch (error) {
    console.error("Unable to initialize admin dashboard:", error);

    if (sellerList) {
      sellerList.innerHTML = "<p>Unable to load dashboard.</p>";
    }
  }
});

async function loadDashboardStats() {
  try {
    const [
      sellerSnapshot,
      shopSnapshot,
      featuredSnapshot,
      productSnapshot
    ] = await Promise.all([
      getDocs(
        query(
          collection(db, "users"),
          where("role", "==", "seller"),
          where("approved", "==", false)
        )
      ),
      getDocs(
        query(
          collection(db, "shops"),
          where("featuredShop", "==", true)
        )
      ),
      getDocs(
        query(
          collection(db, "featuredShopRequests"),
          where("status", "==", "pending")
        )
      ),
      getDocs(
        query(
          collection(db, "products"),
          where("active", "==", true)
        )
      )
    ]);

    if (pendingSellerCount) {
      pendingSellerCount.textContent = String(sellerSnapshot.size);
    }

    if (featuredShopCount) {
      featuredShopCount.textContent = String(shopSnapshot.size);
    }

    if (pendingFeaturedRequests) {
      pendingFeaturedRequests.textContent = String(featuredSnapshot.size);
    }

    if (marketplaceProducts) {
      marketplaceProducts.textContent = String(productSnapshot.size);
    }
  } catch (error) {
    console.warn("Unable to load dashboard statistics:", error);
  }
}

async function loadPendingSellers() {
  if (!sellerList) return;

  sellerList.innerHTML = "Loading sellers...";

  try {
    const pendingSellersQuery = query(
      collection(db, "users"),
      where("role", "==", "seller"),
      where("approved", "==", false)
    );

    const snapshot = await getDocs(pendingSellersQuery);

    if (snapshot.empty) {
      sellerList.innerHTML = "<p>No pending sellers.</p>";
      return;
    }

    sellerList.innerHTML = "";

    snapshot.forEach((sellerDocument) => {
      const seller = sellerDocument.data();
      const sellerCard = document.createElement("div");

      sellerCard.className = "card";
      sellerCard.innerHTML = `
        <h3>${escapeHtml(seller.name || "Seller")}</h3>
        <p><strong>Email:</strong> ${escapeHtml(seller.email || "-")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(seller.phone || "-")}</p>
        <p><strong>Product limit after approval:</strong> ${getSellerProductLimit(seller)}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">
          <button type="button" class="btn approve-btn">Approve Seller</button>
        </div>
      `;

      const approveButton = sellerCard.querySelector(".approve-btn");

      approveButton?.addEventListener("click", async () => {
        await approveSeller({
          sellerDocument,
          seller,
          approveButton
        });
      });

      sellerList.appendChild(sellerCard);
    });
  } catch (error) {
    console.error("Unable to load pending sellers:", error);
    sellerList.innerHTML = "<p>Unable to load pending sellers.</p>";
  }
}

async function approveSeller({ sellerDocument, seller, approveButton }) {
  const sellerName = seller.name || "this seller";
  const productLimit = getSellerProductLimit(seller);

  const confirmed = window.confirm(
    `Approve ${sellerName} with ${productLimit} product slots?`
  );

  if (!confirmed) return;

  try {
    if (approveButton) {
      approveButton.disabled = true;
      approveButton.textContent = "Approving...";
    }

    const productCount =
      Number.isInteger(seller.productCount) && seller.productCount >= 0
        ? seller.productCount
        : 0;

    await updateDoc(
      doc(db, "users", sellerDocument.id),
      {
        approved: true,
        productLimit,
        productCount
      }
    );

    await Promise.all([
      loadPendingSellers(),
      loadDashboardStats()
    ]);

    window.alert(
      `${sellerName} was approved successfully with ${productLimit} product slots.`
    );
  } catch (error) {
    console.error("Unable to approve seller:", error);

    window.alert(
      error.message || "Unable to approve seller."
    );

    if (approveButton) {
      approveButton.disabled = false;
      approveButton.textContent = "Approve Seller";
    }
  }
}

function getSellerProductLimit(seller = {}) {
  const existingLimit = Number(seller.productLimit);

  if (Number.isInteger(existingLimit) && existingLimit >= 0) {
    return existingLimit;
  }

  return DEFAULT_SELLER_PRODUCT_LIMIT;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
