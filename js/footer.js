/*
=========================================================
MauMarket Footer
Injects a shared footer on every page
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {

    // Prevent duplicate footers
    if (document.querySelector(".mm-footer")) return;

    const footer = document.createElement("footer");
    footer.className = "mm-footer";

    footer.innerHTML = `
        <div class="mm-footer-top">

            <div class="mm-footer-brand">

                <img
                    src="images/maumarketlogo.png"
                    alt="MauMarket Logo"
                    class="mm-footer-logo">

                <p>
                    Mauritius' trusted marketplace connecting buyers and sellers
                    through secure payments, verified merchants and
                    MauMarket-managed delivery.
                </p>

                <div class="mm-footer-social">

                    <a href="#" aria-label="Facebook">
                        <i class="fab fa-facebook-f"></i>
                    </a>

                    <a href="#" aria-label="Instagram">
                        <i class="fab fa-instagram"></i>
                    </a>

                    <a href="#" aria-label="TikTok">
                        <i class="fab fa-tiktok"></i>
                    </a>

                    <a href="#" aria-label="LinkedIn">
                        <i class="fab fa-linkedin-in"></i>
                    </a>

                </div>

            </div>

            <div class="mm-footer-links">

                <h4>Marketplace</h4>

                <a href="products.html">Browse Products</a>
                <a href="register.html">Become a Seller</a>
                <a href="cart.html">Shopping Cart</a>
                <a href="dashboard.html">My Account</a>

            </div>

            <div class="mm-footer-links">

                <h4>Support</h4>

                <a href="contact.html">Contact Us</a>
                <a href="faq.html">FAQ</a>
                <a href="help.html">Help Centre</a>
                <a href="delivery-policy.html">Delivery Policy</a>

            </div>

            <div class="mm-footer-links">

                <h4>Legal</h4>

                <a href="privacy.html">Privacy Policy</a>
                <a href="terms.html">Terms & Conditions</a>
                <a href="buyer-policy.html">Buyer Policy</a>
                <a href="seller-policy.html">Seller Policy</a>

            </div>

            <div class="mm-footer-links">

                <h4>Contact</h4>

                <p>📍 Mauritius</p>
                <p>📧 support@maumarket.mu</p>
                <p>📞 +230 5775 0662</p>

                <div class="mm-payment-icons">

                    <span>📱 Juice</span>

                </div>

            </div>

        </div>

        <div class="mm-footer-bottom">

            <div>

                © ${new Date().getFullYear()}
                <strong>MauMarket</strong>.
                All Rights Reserved.

            </div>


        </div>
    `;

    document.body.appendChild(footer);

});
