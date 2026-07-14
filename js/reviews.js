import { db } from "./firebase-config.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const reviewsList=document.getElementById("reviewsList");
const reviewSort=document.getElementById("reviewSort");
const reviewsSearchInput=document.getElementById("reviewsSearchInput");

const averageRating=document.getElementById("averageRating");
const totalReviews=document.getElementById("totalReviews");
const verifiedReviews=document.getElementById("verifiedReviews");
const reviewCount=document.getElementById("reviewCount");

let allReviews=[];

async function loadReviews(){

 reviewsList.innerHTML=`
 <div class="reviews-loading-card">
   <div class="reviews-loading-spinner"></div>
   <p>Loading reviews...</p>
 </div>`;

 try{

   const snapshot=await getDocs(collection(db,"reviews"));

   allReviews=[];

   snapshot.forEach(docSnap=>{
      allReviews.push({
        id:docSnap.id,
        ...docSnap.data()
      });
   });

   renderStats();
   renderReviews();

 }catch(error){

   console.error(error);

   reviewsList.innerHTML=`
   <div class="order-card">
      <h3>Unable to load reviews</h3>
      <p>Please refresh the page and try again.</p>
   </div>`;
 }

}

function renderStats(){

 const total=allReviews.length;

 const verified=allReviews.filter(r=>r.verifiedPurchase===true).length;

 const ratingSum=allReviews.reduce(
   (sum,r)=>sum+Number(r.sellerRating||r.rating||0),
   0
 );

 const avg=total?ratingSum/total:0;

 averageRating.textContent=avg.toFixed(1);
 totalReviews.textContent=String(total);
 verifiedReviews.textContent=String(verified);
 reviewCount.textContent=`${total} verified review(s)`;

}

function renderReviews(){

 let reviews=[...allReviews];

 const search=(reviewsSearchInput?.value||"").toLowerCase().trim();

 if(search){
   reviews=reviews.filter(r=>
     `${r.reviewText||""} ${r.customerName||""} ${r.productTitle||""}`
      .toLowerCase()
      .includes(search)
   );
 }

 switch(reviewSort?.value){
   case "highest":
     reviews.sort((a,b)=>(b.sellerRating||b.rating||0)-(a.sellerRating||a.rating||0));
     break;
   case "lowest":
     reviews.sort((a,b)=>(a.sellerRating||a.rating||0)-(b.sellerRating||b.rating||0));
     break;
   default:
     reviews.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
 }

 reviewCount.textContent=`${reviews.length} review(s)`;

 if(!reviews.length){
   reviewsList.innerHTML=`
   <div class="order-card">
      <h3>No reviews found</h3>
      <p>Try another search.</p>
   </div>`;
   return;
 }

 reviewsList.innerHTML="";

 reviews.forEach(review=>{

   const productRating=Number(review.sellerRating||review.rating||0);
   const deliveryRating=Number(review.deliveryRating||0);

   const card=document.createElement("article");
   card.className="review-card premium-review-card";

   card.innerHTML=`
   <div class="review-card-header">

      <div>
        <h3>${escapeHtml(review.customerName||"Verified Buyer")}</h3>

        <div class="review-stars">
           ${stars(productRating)}
           <span>${productRating.toFixed(1)}</span>
        </div>
      </div>

      ${review.verifiedPurchase
        ?'<span class="status-badge active">Verified Purchase</span>'
        :''}

   </div>

   <p class="review-message">
      ${escapeHtml(review.reviewText||"No written review.")}
   </p>

   <div class="review-info-grid">

      <div>
        <strong>Product</strong>
        <span>${stars(productRating)} ${productRating.toFixed(1)}</span>
      </div>

      <div>
        <strong>Delivery</strong>
        <span>${deliveryRating>0?stars(deliveryRating)+" "+deliveryRating.toFixed(1):"Not rated"}</span>
      </div>

   </div>

   ${review.orderId?`
   <div class="review-footer">
      Order #${escapeHtml(String(review.orderId).slice(0,8))}
   </div>`:""}
   `;

   reviewsList.appendChild(card);

 });

}

function stars(value){
 const r=Math.max(1,Math.min(5,Math.round(Number(value||0))));
 return "⭐".repeat(r);
}

function escapeHtml(value){
 return String(value||"")
 .replaceAll("&","&amp;")
 .replaceAll("<","&lt;")
 .replaceAll(">","&gt;")
 .replaceAll('"',"&quot;")
 .replaceAll("'","&#039;");
}

reviewSort?.addEventListener("change",renderReviews);
reviewsSearchInput?.addEventListener("input",renderReviews);

loadReviews();
