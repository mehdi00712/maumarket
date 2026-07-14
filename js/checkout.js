import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const deliveryAddress = document.getElementById("deliveryAddress");
const deliveryLatitude = document.getElementById("deliveryLatitude");
const deliveryLongitude = document.getElementById("deliveryLongitude");
const selectedAddressText = document.getElementById("selectedAddressText");
const locationSearchInput = document.getElementById("locationSearchInput");
const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");
const orderNotes = document.getElementById("orderNotes");
const paymentProof = document.getElementById("paymentProof");

const checkoutItems = document.getElementById("checkoutItems");
const itemsTotalEl = document.getElementById("itemsTotal");
const deliveryFeeEl = document.getElementById("deliveryFee");
const grandTotalEl = document.getElementById("grandTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const checkoutMessage = document.getElementById("checkoutMessage");

const DELIVERY_FEE = 150;
const COMMISSION_RATE = 0.10;

let currentUser = null;
let cartItems = [];
let merchantPickupCache = {};

let checkoutMap = null;
let checkoutMarker = null;
let checkoutGeocoder = null;
let checkoutAutocomplete = null;

let selectedLocation = {
  address: "",
  lat: null,
  lng: null
};

window.initCheckoutMap = function () {
  const mapElement = document.getElementById("checkoutMap");

  if (!mapElement || !window.google || !google.maps) {
    return;
  }

  const mauritiusCenter = {
    lat: -20.2409,
    lng: 57.5201
  };

  checkoutMap = new google.maps.Map(mapElement, {
    center: mauritiusCenter,
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: true
  });

  checkoutGeocoder = new google.maps.Geocoder();

  checkoutMarker = new google.maps.Marker({
    position: mauritiusCenter,
    map: checkoutMap,
    draggable: true,
    visible: false,
    title: "Delivery location"
  });

  checkoutMap.addListener("click", (event) => {
    if (!event.latLng) return;

    setLocationFromLatLng(event.latLng.lat(), event.latLng.lng());
  });

  checkoutMarker.addListener("dragend", (event) => {
    if (!event.latLng) return;

    setLocationFromLatLng(event.latLng.lat(), event.latLng.lng());
  });

  if (locationSearchInput) {
    checkoutAutocomplete = new google.maps.places.Autocomplete(locationSearchInput, {
      fields: ["formatted_address", "geometry", "name"],
      componentRestrictions: {
        country: "mu"
      }
    });

    checkoutAutocomplete.addListener("place_changed", () => {
      const place = checkoutAutocomplete.getPlace();

      if (!place.geometry || !place.geometry.location) {
        showCheckoutMessage("Please select a valid location from the suggestions.");
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const address = place.formatted_address || place.name || "";

      setSelectedLocation(lat, lng, address);
    });
  }
};

useCurrentLocationBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showCheckoutMessage("Your browser does not support location detection.");
    return;
  }

  useCurrentLocationBtn.disabled = true;
  useCurrentLocationBtn.textContent = "Detecting...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      setLocationFromLatLng(lat, lng);

      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = "Use My Location";
    },
    () => {
      showCheckoutMessage("Could not get your current location. Please search or tap the map.");
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = "Use My Location";
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadCheckout();
});

