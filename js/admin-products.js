import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const adminProductsList = document.getElementById("adminProductsList");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  await loadProducts();
});

async function loadProducts() {
  adminProductsList.innerHTML = "Loading products...";

  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    adminProductsList.innerHTML = "<p>No products found.</p>";
    return;
  }

  adminProductsList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const item = docSnap.data();

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      ${item.imageUrl ? `<img class="admin-thumb" src="${item.imageUrl}" alt="${item.title}">` : ""}
      <h3>${item.title || "Untitled"}</h3>
      <p><strong>Type:</strong> ${item.type || ""}</p>
      <p><strong>Category:</strong> ${item.category || ""}</p>
      <p><strong>Price:</strong> Rs ${item.price || 0}</p>
      <p><strong>Seller ID:</strong> ${item.sellerId || ""}</p>
      <p><strong>Status:</strong> ${item.active ? "Visible" : "Hidden"}</p>

      <div class="seller-actions">
        <a class="btn" href="product-details.html?id=${docSnap.id}">View</a>
        <button class="toggle-btn">${item.active ? "Hide" : "Show"}</button>
        <button class="danger-btn">Delete</button>
      </div>
    `;

    div.querySelector(".toggle-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "products", docSnap.id), {
        active: !item.active,
        adminModerated: true,
        updatedAt: serverTimestamp()
      });

      await loadProducts();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      if (!confirm("Delete this product/service permanently?")) return;

      await deleteDoc(doc(db, "products", docSnap.id));
      await loadProducts();
    });

    adminProductsList.appendChild(div);
  });
}
