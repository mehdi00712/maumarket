import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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
  Updated with Featured Shop statistics while
  preserving pending seller approval functionality.
*/

const sellerList = document.getElementById("sellerList");

const pendingSellerCount =
  document.getElementById("adminPendingSellerCount");

const featuredShopCount =
  document.getElementById("adminFeaturedShopCount");

const pendingFeaturedRequests =
  document.getElementById("adminPendingFeaturedRequests");

const marketplaceProducts =
  document.getElementById("adminMarketplaceProducts");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, "users", user.uid));

    if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    await Promise.all([
      loadPendingSellers(),
      loadDashboardStats()
    ]);
  } catch (error) {
    console.error(error);
    sellerList.innerHTML =
      "<p>Unable to load dashboard.</p>";
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

    if (pendingSellerCount)
      pendingSellerCount.textContent = sellerSnapshot.size;

    if (featuredShopCount)
      featuredShopCount.textContent = shopSnapshot.size;

    if (pendingFeaturedRequests)
      pendingFeaturedRequests.textContent =
        featuredSnapshot.size;

    if (marketplaceProducts)
      marketplaceProducts.textContent =
        productSnapshot.size;

  } catch (error) {
    console.warn("Statistics failed:", error);
  }
}

async function loadPendingSellers() {

  sellerList.innerHTML = "Loading sellers...";

  try {

    const q = query(
      collection(db, "users"),
      where("role", "==", "seller"),
      where("approved", "==", false)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {

      sellerList.innerHTML = `
        <p>No pending sellers.</p>
      `;

      return;
    }

    sellerList.innerHTML = "";

    snapshot.forEach((docSnap) => {

      const seller = docSnap.data();

      const div = document.createElement("div");

      div.className = "card";

      div.innerHTML = `
        <h3>${seller.name || "Seller"}</h3>

        <p><strong>Email:</strong> ${seller.email || "-"}</p>

        <p><strong>Phone:</strong> ${seller.phone || "-"}</p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">

          <button class="btn approve-btn">
            Approve Seller
          </button>

        </div>
      `;

      div.querySelector(".approve-btn")
        .addEventListener("click", async () => {

          if (!confirm(
            `Approve ${seller.name || "this seller"}?`
          )) return;

          try {

            await updateDoc(
              doc(db, "users", docSnap.id),
              {
                approved: true
              }
            );

            await Promise.all([
              loadPendingSellers(),
              loadDashboardStats()
            ]);

          } catch (error) {

            alert(
              error.message ||
              "Unable to approve seller."
            );

          }

        });

      sellerList.appendChild(div);

    });

  } catch (error) {

    console.error(error);

    sellerList.innerHTML = `
      <p>Unable to load pending sellers.</p>
    `;

  }

}