async function loadCheckout() {
  checkoutItems.innerHTML = "Loading...";

  const snapshot = await getDocs(
    collection(db, "carts", currentUser.uid, "items")
  );

  cartItems = [];

  if (snapshot.empty) {
    checkoutItems.innerHTML = `
      <div class="order-card">
        <h3>Your cart is empty</h3>
        <p>Add items from the marketplace before checkout.</p>
        <a class="btn" href="products.html">Go to Marketplace</a>
      </div>
    `;

    placeOrderBtn.disabled = true;
    updateTotals(0);
    return;
  }

  let itemsTotal = 0;
  checkoutItems.innerHTML = "";

  for (const docSnap of snapshot.docs) {
    const rawItem = {
      cartItemId: docSnap.id,
      ...docSnap.data()
    };

    const pickupInfo = await getShopPickupInfo(rawItem.sellerId, rawItem.shopName);
    const buyerPrice = getBuyerPrice(rawItem);
    const sellerPrice = getSellerPrice(rawItem);
    const commissionAmount = getCommissionAmount(rawItem);
    const quantity = Number(rawItem.quantity || 1);

    const subtotal = roundMoney(buyerPrice * quantity);
    const sellerSubtotal = roundMoney(sellerPrice * quantity);
    const commissionSubtotal = roundMoney(commissionAmount * quantity);

    const item = {
      ...rawItem,

      shopName: pickupInfo.shopName || rawItem.shopName || "MauMarket Seller",
      shopLocation: pickupInfo.shopLocation || rawItem.shopLocation || "",
      shopAddress: pickupInfo.shopAddress || rawItem.shopAddress || "",
      pickupAddress: pickupInfo.pickupAddress || rawItem.pickupAddress || "",
      pickupLatitude: pickupInfo.pickupLatitude ?? rawItem.pickupLatitude ?? null,
      pickupLongitude: pickupInfo.pickupLongitude ?? rawItem.pickupLongitude ?? null,
      pickupLocation: pickupInfo.pickupLocation || rawItem.pickupLocation || null,

      price: buyerPrice,
      buyerPrice,
      sellerPrice,
      commissionAmount,
      commissionRate: COMMISSION_RATE,
      quantity,
      subtotal,
      sellerSubtotal,
      commissionSubtotal
    };

    itemsTotal += subtotal;
    cartItems.push(item);

    const div = document.createElement("div");
    div.className = "checkout-line checkout-pro-line";

    div.innerHTML = `
      <div class="checkout-line-main">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
            : `<div class="checkout-no-img">No Image</div>`
        }

        <div>
          <strong>${escapeHtml(item.title || "Untitled")}</strong>
          <p>Verified MauMarket Merchant</p>
          <small class="checkout-pickup-note">
            Fulfilled by Verified MauMarket Merchant
          </small>
        </div>
      </div>

      <div class="checkout-line-price">
        <span>${formatRs(buyerPrice)} x ${quantity}</span>
        <strong>${formatRs(subtotal)}</strong>
      </div>
    `;

    checkoutItems.appendChild(div);
  }

  updateTotals(itemsTotal);
}

function updateTotals(itemsTotal) {
  const grandTotal = roundMoney(Number(itemsTotal || 0) + DELIVERY_FEE);

  if (itemsTotalEl) {
    itemsTotalEl.textContent = formatPlainNumber(itemsTotal);
  }

  if (deliveryFeeEl) {
    deliveryFeeEl.textContent = formatPlainNumber(DELIVERY_FEE);
  }

  if (grandTotalEl) {
    grandTotalEl.textContent = formatPlainNumber(grandTotal);
  }
}

placeOrderBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  const name = customerName.value.trim();
  const phone = customerPhone.value.trim();
  const address = deliveryAddress.value.trim();
  const lat = Number(deliveryLatitude?.value || selectedLocation.lat || 0);
  const lng = Number(deliveryLongitude?.value || selectedLocation.lng || 0);

  if (!name || !phone) {
    showCheckoutMessage("Please fill in your name and phone number.");
    return;
  }

  if (!address || !lat || !lng) {
    showCheckoutMessage("Please pin your exact delivery location on the map.");
    return;
  }

  if (!paymentProof.files[0]) {
    showCheckoutMessage("Please upload your Juice payment screenshot before placing the order.");
    return;
  }

  if (cartItems.length === 0) {
    showCheckoutMessage("Your cart is empty.");
    return;
  }

  placeOrderBtn.disabled = true;
  showCheckoutMessage("Uploading proof and creating order...");

  try {
    const itemsTotal = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
    );

    const deliveryFee = DELIVERY_FEE;
    const grandTotal = roundMoney(itemsTotal + deliveryFee);

    const commissionAmount = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.commissionSubtotal || 0), 0)
    );

    const sellerAmount = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.sellerSubtotal || 0), 0)
    );

    const sellerIds = [
      ...new Set(
        cartItems
          .map((item) => item.sellerId)
          .filter(Boolean)
      )
    ];

    const sellerBreakdown = buildSellerBreakdown(cartItems);
    const pickupStops = buildPickupStops(cartItems);

    const file = paymentProof.files[0];
    const safeName = file.name.replaceAll(" ", "-");
    const fileRef = ref(
      storage,
      `payments/${currentUser.uid}/${Date.now()}-${safeName}`
    );

    await uploadBytes(fileRef, file);
    const proofUrl = await getDownloadURL(fileRef);

    const orderItems = cartItems.map((item) => ({
      productId: item.productId || item.cartItemId,
      sellerId: item.sellerId || "",
      title: item.title || "",
      type: item.type || "",
      category: item.category || "",
      imageUrl: item.imageUrl || "",
      shopName: item.shopName || "",
      shopLocation: item.shopLocation || "",
      shopAddress: item.shopAddress || "",
      pickupAddress: item.pickupAddress || item.shopAddress || item.shopLocation || "",
      pickupLatitude: item.pickupLatitude ?? null,
      pickupLongitude: item.pickupLongitude ?? null,
      pickupLocation: item.pickupLocation || null,
      quantity: Number(item.quantity || 1),

      price: Number(item.buyerPrice || item.price || 0),
      buyerPrice: Number(item.buyerPrice || item.price || 0),
      sellerPrice: Number(item.sellerPrice || 0),
      commissionAmount: Number(item.commissionAmount || 0),
      commissionRate: COMMISSION_RATE,

      subtotal: Number(item.subtotal || 0),
      sellerSubtotal: Number(item.sellerSubtotal || 0),
      commissionSubtotal: Number(item.commissionSubtotal || 0)
    }));

    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerEmail: currentUser.email,

      customerName: name,
      customerPhone: phone,

      deliveryAddress: address,
      deliveryLatitude: lat,
      deliveryLongitude: lng,
      deliveryLocation: {
        lat,
        lng
      },

      orderNotes: orderNotes.value.trim(),

      items: orderItems,
      sellerIds,
      sellerBreakdown,
      pickupStops,
      pickupCount: pickupStops.length,
      hasMultiplePickupLocations: pickupStops.length > 1,

      itemsTotal,
      deliveryFee,
      grandTotal,

      commissionRate: COMMISSION_RATE,
      commissionAmount,
      sellerAmount,

      paymentMethod: "Juice",
      paymentStatus: "submitted",
      paymentProofUrl: proofUrl,
      paymentSubmittedAt: serverTimestamp(),

      orderStatus: "Payment Submitted",
      deliveryStatus: "Pending",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    for (const item of cartItems) {
      await deleteDoc(doc(db, "carts", currentUser.uid, "items", item.cartItemId));
    }

    showCheckoutMessage("Order placed. Waiting for admin payment verification.");

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 1200);
  } catch (error) {
    showCheckoutMessage('Something went wrong while placing your order. Please try again.');
    placeOrderBtn.disabled = false;
  }
});

