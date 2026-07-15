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
let productPricingCache = {};

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

  await Promise.allSettled([
    prefillCustomerInformation(),
    loadCheckout()
  ]);
});

async function loadCheckout() {
  if (!checkoutItems || !currentUser) return;

  checkoutItems.innerHTML = `
    <div class="order-card">
      Loading your checkout...
    </div>
  `;

  updateTotals(0);

  if (placeOrderBtn) {
    placeOrderBtn.disabled = true;
  }

  try {
    const snapshot = await getDocs(
      collection(db, "carts", currentUser.uid, "items")
    );

    cartItems = [];

    if (snapshot.empty) {
      renderEmptyCheckout();
      return;
    }

    checkoutItems.innerHTML = "";

    let itemsTotal = 0;
    let invalidPriceCount = 0;

    for (const docSnap of snapshot.docs) {
      const rawItem = {
        cartItemId: docSnap.id,
        ...docSnap.data()
      };

      const hydratedItem =
        await hydrateCartItemPricing(rawItem);

      const pickupInfo =
        await getShopPickupInfo(
          hydratedItem.sellerId,
          hydratedItem.shopName
        );

      const quantity = Math.max(
        1,
        toFiniteNumber(hydratedItem.quantity, 1)
      );

      const buyerPrice =
        getBuyerPrice(hydratedItem);

      const sellerPrice =
        getSellerPrice(hydratedItem);

      const commissionAmount =
        getCommissionAmount(hydratedItem);

      const subtotal =
        roundMoney(buyerPrice * quantity);

      const sellerSubtotal =
        roundMoney(sellerPrice * quantity);

      const commissionSubtotal =
        roundMoney(commissionAmount * quantity);

      if (buyerPrice <= 0) {
        invalidPriceCount += 1;
      }

      const item = {
        ...hydratedItem,

        shopName:
          pickupInfo.shopName ||
          hydratedItem.shopName ||
          "MauMarket Seller",

        shopLocation:
          pickupInfo.shopLocation ||
          hydratedItem.shopLocation ||
          "",

        shopAddress:
          pickupInfo.shopAddress ||
          hydratedItem.shopAddress ||
          "",

        pickupAddress:
          pickupInfo.pickupAddress ||
          hydratedItem.pickupAddress ||
          "",

        pickupLatitude:
          pickupInfo.pickupLatitude ??
          hydratedItem.pickupLatitude ??
          null,

        pickupLongitude:
          pickupInfo.pickupLongitude ??
          hydratedItem.pickupLongitude ??
          null,

        pickupLocation:
          pickupInfo.pickupLocation ||
          hydratedItem.pickupLocation ||
          null,

        price: buyerPrice,
        buyerPrice,
        sellerPrice,
        commissionAmount,

        commissionRate:
          normalizeCommissionRate(
            hydratedItem.commissionRate
          ),

        hasOptions:
          hydratedItem.hasOptions === true ||
          Boolean(
            hydratedItem.selectedOptionId ||
            hydratedItem.selectedOptionName ||
            hydratedItem.optionId ||
            hydratedItem.optionName
          ),

        optionType:
          hydratedItem.optionType || "",

        selectedOptionId:
          hydratedItem.selectedOptionId ||
          hydratedItem.optionId ||
          "",

        selectedOptionName:
          hydratedItem.selectedOptionName ||
          hydratedItem.optionName ||
          "",

        selectedOptionSku:
          hydratedItem.selectedOptionSku ||
          hydratedItem.optionSku ||
          hydratedItem.sku ||
          hydratedItem.productCode ||
          "",

        selectedOptionImageIndex:
          hydratedItem.selectedOptionImageIndex ??
          hydratedItem.optionImageIndex ??
          null,

        selectedOptionImageUrl:
          hydratedItem.selectedOptionImageUrl ||
          hydratedItem.optionImageUrl ||
          hydratedItem.imageUrl ||
          "",

        selectedOptionStock:
          hydratedItem.selectedOptionStock ??
          hydratedItem.optionStock ??
          null,

        selectedOptionBuyerPrice:
          buyerPrice,

        selectedOptionSellerPrice:
          sellerPrice,

        selectedOptionCommissionAmount:
          commissionAmount,

        quantity,
        subtotal,
        sellerSubtotal,
        commissionSubtotal
      };

      cartItems.push(item);
      itemsTotal = roundMoney(itemsTotal + subtotal);

      checkoutItems.appendChild(
        createCheckoutItemElement(item)
      );
    }

    updateTotals(itemsTotal);

    if (invalidPriceCount > 0) {
      showCheckoutMessage(
        invalidPriceCount === cartItems.length
          ? "The prices for your cart could not be loaded. Return to the cart, remove the affected items and add them again."
          : `${invalidPriceCount} cart item(s) have an invalid price. Please review your cart before placing the order.`
      );

      if (placeOrderBtn) {
        placeOrderBtn.disabled = true;
      }

      return;
    }

    if (placeOrderBtn) {
      placeOrderBtn.disabled = false;
    }

    showCheckoutMessage("");
  } catch (error) {
    console.error("Checkout cart loading failed:", error);

    cartItems = [];
    updateTotals(0);

    if (placeOrderBtn) {
      placeOrderBtn.disabled = true;
    }

    checkoutItems.innerHTML = `
      <div class="order-card">
        <h3>Could not load your checkout</h3>

        <p>
          ${escapeHtml(
            getFriendlyCheckoutError(
              error,
              "Your cart could not be loaded. Please refresh the page and try again."
            )
          )}
        </p>

        <button
          id="retryCheckoutBtn"
          type="button"
          class="btn">
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById("retryCheckoutBtn")
      ?.addEventListener(
        "click",
        loadCheckout
      );
  }
}

function createCheckoutItemElement(item) {
  const div =
    document.createElement("div");

  div.className =
    "checkout-line checkout-pro-line";

  const optionDetails =
    getItemOptionDetails(item);

  const checkoutImageUrl =
    optionDetails.imageUrl ||
    item.imageUrl ||
    "";

  div.innerHTML = `
    <div class="checkout-line-main">

      ${
        checkoutImageUrl
          ? `
            <img
              src="${escapeHtml(checkoutImageUrl)}"
              alt="${escapeHtml(item.title || "Product")}">
          `
          : `
            <div class="checkout-no-img">
              No Image
            </div>
          `
      }

      <div>

        <strong>
          ${escapeHtml(item.title || "Untitled")}
        </strong>

        <p>
          Verified MauMarket Merchant
        </p>

        ${
          optionDetails.hasOption
            ? `
              <div class="checkout-selected-option">

                <span>
                  Selected
                  ${escapeHtml(optionDetails.optionType)}
                </span>

                <strong>
                  ${escapeHtml(optionDetails.optionName)}
                </strong>

                ${
                  optionDetails.optionSku
                    ? `
                      <small>
                        Product Code:
                        ${escapeHtml(optionDetails.optionSku)}
                      </small>
                    `
                    : ""
                }

              </div>
            `
            : ""
        }

        <small class="checkout-pickup-note">
          Fulfilled by Verified MauMarket Merchant
        </small>

      </div>

    </div>

    <div class="checkout-line-price">

      <span>
        ${formatRs(item.buyerPrice)}
        ×
        ${Number(item.quantity || 1)}
      </span>

      <strong>
        ${formatRs(item.subtotal)}
      </strong>

    </div>
  `;

  return div;
}

function renderEmptyCheckout() {
  checkoutItems.innerHTML = `
    <div class="order-card">
      <h3>Your cart is empty</h3>

      <p>
        Add items from the marketplace before checkout.
      </p>

      <a
        class="btn"
        href="products.html">
        Go to Marketplace
      </a>
    </div>
  `;

  cartItems = [];
  updateTotals(0);

  if (placeOrderBtn) {
    placeOrderBtn.disabled = true;
  }
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

placeOrderBtn?.addEventListener("click", async () => {
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

    if (
      itemsTotal <= 0 ||
      grandTotal <= deliveryFee
    ) {
      throw new Error(
        "checkout/invalid-total"
      );
    }

    const invalidItem =
      cartItems.find(
        (item) =>
          Number(item.buyerPrice || 0) <= 0 ||
          Number(item.subtotal || 0) <= 0
      );

    if (invalidItem) {
      throw new Error(
        `checkout/invalid-item-price:${invalidItem.title || "Item"}`
      );
    }

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
      imageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",
      shopName: item.shopName || "",
      shopLocation: item.shopLocation || "",
      shopAddress: item.shopAddress || "",
      pickupAddress: item.pickupAddress || item.shopAddress || item.shopLocation || "",
      pickupLatitude: item.pickupLatitude ?? null,
      pickupLongitude: item.pickupLongitude ?? null,
      pickupLocation: item.pickupLocation || null,
      quantity: Number(item.quantity || 1),

      hasOptions: item.hasOptions === true || Boolean(
        item.selectedOptionId ||
        item.selectedOptionName
      ),

      optionType: item.optionType || "",

      selectedOptionId:
        item.selectedOptionId || "",

      selectedOptionName:
        item.selectedOptionName || "",

      selectedOptionSku:
        item.selectedOptionSku || "",

      selectedOptionImageIndex:
        item.selectedOptionImageIndex ?? null,

      selectedOptionImageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",

      selectedOptionStock:
        item.selectedOptionStock ?? null,

      selectedOptionBuyerPrice:
        Number(
          item.selectedOptionBuyerPrice ||
          item.buyerPrice ||
          item.price ||
          0
        ),

      selectedOptionSellerPrice:
        Number(
          item.selectedOptionSellerPrice ||
          item.sellerPrice ||
          0
        ),

      selectedOptionCommissionAmount:
        Number(
          item.selectedOptionCommissionAmount ||
          item.commissionAmount ||
          0
        ),

      optionId:
        item.selectedOptionId || "",

      optionName:
        item.selectedOptionName || "",

      optionSku:
        item.selectedOptionSku || "",

      optionImageIndex:
        item.selectedOptionImageIndex ?? null,

      optionImageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",

      optionStock:
        item.selectedOptionStock ?? null,

      optionBuyerPrice:
        Number(
          item.selectedOptionBuyerPrice ||
          item.buyerPrice ||
          item.price ||
          0
        ),

      optionSellerPrice:
        Number(
          item.selectedOptionSellerPrice ||
          item.sellerPrice ||
          0
        ),

      optionCommissionAmount:
        Number(
          item.selectedOptionCommissionAmount ||
          item.commissionAmount ||
          0
        ),

      price: Number(item.buyerPrice || 0),
      buyerPrice: Number(item.buyerPrice || 0),
      sellerPrice: Number(item.sellerPrice || 0),
      commissionAmount: Number(item.commissionAmount || 0),
      commissionRate: Number(item.commissionRate ?? COMMISSION_RATE),

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

      hasProductOptions:
        orderItems.some((item) => item.hasOptions === true),

      optionItemCount:
        orderItems.filter((item) => item.hasOptions === true).length,

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
    console.error("Checkout order creation failed:", error);

    showCheckoutMessage(
      getFriendlyCheckoutError(
        error,
        "Something went wrong while placing your order. Please try again."
      )
    );

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
      imageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",

      quantity: Number(item.quantity || 1),

      hasOptions: item.hasOptions === true || Boolean(
        item.selectedOptionId ||
        item.selectedOptionName
      ),

      optionType: item.optionType || "",
      selectedOptionId: item.selectedOptionId || "",
      selectedOptionName: item.selectedOptionName || "",
      selectedOptionSku: item.selectedOptionSku || "",
      selectedOptionImageIndex:
        item.selectedOptionImageIndex ?? null,
      selectedOptionImageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",
      selectedOptionStock:
        item.selectedOptionStock ?? null,

      price: Number(item.buyerPrice || item.price || 0),
      buyerPrice: Number(item.buyerPrice || item.price || 0),
      sellerPrice: Number(item.sellerPrice || 0),
      commissionAmount: Number(item.commissionAmount || 0),
      subtotal: Number(item.subtotal || 0),
      sellerSubtotal: Number(item.sellerSubtotal || 0),
      commissionSubtotal: Number(item.commissionSubtotal || 0)
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
      imageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",

      quantity: Number(item.quantity || 1),

      hasOptions: item.hasOptions === true || Boolean(
        item.selectedOptionId ||
        item.selectedOptionName
      ),

      optionType: item.optionType || "",
      selectedOptionId: item.selectedOptionId || "",
      selectedOptionName: item.selectedOptionName || "",
      selectedOptionSku: item.selectedOptionSku || "",
      selectedOptionImageIndex:
        item.selectedOptionImageIndex ?? null,
      selectedOptionImageUrl:
        item.selectedOptionImageUrl ||
        item.imageUrl ||
        "",
      selectedOptionStock:
        item.selectedOptionStock ?? null,

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

async function prefillCustomerInformation() {
  if (!currentUser) return;

  if (
    customerPhone &&
    !customerPhone.value &&
    currentUser.phoneNumber
  ) {
    customerPhone.value =
      currentUser.phoneNumber;
  }

  if (
    customerName &&
    !customerName.value &&
    currentUser.displayName
  ) {
    customerName.value =
      currentUser.displayName;
  }

  try {
    const userSnap = await getDoc(
      doc(db, "users", currentUser.uid)
    );

    if (!userSnap.exists()) return;

    const userData = userSnap.data();

    if (customerName && !customerName.value) {
      customerName.value =
        userData.name ||
        userData.fullName ||
        userData.customerName ||
        "";
    }

    if (customerPhone && !customerPhone.value) {
      customerPhone.value =
        userData.phone ||
        userData.phoneNumber ||
        userData.mobile ||
        "";
    }
  } catch (error) {
    console.warn(
      "Customer information could not be prefilled:",
      error
    );
  }
}

async function hydrateCartItemPricing(rawItem) {
  const localBuyerPrice =
    getBuyerPrice(rawItem);

  if (localBuyerPrice > 0) {
    return rawItem;
  }

  const productId =
    rawItem.productId ||
    rawItem.id ||
    "";

  if (!productId) {
    return rawItem;
  }

  let product = productPricingCache[productId];

  if (!product) {
    try {
      const productSnap = await getDoc(
        doc(db, "products", productId)
      );

      if (!productSnap.exists()) {
        return rawItem;
      }

      product = {
        id: productSnap.id,
        ...productSnap.data()
      };

      productPricingCache[productId] = product;
    } catch (error) {
      console.warn(
        `Could not load pricing for product ${productId}:`,
        error
      );

      return rawItem;
    }
  }

  const option =
    findSelectedProductOption(
      product,
      rawItem
    );

  const productSellerPrice =
    firstPositiveNumber([
      product.sellerPrice,
      product.baseSellerPrice
    ]);

  const productBuyerPrice =
    firstPositiveNumber([
      product.buyerPrice,
      product.price,
      product.baseBuyerPrice,
      product.basePrice
    ]);

  const optionSellerPrice =
    firstPositiveNumber([
      option?.sellerPrice,
      option?.optionSellerPrice,
      option?.variantSellerPrice
    ]);

  const optionBuyerPrice =
    firstPositiveNumber([
      option?.buyerPrice,
      option?.price,
      option?.optionPrice,
      option?.variantPrice
    ]);

  const commissionRate =
    normalizeCommissionRate(
      rawItem.commissionRate ??
      option?.commissionRate ??
      product.commissionRate
    );

  const resolvedSellerPrice =
    optionSellerPrice ||
    productSellerPrice ||
    (
      optionBuyerPrice > 0
        ? roundMoney(
            optionBuyerPrice /
            (1 + commissionRate)
          )
        : productBuyerPrice > 0
          ? roundMoney(
              productBuyerPrice /
              (1 + commissionRate)
            )
          : 0
    );

  const resolvedBuyerPrice =
    optionBuyerPrice ||
    productBuyerPrice ||
    (
      resolvedSellerPrice > 0
        ? roundMoney(
            resolvedSellerPrice *
            (1 + commissionRate)
          )
        : 0
    );

  const resolvedCommission =
    roundMoney(
      Math.max(
        0,
        resolvedBuyerPrice -
        resolvedSellerPrice
      )
    );

  return {
    ...product,
    ...rawItem,

    sellerId:
      rawItem.sellerId ||
      product.sellerId ||
      product.ownerId ||
      "",

    title:
      rawItem.title ||
      product.title ||
      product.name ||
      "",

    type:
      rawItem.type ||
      product.type ||
      "product",

    category:
      rawItem.category ||
      product.category ||
      "",

    imageUrl:
      rawItem.imageUrl ||
      option?.imageUrl ||
      getFirstImageUrl(option) ||
      product.imageUrl ||
      getFirstImageUrl(product) ||
      "",

    commissionRate,

    price: resolvedBuyerPrice,
    buyerPrice: resolvedBuyerPrice,
    sellerPrice: resolvedSellerPrice,
    commissionAmount:
      resolvedCommission,

    selectedOptionBuyerPrice:
      resolvedBuyerPrice,

    selectedOptionSellerPrice:
      resolvedSellerPrice,

    selectedOptionCommissionAmount:
      resolvedCommission,

    selectedOptionId:
      rawItem.selectedOptionId ||
      rawItem.optionId ||
      option?.id ||
      option?.optionId ||
      "",

    selectedOptionName:
      rawItem.selectedOptionName ||
      rawItem.optionName ||
      option?.name ||
      option?.label ||
      option?.value ||
      "",

    selectedOptionSku:
      rawItem.selectedOptionSku ||
      rawItem.optionSku ||
      option?.sku ||
      option?.productCode ||
      "",

    selectedOptionStock:
      rawItem.selectedOptionStock ??
      rawItem.optionStock ??
      option?.stock ??
      null,

    selectedOptionImageUrl:
      rawItem.selectedOptionImageUrl ||
      rawItem.optionImageUrl ||
      option?.imageUrl ||
      getFirstImageUrl(option) ||
      rawItem.imageUrl ||
      product.imageUrl ||
      getFirstImageUrl(product) ||
      ""
  };
}

function findSelectedProductOption(
  product,
  cartItem
) {
  const options = getProductOptions(product);

  if (options.length === 0) {
    return null;
  }

  const selectedId =
    String(
      cartItem.selectedOptionId ||
      cartItem.optionId ||
      ""
    ).trim();

  const selectedName =
    normalizeText(
      cartItem.selectedOptionName ||
      cartItem.optionName ||
      ""
    );

  const selectedSku =
    normalizeText(
      cartItem.selectedOptionSku ||
      cartItem.optionSku ||
      cartItem.sku ||
      ""
    );

  return (
    options.find((option) => {
      const optionId =
        String(
          option.id ||
          option.optionId ||
          option.variantId ||
          ""
        ).trim();

      return (
        selectedId &&
        optionId === selectedId
      );
    }) ||

    options.find((option) => {
      const optionSku =
        normalizeText(
          option.sku ||
          option.productCode ||
          option.code ||
          ""
        );

      return (
        selectedSku &&
        optionSku === selectedSku
      );
    }) ||

    options.find((option) => {
      const optionName =
        normalizeText(
          option.name ||
          option.label ||
          option.value ||
          option.title ||
          ""
        );

      return (
        selectedName &&
        optionName === selectedName
      );
    }) ||

    null
  );
}

function getProductOptions(product) {
  const possibleOptions = [
    product?.options,
    product?.variants,
    product?.productOptions,
    product?.itemOptions
  ];

  for (const value of possibleOptions) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
  }

  return [];
}

function getFirstImageUrl(value) {
  const imageCollections = [
    value?.imageUrls,
    value?.images,
    value?.optionImages,
    value?.gallery
  ];

  for (const collectionValue of imageCollections) {
    if (!Array.isArray(collectionValue)) {
      continue;
    }

    for (const image of collectionValue) {
      if (typeof image === "string" && image) {
        return image;
      }

      if (
        image &&
        typeof image === "object"
      ) {
        const url =
          image.url ||
          image.imageUrl ||
          image.downloadURL ||
          "";

        if (url) return url;
      }
    }
  }

  return "";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toFiniteNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getItemOptionDetails(item) {
  const optionName =
    item.selectedOptionName ||
    item.optionName ||
    "";

  const optionSku =
    item.selectedOptionSku ||
    item.optionSku ||
    item.sku ||
    item.productCode ||
    "";

  const optionType =
    item.optionType ||
    "Option";

  const hasOption =
    item.hasOptions === true ||
    Boolean(
      item.selectedOptionId ||
      item.optionId ||
      optionName
    );

  return {
    hasOption,
    optionType,
    optionName,
    optionSku,

    imageUrl:
      item.selectedOptionImageUrl ||
      item.optionImageUrl ||
      item.imageUrl ||
      "",

    stock:
      item.selectedOptionStock ??
      item.optionStock ??
      null
  };
}

function getBuyerPrice(item) {
  const selectedOptionBuyerPrice = firstPositiveNumber([
    item?.selectedOptionBuyerPrice,
    item?.optionBuyerPrice,
    item?.variantBuyerPrice,
    item?.selectedOptionPrice,
    item?.optionPrice,
    item?.variantPrice
  ]);

  if (selectedOptionBuyerPrice > 0) {
    return roundMoney(selectedOptionBuyerPrice);
  }

  const buyerPrice = firstPositiveNumber([
    item?.buyerPrice,
    item?.price
  ]);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const sellerPrice = firstPositiveNumber([
    item?.selectedOptionSellerPrice,
    item?.optionSellerPrice,
    item?.variantSellerPrice,
    item?.sellerPrice
  ]);

  if (sellerPrice > 0) {
    const commissionRate = normalizeCommissionRate(
      item?.commissionRate
    );

    return roundMoney(
      sellerPrice * (1 + commissionRate)
    );
  }

  return 0;
}

function getSellerPrice(item) {
  const selectedOptionSellerPrice = firstPositiveNumber([
    item?.selectedOptionSellerPrice,
    item?.optionSellerPrice,
    item?.variantSellerPrice
  ]);

  if (selectedOptionSellerPrice > 0) {
    return roundMoney(selectedOptionSellerPrice);
  }

  const sellerPrice = firstPositiveNumber([
    item?.sellerPrice
  ]);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const buyerPrice = getBuyerPrice(item);

  if (buyerPrice > 0) {
    const commissionRate = normalizeCommissionRate(
      item?.commissionRate
    );

    return roundMoney(
      buyerPrice / (1 + commissionRate)
    );
  }

  return 0;
}

function getCommissionAmount(item) {
  const explicitCommission = firstPositiveNumber([
    item?.selectedOptionCommissionAmount,
    item?.optionCommissionAmount,
    item?.variantCommissionAmount,
    item?.commissionAmount
  ]);

  if (explicitCommission > 0) {
    return roundMoney(explicitCommission);
  }

  const sellerPrice = getSellerPrice(item);
  const buyerPrice = getBuyerPrice(item);

  return roundMoney(
    Math.max(0, buyerPrice - sellerPrice)
  );
}

function normalizeCommissionRate(value) {
  const rate = Number(value);

  if (!Number.isFinite(rate) || rate < 0) {
    return COMMISSION_RATE;
  }

  return rate;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  return 0;
}

function getFriendlyCheckoutError(
  error,
  fallbackMessage
) {
  const code =
    String(
      error?.code ||
      error?.message ||
      ""
    );

  const messages = {
    "permission-denied":
      "You do not have permission to place this order.",

    "storage/unauthorized":
      "The payment screenshot could not be uploaded.",

    "storage/canceled":
      "The payment screenshot upload was cancelled.",

    "storage/unknown":
      "The payment screenshot could not be uploaded. Please try again.",

    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",

    "failed-precondition":
      "The order could not be created. Please refresh and try again.",

    "resource-exhausted":
      "The service is temporarily busy. Please try again.",

    "auth/network-request-failed":
      "Please check your internet connection and try again.",

    "network-request-failed":
      "Please check your internet connection and try again.",

    "checkout/invalid-total":
      "Your order total could not be calculated. Return to the cart and add the affected items again."
  };

  if (
    code.startsWith(
      "checkout/invalid-item-price:"
    )
  ) {
    const itemName =
      code.split(":").slice(1).join(":");

    return `${itemName} has an invalid price. Return to the cart, remove it and add it again.`;
  }

  return (
    messages[code] ||
    fallbackMessage
  );
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
