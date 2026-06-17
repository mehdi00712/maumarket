import { db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const shopHeader = document.getElementById("shopHeader");
const shopItems = document.getElementById("shopItems");

const params = new URLSearchParams(window.location.search);
const sellerId = params.get("id");

async function loadShop() {
  if (!sellerId) {
    shopHeader.innerHTML = "<p>Shop not found.</p>";
    return;
  }

  const shopSnap = await getDoc(doc(db, "shops", sellerId));

  if (!shopSnap.exists()) {
    shopHeader.innerHTML = "<p>Shop not found.</p>";
    return;
  }

  const shop = shopSnap.data();

  shopHeader.innerHTML = `
    ${shop.logoUrl ? `<img class="shop-logo" src="${shop.logoUrl}" alt="${shop.shopName}">` : ""}
    <div>
      <h1>${shop.shopName}</h1>
      <p>${shop.description || ""}</p>
      <p><strong>Location:</strong> ${shop.location || "Not specified"}</p>
      <p><strong>Phone:</strong> ${shop.phone || "Not specified"}</p>
    </div>
  `;

  await loadShopItems();
}

async function loadShopItems() {
  shopItems.innerHTML = "Loading items...";

  const q = query(
    collection(db, "products"),
    where("sellerId", "==", sellerId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    shopItems.innerHTML = "<p>This shop has no items yet.</p>";
    return;
  }

  shopItems.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const item = docSnap.data();

    const div = document.createElement("div");
    div.className = "card product-card";

    div.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : ""}
      <span class="badge">${item.type}</span>
      <h3>${item.title}</h3>
      <p>${item.category}</p>
      <p><strong>Rs ${item.price}</strong></p>
      <a class="btn" href="product-details.html?id=${docSnap.id}">View Details</a>
    `;

    shopItems.appendChild(div);
  });
}

loadShop();
