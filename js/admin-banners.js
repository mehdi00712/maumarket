import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const bannerTitle = document.getElementById("bannerTitle");
const bannerSubtitle = document.getElementById("bannerSubtitle");
const shopId = document.getElementById("shopId");
const bannerImage = document.getElementById("bannerImage");
const saveBannerBtn = document.getElementById("saveBannerBtn");
const bannerMessage = document.getElementById("bannerMessage");
const bannersList = document.getElementById("bannersList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "admin" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadBanners();
});

async function uploadBanner(file) {
  const safeName = file.name.replaceAll(" ", "-");
  const imageRef = ref(storage, `banners/${Date.now()}-${safeName}`);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

saveBannerBtn.addEventListener("click", async () => {
  if (!bannerTitle.value.trim() || !shopId.value.trim()) {
    bannerMessage.textContent = "Banner title and shop ID are required.";
    return;
  }

  if (!bannerImage.files[0]) {
    bannerMessage.textContent = "Please upload a banner image.";
    return;
  }

  saveBannerBtn.disabled = true;
  bannerMessage.textContent = "Saving banner...";

  try {
    const shopSnap = await getDoc(doc(db, "shops", shopId.value.trim()));

    if (!shopSnap.exists()) {
      bannerMessage.textContent = "Shop not found. Use the seller UID / shop document ID.";
      saveBannerBtn.disabled = false;
      return;
    }

    const imageUrl = await uploadBanner(bannerImage.files[0]);

    await addDoc(collection(db, "banners"), {
      title: bannerTitle.value.trim(),
      subtitle: bannerSubtitle.value.trim(),
      shopId: shopId.value.trim(),
      shopName: shopSnap.data().shopName || "",
      imageUrl,
      active: true,
      clicks: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    bannerTitle.value = "";
    bannerSubtitle.value = "";
    shopId.value = "";
    bannerImage.value = "";

    bannerMessage.textContent = "Banner created successfully.";
    await loadBanners();
  } catch (error) {
    bannerMessage.textContent = error.message;
  }

  saveBannerBtn.disabled = false;
});

async function loadBanners() {
  bannersList.innerHTML = "Loading banners...";

  const snapshot = await getDocs(collection(db, "banners"));

  if (snapshot.empty) {
    bannersList.innerHTML = "<p>No banners yet.</p>";
    return;
  }

  const banners = [];

  snapshot.forEach((docSnap) => {
    banners.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  banners.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  bannersList.innerHTML = "";

  banners.forEach((banner) => {
    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      ${banner.imageUrl ? `<img class="banner-preview" src="${banner.imageUrl}" alt="${banner.title}">` : ""}
      <h3>${banner.title}</h3>
      <p><strong>Shop:</strong> ${banner.shopName || banner.shopId}</p>
      <p><strong>Status:</strong> ${banner.active ? "Active" : "Hidden"}</p>
      <p><strong>Clicks:</strong> ${banner.clicks || 0}</p>

      <div class="seller-actions">
        <a class="btn" href="shop.html?id=${banner.shopId}" target="_blank">View Shop</a>
        <button class="toggle-btn">${banner.active ? "Hide" : "Show"}</button>
        <button class="danger-btn">Delete</button>
      </div>
    `;

    div.querySelector(".toggle-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "banners", banner.id), {
        active: !banner.active,
        updatedAt: serverTimestamp()
      });

      await loadBanners();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      if (!confirm("Delete this banner?")) return;

      await deleteDoc(doc(db, "banners", banner.id));
      await loadBanners();
    });

    bannersList.appendChild(div);
  });
}
