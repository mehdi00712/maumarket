import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const productsGrid = document.getElementById("productsGrid");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const categoryFilter = document.getElementById("categoryFilter");
const sortFilter = document.getElementById("sortFilter");

let allItems = [];
let shopCache = {};

async function loadItems() {
  productsGrid.innerHTML = "Loading marketplace...";

  const q = query(
    collection(db, "products"),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  allItems = [];

  for (const docSnap of snapshot.docs) {
    const item = {
      id: docSnap.id,
      ...docSnap.data()
    };

    item.shop = await getShop(item.sellerId);
    allItems.push(item);
  }

  renderItems();
}

async function getShop(sellerId) {
  if (shopCache[sellerId]) return shopCache[sellerId];

  const shopSnap = await getDoc(doc(db, "shops", sellerId));

  if (shopSnap.exists()) {
    shopCache[sellerId] = shopSnap.data();
  } else {
    shopCache[sellerId] = {
      shopName: "Unknown Shop"
    };
  }

  return shopCache[sellerId];
}

function renderItems() {
  const search = searchInput.value.toLowerCase().trim();
  const type = typeFilter.value;
  const category = categoryFilter.value;
  const sort = sortFilter.value;

  let filtered = allItems.filter((item) => {
    const matchesSearch =
      item.title?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search) ||
      item.shop?.shopName?.toLowerCase().includes(search);

    const matchesType = !type || item.type === type;
    const matchesCategory = !category || item.category === category;

    return matchesSearch && matchesType && matchesCategory;
  });

  if (sort === "low-high") {
    filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  }

  if (sort === "high-low") {
    filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  if (sort === "newest") {
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
  }

  if (filtered.length === 0) {
    productsGrid.innerHTML = "<p>No items found.</p>";
    return;
  }

  productsGrid.innerHTML = "";

  filtered.forEach((item) => {
    const div = document.createElement("div");
    div.className = "card product-card";

    div.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : ""}
      <span class="badge">${item.type}</span>
      <h3>${item.title}</h3>
      <p>${item.category}</p>
      <p class="muted">${item.shop?.shopName || "Shop"}</p>
      <p><strong>Rs ${item.price}</strong></p>
      <a class="btn" href="product-details.html?id=${item.id}">View Details</a>
      <a class="small-link" href="shop.html?id=${item.sellerId}">View Shop</a>
    `;

    productsGrid.appendChild(div);
  });
}

searchInput.addEventListener("input", renderItems);
typeFilter.addEventListener("change", renderItems);
categoryFilter.addEventListener("change", renderItems);
sortFilter.addEventListener("change", renderItems);

loadItems();