async function setLocationFromLatLng(lat, lng) {
  if (!checkoutGeocoder) {
    setSelectedLocation(lat, lng, `${lat}, ${lng}`);
    return;
  }

  checkoutGeocoder.geocode(
    {
      location: {
        lat,
        lng
      }
    },
    (results, status) => {
      if (status === "OK" && results && results[0]) {
        setSelectedLocation(lat, lng, results[0].formatted_address);
      } else {
        setSelectedLocation(lat, lng, `${lat}, ${lng}`);
      }
    }
  );
}

function setSelectedLocation(lat, lng, address) {
  selectedLocation = {
    lat,
    lng,
    address
  };

  if (deliveryAddress) {
    deliveryAddress.value = address;
  }

  if (deliveryLatitude) {
    deliveryLatitude.value = String(lat);
  }

  if (deliveryLongitude) {
    deliveryLongitude.value = String(lng);
  }

  if (selectedAddressText) {
    selectedAddressText.textContent = address;
  }

  if (checkoutMarker && checkoutMap) {
    const position = {
      lat,
      lng
    };

    checkoutMarker.setPosition(position);
    checkoutMarker.setVisible(true);
    checkoutMap.panTo(position);
    checkoutMap.setZoom(16);
  }
}

function buildSellerBreakdown(items) {
  const breakdown = {};

  items.forEach((item) => {
    const sellerId = item.sellerId || "unknown";

    if (!breakdown[sellerId]) {
      breakdown[sellerId] = {
        sellerId,
        shopName: item.shopName || "Unknown Shop",
        shopLocation: item.shopLocation || "",
        shopAddress: item.shopAddress || "",
        pickupAddress: item.pickupAddress || item.shopAddress || item.shopLocation || "",
        pickupLatitude: item.pickupLatitude ?? null,
        pickupLongitude: item.pickupLongitude ?? null,
        pickupLocation: item.pickupLocation || null,
        itemCount: 0,
        itemsTotal: 0,
        sellerAmount: 0,
        commissionAmount: 0,
        items: []
      };
    }

    breakdown[sellerId].itemCount += Number(item.quantity || 1);

    breakdown[sellerId].itemsTotal = roundMoney(
      breakdown[sellerId].itemsTotal + Number(item.subtotal || 0)
    );

    breakdown[sellerId].sellerAmount = roundMoney(
      breakdown[sellerId].sellerAmount + Number(item.sellerSubtotal || 0)
    );

    breakdown[sellerId].commissionAmount = roundMoney(
      breakdown[sellerId].commissionAmount + Number(item.commissionSubtotal || 0)
    );

    breakdown[sellerId].items.push({
      productId: item.productId || item.cartItemId || "",
      title: item.title || "",
      quantity: Number(item.quantity || 1),
      price: Number(item.buyerPrice || item.price || 0),
      subtotal: Number(item.subtotal || 0)
    });
  });

  return Object.values(breakdown);
}

