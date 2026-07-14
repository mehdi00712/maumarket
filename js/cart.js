import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const cartItems=document.getElementById("cartItems");
const cartTotal=document.getElementById("cartTotal");
const summaryItems=document.getElementById("summaryItems");
const productsTotal=document.getElementById("productsTotal");

let currentUser=null;

onAuthStateChanged(auth,async(user)=>{
 if(!user){location.href="login.html";return;}
 currentUser=user;
 localStorage.removeItem("cart");
 await loadCart();
});

async function loadCart(){
 cartItems.innerHTML="Loading cart...";
 const snapshot=await getDocs(collection(db,"carts",currentUser.uid,"items"));

 if(snapshot.empty){
   renderEmptyCart();
   updateCartBadge(0);
   return;
 }

 let total=0,itemCount=0;
 const merchantGroups={};

 snapshot.forEach(d=>{
   const item={id:d.id,...d.data()};
   const merchantId=item.sellerId||"unknown";

   if(!merchantGroups[merchantId]){
     merchantGroups[merchantId]={
       id:merchantId,
       label:"Verified MauMarket Merchant",
       items:[]
     };
   }
   merchantGroups[merchantId].items.push(item);
 });

 cartItems.innerHTML="";

 Object.values(merchantGroups).forEach(group=>{
   const section=document.createElement("section");
   section.className="cart-seller-section";

   let merchantTotal=0;
   let merchantCount=0;

   section.innerHTML=`
   <div class="cart-seller-head">
      <div>
         <h2>Verified MauMarket Merchant</h2>
         <p>Merchant identity is kept private</p>
      </div>
      <span>MauMarket Delivery</span>
   </div>
   <div class="cart-seller-items"></div>`;

   const holder=section.querySelector(".cart-seller-items");

   group.items.forEach(item=>{
      const qty=Number(item.quantity||1);
      const price=getBuyerPrice(item);
      const line=roundMoney(price*qty);

      merchantTotal+=line;
      merchantCount+=qty;
      total+=line;
      itemCount+=qty;

      const card=document.createElement("div");
      card.className="cart-item pro-cart-item";
      card.innerHTML=`
      <div class="cart-item-img">
      ${item.imageUrl?`<img src="${escapeHtml(item.imageUrl)}">`:`<div class="no-img">No Image</div>`}
      </div>

      <div class="cart-info">
        <span class="badge">${escapeHtml(item.type||"item")}</span>
        <h3>${escapeHtml(item.title||"Untitled")}</h3>
        <p class="muted">${escapeHtml(item.category||"")}</p>

        <div class="merchant-anonymous-badge">
          ✓ Verified MauMarket Merchant
        </div>

        <p><strong>Price:</strong> ${formatRs(price)}</p>

        <div class="cart-qty-row">
          <label>Qty</label>
          <input class="qty-update" type="number" min="1" value="${qty}">
        </div>

        <p class="cart-line-total">
          Subtotal: <strong>${formatRs(line)}</strong>
        </p>
      </div>

      <div class="cart-actions-side">
         <button class="danger-btn remove-btn">Remove</button>
      </div>`;

      card.querySelector(".qty-update").addEventListener("change",async e=>{
        const n=Number(e.target.value||1);
        if(n<1){e.target.value=qty;return;}
        await updateDoc(doc(db,"carts",currentUser.uid,"items",item.id),{quantity:n});
        loadCart();
      });

      card.querySelector(".remove-btn").addEventListener("click",async()=>{
        if(!confirm("Remove this item from your cart?")) return;
        await deleteDoc(doc(db,"carts",currentUser.uid,"items",item.id));
        loadCart();
      });

      holder.appendChild(card);
   });

   const footer=document.createElement("div");
   footer.className="cart-seller-footer";
   footer.innerHTML=`<span>${merchantCount} item(s)</span><strong>${formatRs(merchantTotal)}</strong>`;
   section.appendChild(footer);
   cartItems.appendChild(section);
 });

 renderSummary({itemCount,total});
 updateCartBadge(itemCount);
}

function renderSummary({itemCount,total}){
 summaryItems.textContent=String(itemCount);
 productsTotal.textContent=formatPlainNumber(total);
 cartTotal.textContent=formatPlainNumber(total);
}

function renderEmptyCart(){
 cartItems.innerHTML=`<div class="empty-cart-card">
 <h2>Your cart is empty</h2>
 <p>Browse MauMarket and discover products from verified merchants.</p>
 <a class="btn" href="products.html">Browse Products</a>
 </div>`;
 summaryItems.textContent="0";
 productsTotal.textContent="0";
 cartTotal.textContent="0";
}

function updateCartBadge(count){
 window.dispatchEvent(new CustomEvent("cart-updated",{detail:{count:Number(count||0)}}));
}
function getBuyerPrice(item){
 const b=Number(item.buyerPrice||0);
 if(b>0) return roundMoney(b);
 const p=Number(item.price||0);
 if(p>0) return roundMoney(p);
 const s=Number(item.sellerPrice||0);
 if(s>0) return roundMoney(s*1.1);
 return 0;
}
const roundMoney=v=>Math.round(Number(v||0)*100)/100;
const formatRs=v=>`Rs ${formatPlainNumber(v)}`;
function formatPlainNumber(v){return Number(v||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2});}
function escapeHtml(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
