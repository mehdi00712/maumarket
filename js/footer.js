/*
=========================================================
MauMarket Footer
Shared Footer for all pages
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {

    // Prevent duplicate footers
    if (document.querySelector(".mm-footer")) return;

    const footer = document.createElement("footer");
    footer.className = "mm-footer";

    footer.innerHTML = `

        <div class="mm-footer-top">

            <!-- =======================
                 BRAND
            ======================== -->

            <div class="mm-footer-brand">

                <img
                    src="images/maumarketlogo.png"
                    alt="MauMarket"
                    class="mm-footer-logo">

                <p>
                    Mauritius' trusted online marketplace connecting buyers and
                    sellers through secure payments, verified merchants and
                    MauMarket-managed delivery across Mauritius.
                </p>

                <div class="mm-footer-social">

                    <a
                        href="https://www.facebook.com/"
                        target="_blank"
                        aria-label="Facebook">

                        <i class="fab fa-facebook-f"></i>

                    </a>

                    <a
                        href="https://www.instagram.com/maumarket.mu?igsh=MXhmaGs2b2htb2Rkdw=="
                        target="_blank"
                        aria-label="Instagram">

                        <i class="fab fa-instagram"></i>

                    </a>

                    <a
                        href="https://www.tiktok.com/@maumarket01?lang=en"
                        target="_blank"
                        aria-label="TikTok">

                        <i class="fab fa-tiktok"></i>

                    </a>

                    <a
                        href="https://wa.me/23057750662"
                        target="_blank"
                        aria-label="WhatsApp">

                        <i class="fab fa-whatsapp"></i>

                    </a>

                    <a
                        href="mailto:maumarket33@gmail.com"
                        aria-label="Email">

                        <i class="fas fa-envelope"></i>

                    </a>

                </div>

            </div>

            <!-- =======================
                 MARKETPLACE
            ======================== -->

            <div class="mm-footer-links">

                <h4>Marketplace</h4>

                <a href="products.html">Browse Products</a>

                <a href="register.html">
                    Become a Seller
                </a>

                <a href="cart.html">
                    Shopping Cart
                </a>

                <a href="dashboard.html">
                    My Account
                </a>

            </div>

            <!-- =======================
                 SUPPORT
            ======================== -->

            <div class="mm-footer-links">

                <h4>Support</h4>

                <a href="contact.html">
                    Contact Us
                </a>

                <a href="help.html">
                    Help Centre
                </a>

            </div>

            <!-- =======================
                 LEGAL
            ======================== -->

            <div class="mm-footer-links">

                <h4>Legal</h4>

                <a href="terms.html">
                    Terms & Conditions
                </a>

                <a href="buyer-policy.html">
                    Buyer Policy
                </a>

                <a href="seller-policy.html">
                    Seller Policy
                </a>

            </div>

            <!-- =======================
                 CONTACT
            ======================== -->

            <div class="mm-footer-links">

                <h4>Contact</h4>

                <p>📍 Mauritius</p>

                <p>

                    <a href="mailto:maumarket33@gmail.com">

                        maumarket33@gmail.com

                    </a>

                </p>

                <p>

                    <a href="https://wa.me/23057750662">

                        +230 5775 0662

                    </a>

                </p>

                <div class="mm-payment-icons">

                    <span>📱 Juice</span>

                </div>

            </div>

        </div>

        <!-- =======================
             COPYRIGHT
        ======================== -->

        <div class="mm-footer-bottom">

            <div>

                © ${new Date().getFullYear()}
                <strong>MauMarket</strong>

                All Rights Reserved.

            </div>

            <div>

                Designed & Developed by
                <strong>Cube Twist Ltd</strong>

            </div>

        </div>

    `;

    document.body.appendChild(footer);

});