function buildPickupStops(items) {
  const stops = {};

  items.forEach((item) => {
    const sellerId = item.sellerId || "unknown";

    if (!stops[sellerId]) {
      stops[sellerId] = {
        sellerId,
        shopName: item.shopName || "Unknown Shop",
        shopLocation: item.shopLocation || "",
        shopAddress: item.shopAddress || "",
        pickupAddress: item.pickupAddress || item.shopAddress || item.shopLocation || "",
        pickupLatitude: item.pickupLatitude ?? null,
        pickupLongitude: item.pickupLongitude ?? null,
        pickupLocation: item.pickupLocation || null,
        itemCount: 0,
        itemsTotal: 0,
        items: []
      };
    }

    stops[sellerId].itemCount += Number(item.quantity || 1);

    stops[sellerId].itemsTotal = roundMoney(
      stops[sellerId].itemsTotal + Number(item.subtotal || 0)
    );

    stops[sellerId].items.push({
      productId: item.productId || item.cartItemId || "",
      title: item.title || "",
      quantity: Number(item.quantity || 1),
      price: Number(item.buyerPrice || item.price || 0),
      subtotal: Number(item.subtotal || 0)
    });
  });

  return Object.values(stops);
}

async function getShopPickupInfo(sellerId, fallbackShopName = "") {
  if (!sellerId) {
    return {
      shopName: fallbackShopName || "MauMarket Seller",
      shopLocation: "",
      shopAddress: "",
      pickupAddress: "",
      pickupLatitude: null,
      pickupLongitude: null,
      pickupLocation: null
    };
  }

  if (shopPickupCache[sellerId]) {
    return shopPickupCache[sellerId];
  }

  const fallback = {
    shopName: fallbackShopName || "MauMarket Seller",
    shopLocation: "",
    shopAddress: "",
    pickupAddress: "",
    pickupLatitude: null,
    pickupLongitude: null,
    pickupLocation: null
  };

  try {
    const shopSnap = await getDoc(doc(db, "shops", sellerId));

    if (!shopSnap.exists()) {
      shopPickupCache[sellerId] = fallback;
      return fallback;
    }

    const shop = shopSnap.data();

    const pickupLat = Number(
      shop.pickupLatitude ??
      shop.latitude ??
      shop.locationLat ??
      shop.shopLatitude ??
      0
    );

    const pickupLng = Number(
      shop.pickupLongitude ??
      shop.longitude ??
      shop.locationLng ??
      shop.shopLongitude ??
      0
    );

    const pickupAddress =
      shop.pickupAddress ||
      shop.shopAddress ||
      shop.address ||
      shop.location ||
      "";

    const info = {
      shopName: shop.shopName || shop.name || fallbackShopName || "MauMarket Seller",
      shopLocation: shop.location || "",
      shopAddress: shop.shopAddress || shop.address || "",
      pickupAddress,
      pickupLatitude: pickupLat || null,
      pickupLongitude: pickupLng || null,
      pickupLocation: pickupLat && pickupLng
        ? {
            lat: pickupLat,
            lng: pickupLng
          }
        : null
    };

    shopPickupCache[sellerId] = info;
    return info;
  } catch (error) {
    console.warn("Could not load shop pickup location:", error.message);
    shopPickupCache[sellerId] = fallback;
    return fallback;
  }
}

function getBuyerPrice(item) {
  const buyerPrice = Number(item.buyerPrice || 0);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const price = Number(item.price || 0);

  if (price > 0) {
    return roundMoney(price);
  }

  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice * (1 + COMMISSION_RATE));
  }

  return 0;
}

function getSellerPrice(item) {
  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const buyerPrice = getBuyerPrice(item);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice / (1 + COMMISSION_RATE));
  }

  return 0;
}

function getCommissionAmount(item) {
  const commissionAmount = Number(item.commissionAmount || 0);

  if (commissionAmount > 0) {
    return roundMoney(commissionAmount);
  }

  const sellerPrice = getSellerPrice(item);
  const buyerPrice = getBuyerPrice(item);

  return roundMoney(Math.max(0, buyerPrice - sellerPrice));
}

function showCheckoutMessage(message) {
  if (checkoutMessage) {
    checkoutMessage.textContent = message || "";
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${formatPlainNumber(value)}`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
