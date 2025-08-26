const mongoose = require("mongoose");
const { Book, Transaction } = require("medici");
const axios = require("axios");

const webhookLogger = (title, message) => {
  axios({
    method: "POST",
    url: "https://webhook.site/ledger-responses",
    data: {
      title,
      message,
    },
  });
};

/**
 * Get Book for an org
 */
const getBook = (orgId) => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    webhookLogger("Database Connection Error", "Database Connection Error: " + error.message);
    throw new Error("❌ MongoDB connection not established. Please ensure database is connected first.");
  }

  return new Book("wallet-" + orgId, { db: mongoose.connection.db });
};

/**
 * Payback credits in wallet
 */
const paybackCreditsInWallet = async (
  userId,
  orgId,
  amount,
  currency = "INR"
) => {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  try {
    const book = getBook(orgId);
    webhookLogger("Book Found", "Book Found: " + JSON.stringify(book));
    await book
      .entry("Credits Payback")
      .debit("eazybe-revenue:payback", amount, {
        user_id: userId,
        org_id: orgId,
        currency,
        type: "CREDIT", // since you're not using enums, just plain string
      })
      .credit("wallet:payback", amount, {
        user_id: userId,
        org_id: orgId,
        currency,
        type: "CREDIT",
      })
      .commit();
    webhookLogger("Wallet Payback", "Wallet Payback: " + JSON.stringify(book));
    console.log("✅ Wallet payback successful");
    return true;
  } catch (error) {
    console.error(`❌ Error recharging wallet: ${error.message}`, error.stack);
    webhookLogger("Wallet Payback Error", "Wallet Payback Error: " + error.message);
    return false;
  }
};

module.exports = {
  paybackCreditsInWallet
};
